import { supabase } from '../../../lib/supabase';
import { normalizarLista, type ListaResumo } from '../../inventory/CardListaCompra';

export type { ListaResumo };

/**
 * Compras do Beta 2: a mesma máquina do módulo antigo (fn_compras_tela,
 * fn_compras_gerar, listas públicas, conferência, revisão), só a tela mudou.
 */
export type Modalidade = 'entrega' | 'rua';
export type Destino = 'rua' | 'fornecedor';
export type Classe = 'rua' | 'pedido' | 'sob_demanda';
export type Situacao = 'zerado' | 'comprar' | 'atencao' | 'ok' | 'extra';

export interface FornecedorRecente { fornecedor_id: string; nome: string; modalidade: Modalidade; ultimo_preco: number | null; compras: number }
export interface ItemCompra {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; situacao: Situacao; sugerida: number; preco: number;
  em_lista: number; em_lista_onde: string | null; adiado_ate: string | null;
  classe: Classe | null; recentes: FornecedorRecente[];
}
export interface ItemCatalogo {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; preco: number; classe: Classe | null; recentes: FornecedorRecente[];
}
export interface Fornecedor { id: string; nome: string; modalidade: Modalidade; telefone: string | null }
export interface FornCategoria { fornecedor_id: string; nome: string; compras: number }
export interface Anotacao { item_id: string; nome: string; um: string; encontrado: number | null; comprar: number | null; obs: string | null; anotado_em: string }
export interface Conferencia { id: string; data: string; status: 'aberta' | 'fechada'; titulo: string | null; itens: Anotacao[] }
export interface ComprasTela {
  hoje: string; itens: ItemCompra[]; catalogo: ItemCatalogo[]; listas: ListaResumo[];
  fornecedores: Fornecedor[]; categoriaFornecedores: Record<string, FornCategoria[]>; conferencia: Conferencia | null;
  config: { pendentes_classe: number; pendentes_classe_com_ponto: number; pontos_sem_giro: number };
}
export interface LinhaGerar { item_id: string; quantidade: number; destino: Destino; fornecedor_id: string | null; loja_id: string | null; observacao?: string | null }

export interface ItemRevisao {
  item_id: string; nome: string; categoria: string | null; um: string; ponto: number; saldo: number; consumo_dia: number;
  classe: Classe | null; compras_180d: number; ultima_compra: string | null;
  ultimo_fornecedor: { nome: string; modalidade: string; compras: number } | null; sugestao: Classe | null;
}
export interface PontoSemGiro {
  item_id: string; nome: string; categoria: string | null; um: string; ponto: number; saldo: number;
  compras_180d: number; ultima_compra: string | null; motivo: 'categoria' | 'nunca_comprado' | 'sem_consumo';
}
export interface RevisaoTela { itens: ItemRevisao[]; pontosSemGiro: PontoSemGiro[]; totais: Record<string, number> }

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));
const lista = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const classeOk = (v: unknown): Classe | null => (v === 'rua' || v === 'pedido' || v === 'sob_demanda' ? v : null);
const modalidade = (v: unknown): Modalidade => (v === 'rua' ? 'rua' : 'entrega');
const recentesDe = (raw: unknown): FornecedorRecente[] => lista(raw).map(r => ({
  fornecedor_id: String(r.fornecedor_id), nome: String(r.nome ?? ''), modalidade: modalidade(r.modalidade), ultimo_preco: numOuNull(r.ultimo_preco), compras: num(r.compras),
}));

