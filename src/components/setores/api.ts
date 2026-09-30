import { supabase } from '../../lib/supabase';

/** Tipos e chamadas do Configurar setores. Tudo passa por funções do banco. */

export interface SetorResumo {
  id: string;
  nome: string;
  tipo: string;
  itens: number;
  sem_nivel: number;
  zig: number;
  contagem: number;
  zig_sem_venda: number;
  saldo_sem_cadastro: number;
  negativos: number;
}

export type Controle = 'venda' | 'contagem';

export interface ItemSetor {
  item_id: string;
  nome: string;
  categoria: string;
  unidade: string | null;
  rotulo: string;
  presente: boolean;
  nivel: number;
  controle: Controle | null;
  saldo: number;
  consumo_dia: number;
  vendas_direto: number;
  vendas_ficha: number;
  tem_ficha: boolean;
}

export interface DadosSetor {
  estoque: { id: string; nome: string; tipo: string };
  outros_setores: Array<{ id: string; nome: string }>;
  itens: ItemSetor[];
}

export interface VendaLigada {
  id: string;
  nome_externo: string;
  categoria: string | null;
  modo: 'direto' | 'ficha';
  ficha_nome: string | null;
  usos: number;
  ultima: string | null;
}

export interface VendasDoItem {
  vinculadas: VendaLigada[];
  fichas: Array<{ id: string; nome: string }>;
}

export interface VendaBusca {
  id: string;
  nome_externo: string;
  categoria: string | null;
  ignorada: boolean;
  destino: string;
  estoque_nome: string | null;
  usos: number;
}

export interface Regras {
  auditoria_dias: number[];
  aprovadores: Array<{ id: string; nome: string }>;
  usuarios: Array<{ id: string; nome: string }>;
}

function lancar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const setoresApi = {
  async resumo(): Promise<SetorResumo[]> {
    const { data, error } = await supabase.rpc('fn_setores_resumo');
    lancar(error);
    return (data as SetorResumo[]) || [];
  },

  async itens(estoqueId: string): Promise<DadosSetor> {
    const { data, error } = await supabase.rpc('fn_setores_itens', { p_estoque_id: estoqueId });
    lancar(error);
    return data as DadosSetor;
  },

  async presenca(estoqueId: string, incluir: string[], remover: string[]) {
    const { data, error } = await supabase.rpc('fn_setores_presenca', { p_estoque_id: estoqueId, p_incluir: incluir, p_remover: remover });
    lancar(error);
    return data as { incluidos: number; removidos: number; bloqueados: string[] };
  },

  async niveis(estoqueId: string, niveis: Array<{ item_id: string; nivel: number }>) {
    const { data, error } = await supabase.rpc('fn_setores_niveis', { p_estoque_id: estoqueId, p_niveis: niveis });
    lancar(error);
    return data as { alterados: number };
  },

  async controle(estoqueId: string, itemId: string, controle: Controle) {
    const { error } = await supabase.rpc('fn_setores_controle', { p_estoque_id: estoqueId, p_item_id: itemId, p_controle: controle });
    lancar(error);
  },

  async vendasDoItem(estoqueId: string, itemId: string): Promise<VendasDoItem> {
    const { data, error } = await supabase.rpc('fn_setores_vendas_do_item', { p_estoque_id: estoqueId, p_item_id: itemId });
    lancar(error);
    return data as VendasDoItem;
  },

  async buscarVendas(termo: string): Promise<VendaBusca[]> {
    const { data, error } = await supabase.rpc('fn_setores_buscar_vendas', { p_termo: termo });
    lancar(error);
    return (data as VendaBusca[]) || [];
  },

  async ligarVenda(estoqueId: string, itemId: string, mapeamentoId: string, modo: 'direto' | 'ficha', fichaId: string | null): Promise<VendasDoItem> {
    const { data, error } = await supabase.rpc('fn_setores_ligar_venda', {
      p_estoque_id: estoqueId, p_item_id: itemId, p_mapeamento_id: mapeamentoId, p_modo: modo, p_ficha_id: fichaId,
    });
    lancar(error);
    return data as VendasDoItem;
  },

  async desligarVenda(estoqueId: string, itemId: string, mapeamentoId: string): Promise<VendasDoItem> {
    const { data, error } = await supabase.rpc('fn_setores_desligar_venda', { p_estoque_id: estoqueId, p_item_id: itemId, p_mapeamento_id: mapeamentoId });
    lancar(error);
    return data as VendasDoItem;
  },

  async moverItem(de: string, para: string, itemId: string) {
    const { data, error } = await supabase.rpc('fn_setores_mover_item', { p_de: de, p_para: para, p_item_id: itemId });
    lancar(error);
    return data as { saldo_movido: number; vendas_movidas: number; vendas_por_ficha_ficaram: number };
  },

  async regras(): Promise<Regras> {
    const { data, error } = await supabase.rpc('fn_setores_regras');
    lancar(error);
    return data as Regras;
  },

  async regrasSalvar(dias: number[], aprovadores: string[]): Promise<Regras> {
    const { data, error } = await supabase.rpc('fn_setores_regras_salvar', { p_dias: dias, p_aprovadores: aprovadores });
    lancar(error);
    return data as Regras;
  },
};

export const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
