/**
 * O cérebro: junta as mensagens novas de uma pessoa, monta o histórico,
 * conversa com o Claude usando as ferramentas e enfileira a resposta (e os
 * avisos para outras pessoas) para a ponte enviar pelo WhatsApp.
 *
 * Histórico entre mensagens vai só como texto (o que a pessoa escreveu e o
 * que o agente respondeu). Dentro de uma mesma resposta, o loop de
 * ferramentas devolve o conteúdo do modelo inteiro, sem editar.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { contextoDinamico, type Pessoa, PROMPT_FIXO } from "./prompt.ts";
import { executarFerramenta, ferramentasPara } from "./ferramentas.ts";
import { type Leitura, lerDocumento, textoDaLeitura } from "./leitor.ts";

export const BUCKET = "agente-whatsapp";
const MAX_RODADAS = 12;
const MODELO_PADRAO = "claude-opus-5-5";

interface Mensagem {
  id: number;
  equipe_id: string | null;
  telefone: string | null;
  jid: string | null;
  direcao: "entrada" | "saida";
  tipo: string;
  texto: string | null;
  midia_path: string | null;
  status: string;
  criado_em: string;
  leitura: Leitura | null;
}

interface Opcoes {
  simulado?: boolean;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cfg(db: SupabaseClient, chave: string): Promise<any> {
  const { data } = await db.from("agente_config").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}

export async function pessoaPeloTelefone(db: SupabaseClient, telefone: string | null): Promise<Pessoa | null> {
  if (!telefone) return null;
  const { data, error } = await db.rpc("fn_agente_quem", { p_telefone: telefone });
  if (error) throw new Error(error.message);
  return (data as Pessoa) ?? null;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const IMAGENS = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const URL_GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const AUDIO_MAX = 25_000_000;

/**
 * Áudio vira texto pelo Whisper da Groq (o Claude não recebe áudio). A
 * transcrição fica gravada no texto da mensagem, para entrar no histórico.
 * Devolve null com o motivo quando não dá.
 */
async function transcrever(db: SupabaseClient, m: Mensagem): Promise<{ texto: string | null; motivo?: string }> {
  const chave = Deno.env.get("GROQ_API_KEY")?.trim();
  if (!chave) return { texto: null, motivo: "sem_chave" };
  if (!m.midia_path) return { texto: null, motivo: "sem_arquivo" };
  const { data, error } = await db.storage.from(BUCKET).download(m.midia_path);
  if (error || !data || !data.size || data.size > AUDIO_MAX) return { texto: null, motivo: "arquivo" };

  const form = new FormData();
  form.append("file", data, (data.type || "").includes("mp4") ? "audio.m4a" : "audio.ogg");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");
  const resp = await fetch(URL_GROQ, { method: "POST", headers: { authorization: `Bearer ${chave}` }, body: form });
  if (!resp.ok) {
    console.error("[agente] transcrição falhou:", resp.status, (await resp.text().catch(() => "")).slice(0, 200));
    return { texto: null, motivo: resp.status === 429 ? "limite" : "falha" };
  }
  const bruto = await resp.json().catch(() => null) as { text?: string } | null;
  const texto = (bruto?.text ?? "").trim();
  // Whisper inventa frase feita em ruído ("Legendas pela comunidade Amara.org").
  if (!texto || /amara\.org|legendas? (pela|por)/i.test(texto)) return { texto: null, motivo: "vazio" };
  await db.from("agente_mensagens").update({ texto }).eq("id", m.id);
  return { texto };
}

/**
 * Foto ou PDF: primeiro o leitor externo transcreve e confere. Se der certo, o
 * agente recebe o texto. Se não, a imagem vai para o Claude como sempre foi.
 * A leitura fica gravada na mensagem (auditoria e reprocessamento).
 */
async function lerMidia(db: SupabaseClient, m: Mensagem, mime: string, b64: string, leitor: string | null): Promise<Leitura | null> {
  if (!leitor || leitor === "off") return null;
  if (m.leitura?.ok && m.leitura.nota) return m.leitura;
  const leitura = await lerDocumento(leitor, mime, b64);
  await db.from("agente_mensagens").update({ leitura }).eq("id", m.id);
  if (!leitura.ok) console.warn("[agente] leitura externa recusada:", leitura.motivo);
  return leitura;
}

