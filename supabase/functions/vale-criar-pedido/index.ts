import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, provedor } from "../_shared/pagamento.ts";

/**
 * Vale Ditado: cria o pedido da página pública (ditado.org/vale).
 *
 * 1. fn_vale_reservar valida tudo de novo no servidor (CPF, idade, álcool, limite por CPF, lote) e reserva o lote
 *    por 30 minutos, numa transação com o produto travado. Nada do preço vem do navegador.
 * 2. Cria a cobrança no gateway (Pix com copia-e-cola ou o checkout do cartão).
 * 3. Se o gateway falhar, o pedido é cancelado e o lote volta na hora.
 *
 * Pública (verify_jwt = false): quem chama é o cliente, sem login. Só escreve por funções do banco.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);

  let p: any;
  try { p = await req.json(); } catch { return json({ ok: false, erro: "corpo" }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const forma = p?.forma_pagamento === "cartao" ? "cartao" : "pix";

  const { data: r, error } = await db.rpc("fn_vale_reservar", {
    p: { ...p, forma_pagamento: forma, user_agent: req.headers.get("user-agent") ?? "" },
  });
  if (error) {
    console.error("[vale] reservar:", error.message);
    return json({ ok: false, erro: "interno" }, 500);
  }
  if (!r?.ok) return json(r);

  const gw = provedor();
  const cobranca = {
    pedidoId: r.pedido_id, token: r.token, valor: Number(r.valor_total),
    descricao: "Vale Ditado", nome: r.nome, cpf: r.cpf, email: r.email ?? null,
    expiraEm: new Date(r.reserva_expira_em),
  };

  try {
    if (forma === "pix") {
      const c = await gw.criarPix(cobranca);
      await db.rpc("fn_vale_cobranca_gravar", { p_pedido: r.pedido_id, p: {
        gateway: gw.nome, cobranca_id: c.cobrancaId, pix_copia_cola: c.pixCopiaCola, pix_expira_em: c.expiraEm,
      } });
    } else {
      const c = await gw.criarCartao(cobranca);
      await db.rpc("fn_vale_cobranca_gravar", { p_pedido: r.pedido_id, p: {
        gateway: gw.nome, cobranca_id: c.cobrancaId, url: c.url,
      } });
    }
  } catch (e) {
    console.error(`[vale] gateway falhou no pedido ${r.pedido_id}: ${(e as Error).message}`);
    await db.rpc("fn_vale_encerrar_pedido", { p_pedido: r.pedido_id, p_status: "cancelado" });
    return json({ ok: false, erro: "pagamento" });
  }

  return json({ ok: true, token: r.token });
});
