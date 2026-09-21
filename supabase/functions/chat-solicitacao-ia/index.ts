import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsIA as corsHeaders, ErroIA, extrairJson } from "../_shared/ia.ts";

interface Message {
  role: string;
  content: string;
}

interface ChatRequest {
  messages: Message[];
  dados_parciais?: any;
}

/** Histórico no formato que a camada de IA espera. */
type Turno = { role: "user" | "assistant"; content: string };

interface RespostaChat {
  status: "conversando" | "pronto";
  mensagem: string;
  dados: Record<string, any> | null;
}

const SCHEMA_CHAT = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["conversando", "pronto"],
      description:
        "Use 'pronto' apenas quando todos os campos obrigatórios estiverem coletados; caso contrário, 'conversando'.",
    },
    mensagem: {
      type: "string",
      description:
        "O que dizer ao usuário: a pergunta seguinte, de forma natural e amigável, ou a confirmação amigável dos dados quando status for 'pronto'.",
    },
    dados: {
      type: ["object", "null"],
      description:
        "Dados da solicitação. Deixe null enquanto ainda faltarem informações obrigatórias; preencha quando status for 'pronto'.",
      properties: {
        tipo_solicitacao: {
          type: "string",
          enum: ["Compra de Material", "Manutenção", "Serviço", "Viagem", "Outros"],
          description: "Tipo da solicitação",
        },
        titulo: { type: "string", description: "Título resumido, no máximo 100 caracteres" },
        descricao: { type: "string", description: "Descrição detalhada do que precisa" },
        prioridade: {
          type: "string",
          enum: ["baixa", "normal", "alta", "urgente", "critica"],
          description: "Nível de prioridade",
        },
        local_servico: {
          type: ["string", "null"],
          description: "Onde será realizado o serviço/entrega",
        },
        equipamento_afetado: {
          type: ["string", "null"],
          description: "Equipamento relacionado, se houver",
        },
        data_limite: { type: ["string", "null"], description: "Prazo desejado, formato YYYY-MM-DD" },
        valor_estimado: { type: ["number", "null"], description: "Valor aproximado em reais" },
        fornecedor_responsavel: { type: ["string", "null"], description: "Fornecedor preferencial" },
        itens: {
          type: ["array", "null"],
          description: "Lista de itens, para solicitações de compra",
          items: {
            type: "object",
            properties: {
              descricao: { type: "string" },
              quantidade: { type: ["number", "null"] },
              unidade: { type: ["string", "null"] },
              valor_unitario: { type: ["number", "null"] },
            },
            required: ["descricao"],
          },
        },
      },
      required: ["tipo_solicitacao", "titulo", "descricao", "prioridade"],
    },
  },
  required: ["status", "mensagem", "dados"],
} as const;

/**
 * Converte o histórico do front para o formato da IA: descarta mensagens
 * vazias, começa sempre por uma fala do usuário e funde falas seguidas do
 * mesmo papel.
 */
function montarHistorico(mensagens: Message[]): Turno[] {
  const historico: Turno[] = [];

  for (const m of mensagens) {
    const papel: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";
    const texto = (m.content ?? "").trim();
    if (!texto) continue;
    if (historico.length === 0 && papel !== "user") continue;

    const ultimo = historico[historico.length - 1];
    if (ultimo && ultimo.role === papel) {
      ultimo.content = `${ultimo.content}\n\n${texto}`;
    } else {
      historico.push({ role: papel, content: texto });
    }
  }

  return historico;
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

    const turnos = montarHistorico(messages);
    const ultimo = turnos[turnos.length - 1];

    if (!ultimo || ultimo.role !== "user") {
      throw new Error("Mensagens inválidas");
    }

    const historico = turnos.slice(0, -1);
    const prompt = ultimo.content;

    let systemPrompt = `Você é um assistente especializado em criar solicitações para um sistema de gestão.

Seu objetivo é:
1. Conversar naturalmente com o usuário para coletar informações sobre a solicitação
2. Fazer perguntas claras e objetivas quando precisar de mais informações
3. Extrair e estruturar os dados quando tiver informações suficientes

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

Quando o usuário fornecer informação suficiente, use status "pronto", preencha os dados
extraídos e escreva uma confirmação amigável dos dados na mensagem.

Se precisar de mais informações, use status "conversando", deixe os dados em branco e
pergunte de forma natural e amigável.`;

    if (dados_parciais) {
      systemPrompt +=
        `\n\nDados já coletados até agora: ${JSON.stringify(dados_parciais, null, 2)}
Use-os como base e apenas complemente/atualize.`;
    }

    const { dados: resposta } = await extrairJson<RespostaChat>({
      nome: "responder_solicitacao",
      descricao:
        "Responde ao usuário no chat e, quando houver informação suficiente, devolve os dados estruturados da solicitação.",
      schema: SCHEMA_CHAT,
      system: systemPrompt,
      prompt,
      historico,
    });

    return new Response(
      JSON.stringify({
        success: true,
        mensagem: resposta.mensagem || "",
        status: resposta.status || "conversando",
        dados: resposta.dados || null,
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
        error: error instanceof ErroIA || error instanceof Error
          ? error.message
          : "Erro desconhecido",
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
