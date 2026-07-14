import { supabase } from '../lib/supabase';
import { getDataHoraAtualISO } from '../lib/dayjs';

export interface MovimentacaoEstoqueData {
  tipo: 'entrada' | 'saida' | 'ajuste' | 'producao';
  origem_tipo: 'compra' | 'producao' | 'ajuste' | 'requisicao' | 'devolucao';
  origem_id: string;
  estoque_id: string;
  item_id?: string;
  item_descricao: string;
  quantidade: number;
  custo_unitario: number;
  observacoes?: string;
}

/**
 * Cria movimentações de estoque a partir de uma compra
 * Hook executado após confirmar recebimento de compra
 */
export async function criarMovimentacoesDeCompra(
  compraId: string,
  estoqueDestinoId: string
): Promise<void> {
  try {
    // Buscar itens da compra
    const { data: itensCompra, error: errorItens } = await supabase
      .from('compras_itens')
      .select('*')
      .eq('compra_id', compraId);

    if (errorItens) {
      console.error('Erro ao buscar itens da compra:', errorItens);
      throw errorItens;
    }

    if (!itensCompra || itensCompra.length === 0) {
      console.warn('Nenhum item encontrado para a compra:', compraId);
      return;
    }

    // Criar movimentações para cada item
    const movimentacoes = itensCompra
      .filter(item => item.quantidade_recebida && item.quantidade_recebida > 0)
      .map(item => ({
        tipo_movimentacao: 'entrada',
        origem_tipo: 'compra',
        origem_id: compraId,
        estoque_destino_id: estoqueDestinoId,
        item_id: item.item_id,
        item_descricao: item.item_nome,
        quantidade: item.quantidade_recebida,
        custo_unitario: item.custo_unitario,
        custo_total: item.quantidade_recebida * item.custo_unitario,
        data_movimentacao: getDataHoraAtualISO(),
        motivo: 'Entrada por compra',
        observacoes: `Compra recebida - ${item.item_nome}`,
      }));

    if (movimentacoes.length === 0) {
      console.warn('Nenhum item com quantidade recebida > 0');
      return;
    }

    // Inserir movimentações
    const { error: errorMov } = await supabase
      .from('movimentacoes_estoque')
      .insert(movimentacoes);

    if (errorMov) {
      console.error('Erro ao criar movimentações:', errorMov);
      throw errorMov;
    }

    console.log(`✅ ${movimentacoes.length} movimentações criadas para compra ${compraId}`);
  } catch (error) {
    console.error('Erro no hook de movimentação de estoque:', error);
    // Não lançar erro para não bloquear o fluxo principal
    // mas registrar para auditoria
  }
}

/**
 * Cria uma movimentação manual de estoque
 */
export async function criarMovimentacaoManual(
  data: MovimentacaoEstoqueData
): Promise<void> {
  const movimentacao = {
    tipo_movimentacao: data.tipo,
    origem_tipo: data.origem_tipo,
    origem_id: data.origem_id,
    estoque_destino_id: data.estoque_id,
    item_id: data.item_id || null,
    item_descricao: data.item_descricao,
    quantidade: data.quantidade,
    custo_unitario: data.custo_unitario,
    custo_total: data.quantidade * data.custo_unitario,
    data_movimentacao: new Date().toISOString(),
    observacoes: data.observacoes,
  };

  const { error } = await supabase
    .from('movimentacoes_estoque')
    .insert(movimentacao);

  if (error) {
    console.error('Erro ao criar movimentação manual:', error);
    throw error;
  }
}

/**
 * Busca movimentações por origem
 */
export async function buscarMovimentacoesPorOrigem(
  origemTipo: string,
  origemId: string
) {
  const { data, error } = await supabase
    .from('movimentacoes_estoque')
    .select('*')
    .eq('origem_tipo', origemTipo)
    .eq('origem_id', origemId)
    .order('data_movimentacao', { ascending: false });

  if (error) {
    console.error('Erro ao buscar movimentações:', error);
    throw error;
  }

  return data || [];
}

/**
 * Busca movimentações por item
 */
export async function buscarMovimentacoesPorItem(
  itemId: string,
  dataInicio?: string,
  dataFim?: string
) {
  let query = supabase
    .from('movimentacoes_estoque')
    .select('*')
    .eq('item_id', itemId);

  if (dataInicio) {
    query = query.gte('data_movimentacao', dataInicio);
  }

  if (dataFim) {
    query = query.lte('data_movimentacao', dataFim);
  }

  const { data, error } = await query.order('data_movimentacao', { ascending: false });

  if (error) {
    console.error('Erro ao buscar movimentações:', error);
    throw error;
  }

  return data || [];
}
