import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { BUCKET, pessoaPeloTelefone, processarPessoa, responderIsolado } from "./cerebro.ts";
import {
  assinaturaValida, baixarMidia, conectar, configMeta, criarModelo, desafio, enviarPendentes, gravarStatus,
  lerWebhook, liberarJanela, marcarLida, situacao,
} from "./meta.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Agente de estoque pelo WhatsApp.
//
// A ponte (na VPS, conectada ao WhatsApp pelo Baileys) conversa só com esta
// função, sempre com o cabeçalho x-agente-token = AGENTE_PONTE_TOKEN:
//
//   POST ?acao=entrada    mensagem recebida (texto e, se houver, mídia em base64)
//   GET  ?acao=saida      mensagens a enviar
//   POST ?acao=confirmar  o que foi enviado e o que falhou
//   POST ?acao=estado     a cada 5 s: como a ponte está (e o QR); volta o
//                         comando que a tela "WhatsApp do estoque" deixou
//
// Mensagem que falha volta para a fila e é tentada de novo, uma vez por
// minuto, até TENTATIVAS_ENVIO. Só depois disso vira falha_envio.
//
// Canal oficial (Meta), ver meta.ts:
//   GET/POST ?acao=meta     webhook da Meta (assinatura conferida com META_APP_SECRET)
//   POST ?acao=enviar       manda a fila pela Meta (chamado a cada minuto pelo pg_cron)
// Da tela do sistema (login de admin ou master):
//   POST ?acao=responder    resposta manual numa conversa
//   ?acao=meta_status | meta_conectar | meta_modelo
//
// ?acao=simular roda o agente sem WhatsApp (resposta volta no corpo e fica
// gravada como "simulada"). Aceita o token da ponte ou o token_teste de
// agente_config, para testar daqui sem expor segredo. Com "isolado", responde
// só aquela mensagem, sem histórico nem fila, com o modelo pedido (bancada).
//
// Quem não está cadastrado (ou, com so_dono ligado, quem não é o dono) é
// ignorado em silêncio.
// ─────────────────────────────────────────────────────────────────────────────

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const TENTATIVAS_ENVIO = 4;

let bucketPronto = false;
async function garantirBucket() {
  if (bucketPronto) return;
  await db.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  bucketPronto = true;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-agente-token, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

/** Login do sistema (admin ou master), para as ações da tela. */
async function gestorLogado(req: Request): Promise<{ id: string; nome: string } | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  const uid = data?.user?.id;
  if (!uid) return null;
  const { data: u } = await db.from("usuarios_sistema").select("id, nome_completo, nivel")
    .or(`auth_user_id.eq.${uid},id.eq.${uid}`).limit(1).maybeSingle();
  if (!u || !["admin", "master"].includes(u.nivel)) return null;
  return { id: u.id, nome: u.nome_completo ?? "gestor" };
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function quemChama(req: Request): Promise<"ponte" | "teste" | null> {
  const token = req.headers.get("x-agente-token") ?? "";
  if (!token) return null;
  const ponte = Deno.env.get("AGENTE_PONTE_TOKEN");
  if (ponte && iguais(token, ponte)) return "ponte";
  const { data } = await db.from("agente_config").select("valor").eq("chave", "token_teste").maybeSingle();
  const teste = typeof data?.valor === "string" ? data.valor : "";
  if (teste && iguais(token, teste)) return "teste";
  return null;
}

async function atendivel(telefone: string | null) {
  const pessoa = await pessoaPeloTelefone(db, telefone);
  if (!pessoa) return null;
  const { data } = await db.from("agente_config").select("valor").eq("chave", "so_dono").maybeSingle();
  if (data?.valor === true && pessoa.papel !== "dono") return null;
  return pessoa;
}

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "audio/ogg": "ogg",
};

interface Entrada {
  wa_id?: string;
  jid?: string;
  telefone?: string;
  tipo?: "texto" | "imagem" | "audio" | "documento";
  texto?: string;
  midia?: { base64: string; mime: string };
  /** Só na simulação: reaproveita uma foto já guardada no bucket. */
  midia_path?: string;
  /** Só na simulação: bancada de teste (ver cabeçalho). */
  isolado?: { modelo?: string };
}

