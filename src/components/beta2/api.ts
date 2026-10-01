import { supabase } from '../../lib/supabase';

/** Chamadas do Estoque Beta 2 que já gravam de verdade. */

export interface Hoje {
  hoje: string;
  gestor: boolean;
  aprovador: boolean;
  pedidos_a_entregar: number;
  retiradas_sem_confirmacao: number;
  repor_setores: number;
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

// ── Repor os setores ─────────────────────────────────────────────────────────
export interface ReporItem { item_id: string; nome: string; categoria: string | null; um: string; nivel: number; saldo: number; central: number; sugestao: number; por_contagem: boolean; contado_em: string | null }
export interface ReporSetor { id: string; nome: string; itens: ReporItem[]; configurados: number; ultima_entrega: { quando: string; itens: number } | null }
export interface ReporTela { hoje: string; zig: { status: string; finalizado_em: string | null; nao_mapeados: number; de_hoje: boolean } | null; setores: ReporSetor[] }
export const reposicaoApi = {
  async tela(): Promise<ReporTela> {
    const { data, error } = await supabase.rpc('fn_repor_tela');
    lancar(error);
    return data as ReporTela;
  },
  async mandar(estoqueId: string, itens: Array<{ item_id: string; quantidade: number }>, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_repor_setor', { p_estoque: estoqueId, p_itens: itens, p_responsavel: responsavel });
    lancar(error);
    return data as { requisicao_id: string; setor: string; itens: number; faltou: string[]; antigas_encerradas: number; movimentacoes: number };
  },
};

// ── Retiradas e pedidos ──────────────────────────────────────────────────────
export interface MovLinha { item_id: string; quantidade: number }
export interface MovItem { item_id: string; nome: string; um: string; solicitada: number; entregue: number | null; central: number; observacao: string | null }
export interface MovRequisicao { id: string; numero: string; tipo: 'pedido' | 'retirada'; status: string; quem: string; setor: string | null; estoque_destino_id: string; destino: string; quando: string; data_conclusao: string | null; observacoes: string | null; confirmado_nome: string | null; confirmado_em: string | null; itens: MovItem[]; entregue_por: string | null }
export interface MovTela { setores: Array<{ id: string; nome: string }>; pedidos_abertos: MovRequisicao[]; retiradas_sem_confirmacao: MovRequisicao[]; recentes: MovRequisicao[] }
export const movimentosApi = {
  async tela(): Promise<MovTela> {
    const { data, error } = await supabase.rpc('fn_movimentos_tela');
    lancar(error);
    return data as MovTela;
  },
  async pedidoCriar(p: { estoque_id: string; quem: string; observacoes: string | null; itens: MovLinha[] }) {
    const { data, error } = await supabase.rpc('fn_pedido_interno_criar', { p });
    lancar(error);
    return data as { requisicao_id: string; setor: string; itens: number };
  },
  async pedidoEntregar(id: string, itens: MovLinha[], responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_pedido_interno_entregar', { p_id: id, p_itens: itens, p_responsavel: responsavel });
    lancar(error);
    return data as { requisicao_id: string; itens: number; faltou: string[]; movimentacoes: number };
  },
  async retiradaRegistrar(p: { estoque_id: string; quem: string; observacoes: string | null; itens: MovLinha[] }) {
    const { data, error } = await supabase.rpc('fn_retirada_registrar', { p });
    lancar(error);
    return data as { requisicao_id: string; setor: string; itens: number; ficou_negativo: string[] };
  },
  async retiradaConfirmar(id: string, quem: string) {
    const { data, error } = await supabase.rpc('fn_retirada_confirmar', { p_id: id, p_quem: quem });
    lancar(error);
    return data as { requisicao_id: string; confirmado_por: string };
  },
};

// ── Movimentações (histórico) ────────────────────────────────────────────────
export interface MovFiltro { de: string; ate: string; tipo: string | null; origem: string | null; estoque_id: string | null; busca: string | null; limite?: number; pular?: number }
export interface MovLinhaHist { id: string; data: string; criado_em: string; tipo: string; origem: string; item: string; um: string | null; categoria: string | null; item_id: string | null; quantidade: number; custo_unitario: number | null; custo_total: number | null; de_nome: string | null; para_nome: string | null; motivo: string | null; observacoes: string | null; quem: string | null }
export interface MovLista { total: number; totais: { entradas: number; valor_entradas: number; saidas: number; valor_saidas: number; transferencias: number; ajustes: number }; linhas: MovLinhaHist[] }
export const movimentacoesApi = {
  async lista(p: MovFiltro): Promise<MovLista> {
    const { data, error } = await supabase.rpc('fn_movimentacoes_lista', { p });
    lancar(error);
    return data as MovLista;
  },
};
