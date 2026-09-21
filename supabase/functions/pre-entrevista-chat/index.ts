import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { responderTexto } from "../_shared/ia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    // O histórico vai separado do system: a instrução de sistema é um campo próprio
    const historico = ((conversa_anterior || []) as Message[])
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));

    // A conversa salva começa com a mensagem de boas-vindas da IA, mas o histórico
    // precisa começar por uma fala do candidato. Recolocamos a abertura que o
    // front-end envia no início da pré-entrevista.
    if (historico.length > 0 && historico[0].role === 'assistant') {
      historico.unshift({
        role: 'user',
        content: 'Olá! Estou pronto para começar a pré-entrevista.',
      });
    }

    // Chamar a IA
    const { dados: resposta, uso } = await responderTexto({
      system: systemPrompt,
      prompt: mensagem,
      historico,
      maxTokens: 2000,
      esforco: 'low',
    });

    console.log(
      `Resposta da pré-entrevista gerada (${uso.modelo}): ${uso.tokens_total} tokens em ${uso.tempo_ms}ms`
    );

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