import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MAX_FILE_SIZE = 20 * 1024 * 1024;

async function extractFromImage(imageBase64: string, mimeType: string) {
  const startTime = Date.now();

  console.log(`Calling OpenAI with mime type: ${mimeType}, base64 length: ${imageBase64.length}`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Você é um assistente especializado em extração de dados de notas fiscais, pedidos e cupons fiscais brasileiros.

INSTRUÇÕES CRÍTICAS:
1. Leia TODOS os itens do documento com MÁXIMA ATENÇÃO aos detalhes
2. Para CADA item, extraia:
   - Descrição COMPLETA do produto (não abrevie)
   - Código do produto (se visível)
   - Quantidade EXATA (pode ser decimal, ex: 1.5, 2.25)
   - Unidade de medida (UN, KG, LT, CX, etc)
   - Valor unitário PRECISO (pode ter centavos)
   - Valor total do item (quantidade × valor unitário)
3. Números com vírgula são decimais (ex: "1,5" = 1.5 e "10,50" = 10.50)
4. NUNCA invente ou pule itens
5. Se algo não estiver claro, coloque null mas SEMPRE extraia os itens visíveis
6. Calcule valor_total = quantidade × valor_unitario para VALIDAR cada item

EXEMPLOS DE LEITURA CORRETA:
- "ARROZ TIPO 1 5KG" → descricao: "ARROZ TIPO 1 5KG", quantidade: 1, unidade: "UN"
- "TOMATE 2,500 KG" → descricao: "TOMATE", quantidade: 2.5, unidade: "KG"
- "REFRIGERANTE 2L CX C/6" → descricao: "REFRIGERANTE 2L", quantidade: 6, unidade: "UN"

Retorne JSON válido nesta estrutura EXATA:
{
  "emitente": {
    "nome": "string (nome completo do fornecedor)",
    "cnpj": "string ou null (apenas números)"
  },
  "documento": {
    "numero": "string ou null (número da nota/pedido)",
    "serie": "string ou null",
    "data_emissao": "string ou null (formato YYYY-MM-DD)"
  },
  "itens": [
    {
      "descricao": "string (nome COMPLETO do produto)",
      "codigo": "string ou null (código/SKU do produto)",
      "quantidade": number (DECIMAL, ex: 1.5, 2, 10.25)",
      "unidade": "string ou null (UN, KG, LT, CX, PC, etc)",
      "valor_unitario": number (DECIMAL, ex: 10.50, 2.99)",
      "valor_total": number (quantidade × valor_unitario)",
      "desconto": number ou null
    }
  ],
  "totais": {
    "valor_produtos": number ou null,
    "valor_descontos": number ou null,
    "valor_total": number (soma de TODOS os itens)
  },
  "observacoes": "string ou null (informações adicionais)",
  "confidences": {
    "emitente": 0.95 (0.0-1.0, confiança na extração),
    "itens": 0.90 (0.0-1.0, confiança nos itens),
    "totais": 0.95 (0.0-1.0, confiança nos valores)
  }
}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analise esta imagem de nota fiscal/pedido com MÁXIMA ATENÇÃO.

IMPORTANTE:
- Leia TODOS os itens listados, linha por linha
- Extraia TODOS os produtos com seus valores EXATOS
- Use números decimais onde apropriado (ex: 1.5 não 1,5)
- Valide: soma dos itens deve bater com o total
- Se houver tabela de produtos, leia TODAS as linhas

Retorne o JSON completo com TODOS os dados extraídos.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_object",
      },
      max_tokens: 4096,
    }),
  });

  const processingTime = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI API error: ${response.status} - ${errorText}`);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  const extracted = JSON.parse(content);

  return {
    extracted,
    tokens: data.usage?.total_tokens || 0,
    processingTime,
  };
}

async function calculateFileHash(buffer: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      throw new Error("Method not allowed");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new Error("Arquivo não fornecido");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
    }

    let normalizedMimeType = file.type;
    if (file.type === "image/jpg") {
      normalizedMimeType = "image/jpeg";
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const fileHash = await calculateFileHash(buffer);

    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.subarray(i, Math.min(i + CHUNK_SIZE, buffer.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    console.log(`File processed: ${file.name}, size: ${file.size}, type: ${file.type}, normalized: ${normalizedMimeType}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const bucket = "notas-fiscais";
    const fileName = `${new Date().toISOString().split("T")[0]}/${fileHash}.${file.type.split("/")[1]}`;

    await supabase.storage.createBucket(bucket, { public: false }).catch(() => {});

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError && uploadError.message !== "The resource already exists") {
      throw uploadError;
    }

    const { data: urlData } = await supabase.storage
      .from(bucket)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    const signedUrl = urlData?.signedUrl || "";

    const { extracted, tokens, processingTime } = await extractFromImage(base64, normalizedMimeType);

    const somaItens = (extracted.itens || []).reduce(
      (sum: number, item: any) => sum + (Number(item.valor_total) || 0),
      0
    );
    const total = Number(extracted.totais?.valor_total || 0);
    const diff = Math.abs(somaItens - total);

    const auditPayload = {
      arquivo_url: signedUrl,
      arquivo_hash: fileHash,
      request_payload: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
      response_payload: extracted,
      model_used: "gpt-4o",
      tokens_used: tokens,
      processing_time_ms: processingTime,
      success: true,
    };

    const { data: auditData } = await supabase
      .from("ai_extractions")
      .insert(auditPayload)
      .select()
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: auditData?.id,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          hash: fileHash,
          url: signedUrl,
        },
        extracted,
        validation: {
          somaItens: Number(somaItens.toFixed(2)),
          total: Number(total.toFixed(2)),
          diferenca: Number(diff.toFixed(2)),
        },
        meta: {
          tokens,
          processingTime,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
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