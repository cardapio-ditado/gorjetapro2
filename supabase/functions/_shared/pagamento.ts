/**
 * Camada de pagamento do Vale Ditado (paymentProvider).
 *
 * As edge functions só falam com esta interface: trocar de gateway (Mercado Pago → Asaas, por exemplo)
 * é escrever outra implementação aqui, sem mexer em pedido, webhook ou tela.
 *
 * Chaves só em Supabase secrets (nunca no front nem no banco):
 *   MP_ACCESS_TOKEN   — TEST-... no teste, APP_USR-... em produção
 *   MP_WEBHOOK_SECRET — assinatura secreta do webhook (painel do Mercado Pago)
 */

export type StatusPagamento = "aprovado" | "pendente" | "recusado" | "cancelado" | "estornado";

export interface PedidoCobranca {
  pedidoId: string;
  token: string;
  valor: number;
  descricao: string;
  nome: string;
  cpf: string;
  email: string | null;
  expiraEm: Date;
}

export interface CobrancaPix {
  cobrancaId: string;
  pixCopiaCola: string;
  expiraEm: string | null;
}

export interface CobrancaCartao {
  cobrancaId: string;
  url: string;
}

export interface Pagamento {
  id: string;
  status: StatusPagamento;
  pedidoId: string | null;
  valor: number;
  pagoEm: string | null;
}

export interface PaymentProvider {
  nome: string;
  criarPix(p: PedidoCobranca): Promise<CobrancaPix>;
  criarCartao(p: PedidoCobranca): Promise<CobrancaCartao>;
  consultar(pagamentoId: string): Promise<Pagamento>;
  /** Último pagamento aprovado do pedido (o cartão volta com id de pagamento diferente da preferência). */
  aprovadoDoPedido(pedidoId: string): Promise<Pagamento | null>;
  estornar(pagamentoId: string, valor: number | null, chave: string): Promise<{ ok: boolean; id: string | null; resposta: string }>;
  /** Confere a assinatura do webhook. Devolve o id do pagamento avisado, ou null se não for aviso de pagamento. */
  lerWebhook(req: Request, corpo: string): Promise<{ valido: boolean; eventoId: string; pagamentoId: string | null; tipo: string }>;
}

const SITE = Deno.env.get("VALE_SITE_URL") ?? "https://www.ditado.org";
const WEBHOOK = `${Deno.env.get("SUPABASE_URL")}/functions/v1/vale-webhook`;

// ───────────────────────────── Mercado Pago ─────────────────────────────

class MercadoPago implements PaymentProvider {
  nome = "mercadopago";
  private base = "https://api.mercadopago.com";

  private get token(): string {
    const t = Deno.env.get("MP_ACCESS_TOKEN");
    if (!t) throw new Error("MP_ACCESS_TOKEN não configurado");
    return t;
  }

  private get producao(): boolean {
    return this.token.startsWith("APP_USR-");
  }

