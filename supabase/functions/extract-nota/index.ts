import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsIA as corsHeaders, extrairJson, normalizarAnexo } from "../_shared/ia.ts";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SCHEMA_NOTA = {
  type: "object",
  properties: {
    emitente: {
      type: "object",
      description: "Quem emitiu o documento",
      properties: {
        nome: { type: ["string", "null"], description: "Nome completo do fornecedor" },
        cnpj: { type: ["string", "null"], description: "Apenas números" },
      },
      required: ["nome", "cnpj"],
    },
    documento: {
      type: "object",
      properties: {
        numero: { type: ["string", "null"] },
        serie: { type: ["string", "null"] },
        data_emissao: { type: ["string", "null"], description: "Formato YYYY-MM-DD" },
      },
      required: ["numero", "serie", "data_emissao"],
    },
    itens: {
      type: "array",
      description: "Todos os itens do documento, na ordem em que aparecem",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Nome COMPLETO do produto, sem abreviar" },
          codigo: { type: ["string", "null"], description: "Código ou SKU do produto" },
          quantidade: { type: "number", description: "Decimal. Ex.: 1.5, 2, 10.25" },
          unidade: { type: ["string", "null"], description: "UN, KG, LT, CX, PC..." },
          valor_unitario: { type: "number" },
          valor_total: { type: "number", description: "quantidade x valor_unitario" },
          desconto: { type: ["number", "null"] },
        },
        required: ["descricao", "codigo", "quantidade", "unidade", "valor_unitario", "valor_total"],
      },
    },
    totais: {
      type: "object",
      properties: {
        valor_produtos: { type: ["number", "null"] },
        valor_descontos: { type: ["number", "null"] },
        valor_total: { type: "number", description: "Soma de todos os itens" },
      },
      required: ["valor_total"],
    },
    observacoes: { type: ["string", "null"] },
    confidences: {
      type: "object",
      description: "Confiança de 0 a 1 em cada parte da leitura",
      properties: {
        emitente: { type: "number" },
        itens: { type: "number" },
        totais: { type: "number" },
      },
      required: ["emitente", "itens", "totais"],
    },
  },
  required: ["emitente", "documento", "itens", "totais", "confidences"],
} as const;

async function extractFromImage(imageBase64: string, mimeType: string) {
  console.log(`Lendo documento com a IA: ${mimeType}, base64 length: ${imageBase64.length}`);

  const { dados, uso } = await extrairJson<Record<string, any>>({
    nome: "registrar_documento",
    descricao: "Registra os dados lidos da nota fiscal, pedido ou cupom fiscal.",
    schema: SCHEMA_NOTA,
    esforco: "high",
    anexos: [normalizarAnexo(imageBase64, mimeType)],
    system: `Você é um assistente especializado em extração de dados de notas fiscais, pedidos e cupons fiscais brasileiros.

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
- "REFRIGERANTE 2L CX C/6" → descricao: "REFRIGERANTE 2L", quantidade: 6, unidade: "UN"`,
    prompt: `Analise este documento (nota fiscal, pedido ou cupom) com MÁXIMA ATENÇÃO.

IMPORTANTE:
- Leia TODOS os itens listados, linha por linha
- Extraia TODOS os produtos com seus valores EXATOS
- Use números decimais onde apropriado (ex: 1.5 e não 1,5)
- Valide: a soma dos itens deve bater com o total
- Se houver tabela de produtos, leia TODAS as linhas`,
  });

  return { extracted: dados, uso };
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

    const { extracted, uso } = await extractFromImage(base64, normalizedMimeType);

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
      model_used: uso.modelo,
      tokens_used: uso.tokens_total,
      processing_time_ms: uso.tempo_ms,
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
          tokens: uso.tokens_total,
          processingTime: uso.tempo_ms,
          modelo: uso.modelo,
          custoUsd: uso.custo_usd,
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