async function blocosDaMensagem(db: SupabaseClient, m: Mensagem, leitor: string | null, leituras: Leitura[]): Promise<Anthropic.ContentBlockParam[]> {
  const blocos: Anthropic.ContentBlockParam[] = [];
  if (m.tipo === "audio") {
    const { texto, motivo } = await transcrever(db, m);
    if (texto) {
      blocos.push({ type: "text", text: `[Áudio transcrito] ${texto}` });
    } else if (motivo === "sem_chave") {
      blocos.push({ type: "text", text: "[A pessoa mandou um áudio. Você ainda não consegue ouvir áudio: peça para escrever.]" });
    } else {
      blocos.push({ type: "text", text: "[A pessoa mandou um áudio, mas não deu para entender. Peça para mandar de novo, falando mais perto do celular, ou para escrever.]" });
    }
    return blocos;
  }
  if (m.midia_path) {
    const { data, error } = await db.storage.from(BUCKET).download(m.midia_path);
    if (error || !data) {
      blocos.push({ type: "text", text: "[Uma foto ou arquivo chegou mas não consegui abrir. Peça para mandar de novo.]" });
    } else {
      const tipo = data.type === "image/jpg" ? "image/jpeg" : data.type;
      const b64 = base64(new Uint8Array(await data.arrayBuffer()));
      const leitura = IMAGENS.includes(tipo) || tipo === "application/pdf"
        ? await lerMidia(db, m, tipo, b64, leitor)
        : null;
      if (leitura) leituras.push(leitura);
      if (leitura?.ok && leitura.nota) {
        blocos.push({ type: "text", text: textoDaLeitura(leitura.nota) });
      } else if (IMAGENS.includes(tipo)) {
        blocos.push({ type: "image", source: { type: "base64", media_type: tipo as "image/jpeg", data: b64 } });
      } else if (tipo === "application/pdf") {
        blocos.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      } else {
        blocos.push({ type: "text", text: `[Chegou um arquivo do tipo ${tipo}, que não consigo ler.]` });
      }
    }
  }
  if (m.texto?.trim()) blocos.push({ type: "text", text: m.texto.trim() });
  if (!blocos.length) blocos.push({ type: "text", text: "[mensagem vazia]" });
  return blocos;
}

