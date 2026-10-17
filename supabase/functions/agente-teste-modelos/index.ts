import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Bancada de teste: transcreve uma foto de nota guardada pelo agente com o
// modelo pedido (Claude ou Gemini), para comparar qualidade e custo antes de
// mudar o modelo do agente. Não grava nada no estoque.
//
//   GET  ?acao=modelos_gemini                 modelos Gemini disponíveis na chave
//   POST ?acao=ler { path, modelo }           transcrição em JSON + tokens + tempo
//
// Só aceita o token_teste de agente_config (cabeçalho x-agente-token).
// ─────────────────────────────────────────────────────────────────────────────

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const PROMPT = `Transcreva esta nota, cupom ou pedido de compra de um bar e restaurante.
Responda só com JSON, sem texto antes ou depois, neste formato:
{"tipo_documento": "", "fornecedor": "", "cnpj": "", "numero": "", "data": "AAAA-MM-DD",
 "linhas": [{"descricao": "", "quantidade": 0, "unidade": "", "valor_unitario": 0, "valor_total": 0}],
 "desconto": 0, "total": 0, "legivel": "sim|parcial|nao", "duvidas": ""}
Copie cada descrição como está escrita. Não invente: o que não der para ler fica vazio e vai em "duvidas".
Se a imagem não for um documento de compra, deixe "linhas" vazio e diga o que é em "tipo_documento".`;

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function extrairJson(texto: string): unknown {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim < ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

async function lerComClaude(modelo: string, mime: string, b64: string) {
  const cliente = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, maxRetries: 1 });
  const r = await cliente.messages.create({
    model: modelo,
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: b64 } },
        { type: "text", text: PROMPT },
      ],
    }],
    output_config: { effort: "medium" },
  } as Anthropic.MessageCreateParamsNonStreaming);
  const texto = r.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
  return { texto, uso: { entrada: r.usage.input_tokens, saida: r.usage.output_tokens } };
}

async function lerComGemini(modelo: string, mime: string, b64: string) {
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY não configurada");
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${JSON.stringify(corpo).slice(0, 300)}`);
  const texto = (corpo.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const u = corpo.usageMetadata ?? {};
  return { texto, uso: { entrada: u.promptTokenCount, saida: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) } };
}

Deno.serve(async (req) => {
  const token = req.headers.get("x-agente-token") ?? "";
  const { data: cfg } = await db.from("agente_config").select("valor").eq("chave", "token_teste").maybeSingle();
  if (!token || typeof cfg?.valor !== "string" || token !== cfg.valor) return json({ ok: false, erro: "não autorizado" }, 401);

  const acao = new URL(req.url).searchParams.get("acao");
  try {
    if (acao === "modelos_gemini") {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") ?? "" },
      });
      const corpo = await resp.json();
      const nomes = (corpo.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: { name: string }) => m.name.replace("models/", ""));
      return json({ ok: resp.ok, nomes, erro: resp.ok ? undefined : corpo });
    }

    if (acao === "ler" && req.method === "POST") {
      const { path, modelo } = await req.json() as { path: string; modelo: string };
      const { data, error } = await db.storage.from("agente-whatsapp").download(path);
      if (error || !data) return json({ ok: false, erro: "foto não encontrada" }, 404);
      const mime = data.type === "image/jpg" ? "image/jpeg" : data.type;
      const b64 = base64(new Uint8Array(await data.arrayBuffer()));
      const ini = Date.now();
      const r = modelo.startsWith("gemini") ? await lerComGemini(modelo, mime, b64) : await lerComClaude(modelo, mime, b64);
      return json({ ok: true, path, modelo, ms: Date.now() - ini, uso: r.uso, nota: extrairJson(r.texto), bruto: r.texto.slice(0, 200) });
    }

    return json({ ok: false, erro: "ação inválida" }, 400);
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
