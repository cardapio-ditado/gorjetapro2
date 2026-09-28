import { supabase } from '../../lib/supabase';
import type { ComoConta, Controle } from './api';

/** Tipos e chamadas das consultas e cadastros do Estoque Beta. */

export interface EstoqueRef {
  id: string;
  nome: string;
  tipo: string;
}

export interface ItemPosicao {
  item_id: string;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  rotulo_solto: string;
  foto_url: string | null;
  grupo_controle: 'vende' | 'conta' | 'gasta' | null;
  status: string;
  saldo: number;
  custo_medio: number;
  valor: number;
  nivel: number | null;
  ponto: number | null;
  negativo: boolean;
  zerado: boolean;
  abaixo_nivel: boolean;
  ultima_mov: string | null;
}

export interface Posicao {
  estoques: EstoqueRef[];
  itens: ItemPosicao[];
  totais: {
    itens: number;
    valor: number;
    negativos: number;
    valor_negativo: number;
    zerados: number;
    abaixo_nivel: number;
  };
}

export interface Movimento {
  id: string;
  data: string;
  criado_em: string;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  origem: string | null;
  origem_rotulo: string;
  motivo: string | null;
  observacoes: string | null;
  estoque_origem: string | null;
  estoque_destino: string | null;
  quantidade: number;
  /** +1 entrou no estoque consultado, -1 saiu, 0 não mudou o total */
  sinal: 1 | -1 | 0;
  saldo_apos: number;
  custo_unitario: number;
  custo_total: number;
}

export interface Extrato {
  item: {
    id: string;
    nome: string;
    categoria: string | null;
    unidade: string | null;
    rotulo_solto: string;
    foto_url: string | null;
    custo_medio: number;
  };
  estoque: { id: string; nome: string } | null;
  inicio: string;
  fim: string;
  saldo_inicial: number;
  saldo_final: number;
  movimentos: Movimento[];
  resumo: {
    compras: number;
    vendas: number;
    ajustes_mais: number;
    ajustes_menos: number;
    transferencias_entrada: number;
    transferencias_saida: number;
    producao_consumo: number;
    producao_entrada: number;
    movimentos: number;
  };
}

export interface FichaItem {
  item: {
    id: string;
    nome: string;
    codigo: string | null;
    categoria: string | null;
    unidade: string | null;
    tipo_item: 'insumo' | 'produto_final';
    status: 'ativo' | 'inativo';
    custo_medio: number;
    ponto_reposicao: number | null;
    estoque_minimo: number | null;
    classe_compra: 'rua' | 'pedido' | 'sob_demanda' | null;
    grupo_controle: 'vende' | 'conta' | 'gasta' | null;
    entra_no_cmv: boolean | null;
    tem_ficha: boolean;
    produzido_por_ficha: boolean;
  };
  config: ComoConta;
  saldos: Array<{ estoque_id: string; nome: string; tipo: string; saldo: number; valor: number }>;
  niveis: Array<{ estoque_id: string; nome: string; nivel: number | null; controle: Controle | null }>;
  compras: Array<{ data: string; fornecedor: string | null; documento: string | null; quantidade: number; custo_unitario: number }>;
  consumo_dia: number;
  fichas_que_usam: Array<{ ficha_id: string; nome: string; quantidade: number; unidade: string | null }>;
  ultima_contagem: string | null;
  ultimo_movimento: string | null;
}

export interface ItemLista {
  item_id: string;
  nome: string;
  codigo: string | null;
  categoria: string | null;
  unidade: string | null;
  tipo_item: 'insumo' | 'produto_final';
  status: 'ativo' | 'inativo';
  grupo_controle: 'vende' | 'conta' | 'gasta' | null;
  classe_compra: 'rua' | 'pedido' | 'sob_demanda' | null;
  custo_medio: number;
  saldo_total: number;
  rotulo_solto: string;
  foto_url: string | null;
}

export interface ItemSalvar {
  id?: string | null;
  nome: string;
  categoria: string;
  unidade_medida: string;
  tipo_item: 'insumo' | 'produto_final';
  ponto_reposicao: number;
  estoque_minimo: number;
  classe_compra: 'rua' | 'pedido' | 'sob_demanda' | null;
  grupo_controle: 'vende' | 'conta' | 'gasta' | null;
  codigo: string | null;
  entra_no_cmv: boolean;
}

