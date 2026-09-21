import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsIA as corsHeaders, extrairJson } from "../_shared/ia.ts";

interface AnaliseEntrevista {
  pontuacao: number;
  recomendacao: "contratar" | "segunda_entrevista" | "banco_talentos" | "recusar";
  pontos_fortes: string[];
  pontos_fracos: string[];
  resumo: string;
  comunicacao: string;
  conhecimento_tecnico: string;
  experiencia: string;
  fit_cultural: string;
  motivacao: string;
  sugestoes: string[];
}

const SCHEMA_ANALISE = {
  type: "object",
  properties: {
    pontuacao: {
      type: "number",
      description: "Pontuação de 0 a 100 do candidato na entrevista",
    },
    recomendacao: {
      type: "string",
      enum: ["contratar", "segunda_entrevista", "banco_talentos", "recusar"],
      description: "Recomendação final, coerente com a pontuação",
    },
    pontos_fortes: {
      type: "array",
      items: { type: "string" },
      description: "Principais pontos fortes do candidato",
    },
    pontos_fracos: {
      type: "array",
      items: { type: "string" },
      description: "Principais pontos fracos do candidato",
    },
    resumo: {
      type: "string",
      description: "Resumo geral em 2-3 parágrafos sobre o candidato",
    },
    comunicacao: { type: "string", description: "Avaliação da comunicação" },
    conhecimento_tecnico: { type: "string", description: "Avaliação do conhecimento técnico" },
    experiencia: { type: "string", description: "Avaliação da experiência" },
    fit_cultural: { type: "string", description: "Avaliação do fit cultural" },
    motivacao: { type: "string", description: "Avaliação da motivação" },
    sugestoes: {
      type: "array",
      items: { type: "string" },
      description: "Sugestões para a próxima etapa ou para o desenvolvimento do candidato",
    },
  },
  required: [
    "pontuacao",
    "recomendacao",
    "pontos_fortes",
    "pontos_fracos",
    "resumo",
    "comunicacao",
    "conhecimento_tecnico",
    "experiencia",
    "fit_cultural",
    "motivacao",
    "sugestoes",
  ],
} as const;

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

    // A transcrição continua na OpenAI (Whisper): o Claude não lê áudio.
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

    // Passo 3: Analisar transcrição com a IA
    console.log('Analisando entrevista com a IA...');

    const { dados: analise, uso } = await extrairJson<AnaliseEntrevista>({
      nome: "avaliar_entrevista",
      descricao: "Registra a avaliação detalhada do candidato a partir da transcrição da entrevista.",
      schema: SCHEMA_ANALISE,
      esforco: "high",
      system: `Você é um especialista em RH que analisa entrevistas de forma objetiva e construtiva.

Critérios:
- Comunicação: clareza, articulação, confiança
- Conhecimento técnico: experiência relevante, habilidades
- Fit cultural: valores, atitude, comprometimento
- Motivação: interesse na vaga, energia
- Pontuação: 0-100 (>=80 contratar, 60-79 segunda entrevista, 40-59 banco talentos, <40 recusar)`,
      prompt: `Você é um especialista em Recursos Humanos analisando uma entrevista de emprego. Analise a seguinte transcrição e forneça uma avaliação detalhada.

TRANSCRIÇÃO DA ENTREVISTA:
${transcricao}`,
    });

    console.log(
      `Análise concluída (modelo: ${uso.modelo}, tokens: ${uso.tokens_total}, tempo: ${uso.tempo_ms}ms)`
    );

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
      JSON.stringify({
        error: (error instanceof Error && error.message) ? error.message : 'Erro interno',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
