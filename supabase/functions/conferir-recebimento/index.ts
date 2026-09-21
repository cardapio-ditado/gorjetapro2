import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extrairJson, normalizarAnexo } from "../_shared/ia.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SCHEMA_ITENS_NOTA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      description: "Todos os itens da nota, na ordem em que aparecem",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Nome do produto" },
          codigo: { type: ["string", "null"], description: "Código do produto, se houver" },
          quantidade: { type: "number" },
          unidade: { type: "string", description: "UN, KG, LT, CX..." },
          valor_unitario: { type: "number" },
          valor_total: { type: "number" },
        },
        required: ["descricao", "quantidade", "unidade", "valor_unitario", "valor_total"],
      },
    },
  },
  required: ["itens"],
};

interface ItemPedido {
  descricao: string;
  codigo?: string;
  quantidade_pedida: number;
  unidade: string;
  valor_unitario: number;
}

interface ItemRecebido {
  descricao: string;
  codigo?: string;
  quantidade: number;
  unidade?: string;
  valor_unitario: number;
  valor_total: number;
}

interface ComparacaoItem {
  item_pedido: ItemPedido;
  item_recebido: ItemRecebido | null;
  status: 'ok' | 'divergencia' | 'faltando' | 'extra';
  diferencas: {
    quantidade?: { pedido: number; recebido: number };
    valor_unitario?: { pedido: number; recebido: number };
    descricao?: { pedido: string; recebido: string };
  };
  similarity_score?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const pedidoJson = formData.get("pedido") as string;

    if (!file || !pedidoJson) {
      throw new Error("Arquivo ou dados do pedido não fornecidos");
    }

    console.log(`Iniciando conferência. Tamanho do arquivo: ${file.size} bytes`);

    const pedidoData = JSON.parse(pedidoJson);
    const itensPedido: ItemPedido[] = pedidoData.itens;

    console.log(`Total de itens no pedido: ${itensPedido.length}`);

    const fileBytes = await file.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(fileBytes).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    const prompt = `Analise a nota fiscal e extraia TODOS os itens com suas informações.

IMPORTANTE:
- Extraia TODOS os itens da nota, linha por linha
- Quantidade e valores devem ser números
- Se não houver código, use null
- Seja preciso com os valores`;

    console.log("Enviando documento para a IA...");

    const { dados: parsedData } = await extrairJson<{ itens: ItemRecebido[] }>({
      nome: "registrar_itens_recebidos",
      descricao: "Registra os itens lidos na nota fiscal recebida.",
      schema: SCHEMA_ITENS_NOTA,
      esforco: "high",
      system: "Você é um assistente especializado em extrair informações de notas fiscais brasileiras.",
      prompt,
      anexos: [normalizarAnexo(base64Image, file.type)],
    });

    const itensRecebidos: ItemRecebido[] = parsedData.itens || [];
    console.log(`Total de itens recebidos extraídos: ${itensRecebidos.length}`);
    console.log(`Total de itens no pedido: ${itensPedido.length}`);

    const comparacoes: ComparacaoItem[] = [];

