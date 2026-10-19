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
 *   a cada 5 s       → POST ?acao=estado (como está, e o QR) ← comando da tela
 *
 * O QR e os botões ficam no sistema (Estoque Beta 2 → WhatsApp do estoque):
 * Gerar QR / Reconectar, Gerar código pelo número e Desconectar.
 */

import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import qrcode from "qrcode-terminal";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const URL_AGENTE = process.env.AGENTE_URL;
const TOKEN = process.env.AGENTE_PONTE_TOKEN;
const PASTA_SESSAO = resolve(process.env.SESSAO_DIR ?? "./sessao");
const VERSAO = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8")).version;
const INTERVALO_SAIDA = 2000;
const INTERVALO_SINAL = 5000;
const MIDIA_MAX = 15 * 1024 * 1024;
// O que chegou enquanto a ponte estava fora (reinício, queda) ainda é atendido
// se tiver até 15 minutos. Mais velho que isso é histórico, não pedido.
const IDADE_MAX = 15 * 60 * 1000;
// Com --parear, só mostra o QR, salva a sessão e sai. É o que o instalador usa.
const SO_PAREAR = process.argv.includes("--parear");
// Com --numero 5565..., em vez do QR mostra um código de 8 letras para digitar
// no celular ("Conectar com número de telefone"). Serve para parear pelo
// próprio celular do chip, onde não dá para escanear a tela.
// Pela tela, o número vem no comando "codigo".
const iNumero = process.argv.indexOf("--numero");
let numeroPareamento = iNumero > 0 ? String(process.argv[iNumero + 1] ?? "").replace(/\D/g, "") : "";

if (!URL_AGENTE || !TOKEN) {
  console.error("Defina AGENTE_URL e AGENTE_PONTE_TOKEN no arquivo .env (veja o README).");
  process.exit(1);
}

const logger = pino({ level: "warn" });
let socket = null;
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
  if (m.audioMessage) return { tipo: "audio", mime: m.audioMessage.mimetype, tamanho: m.audioMessage.fileLength };
  return null;
}

