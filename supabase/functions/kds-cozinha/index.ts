import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// KDS da cozinha: a fila de pratos da noite, para o tablet da cozinha.
//
// - Lê a ZIG pela zig-consulta (que guarda o token): erp/saida-produtos da noite
//   em andamento, só o que sai na COZINHA (barName). O transactionId é a comanda
//   do cliente (dura a noite toda): um pedido é a comanda + a hora do lançamento,
//   e cada produto do pedido, um prato (somado; o montado, por combinação de
//   escolhas), com os adicionais. A mesa vem na observação do lançamento
//   ("Mesa: 45"), que o garçom escreve para o cumim.
// - A ZIG só lê: não sabe quando o prato ficou pronto. O "pronto" é o toque no
//   tablet, gravado aqui. O cronômetro corre desde a hora do pedido na ZIG.
// - Guarda quando cada prato apareceu na leitura (visto_em) e a leitura de antes
//   (leitura_anterior), para medir quanto a ZIG demora a mostrar o pedido.
// - A ZIG fecha o "dia" pela noite inteira e devolve horários em UTC sem "Z":
//   antes das 10h UTC (06h em Cuiabá) a noite ainda é a "de ontem" (UTC).
// - Acesso: {acao:'ler'} aceita o agendamento (x-agente-token); o resto exige
//   login com o módulo "kds" (fn_kds_pode) ou master.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agente-token',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

/** Intervalo mínimo entre duas leituras da ZIG (vários tablets abertos leem uma vez só). */
const LER_A_CADA_MS = 10_000;
/** Leitura anterior mais velha que isto não serve para medir o atraso da ZIG. */
const LEITURA_VALIDA_MS = 3 * 60_000;
/** Prato pronto continua na tela por este tempo (para desfazer um toque errado). */
const PRONTOS_MIN = 15;
/** Prato sem "pronto" há mais que isto sai da tela (esqueceram de tocar); continua no relatório. */
const ESQUECIDO_H = 3;
/** Fora da fila: rodízio (sai em rodadas, não é um prato) e couvert. */
const FORA_DA_FILA = /^(ROD[IÍ]ZIO|COUVER)/i;

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** O agendamento se identifica com o mesmo token dos outros agendamentos (agente_config.token_teste). */
async function ehAgendamento(req: Request) {
  const token = req.headers.get('x-agente-token') ?? '';
  if (!token) return false;
  const { data } = await db.from('agente_config').select('valor').eq('chave', 'token_teste').maybeSingle();
  const teste = typeof data?.valor === 'string' ? data.valor : '';
  return !!teste && iguais(token, teste);
}

async function zig(endpoint: string, periodo: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/zig-consulta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, periodo }),
  });
  const corpo = await res.json().catch(() => null);
  return res.ok && corpo?.ok && Array.isArray(corpo.data) ? (corpo.data as any[]) : null;
}

const utc = (s: unknown) => (s ? `${String(s).slice(0, 19)}Z` : null);
const limpo = (s: unknown) => String(s ?? '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();

/** A noite em andamento, como a ZIG a chama (data UTC; antes das 10h UTC, a de ontem). */
function noiteAtual(agora = new Date()) {
  const ontem = agora.getUTCHours() < 10;
  const base = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - (ontem ? 1 : 0)));
  return { noite: base.toISOString().slice(0, 10), periodo: ontem ? 'ontem' : 'hoje' };
}

interface Prato {
  chave: string; noite: string; transacao: string; produto: string; qtd: number;
  adicionais: string[]; garcom: string | null; categoria: string | null; obs: string | null; pedido_em: string; cancelado: boolean;
}