/** ignorar: grava a mensagem (abre a janela da Meta) sem ir para o agente. */
async function receber(e: Entrada, simulado = false, ignorar = false) {
  const waId = e.wa_id ?? `sim-${crypto.randomUUID()}`;
  if (!simulado) {
    const { data: ja } = await db.from("agente_mensagens").select("id").eq("wa_id", waId).maybeSingle();
    if (ja) return { pessoa: null, duplicada: true, id: null };
  }

  const pessoa = await atendivel(e.telefone ?? null);

  let midiaPath: string | null = simulado && e.midia_path ? e.midia_path : null;
  if (pessoa && e.midia?.base64) {
    await garantirBucket();
    const mime = e.midia.mime === "image/jpg" ? "image/jpeg" : e.midia.mime;
    const dia = new Date().toISOString().slice(0, 10);
    midiaPath = `${dia}/${waId.replace(/[^\w-]/g, "")}.${EXTENSOES[mime] ?? "bin"}`;
    const bytes = Uint8Array.from(atob(e.midia.base64), (c) => c.charCodeAt(0));
    const { error } = await db.storage.from(BUCKET).upload(midiaPath, bytes, { contentType: mime, upsert: true });
    if (error) {
      console.error("[agente] falha ao guardar mídia:", error.message);
      midiaPath = null;
    }
  }

  const { data: nova } = await db.from("agente_mensagens").insert({
    equipe_id: pessoa?.id ?? null,
    telefone: e.telefone ?? null,
    jid: e.jid ?? null,
    direcao: "entrada",
    tipo: e.tipo ?? (e.midia || midiaPath ? "imagem" : "texto"),
    texto: e.texto ?? null,
    midia_path: midiaPath,
    wa_id: waId,
    // Bancada entra como ignorada: fica fora da fila e do histórico da pessoa.
    status: pessoa && !(simulado && e.isolado) && !ignorar ? "nova" : "ignorada",
  }).select("id").single();
  return { pessoa, duplicada: false, id: (nova?.id as number | undefined) ?? null };
}

