/**
 * Ponte entre o WhatsApp e o agente de estoque.
 *
 * Roda na VPS, conectada a um chip próprio pelo Baileys (WhatsApp Web, não
 * oficial). Não pensa nada: só leva a mensagem para a função agente-whatsapp
 * no Supabase e entrega o que a função deixou na fila de saída. Quem é quem,
 * o que cada um pode fazer e o que responder fica todo lá.
 *
 *   recebe mensagem  → POST ?acao=entrada
 *   a cada 2 s       → GET  ?acao=saida → envia → POST ?acao=confirmar
 */

import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const URL_AGENTE = process.env.AGENTE_URL;
const TOKEN = process.env.AGENTE_PONTE_TOKEN;
const PASTA_SESSAO = resolve(process.env.SESSAO_DIR ?? "./sessao");
const INTERVALO_SAIDA = 2000;
const MIDIA_MAX = 15 * 1024 * 1024;
// Com --parear, só mostra o QR, salva a sessão e sai. É o que o instalador usa.
const SO_PAREAR = process.argv.includes("--parear");

if (!URL_AGENTE || !TOKEN) {
  console.error("Defina AGENTE_URL e AGENTE_PONTE_TOKEN no arquivo .env (veja o README).");
  process.exit(1);
}

const logger = pino({ level: "warn" });
let socket = null;
let conectadoEm = 0;
let conectado = false;

async function chamar(acao, corpo) {
  const resp = await fetch(`${URL_AGENTE}?acao=${acao}`, {
    method: corpo ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-agente-token": TOKEN },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${acao}: HTTP ${resp.status} ${json.erro ?? ""}`.trim());
  return json;
}

// ─── Entrada ────────────────────────────────────────────────────────────────

function timestamp(valor) {
  if (typeof valor === "number") return valor;
  if (valor && typeof valor === "object" && "toNumber" in valor) return valor.toNumber();
  return 0;
}

/** Telefone só sai de jid de número de verdade. "@lid" é id interno. */
async function telefoneDe(key) {
  for (const jid of [key.remoteJid, key.remoteJidAlt, key.senderPn]) {
    if (jid?.endsWith("@s.whatsapp.net")) return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  }
  if (key.remoteJid?.endsWith("@lid")) {
    const pn = await socket?.signalRepository?.lidMapping?.getPNForLID?.(key.remoteJid).catch(() => null);
    if (pn) return String(pn).split("@")[0].split(":")[0].replace(/\D/g, "");
  }
  return null;
}

function conteudo(message) {
  if (!message) return null;
  const m = message.ephemeralMessage?.message ?? message.viewOnceMessage?.message ?? message;
  if (m.conversation) return { tipo: "texto", texto: m.conversation };
  if (m.extendedTextMessage) return { tipo: "texto", texto: m.extendedTextMessage.text };
  if (m.imageMessage) return { tipo: "imagem", texto: m.imageMessage.caption, mime: m.imageMessage.mimetype, tamanho: m.imageMessage.fileLength };
  if (m.documentMessage) return { tipo: "documento", texto: m.documentMessage.caption, mime: m.documentMessage.mimetype, tamanho: m.documentMessage.fileLength };
  if (m.documentWithCaptionMessage?.message?.documentMessage) {
    const d = m.documentWithCaptionMessage.message.documentMessage;
    return { tipo: "documento", texto: d.caption, mime: d.mimetype, tamanho: d.fileLength };
  }
  if (m.audioMessage) return { tipo: "audio" };
  return null;
}

async function aoReceber(msg) {
  const jid = msg.key.remoteJid;
  if (SO_PAREAR || !jid || msg.key.fromMe) return;
  // Só conversa direta: grupo, status, lista e canal ficam de fora.
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return;
  // Ao conectar, o WhatsApp reentrega mensagens antigas.
  if (timestamp(msg.messageTimestamp) * 1000 < conectadoEm - 5000) return;

  const c = conteudo(msg.message);
  if (!c) return;

  const telefone = await telefoneDe(msg.key);
  const entrada = { wa_id: msg.key.id, jid, telefone, tipo: c.tipo, texto: c.texto?.trim() || undefined };

  if ((c.tipo === "imagem" || c.tipo === "documento") && Number(c.tamanho ?? 0) <= MIDIA_MAX) {
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: socket.updateMediaMessage });
      entrada.midia = { base64: buffer.toString("base64"), mime: (c.mime ?? "").split(";")[0] };
    } catch (e) {
      console.error(`[ponte] não baixei a mídia de ${telefone ?? jid}:`, e.message);
    }
  }

  try {
    const r = await chamar("entrada", entrada);
    if (r.reconhecido) {
      console.log(`[ponte] ${telefone ?? jid} → ${c.tipo}${c.texto ? `: ${c.texto.slice(0, 60)}` : ""}`);
      await socket.readMessages([msg.key]).catch(() => {});
      await socket.sendPresenceUpdate("composing", jid).catch(() => {});
    } else if (!r.duplicada) {
      console.log(`[ponte] ignorado (não cadastrado): ${telefone ?? jid}`);
    }
  } catch (e) {
    console.error("[ponte] falha ao entregar mensagem ao agente:", e.message);
  }
}