  private async chamar(metodo: string, caminho: string, corpo?: unknown, idempotencia?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
    if (idempotencia) headers["X-Idempotency-Key"] = idempotencia;
    const r = await fetch(`${this.base}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
    const texto = await r.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { /* resposta não-JSON */ }
    if (!r.ok) {
      const msg = json?.message ?? json?.error ?? texto.slice(0, 300);
      throw new Error(`Mercado Pago ${r.status}: ${msg}`);
    }
    return json;
  }

  private pagador(p: PedidoCobranca) {
    const partes = p.nome.trim().split(/\s+/);
    return {
      // O Mercado Pago exige e-mail no Pix; sem e-mail do cliente, vai um endereço da casa por pedido.
      email: p.email ?? `vale+${p.token.slice(0, 10).toLowerCase()}@ditado.org`,
      first_name: partes[0],
      last_name: partes.slice(1).join(" ") || partes[0],
      identification: { type: "CPF", number: p.cpf },
    };
  }

  async criarPix(p: PedidoCobranca): Promise<CobrancaPix> {
    const r = await this.chamar("POST", "/v1/payments", {
      transaction_amount: Number(p.valor.toFixed(2)),
      description: p.descricao,
      payment_method_id: "pix",
      payer: this.pagador(p),
      external_reference: p.pedidoId,
      notification_url: WEBHOOK,
      date_of_expiration: p.expiraEm.toISOString().replace("Z", "+00:00"),
      statement_descriptor: "DITADO",
    }, `pix-${p.pedidoId}`);
    const t = r?.point_of_interaction?.transaction_data;
    if (!t?.qr_code) throw new Error("Mercado Pago não devolveu o código Pix");
    return { cobrancaId: String(r.id), pixCopiaCola: t.qr_code, expiraEm: r.date_of_expiration ?? null };
  }

  async criarCartao(p: PedidoCobranca): Promise<CobrancaCartao> {
    const volta = `${SITE}/vale/c/${p.token}`;
    const r = await this.chamar("POST", "/checkout/preferences", {
      items: [{ id: p.pedidoId, title: p.descricao, quantity: 1, unit_price: Number(p.valor.toFixed(2)), currency_id: "BRL" }],
      payer: { email: p.email ?? undefined, name: this.pagador(p).first_name, surname: this.pagador(p).last_name,
               identification: { type: "CPF", number: p.cpf } },
      external_reference: p.pedidoId,
      notification_url: WEBHOOK,
      back_urls: { success: volta, pending: volta, failure: volta },
      auto_return: "approved",
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }, { id: "debit_card" }],
        installments: 1,
      },
      expires: true,
      expiration_date_to: p.expiraEm.toISOString().replace("Z", "+00:00"),
      statement_descriptor: "DITADO",
    }, `cartao-${p.pedidoId}`);
    const url = this.producao ? r.init_point : (r.sandbox_init_point ?? r.init_point);
    if (!url) throw new Error("Mercado Pago não devolveu o link do cartão");
    return { cobrancaId: String(r.id), url };
  }

  private converter(r: any): Pagamento {
    const mapa: Record<string, StatusPagamento> = {
      approved: "aprovado", authorized: "pendente", pending: "pendente", in_process: "pendente", in_mediation: "pendente",
      rejected: "recusado", cancelled: "cancelado", refunded: "estornado", charged_back: "estornado",
    };
    return {
      id: String(r.id),
      status: mapa[r.status] ?? "pendente",
      pedidoId: r.external_reference ?? null,
      valor: Number(r.transaction_amount ?? 0),
      pagoEm: r.date_approved ?? null,
    };
  }

  async consultar(pagamentoId: string): Promise<Pagamento> {
    return this.converter(await this.chamar("GET", `/v1/payments/${encodeURIComponent(pagamentoId)}`));
  }

  async aprovadoDoPedido(pedidoId: string): Promise<Pagamento | null> {
    const r = await this.chamar("GET",
      `/v1/payments/search?external_reference=${encodeURIComponent(pedidoId)}&sort=date_created&criteria=desc&limit=20`);
    const aprovado = (r?.results ?? []).find((x: any) => x.status === "approved");
    return aprovado ? this.converter(aprovado) : null;
  }

  async estornar(pagamentoId: string, valor: number | null, chave: string) {
    try {
      const r = await this.chamar("POST", `/v1/payments/${encodeURIComponent(pagamentoId)}/refunds`,
        valor === null ? {} : { amount: Number(valor.toFixed(2)) }, `estorno-${chave}`);
      return { ok: true, id: r?.id ? String(r.id) : null, resposta: JSON.stringify(r).slice(0, 1000) };
    } catch (e) {
      return { ok: false, id: null, resposta: String((e as Error).message) };
    }
  }

  /**
   * Assinatura do Mercado Pago: header x-signature "ts=...,v1=..." com HMAC-SHA256 (hex) do manifesto
   * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, onde data.id vem da query string.
   */
  async lerWebhook(req: Request, corpo: string) {
    const url = new URL(req.url);
    let json: any = {};
    try { json = JSON.parse(corpo || "{}"); } catch { /* corpo vazio */ }
    const tipo = String(json?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
    const dataIdBruto = url.searchParams.get("data.id") ?? json?.data?.id ?? url.searchParams.get("id");
    const dataId = dataIdBruto ? String(dataIdBruto) : null;
    const eventoId = String(json?.id ?? `${tipo}:${dataId}:${json?.action ?? ""}:${req.headers.get("x-request-id") ?? ""}`);

    const segredo = Deno.env.get("MP_WEBHOOK_SECRET");
    const assinatura = req.headers.get("x-signature") ?? "";
    const pedidoId = req.headers.get("x-request-id") ?? "";
    const partes = Object.fromEntries(assinatura.split(",").map((p) => p.trim().split("=") as [string, string]));
    if (!segredo || !partes.ts || !partes.v1 || !dataId) return { valido: false, eventoId, pagamentoId: null, tipo };

    const idManifesto = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
    const manifesto = `id:${idManifesto};request-id:${pedidoId};ts:${partes.ts};`;
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto));
    const esperada = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    let dif = esperada.length === partes.v1.length ? 0 : 1;
    for (let i = 0; i < Math.min(esperada.length, partes.v1.length); i++) dif |= esperada.charCodeAt(i) ^ partes.v1.charCodeAt(i);
    const valido = dif === 0;
    return { valido, eventoId, pagamentoId: tipo === "payment" || tipo === "" ? dataId : null, tipo };
  }
}

export function provedor(): PaymentProvider {
  return new MercadoPago();
}

// ───────────────────────────── utilidades comuns ─────────────────────────────

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
