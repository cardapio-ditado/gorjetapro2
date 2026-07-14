import { supabase } from '../lib/supabase';

export interface Entrada {
  id: string;
  semana_id: string;
  tipo: 'previsto' | 'realizado';
  descricao: string;
  valor: number;
  criado_em: string;
  criado_por: string | null;
}

export interface EntradasSemana {
  previstos: Entrada[];
  realizados: Entrada[];
  totalPrevisto: number;
  totalRealizado: number;
  gap: number;
  percentualRealizado: number;
}

export interface ContaPorCategoria {
  categoria_id: string;
  categoria_nome: string;
  categoria_tipo: string;
  quantidade_contas: number;
  total_vencido?: number;
  total_futuro?: number;
  valor_total_original: number;
  valor_ja_pago: number;
  vencimento_mais_antigo?: string;
  proximo_vencimento?: string;
}

export async function getSemanaAtual(): Promise<string | null> {
  const { data, error } = await supabase.rpc('obter_semana_atual');
  if (error) throw error;
  return data;
}

export async function getEntradasSemana(semanaId: string): Promise<EntradasSemana> {
  const { data, error } = await supabase
    .from('visao_estrategica_entradas')
    .select('*')
    .eq('semana_id', semanaId)
    .order('criado_em', { ascending: false });

  if (error) throw error;

  const previstos = data?.filter(e => e.tipo === 'previsto') || [];
  const realizados = data?.filter(e => e.tipo === 'realizado') || [];

  const totalPrevisto = previstos.reduce((acc, e) => acc + Number(e.valor), 0);
  const totalRealizado = realizados.reduce((acc, e) => acc + Number(e.valor), 0);
  const gap = totalPrevisto - totalRealizado;
  const percentualRealizado = totalPrevisto > 0 ? (totalRealizado / totalPrevisto) * 100 : 0;

  return {
    previstos,
    realizados,
    totalPrevisto,
    totalRealizado,
    gap,
    percentualRealizado
  };
}

export async function criarEntradaPrevista(semanaId: string, descricao: string, valor: number) {
  const { data, error } = await supabase
    .from('visao_estrategica_entradas')
    .insert({
      semana_id: semanaId,
      tipo: 'previsto',
      descricao,
      valor
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function criarEntradaRealizada(semanaId: string, descricao: string, valor: number) {
  const { data, error } = await supabase
    .from('visao_estrategica_entradas')
    .insert({
      semana_id: semanaId,
      tipo: 'realizado',
      descricao,
      valor
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirEntrada(id: string) {
  const { error } = await supabase
    .from('visao_estrategica_entradas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function sincronizarComFaturamento(semanaId: string) {
  const { data, error } = await supabase.rpc('sincronizar_entradas_com_faturamento', {
    p_semana_id: semanaId
  });

  if (error) throw error;
  return data;
}

export async function getContasVencidasPorCategoria(): Promise<ContaPorCategoria[]> {
  const { data, error } = await supabase
    .from('v_contas_vencidas_por_categoria')
    .select('*')
    .order('total_vencido', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getContasFuturasPorCategoria(): Promise<ContaPorCategoria[]> {
  const { data, error } = await supabase
    .from('v_contas_futuras_por_categoria')
    .select('*')
    .order('total_futuro', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getResumoContasPorCategoria(): Promise<any[]> {
  const { data, error } = await supabase
    .from('v_resumo_contas_categoria')
    .select('*')
    .order('total_geral', { ascending: false });

  if (error) throw error;
  return data || [];
}