/** Lê a ZIG (se a última leitura tiver mais de LER_A_CADA_MS) e grava os pratos novos. */
async function ler(): Promise<{ lido_em: string | null; erro: string | null; leu: boolean }> {
  const agora = new Date();
  const { data: antes } = await db.from('kds_estado').select('lido_em, erro').eq('id', 1).maybeSingle();
  const limite = new Date(agora.getTime() - LER_A_CADA_MS).toISOString();
  // Reserva a leitura: só passa quem achar a última leitura velha.
  const { data: reservou } = await db.from('kds_estado').update({ lido_em: agora.toISOString(), atualizado_em: agora.toISOString() })
    .eq('id', 1).or(`lido_em.is.null,lido_em.lt."${limite}"`).select('id');
  if (!reservou?.length) return { lido_em: antes?.lido_em ?? null, erro: antes?.erro ?? null, leu: false };

  const { noite, periodo } = noiteAtual(agora);
  const vendas = await zig('erp/saida-produtos', periodo);
  if (!vendas) {
    const erro = 'A ZIG não respondeu na última leitura.';
    await db.from('kds_estado').update({ erro }).eq('id', 1);
    return { lido_em: agora.toISOString(), erro, leu: true };
  }

  const anterior = antes?.lido_em && agora.getTime() - new Date(antes.lido_em).getTime() < LEITURA_VALIDA_MS ? antes.lido_em : null;
  const campos = new Set<string>();
  const pratos = new Map<string, Prato>();
  for (const v of vendas) {
    for (const k of Object.keys(v ?? {})) campos.add(k);
    if (!limpo(v.barName).toUpperCase().includes('COZINHA')) continue;
    if (v.source === 'tip' || v.type === 'Tip' || v.type === 'Entrance' || !v.transactionId) continue;
    const produto = limpo(v.productName) || 'Prato';
    if (FORA_DA_FILA.test(produto)) continue;
    const pedido_em = utc(v.transactionDate);
    if (!pedido_em) continue;
    const transacao = `${v.transactionId}|${pedido_em}`;
    // Prato montado (Monte seu Petisco): cada combinação de escolhas é um prato.
    const escolhas = (Array.isArray(v.additions) ? v.additions : []).map((a: any) => `${limpo(a?.name)}×${Number(a?.count || 1)}`).sort().join(',');
    const chave = `${transacao}|${v.productId || produto}${escolhas ? `|${escolhas}` : ''}`;
    const p = pratos.get(chave) ?? {
      chave, noite, transacao, produto, qtd: 0, adicionais: [],
      garcom: limpo(v.employeeName) || null, categoria: limpo(v.productCategory) || null, obs: limpo(v.obs) || null, pedido_em, cancelado: true,
    };
    const q = Number(v.count || v.fractionalAmount || 1);
    if (!v.isRefunded) {
      p.qtd += q;
      p.cancelado = false;
      // As escolhas são de cada prato (a quantidade fica em qtd): grava uma vez.
      if (!p.adicionais.length) {
        for (const a of Array.isArray(v.additions) ? v.additions : []) {
          const nome = limpo(a?.name);
          if (!nome) continue;
          const n = Number(a?.count || 1);
          p.adicionais.push(n > 1 ? `${n}× ${nome}` : nome);
        }
      }
    }
    pratos.set(chave, p);
  }

  const { data: jaTem } = await db.from('kds_pratos').select('chave, qtd, cancelado, adicionais').eq('noite', noite);
  const existentes = new Map((jaTem ?? []).map((r: any) => [r.chave as string, r]));
  const novos = [];
  for (const p of pratos.values()) {
    const ja = existentes.get(p.chave);
    if (!ja) {
      if (!p.cancelado) novos.push({ ...p, visto_em: agora.toISOString(), leitura_anterior: anterior });
      continue;
    }
    // Estorno ou quantidade mudada depois: atualiza só o que veio da ZIG.
    if (Number(ja.qtd) !== p.qtd || ja.cancelado !== p.cancelado || (ja.adicionais ?? []).join('|') !== p.adicionais.join('|')) {
      await db.from('kds_pratos').update({ qtd: p.cancelado ? ja.qtd : p.qtd, cancelado: p.cancelado, adicionais: p.adicionais }).eq('chave', p.chave);
    }
  }
  if (novos.length) {
    const { error } = await db.from('kds_pratos').upsert(novos, { onConflict: 'chave', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await db.from('kds_estado').update({ erro: null, campos: [...campos].sort() }).eq('id', 1);
  return { lido_em: agora.toISOString(), erro: null, leu: true };
}

const minutos = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Quanto a ZIG demorou para mostrar os pratos (em segundos), pelas leituras seguidas. */
function atrasoZig(pratos: any[]) {
  const max: number[] = [], min: number[] = [];
  for (const p of pratos) {
    if (!p.leitura_anterior) continue;
    const pedido = new Date(p.pedido_em).getTime();
    max.push((new Date(p.visto_em).getTime() - pedido) / 1000);
    min.push(Math.max(0, (new Date(p.leitura_anterior).getTime() - pedido) / 1000));
  }
  if (!max.length) return null;
  return { pratos: max.length, ate_seg: Math.round(mediana(max)!), desde_seg: Math.round(mediana(min)!) };
}

/** Resumo de uma noite: tempo de preparo por prato e pela noite. */
function resumir(pratos: any[]) {
  const feitos = pratos.filter((p) => p.pronto_em && !p.cancelado);
  const tempos = feitos.map((p) => minutos(p.pedido_em, p.pronto_em));
  const porProduto = new Map<string, number[]>();
  for (const p of feitos) {
    const t = porProduto.get(p.produto) ?? [];
    t.push(minutos(p.pedido_em, p.pronto_em));
    porProduto.set(p.produto, t);
  }
  const porHora = new Map<string, number[]>();
  for (const p of feitos) {
    const h = String((new Date(p.pedido_em).getUTCHours() - 4 + 24) % 24).padStart(2, '0');
    const t = porHora.get(h) ?? [];
    t.push(minutos(p.pedido_em, p.pronto_em));
    porHora.set(h, t);
  }
  const media = (xs: number[]) => (xs.length ? r1(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return {
    pratos: pratos.filter((p) => !p.cancelado).length,
    feitos: feitos.length,
    sem_pronto: pratos.filter((p) => !p.pronto_em && !p.cancelado).length,
    media_min: media(tempos),
    mediana_min: tempos.length ? r1(mediana(tempos)!) : null,
    amarelos: tempos.filter((t) => t >= 15 && t < 20).length,
    vermelhos: tempos.filter((t) => t >= 20).length,
    atraso_zig: atrasoZig(pratos),
    por_produto: [...porProduto.entries()].map(([produto, t]) => ({
      produto, feitos: t.length, media_min: media(t), maior_min: r1(Math.max(...t)), acima_20: t.filter((x) => x >= 20).length,
    })).sort((a, b) => (b.media_min ?? 0) - (a.media_min ?? 0)),
    por_hora: [...porHora.entries()].sort().map(([hora, t]) => ({ hora, feitos: t.length, media_min: media(t) })),
  };
}

const CAMPOS = 'id, transacao, produto, qtd, adicionais, garcom, categoria, obs, pedido_em, visto_em, leitura_anterior, pronto_em, pronto_por, cancelado';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || 'fila');

    if (acao === 'ler' && (await ehAgendamento(req))) {
      // Fora da noite (6h às 17h em Cuiabá) o agendamento não lê nada.
      const h = (new Date().getUTCHours() - 4 + 24) % 24;
      if (h >= 6 && h < 17) return json({ ok: true, fora_do_horario: true });
      return json({ ok: true, ...(await ler()) });
    }

    const auth = req.headers.get('Authorization');
    if (!auth) return json({ ok: false, error: 'Sessão ausente.' }, 401);
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: pode, error: podeErr } = await caller.rpc('fn_kds_pode');
    if (podeErr || pode !== true) return json({ ok: false, error: 'Sem acesso.' }, 403);

    if (acao === 'fila' || acao === 'ler') {
      const leitura = await ler();
      const { noite } = noiteAtual();
      const desde = new Date(Date.now() - PRONTOS_MIN * 60_000).toISOString();
      const velho = new Date(Date.now() - ESQUECIDO_H * 3600_000).toISOString();
      const { data: pratos, error } = await db.from('kds_pratos').select(CAMPOS).eq('noite', noite).eq('cancelado', false)
        .gt('pedido_em', velho).or(`pronto_em.is.null,pronto_em.gt."${desde}"`).order('pedido_em');
      if (error) throw new Error(error.message);
      const { data: todos } = await db.from('kds_pratos').select('pedido_em, visto_em, leitura_anterior, pronto_em, cancelado, produto').eq('noite', noite);
      const r = resumir(todos ?? []);
      return json({
        ok: true, noite, agora: new Date().toISOString(), lido_em: leitura.lido_em, erro: leitura.erro,
        pratos: pratos ?? [],
        resumo: { pratos: r.pratos, feitos: r.feitos, media_min: r.media_min, vermelhos: r.vermelhos, atraso_zig: r.atraso_zig },
      });
    }

    if (acao === 'pronto' || acao === 'desfazer') {
      const ids = (Array.isArray(body?.ids) ? body.ids : []).map(Number).filter((n: number) => Number.isFinite(n));
      if (!ids.length) return json({ ok: false, error: 'Nenhum prato.' }, 400);
      let quem: string | null = null;
      if (acao === 'pronto') {
        const { data: u } = await caller.auth.getUser();
        const uid = u?.user?.id;
        if (uid) {
          const { data: us } = await db.from('usuarios_sistema').select('nome_completo').or(`auth_user_id.eq.${uid},id.eq.${uid}`).limit(1).maybeSingle();
          quem = us?.nome_completo ?? null;
        }
      }
      const mudar = acao === 'pronto' ? { pronto_em: new Date().toISOString(), pronto_por: quem } : { pronto_em: null, pronto_por: null };
      let q = db.from('kds_pratos').update(mudar).in('id', ids);
      q = acao === 'pronto' ? q.is('pronto_em', null) : q.not('pronto_em', 'is', null);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (acao === 'relatorio') {
      const noite = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.noite || '')) ? String(body.noite) : noiteAtual().noite;
      const { data: pratos, error } = await db.from('kds_pratos').select(CAMPOS).eq('noite', noite).order('pedido_em');
      if (error) throw new Error(error.message);
      const { data: estado } = await db.from('kds_estado').select('campos').eq('id', 1).maybeSingle();
      return json({ ok: true, noite, ...resumir(pratos ?? []), campos_zig: estado?.campos ?? [], lista: pratos ?? [] });
    }

    return json({ ok: false, error: 'Ação desconhecida.' }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
});
