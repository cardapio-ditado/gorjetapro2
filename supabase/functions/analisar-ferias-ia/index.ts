import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extrairJson } from "../_shared/ia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnaliseFeriasRequest {
  action: 'analisar_alertas' | 'sugerir_escalas' | 'calcular_periodos';
  colaborador_id?: string;
}

const SISTEMA_FERIAS =
  "Você é um especialista em Recursos Humanos e legislação trabalhista brasileira (CLT). Sempre responda em português do Brasil.";

const SCHEMA_ALERTAS_FERIAS = {
  type: "object",
  properties: {
    resumo_geral: {
      type: "string",
      description: "Resumo geral da situação das férias pendentes",
    },
    alertas_criticos: {
      type: "array",
      description: "Um item para cada alerta crítico (urgente ou alto)",
      items: {
        type: "object",
        properties: {
          colaborador: {
            type: "string",
            description: "Nome do colaborador, exatamente como aparece nos dados enviados",
          },
          situacao: { type: "string", description: "Análise da situação" },
          riscos: {
            type: "array",
            description: "Riscos trabalhistas envolvidos",
            items: { type: "string" },
          },
          recomendacoes: {
            type: "array",
            description: "Recomendações imediatas",
            items: { type: "string" },
          },
          periodos_sugeridos: {
            type: "array",
            description: "Sugestões de período para agendamento",
            items: { type: "string" },
          },
          observacoes: {
            type: "string",
            description: "Considerações sobre fracionamento, se aplicável",
          },
        },
        required: [
          "colaborador",
          "situacao",
          "riscos",
          "recomendacoes",
          "periodos_sugeridos",
          "observacoes",
        ],
      },
    },
    estatisticas: {
      type: "object",
      properties: {
        total_alertas: { type: "number" },
        urgentes: { type: "number" },
        dias_total_vencendo: { type: "number" },
      },
      required: ["total_alertas", "urgentes", "dias_total_vencendo"],
    },
  },
  required: ["resumo_geral", "alertas_criticos", "estatisticas"],
} as const;

const SCHEMA_ESCALA_FERIAS = {
  type: "object",
  properties: {
    escala_sugerida: {
      type: "array",
      description: "Escala de férias sugerida para os próximos 6 meses",
      items: {
        type: "object",
        properties: {
          colaborador_id: { type: "string" },
          nome: { type: "string" },
          funcao: { type: "string" },
          mes_sugerido: { type: "string" },
          periodo_sugerido: { type: "string" },
          dias: { type: "number", description: "Quantidade de dias de férias" },
          justificativa: { type: "string" },
        },
        required: [
          "colaborador_id",
          "nome",
          "funcao",
          "mes_sugerido",
          "periodo_sugerido",
          "dias",
          "justificativa",
        ],
      },
    },
    observacoes_gerais: { type: "string" },
  },
  required: ["escala_sugerida", "observacoes_gerais"],
} as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { action, colaborador_id }: AnaliseFeriasRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Buscar dados de férias
    const feriasResponse = await fetch(
      `${supabaseUrl}/rest/v1/vw_alertas_ferias_pendentes?select=*`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!feriasResponse.ok) {
      throw new Error(`Erro ao buscar alertas: ${feriasResponse.statusText}`);
    }

    const alertas = await feriasResponse.json();

    let prompt = "";
    let analiseDetalhada: any = {};
    let nomeExtracao = "";
    let descricaoExtracao = "";
    let schemaExtracao: Record<string, unknown> = {};

    if (action === 'analisar_alertas') {
      nomeExtracao = "registrar_analise_alertas_ferias";
      descricaoExtracao =
        "Registra a análise dos alertas de férias pendentes, com os alertas críticos detalhados e as estatísticas.";
      schemaExtracao = SCHEMA_ALERTAS_FERIAS;

      prompt = `Você é um especialista em Recursos Humanos e Gestão de Férias trabalhistas no Brasil.

Analise os seguintes alertas de férias pendentes e forneça recomendações práticas:

${JSON.stringify(alertas, null, 2)}

Para cada alerta crítico (urgente ou alto), forneça:
1. Análise da situação
2. Riscos trabalhistas envolvidos
3. Recomendações imediatas
4. Sugestões de período para agendamento
5. Considerações sobre fracionamento (se aplicável)`;

    } else if (action === 'sugerir_escalas') {
      nomeExtracao = "registrar_escala_ferias";
      descricaoExtracao =
        "Registra a escala de férias sugerida para os próximos 6 meses e as observações gerais.";
      schemaExtracao = SCHEMA_ESCALA_FERIAS;

      // Buscar colaboradores ativos
      const colaboradoresResponse = await fetch(
        `${supabaseUrl}/rest/v1/colaboradores?status=eq.ativo&select=*`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );

      const colaboradores = await colaboradoresResponse.json();

      prompt = `Você é um especialista em gestão de escalas e férias.

Com base nos seguintes dados:

ALERTAS DE FÉRIAS:
${JSON.stringify(alertas.slice(0, 10), null, 2)}

COLABORADORES ATIVOS:
${JSON.stringify(colaboradores.slice(0, 20), null, 2)}

Sugira uma escala de férias para os próximos 6 meses que:
1. Priorize os colaboradores com prazos mais próximos
2. Evite ter muitas pessoas da mesma função de férias ao mesmo tempo
3. Considere uma distribuição equilibrada ao longo do semestre
4. Respeite a CLT brasileira`;

    } else if (action === 'calcular_periodos') {
      // Calcular períodos para colaborador específico
      if (!colaborador_id) {
        throw new Error("colaborador_id é obrigatório para calcular_periodos");
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/calcular_periodos_aquisitivos`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_colaborador_id: colaborador_id }),
        }
      );

      if (!response.ok) {
        throw new Error(`Erro ao calcular períodos: ${response.statusText}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Períodos aquisitivos calculados com sucesso",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!prompt) {
      throw new Error(`Ação não suportada: ${action}`);
    }

    // Chamar a IA
    const { dados, uso } = await extrairJson<any>({
      nome: nomeExtracao,
      descricao: descricaoExtracao,
      schema: schemaExtracao,
      esforco: "high",
      system: SISTEMA_FERIAS,
      prompt,
    });

    analiseDetalhada = dados;

    console.log(
      `Análise de férias (${action}) concluída (${uso.modelo}): ${uso.tokens_total} tokens em ${uso.tempo_ms}ms`
    );

    // Salvar análise nos alertas
    if (action === 'analisar_alertas' && analiseDetalhada.alertas_criticos) {
      for (const alerta of analiseDetalhada.alertas_criticos) {
        // Encontrar o alerta correspondente
        const alertaDb = alertas.find((a: any) =>
          a.nome_completo.toLowerCase().includes(alerta.colaborador.toLowerCase())
        );

        if (alertaDb) {
          await fetch(
            `${supabaseUrl}/rest/v1/alertas_ferias?id=eq.${alertaDb.id}`,
            {
              method: "PATCH",
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
              },
              body: JSON.stringify({
                analise_ia: {
                  analise_completa: alerta,
                  gerada_em: new Date().toISOString(),
                },
              }),
            }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        analise: analiseDetalhada,
        total_alertas: alertas.length,
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
