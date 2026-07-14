import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY não configurada");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "Arquivo não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    // Chunk-based base64 to avoid call stack overflow on large files
    const uint8 = new Uint8Array(fileBuffer);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < uint8.length; i += CHUNK) {
      binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);
    const mimeType = file.type || "application/pdf";

    const isPdf = mimeType === "application/pdf";
    const isImage = mimeType.startsWith("image/");

    let messageContent: any[];

    if (isPdf || isImage) {
      const mediaType = isPdf ? "application/pdf" : mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      messageContent = [
        {
          type: isPdf ? "document" : "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64,
          },
        },
        {
          type: "text",
          text: `Analise este currículo e extraia as informações do candidato. Retorne APENAS um JSON válido com a estrutura abaixo (sem texto adicional, sem markdown, apenas o JSON):

{
  "nome": "nome completo",
  "email": "email@exemplo.com",
  "telefone": "(00) 00000-0000",
  "disponibilidade": "imediata|15_dias|30_dias|a_combinar",
  "pretensao_salarial": 0,
  "areas_interesse": ["area1", "area2"],
  "observacoes": "resumo profissional em 2-3 frases descrevendo experiência, habilidades principais e objetivo profissional"
}

Regras:
- areas_interesse: escolha APENAS as que se aplicam desta lista: Cozinha, Bar, Atendimento, Caixa, Delivery, Limpeza, Administração, Marketing, TI, RH, Financeiro, Produção, Logística, Outro
- disponibilidade: infira pelo contexto ou use "a_combinar" se não informado
- pretensao_salarial: número em reais (sem R$, sem formatação), use 0 se não informado
- telefone: com DDD no formato (XX) XXXXX-XXXX
- Se algum campo não for encontrado, use null (exceto areas_interesse e observacoes que podem ser arrays/strings vazias)`,
        },
      ];
    } else {
      // For Word docs or other text-based files, try to read as text
      const text = await file.text();
      messageContent = [
        {
          type: "text",
          text: `Analise o seguinte currículo e extraia as informações do candidato. Retorne APENAS um JSON válido com a estrutura abaixo:

CONTEÚDO DO CURRÍCULO:
${text.slice(0, 8000)}

JSON ESPERADO (retorne apenas isso, sem markdown):
{
  "nome": "nome completo",
  "email": "email@exemplo.com",
  "telefone": "(00) 00000-0000",
  "disponibilidade": "imediata|15_dias|30_dias|a_combinar",
  "pretensao_salarial": 0,
  "areas_interesse": ["area1", "area2"],
  "observacoes": "resumo profissional em 2-3 frases"
}

Regras:
- areas_interesse: escolha APENAS as que se aplicam: Cozinha, Bar, Atendimento, Caixa, Delivery, Limpeza, Administração, Marketing, TI, RH, Financeiro, Produção, Logística, Outro
- disponibilidade: infira pelo contexto ou use "a_combinar"
- pretensao_salarial: número em reais, use 0 se não informado
- Se algum campo não for encontrado, use null`,
        },
      ];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: messageContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erro Anthropic API: ${err}`);
    }

    const result = await response.json();
    const rawText = result.content[0]?.text || "{}";

    // Parse JSON from response
    let dados: any = {};
    try {
      // Remove markdown code blocks if present
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      dados = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from the text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        dados = JSON.parse(match[0]);
      }
    }

    return new Response(
      JSON.stringify({ success: true, dados }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro ao extrair dados do currículo:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
