import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, provedor } from "../_shared/pagamento.ts";

/**
 * Vale Ditado: "Já paguei" e a volta do app do banco. Pergunta direto ao gateway se o pedido pendente foi pago
 * (cobre o caso do webhook atrasar) e devolve o pedido como o comprovante mostra (sem CPF).
 * A página consulta o próprio banco a cada poucos segundos; esta função só é chamada quando o cliente pede
 * ou volta para a tela, para não martelar o gateway.
 *
 * Pública (verify_jwt = false). Entrada: { token }.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let token = "";
  try { token = String((await req.json())?.token ?? ""); } catch { /* sem corpo */ }
  if (token.length < 16) return json({ ok: false, erro: "token" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: interno } = await db.rpc("fn_vale_pedido_interno", { p_token: token });

  if (interno && ["pendente", "expirado", "cancelado"].includes(interno.status) && interno.gateway_cobranca_id) {
    try {
      const gw = provedor();
      const pg = await gw.consultarCobranca({
        cobrancaId: interno.gateway_cobranca_id, pedidoId: interno.id, forma: interno.forma_pagamento,
      });
      if (pg && pg.status === "aprovado") {
        await db.rpc("fn_vale_confirmar_pagamento", {
          p_pedido: interno.id, p_pagamento: pg.id, p_pago_em: pg.pagoEm ?? new Date().toISOString(), p_valor: pg.valor,
        });
      }
    } catch (e) {
      console.error(`[vale] status ${interno.id}: ${(e as Error).message}`);
    }
  }

  const { data } = await db.rpc("fn_vale_pedido_publico", { p_token: token });
  if (!data) return json({ ok: false, erro: "nao_encontrado" }, 404);
  return json({ ok: true, pedido: data });
});
