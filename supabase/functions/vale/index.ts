import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CORS, json } from "./pagamento.ts";
import { criarPedido } from "./criarPedido.ts";
import { webhook } from "./webhook.ts";
import { status } from "./status.ts";
import { estornar } from "./estornar.ts";

/**
 * Vale Ditado: uma função só, com quatro rotas (menos peças para publicar e manter).
 *   POST /vale/criar-pedido  público: valida e reserva o lote, cria a cobrança no gateway
 *   POST /vale/webhook       público: aviso do gateway (autenticidade conferida em pagamento.ts)
 *   POST /vale/status        público: "Já paguei" (pergunta ao gateway se o pedido pendente foi pago)
 *   POST /vale/estornar      exige login de gerente: o banco confere a permissão com o token de quem chamou
 * verify_jwt = false porque cliente e gateway chamam sem login; cada rota faz a própria checagem.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const rota = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  switch (rota) {
    case "criar-pedido": return criarPedido(req);
    case "webhook": return webhook(req);
    case "status": return status(req);
    case "estornar": return estornar(req);
    default: return json({ ok: false, erro: "rota" }, 404);
  }
});