export interface FichaProducao {
  ficha_id: string;
  nome: string;
  categoria: string | null;
  rendimento: number | null;
  unidade_rendimento: string | null;
  item_produzido_id: string;
  item_nome: string;
  custo_total: number;
  ingredientes: Array<{
    item_id: string | null;
    nome: string | null;
    quantidade: number;
    unidade: string | null;
    baixa: boolean;
    /** saldo por estoque_id */
    saldos: Record<string, number>;
  }>;
}

export interface PainelDia {
  hoje: string;
  valor_parado: number;
  itens_negativos: number;
  valor_negativo: number;
  zonas_vencidas: number;
  zonas_total: number;
  balcoes: Array<{ nome: string; status: string | null }>;
  compras_semana: number;
  compras_hoje: number;
  vendas_hoje_itens: number;
  movimentos_hoje: number;
  itens_parados_60d: number;
  listas_abertas: number;
}

function lancar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const consultasApi = {
  async estoques(): Promise<EstoqueRef[]> {
    const { data, error } = await supabase.from('estoques').select('id, nome, tipo').order('nome');
    lancar(error);
    return ((data || []) as EstoqueRef[]).sort((a, b) => (a.tipo === 'central' ? -1 : b.tipo === 'central' ? 1 : a.nome.localeCompare(b.nome)));
  },

  async posicao(estoqueId: string | null): Promise<Posicao> {
    const { data, error } = await supabase.rpc('fn_beta_posicao', { p_estoque_id: estoqueId });
    lancar(error);
    return data as Posicao;
  },

  async extrato(itemId: string, estoqueId: string | null, inicio: string | null, fim: string | null): Promise<Extrato> {
    const { data, error } = await supabase.rpc('fn_beta_extrato', {
      p_item_id: itemId,
      p_estoque_id: estoqueId,
      p_inicio: inicio,
      p_fim: fim,
    });
    lancar(error);
    return data as Extrato;
  },

  async fichaItem(itemId: string): Promise<FichaItem> {
    const { data, error } = await supabase.rpc('fn_beta_ficha_item', { p_item_id: itemId });
    lancar(error);
    if (!data) throw new Error('Item não encontrado');
    return data as FichaItem;
  },

  async itensListar(status: 'ativo' | 'inativo' | 'todos', termo: string | null, categoria: string | null): Promise<ItemLista[]> {
    const { data, error } = await supabase.rpc('fn_beta_itens_listar', {
      p_status: status,
      p_termo: termo,
      p_categoria: categoria,
    });
    lancar(error);
    return (data as ItemLista[]) || [];
  },

  async categorias(): Promise<Array<{ categoria: string; itens: number }>> {
    const { data, error } = await supabase.rpc('fn_beta_categorias');
    lancar(error);
    return (data as Array<{ categoria: string; itens: number }>) || [];
  },

  async itemSalvar(item: ItemSalvar): Promise<string> {
    const { data, error } = await supabase.rpc('fn_beta_item_salvar', { p_item: item });
    lancar(error);
    return (data as { item_id: string }).item_id;
  },

  async itemStatus(itemId: string, status: 'ativo' | 'inativo'): Promise<void> {
    const { error } = await supabase.rpc('fn_beta_item_status', { p_item_id: itemId, p_status: status });
    lancar(error);
  },

  /** Ponto de pedido do item (mesma função usada pela revisão de compras). */
  async pontoDefinir(itemId: string, ponto: number): Promise<void> {
    const { error } = await supabase.rpc('fn_ponto_revisar', { p_item_id: itemId, p_acao: 'definir', p_ponto: ponto });
    lancar(error);
  },

  async transferir(origem: string, destino: string, itens: Array<{ item_id: string; quantidade: number }>, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_beta_transferir', {
      p_origem: origem,
      p_destino: destino,
      p_itens: itens,
      p_responsavel: responsavel,
    });
    lancar(error);
    return data as { success: boolean; itens: number; lote: string };
  },

  async fichasProducao(): Promise<FichaProducao[]> {
    const { data, error } = await supabase.rpc('fn_beta_fichas_producao');
    lancar(error);
    return (data as FichaProducao[]) || [];
  },

  async produzir(fichaId: string, quantidade: number, destino: string, origemInsumos: string, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_beta_produzir', {
      p_ficha_id: fichaId,
      p_quantidade: quantidade,
      p_destino: destino,
      p_origem_insumos: origemInsumos,
      p_responsavel: responsavel,
    });
    lancar(error);
    return data as { success: boolean; insumos_baixados: number; custo_total_insumos: number; custo_unitario_produto: number; insumos: number };
  },

  async painelDia(): Promise<PainelDia> {
    const { data, error } = await supabase.rpc('fn_beta_painel_dia');
    lancar(error);
    return data as PainelDia;
  },
};
