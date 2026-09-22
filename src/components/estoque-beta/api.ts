import { supabase } from '../../lib/supabase';

export type Controle = 'contagem' | 'venda';

/** Campos comuns de "como se conta" que todas as telas usam. */
export interface ComoConta {
  rotulo_solto: string;
  rotulo_fechado: string | null;
  fator_fechado: number | null;
  permite_fracao: boolean;
  foto_url: string | null;
  dica: string | null;
}

export interface ItemMontagem extends ComoConta {
  item_id: string;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  controle: Controle;
  precisa_contar: boolean;
  nivel: number;
  saldo_antes: number;
  saldo_central: number;
  fechados: number | null;
  soltos: number | null;
  contado: number | null;
  levar: number;
  entregue: number | null;
  contado_em: string | null;
}

export interface Montagem {
  id: string;
  estoque_id: string;
  data: string;
  conferencia: boolean;
  status: 'contando' | 'levando' | 'concluida' | 'cancelada';
  responsavel: string | null;
  concluido_em: string | null;
}

export interface Abertura {
  montagem: Montagem;
  estoque: { id: string; nome: string };
  itens: ItemMontagem[];
}

export interface Balcao {
  id: string;
  nome: string;
  itens: number;
  itens_contagem: number;
  montagem: {
    id: string;
    status: Montagem['status'];
    conferencia: boolean;
    contados: number;
    total: number;
    concluido_em: string | null;
  } | null;
}

export interface Painel {
  hoje: string;
  dia_conferencia: boolean;
  balcoes: Balcao[] | null;
}

export interface ItemConfig extends ComoConta {
  item_id: string;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  nivel: number | null;
  controle: Controle | null;
  tem_ficha: boolean;
  consumo_dia: number;
}

export interface ConfigItemPayload {
  rotulo_solto: string;
  rotulo_fechado: string | null;
  fator_fechado: number | null;
  permite_fracao: boolean;
  dica: string | null;
}

/** Resultado da busca de item (receber e pedir mais). */
export interface ItemBusca {
  item_id: string;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  foto_url: string | null;
  rotulo_solto: string;
  rotulo_fechado: string | null;
  fator_fechado: number | null;
  custo_medio: number;
  saldo_central: number;
  no_balcao: boolean;
  score: number;
}

/** Uma linha lida da nota, já com a sugestão de item. */
export interface LinhaNota {
  indice: number;
  descricao: string;
  codigo: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
  sugestao: ItemBusca | null;
  opcoes: ItemBusca[];
}

export interface Preparo {
  fornecedor: { id: string; nome: string } | null;
  fornecedor_opcoes: Array<{ id: string; nome: string; score: number }>;
  linhas: LinhaNota[];
}

export interface Zona {
  zona: string;
  itens: number;
  ciclo_dias: number;
  ultima: string | null;
  vence_em: string;
  situacao: 'em_andamento' | 'feita_hoje' | 'atrasada' | 'vence_hoje' | 'em_dia';
  contagem: { id: string; status: string; contados: number; total: number } | null;
}

export interface ItemContagem extends ComoConta {
  item_id: string;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  saldo_antes: number;
  fechados: number | null;
  soltos: number | null;
  contado: number | null;
  contado_em: string | null;
}

export interface AberturaCentral {
  contagem: { id: string; zona: string; data: string; status: 'contando' | 'concluida' | 'cancelada' };
  itens: ItemContagem[];
}

