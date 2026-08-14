// Edge function do link público de prestação de contas do colaborador.
// Autenticação por token da viagem (rr_viagens.token_publico) — sem login.
// Ações: info | analisar | lancar | editar_lancamento | excluir_lancamento | ocorrencia
// IA: usa a primeira chave configurada nos secrets, nesta ordem:
//   GEMINI_API_KEY (tier grátis) → GROQ_API_KEY (tier grátis) → ANTHROPIC_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BUCKET = "rr-comprovantes";

const CATEGORIAS = [
  "Combustível",
  "Alimentação",
  "Hospedagem",
  "Pedágio",
  "Material / Compras",
  "Manutenção veículo",
  "Outros",
];

interface Analise {
  valor: number | null;
  data: string | null;
  categoria: string;
  estabelecimento: string | null;
  descricao: string;
  confianca: "alta" | "media" | "baixa";
  perguntas: string[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function iaDisponivel(): boolean {
  return Boolean(
    Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GROQ_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY"),
  );
}

async function buscarViagem(token: string) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await supabase
    .from("rr_viagens")
    .select(
      "id, data_partida, data_retorno_prevista, data_retorno_real, valor_alocado, status, obs, funcionario:rr_funcionarios(nome, apelido), evento:rr_eventos(nome, cidade), veiculo:rr_veiculos(nome, placa)",
    )
    .eq("token_publico", token)
    .maybeSingle();
  return data;
}

function promptAnalise(): string {
  return (
    "Você analisa fotos de comprovantes (notas fiscais, cupons, recibos, comprovantes PIX) para a prestação de contas de viagem de uma empresa de eventos de bar. " +
    "Extraia os dados deste comprovante. A foto pode estar torta, amassada ou mal iluminada — faça o melhor possível. " +
    "Se o valor ou a data estiverem ilegíveis, use null e adicione uma pergunta curta e simples em português para o colaborador responder (ex.: 'Qual foi o valor total?'). " +
    `A categoria deve ser exatamente uma destas: ${CATEGORIAS.join(", ")}. Hoje é ${new Date().toISOString().slice(0, 10)}. ` +
    'Responda SOMENTE com JSON neste formato: {"valor": number|null, "data": "YYYY-MM-DD"|null, "categoria": string, "estabelecimento": string|null, "descricao": string, "confianca": "alta"|"media"|"baixa", "perguntas": string[]}'
  );
}

function extrairJson(texto: string): Analise {
  const limpo = texto.replace(/```json|```/g, "").trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

async function analisarComGemini(chave: string, imagem: string, mediaType: string): Promise<Analise> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${chave}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mediaType, data: imagem } },
              { text: promptAnalise() },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: {
            type: "object",
            properties: {
              valor: { type: "number", nullable: true },
              data: { type: "string", nullable: true },
              categoria: { type: "string", enum: CATEGORIAS },
              estabelecimento: { type: "string", nullable: true },
              descricao: { type: "string" },
              confianca: { type: "string", enum: ["alta", "media", "baixa"] },
              perguntas: { type: "array", items: { type: "string" } },
            },
            required: ["categoria", "descricao", "confianca", "perguntas"],
          },
        },
      }),
    },
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const dados = await resp.json();
  const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error("Gemini sem resposta");
  const analise = extrairJson(texto);
  analise.valor ??= null;
  analise.data ??= null;
  analise.estabelecimento ??= null;
  analise.perguntas ??= [];
  return analise;
}

async function analisarComGroq(chave: string, imagem: string, mediaType: string): Promise<Analise> {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imagem}` } },
            { type: "text", text: promptAnalise() },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`Groq ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const dados = await resp.json();
  const texto = dados.choices?.[0]?.message?.content;
  if (!texto) throw new Error("Groq sem resposta");
  const analise = extrairJson(texto);
  analise.valor ??= null;
  analise.data ??= null;
  analise.estabelecimento ??= null;
  analise.perguntas ??= [];
  return analise;
}

async function analisarComAnthropic(chave: string, imagem: string, mediaType: string): Promise<Analise> {
  const { default: Anthropic } = await import("npm:@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: chave });
  const resposta = await anthropic.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imagem } },
          { type: "text", text: promptAnalise() },
        ],
      },
    ],
  });
  if (resposta.stop_reason === "refusal") throw new Error("Análise recusada");
  const bloco = resposta.content.find((b: { type: string }) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!bloco) throw new Error("Anthropic sem resposta");
  return extrairJson(bloco.text);
}

async function analisarComprovante(imagem: string, mediaType: string) {
  const gemini = Deno.env.get("GEMINI_API_KEY");
  const groq = Deno.env.get("GROQ_API_KEY");
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY");
  if (!gemini && !groq && !anthropic) return { ia_disponivel: false };

  const tentativas: (() => Promise<Analise>)[] = [];
  if (gemini) tentativas.push(() => analisarComGemini(gemini, imagem, mediaType));
  if (groq) tentativas.push(() => analisarComGroq(groq, imagem, mediaType));
  if (anthropic) tentativas.push(() => analisarComAnthropic(anthropic, imagem, mediaType));

  let ultimoErro = "";
  for (const tentar of tentativas) {
    try {
      return { ia_disponivel: true, analise: await tentar() };
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : "erro";
    }
  }
  console.error("Falha na análise de comprovante:", ultimoErro);
  return { ia_disponivel: true, erro: "Não consegui ler a foto agora — preencha os dados abaixo." };
}

