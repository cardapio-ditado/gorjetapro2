import { supabase } from '../../lib/supabase';

/** Chamadas do Estoque Beta 2 que já gravam de verdade. */

export interface Hoje {
  hoje: string;
  gestor: boolean;
  aprovador: boolean;
  pedidos_a_entregar: number;
  notas_pendentes: number;
  zonas_central: { vencidas: number; em_andamento: number; total: number };
  negativos: number;
  zig: { status: string; nao_mapeados: number; finalizado_em: string | null } | null;
  central_abaixo_ponto: number;
  kits_faltando: number;
  setores_pendencias: number;
  setores_vazios: string[];
}

export interface KitItem {
  item_id: string;
  nome: string;
  rotulo: string;
  nivel: number;
  saldo: number;
  falta: number;
  central_tem: number;
}

export interface Kit {
  id: string;
  nome: string;
  descricao: string | null;
  itens: KitItem[];
  faltando: number;
  ultima_reposicao: string | null;
}

function lancar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const beta2Api = {
  async hoje(): Promise<Hoje> {
    const { data, error } = await supabase.rpc('fn_beta2_hoje');
    lancar(error);
    return data as Hoje;
  },

  async kits(): Promise<Kit[]> {
    const { data, error } = await supabase.rpc('fn_kits');
    lancar(error);
    return (data as Kit[]) || [];
  },

  async kitRepor(kitId: string, itens: Array<{ item_id: string; quantidade: number }>, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_kit_repor', { p_kit: kitId, p_itens: itens, p_responsavel: responsavel });
    lancar(error);
    return data as { itens: number; faltou: string[] };
  },
};

export const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ── Configurar Central ───────────────────────────────────────────────────────
export interface CentralRegras { seguranca_dias: number; cobertura_padrao_dias: number; historico_dias: number }
export interface CentralItem {
  item_id: string; nome: string; categoria: string | null; um: string; saldo: number; consumo_dia: number; ciclo_dias: number; cobertura_dias: number;
  sugerido: number; ponto: number; modo: 'manual' | 'auto'; fornecedor: string | null; classe: string | null; calculado_em: string | null; cobertura_atual_dias: number | null;
}
export interface CentralDados {
  regras: CentralRegras;
  totais: { itens: number; auto: number; manual: number; com_consumo: number; abaixo: number; diferentes: number };
  itens: CentralItem[];
}
export const centralApi = {
  async dados(): Promise<CentralDados> {
    const { data, error } = await supabase.rpc('fn_central_itens');
    lancar(error);
    return data as CentralDados;
  },
  async regrasSalvar(seguranca: number, cobertura: number): Promise<CentralRegras> {
    const { data, error } = await supabase.rpc('fn_central_regras_salvar', { p_seguranca: seguranca, p_cobertura: cobertura });
    lancar(error);
    return data as CentralRegras;
  },
  async definir(itemId: string, modo: 'manual' | 'auto', ponto: number | null) {
    const { data, error } = await supabase.rpc('fn_central_definir', { p_item: itemId, p_modo: modo, p_ponto: ponto });
    lancar(error);
    return data as { item_id: string; modo: string; ponto: number };
  },
  async autoEmTodos() {
    const { data, error } = await supabase.rpc('fn_central_auto_em_todos');
    lancar(error);
    return data as { ligados: number; aplicado: { atualizados: number } };
  },
};
