import { supabase } from '../lib/supabase';

/**
 * SERVIÇO DE PRODUÇÃO — v2 (transacional)
 *
 * Este arquivo NÃO escreve mais em saldos_estoque nem em
 * movimentacoes_estoque. Toda a conclusão de produção acontece
 * dentro da função SQL `processar_producao` (transação atômica e
 * idempotente no Postgres), que:
 *   1. Baixa os insumos gerando movimentações reais (origem_tipo='producao')
 *   2. Dá entrada no produto via fichas_tecnicas.item_produzido_id (FK, nunca por nome)
 *   3. Calcula o custo do produto = custo dos insumos / quantidade aprovada
 *   4. Atualiza o custo médio do produto no saldo
 *   5. Marca reservas como utilizadas e conclui a produção
 * O trigger trg_atualizar_saldos cuida dos saldos. Régua única.
 */

export interface VerificacaoEstoque {
  item_id: string;
  item_nome: string;
  quantidade_necessaria: number;
  quantidade_disponivel: number;
  tem_estoque_suficiente: boolean;
  estoque_id: string;
  estoque_nome: string;
}

export const producaoServiceSimples = {
  /**
   * Verifica se há insumos disponíveis no estoque de produção
   * (somente leitura — sem mudanças de saldo)
   */
  async verificarDisponibilidadeInsumos(
    fichaId: string,
    quantidade: number
  ): Promise<{ disponivel: boolean; detalhes: VerificacaoEstoque[] }> {
    const { data: estoqueProducao } = await supabase
      .from('estoques')
      .select('id, nome')
      .eq('tipo', 'producao')
      .eq('status', true)
      .maybeSingle();

    if (!estoqueProducao) {
      throw new Error('Estoque de produção não encontrado');
    }

    const { data: ingredientes } = await supabase
      .from('ficha_ingredientes')
      .select('item_estoque_id, quantidade, baixa_estoque, itens_estoque(id, nome)')
      .eq('ficha_id', fichaId);

    if (!ingredientes || ingredientes.length === 0) {
      return { disponivel: true, detalhes: [] };
    }

    const verificacoes: VerificacaoEstoque[] = [];
    let todosDisponiveis = true;

    for (const ing of ingredientes) {
      if (ing.baixa_estoque === false) continue;
      if (!ing.item_estoque_id) continue;

      const qtdNecessaria = ing.quantidade * quantidade;

      const { data: saldo } = await supabase
        .from('saldos_estoque')
        .select('quantidade_atual')
        .eq('estoque_id', estoqueProducao.id)
        .eq('item_id', ing.item_estoque_id)
        .maybeSingle();

      const qtdDisponivel = saldo?.quantidade_atual || 0;
      const suficiente = qtdDisponivel >= qtdNecessaria;
      if (!suficiente) todosDisponiveis = false;

      verificacoes.push({
        item_id: ing.item_estoque_id,
        item_nome: (ing as any).itens_estoque?.nome || 'Desconhecido',
        quantidade_necessaria: qtdNecessaria,
        quantidade_disponivel: qtdDisponivel,
        tem_estoque_suficiente: suficiente,
        estoque_id: estoqueProducao.id,
        estoque_nome: estoqueProducao.nome,
      });
    }

    return { disponivel: todosDisponiveis, detalhes: verificacoes };
  },

  /**
   * Reserva insumos para uma produção.
   * ERROS AGORA SOBEM (antes eram engolidos com console.error).
   */
  async reservarInsumos(producaoId: string, detalhes: VerificacaoEstoque[]): Promise<void> {
    const reservas = detalhes.map((d) => ({
      producao_id: producaoId,
      item_id: d.item_id,
      quantidade_reservada: d.quantidade_necessaria,
      estoque_origem_id: d.estoque_id,
      status_reserva: 'reservado',
    }));

    if (reservas.length === 0) return;

    const { error } = await supabase.from('producao_reserva_insumos').insert(reservas);
    if (error) {
      throw new Error('Erro ao reservar insumos: ' + error.message);
    }
  },

  /**
   * Inicia uma produção
   */
  async iniciarProducao(producaoId: string, usuarioId?: string): Promise<void> {
    const isValidUuid =
      usuarioId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuarioId);

    const { error } = await supabase
      .from('producoes')
      .update({
        status: 'em_andamento',
        hora_inicio: new Date().toISOString(),
        usuario_inicio: isValidUuid ? usuarioId : null,
      })
      .eq('id', producaoId);

    if (error) throw error;
  },

  /**
   * Conclui a produção — TUDO acontece na RPC transacional.
   * Se algo falhar, NADA é aplicado (sem estado pela metade)
   * e o erro sobe para a UI mostrar ao usuário.
   */
  async concluirProducao(
    producaoId: string,
    quantidadeProduzida: number,
    quantidadeAprovada: number,
    observacoes?: string,
    usuarioId?: string
  ): Promise<void> {
    const isValidUuid =
      usuarioId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usuarioId);

    const { data, error } = await supabase.rpc('processar_producao', {
      p_producao_id: producaoId,
      p_quantidade_produzida: quantidadeProduzida,
      p_quantidade_aprovada: quantidadeAprovada,
      p_usuario_id: isValidUuid ? usuarioId : null,
      p_observacoes: observacoes || null,
    });

    if (error) {
      throw new Error('Erro ao concluir produção: ' + error.message);
    }

    if (data && data.success === false) {
      // Erros de negócio vindos da RPC (ex.: ficha sem item produzido vinculado)
      throw new Error(data.error || 'Erro ao processar produção');
    }

    if (data?.avisos && Array.isArray(data.avisos) && data.avisos.length > 0) {
      console.warn('Avisos da produção:', data.avisos);
    }
  },

  /**
   * Cancela uma produção e suas reservas
   */
  async cancelarProducao(producaoId: string): Promise<void> {
    const { error: errorReservas } = await supabase
      .from('producao_reserva_insumos')
      .update({ status_reserva: 'cancelado' })
      .eq('producao_id', producaoId)
      .eq('status_reserva', 'reservado');

    if (errorReservas) {
      console.warn('Erro ao cancelar reservas:', errorReservas);
    }

    const { error: errorDelete } = await supabase
      .from('producoes')
      .delete()
      .eq('id', producaoId);

    if (errorDelete) throw errorDelete;
  },
};