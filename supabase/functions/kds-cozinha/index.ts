import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// KDS da cozinha, do bar e dos drinks: a fila da noite, para o tablet de cada setor.
//
// - Lê a ZIG pela zig-consulta (que guarda o token): erp/saida-produtos da noite
//   em andamento. Cozinha é o ponto COZINHA (barName). Bar e drinks se separam
//   pela categoria do produto (ver setorDe), porque a ZIG manda drinks pelo
//   ponto CHOPP e água de coco pelo ponto DRINK. O transactionId é a comanda
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
// - Parrilla (Kadu, 18/11/2026): assados, executivos, chapas e queijo coalho na
//   brasa saem pelo ponto COZINHA da ZIG, mas a carne vai para a tela da
//   parrilla e os acompanhamentos para a da cozinha (duas linhas, cada uma com o
//   seu "pronto"). O ponto da carne vem do complemento "Ponto da carne" da ZIG
//   (fica em additions) ou da observação do lançamento; sem ponto, a parrilla
//   avisa para cobrar o garçom e o parrilleiro marca o ponto no tablet.

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

type Setor = 'cozinha' | 'bar' | 'drinks' | 'parrilla';
/** Amarelo e vermelho de cada setor (minutos desde o pedido). */
const LIMITES: Record<Setor, { amarelo: number; vermelho: number }> = {
  cozinha: { amarelo: 15, vermelho: 20 },
  parrilla: { amarelo: 15, vermelho: 20 },
  bar: { amarelo: 5, vermelho: 8 },
  drinks: { amarelo: 8, vermelho: 12 },
};
/** Categorias da ZIG que saem nos drinks: drinks, caipirinhas, doses, combos e garrafas. */
const DRINKS = /^(DRINK|CAIPIRINHA|DOSE|CACHA[CÇ]A|COMBO|WHISKY|VODKA|GIN|LICOR|VINHO|CHAMPAGNE|ESPUMANTE|TEQUILA|RUM|CONHAQUE)/;

/** Pratos da parrilla: pela categoria da ZIG (prato novo nessas categorias já entra) e o queijo coalho na brasa. */
const PARRILLA_CATEGORIA = /^(ASSADO|EXECUTIVO|CHAPA)/;
const PARRILLA_PRODUTO = /COALHO NA BRASA|CASCATA DE QUEIJO|^CHAPA MISTA|COSTELA DE COLHER|^BURGU?ER/;
/** Sem a opção de ponto na ZIG: entram sozinhos em "Ao ponto" (a observação e o tablet ainda trocam). */
const PONTO_PADRAO = /CASCATA DE QUEIJO|^CHAPA MISTA/;
/** Picanha na chapa c/ cascata de queijo: o queijo e os acompanhamentos já vão para a cozinha. */
const CASCATA = /CASCATA DE QUEIJO/;
/** Burguer: o hambúrguer sai da parrilla e a cozinha só monta depois do Pronto da parrilla. */
const BURGUER = /^BURGU?ER/;
/** Acompanhamento que também sai da brasa: fica no cartão da parrilla, não vai para a cozinha. */
const ACOMP_DA_BRASA = /COALHO/;
/** Não leva ponto: porco, frango (coxa, sobrecoxa, asa), costela, linguiça e queijo. */
const SEM_PONTO = /SU[IÍ]N|PORCO|FRANGO|COXA|\bASAS?\b|COSTELA|LINGUI|CHORIP|QUEIJO|COALHO/;

export type Ponto = 'mal' | 'ponto_mal' | 'ponto' | 'ponto_bem' | 'bem';
const PONTOS: Ponto[] = ['mal', 'ponto_mal', 'ponto', 'ponto_bem', 'bem'];
/** Lê o ponto num texto (complemento da ZIG ou observação). A ordem importa: o mais específico primeiro. */
function pontoDe(texto: string): Ponto | null {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/PONTO (PARA|PRA|P\/?) ?MAL|PONTO MENOS|MAL PRO PONTO/.test(t)) return 'ponto_mal';
  if (/PONTO (PARA|PRA|P\/?) ?BEM|PONTO MAIS|BEM PRO PONTO/.test(t)) return 'ponto_bem';
  if (/MAL ?PASSAD|MALPASSAD|SANGRANDO|AL SANGUE/.test(t)) return 'mal';
  if (/BEM ?PASSAD|BEMPASSAD/.test(t)) return 'bem';
  if (/AO PONTO|\bNO PONTO\b|^PONTO$/.test(t)) return 'ponto';
  return null;
}

