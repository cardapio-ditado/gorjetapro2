import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { entrevista_id, audio_url } = await req.json();

    if (!entrevista_id || !audio_url) {
      return new Response(
        JSON.stringify({ error: 'Dados inválidos' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    // Passo 1: Fazer download do áudio
    console.log('Baixando áudio:', audio_url);
    const audioResponse = await fetch(audio_url);
    if (!audioResponse.ok) {
      throw new Error('Erro ao baixar áudio');
    }
    const audioBlob = await audioResponse.blob();

    // Passo 2: Transcrever áudio usando Whisper
    console.log('Transcrevendo áudio com Whisper...');
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error('Erro Whisper:', errorText);
      throw new Error('Erro na transcrição do áudio');
    }

    const transcriptionData = await transcriptionResponse.json();
    const transcricao = transcriptionData.text;

    console.log('Transcrição concluída, tamanho:', transcricao.length, 'caracteres');

    // Passo 3: Analisar transcrição com GPT
    console.log('Analisando entrevista com GPT...');
    const analysisPrompt = `Você é um especialista em Recursos Humanos analisando uma entrevista de emprego. Analise a seguinte transcrição e forneça uma avaliação detalhada em formato JSON.

TRANSCRIÇÃO DA ENTREVISTA:
${transcricao}

Forneça a análise no seguinte formato JSON:
{
  "pontuacao": 75,
  "recomendacao": "contratar/segunda_entrevista/banco_talentos/recusar",
  "pontos_fortes": ["ponto 1", "ponto 2", "ponto 3"],
  "pontos_fracos": ["ponto 1", "ponto 2"],
  "resumo": "Resumo geral em 2-3 parágrafos sobre o candidato",
  "comunicacao": "Avaliação da comunicação",
  "conhecimento_tecnico": "Avaliação do conhecimento técnico",
  "experiencia": "Avaliação da experiência",
  "fit_cultural": "Avaliação do fit cultural",
  "motivacao": "Avaliação da motivação",
  "sugestoes": ["sugestão 1", "sugestão 2"]
}

Critérios:
- Comunicação: clareza, articulação, confiança
- Conhecimento técnico: experiência relevante, habilidades
- Fit cultural: valores, atitude, comprometimento
- Motivação: interesse na vaga, energia
- Pontuação: 0-100 (>=80 contratar, 60-79 segunda entrevista, 40-59 banco talentos, <40 recusar)`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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

    if (!gptResponse.ok) {
      const errorData = await gptResponse.text();
      console.error('Erro GPT:', errorData);
      throw new Error('Erro na análise da entrevista');
    }

    const gptData = await gptResponse.json();
    const analise = JSON.parse(gptData.choices[0].message.content);

    console.log('Análise concluída');

    // Passo 4: Atualizar no banco de dados
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Calcular duração aproximada (estimativa: 150 palavras por minuto)
    const palavras = transcricao.split(/\s+/).length;
    const duracao_minutos = Math.ceil(palavras / 150);

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/entrevistas_pessoais?id=eq.${entrevista_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          transcricao: transcricao,
          duracao_minutos: duracao_minutos,
          analise_ia: analise,
          pontuacao: analise.pontuacao,
          recomendacao: analise.recomendacao,
          pontos_fortes: analise.pontos_fortes,
          pontos_fracos: analise.pontos_fracos,
          status: 'analisada'
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
        message: 'Entrevista analisada com sucesso',
        transcricao_preview: transcricao.substring(0, 200) + '...',
        analise: analise
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