import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Vendas da noite em andamento, direto da ZIG, para o Portal do Gerente.
//
// - Exige login e que a pessoa tenha acesso ao Livro da Noite (fn_livro_pode).
// - Não guarda nem repete o token da ZIG: busca pela função zig-consulta, que
//   já o possui (vendas em erp/saida-produtos, clientes em erp/compradores).
//   A ZIG fecha o "dia" pela noite inteira (até a madrugada), e a
//   zig-consulta calcula "hoje"/"ontem" pela data UTC; por isso aqui escolhemos
//   o período pela hora UTC: antes das 10h UTC (06h em Cuiabá) a noite ainda é a
//   "de ontem" (UTC).
// - A ZIG devolve horários em UTC sem o "Z". Tudo é convertido para Cuiabá
//   (UTC-4) na tela; aqui só devolvemos o instante em UTC com "Z".

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ ok: false, error: 'Sessão ausente.' }, 401);

    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: pode, error: podeErr } = await caller.rpc('fn_livro_pode');
    if (podeErr || pode !== true) return json({ ok: false, error: 'Sem acesso.' }, 403);

    const agora = new Date();
    const periodo = agora.getUTCHours() < 10 ? 'ontem' : 'hoje';
    const noite = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - (periodo === 'ontem' ? 1 : 0)))
      .toISOString().slice(0, 10);

    const zig = async (endpoint: string) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zig-consulta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, periodo }),
      });
      const corpo = await res.json().catch(() => null);
      return res.ok && corpo?.ok && Array.isArray(corpo.data) ? (corpo.data as any[]) : null;
    };
    const [vendas, compradores] = await Promise.all([zig('erp/saida-produtos'), zig('erp/compradores')]);
    if (!vendas) return json({ ok: false, error: 'A ZIG não respondeu agora.' }, 502);
    const linhas: any[] = vendas.filter((v) => !v.isRefunded);
    // A taxa de serviço é ~10% do consumo (o couvert/entrada não paga taxa).
    // Em saida-produtos a ZIG manda a taxa numa linha só por dia, sem garçom, e
    // ela só cresce quando as comandas são pagas; a prevista vem das compras
    // (abaixo) e, se elas faltarem, de 10% do consumo.
    let consumo = 0, couvert = 0, taxaFechada = 0, itens = 0;
    let ultima = '';
    const pedidos = new Set<string>();
    const cat: Record<string, number> = {};
    const bar: Record<string, number> = {};
    const hora: Record<string, number> = {};
    const prod: Record<string, { valor: number; qtd: number }> = {};
    const garc: Record<string, { consumo: number; couvert: number; itens: number; pedidos: Set<string>; ultima: string }> = {};

    for (const v of linhas) {
      const qtd = Number(v.count || 1);
      const valor = (Number(v.unitValue || 0) * qtd - Number(v.discountValue || 0)) / 100;
      if (v.source === 'tip' || v.type === 'Tip') { taxaFechada += valor; continue; }

      const nome = String(v.employeeName || '').trim() || 'Sem garçom';
      const quando = String(v.transactionDate || '');
      const g = (garc[nome] ??= { consumo: 0, couvert: 0, itens: 0, pedidos: new Set(), ultima: '' });
      if (quando > g.ultima) g.ultima = quando;
      if (quando > ultima) ultima = quando;

      if (v.type === 'Entrance') { couvert += valor; g.couvert += valor; continue; }

      consumo += valor; itens += qtd; g.consumo += valor; g.itens += qtd;
      if (v.transactionId) { pedidos.add(v.transactionId); g.pedidos.add(v.transactionId); }
      const c = v.productCategory || 'Outros'; cat[c] = (cat[c] || 0) + valor;
      const b = v.barName || 'Outros'; bar[b] = (bar[b] || 0) + valor;
      const h = String(((Number(quando.slice(11, 13)) - 4 + 24) % 24)).padStart(2, '0');
      if (quando) hora[h] = (hora[h] || 0) + valor;
      const p = v.productName || 'Produto'; (prod[p] ??= { valor: 0, qtd: 0 }); prod[p].valor += valor; prod[p].qtd += qtd;
    }

    // Clientes e taxa pelas compras (erp/compradores): cada compra traz o
    // cliente (CPF; o cartão é reaproveitado na mesma noite), se já foi paga e
    // a taxa que a ZIG calculou. Cliente com alguma compra em aberto ainda está
    // na casa; com tudo pago, já foi. Daqui só saem contagens, nunca dados da
    // pessoa.
    let clientes: { vieram: number; ainda: number; foram: number; ticket_medio: number } | null = null;
    let taxaPrevista = consumo * 0.1;
    let taxaPaga = taxaFechada;
    if (compradores) {
      const abertos = new Map<string, boolean>();
      let tip = 0, tipPago = 0;
      for (const c of compradores) {
        const chave = String(c.userDocument || '').trim() || `cartao:${c.chipNfc || c.transactionId}`;
        const emAberto = !c.isPaid;
        abertos.set(chave, (abertos.get(chave) ?? false) || emAberto);
        const t = Number(c.tipValue || 0) / 100;
        tip += t;
        if (c.isPaid) tipPago += t;
      }
      const vieram = abertos.size;
      const ainda = [...abertos.values()].filter(Boolean).length;
      clientes = { vieram, ainda, foram: vieram - ainda, ticket_medio: vieram ? r2((consumo + couvert) / vieram) : 0 };
      taxaPrevista = tip;
      taxaPaga = tipPago;
    }

    const lista = (o: Record<string, number>, k: string) =>
      Object.entries(o).map(([n, valor]) => ({ [k]: n, valor: r2(valor) })).sort((a: any, b: any) => b.valor - a.valor);

    return json({
      ok: true,
      noite,
      atualizado_em: ultima ? `${ultima.slice(0, 19)}Z` : null,
      total: r2(consumo + couvert),
      consumo: r2(consumo),
      couvert: r2(couvert),
      taxa_prevista: r2(taxaPrevista),
      taxa_fechada: r2(taxaPaga),
      clientes,
      itens,
      pedidos: pedidos.size,
      por_categoria: lista(cat, 'categoria'),
      por_bar: lista(bar, 'bar'),
      por_hora: Object.entries(hora).map(([h, valor]) => ({ hora: h, valor: r2(valor) })),
      garcons: Object.entries(garc)
        .map(([nome, g]) => ({
          nome, consumo: r2(g.consumo), couvert: r2(g.couvert), taxa_prevista: r2(g.consumo * 0.1),
          itens: g.itens, pedidos: g.pedidos.size,
          ultima: g.ultima ? `${g.ultima.slice(0, 19)}Z` : null,
        }))
        .filter((g) => g.consumo > 0 || g.couvert > 0)
        .sort((a, b) => b.consumo - a.consumo || b.couvert - a.couvert),
      top_produtos: Object.entries(prod)
        .map(([nome, p]) => ({ nome, valor: r2(p.valor), qtd: p.qtd }))
        .sort((a, b) => b.valor - a.valor).slice(0, 8),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Erro interno.' }, 500);
  }
});
