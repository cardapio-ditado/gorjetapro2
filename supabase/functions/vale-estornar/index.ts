import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, provedor } from "../_shared/pagamento.ts";

/**
 * Vale Ditado: estorno pelo admin (gerente/master).
 *
 * 1. fn_vale_estorno_preparar roda com o login de quem pediu: confere a permissão e calcula o valor
 *    (vale sem uso = integral; usado = proporcional ao que falta).
 * 2. O gateway devolve o dinheiro.
 * 3. fn_vale_estorno_concluir marca os vales como estornados (e devolve o lote do que não foi usado).
 *
 * Exige login (verify_jwt = true). Entrada: { pedido_id, codigos?: uuid[], motivo? }.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let p: any;
  try { p = await req.json(); } catch { return json({ ok: false, erro: "corpo" }, 400); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: prep, error } = await comoUsuario.rpc("fn_vale_estorno_preparar", {
    p_pedido: p?.pedido_id, p_codigos: p?.codigos ?? null, p_motivo: p?.motivo ?? null,
  });
  if (error) return json({ ok: false, erro: error.message }, 400);
  if (!prep?.pagamento_id) return json({ ok: false, erro: "pedido sem pagamento no gateway" }, 400);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const r = await provedor().estornar(String(prep.pagamento_id), prep.integral ? null : Number(prep.valor), String(prep.estorno_id));
  await db.rpc("fn_vale_estorno_concluir", { p_estorno: prep.estorno_id, p_ok: r.ok, p_gateway_id: r.id, p_resposta: r.resposta });
  if (!r.ok) return json({ ok: false, erro: `o gateway recusou o estorno: ${r.resposta}` }, 502);
  return json({ ok: true, valor: prep.valor });
});
