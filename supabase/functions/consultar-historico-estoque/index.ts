import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface MovimentacaoHistorico {
  id: string;
  data_movimentacao: string;
  tipo_movimentacao: string;
  quantidade: number;
  custo_unitario: number;
  estoque_origem: string;
  estoque_destino: string;
  observacoes: string;
  numero_documento: string;
  fornecedor_nome: string;
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

    const { pergunta } = await req.json();

    if (!pergunta || pergunta.trim() === "") {
      throw new Error("Pergunta n\u00e3o fornecida");
    }

    console.log(`[Consulta] Pergunta recebida: ${pergunta}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const extractionPrompt = `Voc\u00ea \u00e9 um assistente especializado em an\u00e1lise de estoque.

TAREFA: Extrair informa\u00e7\u00f5es da pergunta do usu\u00e1rio sobre movimenta\u00e7\u00f5es de estoque.

PERGUNTA DO USU\u00c1RIO: "${pergunta}"

Analise a pergunta e extraa:
1. item_procurado: O nome do produto/item que o usu\u00e1rio est\u00e1 procurando (ex: "azeite", "cerveja", "carne")
2. tipo_busca: O tipo de informa\u00e7\u00e3o que o usu\u00e1rio quer:
   - "ultima_entrada" - \u00faltima vez que o produto entrou no estoque
   - "ultimas_movimentacoes" - hist\u00f3rico recente de movimenta\u00e7\u00f5es
   - "frequencia_compra" - com que frequ\u00eancia \u00e9 comprado
   - "preco_historico" - hist\u00f3rico de pre\u00e7os
3. periodo_dias: Quantos dias para tr\u00e1s buscar (padr\u00e3o 90 dias)

Retorne APENAS JSON v\u00e1lido no formato:
{
  "item_procurado": "nome do item",
  "tipo_busca": "tipo",
  "periodo_dias": 90
}`;

    console.log('[IA] Extraindo inten\u00e7\u00e3o da pergunta...');

    const extractionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: extractionPrompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        max_tokens: 200,
      }),
    });

    if (!extractionResponse.ok) {
      throw new Error("Erro ao processar pergunta com IA");
    }

    const extractionData = await extractionResponse.json();
    const intencao = JSON.parse(extractionData.choices[0].message.content);

    console.log('[IA] Inten\u00e7\u00e3o extra\u00edda:', intencao);

    const { data: itensEncontrados, error: itensError } = await supabase
      .from('itens_estoque')
      .select('id, nome, codigo, categoria, unidade_medida')
      .ilike('nome', `%${intencao.item_procurado}%`)
      .eq('status', 'ativo')
      .limit(5);

    if (itensError) {
      throw itensError;
    }

    if (!itensEncontrados || itensEncontrados.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          resposta: `N\u00e3o encontrei nenhum item com o nome "${intencao.item_procurado}" no estoque cadastrado. Verifique se o nome est\u00e1 correto ou cadastre o item primeiro.`,
          itens_encontrados: [],
          movimentacoes: [],
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`[DB] ${itensEncontrados.length} itens encontrados`);

    const itemIds = itensEncontrados.map(item => item.id);
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - intencao.periodo_dias);

    const { data: movimentacoes, error: movError } = await supabase
      .from('movimentacoes_estoque')
      .select(`
        id,
        data_movimentacao,
        tipo_movimentacao,
        quantidade,
        custo_unitario,
        observacoes,
        origem:estoque_origem_id(nome),
        destino:estoque_destino_id(nome),
        item:item_id(nome, codigo)
      `)
      .in('item_id', itemIds)
      .gte('data_movimentacao', dataLimite.toISOString())
      .order('data_movimentacao', { ascending: false })
      .limit(50);

    if (movError) {
      console.error('[DB] Erro ao buscar movimenta\u00e7\u00f5es:', movError);
      throw movError;
    }

    console.log(`[DB] ${movimentacoes?.length || 0} movimenta\u00e7\u00f5es encontradas`);

    const { data: entradasCompra, error: comprasError } = await supabase
      .from('itens_entrada_compra')
      .select(`
        quantidade,
        custo_unitario,
        data_recebimento,
        entrada:entrada_compra_id(
          numero_documento,
          data_compra,
          observacoes,
          fornecedor:fornecedor_id(nome)
        )
      `)
      .in('item_id', itemIds)
      .gte('entrada.data_compra', dataLimite.toISOString().split('T')[0])
      .order('entrada.data_compra', { ascending: false, foreignTable: 'entradas_compras' })
      .limit(20);

    if (comprasError) {
      console.log('[DB] Aviso ao buscar compras:', comprasError);
    }

    console.log(`[DB] ${entradasCompra?.length || 0} entradas de compra encontradas`);

    const contexto = {
      itens_encontrados: itensEncontrados,
      movimentacoes: movimentacoes || [],
      entradas_compra: entradasCompra || [],
      periodo_consultado: intencao.periodo_dias,
    };

    const analysisPrompt = `Voc\u00ea \u00e9 um assistente especializado em gest\u00e3o de estoque de restaurantes e bares.

PERGUNTA DO USU\u00c1RIO: "${pergunta}"

DADOS DO SISTEMA:
${JSON.stringify(contexto, null, 2)}

TAREFA: Analise os dados e responda \u00e0 pergunta do usu\u00e1rio de forma clara e objetiva.

INSTRU\u00c7\u00d5ES:
1. Se houver entradas de compra, destaque a \u00daLTIMA compra com:
   - Data exata
   - Fornecedor
   - Quantidade comprada
   - Pre\u00e7o unit\u00e1rio

2. Se solicitado hist\u00f3rico, liste as \u00faltimas movimenta\u00e7\u00f5es com datas

3. Se perguntarem sobre frequ\u00eancia, calcule com base nos dados

4. Sempre formate datas como DD/MM/YYYY

5. Sempre inclua valores monet\u00e1rios em R$

6. Seja conciso mas informativo

7. Se n\u00e3o houver dados suficientes, seja honesto e sugira pr\u00f3ximos passos

Responda em portugu\u00eas brasileiro, de forma profissional mas acess\u00edvel.`;

    console.log('[IA] Gerando an\u00e1lise inteligente...');

    const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!analysisResponse.ok) {
      throw new Error("Erro ao gerar an\u00e1lise");
    }

    const analysisData = await analysisResponse.json();
    const resposta = analysisData.choices[0].message.content;

    console.log('[IA] An\u00e1lise conclu\u00edda com sucesso');

    return new Response(
      JSON.stringify({
        success: true,
        resposta,
        intencao,
        itens_encontrados: itensEncontrados,
        total_movimentacoes: movimentacoes?.length || 0,
        total_compras: entradasCompra?.length || 0,
        dados_completos: contexto,
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