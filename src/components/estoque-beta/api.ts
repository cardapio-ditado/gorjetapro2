import { supabase } from '../../lib/supabase';

export type Controle = 'contagem' | 'venda';

export interface ItemMontagem {
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
  rotulo_solto: string;
  rotulo_fechado: string | null;
  fator_fechado: number | null;
  permite_fracao: boolean;
  foto_url: string | null;
  dica: string | null;
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

export interface ItemConfig {
  item_id: string;
  nome: string;
  categoria: string | null;
  unidade: string | null;
  nivel: number | null;
  controle: Controle | null;
  tem_ficha: boolean;
  consumo_dia: number;
  rotulo_solto: string;
  rotulo_fechado: string | null;
  fator_fechado: number | null;
  permite_fracao: boolean;
  foto_url: string | null;
  dica: string | null;
}

export interface ConfigItemPayload {
  rotulo_solto: string;
  rotulo_fechado: string | null;
  fator_fechado: number | null;
  permite_fracao: boolean;
  dica: string | null;
}

function lancar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const betaApi = {
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

  async contar(
    montagemId: string,
    itemId: string,
    fechados: number | null,
    soltos: number | null,
  ): Promise<{ contado: number; levar: number }> {
    const { data, error } = await supabase.rpc('fn_beta_montagem_contar', {
      p_montagem_id: montagemId,
      p_item_id: itemId,
      p_fechados: fechados,
      p_soltos: soltos,
    });
    lancar(error);
    return data as { contado: number; levar: number };
  },

  async fecharContagem(montagemId: string): Promise<{ success: boolean; faltam?: number; levar?: number }> {
    const { data, error } = await supabase.rpc('fn_beta_montagem_fechar_contagem', {
      p_montagem_id: montagemId,
    });
    lancar(error);
    return data as { success: boolean; faltam?: number; levar?: number };
  },

  async concluir(
    montagemId: string,
    entregas: Array<{ item_id: string; entregue: number }>,
  ): Promise<{ success: boolean; ajustes: number; transferencias: number }> {
    const { data, error } = await supabase.rpc('fn_beta_montagem_concluir', {
      p_montagem_id: montagemId,
      p_entregas: entregas,
    });
    lancar(error);
    return data as { success: boolean; ajustes: number; transferencias: number };
  },

  async niveisListar(estoqueId: string): Promise<ItemConfig[]> {
    const { data, error } = await supabase.rpc('fn_beta_niveis_listar', { p_estoque_id: estoqueId });
    lancar(error);
    return ((data as { itens: ItemConfig[] })?.itens) || [];
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
    const { error } = await supabase.rpc('fn_beta_config_item', {
      p_item_id: itemId,
      p_config: config,
    });
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
  return '📦';
}

/** Formata número sem zeros inúteis: 12, 2,5, 0,4 */
export function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0';
  const arredondado = Math.round(n * 100) / 100;
  return arredondado.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
