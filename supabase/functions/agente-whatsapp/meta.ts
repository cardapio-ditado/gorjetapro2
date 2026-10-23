/**
 * Canal oficial: WhatsApp Cloud API da Meta.
 *
 * A Meta entrega cada mensagem por webhook (POST ?acao=meta) e a resposta sai
 * pela Graph API. Sem VPS, sem QR, sem risco de bloqueio.
 *
 * Secrets (Edge Functions → Secrets), colocados pelo dono:
 *   META_WA_TOKEN      token permanente do usuário do sistema
 *   META_APP_SECRET    chave secreta do app da Meta (confere a assinatura)
 *   META_VERIFY_TOKEN  senha inventada, para a Meta validar o webhook
 * Não secretos, em agente_config (tela WhatsApp do estoque):
 *   meta_phone_number_id, meta_waba_id, canal ('ponte' | 'meta')
 *
 * Janela de 24 h: a Meta só aceita texto livre para quem escreveu nas últimas
 * 24 h. Fora disso vai o modelo aprovado "aviso_estoque" com o botão "Ver";
 * as mensagens ficam em aguardando_janela e saem assim que a pessoa responde.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const VERSAO = "v21.0";
const MIDIA_MAX = 15 * 1024 * 1024;
const TEXTO_MAX = 4000;
const TENTATIVAS = 4;
export const MODELO_AVISO = "aviso_estoque";
/** Um aviso por pessoa a cada 12 h, enquanto ela não abre a janela. */
const INTERVALO_AVISO_MS = 12 * 3600 * 1000;

type ErroMeta = { code?: number; message?: string; error_subcode?: number; error_data?: { details?: string } };
type Resposta<T> = T & { error?: ErroMeta };

export interface ConfigMeta {
  token: string;
  phoneId: string;
  wabaId: string;
}

export async function configMeta(db: SupabaseClient): Promise<Partial<ConfigMeta> & { canal: string }> {
  const { data } = await db.from("agente_config").select("chave, valor")
    .in("chave", ["canal", "meta_phone_number_id", "meta_waba_id"]);
  const v = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]));
  return {
    canal: typeof v.canal === "string" ? v.canal : "ponte",
    token: Deno.env.get("META_WA_TOKEN") ?? undefined,
    phoneId: typeof v.meta_phone_number_id === "string" ? v.meta_phone_number_id : undefined,
    wabaId: typeof v.meta_waba_id === "string" ? v.meta_waba_id : undefined,
  };
}

function completa(c: Partial<ConfigMeta>): c is ConfigMeta {
  return Boolean(c.token && c.phoneId && c.wabaId);
}