/** Cozinha pelo ponto da ZIG; o resto, drinks pela categoria, e bar o que sobra. */
function setorDe(v: any): Setor | null {
  const ponto = limpo(v.barName).toUpperCase();
  if (!ponto) return null;
  if (ponto.includes('COZINHA')) return 'cozinha';
  return DRINKS.test(limpo(v.productCategory).toUpperCase()) ? 'drinks' : 'bar';
}
const ehSetor = (s: unknown): s is Setor => s === 'cozinha' || s === 'bar' || s === 'drinks' || s === 'parrilla';
const ehParrilla = (produto: string, categoria: string | null) =>
  PARRILLA_CATEGORIA.test((categoria ?? '').toUpperCase()) || PARRILLA_PRODUTO.test(produto.toUpperCase());

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
  setor: Setor;
  /** Prato da parrilla dividido: 'carne' (parrilla) ou 'acomp' (cozinha). */
  parte: 'carne' | 'acomp' | null;
  ponto: Ponto | null; ponto_origem: 'zig' | 'obs' | 'padrao' | null; precisa_ponto: boolean;
  /** Linha da cozinha que só aparece quando a carne da parrilla fica pronta (burguer). */
  espera_parrilla: boolean;
}

/** Divide o prato da parrilla em carne (com o ponto) e acompanhamentos (cozinha). */
function dividir(p: Prato): Prato[] {
  if (p.setor !== 'cozinha' || !ehParrilla(p.produto, p.categoria)) return [p];
  let ponto: Ponto | null = null;
  const brasa: string[] = [], cozinha: string[] = [];
  for (const a of p.adicionais) {
    const pt = pontoDe(a);
    if (pt) { ponto = ponto ?? pt; continue; }
    (ACOMP_DA_BRASA.test(a.toUpperCase()) ? brasa : cozinha).push(a);
  }
  // "Cascata de queijo" é o acompanhamento: a picanha leva ponto.
  const precisa = !SEM_PONTO.test(p.produto.toUpperCase().replace(CASCATA, ''));
  const carne: Prato = {
    ...p, chave: `${p.chave}|parrilla`, setor: 'parrilla', parte: 'carne', adicionais: brasa,
    precisa_ponto: precisa, ponto: precisa ? ponto : null, ponto_origem: precisa && ponto ? 'zig' : null,
  };
  const nome = p.produto.toUpperCase();
  if (precisa && !ponto && PONTO_PADRAO.test(nome)) { carne.ponto = 'ponto'; carne.ponto_origem = 'padrao'; }
  const espera = BURGUER.test(nome);
  if (CASCATA.test(nome)) cozinha.unshift('Cascata de queijo');
  if (espera) cozinha.unshift('Montar o burguer');
  if (!cozinha.length) return [carne];
  return [carne, { ...p, chave: `${p.chave}|acomp`, parte: 'acomp', adicionais: cozinha, ponto: null, ponto_origem: null, precisa_ponto: false, espera_parrilla: espera }];
}

