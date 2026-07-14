import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface Message {
  role: string;
  content: string;
}

interface ChatRequest {
  messages: Message[];
  dados_parciais?: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { messages, dados_parciais } = await req.json() as ChatRequest;

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Mensagens inválidas");
    }

    const systemPrompt = `Você é um assistente especializado em criar solicitações para um sistema de gestão.

Seu objetivo é:
1. Conversar naturalmente com o usuário para coletar informações sobre a solicitação
2. Fazer perguntas claras e objetivas quando precisar de mais informações
3. Extrair e estruturar os dados em formato JSON quando tiver informações suficientes

Tipos de Solicitação disponíveis:
- Compra de Material
- Manutenção
- Serviço
- Viagem
- Outros

Prioridades disponíveis:
- baixa: Sem urgência
- normal: Prioridade padrão
- alta: Necessita atenção
- urgente: Requer ação imediata
- critica: Emergência, ação crítica

Campos obrigatórios:
- tipo_solicitacao: tipo da solicitação
- titulo: título resumido (máx 100 caracteres)
- descricao: descrição detalhada do que precisa
- prioridade: nível de prioridade

Campos opcionais (pergunte se necessário):
- local_servico: onde será realizado o serviço/entrega
- equipamento_afetado: se houver equipamento relacionado
- data_limite: prazo desejado
- valor_estimado: valor aproximado
- fornecedor_responsavel: fornecedor preferencial
- itens: lista de itens (para compras)

Quando o usuário fornecer informação suficiente, responda com:
{
  "status": "pronto",
  "dados": { ... dados extraídos ... },
  "mensagem": "Confirmação amigável dos dados"
}

Se precisar de mais informações, pergunte de forma natural e amigável.
Se os dados já existirem em dados_parciais, use-os como base e apenas complemente/atualize.`;

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    if (dados_parciais) {
      allMessages.push({
        role: "system",
        content: `Dados já coletados até agora: ${JSON.stringify(dados_parciais, null, 2)}`
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro OpenAI:", errorText);
      throw new Error(`Erro ao processar: ${errorText}`);
    }

    const data = await response.json();
    const aiMessage = data.choices[0]?.message?.content || "";

    // Tentar extrair JSON da resposta
    let parsedResponse = null;
    const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.log("Resposta não contém JSON válido");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mensagem: parsedResponse?.mensagem || aiMessage,
        status: parsedResponse?.status || "conversando",
        dados: parsedResponse?.dados || null,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});