/** O que chegou pelo webhook da Meta. Roda depois de responder 200 à Meta. */
async function tratarWebhook(corpo: unknown) {
  const { recebidas, status } = lerWebhook(corpo);
  const agora = new Date().toISOString();
  await db.from("agente_config").upsert({ chave: "meta_ultimo_webhook", valor: agora, atualizado_em: agora });
  if (status.length) await gravarStatus(db, status);
  if (!recebidas.length) return;

  const c = await configMeta(db);
  const respondidas = new Set<string>();
  for (const r of recebidas) {
    const entrada: Entrada = {
      wa_id: r.waId, telefone: r.telefone, tipo: r.tipo,
      texto: r.naoSuportado ? `[mandou ${r.naoSuportado}, que o agente não lê]` : r.texto,
    };
    if (r.midiaId && c.token) {
      const m = await baixarMidia(c.token, r.midiaId).catch(() => null);
      if (m) entrada.midia = m;
      else entrada.texto = `${entrada.texto ?? ""} [a mídia não pôde ser baixada]`.trim();
    }
    const { pessoa, duplicada } = await receber(entrada, false, r.abreJanela);
    if (!pessoa || duplicada) continue;
    if (c.token && c.phoneId) await marcarLida({ token: c.token, phoneId: c.phoneId, wabaId: c.wabaId ?? "" }, r.waId);
    await liberarJanela(db, pessoa.id);
    if (!r.abreJanela) respondidas.add(pessoa.id);
  }
  await Promise.all([...respondidas].map((id) => processarPessoa(db, id).catch((e) => console.error(e))));
  await enviarPendentes(db);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const acao = url.searchParams.get("acao");

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (acao === "meta") {
    if (req.method === "GET") return desafio(url);
    const bruto = await req.text();
    const valida = await assinaturaValida(bruto, req.headers.get("x-hub-signature-256"));
    if (!valida && (await quemChama(req)) !== "teste") return json({ ok: false, erro: "assinatura inválida" }, 401);
    let corpo: unknown;
    try { corpo = JSON.parse(bruto); } catch { return json({ ok: false, erro: "json inválido" }, 400); }
    EdgeRuntime.waitUntil(tratarWebhook(corpo).catch((e) => console.error("[meta]", e)));
    return json({ ok: true });
  }

  if (["responder", "meta_status", "meta_conectar", "meta_modelo"].includes(acao ?? "")) {
    const gestor = await gestorLogado(req);
    if (!gestor && (await quemChama(req)) !== "teste") return json({ ok: false, erro: "só admin ou master" }, 401);
    try {
      if (acao === "meta_status") return json({ ok: true, ...(await situacao(db)) });
      if (acao === "meta_conectar") {
        return json({ ok: true, ...(await conectar(db, `${Deno.env.get("SUPABASE_URL")}/functions/v1/agente-whatsapp?acao=meta`)) });
      }
      if (acao === "meta_modelo") return json({ ok: true, ...(await criarModelo(db)) });
      // responder
      const corpo = await req.json() as { equipe_id?: string; texto?: string };
      const texto = corpo.texto?.trim();
      if (!corpo.equipe_id || !texto) return json({ ok: false, erro: "falta a pessoa ou o texto" }, 400);
      const { data: eq } = await db.from("agente_equipe").select("telefone").eq("id", corpo.equipe_id).maybeSingle();
      if (!eq?.telefone) return json({ ok: false, erro: "pessoa sem telefone" }, 400);
      const { data: nova } = await db.from("agente_mensagens").insert({
        equipe_id: corpo.equipe_id, telefone: eq.telefone, direcao: "saida", tipo: "texto", texto,
        status: "pendente_envio", uso: { manual: true, por: gestor?.nome ?? "teste" },
      }).select("id").single();
      const placar = await enviarPendentes(db);
      const { data: m } = await db.from("agente_mensagens").select("status, erro").eq("id", nova!.id).single();
      return json({ ok: true, id: nova!.id, status: m?.status, erro: m?.erro, ...placar });
    } catch (e) {
      return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  const quem = await quemChama(req);
  if (!quem) return json({ ok: false, erro: "não autorizado" }, 401);

  try {
    if (acao === "status") return json({ ok: true });

    if (acao === "entrada" && req.method === "POST" && quem === "ponte") {
      const { pessoa, duplicada } = await receber(await req.json());
      if (pessoa) EdgeRuntime.waitUntil(processarPessoa(db, pessoa.id).catch((e) => console.error(e)));
      return json({ ok: true, reconhecido: Boolean(pessoa), duplicada });
    }

    if (acao === "estado" && req.method === "POST" && quem === "ponte") {
      const { data, error } = await db.rpc("fn_agente_ponte_sinal", { p_estado: await req.json() });
      if (error) throw new Error(error.message);
      return json({ ok: true, ...data });
    }

    if (acao === "enviar" && (quem === "ponte" || quem === "teste")) {
      return json({ ok: true, ...(await enviarPendentes(db)) });
    }

    if (acao === "saida" && quem === "ponte") {
      // Canal Meta ligado: a ponte antiga não envia mais nada.
      if ((await configMeta(db)).canal === "meta") return json({ ok: true, mensagens: [] });
      // Enquanto pendente, processado_em guarda a última tentativa que falhou.
      const umMinuto = new Date(Date.now() - 60_000).toISOString();
      const { data } = await db
        .from("agente_mensagens")
        .select("id, jid, telefone, texto")
        .eq("direcao", "saida").eq("status", "pendente_envio")
        .or(`processado_em.is.null,processado_em.lt.${umMinuto}`)
        .order("id").limit(20);
      return json({ ok: true, mensagens: data ?? [] });
    }

    if (acao === "confirmar" && req.method === "POST" && quem === "ponte") {
      const corpo = await req.json() as { enviadas?: number[]; falhas?: { id: number; erro: string }[] };
      const agora = new Date().toISOString();
      if (corpo.enviadas?.length) {
        await db.from("agente_mensagens").update({ status: "enviada", processado_em: agora }).in("id", corpo.enviadas);
      }
      for (const f of corpo.falhas ?? []) {
        const { data: m } = await db.from("agente_mensagens").select("tentativas").eq("id", f.id).maybeSingle();
        const tentativas = (m?.tentativas ?? 0) + 1;
        await db.from("agente_mensagens").update({
          status: tentativas >= TENTATIVAS_ENVIO ? "falha_envio" : "pendente_envio",
          tentativas, erro: f.erro, processado_em: agora,
        }).eq("id", f.id);
      }
      return json({ ok: true });
    }

    if (acao === "simular" && req.method === "POST") {
      const corpo = await req.json() as Entrada;
      const { pessoa, id } = await receber(corpo, true);
      if (!pessoa) return json({ ok: false, erro: "telefone não atendido (não cadastrado, inativo ou so_dono ligado)" }, 404);
      if (corpo.isolado && id) {
        const ini = Date.now();
        const r = await responderIsolado(db, pessoa.id, id, corpo.isolado.modelo);
        return json({ ok: true, pessoa: pessoa.nome, mensagem_id: id, ms: Date.now() - ini, ...r });
      }
      const respostas = await processarPessoa(db, pessoa.id, { simulado: true });
      return json({ ok: true, pessoa: pessoa.nome, respostas });
    }

    return json({ ok: false, erro: "ação inválida" }, 400);
  } catch (e) {
    console.error("[agente]", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