    const normalizeString = (str: string): string => {
      if (!str || typeof str !== 'string') return '';
      try {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '')
          .trim();
      } catch (e) {
        console.error('Erro ao normalizar string:', e);
        return str.toLowerCase().replace(/\s+/g, '').trim();
      }
    };

    // Limitar processamento para evitar loops infinitos
    const maxItens = 100;
    const itensPedidoLimitado = itensPedido.slice(0, maxItens);
    const itensRecebidosLimitado = itensRecebidos.slice(0, maxItens);

    console.log(`Processando ${itensPedidoLimitado.length} itens do pedido`);

    for (const itemPedido of itensPedidoLimitado) {
      let melhorMatch: { item: ItemRecebido | null; score: number } = { item: null, score: 0 };

      for (const itemRecebido of itensRecebidosLimitado) {
        let score = 0;

        // Comparação por código
        if (itemPedido.codigo && itemRecebido.codigo) {
          try {
            const codigoPedidoNorm = normalizeString(itemPedido.codigo);
            const codigoRecebidoNorm = normalizeString(itemRecebido.codigo);
            if (codigoPedidoNorm === codigoRecebidoNorm) {
              score += 10;
            }
          } catch (e) {
            console.error('Erro ao comparar códigos:', e);
          }
        }

        // Comparação por descrição
        try {
          const descPedidoNorm = normalizeString(itemPedido.descricao);
          const descRecebidoNorm = normalizeString(itemRecebido.descricao);

          if (descPedidoNorm === descRecebidoNorm) {
            score += 8;
          } else if (descRecebidoNorm.includes(descPedidoNorm) || descPedidoNorm.includes(descRecebidoNorm)) {
            score += 5;
          } else {
            const palavrasPedido = descPedidoNorm.split(/\s+/).slice(0, 20); // Limitar palavras
            palavrasPedido.forEach(palavra => {
              if (palavra.length > 2 && descRecebidoNorm.includes(palavra)) {
                score += 1;
              }
            });
          }
        } catch (e) {
          console.error('Erro ao comparar descrições:', e);
        }

        if (score > melhorMatch.score) {
          melhorMatch = { item: itemRecebido, score };
        }
      }

      let status: 'ok' | 'divergencia' | 'faltando' | 'extra' = 'ok';
      const diferencas: ComparacaoItem['diferencas'] = {};

      if (!melhorMatch.item || melhorMatch.score < 5) {
        status = 'faltando';
        comparacoes.push({
          item_pedido: itemPedido,
          item_recebido: null,
          status,
          diferencas,
        });
        continue;
      }

      const itemRecebido = melhorMatch.item;

      if (Math.abs(itemRecebido.quantidade - itemPedido.quantidade_pedida) > 0.01) {
        status = 'divergencia';
        diferencas.quantidade = {
          pedido: itemPedido.quantidade_pedida,
          recebido: itemRecebido.quantidade,
        };
      }

      if (Math.abs(itemRecebido.valor_unitario - itemPedido.valor_unitario) > 0.01) {
        status = 'divergencia';
        diferencas.valor_unitario = {
          pedido: itemPedido.valor_unitario,
          recebido: itemRecebido.valor_unitario,
        };
      }

      if (melhorMatch.score < 10) {
        diferencas.descricao = {
          pedido: itemPedido.descricao,
          recebido: itemRecebido.descricao,
        };
      }

      comparacoes.push({
        item_pedido: itemPedido,
        item_recebido: itemRecebido,
        status,
        diferencas,
        similarity_score: melhorMatch.score / 18,
      });

      const index = itensRecebidosLimitado.indexOf(itemRecebido);
      if (index > -1) {
        itensRecebidosLimitado.splice(index, 1);
      }
    }

    // Adicionar itens extras (que não foram matcheados)
    for (const itemExtra of itensRecebidosLimitado) {
      comparacoes.push({
        item_pedido: {
          descricao: '',
          quantidade_pedida: 0,
          unidade: '',
          valor_unitario: 0,
        },
        item_recebido: itemExtra,
        status: 'extra',
        diferencas: {},
      });
    }

    const totalItens = comparacoes.length;
    const itensOk = comparacoes.filter(c => c.status === 'ok').length;
    const itensDivergencia = comparacoes.filter(c => c.status === 'divergencia').length;
    const itensFaltando = comparacoes.filter(c => c.status === 'faltando').length;
    const itensExtras = comparacoes.filter(c => c.status === 'extra').length;

    console.log(`Conferência concluída: ${totalItens} itens processados`);
    console.log(`OK: ${itensOk}, Divergências: ${itensDivergencia}, Faltando: ${itensFaltando}, Extras: ${itensExtras}`);

    return new Response(
      JSON.stringify({
        success: true,
        comparacoes,
        resumo: {
          total: totalItens,
          ok: itensOk,
          divergencias: itensDivergencia,
          faltando: itensFaltando,
          extras: itensExtras,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Erro na edge function:", error);
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