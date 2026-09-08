import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// Baixa automática diária das vendas ZIG no estoque.
//
// Roda pelo pg_cron todo dia às 6h de Cuiabá (10h UTC) e processa o dia
// anterior. Reaproveita a função zig-buscar-vendas (que expande produtos
// compostos e aplica o mapeamento salvo), dá baixa só no que está mapeado e
// avisa os gestores pelo Telegram o que ficou sem mapeamento.
//
// Corpo opcional: { dtinicio, dtfim, dry_run }.
//   - sem corpo: ontem (fuso de Cuiabá).
//   - dry_run: só lista o que faria, sem gravar nada nem avisar.
// A ZIG limita 5 dias por chamada, então períodos maiores são fatiados.
//
// Regra importante: aqui só se insere a movimentação. Quem atualiza o saldo é
// o trigger do banco (trg_atualizar_saldos). Mexer em saldos_estoque à mão
// duplica a baixa.
// ─────────────────────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fmt = (d: Date) => d.toISOString().split('T')[0];
const brDate = (iso: string) => iso.split('-').reverse().join('/');

function fatiar(dtinicio: string, dtfim: string, tamanho = 5): Array<{ ini: string; fim: string }> {
  const blocos: Array<{ ini: string; fim: string }> = [];
  let cur = new Date(dtinicio + 'T00:00:00Z');
  const fim = new Date(dtfim + 'T00:00:00Z');
  while (cur <= fim) {
    const bFim = new Date(cur);
    bFim.setUTCDate(bFim.getUTCDate() + tamanho - 1);
    blocos.push({ ini: fmt(cur), fim: fmt(bFim > fim ? fim : bFim) });
    cur = new Date(bFim);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return blocos;
}

type ProdutoZig = {
  productId: string; productName: string; productCategory: string | null;
  count: number; eventDate: string;
  mapeado: boolean; ignorar_estoque: boolean; eh_produto_composto: boolean;
  expandido_de: string | null;
  mapeamento: { item_estoque_id: string | null; ficha_tecnica_id: string | null; estoque_id: string | null } | null;
};

async function baixarItem(
  supabase: any, itemId: string, estoqueId: string, quantidade: number,
  dataVenda: string, produto: string, productId: string,
): Promise<string> {
  const { data: item } = await supabase
    .from('itens_estoque').select('custo_medio, nome').eq('id', itemId).single();
  const custo = Number(item?.custo_medio || 0);

  const { data: mov, error } = await supabase
    .from('movimentacoes_estoque')
    .insert({
      item_id:           itemId,
      estoque_origem_id: estoqueId,
      tipo_movimentacao: 'saida',
      quantidade,
      custo_unitario:    custo,
      custo_total:       custo * quantidade,
      data_movimentacao: dataVenda,
      motivo:            'Venda ZIG',
      observacoes:       `Baixa automática ZIG | produto: ${produto}`,
      origem_tipo:       'zig',
      item_descricao:    item?.nome || produto,
      idempotency_key:   `zig_auto_${productId}_${dataVenda}_${itemId}`,
    })
    .select('id').single();
  if (error) throw new Error(error.message);
  return mov.id as string;
}

async function enviarTelegram(supabase: any, texto: string): Promise<string[]> {
  const { data: usuarios } = await supabase
    .from('telegram_usuarios_bot')
    .select('telegram_chat_id, nome, cargo, permissoes')
    .eq('ativo', true);

  const destinos = (usuarios || []).filter((u: any) =>
    u.cargo === 'gestor' || (Array.isArray(u.permissoes) && u.permissoes.includes('zig')));
  if (destinos.length === 0) return [];

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const enviados: string[] = [];
  for (const u of destinos) {
    try {
      if (token) {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: u.telegram_chat_id, text: texto, parse_mode: 'HTML' }),
        });
        if (r.ok) { enviados.push(u.nome); continue; }
      }
      // Sem token no ambiente: entrega pelo despachante do banco (roda a cada minuto).
      const { error } = await supabase.from('telegram_tarefas_programadas').insert({
        telegram_chat_id: u.telegram_chat_id, nome_destinatario: u.nome, mensagem: texto,
        tipo_recorrencia: 'unica', ativo: true, data_inicio: fmt(new Date()),
        horario: '06:00', proxima_execucao: new Date().toISOString(),
        observacoes: 'Aviso automático da baixa ZIG',
      });
      if (!error) enviados.push(u.nome);
    } catch (e) { console.warn('Telegram falhou para', u.nome, String(e)); }
  }
  return enviados;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const body = await req.json().catch(() => ({}));
  const hojeCuiaba = new Date(Date.now() - 4 * 3600 * 1000);
  const ontem = new Date(hojeCuiaba); ontem.setUTCDate(ontem.getUTCDate() - 1);
  const dtinicio: string = body.dtinicio || fmt(ontem);
  const dtfim: string    = body.dtfim || dtinicio;
  const dryRun: boolean  = body.dry_run === true;

  let logId: string | null = null;
  if (!dryRun) {
    const { data: log } = await supabase
      .from('zig_vendas_sync_logs')
      .insert({ dtinicio, dtfim, status: 'rodando' })
      .select('id').single();
    logId = log?.id ?? null;
  }

  const prontos: ProdutoZig[] = [];
  const pendentes: Array<{ nome: string; quantidade: number; data_venda: string; motivo: string; expandido_de: string | null }> = [];
  const ignorados: Array<{ nome: string; motivo: string }> = [];
  const erros: string[] = [];
  let totalProdutosZig = 0;

  try {
    // 1. Busca e classifica, bloco a bloco (limite da ZIG: 5 dias por chamada)
    for (const b of fatiar(dtinicio, dtfim)) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/zig-buscar-vendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ dtinicio: b.ini, dtfim: b.fim }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.ok) throw new Error(`zig-buscar-vendas ${b.ini}..${b.fim}: ${json.error || r.status}`);

      for (const p of (json.produtos || []) as ProdutoZig[]) {
        totalProdutosZig++;
        if (p.ignorar_estoque || p.eh_produto_composto) {
          ignorados.push({ nome: p.productName, motivo: p.eh_produto_composto ? 'Produto composto (baixa pelos subitens)' : 'Marcado como ignorar' });
          continue;
        }
        const m = p.mapeamento;
        if (m && m.estoque_id && (m.item_estoque_id || m.ficha_tecnica_id)) {
          prontos.push(p);
        } else {
          pendentes.push({
            nome: p.productName, quantidade: p.count, data_venda: (p.eventDate || b.fim).split('T')[0],
            motivo: p.mapeado ? 'Mapeamento sem estoque de origem' : 'Sem mapeamento',
            expandido_de: p.expandido_de || null,
          });
        }
      }
    }

    // 2. Dá baixa no que está pronto
    let totalMov = 0, totalDup = 0;
    const processados: any[] = [];

    for (const p of prontos) {
      const dataVenda = (p.eventDate || dtfim).split('T')[0];
      const m = p.mapeamento!;

      const { data: jaSync } = await supabase
        .from('zig_vendas_sync_ids').select('id')
        .eq('zig_product_id', p.productId).eq('data_venda', dataVenda).maybeSingle();
      if (jaSync) { totalDup++; continue; }

      if (dryRun) { processados.push({ nome: p.productName, quantidade: p.count, data_venda: dataVenda, simulado: true }); continue; }

      try {
        const movIds: string[] = [];
        if (m.ficha_tecnica_id) {
          const { data: ingredientes } = await supabase
            .from('ficha_ingredientes').select('item_estoque_id, quantidade')
            .eq('ficha_id', m.ficha_tecnica_id).eq('baixa_estoque', true);
          for (const ing of ingredientes || []) {
            if (!ing.item_estoque_id) continue;
            movIds.push(await baixarItem(supabase, ing.item_estoque_id, m.estoque_id!,
              Number(ing.quantidade) * Number(p.count), dataVenda, p.productName, p.productId));
          }
        } else if (m.item_estoque_id) {
          movIds.push(await baixarItem(supabase, m.item_estoque_id, m.estoque_id!,
            Number(p.count), dataVenda, p.productName, p.productId));
        }

        if (movIds.length > 0) {
          totalMov += movIds.length;
          await supabase.from('zig_vendas_sync_ids').insert({
            zig_product_id: p.productId, zig_product_name: p.productName,
            data_venda: dataVenda, movimentacao_id: movIds[0],
          });
          await supabase.rpc('fn_registrar_uso_mapeamento_zig', { p_nome_externo: p.productName })
            .then(() => {}, () => {});
          processados.push({ nome: p.productName, quantidade: p.count, data_venda: dataVenda, movimentacoes: movIds.length, expandido_de: p.expandido_de || null });
        }
      } catch (e: any) {
        erros.push(`${p.productName}: ${e.message}`);
      }
    }

    const status = erros.length === 0 ? 'sucesso' : (totalMov > 0 ? 'sucesso_parcial' : 'erro');

    if (!dryRun && logId) {
      await supabase.from('zig_vendas_sync_logs').update({
        status, finalizado_em: new Date().toISOString(),
        total_produtos_zig: totalProdutosZig, total_mapeados: processados.length,
        total_nao_mapeados: pendentes.length, total_movimentacoes: totalMov,
        total_duplicados: totalDup, total_ignorados: ignorados.length,
        erro_mensagem: erros.length > 0 ? erros.join(' | ') : null,
        nao_mapeados_lista: pendentes.map(p => p.nome),
        itens_processados: processados, itens_ignorados: ignorados, itens_pendentes: pendentes,
      }).eq('id', logId);
    }

    // 3. Aviso no Telegram (em simulação só quando pedido, com o rótulo de teste)
    let enviados: string[] = [];
    if (!dryRun || body.avisar === true) {
      const periodo = dtinicio === dtfim ? brDate(dtinicio) : `${brDate(dtinicio)} a ${brDate(dtfim)}`;
      let msg = dryRun ? `\u{1F9EA} <b>[SIMULAÇÃO] Baixa ZIG no estoque — ${periodo}</b>\nNada foi gravado. A baixa real começa amanhã às 6h.\n` : `\u{1F4E6} <b>Baixa ZIG no estoque — ${periodo}</b>\n`;
      msg += `✅ ${processados.length} produtos baixados (${totalMov} movimentações)\n`;
      if (totalDup > 0)        msg += `↩️ ${totalDup} já estavam baixados\n`;
      if (ignorados.length > 0) msg += `⏭ ${ignorados.length} ignorados por regra\n`;
      if (pendentes.length > 0) {
        msg += `\n⚠️ <b>${pendentes.length} sem mapeamento (não baixaram):</b>\n`;
        for (const p of pendentes.slice(0, 25)) msg += `• ${p.nome} — ${p.quantidade}\n`;
        if (pendentes.length > 25) msg += `• e mais ${pendentes.length - 25}…\n`;
        msg += `\nMapeie em Estoque › ZIG Vendas › Mapeamento e rode o dia de novo pela tela.\n`;
      }
      if (erros.length > 0) {
        msg += `\n❌ <b>${erros.length} erros:</b>\n`;
        for (const e of erros.slice(0, 5)) msg += `• ${e}\n`;
      }
      enviados = await enviarTelegram(supabase, msg);
    }

    return new Response(JSON.stringify({
      ok: true, dry_run: dryRun, logId, periodo: { dtinicio, dtfim }, status,
      resumo: {
        produtos_zig: totalProdutosZig, baixados: processados.length, movimentacoes: totalMov,
        duplicados: totalDup, ignorados: ignorados.length, pendentes: pendentes.length, erros: erros.length,
      },
      pendentes, erros, telegram_enviado_para: enviados,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    if (!dryRun && logId) {
      await supabase.from('zig_vendas_sync_logs').update({
        status: 'erro', finalizado_em: new Date().toISOString(), erro_mensagem: err.message,
      }).eq('id', logId);
      await enviarTelegram(supabase, `❌ <b>Baixa ZIG falhou</b> (${brDate(dtinicio)})\n${err.message}`);
    }
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
