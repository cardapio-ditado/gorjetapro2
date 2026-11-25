import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, provedor } from "../_shared/pagamento.ts";

/**
 * Vale Ditado: aviso de pagamento do gateway.
 *
 * - Sem assinatura válida, nada acontece (401).
 * - Cada aviso é gravado uma vez em vale_webhook_eventos (evento repetido sai com 200 sem reprocessar).
 * - O corpo do aviso não é confiável: o pagamento é consultado no gateway, e só "aprovado" gera os vales.
 * - fn_vale_confirmar_pagamento é idempotente: dois avisos do mesmo pagamento não geram vale duplicado.
 *
 * Pública (verify_jwt = false). 5xx faz o gateway tentar de novo; 2xx encerra.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const corpo = await req.text();
  const gw = provedor();
  const aviso = await gw.lerWebhook(req, corpo);
  if (!aviso.valido) return json({ ok: false, erro: "assinatura" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let payload: unknown = {};
  try { payload = JSON.parse(corpo || "{}"); } catch { payload = { bruto: corpo.slice(0, 2000) }; }

  const { data: novo, error: erroEv } = await db.from("vale_webhook_eventos")
    .upsert({ gateway: gw.nome, evento_id: aviso.eventoId, tipo: aviso.tipo, cobranca_id: aviso.pagamentoId, payload },
            { onConflict: "gateway,evento_id", ignoreDuplicates: true })
    .select("id");
  if (erroEv) {
    console.error("[vale] webhook gravar:", erroEv.message);
    return json({ ok: false }, 500);
  }
  if (!novo || novo.length === 0) return json({ ok: true, repetido: true });
  const eventoRow = novo[0].id;

  if (!aviso.pagamentoId) {
    await db.from("vale_webhook_eventos").update({ processado_em: new Date().toISOString(), resultado: "ignorado" }).eq("id", eventoRow);
    return json({ ok: true, ignorado: true });
  }

  let resultado = "";
  try {
    const pg = await gw.consultar(aviso.pagamentoId);
    if (pg.status === "aprovado" && pg.pedidoId) {
      const { data, error } = await db.rpc("fn_vale_confirmar_pagamento", {
        p_pedido: pg.pedidoId, p_pagamento: pg.id, p_pago_em: pg.pagoEm ?? new Date().toISOString(), p_valor: pg.valor,
      });
      if (error) throw new Error(error.message);
      resultado = JSON.stringify(data);
    } else {
      resultado = `status ${pg.status}`;
    }
  } catch (e) {
    if (/Mercado Pago 404/.test((e as Error).message)) {
      // aviso de teste do painel ou pagamento que não existe: nada a fazer, sem retentativa
      await db.from("vale_webhook_eventos").update({ processado_em: new Date().toISOString(), resultado: "pagamento não encontrado" }).eq("id", eventoRow);
      return json({ ok: true, ignorado: true });
    }
    // devolve 500 para o gateway tentar de novo, e libera o evento para o reprocessamento
    console.error(`[vale] webhook pagamento ${aviso.pagamentoId}: ${(e as Error).message}`);
    await db.from("vale_webhook_eventos").delete().eq("id", eventoRow);
    return json({ ok: false }, 500);
  }

  await db.from("vale_webhook_eventos").update({ processado_em: new Date().toISOString(), resultado: resultado.slice(0, 500) }).eq("id", eventoRow);
  return json({ ok: true });
});
