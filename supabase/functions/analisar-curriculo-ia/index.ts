import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CULTURA_DITADO_POPULAR = `
Você é o Agente de Recrutamento do Ditado Popular, um bar cujo DNA é "embriagar os corações de felicidade".

MISSÃO: Embriagar os corações de felicidade.

VISÃO: Ser referência em entretenimento no Mato Grosso, transformando cada visita em celebração.

VALORES QUE VOCÊ DEVE AVALIAR COM PROFUNDIDADE:

1. HOSPITALIDADE
   ✅ Comportamentos POSITIVOS desejados:
      - Sorrir no rosto e chamar o cliente pelo nome, criando um ambiente acolhedor
      - Manter o local organizado e aconchegante para todos
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Ignorar clientes ou deixar o local bagunçado

2. RESPEITO
   ✅ Comportamentos POSITIVOS desejados:
      - Tratar todos como importantes, ouvir e valorizar as pessoas
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Desrespeitar ou ignorar opiniões de colegas ou clientes

3. QUALIDADE
   ✅ Comportamentos POSITIVOS desejados:
      - Servir o melhor chopp e manter tudo limpo
      - Escolher ingredientes de primeira e atenção aos detalhes
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Servir produtos de baixa qualidade ou economizar no errado

4. INOVAÇÃO
   ✅ Comportamentos POSITIVOS desejados:
      - Usar tecnologia como pedidos pelo celular
      - Trazer novidades no cardápio e ouvir ideias
      - Estar atento a novas tendências e adaptar-se rapidamente
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Ficar preso ao jeito antigo ou ignorar novas ideias

5. INICIATIVA E PROATIVIDADE
   ✅ Comportamentos POSITIVOS desejados:
      - Antecipar necessidades e resolver problemas rapidamente
      - Ouvir a equipe e adaptar-se a mudanças
   ❌ Comportamentos NEGATIVOS inaceitáveis:
      - Esperar por reclamações para agir ou falhar na comunicação

INSTRUÇÕES DE ANÁLISE:
- Avalie se o currículo demonstra alinhamento com CADA um dos 5 valores
- Procure evidências de comportamentos positivos descritos acima
- Identifique sinais de comportamentos negativos (red flags)
- Seja objetivo e construtivo nas recomendações
- LEMBRE-SE: Você é um assistente. A decisão final é SEMPRE humana.
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { candidatura_id, curriculo_texto } = await req.json();

    if (!candidatura_id || !curriculo_texto) {
      return new Response(
        JSON.stringify({ error: "candidatura_id e curriculo_texto são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados da candidatura e vaga
    const { data: candidatura, error: errCandidatura } = await supabase
      .from("rh_candidaturas")
      .select(`
        *,
        vaga:rh_vagas(
          *,
          cargo:rh_cargos(*)
        ),
        candidato:rh_candidatos(*)
      `)
      .eq("id", candidatura_id)
      .single();

    if (errCandidatura || !candidatura) {
      throw new Error("Candidatura não encontrada");
    }

    const cargo = candidatura.vaga.cargo;
    const competenciasObrigatorias = cargo.competencias?.obrigatorias || [];
    const competenciasDesejaveis = cargo.competencias?.desejaveis || [];

    // Montar prompt para análise
    const prompt = `
Analise o currículo abaixo do candidato ${candidatura.candidato.nome} para a vaga de ${candidatura.vaga.titulo}.

MISSÃO DO CARGO: ${cargo.missao}

COMPETÊNCIAS OBRIGATÓRIAS:
${competenciasObrigatorias.map((c: string) => `- ${c}`).join('\n')}

COMPETÊNCIAS DESEJÁVEIS:
${competenciasDesejaveis.map((c: string) => `- ${c}`).join('\n')}

CURRÍCULO:
${curriculo_texto}

Avalie OBJETIVAMENTE:
1. Dê uma nota de 0 a 100 para CADA competência obrigatória e desejável
2. Identifique pontos fortes e fracos em relação aos nossos VALORES (Hospitalidade, Respeito, Qualidade, Inovação, Proatividade)
3. Faça uma recomendação: "apto", "banco_talentos" ou "nao_recomendado"
4. Justifique sua análise de forma objetiva e construtiva

Responda APENAS em JSON no formato:
{
  "notas": {"competencia": nota},
  "pontuacao_geral": numero_0_a_100,
  "pontos_fortes": ["ponto1", "ponto2"],
  "pontos_fracos": ["ponto1", "ponto2"],
  "alinhamento_valores": {"hospitalidade": nota, "respeito": nota, "qualidade": nota, "inovacao": nota, "proatividade": nota},
  "parecer": "texto_detalhado",
  "recomendacao": "apto" | "banco_talentos" | "nao_recomendado",
  "justificativa": "texto"
}
`;

    // Chamar OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: CULTURA_DITADO_POPULAR },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      throw new Error(`Erro OpenAI: ${errorData}`);
    }

    const openaiData = await openaiResponse.json();
    const analise = JSON.parse(openaiData.choices[0].message.content);

    // Atualizar candidatura com análise
    const { error: errUpdate } = await supabase
      .from("rh_candidaturas")
      .update({
        notas: analise.notas,
        pontuacao_geral: analise.pontuacao_geral,
        parecer_ia: analise.parecer,
        recomendacao: analise.recomendacao,
        status: "triagem",
        etapa_atual: "triagem_curriculo"
      })
      .eq("id", candidatura_id);

    if (errUpdate) {
      throw errUpdate;
    }

    return new Response(
      JSON.stringify({
        success: true,
        analise,
        message: "Análise concluída com sucesso"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erro ao analisar currículo:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