async function salvarFoto(viagemId: string, imagemBase64: string, mediaType: string): Promise<string> {
  const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const caminho = `${viagemId}/${Date.now()}.${ext}`;
  const bytes = Uint8Array.from(atob(imagemBase64), (c) => c.charCodeAt(0));
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: mediaType });
  if (upErr) throw new Error(`Falha ao salvar foto: ${upErr.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ erro: "Método não suportado" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }

  const acao = String(body.acao ?? "");
  const token = String(body.token ?? "");

  const viagem = await buscarViagem(token);
  if (!viagem) return json({ erro: "Link inválido ou viagem não encontrada." }, 404);

  try {
    if (acao === "info") {
      const { data: lancamentos } = await supabase
        .from("rr_viagem_lancamentos")
        .select("id, tipo, categoria, descricao, valor, data_lancamento, comprovante_url, criado_em")
        .eq("viagem_id", viagem.id)
        .order("criado_em", { ascending: false });
      const { data: ocorrencias } = await supabase
        .from("rr_viagem_ocorrencias")
        .select("id, descricao, foto_url, criado_em")
        .eq("viagem_id", viagem.id)
        .order("criado_em", { ascending: false });
      return json({
        viagem,
        lancamentos: lancamentos ?? [],
        ocorrencias: ocorrencias ?? [],
        ia_disponivel: iaDisponivel(),
      });
    }

    if (acao === "analisar") {
      const imagem = String(body.imagem_base64 ?? "");
      const mediaType = String(body.media_type ?? "image/jpeg");
      if (!imagem) return json({ erro: "Imagem não enviada" }, 400);
      return json(await analisarComprovante(imagem, mediaType));
    }

    if (acao === "lancar") {
      if (viagem.status !== "em_viagem" && viagem.status !== "prestacao_pendente") {
        return json({ erro: "Esta prestação de contas já foi fechada." }, 409);
      }
      const tipo = String(body.tipo ?? "despesa");
      const valor = Number(body.valor);
      if (!["despesa", "aporte", "devolucao"].includes(tipo)) return json({ erro: "Tipo inválido" }, 400);
      if (!isFinite(valor) || valor <= 0) return json({ erro: "Valor inválido" }, 400);

      let comprovanteUrl: string | null = null;
      const imagem = String(body.imagem_base64 ?? "");
      if (imagem) {
        const mediaType = String(body.media_type ?? "image/jpeg");
        comprovanteUrl = await salvarFoto(viagem.id, imagem, mediaType);
      }

      const { data: lanc, error } = await supabase
        .from("rr_viagem_lancamentos")
        .insert({
          viagem_id: viagem.id,
          tipo,
          categoria: tipo === "despesa" ? String(body.categoria ?? "Outros") : null,
          descricao: String(body.descricao ?? "").trim() || null,
          valor,
          data_lancamento: String(body.data_lancamento ?? "") || new Date().toISOString().slice(0, 10),
          comprovante_url: comprovanteUrl,
          criado_via: "link_publico",
        })
        .select()
        .single();
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, lancamento: lanc });
    }

    if (acao === "editar_lancamento") {
      if (viagem.status !== "em_viagem" && viagem.status !== "prestacao_pendente") {
        return json({ erro: "Esta prestação de contas já foi fechada." }, 409);
      }
      const id = String(body.id ?? "");
      const valor = Number(body.valor);
      if (!id) return json({ erro: "Lançamento não informado" }, 400);
      if (!isFinite(valor) || valor <= 0) return json({ erro: "Valor inválido" }, 400);

      const atualizacao: Record<string, unknown> = {
        categoria: body.categoria ? String(body.categoria) : null,
        descricao: String(body.descricao ?? "").trim() || null,
        valor,
        data_lancamento: String(body.data_lancamento ?? "") || new Date().toISOString().slice(0, 10),
      };
      const imagem = String(body.imagem_base64 ?? "");
      if (imagem) {
        const mediaType = String(body.media_type ?? "image/jpeg");
        atualizacao.comprovante_url = await salvarFoto(viagem.id, imagem, mediaType);
      }

      const { data: lanc, error } = await supabase
        .from("rr_viagem_lancamentos")
        .update(atualizacao)
        .eq("id", id)
        .eq("viagem_id", viagem.id)
        .select()
        .single();
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, lancamento: lanc });
    }

    if (acao === "excluir_lancamento") {
      if (viagem.status !== "em_viagem" && viagem.status !== "prestacao_pendente") {
        return json({ erro: "Esta prestação de contas já foi fechada." }, 409);
      }
      const id = String(body.id ?? "");
      if (!id) return json({ erro: "Lançamento não informado" }, 400);
      const { error } = await supabase
        .from("rr_viagem_lancamentos")
        .delete()
        .eq("id", id)
        .eq("viagem_id", viagem.id);
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true });
    }

    if (acao === "ocorrencia") {
      const descricao = String(body.descricao ?? "").trim();
      if (!descricao) return json({ erro: "Descreva a ocorrência." }, 400);

      let fotoUrl: string | null = null;
      const imagem = String(body.imagem_base64 ?? "");
      if (imagem) {
        const mediaType = String(body.media_type ?? "image/jpeg");
        fotoUrl = await salvarFoto(viagem.id, imagem, mediaType);
      }

      const { data: ocorrencia, error } = await supabase
        .from("rr_viagem_ocorrencias")
        .insert({ viagem_id: viagem.id, descricao, foto_url: fotoUrl, criado_via: "link_publico" })
        .select()
        .single();
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, ocorrencia });
    }

    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
