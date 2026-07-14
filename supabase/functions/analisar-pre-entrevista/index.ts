import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

    // Fazer análise com a API OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const analysisPrompt = `Você é um especialista em Recursos Humanos e análise de entrevistas. Analise a seguinte conversa de pré-entrevista e forneça uma análise detalhada em formato JSON.

CONVERSA:
${conversaTexto}

Forneça a análise no seguinte formato JSON:
{
  "pontos_fortes": ["ponto 1", "ponto 2", ...],
  "pontos_fracos": ["ponto 1", "ponto 2", ...],
  "resumo": "Um parágrafo com resumo geral do candidato",
  "pontuacao": 75,
  "recomendacao": "aprovar/analisar_melhor/recusar",
  "sugestoes": ["sugestão 1", "sugestão 2", ...]
}

Critérios de avaliação:
- Comunicação e clareza nas respostas
- Interesse e motivação demonstrados
- Experiência e competências mencionadas
- Alinhamento com valores e cultura
- Profissionalismo e postura

Seja objetivo e específico nos pontos fortes e fracos. A pontuação deve ser de 0 a 100.
Recomendação deve ser: "aprovar" (>=70), "analisar_melhor" (40-69), ou "recusar" (<40).`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em RH que analisa entrevistas de forma objetiva e construtiva.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error('Erro OpenAI:', errorData);
      throw new Error('Erro ao comunicar com OpenAI');
    }

    const openaiData = await openaiResponse.json();
    const analise = JSON.parse(openaiData.choices[0].message.content);

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