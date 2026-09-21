import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extrairJson } from "../_shared/ia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SCHEMA_ANALISE_PRE_ENTREVISTA = {
  type: "object",
  properties: {
    pontos_fortes: {
      type: "array",
      description: "Pontos fortes do candidato, objetivos e específicos",
      items: { type: "string" },
    },
    pontos_fracos: {
      type: "array",
      description: "Pontos fracos do candidato, objetivos e específicos",
      items: { type: "string" },
    },
    resumo: {
      type: "string",
      description: "Um parágrafo com resumo geral do candidato",
    },
    pontuacao: {
      type: "number",
      description: "Pontuação do candidato, de 0 a 100",
    },
    recomendacao: {
      type: "string",
      description:
        'Recomendação final: "aprovar" (pontuação >= 70), "analisar_melhor" (40-69) ou "recusar" (< 40)',
      enum: ["aprovar", "analisar_melhor", "recusar"],
    },
    sugestoes: {
      type: "array",
      description: "Sugestões para o time de RH sobre os próximos passos com este candidato",
      items: { type: "string" },
    },
  },
  required: ["pontos_fortes", "pontos_fracos", "resumo", "pontuacao", "recomendacao", "sugestoes"],
} as const;

interface AnalisePreEntrevista {
  pontos_fortes: string[];
  pontos_fracos: string[];
  resumo: string;
  pontuacao: number;
  recomendacao: "aprovar" | "analisar_melhor" | "recusar";
  sugestoes: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { pre_entrevista_id, conversa } = await req.json();

    if (!pre_entrevista_id || !conversa || !Array.isArray(conversa)) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Preparar o texto da conversa para análise
    const conversaTexto = conversa
      .map((msg: Message) => `${msg.role === 'user' ? 'Candidato' : 'IA'}: ${msg.content}`)
      .join('\n\n');

    const analysisPrompt = `Você é um especialista em Recursos Humanos e análise de entrevistas. Analise a seguinte conversa de pré-entrevista e forneça uma análise detalhada.

CONVERSA:
${conversaTexto}

Critérios de avaliação:
- Comunicação e clareza nas respostas
- Interesse e motivação demonstrados
- Experiência e competências mencionadas
- Alinhamento com valores e cultura
- Profissionalismo e postura

Seja objetivo e específico nos pontos fortes e fracos. A pontuação deve ser de 0 a 100.
Recomendação deve ser: "aprovar" (>=70), "analisar_melhor" (40-69), ou "recusar" (<40).`;

    // Fazer análise com a IA
    const { dados: analise, uso } = await extrairJson<AnalisePreEntrevista>({
      nome: "registrar_analise_pre_entrevista",
      descricao:
        "Registra a análise da conversa de pré-entrevista: pontos fortes e fracos, resumo, pontuação, recomendação e sugestões.",
      schema: SCHEMA_ANALISE_PRE_ENTREVISTA,
      esforco: "high",
      system:
        'Você é um especialista em RH que analisa entrevistas de forma objetiva e construtiva.',
      prompt: analysisPrompt,
    });

    console.log(
      `Análise de pré-entrevista concluída (${uso.modelo}): ${uso.tokens_total} tokens em ${uso.tempo_ms}ms`
    );

    // Atualizar no banco de dados
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/rh_pre_entrevistas?id=eq.${pre_entrevista_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          analise_ia: analise,
          pontuacao: analise.pontuacao,
          recomendacao: analise.recomendacao
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Erro ao atualizar banco:', errorText);
      throw new Error('Erro ao salvar análise');
    }

    return new Response(
      JSON.stringify({
        success: true,
        analise: analise,
        pontuacao: analise.pontuacao,
        recomendacao: analise.recomendacao
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});