/** Últimas 24h de conversa com a pessoa, só texto, em ordem. */
async function historico(db: SupabaseClient, equipeId: string, excluir: number[]): Promise<Anthropic.MessageParam[]> {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("agente_mensagens")
    .select("id, direcao, tipo, texto, midia_path, status, leitura")
    .eq("equipe_id", equipeId)
    .gte("criado_em", desde)
    .in("status", ["respondida", "erro", "pendente_envio", "enviada", "falha_envio", "simulada"])
    .order("id", { ascending: false })
    .limit(24);

  const linhas = (data ?? []).filter((m) => !excluir.includes(m.id)).reverse();
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of linhas) {
    const role = m.direcao === "entrada" ? "user" : "assistant";
    let texto = m.texto?.trim() ?? "";
    if (m.direcao === "entrada" && m.tipo === "audio") texto = `[áudio]${texto ? " " + texto : ""}`;
    else if (m.direcao === "entrada" && m.midia_path) {
      const n = (m.leitura as Leitura | null)?.ok ? (m.leitura as Leitura).nota : null;
      const qual = n ? ` de nota: ${n.fornecedor ?? "?"}${n.numero ? ` nº ${n.numero}` : ""} · total ${n.total ?? "?"}` : "";
      texto = `[enviou uma foto${qual}]${texto ? " " + texto : ""}`;
    }
    if (!texto) continue;
    const ultima = msgs[msgs.length - 1];
    if (ultima && ultima.role === role) {
      ultima.content = `${ultima.content}\n${texto}`;
    } else {
      msgs.push({ role, content: texto });
    }
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

export async function enfileirar(
  db: SupabaseClient,
  m: { equipeId: string; jid?: string | null; telefone?: string | null; texto: string; simulado?: boolean; uso?: unknown },
) {
  let telefone = m.telefone ?? null;
  if (!telefone) {
    const { data } = await db.from("agente_equipe").select("telefone").eq("id", m.equipeId).single();
    telefone = data?.telefone ?? null;
  }
  await db.from("agente_mensagens").insert({
    equipe_id: m.equipeId,
    telefone,
    jid: m.jid ?? null,
    direcao: "saida",
    tipo: "texto",
    texto: m.texto,
    status: m.simulado ? "simulada" : "pendente_envio",
    uso: m.uso ?? null,
  });
}

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type MsgParam = Anthropic.Beta.BetaMessageParam;

/** Devolve a mensagem com cache_control no último bloco (texto vira bloco). */
function marcarCache(m: MsgParam): MsgParam {
  const blocos = typeof m.content === "string"
    ? [{ type: "text", text: m.content } as Anthropic.Beta.BetaTextBlockParam]
    : [...m.content];
  const fim = blocos.length - 1;
  blocos[fim] = { ...blocos[fim], cache_control: { type: "ephemeral" } } as (typeof blocos)[number];
  return { ...m, content: blocos };
}

/**
 * Cache da conversa, além do cache das instruções fixas:
 * - no fim do histórico, para a próxima mensagem da pessoa reaproveitar;
 * - no fim do que vai nesta chamada, para as rodadas de ferramenta seguintes
 *   não pagarem de novo a foto e os resultados (saem a 1/20 do preço).
 * O ponto móvel é aplicado numa cópia, para não acumular marcas.
 */
function comCacheNoFim(msgs: MsgParam[]): MsgParam[] {
  return [...msgs.slice(0, -1), marcarCache(msgs[msgs.length - 1])];
}

/** Chama o Claude com fallback do servidor. Se o fallback for recusado, tenta sem. */
async function chamar(cliente: Anthropic, params: Params): Promise<Anthropic.Beta.BetaMessage> {
  try {
    return await cliente.beta.messages.create({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      // deno-lint-ignore no-explicit-any
      ...({ fallbacks: "default" } as any),
    });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
      return await cliente.beta.messages.create(params);
    }
    throw e;
  }
}

