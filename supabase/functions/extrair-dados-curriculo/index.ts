import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsIA as corsHeaders, extrairJson, normalizarAnexo } from "../_shared/ia.ts";

const AREAS = [
  "Cozinha",
  "Bar",
  "Atendimento",
  "Caixa",
  "Delivery",
  "Limpeza",
  "Administração",
  "Marketing",
  "TI",
  "RH",
  "Financeiro",
  "Produção",
  "Logística",
  "Outro",
];

interface DadosCurriculo {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  disponibilidade: string;
  pretensao_salarial: number | null;
  areas_interesse: string[];
  observacoes: string;
}

const SCHEMA_CURRICULO = {
  type: "object",
  properties: {
    nome: { type: ["string", "null"], description: "Nome completo do candidato" },
    email: { type: ["string", "null"], description: "E-mail do candidato" },
    telefone: {
      type: ["string", "null"],
      description: "Telefone com DDD no formato (XX) XXXXX-XXXX",
    },
    disponibilidade: {
      type: "string",
      enum: ["imediata", "15_dias", "30_dias", "a_combinar"],
      description: 'Infira pelo contexto ou use "a_combinar" se não informado',
    },
    pretensao_salarial: {
      type: ["number", "null"],
      description: "Número em reais (sem R$, sem formatação), use 0 se não informado",
    },
    areas_interesse: {
      type: "array",
      items: { type: "string", enum: AREAS },
      description:
        "Escolha APENAS as áreas desta lista que se aplicam ao candidato. Pode ser um array vazio.",
    },
    observacoes: {
      type: "string",
      description:
        "Resumo profissional em 2-3 frases descrevendo experiência, habilidades principais e objetivo profissional. Pode ser uma string vazia.",
    },
  },
  required: [
    "nome",
    "email",
    "telefone",
    "disponibilidade",
    "pretensao_salarial",
    "areas_interesse",
    "observacoes",
  ],
} as const;

const SYSTEM = `Você é um especialista em triagem de currículos para bares e restaurantes.
Leia o currículo e extraia as informações do candidato.

Regras:
- areas_interesse: escolha APENAS as que se aplicam desta lista: ${AREAS.join(", ")}
- disponibilidade: infira pelo contexto ou use "a_combinar" se não informado
- pretensao_salarial: número em reais (sem R$, sem formatação), use 0 se não informado
- telefone: com DDD no formato (XX) XXXXX-XXXX
- Se algum campo não for encontrado, use null (exceto areas_interesse e observacoes que podem ser arrays/strings vazias)`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "Arquivo não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeType = file.type || "application/pdf";
    const isPdf = mimeType === "application/pdf";
    const isImage = mimeType.startsWith("image/");

    let anexos: { base64: string; mimeType: string }[] | undefined;
    let prompt: string;

    if (isPdf || isImage) {
      const fileBuffer = await file.arrayBuffer();
      // Chunk-based base64 to avoid call stack overflow on large files
      const uint8 = new Uint8Array(fileBuffer);
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < uint8.length; i += CHUNK) {
        binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);

      anexos = [normalizarAnexo(base64, mimeType)];
      prompt = "Analise este currículo e extraia as informações do candidato.";
    } else {
      // For Word docs or other text-based files, try to read as text
      const text = await file.text();
      prompt = `Analise o seguinte currículo e extraia as informações do candidato.

CONTEÚDO DO CURRÍCULO:
${text.slice(0, 8000)}`;
    }

    const { dados, uso } = await extrairJson<DadosCurriculo>({
      nome: "extrair_dados_curriculo",
      descricao: "Registra os dados do candidato lidos do currículo.",
      schema: SCHEMA_CURRICULO,
      system: SYSTEM,
      prompt,
      anexos,
    });

    console.log(
      `Currículo lido (modelo: ${uso.modelo}, tokens: ${uso.tokens_total}, tempo: ${uso.tempo_ms}ms)`
    );

    return new Response(
      JSON.stringify({ success: true, dados }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro ao extrair dados do currículo:", error);
    return new Response(
      JSON.stringify({
        error: (error instanceof Error && error.message)
          ? error.message
          : "Erro ao processar o currículo",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