function lancar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const comprasApi = {
  async tela(): Promise<ComprasTela> {
    const { data, error } = await supabase.rpc('fn_compras_tela');
    lancar(error);
    const d = (data || {}) as Raw;
    const cfg = (d.config || {}) as Raw;
    const categoriaFornecedores: Record<string, FornCategoria[]> = {};
    for (const [cat, l] of Object.entries((d.categoria_fornecedores || {}) as Raw)) {
      categoriaFornecedores[cat] = lista(l).map(f => ({ fornecedor_id: String(f.fornecedor_id), nome: String(f.nome ?? ''), compras: num(f.compras) }));
    }
    const c = d.conferencia && typeof d.conferencia === 'object' ? (d.conferencia as Raw) : null;
    return {
      hoje: String(d.hoje ?? ''),
      itens: lista(d.itens).map(r => ({
        item_id: String(r.item_id), nome: String(r.nome ?? '').trim(), categoria: txt(r.categoria), um: String(r.um ?? ''), fracionado: Boolean(r.fracionado),
        saldo: num(r.saldo), ponto: num(r.ponto), situacao: ((r.situacao as Situacao) || 'ok'), sugerida: num(r.sugerida), preco: num(r.preco),
        em_lista: num(r.em_lista), em_lista_onde: txt(r.em_lista_onde), adiado_ate: r.adiado_ate ? String(r.adiado_ate).slice(0, 10) : null,
        classe: classeOk(r.classe), recentes: recentesDe(r.recentes),
      })),
      catalogo: lista(d.catalogo).map(r => ({
        item_id: String(r.item_id), nome: String(r.nome ?? '').trim(), categoria: txt(r.categoria), um: String(r.um ?? ''), fracionado: Boolean(r.fracionado),
        saldo: num(r.saldo), ponto: num(r.ponto), preco: num(r.preco), classe: classeOk(r.classe), recentes: recentesDe(r.recentes),
      })),
      listas: lista(d.listas).map(normalizarLista),
      fornecedores: lista(d.fornecedores).map(f => ({ id: String(f.id), nome: String(f.nome ?? '').trim(), modalidade: modalidade(f.modalidade), telefone: txt(f.telefone) })),
      categoriaFornecedores,
      conferencia: c ? {
        id: String(c.id), data: String(c.data ?? ''), status: c.status === 'fechada' ? 'fechada' : 'aberta', titulo: txt(c.titulo),
        itens: lista(c.itens).map(a => ({ item_id: String(a.item_id), nome: String(a.nome ?? '').trim(), um: String(a.um ?? ''), encontrado: numOuNull(a.encontrado), comprar: numOuNull(a.comprar), obs: txt(a.obs), anotado_em: String(a.anotado_em ?? '') })),
      } : null,
      config: { pendentes_classe: num(cfg.pendentes_classe), pendentes_classe_com_ponto: num(cfg.pendentes_classe_com_ponto), pontos_sem_giro: num(cfg.pontos_sem_giro) },
    };
  },

  async gerar(linhas: LinhaGerar[]) {
    const { data, error } = await supabase.rpc('fn_compras_gerar', { p_linhas: linhas });
    lancar(error);
    const r = (data || {}) as Raw;
    return { linhas: num(r.linhas), listas: lista(r.listas).map(normalizarLista) };
  },

  async adiar(itemId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_compras_adiar', { p_item_id: itemId, p_dias: 1 });
    lancar(error);
    const r = (data || {}) as { success?: boolean; error?: string; adiado_ate?: string };
    if (r.success === false) throw new Error(r.error || 'Não foi possível adiar');
    return r.adiado_ate ? String(r.adiado_ate).slice(0, 10) : null;
  },
  async adiarDesfazer(itemId: string) {
    const { error } = await supabase.rpc('fn_compras_adiar_desfazer', { p_item_id: itemId });
    lancar(error);
  },

  async conferenciaCriar() { const { error } = await supabase.rpc('fn_conferencia_criar'); lancar(error); },
  async conferenciaStatus(id: string, status: 'aberta' | 'fechada') {
    const { error } = await supabase.rpc('fn_conferencia_status', { p_id: id, p_status: status });
    lancar(error);
  },

  async listaStatus(listaId: string, status: 'concluida' | 'cancelada' | 'aberta') {
    const { error } = await supabase.rpc('fn_lista_status', { p_lista_id: listaId, p_status: status });
    lancar(error);
  },
  /** Itens de uma lista, para montar o texto do pedido no WhatsApp. */
  async listaItens(listaId: string) {
    const { data, error } = await supabase.rpc('fn_lista_publica', { p_lista_id: listaId });
    lancar(error);
    return lista((data as Raw | null)?.itens).map(i => ({ nome: String(i.nome ?? ''), quantidade: num(i.quantidade), um: String(i.um ?? ''), observacao: txt(i.observacao) }));
  },

  async revisao(): Promise<RevisaoTela> {
    const { data, error } = await supabase.rpc('fn_compras_revisao');
    lancar(error);
    const d = (data || {}) as Raw;
    return {
      itens: lista(d.itens).map(p => {
        const uf = p.ultimo_fornecedor && typeof p.ultimo_fornecedor === 'object' ? (p.ultimo_fornecedor as Raw) : null;
        return {
          item_id: String(p.item_id), nome: String(p.nome ?? '').trim(), categoria: txt(p.categoria), um: String(p.um ?? ''),
          ponto: num(p.ponto), saldo: num(p.saldo), consumo_dia: num(p.consumo_dia), classe: classeOk(p.classe),
          compras_180d: num(p.compras_180d), ultima_compra: txt(p.ultima_compra),
          ultimo_fornecedor: uf ? { nome: String(uf.nome ?? ''), modalidade: String(uf.modalidade ?? ''), compras: num(uf.compras) } : null,
          sugestao: classeOk(p.sugestao),
        };
      }),
      pontosSemGiro: lista(d.pontos_sem_giro).map(p => ({
        item_id: String(p.item_id), nome: String(p.nome ?? '').trim(), categoria: txt(p.categoria), um: String(p.um ?? ''),
        ponto: num(p.ponto), saldo: num(p.saldo), compras_180d: num(p.compras_180d), ultima_compra: txt(p.ultima_compra),
        motivo: (p.motivo as PontoSemGiro['motivo']) || 'sem_consumo',
      })),
      totais: Object.fromEntries(Object.entries((d.totais || {}) as Raw).map(([k, v]) => [k, num(v)])),
    };
  },
  async classeDefinir(itemId: string, classe: Classe) {
    const { error } = await supabase.rpc('fn_compras_classe_definir', { p_item_id: itemId, p_classe: classe });
    lancar(error);
  },
  async classeLote(itens: Array<{ item_id: string; classe: Classe }>) {
    const { error } = await supabase.rpc('fn_compras_classe_lote', { p_itens: itens });
    lancar(error);
  },
  async pontoRevisar(itemId: string, acao: 'zerar' | 'manter' | 'definir', ponto?: number) {
    const { error } = await supabase.rpc('fn_ponto_revisar', acao === 'definir' ? { p_item_id: itemId, p_acao: acao, p_ponto: ponto } : { p_item_id: itemId, p_acao: acao });
    lancar(error);
  },
  async inativar(itemId: string) {
    const { error } = await supabase.from('itens_estoque').update({ status: 'inativo', atualizado_em: new Date().toISOString() }).eq('id', itemId);
    lancar(error);
  },
};
