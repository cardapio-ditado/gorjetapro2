/**
 * Camada de pagamento do Vale Ditado (paymentProvider).
 *
 * As edge functions só falam com esta interface: trocar de gateway é escrever outra implementação aqui,
 * sem mexer em pedido, webhook ou tela. O gateway em uso vem do secret PAGAMENTO_GATEWAY
 * ("pagbank", o padrão, ou "mercadopago").
 *
 * Chaves só em Supabase secrets (nunca no front nem no banco):
 *   PagBank:      PAGBANK_TOKEN, PAGBANK_AMBIENTE ("sandbox" ou "producao")
 *   Mercado Pago: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET
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
  /** Pagamento aprovado da cobrança (Pix: a ordem/pagamento; cartão: o checkout), ou o último estado dela. */
  consultarCobranca(c: { cobrancaId: string; pedidoId: string; forma: "pix" | "cartao" }): Promise<Pagamento | null>;
  /** O pagamento que o aviso do webhook menciona, consultado no gateway (o corpo do aviso não é confiável). */
  pagamentoDoAviso(idAviso: string): Promise<Pagamento | null>;
  estornar(pagamentoId: string, valor: number | null, chave: string): Promise<{ ok: boolean; id: string | null; resposta: string }>;
  /** Confere a autenticidade do webhook e devolve o id que deve ser consultado. */
  lerWebhook(req: Request, corpo: string): Promise<{ valido: boolean; eventoId: string; idAviso: string | null; tipo: string }>;
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

  async consultarCobranca(c: { cobrancaId: string; pedidoId: string; forma: "pix" | "cartao" }) {
    if (c.forma === "pix") return this.consultar(c.cobrancaId);
    const r = await this.chamar("GET",
      `/v1/payments/search?external_reference=${encodeURIComponent(c.pedidoId)}&sort=date_created&criteria=desc&limit=20`);
    const aprovado = (r?.results ?? []).find((x: any) => x.status === "approved");
    return aprovado ? this.converter(aprovado) : null;
  }

  async pagamentoDoAviso(idAviso: string) {
    try { return await this.consultar(idAviso); }
    catch (e) { if (/Mercado Pago 404/.test((e as Error).message)) return null; throw e; }
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
    if (!segredo || !partes.ts || !partes.v1 || !dataId) return { valido: false, eventoId, idAviso: null, tipo };

    const idManifesto = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
    const manifesto = `id:${idManifesto};request-id:${pedidoId};ts:${partes.ts};`;
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto));
    const esperada = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    let dif = esperada.length === partes.v1.length ? 0 : 1;
    for (let i = 0; i < Math.min(esperada.length, partes.v1.length); i++) dif |= esperada.charCodeAt(i) ^ partes.v1.charCodeAt(i);
    const valido = dif === 0;
    return { valido, eventoId, idAviso: tipo === "payment" || tipo === "" ? dataId : null, tipo };
  }
}


// ───────────────────────────── PagBank (PagSeguro) ─────────────────────────────

class PagBank implements PaymentProvider {
  nome = "pagbank";

  private get token(): string {
    const t = Deno.env.get("PAGBANK_TOKEN");
    if (!t) throw new Error("PAGBANK_TOKEN não configurado");
    return t;
  }

  private get base(): string {
    return (Deno.env.get("PAGBANK_AMBIENTE") ?? "sandbox") === "producao"
      ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
  }

