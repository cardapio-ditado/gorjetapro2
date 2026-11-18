import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Bônus da ZIG por pessoa (Kadu, 18/11/2026): lê a lista de compradores da ZIG
// (erp/compradores) e guarda cada transação paga em bônus em zig_bonus, com a
// pessoa (zig_bonus_pessoas). Funcionário é reconhecido pelo CPF; parceiro de
// permuta e cortesia são marcados na tela Bônus ZIG.
//
// - {acao:'coletar'}: a noite de ontem (agendamento das 6h40).
// - {acao:'coletar', dtinicio, dtfim}: o histórico, noite a noite.
// - O token da ZIG vem do segredo ZIG_TOKEN (cadastrado pelo Kadu); nunca é
//   devolvido nem gravado. Sem ele, só a noite de ontem, pela zig-consulta.
// - Acesso: o agendamento (x-agente-token) ou quem pode ver Bônus ZIG.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZIG_TOKEN = Deno.env.get('ZIG_TOKEN') ?? '';
const ZIG_API = 'https://api.zigcore.com.br/integration/erp';
const LOJA = 'eefa43ae-af7c-4421-aa2a-df8435cc0de3';
const MAX_NOITES = 62;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agente-token',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function ehAgendamento(req: Request) {
  const token = req.headers.get('x-agente-token') ?? '';
  if (!token) return false;
  const { data } = await db.from('agente_config').select('valor').eq('chave', 'token_teste').maybeSingle();
  const teste = typeof data?.valor === 'string' ? data.valor : '';
  return !!teste && iguais(token, teste);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ontemCuiaba = () => iso(new Date(Date.now() - 4 * 3600_000 - 86400_000));
const limpo = (s: unknown) => String(s ?? '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();

/** Compradores de uma noite, direto da ZIG (com o segredo) ou, para ontem, pela zig-consulta. */
async function compradores(noite: string): Promise<any[]> {
  if (ZIG_TOKEN) {
    const url = `${ZIG_API}/compradores?dtinicio=${noite}&dtfim=${noite}&loja=${LOJA}`;
    const res = await fetch(url, { headers: { Authorization: ZIG_TOKEN } });
    if (!res.ok) throw new Error(`ZIG respondeu ${res.status} para ${noite}`);
    const corpo = await res.json();
    return Array.isArray(corpo) ? corpo : Array.isArray(corpo?.data) ? corpo.data : [];
  }
  if (noite !== ontemCuiaba()) throw new Error('Sem o segredo ZIG_TOKEN só dá para coletar a noite de ontem.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/zig-consulta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'erp/compradores', periodo: 'ontem' }),
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok || !corpo?.ok || !Array.isArray(corpo.data)) throw new Error('A consulta da ZIG não respondeu.');
  return corpo.data;
}

async function coletarNoite(noite: string) {
  const lista = await compradores(noite);
  const porTransacao = new Map<string, any>();
  for (const c of lista) {
    if (c?.paymentType !== 'Bonus' || !c?.transactionId) continue;
    const t = porTransacao.get(c.transactionId) ?? {
      transacao: String(c.transactionId), data: c.date ?? null, nome: limpo(c.userName), documento: limpo(c.userDocument), chip: limpo(c.chipNfc), consumo: 0, taxa: 0,
    };
    t.consumo += Number(c.productsValue || 0) / 100;
    t.taxa += Number(c.tipValue || 0) / 100;
    porTransacao.set(c.transactionId, t);
  }
  const itens = [...porTransacao.values()].map((t) => ({ ...t, consumo: Math.round(t.consumo * 100) / 100, taxa: Math.round(t.taxa * 100) / 100 }));
  const { data, error } = await db.rpc('fn_bonus_gravar_noite', { p_noite: noite, p_itens: itens });
  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!(await ehAgendamento(req))) {
      const auth = req.headers.get('Authorization');
      if (!auth) return json({ ok: false, error: 'Sessão ausente.' }, 401);
      const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: pode } = await caller.rpc('fn_bonus_pode');
      if (pode !== true) return json({ ok: false, error: 'Sem acesso.' }, 403);
    }
    if (String(body?.acao || 'coletar') !== 'coletar') return json({ ok: false, error: 'Ação desconhecida.' }, 400);

    const ok = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const ini = ok(body?.dtinicio) ? String(body.dtinicio) : ontemCuiaba();
    const fim = ok(body?.dtfim) ? String(body.dtfim) : ini;
    const noites: string[] = [];
    for (let d = new Date(ini + 'T12:00:00Z'); iso(d) <= fim && noites.length < MAX_NOITES; d.setUTCDate(d.getUTCDate() + 1)) noites.push(iso(d));

    const feitas = [], erros = [];
    for (const n of noites) {
      try { feitas.push(await coletarNoite(n)); }
      catch (e: any) {
        erros.push({ noite: n, erro: e?.message || String(e) });
        await db.from('zig_bonus_coletas').upsert({ noite: n, erro: e?.message || String(e), coletado_em: new Date().toISOString() });
      }
    }
    return json({ ok: erros.length === 0, com_segredo: !!ZIG_TOKEN, noites: feitas, erros, parou_em: noites.length === MAX_NOITES ? noites[noites.length - 1] : null });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
});
