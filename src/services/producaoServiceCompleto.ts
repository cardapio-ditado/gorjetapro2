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

export interface TransferenciaNecessaria {
  item_id: string;
  item_nome: string;
  quantidade: number;
  estoque_origem_id: string;
  estoque_origem_nome: string;
  estoque_destino_id: string;
  estoque_destino_nome: string;
}

export interface ReservaInsumo {
  item_id: string;
  quantidade_reservada: number;
  estoque_origem_id: string;
}

export const producaoServiceCompleto = {
  async verificarDisponibilidadeInsumos(
    fichaId: string,
    quantidade: number
  ): Promise<{ disponivel: boolean; detalhes: VerificacaoEstoque[]; transferenciasNecessarias: TransferenciaNecessaria[] }> {
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

      // Buscar estoque central para transferências
      const { data: estoqueCentral, error: errorCentral } = await supabase
        .from('estoques')
        .select('id, nome')
        .eq('tipo', 'central')
        .eq('status', true)
        .maybeSingle();

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
      const transferenciasNecessarias: TransferenciaNecessaria[] = [];
      let todosDisponiveis = true;

      for (const ingrediente of ingredientes || []) {
        const quantidadeNecessaria = ingrediente.quantidade * quantidade;

        // Verificar no estoque de produção
        const { data: saldoProducao, error: errorSaldo } = await supabase
          .from('saldos_estoque')
          .select('quantidade_atual')
          .eq('estoque_id', estoqueProducao.id)
          .eq('item_id', ingrediente.item_estoque_id)
          .maybeSingle();

        if (errorSaldo) throw errorSaldo;

        const quantidadeDisponivel = saldoProducao?.quantidade_atual || 0;
        const faltaQuantidade = quantidadeNecessaria - quantidadeDisponivel;

        let temEstoqueSuficiente = quantidadeDisponivel >= quantidadeNecessaria;

        // Se não tem suficiente no estoque de produção, verificar no central
        if (!temEstoqueSuficiente && estoqueCentral && faltaQuantidade > 0) {
          const { data: saldoCentral } = await supabase
            .from('saldos_estoque')
            .select('quantidade_atual')
            .eq('estoque_id', estoqueCentral.id)
            .eq('item_id', ingrediente.item_estoque_id)
            .maybeSingle();

          const quantidadeCentral = saldoCentral?.quantidade_atual || 0;

          if (quantidadeCentral >= faltaQuantidade) {
            // Tem no central, pode transferir
            temEstoqueSuficiente = true;
            transferenciasNecessarias.push({
              item_id: ingrediente.item_estoque_id,
              item_nome: ingrediente.itens_estoque?.nome || 'Desconhecido',
              quantidade: faltaQuantidade,
              estoque_origem_id: estoqueCentral.id,
              estoque_origem_nome: estoqueCentral.nome,
              estoque_destino_id: estoqueProducao.id,
              estoque_destino_nome: estoqueProducao.nome
            });
          } else {
            todosDisponiveis = false;
          }
        } else if (!temEstoqueSuficiente) {
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
        detalhes: verificacoes,
        transferenciasNecessarias
      };
    } catch (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      throw error;
    }
  },

  async realizarTransferencias(
    producaoId: string,
    transferencias: TransferenciaNecessaria[],
    usuarioId: string
  ): Promise<void> {
    try {
      for (const transferencia of transferencias) {
        // Registrar a transferência
        const { data: novaTransferencia, error: errorTransferencia } = await supabase
          .from('producao_transferencias')
          .insert({
            producao_id: producaoId,
            item_id: transferencia.item_id,
            estoque_origem_id: transferencia.estoque_origem_id,
            estoque_destino_id: transferencia.estoque_destino_id,
            quantidade_transferida: transferencia.quantidade,
            realizada_por: usuarioId,
            status_transferencia: 'concluida'
          })
          .select()
          .single();

        if (errorTransferencia) throw errorTransferencia;

        // Atualizar saldo do estoque origem (retirar)
        const { data: saldoOrigem } = await supabase
          .from('saldos_estoque')
          .select('quantidade_atual')
          .eq('estoque_id', transferencia.estoque_origem_id)
          .eq('item_id', transferencia.item_id)
          .single();

        const novaQuantidadeOrigem = (saldoOrigem?.quantidade_atual || 0) - transferencia.quantidade;

        await supabase
          .from('saldos_estoque')
          .update({ quantidade_atual: Math.max(0, novaQuantidadeOrigem) })
          .eq('estoque_id', transferencia.estoque_origem_id)
          .eq('item_id', transferencia.item_id);

        // Atualizar saldo do estoque destino (adicionar)
        const { data: saldoDestino } = await supabase
          .from('saldos_estoque')
          .select('quantidade_atual')
          .eq('estoque_id', transferencia.estoque_destino_id)
          .eq('item_id', transferencia.item_id)
          .maybeSingle();

        if (saldoDestino) {
          const novaQuantidadeDestino = (saldoDestino.quantidade_atual || 0) + transferencia.quantidade;
          await supabase
            .from('saldos_estoque')
            .update({ quantidade_atual: novaQuantidadeDestino })
            .eq('estoque_id', transferencia.estoque_destino_id)
            .eq('item_id', transferencia.item_id);
        } else {
          await supabase
            .from('saldos_estoque')
            .insert({
              estoque_id: transferencia.estoque_destino_id,
              item_id: transferencia.item_id,
              quantidade_atual: transferencia.quantidade
            });
        }

        // Registrar movimentações
        await supabase.from('movimentacoes_estoque').insert([
          {
            estoque_id: transferencia.estoque_origem_id,
            item_id: transferencia.item_id,
            tipo_movimentacao: 'saida',
            quantidade: transferencia.quantidade,
            motivo: `Transferência para produção`,
            referencia_tipo: 'transferencia',
            referencia_id: novaTransferencia.id
          },
          {
            estoque_id: transferencia.estoque_destino_id,
            item_id: transferencia.item_id,
            tipo_movimentacao: 'entrada',
            quantidade: transferencia.quantidade,
            motivo: `Transferência do estoque central`,
            referencia_tipo: 'transferencia',
            referencia_id: novaTransferencia.id
          }
        ]);
      }
    } catch (error) {
      console.error('Erro ao realizar transferências:', error);
      throw error;
    }
  },

  async registrarDesperdicio(
    producaoId: string,
    dados: {
      item_id?: string;
      tipo_perda: 'desperdicio' | 'sobra' | 'quebra' | 'vencimento' | 'contaminacao' | 'erro_preparo' | 'outro';
      quantidade: number;
      unidade_medida: string;
      custo_estimado: number;
      motivo_detalhado: string;
      etapa_producao?: 'preparacao' | 'producao' | 'finalizacao' | 'armazenamento';
      responsavel_registro: string;
      acao_corretiva?: string;
      pode_ser_reaproveitado?: boolean;
      forma_reaproveitamento?: string;
    },
    usuarioId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('producao_desperdicios')
        .insert({
          producao_id: producaoId,
          registrado_por: usuarioId,
          ...dados
        });

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao registrar desperdício:', error);
      throw error;
    }
  },

  async registrarObservacao(
    producaoId: string,
    dados: {
      etapa: 'planejamento' | 'preparacao' | 'producao' | 'finalizacao' | 'armazenamento' | 'geral';
      tipo_observacao?: 'problema' | 'ajuste' | 'melhoria' | 'informacao' | 'alerta';
      titulo?: string;
      descricao: string;
      criticidade?: 'baixa' | 'media' | 'alta' | 'critica';
      requer_acao?: boolean;
      acao_tomada?: string;
      registrado_por_nome: string;
    },
    usuarioId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('producao_observacoes')
        .insert({
          producao_id: producaoId,
          registrado_por: usuarioId,
          ...dados
        });

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao registrar observação:', error);
      throw error;
    }
  },

  async obterDesperdicios(producaoId: string) {
    try {
      const { data, error } = await supabase
        .from('producao_desperdicios')
        .select(`
          *,
          itens_estoque (
            nome,
            unidade_medida
          )
        `)
        .eq('producao_id', producaoId)
        .order('registrado_em', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao obter desperdícios:', error);
      return [];
    }
  },

  async obterObservacoes(producaoId: string) {
    try {
      const { data, error } = await supabase
        .from('producao_observacoes')
        .select('*')
        .eq('producao_id', producaoId)
        .order('registrado_em', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao obter observações:', error);
      return [];
    }
  },

  async obterTransferencias(producaoId: string) {
    try {
      const { data, error } = await supabase
        .from('producao_transferencias')
        .select(`
          *,
          itens_estoque (
            nome,
            unidade_medida
          )
        `)
        .eq('producao_id', producaoId)
        .order('realizada_em', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erro ao obter transferências:', error);
      return [];
    }
  },

  // Herdar métodos do serviço original
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
          usuario_inicio: usuarioId
        })
        .eq('id', producaoId);

      if (error) throw error;

      await this.registrarMudancaStatus(
        producaoId,
        'planejado',
        'em_andamento',
        usuarioId,
        'Produção iniciada'
      );
    } catch (error) {
      console.error('Erro ao iniciar produção:', error);
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
          usuario_conclusao: usuarioId,
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
        usuarioId,
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

      if (errorReservas) throw errorReservas;

      for (const reserva of reservas || []) {
        const { data: saldo, error: errorSaldo } = await supabase
          .from('saldos_estoque')
          .select('quantidade_atual')
          .eq('estoque_id', reserva.estoque_origem_id)
          .eq('item_id', reserva.item_id)
          .single();

        if (errorSaldo) {
          console.error('Erro ao buscar saldo:', errorSaldo);
          continue;
        }

        const novaQuantidade = (saldo?.quantidade_atual || 0) - reserva.quantidade_reservada;

        await supabase
          .from('saldos_estoque')
          .update({ quantidade_atual: Math.max(0, novaQuantidade) })
          .eq('estoque_id', reserva.estoque_origem_id)
          .eq('item_id', reserva.item_id);

        await supabase
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

        await supabase
          .from('producao_reserva_insumos')
          .update({
            status_reserva: 'utilizado',
            quantidade_utilizada: reserva.quantidade_reservada,
            data_utilizacao: new Date().toISOString()
          })
          .eq('id', reserva.id);
      }
    } catch (error) {
      console.error('Erro ao baixar insumos:', error);
      throw error;
    }
  },

  async darEntradaProdutoFinal(producaoId: string, quantidade: number): Promise<void> {
    try {
      const { data: producao, error: errorProducao } = await supabase
        .from('producoes')
        .select('ficha_id, estoque_destino_id, lote_producao')
        .eq('id', producaoId)
        .single();

      if (errorProducao) throw errorProducao;

      if (!producao.estoque_destino_id) {
        console.warn('Nenhum estoque de destino definido para a produção');
        return;
      }

      const { data: ficha, error: errorFicha } = await supabase
        .from('fichas_tecnicas')
        .select('nome')
        .eq('id', producao.ficha_id)
        .single();

      if (errorFicha) throw errorFicha;

      const { data: itemProduto, error: errorItem } = await supabase
        .from('itens_estoque')
        .select('id')
        .eq('nome', ficha.nome)
        .eq('tipo_item', 'produto_final')
        .maybeSingle();

      if (errorItem) throw errorItem;

      if (!itemProduto) {
        console.warn(`Produto final "${ficha.nome}" não encontrado no estoque`);
        return;
      }

      const { data: saldoExistente } = await supabase
        .from('saldos_estoque')
        .select('quantidade_atual')
        .eq('estoque_id', producao.estoque_destino_id)
        .eq('item_id', itemProduto.id)
        .maybeSingle();

      if (saldoExistente) {
        const novaQuantidade = (saldoExistente.quantidade_atual || 0) + quantidade;

        await supabase
          .from('saldos_estoque')
          .update({ quantidade_atual: novaQuantidade })
          .eq('estoque_id', producao.estoque_destino_id)
          .eq('item_id', itemProduto.id);
      } else {
        await supabase
          .from('saldos_estoque')
          .insert({
            estoque_id: producao.estoque_destino_id,
            item_id: itemProduto.id,
            quantidade_atual: quantidade
          });
      }

      await supabase
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
    } catch (error) {
      console.error('Erro ao dar entrada no produto final:', error);
      throw error;
    }
  },

  async registrarMudancaStatus(
    producaoId: string,
    statusAnterior: string,
    statusNovo: string,
    usuarioId: string,
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
        .order('data_inspecao', { ascending: false});

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
