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

// ── Receber compras ──────────────────────────────────────────────────────────
export interface PedidoItem { linha_id: string; item_id: string; nome: string; um: string; quantidade_pedida: number; custo_unitario: number }
export interface PedidoPendente { id: string; fornecedor_id: string | null; fornecedor: string; data_pedido: string; valor: number; observacoes: string | null; itens: PedidoItem[] }
export interface NotaRecente { id: string; fornecedor: string; data_compra: string; valor: number; numero_documento: string | null; arquivo: string | null; criado_em: string; itens: number }
export interface RecebimentoTela { pendentes: PedidoPendente[]; recentes: NotaRecente[] }
export interface LinhaRecebida { linha_id: string | null; item_id: string; quantidade_recebida: number; custo_unitario: number; data_validade: string | null }
export const BUCKET_NOTAS = 'notas-fiscais';
export const recebimentoApi = {
  async tela(): Promise<RecebimentoTela> {
    const { data, error } = await supabase.rpc('fn_recebimento_tela');
    lancar(error);
    return data as RecebimentoTela;
  },
  async confirmar(p: { entrada_id: string | null; fornecedor_id: string | null; numero_documento: string; data_compra: string; condicao_pagamento: string; observacoes: string | null; arquivo: string | null; itens: LinhaRecebida[] }) {
    const { data, error } = await supabase.rpc('fn_recebimento_confirmar', { p });
    lancar(error);
    return data as { entrada_id: string; valor_total: number; itens: number; movimentacoes: number };
  },
  async cancelar(entradaId: string, motivo: string | null) {
    const { data, error } = await supabase.rpc('fn_recebimento_cancelar', { p_entrada: entradaId, p_motivo: motivo });
    lancar(error);
    return data as { entrada_id: string; status: string };
  },
  async subirFoto(arquivo: File): Promise<string> {
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const hoje = new Date();
    const caminho = `recebimentos/${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_NOTAS).upload(caminho, arquivo, { cacheControl: '3600', upsert: false, contentType: arquivo.type || undefined });
    lancar(error as { message: string } | null);
    return caminho;
  },
  async urlFoto(caminho: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET_NOTAS).createSignedUrl(caminho, 600);
    lancar(error as { message: string } | null);
    return data!.signedUrl;
  },
};
export interface NotaItem { linha_id: string; item_id: string; nome: string; um: string; quantidade_pedida: number; quantidade_recebida: number | null; custo_unitario: number; custo_total: number; data_validade: string | null }
export interface NotaDetalhe { id: string; status: string; fornecedor_id: string | null; fornecedor: string; numero_documento: string | null; data_compra: string; data_pedido: string | null; data_entrega_prevista: string | null; valor: number; condicao_pagamento: string | null; observacoes: string | null; arquivo: string | null; criado_em: string; criado_por: string | null; itens: NotaItem[] }
export const pedidoApi = {
  async nota(id: string): Promise<NotaDetalhe> {
    const { data, error } = await supabase.rpc('fn_recebimento_nota', { p_id: id });
    lancar(error);
    return data as NotaDetalhe;
  },
  async salvar(p: { entrada_id: string | null; fornecedor_id: string; data_entrega_prevista: string | null; condicao_pagamento: string; observacoes: string | null; itens: Array<{ linha_id: string | null; item_id: string; quantidade: number; custo_unitario: number }> }) {
    const { data, error } = await supabase.rpc('fn_pedido_salvar', { p });
    lancar(error);
    return data as { entrada_id: string; itens: number; valor_total: number };
  },
};
