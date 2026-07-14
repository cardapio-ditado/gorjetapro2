import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { token, mensagem, conversa_anterior, vaga_info, cargo_info } = await req.json();

    if (!token || !mensagem) {
      return new Response(
        JSON.stringify({ error: 'Token e mensagem são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construir o contexto do sistema com informações da vaga
    const systemPrompt = `Você é um assistente de RH especializado em pré-entrevistas.

VAGA: ${vaga_info?.titulo || 'Não especificado'}
CARGO: ${cargo_info?.nome || 'Não especificado'}
DESCRIÇÃO: ${vaga_info?.descricao || 'Não especificado'}
REQUISITOS: ${vaga_info?.requisitos || 'Não especificado'}

Sua missão é conduzir uma pré-entrevista natural e amigável para coletar informações importantes do candidato:

1. **Motivação**: Por que se interessou pela vaga?
2. **Experiência**: Experiências relevantes para o cargo
3. **Competências**: Habilidades técnicas e comportamentais
4. **Disponibilidade**: Horários, regime de trabalho, expectativas salariais
5. **Fit Cultural**: Valores, estilo de trabalho, objetivos de carreira

DIRETRIZES:
- Seja conversacional e amigável
- Faça uma pergunta de cada vez
- Adapte as perguntas com base nas respostas anteriores
- Busque aprofundar respostas superficiais
- Identifique red flags (falta de preparo, desalinhamento, etc.)
- Após coletar informações suficientes (5-8 perguntas), agradeça e finalize

IMPORTANTE:
- Use português brasileiro
- Mantenha tom profissional mas amigável
- Seja objetivo e eficiente
- Não faça perguntas pessoais inadequadas (idade, estado civil, etc.)`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...(conversa_anterior || []),
      { role: 'user', content: mensagem }
    ];

    // Chamar OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('Erro OpenAI:', error);
      throw new Error('Erro ao processar com IA');
    }

    const openaiData = await openaiResponse.json();
    const resposta = openaiData.choices[0].message.content;

    return new Response(
      JSON.stringify({ resposta }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});