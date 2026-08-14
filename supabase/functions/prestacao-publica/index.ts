// Edge function do link público de prestação de contas do colaborador.
// Autenticação por token da viagem (rr_viagens.token_publico) — sem login.
// Ações: info | analisar (IA lê a foto do comprovante) | lancar
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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

const SCHEMA_ANALISE = {
  type: "object",
  properties: {
    valor: { type: ["number", "null"], description: "Valor total do comprovante em reais" },
    data: { type: ["string", "null"], description: "Data do comprovante no formato YYYY-MM-DD" },
    categoria: {
      type: "string",
      enum: [
        "Combustível",
        "Alimentação",
        "Hospedagem",
        "Pedágio",
        "Material / Compras",
        "Manutenção veículo",
        "Outros",
      ],
    },
    estabelecimento: { type: ["string", "null"], description: "Nome do estabelecimento" },
    descricao: { type: "string", description: "Descrição curta do gasto, ex.: 'abastecimento gasolina comum'" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    perguntas: {
      type: "array",
      items: { type: "string" },
      description: "Perguntas curtas e simples ao colaborador quando algo estiver ilegível ou faltando",
    },
  },
  required: ["valor", "data", "categoria", "estabelecimento", "descricao", "confianca", "perguntas"],
  additionalProperties: false,
};

async function analisarComprovante(imagemBase64: string, mediaType: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { ia_disponivel: false };

  const anthropic = new Anthropic({ apiKey });
  const resposta = await anthropic.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA_ANALISE },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imagemBase64 },
          },
          {
            type: "text",
            text:
              "Você analisa fotos de comprovantes (notas fiscais, cupons, recibos, comprovantes PIX) para a prestação de contas de viagem de uma empresa de eventos de bar. " +
              "Extraia os dados deste comprovante. A foto pode estar torta, amassada ou mal iluminada — faça o melhor possível. " +
              "Se o valor ou a data estiverem ilegíveis, use null e adicione uma pergunta curta e simples em português para o colaborador responder (ex.: 'Qual foi o valor total?'). " +
              "Escolha a categoria que melhor descreve o gasto. Hoje é " + new Date().toISOString().slice(0, 10) + ".",
          },
        ],
      },
    ],
  });

  if (resposta.stop_reason === "refusal") {
    return { ia_disponivel: true, erro: "A análise foi recusada. Preencha os dados manualmente." };
  }
  const bloco = resposta.content.find((b: { type: string }) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!bloco) return { ia_disponivel: true, erro: "Sem resposta da análise." };
  return { ia_disponivel: true, analise: JSON.parse(bloco.text) };
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
      return json({
        viagem,
        lancamentos: lancamentos ?? [],
        ia_disponivel: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
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
        const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        const caminho = `${viagem.id}/${Date.now()}.${ext}`;
        const bytes = Uint8Array.from(atob(imagem), (c) => c.charCodeAt(0));
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(caminho, bytes, { contentType: mediaType });
        if (upErr) return json({ erro: `Falha ao salvar comprovante: ${upErr.message}` }, 500);
        comprovanteUrl = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
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

    return json({ erro: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