async function graph<T>(caminho: string, token: string, metodo: "GET" | "POST" = "GET", corpo?: unknown): Promise<Resposta<T>> {
  const r = await fetch(`https://graph.facebook.com/${VERSAO}/${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  return ((await r.json().catch(() => ({}))) ?? {}) as Resposta<T>;
}

export function textoDoErro(e?: ErroMeta): string {
  if (!e) return "erro desconhecido da Meta";
  return [e.code, e.message, e.error_data?.details].filter(Boolean).join(" · ");
}

// ─── Webhook ────────────────────────────────────────────────────────────────

export function desafio(url: URL): Response {
  const esperado = Deno.env.get("META_VERIFY_TOKEN");
  if (esperado && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === esperado) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("não autorizado", { status: 403 });
}

export async function assinaturaValida(corpo: string, cabecalho: string | null): Promise<boolean> {
  const segredo = Deno.env.get("META_APP_SECRET");
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const hex = Array.from(assinatura, (b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice(7);
  if (recebido.length !== hex.length) return false;
  let d = 0;
  for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ recebido.charCodeAt(i);
  return d === 0;
}

interface MensagemMeta {
  id: string;
  from: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

interface StatusMeta {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: ErroMeta[];
}

export interface Recebida {
  waId: string;
  telefone: string;
  tipo: "texto" | "imagem" | "audio" | "documento";
  texto?: string;
  midiaId?: string;
  mime?: string;
  /** Toque no botão "Ver" do aviso: só abre a janela, não vai para o agente. */
  abreJanela: boolean;
  /** Tipo que o agente não lê (figurinha, localização...). */
  naoSuportado?: string;
}

export function lerWebhook(corpo: unknown): { recebidas: Recebida[]; status: StatusMeta[] } {
  const recebidas: Recebida[] = [];
  const status: StatusMeta[] = [];
  const entradas = (corpo as { entry?: { changes?: { value?: { messages?: MensagemMeta[]; statuses?: StatusMeta[] } }[] }[] })?.entry ?? [];
  for (const e of entradas) {
    for (const c of e.changes ?? []) {
      for (const s of c.value?.statuses ?? []) status.push(s);
      for (const m of c.value?.messages ?? []) {
        const base = { waId: m.id, telefone: m.from, abreJanela: false };
        if (m.type === "text") recebidas.push({ ...base, tipo: "texto", texto: m.text?.body });
        else if (m.type === "image" && m.image) recebidas.push({ ...base, tipo: "imagem", texto: m.image.caption, midiaId: m.image.id, mime: m.image.mime_type });
        else if (m.type === "document" && m.document) recebidas.push({ ...base, tipo: "documento", texto: m.document.caption, midiaId: m.document.id, mime: m.document.mime_type });
        else if (m.type === "audio" && m.audio) recebidas.push({ ...base, tipo: "audio", midiaId: m.audio.id, mime: m.audio.mime_type });
        else if (m.type === "button") recebidas.push({ ...base, tipo: "texto", texto: m.button?.text, abreJanela: true });
        else if (m.type === "interactive") {
          recebidas.push({ ...base, tipo: "texto", texto: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title });
        } else recebidas.push({ ...base, tipo: "texto", naoSuportado: m.type });
      }
    }
  }
  return { recebidas, status };
}

/** Baixa a mídia da mensagem (a Meta entrega só o ID). */
export async function baixarMidia(token: string, midiaId: string): Promise<{ base64: string; mime: string } | null> {
  const info = await graph<{ url?: string; mime_type?: string; file_size?: number }>(midiaId, token);
  if (!info.url || (info.file_size ?? 0) > MIDIA_MAX) return null;
  const r = await fetch(info.url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(bin), mime: (info.mime_type ?? "").split(";")[0].trim() };
}

/** Marca como lida e mostra "digitando…" enquanto o agente pensa. */
export async function marcarLida(c: ConfigMeta, waId: string): Promise<void> {
  await graph(`${c.phoneId}/messages`, c.token, "POST", {
    messaging_product: "whatsapp", status: "read", message_id: waId, typing_indicator: { type: "text" },
  }).catch(() => {});
}

export async function gravarStatus(db: SupabaseClient, lista: StatusMeta[]): Promise<void> {
  const nome: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };
  for (const s of lista) {
    const mudanca: Record<string, unknown> = { entrega: nome[s.status] ?? s.status, entrega_em: new Date().toISOString() };
    if (s.status === "failed") mudanca.erro = textoDoErro(s.errors?.[0]);
    // Lida não volta para entregue se os avisos chegarem fora de ordem.
    let q = db.from("agente_mensagens").update(mudanca).eq("wa_id", s.id);
    if (s.status === "delivered") q = q.neq("entrega", "lida");
    if (s.status === "sent") q = q.is("entrega", null);
    await q;
  }
}

// ─── Envio ──────────────────────────────────────────────────────────────────

function partes(texto: string): string[] {
  if (texto.length <= TEXTO_MAX) return [texto];
  const saida: string[] = [];
  let resto = texto;
  while (resto.length > TEXTO_MAX) {
    let corte = resto.lastIndexOf("\n", TEXTO_MAX);
    if (corte < TEXTO_MAX / 2) corte = TEXTO_MAX;
    saida.push(resto.slice(0, corte));
    resto = resto.slice(corte).replace(/^\n+/, "");
  }
  if (resto) saida.push(resto);
  return saida;
}

/** Primeira linha, sem formatação, curta: é o que vai no aviso fora da janela. */
export function previa(texto: string): string {
  const linha = (texto.split("\n").find((l) => l.trim()) ?? "mensagem nova")
    .replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  return linha.length > 60 ? `${linha.slice(0, 57)}…` : linha;
}

export async function enviarTexto(c: ConfigMeta, para: string, texto: string): Promise<Resposta<{ messages?: { id: string }[] }>> {
  let ultima: Resposta<{ messages?: { id: string }[] }> = {};
  for (const p of partes(texto)) {
    ultima = await graph(`${c.phoneId}/messages`, c.token, "POST", {
      messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text",
      text: { body: p, preview_url: false },
    });
    if (ultima.error) return ultima;
  }
  return ultima;
}

async function enviarAviso(c: ConfigMeta, para: string, resumo: string): Promise<Resposta<{ messages?: { id: string }[] }>> {
  return await graph(`${c.phoneId}/messages`, c.token, "POST", {
    messaging_product: "whatsapp", to: para, type: "template",
    template: {
      name: MODELO_AVISO, language: { code: "pt_BR" },
      components: [{ type: "body", parameters: [{ type: "text", text: resumo }] }],
    },
  });
}

/** Erros da Meta que querem dizer "fora da janela de 24 h". */
function foraDaJanela(e?: ErroMeta): boolean {
  return e?.code === 131047 || e?.code === 131026 && /window|janela|24/i.test(e.message ?? "");
}

async function ultimaEntrada(db: SupabaseClient, equipeId: string): Promise<number> {
  const { data } = await db.from("agente_mensagens").select("criado_em")
    .eq("equipe_id", equipeId).eq("direcao", "entrada").like("wa_id", "wamid.%")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  return data ? new Date(data.criado_em).getTime() : 0;
}

async function ultimoAviso(db: SupabaseClient, equipeId: string): Promise<number> {
  const { data } = await db.from("agente_mensagens").select("criado_em")
    .eq("equipe_id", equipeId).eq("direcao", "saida").eq("tipo", "texto").not("uso->>aviso", "is", null)
    .order("id", { ascending: false }).limit(1).maybeSingle();
  return data ? new Date(data.criado_em).getTime() : 0;
}

interface Pendente { id: number; equipe_id: string | null; telefone: string | null; texto: string | null; tentativas: number }

/**
 * Envia tudo o que está na fila pela Meta. Cada mensagem é "reservada"
 * (status enviando) antes de sair, para duas execuções ao mesmo tempo não
 * mandarem a mesma coisa duas vezes.
 */
export async function enviarPendentes(db: SupabaseClient): Promise<{ enviadas: number; aguardando: number; falhas: number }> {
  const c = await configMeta(db);
  const placar = { enviadas: 0, aguardando: 0, falhas: 0 };
  if (c.canal !== "meta" || !completa(c)) return placar;

  const cincoMin = new Date(Date.now() - 5 * 60_000).toISOString();
  await db.from("agente_mensagens").update({ status: "pendente_envio" })
    .eq("direcao", "saida").eq("status", "enviando").lt("processado_em", cincoMin);

  const umMinuto = new Date(Date.now() - 60_000).toISOString();
  const { data: fila } = await db.from("agente_mensagens").select("id")
    .eq("direcao", "saida").eq("status", "pendente_envio")
    .or(`processado_em.is.null,processado_em.lt.${umMinuto}`)
    .order("id").limit(30);

  const avisadosAgora = new Set<string>();
  for (const { id } of fila ?? []) {
    const { data: m } = await db.from("agente_mensagens")
      .update({ status: "enviando", processado_em: new Date().toISOString() })
      .eq("id", id).eq("status", "pendente_envio")
      .select("id, equipe_id, telefone, texto, tentativas").maybeSingle();
    if (!m) continue;
    const msg = m as Pendente;
    if (!msg.telefone || !msg.texto) {
      await db.from("agente_mensagens").update({ status: "falha_envio", erro: "sem telefone ou texto" }).eq("id", msg.id);
      placar.falhas++;
      continue;
    }

    const janelaAberta = msg.equipe_id ? Date.now() - (await ultimaEntrada(db, msg.equipe_id)) < 24 * 3600 * 1000 : false;
    let r = janelaAberta ? await enviarTexto(c, msg.telefone, msg.texto) : null;

    if (!r || foraDaJanela(r.error)) {
      // Fora da janela: a mensagem espera, e a pessoa recebe o aviso (no
      // máximo um a cada 12 h) para tocar em "Ver".
      await db.from("agente_mensagens").update({ status: "aguardando_janela", erro: null }).eq("id", msg.id);
      placar.aguardando++;
      if (msg.equipe_id && !avisadosAgora.has(msg.equipe_id) &&
          Date.now() - (await ultimoAviso(db, msg.equipe_id)) > INTERVALO_AVISO_MS) {
        avisadosAgora.add(msg.equipe_id);
        const resumo = previa(msg.texto);
        const a = await enviarAviso(c, msg.telefone, resumo);
        await db.from("agente_mensagens").insert({
          equipe_id: msg.equipe_id, telefone: msg.telefone, direcao: "saida", tipo: "texto",
          texto: `📨 Aviso enviado: ${resumo}. Toque em Ver para abrir.`,
          status: a.error ? "falha_envio" : "enviada", erro: a.error ? textoDoErro(a.error) : null,
          wa_id: a.messages?.[0]?.id ?? null, uso: { aviso: MODELO_AVISO }, processado_em: new Date().toISOString(),
        });
      }
      continue;
    }

    if (r.error) {
      const tentativas = (msg.tentativas ?? 0) + 1;
      await db.from("agente_mensagens").update({
        status: tentativas >= TENTATIVAS ? "falha_envio" : "pendente_envio",
        tentativas, erro: textoDoErro(r.error), processado_em: new Date().toISOString(),
      }).eq("id", msg.id);
      placar.falhas++;
      continue;
    }

    await db.from("agente_mensagens").update({
      status: "enviada", wa_id: r.messages?.[0]?.id ?? null, entrega: "enviada", erro: null,
      processado_em: new Date().toISOString(),
    }).eq("id", msg.id);
    placar.enviadas++;
  }
  return placar;
}

/** A pessoa escreveu: o que esperava a janela volta para a fila. */
export async function liberarJanela(db: SupabaseClient, equipeId: string): Promise<void> {
  await db.from("agente_mensagens").update({ status: "pendente_envio", processado_em: null })
    .eq("equipe_id", equipeId).eq("direcao", "saida").eq("status", "aguardando_janela");
}

// ─── Painel ─────────────────────────────────────────────────────────────────

/**
 * Registra o número na Cloud API (sem isso ele fica "pendente" e quem manda
 * mensagem vê "não está no WhatsApp"), liga a conta do WhatsApp do estoque ao
 * app e aponta o webhook dela para esta função (override por conta): o app
 * continua servindo o Brasa sem mudança nenhuma.
 */
export async function conectar(db: SupabaseClient, urlWebhook: string): Promise<Record<string, unknown>> {
  const c = await configMeta(db);
  if (!completa(c)) throw new Error("Falta o token (secret META_WA_TOKEN) ou os IDs do telefone e da conta.");
  const verify = Deno.env.get("META_VERIFY_TOKEN");
  if (!verify || !Deno.env.get("META_APP_SECRET")) throw new Error("Faltam os secrets META_VERIFY_TOKEN e META_APP_SECRET.");

  let registrado = false;
  const tel = await graph<{ status?: string }>(`${c.phoneId}?fields=status`, c.token);
  if (tel.error) throw new Error(`Meta: ${textoDoErro(tel.error)}`);
  if (tel.status !== "CONNECTED") {
    // O PIN vira a confirmação em duas etapas do número.
    const pin = Deno.env.get("META_WA_PIN")?.trim() ?? "";
    if (!/^\d{6}$/.test(pin)) throw new Error("Falta o secret META_WA_PIN (6 números) para registrar o número.");
    const reg = await graph<{ success?: boolean }>(`${c.phoneId}/register`, c.token, "POST", { messaging_product: "whatsapp", pin });
    if (reg.error) throw new Error(`Meta, ao registrar o número: ${textoDoErro(reg.error)}`);
    registrado = reg.success === true;
  }

  const r = await graph<{ success?: boolean }>(`${c.wabaId}/subscribed_apps`, c.token, "POST", {
    override_callback_uri: urlWebhook, verify_token: verify,
  });
  if (r.error) throw new Error(`Meta: ${textoDoErro(r.error)}`);
  return { registrado, inscrita: r.success === true };
}

export async function criarModelo(db: SupabaseClient): Promise<Record<string, unknown>> {
  const c = await configMeta(db);
  if (!completa(c)) throw new Error("Falta o token ou os IDs do telefone e da conta.");
  const r = await graph<{ id?: string; status?: string; category?: string }>(`${c.wabaId}/message_templates`, c.token, "POST", {
    name: MODELO_AVISO, language: "pt_BR", category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Assistente de estoque do Ditado Popular: {{1}}. Toque em Ver para abrir a mensagem.",
        example: { body_text: [["relatório do estoque de terça 21/10"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ver" }] },
    ],
  });
  if (r.error) throw new Error(`Meta: ${textoDoErro(r.error)}`);
  return { id: r.id, status: r.status, categoria: r.category };
}

export async function situacao(db: SupabaseClient): Promise<Record<string, unknown>> {
  const c = await configMeta(db);
  const base = {
    canal: c.canal,
    secrets: {
      token: Boolean(c.token), app_secret: Boolean(Deno.env.get("META_APP_SECRET")),
      verify_token: Boolean(Deno.env.get("META_VERIFY_TOKEN")),
      pin: /^\d{6}$/.test(Deno.env.get("META_WA_PIN")?.trim() ?? ""),
    },
    phone_number_id: c.phoneId ?? null, waba_id: c.wabaId ?? null,
  };
  if (!completa(c)) return base;
  const [tel, modelos] = await Promise.all([
    graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; name_status?: string; status?: string }>(
      `${c.phoneId}?fields=display_phone_number,verified_name,quality_rating,name_status,status`, c.token),
    graph<{ data?: { name: string; status: string; category: string }[] }>(
      `${c.wabaId}/message_templates?fields=name,status,category&name=${MODELO_AVISO}`, c.token),
  ]);
  return {
    ...base,
    erro: tel.error ? textoDoErro(tel.error) : modelos.error ? textoDoErro(modelos.error) : null,
    telefone: tel.display_phone_number ?? null,
    nome: tel.verified_name ?? null,
    nome_status: tel.name_status ?? null,
    qualidade: tel.quality_rating ?? null,
    status_numero: tel.status ?? null,
    modelo: modelos.data?.find((m) => m.name === MODELO_AVISO) ?? null,
  };
}
