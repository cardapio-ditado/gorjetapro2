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
    console.log('Iniciando processamento...');
    
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error('OPENAI_API_KEY não configurada');
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "OPENAI_API_KEY não configurada. Configure a chave no Supabase Dashboard: Settings > Edge Functions > Secrets" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ ok: false, error: "Nenhum arquivo enviado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Arquivo recebido: ${file.name}, tipo: ${file.type}, tamanho: ${file.size} bytes`);

    if (file.type === 'application/pdf') {
      console.log('PDF detectado - não suportado');
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "PDF não é suportado pela IA. Por favor, tire uma foto do boleto ou converta o PDF para imagem (JPG/PNG)." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      console.log(`Tipo inválido: ${file.type}`);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Formato inválido: ${file.type}. Use JPG ou PNG.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64 = btoa(base64);
    
    const mimeType = file.type;
    console.log(`Imagem convertida para base64, tipo: ${mimeType}`);

    const prompt = `Você é um especialista em extração de dados de boletos bancários e notas fiscais brasileiras.

EXTRAIA os seguintes dados do documento:

1. BENEFICIÁRIO (quem recebe):
   - Nome completo
   - CNPJ (formato: 00.000.000/0000-00)
   - Banco, agência e conta (se visível)

2. VALORES:
   - Valor principal/documento
   - Juros (se houver)
   - Multa (se houver)
   - Desconto (se houver)
   - Valor TOTAL a pagar

3. DATAS:
   - Data de emissão
   - Data de vencimento (IMPORTANTE)
   - Data de competência/referência

4. CÓDIGOS:
   - Código de barras (sequência numérica longa)
   - Linha digitável (se diferente)

5. ANÁLISE INTELIGENTE:
   - Descrição/histórico do pagamento baseada no BENEFICIÁRIO:
     * Se for distribuidora de bebidas/Ambev/Heineken: "Compra de bebidas"
     * Se for açougue/frigorífico: "Compra de carnes e frios"
     * Se for hortifruti/verduras: "Compra de hortifrúti"
     * Se for padaria: "Compra de pães e panificados"
     * Se for laticínios: "Compra de laticínios"
     * Se for empresa de limpeza: "Compra de materiais de limpeza"
     * Se for embalagens: "Compra de embalagens"
     * Se for empresa de gás: "Compra de gás"
     * Se for energia elétrica: "Conta de energia"
     * Se for água/saneamento: "Conta de água"
     * Se for telefonia/internet: "Conta de telefone/internet"
     * Se for aluguel: "Pagamento de aluguel"
     * Se não identificar: Use "Pagamento - [Nome do Beneficiário]"

   - Categoria sugerida baseada no TIPO de fornecedor:
     * "Fornecedores" - distribuidoras, açougues, padarias, etc
     * "Energia" - conta de luz
     * "Água" - conta de água
     * "Telefone/Internet" - telecomunicações
     * "Aluguel" - se for aluguel de imóvel
     * "Impostos" - taxas e impostos
     * "Serviços" - prestação de serviços gerais
     * "Outros" - apenas se realmente não identificar

6. CONFIANÇA (0 a 1 para cada campo principal):
   - beneficiario_nome
   - valor_total
   - vencimento
   - categoria

REGRAS:
- Se não conseguir ler algo, use string vazia ""
- Valores sempre em número (sem R$ ou vírgulas)
- Datas no formato YYYY-MM-DD (use "" se não houver)
- CNPJ sem máscara (apenas números, use "" se não houver)
- Seja conservador na confiança (se duvidar, reduzir)

Retorne APENAS JSON válido no schema especificado.`;

    console.log('Enviando para OpenAI...');

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "boleto_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                beneficiario: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    cnpj: { type: "string" },
                    banco: { type: "string" },
                    agencia: { type: "string" },
                    conta: { type: "string" },
                  },
                  required: ["nome", "cnpj", "banco", "agencia", "conta"],
                  additionalProperties: false,
                },
                valores: {
                  type: "object",
                  properties: {
                    principal: { type: "number" },
                    juros: { type: "number" },
                    multa: { type: "number" },
                    desconto: { type: "number" },
                    total: { type: "number" },
                  },
                  required: ["principal", "juros", "multa", "desconto", "total"],
                  additionalProperties: false,
                },
                datas: {
                  type: "object",
                  properties: {
                    emissao: { type: "string" },
                    vencimento: { type: "string" },
                    competencia: { type: "string" },
                  },
                  required: ["emissao", "vencimento", "competencia"],
                  additionalProperties: false,
                },
                codigo_barras: { type: "string" },
                linha_digitavel: { type: "string" },
                descricao: { type: "string" },
                categoria_sugerida: { type: "string" },
                observacoes: { type: "string" },
                confidences: {
                  type: "object",
                  properties: {
                    beneficiario_nome: { type: "number" },
                    valor_total: { type: "number" },
                    vencimento: { type: "number" },
                    categoria: { type: "number" },
                  },
                  required: ["beneficiario_nome", "valor_total", "vencimento", "categoria"],
                  additionalProperties: false,
                },
              },
              required: ["beneficiario", "valores", "datas", "codigo_barras", "linha_digitavel", "descricao", "categoria_sugerida", "observacoes", "confidences"],
              additionalProperties: false,
            },
          },
        },
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('Erro OpenAI:', errorText);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Erro OpenAI (${openaiResponse.status}): ${errorText.substring(0, 200)}` 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    console.log('Resposta recebida da OpenAI');
    
    const content = openaiData.choices[0].message.content;
    const extracted = JSON.parse(content);

    console.log('Extração concluída com sucesso');

    return new Response(
      JSON.stringify({
        ok: true,
        extracted,
        meta: {
          model: openaiData.model,
          tokens_used: openaiData.usage?.total_tokens || 0,
          arquivo: {
            nome: file.name,
            tamanho: file.size,
            tipo: file.type,
          },
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Erro ao processar boleto:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || "Erro ao processar documento",
        stack: error.stack ? error.stack.substring(0, 500) : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});