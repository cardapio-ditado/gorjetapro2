import { supabase } from '../lib/supabase';

/**
 * Serviço Centralizado de Movimentações de Estoque
 *
 * Este serviço é o ÚNICO ponto de entrada para criar movimentações de estoque.
 * Garante consistência, rastreabilidade e tratamento correto de saldos negativos.
 */

export interface MovimentacaoInput {
  tipoMovimentacao: 'entrada' | 'saida' | 'transferencia' | 'ajuste_positivo' | 'ajuste_negativo' | 'producao' | 'consumo' | 'perda' | 'venda' | 'devolucao';
  itemId: string;
  quantidade: number;
  custoUnitario?: number;
  estoqueOrigemId?: string;
  estoqueDestinoId?: string;
  dataMovimentacao: string;
  documento?: string;
  observacao?: string;
  origemTipo?: string;
  origemId?: string;
  movimentacaoCompostaId?: string;
}

export interface ResultadoMovimentacao {
  sucesso: boolean;
  movimentacaoId?: string;
  saldoAnterior?: number;
  saldoNovo?: number;
  ficouNegativo?: boolean;
  alertaId?: string;
  erro?: string;
  avisos?: string[];
}

/**
 * Cria uma movimentação de estoque e atualiza o saldo automaticamente
 */
export async function criarMovimentacao(input: MovimentacaoInput): Promise<ResultadoMovimentacao> {
  const avisos: string[] = [];

  try {
    if (!input.itemId) {
      return { sucesso: false, erro: 'Item obrigatório' };
    }

    if (input.quantidade <= 0) {
      return { sucesso: false, erro: 'Quantidade deve ser maior que zero' };
    }

    // Buscar saldo atual
    const estoqueId = input.estoqueOrigemId || input.estoqueDestinoId;
    const { data: saldoAtual } = await supabase
      .from('saldos_estoque')
      .select('quantidade_atual, custo_medio')
      .eq('estoque_id', estoqueId)
      .eq('item_id', input.itemId)
      .maybeSingle();

    const saldoAnterior = saldoAtual?.quantidade_atual || 0;
    const custoAtual = saldoAtual?.custo_medio || 0;

    // Calcular saldo novo
    let saldoNovo = saldoAnterior;
    let ficouNegativo = false;

    if (['entrada', 'ajuste_positivo', 'producao', 'devolucao'].includes(input.tipoMovimentacao)) {
      saldoNovo = saldoAnterior + input.quantidade;
    } else {
      saldoNovo = saldoAnterior - input.quantidade;
    }

    if (saldoNovo < 0 && saldoAnterior >= 0) {
      ficouNegativo = true;
      avisos.push(`⚠️ ATENÇÃO: Esta movimentação deixará o estoque NEGATIVO (${saldoNovo.toFixed(2)})`);
    }

    // Calcular custo médio
    let custoMedio = custoAtual;
    if (['entrada', 'producao'].includes(input.tipoMovimentacao) && input.custoUnitario) {
      const { data: novoCusto } = await supabase
        .rpc('calcular_custo_medio_com_negativo', {
          p_estoque_id: estoqueId,
          p_item_id: input.itemId,
          p_quantidade_entrada: input.quantidade,
          p_custo_entrada: input.custoUnitario,
          p_saldo_atual: saldoAnterior,
          p_custo_atual: custoAtual,
        });

      if (novoCusto) {
        custoMedio = novoCusto;
      }
    }

    // Criar movimentação
    const { data: movimentacao, error: movError } = await supabase
      .from('movimentacoes_estoque')
      .insert({
        tipo_movimentacao: input.tipoMovimentacao,
        item_id: input.itemId,
        quantidade: input.quantidade,
        custo_unitario: input.custoUnitario || 0,
        valor_total: (input.custoUnitario || 0) * input.quantidade,
        estoque_origem_id: input.estoqueOrigemId,
        estoque_destino_id: input.estoqueDestinoId,
        data_movimentacao: input.dataMovimentacao,
        documento: input.documento,
        observacao: input.observacao,
        origem_tipo: input.origemTipo,
        origem_id: input.origemId,
        movimentacao_composta_id: input.movimentacaoCompostaId,
      })
      .select()
      .single();

    if (movError) {
      return { sucesso: false, erro: 'Erro ao criar movimentação: ' + movError.message };
    }

    // Atualizar saldo
    const { error: updateError } = await supabase
      .from('saldos_estoque')
      .upsert({
        estoque_id: estoqueId,
        item_id: input.itemId,
        quantidade_atual: saldoNovo,
        custo_medio: custoMedio,
        valor_total: saldoNovo * custoMedio,
        data_ultima_movimentacao: input.dataMovimentacao,
        atualizado_em: new Date().toISOString(),
      }, {
        onConflict: 'estoque_id,item_id',
      });

    if (updateError) {
      await supabase.from('movimentacoes_estoque').delete().eq('id', movimentacao.id);
      return { sucesso: false, erro: 'Erro ao atualizar saldo: ' + updateError.message };
    }

    return {
      sucesso: true,
      movimentacaoId: movimentacao.id,
      saldoAnterior,
      saldoNovo,
      ficouNegativo,
      avisos: avisos.length > 0 ? avisos : undefined,
    };
  } catch (error: any) {
    return { sucesso: false, erro: 'Erro inesperado: ' + error.message };
  }
}

/**
 * Busca alertas de saldos negativos ativos
 */
export async function buscarAlertasNegativos() {
  const { data, error } = await supabase
    .from('alertas_estoque_negativo')
    .select(`
      *,
      item:itens_estoque(nome, codigo, unidade_medida),
      estoque:estoques(nome)
    `)
    .is('data_regularizacao', null)
    .order('data_ficou_negativo', { ascending: false });

  if (error) {
    console.error('Erro ao buscar alertas:', error);
    return [];
  }

  return data;
}

/**
 * Busca histórico de auditoria de um item
 */
export async function buscarAuditoriaItem(itemId: string, estoqueId?: string) {
  let query = supabase
    .from('auditoria_estoque')
    .select('*')
    .eq('item_id', itemId);

  if (estoqueId) {
    query = query.eq('estoque_id', estoqueId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar auditoria:', error);
    return [];
  }

  return data;
}

/**
 * Calcula estatísticas de saldo negativo
 */
export async function estatisticasNegativos() {
  const { data: alertas } = await supabase
    .from('alertas_estoque_negativo')
    .select('quantidade_negativa, valor_total')
    .is('data_regularizacao', null);

  const { data: saldos } = await supabase
    .from('vw_saldos_consolidados')
    .select('*')
    .eq('status_estoque', 'NEGATIVO');

  return {
    totalItensNegativos: saldos?.length || 0,
    totalAlertasAtivos: alertas?.length || 0,
    valorTotalNegativo: alertas?.reduce((sum, a) => sum + (a.valor_total || 0), 0) || 0,
    itensNegativos: saldos || [],
  };
}
