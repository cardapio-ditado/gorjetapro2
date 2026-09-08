import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Processa as baixas de venda ZIG escolhidas na tela Estoque › ZIG Vendas.
//
// Correção de 08/09/2026: a versão anterior, depois de inserir a movimentação,
// ainda subtraía a quantidade em saldos_estoque à mão. Como o trigger do banco
// (trg_atualizar_saldos) já faz isso na inserção, toda venda ZIG era baixada
// duas vezes. Agora só se insere a movimentação; o saldo é responsabilidade
// do trigger.

function normalizar(nome: string): string {
  return nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

async function baixarItemEstoque(
  supabase: any,
  itemEstoqueId: string,
  estoqueId: string,
  quantidade: number,
  dataVenda: string,
  nomeOriginal: string
): Promise<string | null> {
  if (!itemEstoqueId || !estoqueId) {
    throw new Error(`item_id ou estoque_id nulos — produto: ${nomeOriginal}`);
  }

  const { data: item } = await supabase
    .from('itens_estoque')
    .select('custo_medio, nome')
    .eq('id', itemEstoqueId)
    .single();

  const custoUnitario = Number(item?.custo_medio || 0);

  const { data: mov, error } = await supabase
    .from('movimentacoes_estoque')
    .insert({
      item_id:             itemEstoqueId,
      estoque_origem_id:   estoqueId,
      tipo_movimentacao:   'saida',
      quantidade,
      custo_unitario:      custoUnitario,
      custo_total:         custoUnitario * quantidade,
      data_movimentacao:   dataVenda,
      motivo:              'Venda ZIG',
      observacoes:         `Baixa via integração ZIG | produto: ${nomeOriginal}`,
      origem_tipo:         'zig',
      item_descricao:      item?.nome || nomeOriginal,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Erro movimentacao: ${error.message}`);
  return mov.id;
}

async function baixarPorFicha(
  supabase: any,
  fichaTecnicaId: string,
  estoqueId: string,
  quantidadeVendida: number,
  dataVenda: string,
  nomeOriginal: string
): Promise<string[]> {
  // Só ingredientes com baixa_estoque = true descontam do estoque.
  const { data: ingredientes } = await supabase
    .from('ficha_ingredientes')
    .select('item_estoque_id, quantidade, baixa_estoque')
    .eq('ficha_id', fichaTecnicaId)
    .eq('baixa_estoque', true);

  if (!ingredientes?.length) return [];
  const movIds: string[] = [];
  for (const ing of ingredientes) {
    if (!ing.item_estoque_id) continue;
    const movId = await baixarItemEstoque(
      supabase, ing.item_estoque_id, estoqueId,
      Number(ing.quantidade) * quantidadeVendida, dataVenda, nomeOriginal
    );
    if (movId) movIds.push(movId);
  }
  return movIds;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch {}

  const { dtinicio, dtfim, produtos } = body;

  if (!Array.isArray(produtos) || produtos.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Nenhum produto enviado' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { data: log } = await supabase
    .from('zig_vendas_sync_logs')
    .insert({ dtinicio, dtfim, status: 'rodando' })
    .select('id')
    .single();
  const logId = log?.id;

  let totalMovimentacoes = 0;
  let totalDuplicados    = 0;
  let totalErros         = 0;
  let totalIgnorados     = 0;
  let totalPendentes     = 0;
  const erros: string[]  = [];

  const itensProcessados: any[] = [];
  const itensIgnorados: any[]   = [];
  const itensPendentes: any[]   = [];

  for (const prod of produtos) {
    const {
      productId, productName, productCategory,
      count, eventDate,
      estoqueId, itemEstoqueId, fichaTecnicaId,
      ignorar_estoque, expandido_de,
    } = prod;

    if (ignorar_estoque === true) {
      totalIgnorados++;
      itensIgnorados.push({ nome: productName, motivo: 'Marcado como ignorar' });
      continue;
    }

    const temItem    = itemEstoqueId  && String(itemEstoqueId).trim()  !== '';
    const temFicha   = fichaTecnicaId && String(fichaTecnicaId).trim() !== '';
    const temEstoque = estoqueId && String(estoqueId).trim() !== '';

    if (!temEstoque || (!temItem && !temFicha)) {
      totalPendentes++;
      itensPendentes.push({ nome: productName, quantidade: count, motivo: 'Sem mapeamento completo', expandido_de: expandido_de || null });
      continue;
    }

    const dataVenda = (eventDate || dtfim).split('T')[0];

    const { data: jaSync } = await supabase
      .from('zig_vendas_sync_ids')
      .select('id')
      .eq('zig_product_id', productId)
      .eq('data_venda', dataVenda)
      .maybeSingle();

    if (jaSync) { totalDuplicados++; continue; }

    try {
      let movIds: string[] = [];

      if (temFicha) {
        movIds = await baixarPorFicha(supabase, fichaTecnicaId, estoqueId, Number(count), dataVenda, productName);
      } else if (temItem) {
        const movId = await baixarItemEstoque(supabase, itemEstoqueId, estoqueId, Number(count), dataVenda, productName);
        if (movId) movIds = [movId];
      }

      if (movIds.length > 0) {
        totalMovimentacoes += movIds.length;
        await supabase.from('zig_vendas_sync_ids').insert({
          zig_product_id:   productId,
          zig_product_name: productName,
          data_venda:       dataVenda,
          movimentacao_id:  movIds[0],
        });
        itensProcessados.push({ nome: productName, quantidade: count, data_venda: dataVenda, movimentacoes: movIds.length, expandido_de: expandido_de || null });
      }

      const nomeNorm = normalizar(productName);
      const { data: mapExist } = await supabase.from('mapeamento_itens_vendas').select('id').eq('nome_externo', productName).maybeSingle();

      if (mapExist) {
        await supabase.from('mapeamento_itens_vendas').update({
          estoque_id: estoqueId,
          item_estoque_id: temItem ? itemEstoqueId : null,
          ficha_tecnica_id: temFicha ? fichaTecnicaId : null,
          zig_category: productCategory || null,
          ultima_utilizacao: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        }).eq('id', mapExist.id);
      } else {
        await supabase.from('mapeamento_itens_vendas').insert({
          nome_externo: productName, nome_normalizado: nomeNorm,
          item_estoque_id: temItem ? itemEstoqueId : null,
          ficha_tecnica_id: temFicha ? fichaTecnicaId : null,
          estoque_id: estoqueId, zig_category: productCategory || null,
          // A tabela só aceita 'manual' | 'automatico' aqui; 'ficha'/'direto' violava o check e o mapeamento novo nunca era salvo.
          tipo_mapeamento: 'manual', origem: 'manual', confianca: 1,
          usado_vezes: 1, ultima_utilizacao: new Date().toISOString(),
        });
      }

    } catch (err: any) {
      console.error(`Erro ${productName}:`, err.message);
      erros.push(`${productName}: ${err.message}`);
      totalErros++;
    }
  }

  const status = totalErros === 0 ? 'sucesso' : (totalMovimentacoes > 0 ? 'sucesso_parcial' : 'erro');

  await supabase.from('zig_vendas_sync_logs').update({
    status, finalizado_em: new Date().toISOString(),
    total_produtos_zig: produtos.length, total_mapeados: itensProcessados.length,
    total_movimentacoes: totalMovimentacoes, total_duplicados: totalDuplicados,
    total_ignorados: totalIgnorados,
    erro_mensagem: erros.length > 0 ? erros.join(' | ') : null,
    itens_processados: itensProcessados, itens_ignorados: itensIgnorados, itens_pendentes: itensPendentes,
  }).eq('id', logId);

  return new Response(JSON.stringify({
    ok: true, logId,
    resumo: { total_enviados: produtos.length, total_movimentacoes: totalMovimentacoes, total_duplicados: totalDuplicados, total_ignorados: totalIgnorados, total_pendentes: totalPendentes, total_erros: totalErros, erros },
  }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
