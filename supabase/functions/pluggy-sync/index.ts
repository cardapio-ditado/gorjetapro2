import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Extrato bancário automático pela Pluggy (Meu Pluggy).
//
// - Credenciais: PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET (secrets do projeto,
//   cadastrados pelo Kadu). Cada leitura troca as duas por uma chave de 2 horas.
// - Para cada banco_integracoes ativa: lê o item (situação e validade da
//   autorização), o saldo e as movimentações, e grava em banco_extrato. Cada
//   movimento entra uma vez só (externo_id); o que já foi resolvido não muda.
//   A classificação é feita no banco (trigger com banco_regras).
// - O Meu Pluggy atualiza a conta uma vez por dia; aqui só lemos o que ele já tem.
// - Acesso: o agendamento (x-agente-token) ou login com o módulo Financeiro.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLUGGY = 'https://api.pluggy.ai';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agente-token',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

/** Releitura dos últimos dias a cada vez: pega o que a Pluggy lançou com atraso. */
const RELER_DIAS = 5;
/** Primeira leitura de uma conta: até onde voltar. */
const PRIMEIRA_LEITURA_DIAS = 90;
const MAX_PAGINAS = 60;

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

async function chavePluggy(): Promise<string> {
  const clientId = Deno.env.get('PLUGGY_CLIENT_ID');
  const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Faltam os secrets PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Supabase.');
  const res = await fetch(`${PLUGGY}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok || !corpo?.apiKey) throw new Error(`Pluggy recusou as credenciais (${res.status}): ${corpo?.message ?? 'sem detalhe'}`);
  return corpo.apiKey as string;
}

async function pluggy(chave: string, caminho: string) {
  const res = await fetch(caminho.startsWith('http') ? caminho : `${PLUGGY}${caminho}`, { headers: { 'X-API-KEY': chave } });
  const corpo = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, corpo };
}

/** Movimentações da conta desde `desde` (YYYY-MM-DD), com a paginação por cursor da v2. */
async function transacoes(chave: string, accountId: string, desde: string) {
  const base = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
  let r = await pluggy(chave, `${base}&from=${desde}`);
  let filtrarAqui = false;
  if (r.status === 400) {
    // se a v2 não aceitar o filtro de data, lê tudo e filtra aqui
    r = await pluggy(chave, base);
    filtrarAqui = true;
  }
  if (!r.ok) throw new Error(`Erro ao ler movimentações (${r.status}): ${r.corpo?.message ?? ''}`);
  const todas: any[] = [...(r.corpo?.results ?? [])];
  let next = r.corpo?.next;
  for (let p = 1; next && p < MAX_PAGINAS; p++) {
    // a v2 manda `next` pronto ("?accountId=...&after=..."): usa como veio, sem remontar
    const n = String(next);
    const url = n.startsWith('http') || n.startsWith('/') ? n
      : n.startsWith('?') ? `/v2/transactions${n}`
      : `${base}${filtrarAqui ? '' : `&from=${desde}`}&after=${encodeURIComponent(n)}`;
    const pr = await pluggy(chave, url);
    if (!pr.ok) throw new Error(`Erro ao paginar movimentações (${pr.status}): ${pr.corpo?.message ?? ''}`);
    todas.push(...(pr.corpo?.results ?? []));
    next = pr.corpo?.next;
  }
  return filtrarAqui ? todas.filter((t) => String(t.date).slice(0, 10) >= desde) : todas;
}

/** Data em Cuiabá (UTC-4, sem horário de verão). */
const diaCuiaba = (iso: string) => new Date(new Date(iso).getTime() - 4 * 3600_000).toISOString().slice(0, 10);

function linha(t: any, integ: any) {
  const valor = Number(t.amount ?? 0);
  const sentido = valor < 0 || t.type === 'DEBIT' ? 'debito' : 'credito';
  const pd = t.paymentData ?? {};
  const outro = sentido === 'debito' ? pd.receiver : pd.payer;
  const partes = String(t.description ?? '').split(' | ');
  const nome = outro?.name || (partes.length >= 3 ? partes.slice(2).join(' | ') : null);
  return {
    integracao_id: integ.id,
    banco_conta_id: integ.banco_conta_id,
    externo_id: String(t.id),
    data: diaCuiaba(t.date),
    data_hora: t.date,
    valor: Math.abs(valor),
    sentido,
    operacao: t.operationType ?? pd.paymentMethod ?? null,
    descricao: t.description ?? t.descriptionRaw ?? null,
    contraparte_nome: nome,
    contraparte_doc: outro?.documentNumber?.value ?? null,
    contraparte_doc_tipo: outro?.documentNumber?.type ?? null,
    categoria_provedor: t.category ?? null,
    payload: t,
  };
}

async function sincronizar(integ: any, chave: string) {
  const resumo: Record<string, unknown> = {};

  const item = await pluggy(chave, `/items/${integ.item_id}`);
  const itemStatus = item.ok ? (item.corpo?.status ?? null) : `erro ${item.status}`;
  const consent = item.ok ? (item.corpo?.consentExpiresAt ?? null) : null;
  resumo.item_atualizado_em = item.ok ? (item.corpo?.lastUpdatedAt ?? null) : null;

  const conta = await pluggy(chave, `/accounts/${integ.account_id}`);
  if (!conta.ok) throw new Error(`Conta não encontrada na Pluggy (${conta.status}). A autorização do Meu Pluggy pode ter vencido.`);

  const { data: ultima } = await db.from('banco_extrato').select('data').eq('integracao_id', integ.id)
    .order('data', { ascending: false }).limit(1).maybeSingle();
  const desde = new Date(Date.now() - (ultima ? RELER_DIAS : PRIMEIRA_LEITURA_DIAS) * 86400_000);
  if (ultima?.data && ultima.data < desde.toISOString().slice(0, 10)) desde.setTime(new Date(`${ultima.data}T00:00:00Z`).getTime());
  const desdeStr = desde.toISOString().slice(0, 10);

  const lidas = await transacoes(chave, integ.account_id, desdeStr);
  const postadas = lidas.filter((t) => (t.status ?? 'POSTED') === 'POSTED');
  let novas = 0;
  for (let i = 0; i < postadas.length; i += 400) {
    const lote = postadas.slice(i, i + 400).map((t) => linha(t, integ));
    const { data, error } = await db.from('banco_extrato').upsert(lote, { onConflict: 'externo_id', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(`Erro ao gravar o extrato: ${error.message}`);
    novas += data?.length ?? 0;
  }
  Object.assign(resumo, { desde: desdeStr, lidas: lidas.length, pendentes_na_pluggy: lidas.length - postadas.length, novas });

  await db.from('banco_integracoes').update({
    saldo: conta.corpo?.balance ?? null,
    saldo_em: new Date().toISOString(),
    item_status: itemStatus,
    consentimento_expira_em: consent,
    ultimo_sync_em: new Date().toISOString(),
    ultimo_sync_ok: true,
    ultimo_erro: null,
    ultimo_resumo: resumo,
  }).eq('id', integ.id);
  return { conta: integ.nome, ...resumo };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    if (!(await ehAgendamento(req))) {
      const auth = req.headers.get('Authorization');
      if (!auth) return json({ ok: false, error: 'Sessão ausente.' }, 401);
      const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: pode, error: podeErr } = await caller.rpc('fn_financeiro_pode');
      if (podeErr || pode !== true) return json({ ok: false, error: 'Sem acesso ao financeiro.' }, 403);
    }

    const { data: integracoes, error } = await db.from('banco_integracoes').select('*').eq('ativo', true);
    if (error) throw new Error(error.message);
    if (!integracoes?.length) return json({ ok: true, contas: [] });

    const chave = await chavePluggy();
    const contas = [];
    for (const integ of integracoes) {
      try {
        contas.push({ ok: true, ...(await sincronizar(integ, chave)) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.from('banco_integracoes').update({
          ultimo_sync_em: new Date().toISOString(), ultimo_sync_ok: false, ultimo_erro: msg,
        }).eq('id', integ.id);
        contas.push({ ok: false, conta: integ.nome, error: msg });
      }
    }
    return json({ ok: contas.every((c) => c.ok), contas });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
