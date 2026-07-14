import { supabase } from '../lib/supabase';

interface AgendaPagamentos {
  id: string;
  data_base: string;
  status: 'aberta' | 'fechada';
  criado_por?: string;
  criado_em: string;
  fechado_por?: string;
  fechado_em?: string;
}

export interface AgendaPagamentoItem {
  id: string;
  agenda_id: string;
  origem: 'ap' | 'ad-hoc';
  conta_pagar_id?: string;
  fornecedor: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'proposto' | 'aprovado' | 'reprovado' | 'executado' | 'cancelado';
  observacao?: string;
  aprovado_por?: string;
  aprovado_em?: string;
  executado_por?: string;
  executado_em?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface AgendaCompleta {
  agenda: AgendaPagamentos;
  itens: AgendaPagamentoItem[];
}

export interface PayloadAdHoc {
  fornecedor: string;
  descricao: string;
  valor: number;
  vencimento: string;
  observacao?: string;
}

// Função para criar ou importar agenda do dia
export const criarOuImportarAgenda = async (dataISO: string): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('api_fin_criar_ou_importar_agenda', {
      p_data: dataISO
    });

    if (error) {
      console.error('Erro ao criar/importar agenda:', error);
      throw new Error(`Erro ao criar/importar agenda: ${error.message}`);
    }

    return data as string;
  } catch (err) {
    console.error('Erro na função criarOuImportarAgenda:', err);
    throw err;
  }
};

// Função para carregar agenda existente
export const carregarAgenda = async (dataISO: string): Promise<AgendaCompleta | null> => {
  try {
    // Buscar agenda por data
    const { data: agendaData, error: agendaError } = await supabase
      .from('agenda_pagamentos')
      .select('*')
      .eq('data_base', dataISO)
      .maybeSingle();

    if (agendaError) {
      throw agendaError;
    }

    if (!agendaData) {
      // Agenda não encontrada
      return null;
    }

    // Buscar itens da agenda
    const { data: itensData, error: itensError } = await supabase
      .from('agenda_pagamento_itens')
      .select('*')
      .eq('agenda_id', agendaData.id)
      .order('vencimento', { ascending: true });

    if (itensError) {
      throw itensError;
    }

    return {
      agenda: agendaData as AgendaPagamentos,
      itens: (itensData || []) as AgendaPagamentoItem[]
    };
  } catch (err) {
    console.error('Erro ao carregar agenda:', err);
    throw err;
  }
};

// Função para incluir pagamento ad-hoc
export const incluirAdHoc = async (agendaId: string, payload: PayloadAdHoc): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('api_fin_incluir_adhoc', {
      p_agenda_id: agendaId,
      p_fornecedor: payload.fornecedor,
      p_descricao: payload.descricao,
      p_valor: payload.valor,
      p_vencimento: payload.vencimento,
      p_observacao: payload.observacao || null
    });

    if (error) {
      console.error('Erro ao incluir ad-hoc:', error);
      throw new Error(`Erro ao incluir pagamento ad-hoc: ${error.message}`);
    }

    return data as string;
  } catch (err) {
    console.error('Erro na função incluirAdHoc:', err);
    throw err;
  }
};

// Função para alterar status do item
export const setStatusItem = async (
  itemId: string, 
  status: 'aprovado' | 'reprovado' | 'cancelado', 
  userId?: string
): Promise<void> => {
  try {
    const { error } = await supabase.rpc('api_fin_set_status_item', {
      p_item_id: itemId,
      p_novo_status: status,
      p_usuario: userId || null
    });

    if (error) {
      console.error('Erro ao alterar status:', error);
      throw new Error(`Erro ao alterar status: ${error.message}`);
    }
  } catch (err) {
    console.error('Erro na função setStatusItem:', err);
    throw err;
  }
};

// Função para alterar status do item com valor parcial
export const setStatusItemParcial = async (
  itemId: string, 
  status: 'aprovado' | 'reprovado' | 'cancelado',
  valorAprovado?: number,
  userId?: string
): Promise<void> => {
  try {
    const { error } = await supabase.rpc('api_fin_set_status_item_parcial', {
      p_item_id: itemId,
      p_novo_status: status,
      p_valor_aprovado: valorAprovado || null,
      p_usuario: userId || null
    });

    if (error) {
      console.error('Erro ao alterar status:', error);
      throw new Error(`Erro ao alterar status: ${error.message}`);
    }
  } catch (err) {
    console.error('Erro na função setStatusItemParcial:', err);
    throw err;
  }
};

// Função para gerar relatório PDF da agenda
export const gerarRelatorioPDF = async (dataISO: string): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('vw_agenda_relatorio')
      .select('*')
      .eq('data_base', dataISO)
      .order('item_status', { ascending: false })
      .order('valor_aprovado', { ascending: false });

    if (error) {
      console.error('Erro ao buscar dados do relatório:', error);
      throw new Error(`Erro ao buscar dados do relatório: ${error.message}`);
    }

    return data || [];
  } catch (err) {
    console.error('Erro na função gerarRelatorioPDF:', err);
    throw err;
  }
};
// Função para fechar agenda
export const fecharAgenda = async (agendaId: string, userId?: string): Promise<void> => {
  try {
    const { error } = await supabase.rpc('api_fin_fechar_agenda', {
      p_agenda_id: agendaId,
      p_usuario: userId || null
    });

    if (error) {
      console.error('Erro ao fechar agenda:', error);
      throw new Error(`Erro ao fechar agenda: ${error.message}`);
    }
  } catch (err) {
    console.error('Erro na função fecharAgenda:', err);
    throw err;
  }
};

// Função para reabrir agenda
export const reabrirAgenda = async (agendaId: string): Promise<void> => {
  try {
    const { error } = await supabase.rpc('api_fin_reabrir_agenda', {
      p_agenda_id: agendaId
    });

    if (error) {
      console.error('Erro ao reabrir agenda:', error);
      throw new Error(`Erro ao reabrir agenda: ${error.message}`);
    }
  } catch (err) {
    console.error('Erro na função reabrirAgenda:', err);
    throw err;
  }
};