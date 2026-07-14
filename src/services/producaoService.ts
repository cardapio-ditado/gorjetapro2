import { supabase } from '../lib/supabase';

export interface VerificacaoEstoque {
  item_id: string;
  item_nome: string;
  quantidade_necessaria: number;
  quantidade_disponivel: number;
  tem_estoque_suficiente: boolean;
  estoque_id: string;
  estoque_nome: string;
}

export interface ReservaInsumo {
  item_id: string;
  quantidade_reservada: number;
  estoque_origem_id: string;
}

export const producaoService = {
  async verificarDisponibilidadeInsumos(
    fichaId: string,
    quantidade: number
  ): Promise<{ disponivel: boolean; detalhes: VerificacaoEstoque[] }> {
    try {
      // Buscar estoque de produção
      const { data: estoqueProducao, error: errorEstoque } = await supabase
        .from('estoques')
        .select('id, nome')
        .eq('tipo', 'producao')
        .eq('status', true)
        .maybeSingle();

      if (errorEstoque) throw errorEstoque;

      if (!estoqueProducao) {
        throw new Error('Estoque de produção não encontrado. Configure um estoque com tipo "producao".');
      }

      const { data: ingredientes, error: errorIngredientes } = await supabase
        .from('ficha_ingredientes')
        .select(`
          item_estoque_id,
          quantidade,
          itens_estoque (
            id,
            nome,
            unidade_medida
          )
        `)
        .eq('ficha_id', fichaId);

      if (errorIngredientes) throw errorIngredientes;

      const verificacoes: VerificacaoEstoque[] = [];
      let todosDisponiveis = true;

      for (const ingrediente of ingredientes || []) {
        const quantidadeNecessaria = ingrediente.quantidade * quantidade;

        // Verificar APENAS no estoque de produção
        const { data: saldo, error: errorSaldo } = await supabase
          .from('saldos_estoque')
          .select('quantidade_atual')
          .eq('estoque_id', estoqueProducao.id)
          .eq('item_id', ingrediente.item_estoque_id)
          .maybeSingle();

        if (errorSaldo) throw errorSaldo;

        const quantidadeDisponivel = saldo?.quantidade_atual || 0;
        const temEstoqueSuficiente = quantidadeDisponivel >= quantidadeNecessaria;

        if (!temEstoqueSuficiente) {
          todosDisponiveis = false;
        }

        verificacoes.push({
          item_id: ingrediente.item_estoque_id,
          item_nome: ingrediente.itens_estoque?.nome || 'Desconhecido',
          quantidade_necessaria: quantidadeNecessaria,
          quantidade_disponivel: quantidadeDisponivel,
          tem_estoque_suficiente: temEstoqueSuficiente,
          estoque_id: estoqueProducao.id,
          estoque_nome: estoqueProducao.nome
        });
      }

      return {
        disponivel: todosDisponiveis,
        detalhes: verificacoes
      };
    } catch (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      throw error;
    }
  },

  async reservarInsumos(producaoId: string, reservas: ReservaInsumo[]): Promise<void> {
    try {
      const reservasParaInserir = reservas.map(r => ({
        producao_id: producaoId,
        item_id: r.item_id,
        quantidade_reservada: r.quantidade_reservada,
        estoque_origem_id: r.estoque_origem_id,
        status_reserva: 'reservado'
      }));

      const { error } = await supabase
        .from('producao_reserva_insumos')
        .insert(reservasParaInserir);

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao reservar insumos:', error);
      throw error;
    }
  },

  async cancelarReservas(producaoId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('producao_reserva_insumos')
        .update({ status_reserva: 'cancelado' })
        .eq('producao_id', producaoId)
        .eq('status_reserva', 'reservado');

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao cancelar reservas:', error);
      throw error;
    }
  },

  async iniciarProducao(producaoId: string, usuarioId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('producoes')
        .update({
          status: 'em_andamento',
          hora_inicio: new Date().toISOString(),
          usuario_inicio: usuarioId || null
        })
        .eq('id', producaoId);

      if (error) throw error;

      await this.registrarMudancaStatus(
        producaoId,
        'planejado',
        'em_andamento',
        usuarioId || null,
        'Produção iniciada'
      );
    } catch (error) {
      console.error('Erro ao iniciar produção:', error);
      throw error;
    }
  },

  async pausarProducao(producaoId: string, usuarioId: string, motivo: string): Promise<void> {
    try {
      await this.registrarMudancaStatus(
        producaoId,
        'em_andamento',
        'pausado',
        usuarioId || null,
        motivo
      );
    } catch (error) {
      console.error('Erro ao pausar produção:', error);
      throw error;
    }
  },

  async concluirProducao(
    producaoId: string,
    usuarioId: string,
    dados: {
      quantidade_produzida: number;
      quantidade_aprovada: number;
      observacoes?: string;
    }
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('producoes')
        .update({
          status: 'concluido',
          hora_fim: new Date().toISOString(),
          usuario_conclusao: usuarioId || null,
          quantidade_produzida: dados.quantidade_produzida,
          quantidade_aprovada: dados.quantidade_aprovada,
          quantidade_rejeitada: dados.quantidade_produzida - dados.quantidade_aprovada,
          observacoes: dados.observacoes
        })
        .eq('id', producaoId);

      if (error) throw error;

      await this.registrarMudancaStatus(
        producaoId,
        'em_andamento',
        'concluido',
        usuarioId || null,
        'Produção concluída com sucesso'
      );

      await this.baixarInsumosUtilizados(producaoId);

      await this.darEntradaProdutoFinal(producaoId, dados.quantidade_aprovada);
    } catch (error) {
      console.error('Erro ao concluir produção:', error);
      throw error;
    }
  },

  async baixarInsumosUtilizados(producaoId: string): Promise<void> {
    try {
      const { data: reservas, error: errorReservas } = await supabase
        .from('producao_reserva_insumos')
        .select('*')
        .eq('producao_id', producaoId)
        .eq('status_reserva', 'reservado');

      if (errorReservas) {
        console.error('Erro ao buscar reservas:', errorReservas);
        throw errorReservas;
      }

      if (!reservas || reservas.length === 0) {
        console.warn('Nenhuma reserva encontrada para baixar');
        return;
      }

      for (const reserva of reservas) {
        const { data: saldo, error: errorSaldo } = await supabase
          .from('saldos_estoque')
          .select('quantidade_atual')
          .eq('estoque_id', reserva.estoque_origem_id)
          .eq('item_id', reserva.item_id)
          .maybeSingle();

        if (errorSaldo) {
          console.error(`Erro ao buscar saldo do item ${reserva.item_id}:`, errorSaldo);
          continue;
        }

        const quantidadeAtual = saldo?.quantidade_atual || 0;
        const novaQuantidade = Math.max(0, quantidadeAtual - reserva.quantidade_reservada);

        const { error: errorUpdate } = await supabase
          .from('saldos_estoque')
          .update({ quantidade_atual: novaQuantidade })
          .eq('estoque_id', reserva.estoque_origem_id)
          .eq('item_id', reserva.item_id);

        if (errorUpdate) {
          console.error(`Erro ao atualizar saldo do item ${reserva.item_id}:`, errorUpdate);
          continue;
        }

        const { error: errorMovimentacao } = await supabase
          .from('movimentacoes_estoque')
          .insert({
            estoque_id: reserva.estoque_origem_id,
            item_id: reserva.item_id,
            tipo_movimentacao: 'saida',
            quantidade: reserva.quantidade_reservada,
            motivo: 'Consumo em produção',
            referencia_tipo: 'producao',
            referencia_id: producaoId
          });

        if (errorMovimentacao) {
          console.error(`Erro ao registrar movimentação do item ${reserva.item_id}:`, errorMovimentacao);
        }

        const { error: errorReservaUpdate } = await supabase
          .from('producao_reserva_insumos')
          .update({
            status_reserva: 'utilizado',
            quantidade_utilizada: reserva.quantidade_reservada,
            data_utilizacao: new Date().toISOString()
          })
          .eq('id', reserva.id);

        if (errorReservaUpdate) {
          console.error(`Erro ao atualizar status da reserva ${reserva.id}:`, errorReservaUpdate);
        }
      }
    } catch (error) {
      console.error('Erro ao baixar insumos:', error);
      throw error;
    }
  },

  async darEntradaProdutoFinal(producaoId: string, quantidade: number): Promise<void> {
    try {
      if (quantidade <= 0) {
        console.warn('Quantidade aprovada é zero, não há produto para dar entrada');
        return;
      }

      const { data: producao, error: errorProducao } = await supabase
        .from('producoes')
        .select('ficha_id, estoque_destino_id, lote_producao')
        .eq('id', producaoId)
        .single();

      if (errorProducao) {
        console.error('Erro ao buscar produção:', errorProducao);
        throw errorProducao;
      }

      if (!producao.estoque_destino_id) {
        console.warn('Nenhum estoque de destino definido para a produção');
        return;
      }

      const { data: ficha, error: errorFicha } = await supabase
        .from('fichas_tecnicas')
        .select('nome')
        .eq('id', producao.ficha_id)
        .single();

      if (errorFicha) {
        console.error('Erro ao buscar ficha técnica:', errorFicha);
        throw errorFicha;
      }

      const { data: itemProduto, error: errorItem } = await supabase
        .from('itens_estoque')
        .select('id')
        .ilike('nome', ficha.nome)
        .maybeSingle();

      if (errorItem) {
        console.error('Erro ao buscar item produto:', errorItem);
        throw errorItem;
      }

      if (!itemProduto) {
        console.warn(`Produto final "${ficha.nome}" não encontrado no estoque. Não será possível dar entrada.`);
        return;
      }

      const { data: saldoExistente, error: errorSaldo } = await supabase
        .from('saldos_estoque')
        .select('quantidade_atual')
        .eq('estoque_id', producao.estoque_destino_id)
        .eq('item_id', itemProduto.id)
        .maybeSingle();

      if (errorSaldo) {
        console.error('Erro ao verificar saldo:', errorSaldo);
      }

      if (saldoExistente) {
        const novaQuantidade = (saldoExistente.quantidade_atual || 0) + quantidade;

        const { error: errorUpdate } = await supabase
          .from('saldos_estoque')
          .update({ quantidade_atual: novaQuantidade })
          .eq('estoque_id', producao.estoque_destino_id)
          .eq('item_id', itemProduto.id);

        if (errorUpdate) {
          console.error('Erro ao atualizar saldo:', errorUpdate);
          throw errorUpdate;
        }
      } else {
        const { error: errorInsert } = await supabase
          .from('saldos_estoque')
          .insert({
            estoque_id: producao.estoque_destino_id,
            item_id: itemProduto.id,
            quantidade_atual: quantidade
          });

        if (errorInsert) {
          console.error('Erro ao inserir saldo:', errorInsert);
          throw errorInsert;
        }
      }

      const { error: errorMovimentacao } = await supabase
        .from('movimentacoes_estoque')
        .insert({
          estoque_id: producao.estoque_destino_id,
          item_id: itemProduto.id,
          tipo_movimentacao: 'entrada',
          quantidade: quantidade,
          motivo: `Produção concluída - Lote ${producao.lote_producao}`,
          referencia_tipo: 'producao',
          referencia_id: producaoId
        });

      if (errorMovimentacao) {
        console.error('Erro ao registrar movimentação de entrada:', errorMovimentacao);
      }

      console.log(`Entrada de ${quantidade} unidades do produto "${ficha.nome}" realizada com sucesso`);
    } catch (error) {
      console.error('Erro ao dar entrada no produto final:', error);
      throw error;
    }
  },

  async registrarControleQualidade(
    producaoId: string,
    dados: {
      inspetor_id?: string;
      inspetor_nome: string;
      status_qualidade: 'aprovado' | 'aprovado_com_ressalvas' | 'rejeitado';
      quantidade_aprovada: number;
      quantidade_rejeitada: number;
      motivo_rejeicao?: string;
      acoes_corretivas?: string;
      observacoes?: string;
    }
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('producao_controle_qualidade')
        .insert({
          producao_id: producaoId,
          ...dados
        });

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao registrar controle de qualidade:', error);
      throw error;
    }
  },

  async registrarMudancaStatus(
    producaoId: string,
    statusAnterior: string,
    statusNovo: string,
    usuarioId: string | null,
    observacoes?: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('producao_historico_status')
        .insert({
          producao_id: producaoId,
          status_anterior: statusAnterior,
          status_novo: statusNovo,
          usuario_id: usuarioId,
          observacoes
        });

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao registrar mudança de status:', error);
      throw error;
    }
  },

  async registrarConsumoReal(
    producaoId: string,
    consumos: Array<{
      item_id: string;
      quantidade_planejada: number;
      quantidade_real: number;
      custo_unitario: number;
      motivo_variacao?: string;
    }>,
    usuarioId: string
  ): Promise<void> {
    try {
      const consumosParaInserir = consumos.map(c => ({
        producao_id: producaoId,
        registrado_por: usuarioId,
        ...c
      }));

      const { error } = await supabase
        .from('producao_consumo_insumos')
        .insert(consumosParaInserir);

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao registrar consumo real:', error);
      throw error;
    }
  },

  async obterHistoricoStatus(producaoId: string) {
    try {
      const { data, error } = await supabase
        .from('producao_historico_status')
        .select('*')
        .eq('producao_id', producaoId)
        .order('data_mudanca', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao obter histórico:', error);
      return [];
    }
  },

  async obterControleQualidade(producaoId: string) {
    try {
      const { data, error } = await supabase
        .from('producao_controle_qualidade')
        .select('*')
        .eq('producao_id', producaoId)
        .order('data_inspecao', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao obter controle qualidade:', error);
      return [];
    }
  },

  async obterReservasInsumos(producaoId: string) {
    try {
      const { data, error } = await supabase
        .from('producao_reserva_insumos')
        .select(`
          *,
          itens_estoque (
            nome,
            unidade_medida
          ),
          estoques (
            nome,
            tipo
          )
        `)
        .eq('producao_id', producaoId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao obter reservas:', error);
      return [];
    }
  }
};
