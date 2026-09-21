import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extrairJson } from "../_shared/ia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CULTURA_DITADO_POPULAR = `
Você é o Agente de Recrutamento do Ditado Popular, um bar cujo DNA é "embriagar os corações de felicidade".

MISSÃO: Embriagar os corações de felicidade.

VISÃO: Ser referência em entretenimento no Mato Grosso, transformando cada visita em celebração.

VALORES QUE VOCÊ DEVE AVALIAR COM PROFUNDIDADE:

1. HOSPITALIDADE
   ✅ Comportamentos POSITIVOS desejados:
      - Sorrir no rosto e chamar o cliente pelo nome, criando um ambiente acolhedor
      - Manter o local organizado e aconchegante para todos
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Ignorar clientes ou deixar o local bagunçado

2. RESPEITO
   ✅ Comportamentos POSITIVOS desejados:
      - Tratar todos como importantes, ouvir e valorizar as pessoas
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Desrespeitar ou ignorar opiniões de colegas ou clientes

3. QUALIDADE
   ✅ Comportamentos POSITIVOS desejados:
      - Servir o melhor chopp e manter tudo limpo
      - Escolher ingredientes de primeira e atenção aos detalhes
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Servir produtos de baixa qualidade ou economizar no errado

4. INOVAÇÃO
   ✅ Comportamentos POSITIVOS desejados:
      - Usar tecnologia como pedidos pelo celular
      - Trazer novidades no cardápio e ouvir ideias
      - Estar atento a novas tendências e adaptar-se rapidamente
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Ficar preso ao jeito antigo ou ignorar novas ideias

5. INICIATIVA E PROATIVIDADE
   ✅ Comportamentos POSITIVOS desejados:
      - Antecipar necessidades e resolver problemas rapidamente
      - Ouvir a equipe e adaptar-se a mudanças
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Esperar por reclamações para agir ou falhar na comunicação

INSTRUÇÕES DE ANÁLISE:
- Avalie se o currículo demonstra alinhamento com CADA um dos 5 valores
- Procure evidências de comportamentos positivos descritos acima
- Identifique sinais de comportamentos negativos (red flags)
- Seja objetivo e construtivo nas recomendações
- LEMBRE-SE: Você é um assistente. A decisão final é SEMPRE humana.
`;

const SCHEMA_ANALISE_CURRICULO = {
  type: "object",
  properties: {
    notas: {
      type: "object",
      description:
        "Uma nota de 0 a 100 para CADA competência obrigatória e desejável. A chave é o nome exato da competência como foi informada; o valor é a nota.",
      additionalProperties: { type: "number" },
    },
    pontuacao_geral: {
      type: "number",
      description: "Pontuação geral do candidato, de 0 a 100",
    },
    pontos_fortes: {
      type: "array",
      description: "Pontos fortes em relação aos valores da empresa",
      items: { type: "string" },
    },
    pontos_fracos: {
      type: "array",
      description: "Pontos fracos e red flags em relação aos valores da empresa",
      items: { type: "string" },
    },
    alinhamento_valores: {
      type: "object",
      description: "Nota de 0 a 100 de alinhamento com cada um dos 5 valores",
      properties: {
        hospitalidade: { type: "number" },
        respeito: { type: "number" },
        qualidade: { type: "number" },
        inovacao: { type: "number" },
        proatividade: { type: "number" },
      },
      required: ["hospitalidade", "respeito", "qualidade", "inovacao", "proatividade"],
    },
    parecer: {
      type: "string",
      description: "Parecer detalhado sobre o candidato",
    },
    recomendacao: {
      type: "string",
      description: "Recomendação final sobre o candidato",
      enum: ["apto", "banco_talentos", "nao_recomendado"],
    },
    justificativa: {
      type: "string",
      description: "Justificativa objetiva e construtiva da recomendação",
    },
  },
  required: [
    "notas",
    "pontuacao_geral",
    "pontos_fortes",
    "pontos_fracos",
    "alinhamento_valores",
    "parecer",
    "recomendacao",
    "justificativa",
  ],
} as const;

interface AnaliseCurriculo {
  notas: Record<string, number>;
  pontuacao_geral: number;
  pontos_fortes: string[];
  pontos_fracos: string[];
  alinhamento_valores: Record<string, number>;
  parecer: string;
  recomendacao: "apto" | "banco_talentos" | "nao_recomendado";
  justificativa: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { candidatura_id, curriculo_texto } = await req.json();

    if (!candidatura_id || !curriculo_texto) {
      return new Response(
        JSON.stringify({ error: "candidatura_id e curriculo_texto são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados da candidatura e vaga
    const { data: candidatura, error: errCandidatura } = await supabase
      .from("rh_candidaturas")
      .select(`
        *,
        vaga:rh_vagas(
          *,
          cargo:rh_cargos(*)
        ),
        candidato:rh_candidatos(*)
      `)
      .eq("id", candidatura_id)
      .single();

    if (errCandidatura || !candidatura) {
      throw new Error("Candidatura não encontrada");
    }

    const cargo = candidatura.vaga.cargo;
    const competenciasObrigatorias = cargo.competencias?.obrigatorias || [];
    const competenciasDesejaveis = cargo.competencias?.desejaveis || [];

    // Montar prompt para análise
    const prompt = `
Analise o currículo abaixo do candidato ${candidatura.candidato.nome} para a vaga de ${candidatura.vaga.titulo}.

MISSÃO DO CARGO: ${cargo.missao}

COMPETÊNCIAS OBRIGATÓRIAS:
${competenciasObrigatorias.map((c: string) => `- ${c}`).join('\n')}

COMPETÊNCIAS DESEJÁVEIS:
${competenciasDesejaveis.map((c: string) => `- ${c}`).join('\n')}

CURRÍCULO:
${curriculo_texto}

Avalie OBJETIVAMENTE:
1. Dê uma nota de 0 a 100 para CADA competência obrigatória e desejável
2. Identifique pontos fortes e fracos em relação aos nossos VALORES (Hospitalidade, Respeito, Qualidade, Inovação, Proatividade)
3. Faça uma recomendação: "apto", "banco_talentos" ou "nao_recomendado"
4. Justifique sua análise de forma objetiva e construtiva
`;

    // Analisar com a IA
    const { dados: analise, uso } = await extrairJson<AnaliseCurriculo>({
      nome: "registrar_analise_curriculo",
      descricao:
        "Registra a análise do currículo do candidato: notas por competência, alinhamento com os valores e a recomendação final.",
      schema: SCHEMA_ANALISE_CURRICULO,
      esforco: "high",
      system: CULTURA_DITADO_POPULAR,
      prompt,
    });

    console.log(
      `Análise de currículo concluída (${uso.modelo}): ${uso.tokens_total} tokens em ${uso.tempo_ms}ms`
    );

    // Atualizar candidatura com análise
    const { error: errUpdate } = await supabase
      .from("rh_candidaturas")
      .update({
        notas: analise.notas,
        pontuacao_geral: analise.pontuacao_geral,
        parecer_ia: analise.parecer,
        recomendacao: analise.recomendacao,
        status: "triagem",
        etapa_atual: "triagem_curriculo"
      })
      .eq("id", candidatura_id);

    if (errUpdate) {
      throw errUpdate;
    }

    return new Response(
      JSON.stringify({
        success: true,
        analise,
        message: "Análise concluída com sucesso"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erro ao analisar currículo:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