async function aoReceber(msg) {
  const jid = msg.key.remoteJid;
  if (SO_PAREAR || !jid || msg.key.fromMe) return;
  // Só conversa direta: grupo, status, lista e canal ficam de fora.
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return;
  const idade = Date.now() - timestamp(msg.messageTimestamp) * 1000;
  if (idade > IDADE_MAX) {
    console.log(`[ponte] descartada por ser antiga (${Math.round(idade / 60000)} min): ${jid}`);
    return;
  }

  const c = conteudo(msg.message);
  if (!c) {
    // Sem conteúdo costuma ser mensagem que o WhatsApp ainda não conseguiu
    // decifrar (comum logo depois de parear). Fica no log para investigar.
    const tipos = Object.keys(msg.message ?? {}).join(",") || `vazia, stub ${msg.messageStubType ?? "?"}`;
    console.log(`[ponte] mensagem sem conteúdo legível de ${jid} (${tipos})`);
    return;
  }

  const telefone = await telefoneDe(msg.key);
  const entrada = { wa_id: msg.key.id, jid, telefone, tipo: c.tipo, texto: c.texto?.trim() || undefined };

  if (c.tipo !== "texto" && Number(c.tamanho ?? 0) <= MIDIA_MAX) {
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

// ─── Estado e comandos da tela ──────────────────────────────────────────────

// status: iniciando · conectando · aguardando_leitura (QR ou código na tela)
//         · conectado · caiu (reconectando) · parada (esperando comando)
const estado = { status: "iniciando", qr: null, codigo: null, telefone: null, detalhe: null };

let sinalizando = false;
let sinalDeNovo = false;
async function sinal() {
  if (sinalizando) { sinalDeNovo = true; return; }
  sinalizando = true;
  try {
    const r = await chamar("estado", { ...estado, versao: VERSAO });
    if (r.comando && !SO_PAREAR) await executar(r.comando, r.numero);
  } catch (e) {
    console.error("[ponte] sinal:", e.message);
  } finally {
    sinalizando = false;
    if (sinalDeNovo) { sinalDeNovo = false; void sinal(); }
  }
}

function mudar(novo) {
  Object.assign(estado, novo);
  void sinal();
}

async function executar(comando, numero) {
  console.log(`[ponte] comando da tela: ${comando}${numero ? ` ${numero}` : ""}`);
  if (comando === "desconectar") {
    if (socket && conectado) {
      // O WhatsApp responde com loggedOut, e o fechamento abaixo apaga a
      // sessão e gera QR novo.
      await socket.logout().catch((e) => console.error("[ponte] logout:", e.message));
      return;
    }
    await rm(PASTA_SESSAO, { recursive: true, force: true });
    numeroPareamento = "";
    return religar();
  }
  if (comando === "codigo") {
    if (conectado) {
      mudar({ detalhe: "Já está conectado. Desconecte antes de parear outro número." });
      return;
    }
    numeroPareamento = String(numero ?? "").replace(/\D/g, "");
    return religar();
  }
  // reconectar: se não está pareado, é "Gerar QR".
  if (!conectado) numeroPareamento = "";
  return religar();
}

/** Fecha o socket atual sem deixar o fechamento dele reconectar sozinho. */
async function religar() {
  geracao++;
  const velho = socket;
  socket = null;
  conectado = false;
  try { velho?.end(undefined); } catch { /* já fechado */ }
  await conectar();
}

async function jaPareado() {
  try {
    return Boolean(JSON.parse(await readFile(join(PASTA_SESSAO, "creds.json"), "utf8")).me);
  } catch {
    return false;
  }
}

// ─── Conexão ────────────────────────────────────────────────────────────────

let geracao = 0;

async function conectar() {
  const minha = ++geracao;
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);
  let codigoPedido = false;
  let qrMostrado = false;
  mudar({ status: "conectando", qr: null, codigo: null, detalhe: null });
  const sock = makeWASocket({ auth: state, logger, markOnlineOnConnect: false, syncFullHistory: false });
  socket = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (minha !== geracao) return;
    if (qr) qrMostrado = true;
    if (qr && numeroPareamento) {
      if (!codigoPedido) {
        codigoPedido = true;
        try {
          const c = await sock.requestPairingCode(numeroPareamento);
          const codigo = `${c.slice(0, 4)}-${c.slice(4)}`;
          console.log(`\nNo celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho →`);
          console.log(`"Conectar com número de telefone" e digite o código:\n`);
          console.log(`        ${codigo}\n`);
          mudar({ status: "aguardando_leitura", qr: null, codigo, detalhe: `Código para o número ${numeroPareamento}` });
        } catch (e) {
          console.error("[ponte] não consegui pedir o código:", e.message);
          mudar({ status: "parada", qr: null, codigo: null, detalhe: `Não consegui pedir o código: ${e.message}` });
        }
      }
    } else if (qr) {
      if (SO_PAREAR) {
        console.log("\nEscaneie no celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho\n");
        qrcode.generate(qr, { small: true });
      } else {
        console.log("[ponte] QR novo na tela do sistema.");
      }
      const imagem = await QRCode.toDataURL(qr, { margin: 1, width: 320 }).catch(() => null);
      mudar({ status: "aguardando_leitura", qr: imagem, codigo: null, detalhe: null });
    }
    if (connection === "open") {
      conectado = true;
      numeroPareamento = "";
      const telefone = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      console.log(`[ponte] conectado como ${telefone ?? "?"}`);
      mudar({ status: "conectado", qr: null, codigo: null, telefone, detalhe: null });
      if (SO_PAREAR) {
        console.log("[ponte] pareado. Sessão salva.");
        setTimeout(() => process.exit(0), 3000);
      }
    }
    if (connection === "close") {
      conectado = false;
      const erro = lastDisconnect?.error;
      const codigo = new Boom(erro)?.output?.statusCode;
      const detalhe = [erro?.message, JSON.stringify(erro?.data ?? null)].filter(Boolean).join(" ");
      const reconectar = (status, texto) => {
        mudar({ status, qr: null, codigo: null, detalhe: texto });
        setTimeout(() => { if (minha === geracao) void conectar(); }, 3000);
      };
      if (codigo === DisconnectReason.loggedOut) {
        // Sessão encerrada (pelo WhatsApp ou pelo botão Desconectar): apaga e
        // gera QR novo para a tela.
        console.warn(`[ponte] a sessão deste aparelho foi encerrada (${detalhe}). Gerando QR novo.`);
        await rm(PASTA_SESSAO, { recursive: true, force: true });
        if (SO_PAREAR) process.exit(1);
        return reconectar("conectando", "A sessão foi encerrada. Gerando QR novo.");
      }
      // Depois de ler o QR o WhatsApp pede para reiniciar (restartRequired):
      // aí já está pareado e reconecta normal. Queda de rede antes de
      // aparecer QR também reconecta.
      if (qrMostrado && !state.creds.me && codigo !== DisconnectReason.restartRequired && !SO_PAREAR) {
        // QR ou código expirou sem ninguém ler. Não fica gerando QR à toa:
        // espera alguém pedir na tela.
        console.warn("[ponte] o QR expirou sem leitura. Esperando comando da tela.");
        mudar({ status: "parada", qr: null, codigo: null, detalhe: "O QR expirou sem leitura. Toque em Gerar QR." });
        return;
      }
      console.warn(`[ponte] conexão caiu (${codigo ?? "?"} ${detalhe}). Reconectando…`);
      reconectar("caiu", `Conexão caiu (${codigo ?? "?"}). Reconectando…`);
    }
  });

  // "notify" é mensagem nova. "append" inclui o que chegou com a ponte fora do
  // ar. Os dois passam pelo filtro de idade, e a função ignora repetidas.
  sock.ev.on("messages.upsert", ({ type, messages }) => {
    if (minha !== geracao) return;
    if (type !== "notify" && type !== "append") return;
    for (const m of messages) void aoReceber(m);
  });
}

try {
  await chamar("status");
} catch (e) {
  console.error("[ponte] não consegui falar com o agente. Confira AGENTE_URL e AGENTE_PONTE_TOKEN:", e.message);
  process.exit(1);
}
console.log(`[ponte] versão ${VERSAO}`);
setInterval(() => void sinal(), INTERVALO_SINAL);
if (SO_PAREAR || numeroPareamento || await jaPareado()) {
  await conectar();
} else {
  // Sem sessão o serviço não fica gerando QR no fundo: espera "Gerar QR".
  console.log("[ponte] sem sessão. Pareie pela tela do sistema (WhatsApp do estoque).");
  mudar({ status: "parada", detalhe: "Sem sessão. Toque em Gerar QR ou Gerar código." });
}
if (!SO_PAREAR) setInterval(() => void entregarSaida(), INTERVALO_SAIDA);