  private async chamar(metodo: string, caminho: string, corpo?: unknown, idempotencia?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", accept: "application/json" };
    if (idempotencia) headers["x-idempotency-key"] = idempotencia;
    const r = await fetch(`${this.base}${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
    const texto = await r.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { /* resposta não-JSON */ }
    if (!r.ok) {
      const det = json?.error_messages?.map((m: any) => `${m.code ?? ""} ${m.description ?? ""} ${m.parameter_name ?? ""}`.trim()).join("; ");
      throw new Error(`PagBank ${r.status}: ${det || texto.slice(0, 300)}`);
    }
    return json;
  }

  private cliente(p: PedidoCobranca) {
    return {
      name: p.nome,
      // o PagBank exige e-mail; sem e-mail do cliente, vai um endereço da casa por pedido
      email: p.email ?? `vale+${p.token.slice(0, 10).toLowerCase()}@ditado.org`,
      tax_id: p.cpf,
    };
  }

  private centavos(v: number) {
    return Math.round(v * 100);
  }

  /** Data no formato que o PagBank aceita: 2026-11-27T20:30:00-03:00 (sem milissegundos). */
  private data(d: Date) {
    const local = new Date(d.getTime() - 4 * 3600_000);
    return local.toISOString().slice(0, 19) + "-04:00";
  }

  async criarPix(p: PedidoCobranca): Promise<CobrancaPix> {
    const r = await this.chamar("POST", "/orders", {
      reference_id: p.pedidoId,
      customer: this.cliente(p),
      items: [{ reference_id: "vale", name: p.descricao, quantity: 1, unit_amount: this.centavos(p.valor) }],
      qr_codes: [{ amount: { value: this.centavos(p.valor) }, expiration_date: this.data(p.expiraEm) }],
      notification_urls: [WEBHOOK],
    }, `pix-${p.pedidoId}`);
    const qr = r?.qr_codes?.[0];
    if (!qr?.text) throw new Error("PagBank não devolveu o código Pix");
    return { cobrancaId: String(r.id), pixCopiaCola: qr.text, expiraEm: qr.expiration_date ?? null };
  }

  async criarCartao(p: PedidoCobranca): Promise<CobrancaCartao> {
    const volta = `${SITE}/vale/c/${p.token}`;
    const r = await this.chamar("POST", "/checkouts", {
      reference_id: p.pedidoId,
      customer: this.cliente(p),
      customer_modifiable: true,
      items: [{ reference_id: "vale", name: p.descricao, quantity: 1, unit_amount: this.centavos(p.valor) }],
      payment_methods: [{ type: "CREDIT_CARD" }],
      payment_methods_configs: [{ type: "CREDIT_CARD", config_options: [{ option: "INSTALLMENTS_LIMIT", value: "1" }] }],
      expiration_date: this.data(p.expiraEm),
      redirect_url: volta,
      return_url: volta,
      notification_urls: [WEBHOOK],
      payment_notification_urls: [WEBHOOK],
    }, `cartao-${p.pedidoId}`);
    const url = (r?.links ?? []).find((l: any) => l.rel === "PAY")?.href;
    if (!url) throw new Error("PagBank não devolveu o link do cartão");
    return { cobrancaId: String(r.id), url };
  }

  /** Lê uma ordem e devolve a cobrança paga (ou a mais recente). */
  private daOrdem(o: any): Pagamento | null {
    const cobrancas: any[] = o?.charges ?? [];
    if (!o || cobrancas.length === 0) return null;
    const paga = cobrancas.find((c) => c.status === "PAID") ?? cobrancas[cobrancas.length - 1];
    const mapa: Record<string, StatusPagamento> = {
      PAID: "aprovado", AUTHORIZED: "pendente", IN_ANALYSIS: "pendente", WAITING: "pendente",
      DECLINED: "recusado", CANCELED: "cancelado",
    };
    return {
      id: String(paga.id),
      status: mapa[paga.status] ?? "pendente",
      pedidoId: o.reference_id ?? null,
      valor: Number(paga?.amount?.summary?.paid ?? paga?.amount?.value ?? 0) / 100,
      pagoEm: paga.paid_at ?? null,
    };
  }

  async consultarCobranca(c: { cobrancaId: string; pedidoId: string; forma: "pix" | "cartao" }) {
    if (c.forma === "pix") return this.daOrdem(await this.chamar("GET", `/orders/${encodeURIComponent(c.cobrancaId)}`));
    const ck = await this.chamar("GET", `/checkouts/${encodeURIComponent(c.cobrancaId)}`);
    for (const o of ck?.orders ?? []) {
      const pg = this.daOrdem(await this.chamar("GET", `/orders/${encodeURIComponent(o.id)}`));
      if (pg?.status === "aprovado") return pg;
    }
    return null;
  }

  async pagamentoDoAviso(idAviso: string) {
    try { return this.daOrdem(await this.chamar("GET", `/orders/${encodeURIComponent(idAviso)}`)); }
    catch (e) { if (/PagBank 404/.test((e as Error).message)) return null; throw e; }
  }

  async estornar(pagamentoId: string, valor: number | null, chave: string) {
    try {
      let v = valor;
      if (v === null) {
        const c = await this.chamar("GET", `/charges/${encodeURIComponent(pagamentoId)}`);
        v = Number(c?.amount?.value ?? 0) / 100;
      }
      const r = await this.chamar("POST", `/charges/${encodeURIComponent(pagamentoId)}/cancel`,
        { amount: { value: this.centavos(v) } }, `estorno-${chave}`);
      return { ok: true, id: r?.id ? String(r.id) : pagamentoId, resposta: JSON.stringify(r).slice(0, 1000) };
    } catch (e) {
      return { ok: false, id: null, resposta: String((e as Error).message) };
    }
  }

  /**
   * Autenticidade do PagBank: header x-authenticity-token = SHA-256 (hex) de `${token}-${corpo}`.
   * O aviso traz a ordem; o que vale é a consulta da ordem no PagBank.
   */
  async lerWebhook(req: Request, corpo: string) {
    let o: any = {};
    try { o = JSON.parse(corpo || "{}"); } catch { /* corpo inválido */ }
    const idAviso = typeof o?.id === "string" && o.id.startsWith("ORDE_") ? o.id : null;
    const cobranca = (o?.charges ?? []).map((c: any) => `${c.id}:${c.status}`).join(",");
    const eventoId = `${o?.id ?? "?"}:${cobranca}`;
    const recebido = (req.headers.get("x-authenticity-token") ?? "").toLowerCase();
    let token = "";
    try { token = this.token; } catch { return { valido: false, eventoId, idAviso: null, tipo: "order" }; }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${token}-${corpo}`));
    const esperado = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    let dif = esperado.length === recebido.length ? 0 : 1;
    for (let i = 0; i < Math.min(esperado.length, recebido.length); i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
    return { valido: dif === 0, eventoId, idAviso, tipo: "order" };
  }
}

export function provedor(): PaymentProvider {
  return (Deno.env.get("PAGAMENTO_GATEWAY") ?? "pagbank") === "mercadopago" ? new MercadoPago() : new PagBank();
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
