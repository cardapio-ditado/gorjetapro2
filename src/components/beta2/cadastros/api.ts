import { supabase } from '../../../lib/supabase';

/** Cadastros do Beta 2: itens, estoques, fichas técnicas e fornecedores. Tudo grava no cadastro real. */

export type TipoCadastro = 'item' | 'estoque' | 'ficha' | 'fornecedor';

export interface Item {
  id: string; nome: string; codigo: string | null; descricao: string | null; tipo_item: string; categoria: string;
  unidade_medida: string; custo_medio: number | null; tem_validade: boolean | null; observacoes: string | null; status: string;
  estoque_nativo_id: string | null; tipo_compra: string | null; fornecedor_padrao_id: string | null; grupo_contagem: string;
  ignorar_contagem: boolean; entra_no_cmv: boolean | null;
}
export interface Estoque { id: string; nome: string; descricao: string | null; localizacao: string | null; tipo: string; status: boolean | null }
export interface Fornecedor {
  id: string; nome: string; cnpj: string | null; telefone: string | null; email: string | null; responsavel: string | null; endereco: string | null;
  observacoes: string | null; status: string | null; categoria_padrao_id: string | null; tipo: string | null; ciclo_compra_dias: number | null;
  dias_compra: number[] | null; modalidade: string; grupo: string | null;
}
export interface FichaResumo {
  id: string; nome: string; tipo_consumo: string; porcoes: number; rendimento: number | null; unidade_rendimento: string | null;
  custo_total: number; ativo: boolean; ingredientes: number; vendas: number; usada_em: number; producoes: number;
}
export interface FichaCompleta {
  id: string; nome: string; porcoes: number | null; ativo: boolean | null; tipo_consumo: string | null; modo_preparo: string | null;
  observacoes_preparo: string | null; rendimento: number | null; unidade_rendimento: string | null; custo_total: number | null; categoria: string | null;
}
export interface IngredienteLinha {
  item_estoque_id: string | null; ficha_tecnica_ingrediente_id: string | null; quantidade: number; observacoes: string | null; baixa_estoque: boolean;
}
export interface ItemBasico { id: string; nome: string; unidade_medida: string; custo_medio: number | null; status: string; categoria: string }
export interface Vinculo { rotulo: string; qtd: number; bloqueia: boolean; desfaz?: boolean; detalhe?: string }
export interface Vinculos { vinculos: Vinculo[]; pode_excluir: boolean }
export interface CategoriaFinanceira { id: string; nome: string; caminho_completo: string | null }

function lancar(error: { message: string; details?: string; hint?: string } | null): void {
  if (error) throw new Error([error.message, error.details, error.hint].filter(Boolean).join(' — '));
}

/** PostgREST devolve no máximo 1000 linhas por chamada; lê em páginas. */
async function todos<T>(tabela: string, colunas: string, ordem = 'nome'): Promise<T[]> {
  const saida: T[] = [];
  for (let ini = 0; ini < 20000; ini += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).order(ordem).range(ini, ini + 999);
    lancar(error);
    saida.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return saida;
}

export const cadastrosApi = {
  itens: () => todos<Item>('itens_estoque', 'id,nome,codigo,descricao,tipo_item,categoria,unidade_medida,custo_medio,tem_validade,observacoes,status,estoque_nativo_id,tipo_compra,fornecedor_padrao_id,grupo_contagem,ignorar_contagem,entra_no_cmv'),
  itensBasicos: () => todos<ItemBasico>('itens_estoque', 'id,nome,unidade_medida,custo_medio,status,categoria'),
  estoques: () => todos<Estoque>('estoques', 'id,nome,descricao,localizacao,tipo,status'),
  fornecedores: () => todos<Fornecedor>('fornecedores', 'id,nome,cnpj,telefone,email,responsavel,endereco,observacoes,status,categoria_padrao_id,tipo,ciclo_compra_dias,dias_compra,modalidade,grupo'),
  async categoriasFinanceiras(): Promise<CategoriaFinanceira[]> {
    const { data, error } = await supabase.from('vw_categoria_tree').select('id,nome,caminho_completo').eq('tipo', 'despesa').eq('status', 'ativo').order('caminho_completo');
    lancar(error);
    return (data || []) as CategoriaFinanceira[];
  },

  async salvar(tabela: 'itens_estoque' | 'estoques' | 'fornecedores', id: string | null, valores: Record<string, unknown>): Promise<string> {
    if (id) {
      const { error } = await supabase.from(tabela).update({ ...valores, atualizado_em: new Date().toISOString() }).eq('id', id);
      lancar(error);
      return id;
    }
    const { data, error } = await supabase.from(tabela).insert([valores]).select('id').single();
    lancar(error);
    return String((data as { id: string }).id);
  },

  async fichas(): Promise<FichaResumo[]> {
    const { data, error } = await supabase.rpc('fn_fichas_lista');
    lancar(error);
    return (data as FichaResumo[]) || [];
  },
  async fichaCarregar(id: string): Promise<{ ficha: FichaCompleta; ingredientes: IngredienteLinha[] }> {
    const [f, i] = await Promise.all([
      supabase.from('fichas_tecnicas').select('id,nome,porcoes,ativo,tipo_consumo,modo_preparo,observacoes_preparo,rendimento,unidade_rendimento,custo_total,categoria').eq('id', id).single(),
      supabase.from('ficha_ingredientes').select('item_estoque_id,ficha_tecnica_ingrediente_id,quantidade,observacoes,baixa_estoque,ordem').eq('ficha_id', id).order('ordem'),
    ]);
    lancar(f.error); lancar(i.error);
    return { ficha: f.data as FichaCompleta, ingredientes: (i.data || []) as IngredienteLinha[] };
  },
  async fichaSalvar(p: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('fn_ficha_salvar', { p });
    lancar(error);
    return String(data);
  },

  async vinculos(tipo: TipoCadastro, id: string): Promise<Vinculos> {
    const { data, error } = await supabase.rpc('fn_cadastro_vinculos', { p_tipo: tipo, p_id: id });
    lancar(error);
    return data as Vinculos;
  },
  async excluir(tipo: TipoCadastro, id: string, modo: 'arquivar' | 'restaurar' | 'excluir'): Promise<{ modo: string; feito: Array<{ rotulo: string; qtd: number }> }> {
    const { data, error } = await supabase.rpc('fn_cadastro_excluir', { p_tipo: tipo, p_id: id, p_modo: modo });
    lancar(error);
    return data as { modo: string; feito: Array<{ rotulo: string; qtd: number }> };
  },
};

export const brl = (n: number | null | undefined) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
export const UNIDADES = ['unidade', 'kg', 'g', 'litro', 'ml', 'pacote', 'caixa', 'garrafa', 'lata', 'fardo', 'dúzia'];
export const DIAS = [{ id: 1, txt: 'Seg' }, { id: 2, txt: 'Ter' }, { id: 3, txt: 'Qua' }, { id: 4, txt: 'Qui' }, { id: 5, txt: 'Sex' }, { id: 6, txt: 'Sáb' }, { id: 7, txt: 'Dom' }];