function lancar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const betaApi = {
  // ---- montagem dos balcões --------------------------------------------
  async painel(): Promise<Painel> {
    const { data, error } = await supabase.rpc('fn_beta_painel');
    lancar(error);
    return data as Painel;
  },

  async abrir(estoqueId: string, responsavel: string | null): Promise<Abertura> {
    const { data, error } = await supabase.rpc('fn_beta_montagem_abrir', {
      p_estoque_id: estoqueId,
      p_responsavel: responsavel,
    });
    lancar(error);
    return data as Abertura;
  },

  async contar(montagemId: string, itemId: string, fechados: number | null, soltos: number | null) {
    const { data, error } = await supabase.rpc('fn_beta_montagem_contar', {
      p_montagem_id: montagemId,
      p_item_id: itemId,
      p_fechados: fechados,
      p_soltos: soltos,
    });
    lancar(error);
    return data as { contado: number; levar: number };
  },

  async fecharContagem(montagemId: string) {
    const { data, error } = await supabase.rpc('fn_beta_montagem_fechar_contagem', { p_montagem_id: montagemId });
    lancar(error);
    return data as { success: boolean; faltam?: number; levar?: number };
  },

  async concluir(montagemId: string, entregas: Array<{ item_id: string; entregue: number }>) {
    const { data, error } = await supabase.rpc('fn_beta_montagem_concluir', {
      p_montagem_id: montagemId,
      p_entregas: entregas,
    });
    lancar(error);
    return data as { success: boolean; ajustes: number; transferencias: number };
  },

  // ---- configuração -----------------------------------------------------
  async niveisListar(estoqueId: string): Promise<ItemConfig[]> {
    const { data, error } = await supabase.rpc('fn_beta_niveis_listar', { p_estoque_id: estoqueId });
    lancar(error);
    return (data as { itens: ItemConfig[] })?.itens || [];
  },

  async nivelDefinir(estoqueId: string, itemId: string, nivel: number, controle: Controle): Promise<void> {
    const { error } = await supabase.rpc('fn_beta_nivel_definir', {
      p_estoque_id: estoqueId,
      p_item_id: itemId,
      p_nivel: nivel,
      p_controle: controle,
    });
    lancar(error);
  },

  async configItem(itemId: string, config: ConfigItemPayload): Promise<void> {
    const { error } = await supabase.rpc('fn_beta_config_item', { p_item_id: itemId, p_config: config });
    lancar(error);
  },

  /** Envia a foto para o bucket e grava a URL no item. Devolve a URL. */
  async fotoItem(itemId: string, arquivo: File): Promise<string> {
    const extensao = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
    const caminho = `itens/${itemId}-${Date.now()}.${extensao}`;
    const { error: erroUpload } = await supabase.storage
      .from('estoque-fotos')
      .upload(caminho, arquivo, { contentType: arquivo.type || 'image/jpeg', upsert: true });
    lancar(erroUpload);
    const { data } = supabase.storage.from('estoque-fotos').getPublicUrl(caminho);
    const url = data.publicUrl;
    const { error } = await supabase.rpc('fn_beta_foto_item', { p_item_id: itemId, p_foto_url: url });
    lancar(error);
    return url;
  },

  // ---- busca ------------------------------------------------------------
  async buscarItem(termo: string, estoqueId: string | null = null): Promise<ItemBusca[]> {
    const { data, error } = await supabase.rpc('fn_beta_buscar_item', { p_termo: termo, p_estoque_id: estoqueId });
    lancar(error);
    return (data as ItemBusca[]) || [];
  },

  // ---- receber mercadoria ----------------------------------------------
  /** Manda a foto ou o PDF da nota para a IA ler. */
  async lerNota(arquivo: File): Promise<{
    arquivo_url: string;
    emitente: { nome: string | null; cnpj: string | null };
    documento: { numero: string | null; data_emissao: string | null };
    itens: Array<{
      descricao: string;
      codigo: string | null;
      quantidade: number;
      unidade: string | null;
      valor_unitario: number;
      valor_total: number;
    }>;
  }> {
    const form = new FormData();
    form.append('file', arquivo);
    const url = import.meta.env.VITE_SUPABASE_URL;
    const resposta = await fetch(`${url}/functions/v1/extract-nota`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: form,
    });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.success) throw new Error(dados.error || 'Não consegui ler a nota.');
    return {
      arquivo_url: dados.file?.url || '',
      emitente: dados.extracted?.emitente || { nome: null, cnpj: null },
      documento: dados.extracted?.documento || { numero: null, data_emissao: null },
      itens: dados.extracted?.itens || [],
    };
  },

  async receberPreparar(
    linhas: Array<{ descricao: string; codigo?: string | null; quantidade?: number | null; unidade?: string | null; valor_unitario?: number | null; valor_total?: number | null }>,
    fornecedor: { nome: string | null; cnpj: string | null },
  ): Promise<Preparo> {
    const { data, error } = await supabase.rpc('fn_beta_receber_preparar', { p_linhas: linhas, p_fornecedor: fornecedor });
    lancar(error);
    return data as Preparo;
  },

  async receberConcluir(dados: {
    fornecedor_id: string | null;
    fornecedor_nome: string | null;
    cnpj: string | null;
    numero_documento: string | null;
    data_compra: string | null;
    arquivo_url: string | null;
    itens: Array<{ item_id: string; quantidade: number; custo_unitario: number }>;
  }) {
    const { data, error } = await supabase.rpc('fn_beta_receber_concluir', { p_dados: dados });
    lancar(error);
    return data as { success: boolean; entrada_id: string; itens: number; valor_total: number };
  },

  // ---- pedir mais -------------------------------------------------------
  async pedirMais(estoqueId: string, itemId: string, quantidade: number, responsavel: string | null) {
    const { data, error } = await supabase.rpc('fn_beta_pedir_mais', {
      p_estoque_id: estoqueId,
      p_item_id: itemId,
      p_quantidade: quantidade,
      p_responsavel: responsavel,
    });
    lancar(error);
    return data as { success: boolean; saldo_balcao: number; saldo_central: number };
  },

  // ---- contar o Central --------------------------------------------------
  async centralZonas(): Promise<{ hoje: string; zonas: Zona[] }> {
    const { data, error } = await supabase.rpc('fn_beta_central_zonas');
    lancar(error);
    return data as { hoje: string; zonas: Zona[] };
  },

  async centralAbrir(zona: string, responsavel: string | null): Promise<AberturaCentral> {
    const { data, error } = await supabase.rpc('fn_beta_central_abrir', { p_zona: zona, p_responsavel: responsavel });
    lancar(error);
    return data as AberturaCentral;
  },

  async centralContar(contagemId: string, itemId: string, fechados: number | null, soltos: number | null) {
    const { data, error } = await supabase.rpc('fn_beta_central_contar', {
      p_contagem_id: contagemId,
      p_item_id: itemId,
      p_fechados: fechados,
      p_soltos: soltos,
    });
    lancar(error);
    return data as { contado: number };
  },

  async centralConcluir(contagemId: string) {
    const { data, error } = await supabase.rpc('fn_beta_central_concluir', { p_contagem_id: contagemId });
    lancar(error);
    return data as { success: boolean; ajustes: number; nao_contados: number };
  },
};

