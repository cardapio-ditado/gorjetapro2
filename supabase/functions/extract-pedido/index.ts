import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface ItemEstoque {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  unidade_medida: string;
}

async function buscarItensEstoque(supabase: any): Promise<ItemEstoque[]> {
  const { data, error } = await supabase
    .from('itens_estoque')
    .select('id, codigo, nome, categoria, unidade_medida')
    .eq('status', 'ativo')
    .eq('tipo_item', 'insumo')
    .order('nome');

  if (error) {
    console.error('Erro ao buscar itens:', error);
    return [];
  }

  return data || [];
}

function matchItemEstoque(itemDescricao: string, itensEstoque: ItemEstoque[]): string | null {
  const descLower = itemDescricao.toLowerCase().trim();

  let match = itensEstoque.find(item => item.nome.toLowerCase() === descLower);
  if (match) return match.id;

  match = itensEstoque.find(item => item.codigo && item.codigo.toLowerCase() === descLower);
  if (match) return match.id;

  match = itensEstoque.find(item => item.nome.toLowerCase().includes(descLower));
  if (match) return match.id;

  match = itensEstoque.find(item => descLower.includes(item.nome.toLowerCase()));
  if (match) return match.id;

  const palavrasDesc = descLower.split(/\s+/);
  for (const item of itensEstoque) {
    const palavrasItem = item.nome.toLowerCase().split(/\s+/);
    let matches = 0;

    for (const palavra of palavrasDesc) {
      if (palavra.length < 3) continue;
      if (palavrasItem.some(p => p.includes(palavra) || palavra.includes(p))) {
        matches++;
      }
    }

    if (matches >= Math.min(2, palavrasDesc.length)) {
      return item.id;
    }
  }

  return null;
}

async function extractFromImage(imageBase64: string, mimeType: string, itensEstoque: ItemEstoque[]) {
  const startTime = Date.now();

  const itensConhecidos = itensEstoque.slice(0, 100).map(item => ({
    codigo: item.codigo || '',
    nome: item.nome,
    categoria: item.categoria,
    unidade: item.unidade_medida
  }));

  const prompt = `Voc\u00ea \u00e9 um assistente especializado em extra\u00e7\u00e3o de dados de pedidos de compra e notas fiscais.

IMPORTANTE: Este estabelecimento j\u00e1 possui um cadastro de itens no estoque. Ao extrair itens do pedido, voc\u00ea DEVE tentar identificar se correspondem aos itens j\u00e1 cadastrados.

ITENS CADASTRADOS NO ESTOQUE (primeiros 100):
${JSON.stringify(itensConhecidos, null, 2)}

EXTRAIA os seguintes dados do documento:

1. FORNECEDOR/EMITENTE:
   - Nome completo
   - CNPJ (apenas n\u00fameros, sem m\u00e1scara)
   - Telefone e email se vis\u00edveis

2. DOCUMENTO:
   - N\u00famero do pedido/nota
   - S\u00e9rie (se houver)
   - Data de emiss\u00e3o (formato YYYY-MM-DD)
   - Data de entrega prevista (se houver)

3. ITENS DO PEDIDO:
   Para cada item extra\u00eddo, retorne:
   - descricao: descri\u00e7\u00e3o exatamente como aparece no documento
   - codigo: c\u00f3digo do produto (se vis\u00edvel)
   - quantidade: quantidade num\u00e9rica
   - unidade: unidade de medida (kg, un, lt, cx, pc, etc)
   - valor_unitario: pre\u00e7o unit\u00e1rio
   - valor_total: pre\u00e7o total do item
   - item_estoque_match: Se voc\u00ea identificar que este item corresponde a um dos ITENS CADASTRADOS acima, retorne o NOME EXATO do item cadastrado. Caso contr\u00e1rio, deixe vazio.

4. TOTAIS:
   - valor_produtos: soma dos produtos
   - valor_descontos: descontos aplicados
   - valor_frete: valor do frete (se houver)
   - valor_total: valor total do pedido

5. OBSERVA\u00c7\u00d5ES:
   - Condi\u00e7\u00f5es de pagamento
   - Prazo de entrega
   - Outras informa\u00e7\u00f5es relevantes

REGRAS IMPORTANTES:
- Compare cuidadosamente cada item extra\u00eddo com os ITENS CADASTRADOS
- Considere varia\u00e7\u00f5es de nome (ex: \"CERVEJA SKOL LATA 350ML\" pode corresponder a \"Cerveja Skol 350ml\")
- Se n\u00e3o tiver certeza do match, deixe item_estoque_match vazio
- Seja conservador: s\u00f3 fa\u00e7a match se tiver confian\u00e7a
- Retorne apenas JSON v\u00e1lido`;

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
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
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
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  const extracted = JSON.parse(content);

  if (extracted.itens && Array.isArray(extracted.itens)) {
    extracted.itens = extracted.itens.map((item: any) => {
      let itemId = null;

      if (item.item_estoque_match) {
        const matchByName = itensEstoque.find(
          ie => ie.nome.toLowerCase() === item.item_estoque_match.toLowerCase()
        );
        if (matchByName) {
          itemId = matchByName.id;
        }
      }

      if (!itemId) {
        itemId = matchItemEstoque(item.descricao, itensEstoque);
      }

      return {
        ...item,
        item_estoque_id: itemId,
        requer_novo_item: !itemId
      };
    });
  }

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
      throw new Error("Arquivo n\u00e3o fornecido");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Arquivo muito grande. M\u00e1ximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Tipo de arquivo n\u00e3o suportado: ${file.type}`);
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

    console.log(`File processed: ${file.name}, size: ${file.size}, type: ${file.type}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Buscando itens do estoque...');
    const itensEstoque = await buscarItensEstoque(supabase);
    console.log(`${itensEstoque.length} itens encontrados no estoque`);

    const bucket = "pedidos-compra";
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

    console.log('Processando com IA...');
    const { extracted, tokens, processingTime } = await extractFromImage(
      base64,
      normalizedMimeType,
      itensEstoque
    );

    const totalItens = extracted.itens?.length || 0;
    const itensComMatch = extracted.itens?.filter((i: any) => i.item_estoque_id).length || 0;
    const itensNovos = totalItens - itensComMatch;

    console.log(`Matching: ${itensComMatch}/${totalItens} itens encontrados no estoque`);

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
        matching_stats: {
          total_itens: totalItens,
          itens_encontrados: itensComMatch,
          itens_novos: itensNovos,
          taxa_match: totalItens > 0 ? Math.round((itensComMatch / totalItens) * 100) : 0
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