async function responder(db: SupabaseClient, equipeId: string, novas: Mensagem[], opts: Opcoes): Promise<string> {
  const { data: eq } = await db.from("agente_equipe").select("telefone").eq("id", equipeId).single();
  const pessoa = await pessoaPeloTelefone(db, eq?.telefone ?? novas[novas.length - 1].telefone);
  if (!pessoa) throw new Error("Pessoa não reconhecida");

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
  const cliente = new Anthropic({ apiKey, maxRetries: 2 });

  const ensaio = (await cfg(db, "modo_ensaio")) !== false;
  const modelo = (await cfg(db, "modelo")) ?? MODELO_PADRAO;
  const esforco = (await cfg(db, "esforco")) ?? "medium";
  const extra = (await cfg(db, "regras_extra")) as string | null;
  const leitor = (await cfg(db, "leitor_modelo")) as string | null;

  const leituras: Leitura[] = [];
  const conteudo = (await Promise.all(novas.map((m) => blocosDaMensagem(db, m, leitor, leituras)))).flat();
  const anteriores: MsgParam[] = await historico(db, equipeId, novas.map((m) => m.id));
  if (anteriores.length) anteriores[anteriores.length - 1] = marcarCache(anteriores[anteriores.length - 1]);
  const messages: MsgParam[] = [...anteriores, { role: "user", content: conteudo }];

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: extra ? `${PROMPT_FIXO}\n${extra}` : PROMPT_FIXO, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextoDinamico(pessoa, ensaio) },
  ];
  const tools = ferramentasPara(pessoa) as Anthropic.Beta.BetaTool[];
  const ctx = { db, pessoa, avisos: [] as { equipeId: string; texto: string }[] };

  const uso = {
    modelo, rodadas: 0, entrada: 0, cache_leitura: 0, cache_escrita: 0, saida: 0, ferramentas: [] as string[],
    leituras: leituras.map((l) => ({ leitor: l.leitor, ok: l.ok, motivo: l.motivo, ms: l.ms, ...l.uso })),
  };
  let resposta: Anthropic.Beta.BetaMessage | null = null;

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    resposta = await chamar(cliente, {
      model: modelo,
      max_tokens: 16000,
      system,
      tools,
      messages: comCacheNoFim(messages),
      output_config: { effort: esforco },
    } as Params);
    uso.rodadas++;
    uso.entrada += resposta.usage.input_tokens ?? 0;
    uso.cache_leitura += resposta.usage.cache_read_input_tokens ?? 0;
    uso.cache_escrita += resposta.usage.cache_creation_input_tokens ?? 0;
    uso.saida += resposta.usage.output_tokens ?? 0;

    if (resposta.stop_reason === "refusal") break;
    messages.push({ role: "assistant", content: resposta.content });
    if (resposta.stop_reason !== "tool_use") break;

    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const resultados = await Promise.all(chamadas.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      uso.ferramentas.push(c.name);
      try {
        const r = await executarFerramenta(c.name, (c.input ?? {}) as Record<string, unknown>, ctx) as
          { __imagens?: { mime: string; b64: string }[]; texto?: string } | null;
        if (r?.__imagens) {
          // ver_foto_original: devolve as imagens em si, não texto.
          return {
            type: "tool_result", tool_use_id: c.id,
            content: [
              { type: "text", text: r.texto ?? "Fotos originais:" },
              ...r.__imagens.map((i) => i.mime === "application/pdf"
                ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: i.b64 } }
                : { type: "image" as const, source: { type: "base64" as const, media_type: i.mime as "image/jpeg", data: i.b64 } }),
            ],
          } as Anthropic.Beta.BetaToolResultBlockParam;
        }
        return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(r ?? null) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: c.id, content: e instanceof Error ? e.message : String(e), is_error: true };
      }
    }));
    messages.push({ role: "user", content: resultados });
  }

  let texto = (resposta?.content ?? [])
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (resposta?.stop_reason === "refusal") texto = "Não consigo ajudar com isso por aqui.";
  if (!texto) texto = "Pronto.";

  const ultima = novas[novas.length - 1];
  await enfileirar(db, { equipeId, jid: ultima.jid, telefone: ultima.telefone, texto, simulado: opts.simulado, uso });
  for (const a of ctx.avisos) {
    await enfileirar(db, { equipeId: a.equipeId, texto: a.texto, simulado: opts.simulado });
  }
  return texto;
}

/**
 * Processa tudo o que chegou de uma pessoa. Espera um pouco antes, para juntar
 * foto e legenda que chegam em mensagens separadas, e volta a olhar no fim,
 * caso algo tenha chegado enquanto respondia.
 */
export async function processarPessoa(db: SupabaseClient, equipeId: string, opts: Opcoes = {}): Promise<string[]> {
  const respostas: string[] = [];
  if (!opts.simulado) await dormir(2500);

  for (let volta = 0; volta < 3; volta++) {
    const { data } = await db
      .from("agente_mensagens")
      .update({ status: "processando" })
      .eq("equipe_id", equipeId)
      .eq("direcao", "entrada")
      .eq("status", "nova")
      .select("*");
    const novas = ((data ?? []) as Mensagem[]).sort((a, b) => a.id - b.id);
    if (!novas.length) break;

    try {
      respostas.push(await responder(db, equipeId, novas, opts));
      await db.from("agente_mensagens")
        .update({ status: "respondida", processado_em: new Date().toISOString() })
        .in("id", novas.map((m) => m.id));
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.error("[agente] falha ao responder:", erro);
      await db.from("agente_mensagens")
        .update({ status: "erro", erro, processado_em: new Date().toISOString() })
        .in("id", novas.map((m) => m.id));
      const ultima = novas[novas.length - 1];
      await enfileirar(db, {
        equipeId, jid: ultima.jid, telefone: ultima.telefone, simulado: opts.simulado,
        texto: "Tive um problema para processar sua mensagem agora. Pode mandar de novo daqui a pouco?",
      });
      respostas.push(`[erro] ${erro}`);
      break;
    }
  }
  return respostas;
}