/** Ícone de fallback quando o item ainda não tem foto. */
export function emojiDaCategoria(categoria: string | null | undefined): string {
  const c = (categoria || '').toLowerCase();
  if (c.includes('alco')) return '🍾';
  if (c.includes('bebida')) return '🥤';
  if (c.includes('carne') || c.includes('frios')) return '🥩';
  if (c.includes('vegeta') || c.includes('horti')) return '🥬';
  if (c.includes('latic')) return '🧀';
  if (c.includes('pão') || c.includes('padaria')) return '🥖';
  if (c.includes('doce') || c.includes('sobremesa')) return '🍰';
  if (c.includes('tempero') || c.includes('condimento')) return '🧂';
  if (c.includes('grão') || c.includes('cereal') || c.includes('massa')) return '🌾';
  if (c.includes('óleo') || c.includes('gordura')) return '🫒';
  if (c.includes('descart')) return '🥡';
  if (c.includes('limpeza')) return '🧴';
  if (c.includes('utens')) return '🍴';
  if (c.includes('frutos do mar')) return '🦐';
  if (c.includes('escrit')) return '📎';
  if (c.includes('equipa')) return '🔧';
  if (c.includes('uniform')) return '👕';
  return '📦';
}

/** Formata número sem zeros inúteis: 12, 2,5, 0,4 */
export function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0';
  const arredondado = Math.round(n * 100) / 100;
  return arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function moeda(n: number | null | undefined): string {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