// ─── Saída ──────────────────────────────────────────────────────────────────

/** Variações do número com e sem o nono dígito. */
function variacoes(telefone) {
  let d = String(telefone).replace(/\D/g, "");
  if (d.length <= 11) d = `55${d}`;
  const lista = [d];
  if (d.length === 13 && d[4] === "9") lista.push(d.slice(0, 4) + d.slice(5));
  if (d.length === 12) lista.push(`${d.slice(0, 4)}9${d.slice(4)}`);
  return lista;
}

const jidsConhecidos = new Map();

async function destinoDe(m) {
  if (m.jid) return m.jid;
  if (!m.telefone) return null;
  if (jidsConhecidos.has(m.telefone)) return jidsConhecidos.get(m.telefone);
  const achados = await socket.onWhatsApp(...variacoes(m.telefone)).catch(() => []);
  const jid = achados?.find((a) => a.exists)?.jid ?? null;
  if (jid) jidsConhecidos.set(m.telefone, jid);
  return jid;
}

let enviando = false;
async function entregarSaida() {
  if (enviando || !conectado) return;
  enviando = true;
  try {
    const { mensagens = [] } = await chamar("saida");
    if (!mensagens.length) return;
    const enviadas = [];
    const falhas = [];
    for (const m of mensagens) {
      try {
        const jid = await destinoDe(m);
        if (!jid) throw new Error("número não encontrado no WhatsApp");
        await socket.sendMessage(jid, { text: m.texto });
        await socket.sendPresenceUpdate("paused", jid).catch(() => {});
        enviadas.push(m.id);
        console.log(`[ponte] enviado para ${m.telefone ?? jid}`);
      } catch (e) {
        falhas.push({ id: m.id, erro: e.message });
        console.error(`[ponte] falha ao enviar ${m.id}:`, e.message);
      }
      // Ritmo de gente, não de robô.
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
    }
    await chamar("confirmar", { enviadas, falhas });
  } catch (e) {
    console.error("[ponte] fila de saída:", e.message);
  } finally {
    enviando = false;
  }
}

// ─── Conexão ────────────────────────────────────────────────────────────────

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  socket = makeWASocket({ auth: state, logger, markOnlineOnConnect: false, syncFullHistory: false });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\nEscaneie no celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      conectado = true;
      conectadoEm = Date.now();
      console.log(`[ponte] conectado como ${socket.user?.id?.split(":")[0] ?? "?"}`);
      if (SO_PAREAR) {
        console.log("[ponte] pareado. Sessão salva.");
        setTimeout(() => process.exit(0), 3000);
      }
    }
    if (connection === "close") {
      conectado = false;
      const codigo = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        console.warn("[ponte] o celular desconectou este aparelho. Apagando a sessão: vai pedir QR de novo.");
        await rm(PASTA_SESSAO, { recursive: true, force: true });
      } else {
        console.warn(`[ponte] conexão caiu (${codigo ?? "?"}). Reconectando…`);
      }
      setTimeout(() => void conectar(), 3000);
    }
  });

  socket.ev.on("messages.upsert", ({ type, messages }) => {
    if (type !== "notify") return;
    for (const m of messages) void aoReceber(m);
  });
}

try {
  await chamar("status");
} catch (e) {
  console.error("[ponte] não consegui falar com o agente. Confira AGENTE_URL e AGENTE_PONTE_TOKEN:", e.message);
  process.exit(1);
}
await conectar();
if (!SO_PAREAR) setInterval(() => void entregarSaida(), INTERVALO_SAIDA);