/** Lê a ZIG (se a última leitura tiver mais de LER_A_CADA_MS) e grava os pratos novos. */
async function ler(): Promise<{ lido_em: string | null; erro: string | null; leu: boolean }> {
  // Reserva a leitura no banco: só passa quem achar a última leitura velha.
  const { data: res, error: resErr } = await db.rpc('fn_kds_reservar_leitura', { p_intervalo_ms: LER_A_CADA_MS });
  if (resErr) throw new Error(resErr.message);
  const antes = { lido_em: (res?.anterior as string | null) ?? null, erro: (res?.erro as string | null) ?? null };
  if (!res?.reservou) return { lido_em: antes.lido_em, erro: antes.erro, leu: false };
  const agora = new Date(res.agora);

  const { noite, periodo } = noiteAtual(agora);
  const vendas = await zig('erp/saida-produtos', periodo);
  if (!vendas) {
    const erro = 'A ZIG não respondeu na última leitura.';
    await db.from('kds_estado').update({ erro }).eq('id', 1);
    return { lido_em: agora.toISOString(), erro, leu: true };
  }

  const anterior = antes.lido_em && agora.getTime() - new Date(antes.lido_em).getTime() < LEITURA_VALIDA_MS ? antes.lido_em : null;
  const campos = new Set<string>();
  const pratos = new Map<string, Prato>();
  for (const v of vendas) {
    for (const k of Object.keys(v ?? {})) campos.add(k);
    const setor = setorDe(v);
    if (!setor) continue;
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
      garcom: limpo(v.employeeName) || null, categoria: limpo(v.productCategory) || null, obs: limpo(v.obs) || null, pedido_em, cancelado: true, setor,
      parte: null, ponto: null, ponto_origem: null, precisa_ponto: false, espera_parrilla: false,
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

  // Parrilla: separa carne e acompanhamentos. Ponto escrito na observação do
  // lançamento só vale quando há uma carne só (que leva ponto) naquele lançamento.
  const lista = [...pratos.values()].flatMap(dividir);
  const carnesPorLanc = new Map<string, Prato[]>();
  for (const p of lista) {
    if (p.parte !== 'carne' || !p.precisa_ponto || p.cancelado) continue;
    carnesPorLanc.set(p.transacao, [...(carnesPorLanc.get(p.transacao) ?? []), p]);
  }
  for (const carnes of carnesPorLanc.values()) {
    const semPonto = carnes.filter((c) => !c.ponto || c.ponto_origem === 'padrao');
    const doObs = pontoDe(carnes[0].obs ?? '');
    if (doObs && carnes.length === 1 && semPonto.length === 1) { semPonto[0].ponto = doObs; semPonto[0].ponto_origem = 'obs'; }
  }

  const { data: jaTem } = await db.from('kds_pratos').select('chave, qtd, cancelado, adicionais, ponto').eq('noite', noite);
  const existentes = new Map((jaTem ?? []).map((r: any) => [r.chave as string, r]));
  const novos = [];
  for (const p of lista) {
    const ja = existentes.get(p.chave);
    if (!ja) {
      // Prato gravado inteiro antes de passar a ser dividido (regra nova no meio da noite): não volta como pedido novo.
      const inteiro = p.chave.replace(/\|(parrilla|acomp)$/, '');
      if (inteiro !== p.chave && existentes.has(inteiro)) continue;
      if (!p.cancelado) novos.push({ ...p, visto_em: agora.toISOString(), leitura_anterior: anterior });
      continue;
    }
    // Estorno, quantidade ou ponto mudado depois: atualiza só o que veio da ZIG (o ponto do tablet fica em ponto_manual).
    // (Os textos fixos "Cascata de queijo" e "Montar o burguer" entram nos adicionais da cozinha.)
    if (Number(ja.qtd) !== p.qtd || ja.cancelado !== p.cancelado || (ja.adicionais ?? []).join('|') !== p.adicionais.join('|') || (ja.ponto ?? null) !== p.ponto) {
      await db.from('kds_pratos').update({
        qtd: p.cancelado ? ja.qtd : p.qtd, cancelado: p.cancelado, adicionais: p.adicionais, ponto: p.ponto, ponto_origem: p.ponto_origem,
      }).eq('chave', p.chave);
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

/** Parrilla: carnes que saíram da ZIG sem ponto, por garçom (para cobrar). */
function semPontoPorGarcom(pratos: any[]) {
  const m = new Map<string, { garcom: string; carnes: number; sem_ponto: number; marcados_no_tablet: number }>();
  for (const p of pratos) {
    if (p.cancelado || !p.precisa_ponto) continue;
    const g = p.garcom || 'Sem garçom';
    const x = m.get(g) ?? { garcom: g, carnes: 0, sem_ponto: 0, marcados_no_tablet: 0 };
    x.carnes += 1;
    if (!p.ponto) { x.sem_ponto += 1; if (p.ponto_manual) x.marcados_no_tablet += 1; }
    m.set(g, x);
  }
  return [...m.values()].sort((a, b) => b.sem_ponto - a.sem_ponto || b.carnes - a.carnes);
}

/** Resumo de uma noite de um setor: tempo de preparo por prato e pela noite. */
function resumir(pratos: any[], { amarelo, vermelho }: { amarelo: number; vermelho: number }) {
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
    amarelos: tempos.filter((t) => t >= amarelo && t < vermelho).length,
    vermelhos: tempos.filter((t) => t >= vermelho).length,
    atraso_zig: atrasoZig(pratos),
    por_produto: [...porProduto.entries()].map(([produto, t]) => ({
      produto, feitos: t.length, media_min: media(t), maior_min: r1(Math.max(...t)), acima_vermelho: t.filter((x) => x >= vermelho).length,
    })).sort((a, b) => (b.media_min ?? 0) - (a.media_min ?? 0)),
    por_hora: [...porHora.entries()].sort().map(([hora, t]) => ({ hora, feitos: t.length, media_min: media(t) })),
  };
}

const CAMPOS = 'id, chave, setor, transacao, produto, qtd, adicionais, garcom, categoria, obs, pedido_em, visto_em, leitura_anterior, pronto_em, pronto_por, cancelado, parte, ponto, ponto_origem, precisa_ponto, ponto_manual, ponto_por, espera_parrilla';

/**
 * Linhas da cozinha que esperam a parrilla (burguer): só entram na fila quando a carne fica
 * pronta, como um cartão próprio, com o cronômetro contando desse Pronto.
 */
function liberarEspera(doSetor: any[], todos: any[]) {
  const prontoParrilla = new Map<string, string | null>();
  for (const t of todos) if (t.setor === 'parrilla') prontoParrilla.set(t.chave, t.pronto_em);
  const out: any[] = [];
  for (const p of doSetor) {
    if (!p.espera_parrilla) { out.push(p); continue; }
    const liberado = prontoParrilla.get(String(p.chave).replace(/\|acomp$/, '|parrilla'));
    if (!liberado) continue;
    out.push({ ...p, pedido_zig: p.pedido_em, pedido_em: liberado, transacao: `${p.transacao}|montar` });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao || 'fila');
    const setor: Setor = ehSetor(body?.setor) ? body.setor : 'cozinha';

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
      const desde = Date.now() - PRONTOS_MIN * 60_000;
      const velho = Date.now() - ESQUECIDO_H * 3600_000;
      // A noite tem algumas centenas de itens nos três setores: filtra aqui o do setor e o que vai para a tela.
      const { data: todos, error } = await db.from('kds_pratos').select(CAMPOS).eq('noite', noite).order('pedido_em');
      if (error) throw new Error(error.message);
      const ms = (t: string) => new Date(t).getTime();
      const doSetor = liberarEspera((todos ?? []).filter((p: any) => p.setor === setor), todos ?? []);
      const pratos = doSetor.filter((p: any) => !p.cancelado && ms(p.pedido_em) > velho && (!p.pronto_em || ms(p.pronto_em) > desde));
      const r = resumir(doSetor, LIMITES[setor]);
      return json({
        ok: true, noite, setor, limites: LIMITES[setor], agora: new Date().toISOString(), lido_em: leitura.lido_em, erro: leitura.erro,
        pratos,
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

    if (acao === 'ponto') {
      // Parrilleiro marca o ponto que o garçom passou (ou corrige). null volta para o da ZIG.
      const ids = (Array.isArray(body?.ids) ? body.ids : []).map(Number).filter((n: number) => Number.isFinite(n));
      const ponto = body?.ponto === null ? null : PONTOS.includes(body?.ponto) ? (body.ponto as Ponto) : undefined;
      if (!ids.length || ponto === undefined) return json({ ok: false, error: 'Ponto inválido.' }, 400);
      let quem: string | null = null;
      const { data: u } = await caller.auth.getUser();
      const uid = u?.user?.id;
      if (uid) {
        const { data: us } = await db.from('usuarios_sistema').select('nome_completo').or(`auth_user_id.eq.${uid},id.eq.${uid}`).limit(1).maybeSingle();
        quem = us?.nome_completo ?? null;
      }
      const { error } = await db.from('kds_pratos').update({ ponto_manual: ponto, ponto_por: ponto ? quem : null, ponto_em: ponto ? new Date().toISOString() : null })
        .in('id', ids).eq('setor', 'parrilla');
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (acao === 'relatorio') {
      const noite = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.noite || '')) ? String(body.noite) : noiteAtual().noite;
      const { data: pratos, error } = await db.from('kds_pratos').select(CAMPOS).eq('noite', noite).eq('setor', setor).order('pedido_em');
      if (error) throw new Error(error.message);
      const { data: estado } = await db.from('kds_estado').select('campos').eq('id', 1).maybeSingle();
      return json({
        ok: true, noite, setor, limites: LIMITES[setor], ...resumir(pratos ?? [], LIMITES[setor]), campos_zig: estado?.campos ?? [], lista: pratos ?? [],
        ...(setor === 'parrilla' ? { sem_ponto: semPontoPorGarcom(pratos ?? []) } : {}),
      });
    }

    return json({ ok: false, error: 'Ação desconhecida.' }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
});
