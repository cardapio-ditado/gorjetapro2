import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnaliseFeriasRequest {
  action: 'analisar_alertas' | 'sugerir_escalas' | 'calcular_periodos';
  colaborador_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { action, colaborador_id }: AnaliseFeriasRequest = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

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

    if (action === 'analisar_alertas') {
      prompt = `Você é um especialista em Recursos Humanos e Gestão de Férias trabalhistas no Brasil.

Analise os seguintes alertas de férias pendentes e forneça recomendações práticas:

${JSON.stringify(alertas, null, 2)}

Para cada alerta crítico (urgente ou alto), forneça:
1. Análise da situação
2. Riscos trabalhistas envolvidos
3. Recomendações imediatas
4. Sugestões de período para agendamento
5. Considerações sobre fracionamento (se aplicável)

Responda em formato JSON estruturado com as seguintes chaves:
{
  "resumo_geral": "string",
  "alertas_criticos": [
    {
      "colaborador": "string",
      "situacao": "string",
      "riscos": ["string"],
      "recomendacoes": ["string"],
      "periodos_sugeridos": ["string"],
      "observacoes": "string"
    }
  ],
  "estatisticas": {
    "total_alertas": number,
    "urgentes": number,
    "dias_total_vencendo": number
  }
}`;

    } else if (action === 'sugerir_escalas') {
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
4. Respeite a CLT brasileira

Responda em formato JSON:
{
  "escala_sugerida": [
    {
      "colaborador_id": "string",
      "nome": "string",
      "funcao": "string",
      "mes_sugerido": "string",
      "periodo_sugerido": "string",
      "dias": number,
      "justificativa": "string"
    }
  ],
  "observacoes_gerais": "string"
}`;

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

    // Chamar OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Você é um especialista em Recursos Humanos e legislação trabalhista brasileira (CLT). Sempre responda em português do Brasil e em formato JSON válido.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      throw new Error(`Erro na OpenAI: ${errorData}`);
    }

    const openaiData = await openaiResponse.json();
    const analiseTexto = openaiData.choices[0].message.content;

    // Parse do JSON retornado pela IA
    try {
      analiseDetalhada = JSON.parse(analiseTexto);
    } catch (e) {
      // Se não conseguir fazer parse, retornar como texto
      analiseDetalhada = {
        analise_texto: analiseTexto,
        erro_parse: "Não foi possível fazer parse do JSON",
      };
    }

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
