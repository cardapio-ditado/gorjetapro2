import { supabase } from '../../lib/supabase';

/** Chamadas do Estoque Beta 2 que já gravam de verdade. */

export interface Hoje {
  hoje: string;
  gestor: boolean;
  aprovador: boolean;
  pedidos_a_entregar: number;
  retiradas_sem_confirmacao: number;
  repor_setores: number;
  contagem_setores_falta: number;
  auditoria_hoje: boolean;
  aprovacoes_pendentes: number;
  notas_pendentes: number;
  zonas_central: { vencidas: number; em_andamento: number; total: number };
  negativos: number;
  zig: { status: string; nao_mapeados: number; finalizado_em: string | null } | null;
  central_abaixo_ponto: number;
  kits_faltando: number;
  setores_pendencias: number;
  setores_vazios: string[];
  emprestimos_abertos: number;
  emprestimos_antigos: number;
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

// ── Empréstimo com vizinhos ──────────────────────────────────────────────────
export type SentidoEmprestimo = 'pegamos' | 'emprestamos';
export interface Vizinho { id: string; nome: string; telefone: string | null; observacoes: string | null; ativo: boolean; abertos: number; historico: number }
export interface EmprestimoAberto { id: string; vizinho_id: string; vizinho: string; telefone: string | null; item_id: string; item: string; um: string; sentido: SentidoEmprestimo; quantidade: number; devolvido: number; falta: number; custo: number; valor: number; data: string; dias: number; responsavel: string | null; observacoes: string | null }
export interface EmprestimoRecente { id: string; vizinho: string; item: string; um: string; sentido: SentidoEmprestimo; quantidade: number; status: 'quitado' | 'cancelado'; data: string; quitado_em: string; responsavel: string | null; motivo: string | null }
export interface VizinhosTela { vizinhos: Vizinho[]; abertos: EmprestimoAberto[]; recentes: EmprestimoRecente[]; totais: { devemos_itens: number; devemos_valor: number; nos_devem_itens: number; nos_devem_valor: number; mais_antigo_dias: number; antigos: number } }
export const vizinhosApi = {
  async tela(): Promise<VizinhosTela> {
    const { data, error } = await supabase.rpc('fn_vizinhos_tela');
    lancar(error);
    return data as VizinhosTela;
  },
  async salvar(p: { id?: string | null; nome: string; telefone: string | null; observacoes: string | null; ativo?: boolean }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_vizinho_salvar', { p });
    lancar(error);
    return data as string;
  },
  async registrar(p: { vizinho_id: string; sentido: SentidoEmprestimo; itens: Array<{ item_id: string; quantidade: number }>; responsavel: string | null; observacoes: string | null }) {
    const { data, error } = await supabase.rpc('fn_emprestimo_registrar', { p });
    lancar(error);
    return data as { n: number; ids: string[]; ficou_negativo: string[] };
  },
  async devolver(id: string, quantidade: number | null, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_emprestimo_devolver', { p_id: id, p_quantidade: quantidade, p_responsavel: responsavel });
    lancar(error);
    return data as { id: string; devolvido: number; falta: number; status: 'aberto' | 'quitado' };
  },
  async cancelar(id: string, motivo: string | null) {
    const { error } = await supabase.rpc('fn_emprestimo_cancelar', { p_id: id, p_motivo: motivo });
    lancar(error);
  },
};

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

// ── Contagem dos setores e aprovações ────────────────────────────────────────
export interface ContagemHoje { id: string; status: string; contados: number; total: number }
export interface ContagemSetor { id: string; nome: string; tipo: string; itens_contagem: number; itens_total: number; diaria: ContagemHoje | null; auditoria: ContagemHoje | null; ultima_diaria: string | null; ultima_auditoria: string | null; aguardando_aprovacao: number }
export interface ContagemTela { hoje: string; auditoria_hoje: boolean; dias_auditoria: number[]; aprovacoes_pendentes: number; setores: ContagemSetor[] }
export interface ContagemItem { linha_id: string; item_id: string; nome: string; categoria: string; um: string; sistema: number; contada: number | null; nivel: number | null; valor_unitario: number | null }
export interface ContagemFolha { id: string; estoque: { id: string; nome: string }; modo: 'diaria' | 'auditoria'; status: string; responsavel: string; contados: number; total: number; itens: ContagemItem[] }
export interface AprovacaoItem { linha_id: string; item_id: string; nome: string; um: string; sistema: number; contada: number; diferenca: number; valor: number }
export interface AprovacoesTela { posso_aprovar: boolean; aprovadores: string[]; pendentes: Array<{ id: string; estoque: string; responsavel: string; finalizado_em: string; contados: number; itens: AprovacaoItem[] }> }
// ── Vínculos da Zig ──────────────────────────────────────────────────────────
export type SituacaoZig = 'sem_vinculo' | 'incompleto' | 'item' | 'ficha' | 'ignorar';
export interface ProdutoZig { id: string; nome: string; categoria: string; situacao: SituacaoZig; item_id: string | null; item_nome: string | null; item_um: string | null; ficha_id: string | null; ficha_nome: string | null; estoque_id: string | null; estoque_nome: string | null; expandir: boolean; vendido_30d: number; ultima_venda: string | null; pendencias: number; usado_vezes: number; atualizado_em: string | null }
export interface ZigTela {
  produtos: ProdutoZig[];
  totais: { sem_vinculo: number; incompletos: number; ignorados: number; vinculados: number; sem_vinculo_vendendo: number; vendas_paradas_30d: number };
  ultimo_sync: { iniciado_em: string; status: string; periodo: string; baixados: number; pendentes: number; ignorados: number; movimentacoes: number; erro: string | null } | null;
  estoques: Array<{ id: string; nome: string; tipo: string }>;
  fichas: Array<{ id: string; nome: string; tipo: string }>;
}
export const zigApi = {
  async tela(): Promise<ZigTela> {
    const { data, error } = await supabase.rpc('fn_zig_vinculos_tela');
    lancar(error);
    return data as ZigTela;
  },
  async salvar(p: { nome: string; modo: 'item' | 'ficha' | 'ignorar' | 'limpar'; item_id?: string | null; ficha_id?: string | null; estoque_id?: string | null; expandir?: boolean }) {
    const { data, error } = await supabase.rpc('fn_zig_vinculo_salvar', { p });
    lancar(error);
    return data as { id: string; nome: string; modo: string };
  },
};

// ── Contagem do Central (zonas) ──────────────────────────────────────────────
export type SituacaoZona = 'em_andamento' | 'atrasado' | 'vence_hoje' | 'nunca' | 'em_dia' | 'concluido_hoje' | 'sem_agenda';
export interface Zona { bloco: string; especial: boolean; itens: number; ciclo_dias: number; ultima_contagem: string | null; vence_em: string | null; situacao: SituacaoZona; contagem_hoje_id: string | null; contagem_hoje_status: string | null; contados_hoje: number; total_hoje: number }
export interface AgendaItem { id: string; bloco: string; dia: string; contagem_id: string | null; contagem_status: string | null; situacao: 'feita' | 'em_andamento' | 'perdida' | 'hoje' | 'agendada' }
export interface CentralUltima { id: string; bloco: string; data: string; processado_em: string; responsavel: string | null; contados: number; diferencas: number; valor: number }
export interface CentralTela { hoje: string; estoque: { id: string; nome: string }; tem_agenda: boolean; zonas: Zona[]; resumo: { blocos: number; devidos_hoje: number; concluidos_hoje: number; em_andamento: number; faltam_itens: number }; agenda: AgendaItem[]; ultimas: CentralUltima[] }
export interface ZonaItem { linha_id: string; item_id: string; nome: string; categoria: string; um: string; sistema: number; contada: number | null; valor_unitario: number | null }
export interface ZonaFolha { id: string; estoque: { id: string; nome: string }; bloco: string; nome: string; status: string; responsavel: string | null; contados: number; total: number; itens: ZonaItem[] }
export const centralContagemApi = {
  async tela(): Promise<CentralTela> {
    const { data, error } = await supabase.rpc('fn_contagem_central_tela');
    lancar(error);
    const d = data as Omit<CentralTela, 'zonas'> & { blocos: Zona[] };
    return { ...d, zonas: d.blocos || [], agenda: d.agenda || [], ultimas: d.ultimas || [] };
  },
  async abrir(estoqueId: string, bloco: string, responsavel: string | null): Promise<ZonaFolha> {
    const { data, error } = await supabase.rpc('fn_contagem_bloco_abrir', { p_estoque_id: estoqueId, p_bloco: bloco, p_responsavel: responsavel });
    lancar(error);
    return centralContagemApi.folha(String((data as { id: string }).id));
  },
  async folha(id: string): Promise<ZonaFolha> {
    const { data, error } = await supabase.rpc('fn_contagem_central_itens', { p_id: id });
    lancar(error);
    if (!data) throw new Error('Contagem não encontrada');
    return data as ZonaFolha;
  },
  async anotar(id: string, itens: Array<{ linha_id: string; contada: number | null }>) {
    const { data, error } = await supabase.rpc('fn_contagem_setor_anotar', { p_id: id, p_itens: itens });
    lancar(error);
    return data as { id: string; contados: number; total: number };
  },
  async concluir(id: string, usuarioId: string | null) {
    const { data, error } = await supabase.rpc('fn_contagem_bloco_concluir', { p_contagem_id: id, p_usuario_id: usuarioId });
    lancar(error);
    const r = data as { success?: boolean; error?: string; total_ajustes?: number; total_sem_diff?: number };
    if (r.success === false) throw new Error(r.error || 'Não foi possível concluir');
    return { ajustes: Number(r.total_ajustes || 0), iguais: Number(r.total_sem_diff || 0) };
  },
  async ciclo(categoria: string, dias: number) {
    const { error } = await supabase.rpc('fn_contagem_ciclo_definir', { p_categoria: categoria, p_ciclo_dias: dias });
    lancar(error);
  },
  async agendar(estoqueId: string, bloco: string, dia: string) {
    const { error } = await supabase.rpc('fn_contagem_agenda_definir', { p_estoque_id: estoqueId, p_bloco: bloco, p_dia: dia });
    lancar(error);
  },
  async desagendar(id: string) {
    const { error } = await supabase.rpc('fn_contagem_agenda_remover', { p_id: id });
    lancar(error);
  },
  async mover(id: string, dia: string) {
    const { error } = await supabase.rpc('fn_contagem_agenda_mover', { p_id: id, p_dia: dia });
    lancar(error);
  },
  async repetirSemana(estoqueId: string, inicio: string, semanas: number) {
    const { data, error } = await supabase.rpc('fn_contagem_agenda_replicar', { p_estoque_id: estoqueId, p_inicio: inicio, p_semanas: semanas });
    lancar(error);
    return Number((data as { criados?: number })?.criados || 0);
  },
};

export const contagemApi = {
  async tela(): Promise<ContagemTela> {
    const { data, error } = await supabase.rpc('fn_contagem_setor_tela');
    lancar(error);
    return data as ContagemTela;
  },
  async abrir(estoqueId: string, modo: 'diaria' | 'auditoria', responsavel: string | null): Promise<ContagemFolha> {
    const { data, error } = await supabase.rpc('fn_contagem_setor_abrir', { p_estoque: estoqueId, p_modo: modo, p_responsavel: responsavel });
    lancar(error);
    return data as ContagemFolha;
  },
  async anotar(id: string, itens: Array<{ linha_id: string; contada: number | null }>) {
    const { data, error } = await supabase.rpc('fn_contagem_setor_anotar', { p_id: id, p_itens: itens });
    lancar(error);
    return data as { id: string; contados: number; total: number };
  },
  async concluir(id: string) {
    const { data, error } = await supabase.rpc('fn_contagem_setor_concluir', { p_id: id });
    lancar(error);
    return data as { id: string; modo: string; aprovacao: boolean; contados: number; acertos?: number; diferencas?: number; valor: number };
  },
  async aprovacoes(): Promise<AprovacoesTela> {
    const { data, error } = await supabase.rpc('fn_aprovacoes_tela');
    lancar(error);
    return data as AprovacoesTela;
  },
  async decidir(id: string, acao: 'aprovar' | 'rejeitar', manter: string[], motivo: string | null) {
    const { data, error } = await supabase.rpc('fn_aprovacao_decidir', { p_id: id, p_acao: acao, p_manter: manter, p_motivo: motivo });
    lancar(error);
    return data as { id: string; acao: string; acertos?: number; mantidos?: number };
  },
};

// ── Produção ────────────────────────────────────────────────────────────────
export interface IngredienteProducao { item_id: string; nome: string; um: string; quantidade: number; custo: number; em_producao: number; em_central: number }
export interface FichaProducao {
  id: string; nome: string; rendimento: number; um_rend: string; custo_ficha: number;
  produz: { item_id: string; nome: string; um: string; central: number; custo: number };
  ingredientes: IngredienteProducao[]; lotes_possiveis: number; ultima: string | null;
}
export interface InsumoProducao { item_id: string; nome: string; categoria: string; um: string; saldo: number; custo: number; valor: number; ultima: string | null }
export interface ProducaoFeita { id: string; lote: string | null; ficha: string; lotes: number; produzido: number; um: string; custo: number; responsavel: string | null; data: string; criado_em: string; observacoes: string | null }
export interface ProducaoTela {
  central: { id: string; nome: string }; producao: { id: string; nome: string };
  fichas: FichaProducao[]; insumos: InsumoProducao[]; ultimas: ProducaoFeita[];
  totais: { producoes_7d: number; valor_insumos: number; insumos: number; fichas: number };
}
export interface ResultadoProduzir { producao_id: string; lote: string | null; ficha: string; lotes: number; produto: string; produzido: number; um: string; custo_total: number; custo_unitario: number; puxados: string[]; negativos: string[] }

export const producaoApi = {
  async tela(): Promise<ProducaoTela> {
    const { data, error } = await supabase.rpc('fn_producao_tela');
    lancar(error);
    return data as ProducaoTela;
  },
  /** mandar = Central → Produção; devolver = Produção → Central. Limita ao saldo da origem. */
  async mover(sentido: 'mandar' | 'devolver', itens: Array<{ item_id: string; quantidade: number }>, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_producao_mover', { p_sentido: sentido, p_itens: itens, p_responsavel: responsavel });
    lancar(error);
    return data as { itens: number; faltou: string[] };
  },
  async produzir(p: { ficha_id: string; lotes: number; puxar_central: boolean; responsavel: string | null; observacoes: string | null }): Promise<ResultadoProduzir> {
    const { data, error } = await supabase.rpc('fn_producao_produzir', { p });
    lancar(error);
    return data as ResultadoProduzir;
  },
};
