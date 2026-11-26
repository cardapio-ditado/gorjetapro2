/**
 * Vale Ditado: evento Purchase na API de Conversões da Meta (Kadu, 26/11/2026).
 *
 * Chamado só quando fn_vale_confirmar_pagamento devolve resultado "pago" (a primeira confirmação do pedido),
 * pelo webhook ou pelo "Já paguei". Não manda de novo em aviso repetido.
 * Secrets (o Kadu configura no Supabase): META_CAPI_TOKEN (obrigatório; sem ele nada é enviado),
 * META_PIXEL_ID (opcional, padrão o pixel do Ditado) e META_TEST_EVENT_CODE (opcional, para "Testar eventos").
 * Dados do cliente vão com hash SHA-256, como a Meta pede. CPF não vai. A URL é a da página de venda,
 * nunca a do comprovante (que tem o link secreto dos vales).
 * Nunca derruba a confirmação do pagamento: erro só vai para o log.
 */
// deno-lint-ignore-file no-explicit-any
const PIXEL_PADRAO = "1074066107036036";
const GRAPH = "https://graph.facebook.com/v23.0";

async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const limpar = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function enviarCompraMeta(db: any, pedidoId: string): Promise<void> {
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!token || !pedidoId) return;
  try {
    const { data: p, error } = await db.from("vale_pedidos")
      .select("id, nome, email, telefone, valor_total, pago_em, origem, user_agent")
      .eq("id", pedidoId).maybeSingle();
    if (error || !p) { console.error(`[vale] meta: pedido ${pedidoId} não lido`); return; }
    const { data: itens } = await db.from("vale_pedido_itens")
      .select("quantidade, preco_unit, vale_produtos(slug)").eq("pedido_id", pedidoId);

    const ud: Record<string, unknown> = { country: [await sha256("br")] };
    const email = limpar(p.email);
    if (email.includes("@")) ud.em = [await sha256(email)];
    let fone = String(p.telefone ?? "").replace(/\D/g, "");
    if (fone.length === 10 || fone.length === 11) fone = "55" + fone;
    if (fone.length >= 12) ud.ph = [await sha256(fone)];
    const partes = limpar(p.nome).split(/\s+/).filter(Boolean);
    if (partes.length) ud.fn = [await sha256(partes[0])];
    if (partes.length > 1) ud.ln = [await sha256(partes[partes.length - 1])];
    const o = p.origem ?? {};
    if (typeof o.fbp === "string" && o.fbp) ud.fbp = o.fbp;
    if (typeof o.fbc === "string" && o.fbc) ud.fbc = o.fbc;
    if (p.user_agent) ud.client_user_agent = p.user_agent;

    const contents = (itens ?? []).map((i: any) => ({
      id: i.vale_produtos?.slug ?? "vale", quantity: i.quantidade, item_price: Number(i.preco_unit),
    }));
    const evento = {
      event_name: "Purchase",
      event_time: Math.floor(new Date(p.pago_em ?? Date.now()).getTime() / 1000),
      event_id: `vale-${p.id}`,
      action_source: "website",
      event_source_url: "https://www.ditado.org/vale",
      user_data: ud,
      custom_data: {
        value: Number(Number(p.valor_total).toFixed(2)), currency: "BRL", content_type: "product",
        content_ids: contents.map((c: any) => c.id), contents,
        num_items: contents.reduce((n: number, c: any) => n + c.quantity, 0), order_id: p.id,
      },
    };
    const corpo: Record<string, unknown> = { data: [evento] };
    const teste = Deno.env.get("META_TEST_EVENT_CODE");
    if (teste) corpo.test_event_code = teste;

    const pixel = Deno.env.get("META_PIXEL_ID") || PIXEL_PADRAO;
    const ctl = new AbortController();
    const tempo = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${GRAPH}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: ctl.signal,
    }).finally(() => clearTimeout(tempo));
    const resp = await r.text();
    if (!r.ok) console.error(`[vale] meta: Purchase do pedido ${p.id} recusado (${r.status}): ${resp.slice(0, 300)}`);
    else console.log(`[vale] meta: Purchase do pedido ${p.id} enviado${teste ? " (teste)" : ""}`);
  } catch (e) {
    console.error(`[vale] meta: ${(e as Error).message}`);
  }
}
