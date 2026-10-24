import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// A Casa ao Vivo: cada cliente da noite, agrupado pela praça do garçom, para a
// maquete 3D do Portal do Gerente.
//
// - Só gerentes: quem tem o módulo "casa" (fn_casa_pode) ou o master.
// - A ZIG trabalha com cartão, sem mesa: o cliente fica na praça do garçom que
//   mais o atendeu (ontem, 92% do consumo de cada cliente vinha de um garçom).
// - Lê a ZIG pela zig-consulta (que guarda o token): vendas em
//   erp/saida-produtos, clientes em erp/compradores, ligados pelo transactionId.
// - O CPF nunca sai daqui: vai só o primeiro nome e um id embaralhado. Da
//   fidelidade e do Clube do Whisky saem só marcas (visitas, nível, aniversário).
// - A ZIG manda horários em UTC sem "Z"; aqui devolvemos com "Z".
// - {momento: ISO} reconstitui a noite de ontem naquele instante (aproximado:
//   a ZIG não diz a hora em que a conta foi paga, então quem não pede nada há
//   mais de SAIU_MIN conta como já tendo ido embora).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const r2 = (n: number) => Math.round(n * 100) / 100;
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

/** Sem conta aberta mexendo há este tempo, o cliente está "parado". */
const PARADO_MIN = 30;
/** Na reconstituição, sem pedir nada há este tempo, o cliente já foi embora. */
const SAIU_MIN = 60;

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
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** "maria eduarda souza" vira "Maria". */
const primeiroNome = (s: unknown) => {
  const p = String(s ?? '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : 'Cliente';
};

async function idEmbaralhado(chave: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`casa:${chave}`));
  return [...new Uint8Array(h)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** O balcão da ZIG vira um lugar da maquete. Sem bar de drinks: os drinks saem do bar do chopp. */
const balcao = (bar: unknown): 'chopp' | 'cozinha' | null => {
  const b = String(bar ?? '').trim().toUpperCase();
  if (!b) return null;
  if (b.includes('COZINHA') || b.includes('PARRILLA')) return 'cozinha';
  return 'chopp';
};

interface Item { p: string; q: number; v: number; h: string | null; garcom: string | null; balcao: 'chopp' | 'cozinha' | null; couvert: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ ok: false, error: 'Sessão ausente.' }, 401);
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: pode, error: podeErr } = await caller.rpc('fn_casa_pode');
    if (podeErr || pode !== true) return json({ ok: false, error: 'Sem acesso.' }, 403);

    const body = await req.json().catch(() => ({}));
    const relogio = new Date();
    // Antes das 10h UTC (06h em Cuiabá) a noite ainda é a "de ontem" (UTC).
    const ontemAgora = relogio.getUTCHours() < 10;
    const momento = body?.momento ? new Date(String(body.momento)) : null;
    if (momento && isNaN(momento.getTime())) return json({ ok: false, error: 'Momento inválido.' }, 400);
    const periodo = momento || ontemAgora ? 'ontem' : 'hoje';
    // A noite em questão: a de ontem (reconstituição) ou a em andamento.
    const base = new Date(Date.UTC(relogio.getUTCFullYear(), relogio.getUTCMonth(), relogio.getUTCDate() - (periodo === 'ontem' ? 1 : 0)));
    const noite = base.toISOString().slice(0, 10);
    // Tudo é medido contra "agora": o relógio, ou o momento reconstituído.
    const agora = momento ?? relogio;
    const ateAgora = (h: string | null) => !momento || (!!h && h <= agora.toISOString().slice(0, 19) + 'Z');

    const [vendas, compradores] = await Promise.all([zig('erp/saida-produtos', periodo), zig('erp/compradores', periodo)]);
    if (!vendas || !compradores) return json({ ok: false, error: 'A ZIG não respondeu agora.' }, 502);

    // Itens por transação (estornos e a linha de taxa ficam de fora).
    const porTx = new Map<string, Item[]>();
    for (const v of vendas) {
      if (v.isRefunded || v.source === 'tip' || v.type === 'Tip' || !v.transactionId) continue;
      if (!ateAgora(utc(v.transactionDate))) continue;
      const q = Number(v.count || 1);
      const lista = porTx.get(v.transactionId) ?? [];
      lista.push({
        p: String(v.productName || 'Produto').trim(),
        q,
        v: r2((Number(v.unitValue || 0) * q - Number(v.discountValue || 0)) / 100),
        h: utc(v.transactionDate),
        garcom: String(v.employeeName || '').trim() || null,
        balcao: v.type === 'Entrance' ? null : balcao(v.barName),
        couvert: v.type === 'Entrance',
      });
      porTx.set(v.transactionId, lista);
    }

    // Uma pessoa por CPF (o cartão é reaproveitado na mesma noite).
    interface Pessoa {
      chave: string; cpf: string; nome: string; genero: string | null;
      itens: Item[]; aberto: boolean; consumiu: boolean; chegou: string | null;
    }
    const pessoas = new Map<string, Pessoa>();
    for (const c of compradores) {
      if (!ateAgora(utc(c.date))) continue;
      const cpf = digitos(c.userDocument);
      const chave = cpf || `cartao:${c.chipNfc || c.transactionId}`;
      const p = pessoas.get(chave) ?? {
        chave, cpf, nome: primeiroNome(c.userName), genero: c.userGender ? String(c.userGender) : null,
        itens: [], aberto: false, consumiu: false, chegou: null,
      };
      const quando = utc(c.date);
      if (quando && (!p.chegou || quando < p.chegou)) p.chegou = quando;
      const comValor = Number(c.productsValue || 0) > 0;
      if (comValor) { p.consumiu = true; if (!c.isPaid) p.aberto = true; }
      p.itens.push(...(porTx.get(c.transactionId) ?? []));
      pessoas.set(chave, p);
    }

    // Marcas da casa: fidelidade e Clube do Whisky (só pelo CPF, que não sai daqui).
    const cpfs = [...new Set([...pessoas.values()].map((p) => p.cpf).filter((c) => c.length === 11))];
    const fid = new Map<string, any>();
    const clube = new Set<string>();
    for (let i = 0; i < cpfs.length; i += 200) {
      const lote = cpfs.slice(i, i + 200);
      const [{ data: f }, { data: cw }] = await Promise.all([
        db.from('fidelidade_clientes').select('cpf, total_visitas, tier, aniversario_mes, aniversario_dia, premio_pendente').in('cpf', lote),
        db.from('clube_whisky_garrafas').select('cpf').in('cpf', lote).eq('status', 'ativa'),
      ]);
      for (const x of f ?? []) fid.set(digitos(x.cpf), x);
      for (const x of cw ?? []) clube.add(digitos(x.cpf));
    }

    // Aniversário nesta semana (Cuiabá, UTC-4).
    const hojeCuiaba = new Date(agora.getTime() - 4 * 3600 * 1000);
    const diaDoAno = (m: number, d: number) => Math.floor((Date.UTC(hojeCuiaba.getUTCFullYear(), m - 1, d) - Date.UTC(hojeCuiaba.getUTCFullYear(), 0, 1)) / 86400000);
    const hojeN = diaDoAno(hojeCuiaba.getUTCMonth() + 1, hojeCuiaba.getUTCDate());

    const garcons = new Map<string, { nome: string; clientes: number; consumo: number; pedidos: Set<string>; ultimo: string | null }>();
    const clientes = [];
    for (const p of pessoas.values()) {
      p.itens.sort((a, b) => String(a.h).localeCompare(String(b.h)));
      const consumoItens = p.itens.filter((i) => !i.couvert);
      const consumo = r2(consumoItens.reduce((s, i) => s + i.v, 0));
      const couvert = r2(p.itens.filter((i) => i.couvert).reduce((s, i) => s + i.v, 0));

      // Garçom da praça: quem lançou mais valor para ele.
      const porGarcom = new Map<string, number>();
      for (const i of consumoItens) if (i.garcom) porGarcom.set(i.garcom, (porGarcom.get(i.garcom) ?? 0) + i.v);
      const ordem = [...porGarcom.entries()].sort((a, b) => b[1] - a[1]);
      const garcom = ordem[0]?.[0] ?? null;

      const ultimoItem = consumoItens[consumoItens.length - 1];
      const ultimo = ultimoItem?.h ?? null;
      const chegou = [p.chegou, p.itens[0]?.h].filter(Boolean).sort()[0] ?? null;
      const minutosParado = ultimo ? (agora.getTime() - new Date(ultimo).getTime()) / 60000 : Infinity;
      // Ao vivo, "foi embora" é conta paga. Na reconstituição não se sabe a hora
      // do pagamento: quem não pede há mais de SAIU_MIN já foi.
      const foiEmbora = momento ? minutosParado > SAIU_MIN : !p.aberto;
      const status = !p.consumiu ? 'sem_consumo' : foiEmbora ? 'saiu' : minutosParado > PARADO_MIN ? 'parado' : 'consumindo';

      const f = p.cpf ? fid.get(p.cpf) : null;
      let aniversario = false;
      if (f?.aniversario_mes && f?.aniversario_dia) {
        const dif = diaDoAno(Number(f.aniversario_mes), Number(f.aniversario_dia)) - hojeN;
        aniversario = dif >= -3 && dif <= 3;
      }

      clientes.push({
        id: await idEmbaralhado(p.chave),
        nome: p.nome,
        genero: p.genero,
        garcom,
        garcons: ordem.map(([g]) => g),
        balcao: ultimoItem?.balcao ?? null,
        chegou,
        ultimo,
        status,
        consumo,
        couvert,
        itens: p.itens.map(({ p: produto, q, v, h, garcom: g, couvert: cv }) => ({ p: produto, q, v, h, garcom: g, couvert: cv })),
        visitas: f?.total_visitas ?? null,
        nivel: f?.tier ?? null,
        aniversario,
        premio: !!f?.premio_pendente,
        clube: !!(p.cpf && clube.has(p.cpf)),
      });

      for (const i of consumoItens) {
        if (!i.garcom) continue;
        const g = garcons.get(i.garcom) ?? { nome: i.garcom, clientes: 0, consumo: 0, pedidos: new Set(), ultimo: null };
        g.consumo += i.v;
        if (i.h && (!g.ultimo || i.h > g.ultimo)) g.ultimo = i.h;
        garcons.set(i.garcom, g);
      }
      if (garcom) {
        const g = garcons.get(garcom);
        if (g && status !== 'saiu') g.clientes += 1;
      }
    }
    // Pedidos por garçom (transações distintas).
    for (const v of vendas) {
      const g = garcons.get(String(v.employeeName || '').trim());
      if (g && v.transactionId && v.type === 'Normal' && !v.isRefunded) g.pedidos.add(v.transactionId);
    }

    const naCasa = clientes.filter((c) => c.status === 'consumindo' || c.status === 'parado');
    return json({
      ok: true,
      noite,
      lido_em: relogio.toISOString(),
      momento: momento ? momento.toISOString() : null,
      resumo: {
        na_casa: naCasa.length,
        consumindo: clientes.filter((c) => c.status === 'consumindo').length,
        parados: clientes.filter((c) => c.status === 'parado').length,
        sairam: clientes.filter((c) => c.status === 'saiu').length,
        sem_consumo: clientes.filter((c) => c.status === 'sem_consumo').length,
        consumo: r2(clientes.reduce((s, c) => s + c.consumo, 0)),
        couvert: r2(clientes.reduce((s, c) => s + c.couvert, 0)),
      },
      garcons: [...garcons.values()]
        .map((g) => ({ nome: g.nome, clientes: g.clientes, consumo: r2(g.consumo), pedidos: g.pedidos.size, ultimo: g.ultimo }))
        .sort((a, b) => b.consumo - a.consumo),
      clientes,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
});
