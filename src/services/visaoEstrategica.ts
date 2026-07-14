import { supabase } from '../lib/supabase';

export interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  percentual: number;
  cor: string;
  ordem: number;
  tem_filhas: boolean;
  subcategorias?: Subcategoria[];
}

export interface Subcategoria {
  id: string;
  nome: string;
  percentual: number;
  ordem: number;
}

export interface CategoriaConfig {
  id: string;
  categoria_financeira_id: string;
  percentual: number;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export interface Semana {
  id: string;
  data_inicio: string;
  data_fim?: string;
  faturamento: number;
  criado_em: string;
  criado_por: string | null;
}

export interface Despesa {
  id: string;
  semana_id: string | null;
  fornecedor: string;
  valor: number;
  categoria_id: string;
  subcategoria_id: string | null;
  descricao: string | null;
  data_vencimento: string | null;
  is_override: boolean;
  motivo_override: string | null;
  status: 'ativa' | 'convertida' | 'cancelada';
  conta_pagar_id: string | null;
  tipo_lancamento?: 'previsao' | 'realizada' | 'confirmada';
  data_confirmacao?: string | null;
  confirmado_por?: string | null;
  conta_pagar_id: string | null;
  observacao_conversao: string | null;
  convertido_em: string | null;
  convertido_por: string | null;
  criado_em: string;
  criado_por: string | null;
}

export interface Divida {
  id: string;
  titulo: string;
  valor_total: number;
  valor_pago: number;
  prioridade: 'alta' | 'media' | 'baixa';
  status: 'pendente' | 'parcialmente_pago' | 'pago';
  criado_em: string;
}

export interface PagamentoDivida {
  id: string;
  divida_id: string;
  semana_id: string | null;
  valor: number;
  pago_em: string;
  pago_por: string | null;
}

// CATEGORIAS
export async function getCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .rpc('get_categorias_visao_estrategica');

  if (error) throw error;

  return (data || []).map((cat: any) => ({
    id: cat.id,
    nome: cat.nome,
    tipo: cat.tipo,
    percentual: Number(cat.percentual),
    cor: cat.cor,
    ordem: cat.ordem,
    tem_filhas: cat.tem_filhas,
    subcategorias: Array.isArray(cat.subcategorias)
      ? cat.subcategorias.map((sub: any) => ({
          id: sub.id,
          nome: sub.nome,
          percentual: Number(sub.percentual || 0),
          ordem: sub.ordem
        }))
      : []
  }));
}

// Buscar categorias disponíveis (não configuradas ainda)
export async function getCategoriasDisponiveis(): Promise<any[]> {
  const { data, error } = await supabase
    .from('v_categorias_disponiveis_ve')
    .select('*');

  if (error) throw error;
  return data || [];
}

// Buscar todas as categorias financeiras de despesa para configuração
export async function getCategoriasFinanceiras(): Promise<any[]> {
  const { data, error } = await supabase
    .from('categorias_financeiras')
    .select('*')
    .eq('tipo', 'despesa')
    .eq('status', 'ativo')
    .is('categoria_pai_id', null)
    .order('ordem', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Buscar subcategorias de uma categoria
export async function getSubcategorias(categoriaId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('categorias_financeiras')
    .select('*')
    .eq('categoria_pai_id', categoriaId)
    .eq('status', 'ativo')
    .order('ordem', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Configurar percentual de uma categoria financeira
export async function configurarCategoriaPercentual(
  categoriaId: string,
  percentual: number,
  cor: string,
  ordem: number
): Promise<void> {
  const { error } = await supabase
    .from('visao_estrategica_categorias_config')
    .upsert({
      categoria_financeira_id: categoriaId,
      percentual,
      cor,
      ordem,
      ativo: true
    }, {
      onConflict: 'categoria_financeira_id'
    });

  if (error) throw error;
}

// Configurar percentual de uma subcategoria
export async function configurarSubcategoriaPercentual(
  subcategoriaId: string,
  percentual: number
): Promise<void> {
  const { error } = await supabase
    .from('visao_estrategica_categorias_config')
    .upsert({
      categoria_financeira_id: subcategoriaId,
      percentual,
      cor: '#6b7280',
      ordem: 999,
      ativo: true
    }, {
      onConflict: 'categoria_financeira_id'
    });

  if (error) throw error;
}

// Remover configuração de categoria
export async function removerCategoriaConfig(categoriaId: string): Promise<void> {
  const { error } = await supabase
    .from('visao_estrategica_categorias_config')
    .delete()
    .eq('categoria_financeira_id', categoriaId);

  if (error) throw error;
}

// Salvar configurações de categorias
export async function salvarCategorias(categorias: Categoria[], limiteComprometimento: number) {
  // Salvar percentuais de cada categoria
  for (const cat of categorias) {
    await configurarCategoriaPercentual(cat.id, cat.percentual, cat.cor, cat.ordem);

    // Salvar percentuais das subcategorias
    if (cat.subcategorias && cat.subcategorias.length > 0) {
      for (const sub of cat.subcategorias) {
        await configurarSubcategoriaPercentual(sub.id, sub.percentual);
      }
    }
  }

  // Salvar limite de comprometimento
  const { error: configError } = await supabase
    .from('visao_estrategica_config')
    .upsert({
      chave: 'limite_comprometimento_futuro',
      valor: limiteComprometimento
    });

  if (configError) throw configError;
}

// SEMANAS
export async function getSemanaAtual(): Promise<Semana | null> {
  const { data, error } = await supabase.rpc('get_semana_atual_ve');

  if (error) throw error;

  if (!data || data.length === 0) {
    return null;
  }

  return data[0];
}

export async function getSemanas(): Promise<Semana[]> {
  const { data, error } = await supabase.rpc('get_todas_semanas_ve');

  if (error) throw error;
  return data || [];
}

export async function criarSemana(faturamento: number): Promise<Semana> {
  const dataInicio = getInicioSemana(new Date());

  // Verifica se já existe semana para esta data
  const { data: semanaExistente } = await supabase
    .from('visao_estrategica_semanas')
    .select('*')
    .eq('data_inicio', dataInicio)
    .maybeSingle();

  if (semanaExistente) {
    throw new Error('Já existe uma semana criada para este período. Use a opção de editar faturamento.');
  }

  const { data, error } = await supabase
    .from('visao_estrategica_semanas')
    .insert({
      data_inicio: dataInicio,
      faturamento,
      criado_por: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarFaturamentoSemana(semanaId: string, faturamento: number): Promise<Semana> {
  const { data, error } = await supabase
    .from('visao_estrategica_semanas')
    .update({ faturamento })
    .eq('id', semanaId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirSemana(semanaId: string) {
  const { error } = await supabase
    .from('visao_estrategica_semanas')
    .delete()
    .eq('id', semanaId);

  if (error) throw error;
}

export async function getSemanasFuturas(): Promise<Semana[]> {
  const { data, error } = await supabase.rpc('get_semanas_futuras_ve');

  if (error) throw error;
  return data || [];
}

export async function criarSemanaFutura(dataInicio: string, faturamento: number): Promise<Semana> {
  // Verifica se já existe semana para esta data
  const { data: semanaExistente } = await supabase
    .from('visao_estrategica_semanas')
    .select('*')
    .eq('data_inicio', dataInicio)
    .maybeSingle();

  if (semanaExistente) {
    throw new Error('Já existe uma semana criada para esta data.');
  }

  const { data, error } = await supabase
    .from('visao_estrategica_semanas')
    .insert({
      data_inicio: dataInicio,
      faturamento,
      criado_por: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// DESPESAS
export async function getDespesas(semanaId?: string, incluirTodas?: boolean): Promise<Despesa[]> {
  let query = supabase
    .from('visao_estrategica_despesas')
    .select('*')
    .order('criado_em', { ascending: false });

  // Filtrar apenas despesas ativas por padrão (para cálculos)
  if (!incluirTodas) {
    query = query.eq('status', 'ativa');
  }

  if (semanaId) {
    query = query.eq('semana_id', semanaId);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Mapear para usar categoria_id e subcategoria_id como esperado
  return (data || []).map(d => ({
    ...d,
    categoria_id: d.categoria_financeira_id || d.categoria_id,
    subcategoria_id: d.subcategoria_financeira_id || d.subcategoria_id
  }));
}

export async function criarDespesa(despesa: Omit<Despesa, 'id' | 'criado_em' | 'criado_por'>): Promise<Despesa> {
  const user = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('visao_estrategica_despesas')
    .insert({
      fornecedor: despesa.fornecedor,
      valor: despesa.valor,
      categoria_financeira_id: despesa.categoria_id,
      subcategoria_financeira_id: despesa.subcategoria_id || null,
      descricao: despesa.descricao,
      data_vencimento: despesa.data_vencimento,
      tipo_lancamento: despesa.tipo_lancamento || 'previsao',
      is_override: despesa.is_override || false,
      motivo_override: despesa.motivo_override,
      status: despesa.status || 'ativa',
      conta_pagar_id: despesa.conta_pagar_id || null,
      observacao_conversao: despesa.observacao_conversao || null,
      convertido_em: despesa.convertido_em || null,
      convertido_por: despesa.convertido_por || null,
      criado_por: user.data.user?.id
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar despesa:', error);
    throw error;
  }

  return data;
}

export async function atualizarDespesa(id: string, despesa: Partial<Despesa>): Promise<Despesa> {
  const { data, error } = await supabase
    .from('visao_estrategica_despesas')
    .update(despesa)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirDespesa(id: string) {
  const { error } = await supabase
    .from('visao_estrategica_despesas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function converterDespesaEmContaPagar(
  despesaId: string,
  contaPagarId: string,
  observacao?: string
): Promise<void> {
  const { error } = await supabase.rpc('converter_despesa_manual_em_conta_pagar', {
    p_despesa_id: despesaId,
    p_conta_pagar_id: contaPagarId,
    p_observacao: observacao
  });

  if (error) throw error;
}

export async function cancelarDespesaManual(despesaId: string, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_despesa_manual', {
    p_despesa_id: despesaId,
    p_motivo: motivo
  });

  if (error) throw error;
}

export async function reativarDespesaManual(despesaId: string): Promise<void> {
  const { error } = await supabase.rpc('reativar_despesa_manual', {
    p_despesa_id: despesaId
  });

  if (error) throw error;
}

// DÍVIDAS
export async function getDividas(): Promise<Divida[]> {
  const { data, error } = await supabase
    .from('visao_estrategica_dividas')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function criarDivida(divida: Omit<Divida, 'id' | 'criado_em' | 'valor_pago' | 'status'>): Promise<Divida> {
  const { data, error } = await supabase
    .from('visao_estrategica_dividas')
    .insert({
      ...divida,
      criado_por: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function excluirDivida(id: string) {
  const { error } = await supabase
    .from('visao_estrategica_dividas')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function pagarDivida(dividaId: string, semanaId: string, valor: number) {
  const { data: divida, error: fetchError } = await supabase
    .from('visao_estrategica_dividas')
    .select('*')
    .eq('id', dividaId)
    .single();

  if (fetchError) throw fetchError;

  const novoValorPago = divida.valor_pago + valor;
  const novoStatus = novoValorPago >= divida.valor_total ? 'pago' : 'parcialmente_pago';

  const { error: pagError } = await supabase
    .from('visao_estrategica_pagamentos_dividas')
    .insert({
      divida_id: dividaId,
      semana_id: semanaId,
      valor,
      pago_por: (await supabase.auth.getUser()).data.user?.id
    });

  if (pagError) throw pagError;

  const { error: updateError } = await supabase
    .from('visao_estrategica_dividas')
    .update({
      valor_pago: novoValorPago,
      status: novoStatus
    })
    .eq('id', dividaId);

  if (updateError) throw updateError;
}

export async function getPagamentosDivida(dividaId: string): Promise<PagamentoDivida[]> {
  const { data, error } = await supabase
    .from('visao_estrategica_pagamentos_dividas')
    .select('*')
    .eq('divida_id', dividaId)
    .order('pago_em', { ascending: false });

  if (error) throw error;
  return data || [];
}

// UTILITÁRIOS
function getInicioSemana(data: Date): string {
  const d = new Date(data);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export function calcularOrcamentos(faturamento: number, categorias: Categoria[]): Record<string, number> {
  const orcamentos: Record<string, number> = {};

  categorias.forEach(cat => {
    const orcamentoCat = (faturamento * cat.percentual) / 100;
    orcamentos[cat.id] = orcamentoCat;

    if (cat.subcategorias) {
      cat.subcategorias.forEach(sub => {
        // Subcategorias são % do faturamento total, não da categoria pai
        const orcamentoSub = (faturamento * sub.percentual) / 100;
        orcamentos[`${cat.id}_${sub.id}`] = orcamentoSub;
      });
    }
  });

  return orcamentos;
}

export function calcularGastos(despesas: Despesa[]): Record<string, number> {
  const gastos: Record<string, number> = {};

  despesas.forEach(desp => {
    const catId = desp.categoria_id;
    const subId = desp.subcategoria_id;

    // Adicionar ao gasto da categoria principal
    if (catId) {
      gastos[catId] = (gastos[catId] || 0) + desp.valor;
    }

    // Se tiver subcategoria, adicionar também na chave composta
    if (subId && catId) {
      const key = `${catId}_${subId}`;
      gastos[key] = (gastos[key] || 0) + desp.valor;
    }
  });

  return gastos;
}

// Buscar pagamentos informativos agrupados por categoria para uma semana
export async function getPagamentosPorCategoriaSemana(semanaId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_pagamentos_por_categoria_semana', {
    p_semana_id: semanaId
  });

  if (error) {
    console.error('Erro ao buscar pagamentos por categoria:', error);
    return {};
  }

  const result: Record<string, number> = {};

  (data || []).forEach((item: any) => {
    const catPaiId = item.categoria_pai_id;
    const catId = item.categoria_id;
    const valor = parseFloat(item.total_pago || 0);

    // Se tem categoria pai, adiciona tanto na categoria pai quanto na chave composta
    if (catPaiId) {
      result[catPaiId] = (result[catPaiId] || 0) + valor;
      const key = `${catPaiId}_${catId}`;
      result[key] = (result[key] || 0) + valor;
    } else if (catId) {
      // Se não tem categoria pai, adiciona direto na categoria
      result[catId] = (result[catId] || 0) + valor;
    }
  });

  return result;
}

export async function calcularGastosComPagamentosInformativos(
  despesas: Despesa[],
  semanaId?: string
): Promise<Record<string, number>> {
  const gastos: Record<string, number> = {};

  // 1. Adicionar despesas manuais (criadas diretamente na Visão Estratégica)
  despesas.forEach(desp => {
    const catId = desp.categoria_id;
    const subId = desp.subcategoria_id;

    if (catId) {
      gastos[catId] = (gastos[catId] || 0) + desp.valor;
    }

    if (subId && catId) {
      const key = `${catId}_${subId}`;
      gastos[key] = (gastos[key] || 0) + desp.valor;
    }
  });

  // 2. Adicionar pagamentos informativos se semana foi fornecida
  if (semanaId) {
    const pagamentosPorCategoria = await getPagamentosPorCategoriaSemana(semanaId);

    Object.keys(pagamentosPorCategoria).forEach(key => {
      gastos[key] = (gastos[key] || 0) + pagamentosPorCategoria[key];
    });
  }

  return gastos;
}

// INTEGRAÇÃO COM CONTAS A PAGAR
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

export interface DespesaContaPagar {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  data_vencimento: string;
  valor_total: number;
  valor_pago_real: number;
  valor_restante: number;
  valor_restante_planejamento: number;
  valor_pago_planejamento: number;
  status_real: string;
  status_planejamento: string;
  categoria_id: string;
  categoria_nome: string;
  subcategoria_id: string | null;
  subcategoria_nome: string | null;
  descricao: string | null;
  situacao: 'vencida' | 'vencendo' | 'futura';
  quantidade_pagamentos: number;
  ultimo_pagamento: string | null;
  semanas_ids: string[] | null;
  criado_em: string;
  atualizado_em: string;
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

// Buscar despesas vindas do Contas a Pagar (vencidas + vencendo nos próximos 7 dias)
export async function getDespesasContasPagar(): Promise<DespesaContaPagar[]> {
  const { data, error } = await supabase
    .from('view_despesas_visao_estrategica')
    .select('*')
    .order('data_vencimento', { ascending: true });

  if (error) throw error;

  return (data || []).map((d: any) => ({
    id: d.id,
    fornecedor_id: d.fornecedor_id,
    fornecedor_nome: d.fornecedor_nome,
    data_vencimento: d.data_vencimento,
    valor_total: parseFloat(d.valor_total || 0),
    valor_pago_real: parseFloat(d.valor_pago_real || 0),
    valor_restante: parseFloat(d.valor_restante_planejamento || 0),
    valor_restante_planejamento: parseFloat(d.valor_restante_planejamento || 0),
    valor_pago_planejamento: parseFloat(d.valor_pago_planejamento || 0),
    status_real: d.status_real,
    status_planejamento: d.status_planejamento,
    categoria_id: d.categoria_id,
    categoria_nome: d.categoria_nome,
    subcategoria_id: d.subcategoria_id,
    subcategoria_nome: d.subcategoria_nome,
    descricao: d.descricao,
    situacao: d.situacao,
    quantidade_pagamentos: d.quantidade_pagamentos ? parseInt(d.quantidade_pagamentos) : 0,
    ultimo_pagamento: d.ultimo_pagamento,
    semanas_ids: d.semanas_ids,
    criado_em: d.criado_em,
    atualizado_em: d.atualizado_em
  } as DespesaContaPagar));
}

// PAGAMENTOS INFORMATIVOS (só para planejamento, não afeta contas a pagar)
export interface PagamentoInformativo {
  id: string;
  conta_pagar_id: string;
  semana_id: string;
  valor_pago: number;
  data_pagamento_informativo: string;
  observacao: string | null;
  criado_em: string;
  atualizado_em?: string;
  criado_por?: string;
  semana_data_inicio?: string;
  semana_data_fim?: string;
  semana_faturamento?: number;
}

export interface ResultadoPagamentoParcial {
  pagamento_id: string;
  total_pago_informativo: number;
  saldo_restante: number;
  totalmente_pago: boolean;
}

export interface ResultadoEdicaoPagamento {
  pagamento_id: string;
  valor_anterior: number;
  valor_novo: number;
  atualizado: boolean;
}

export async function registrarPagamentoParcial(
  contaPagarId: string,
  semanaId: string,
  valorPago: number,
  observacao?: string
): Promise<ResultadoPagamentoParcial> {
  const { data, error } = await supabase
    .rpc('registrar_pagamento_parcial_ve', {
      p_conta_pagar_id: contaPagarId,
      p_semana_id: semanaId,
      p_valor_pago: valorPago,
      p_observacao: observacao || null
    });

  if (error) throw error;
  return data;
}

export async function listarPagamentosContaPagar(contaPagarId: string): Promise<PagamentoInformativo[]> {
  const { data, error } = await supabase
    .rpc('listar_pagamentos_informativos_conta', {
      p_conta_pagar_id: contaPagarId
    });

  if (error) throw error;
  return data || [];
}

export async function excluirPagamentoParcial(pagamentoId: string): Promise<void> {
  const { error } = await supabase
    .rpc('excluir_pagamento_informativo', {
      p_pagamento_id: pagamentoId
    });

  if (error) throw error;
}

export async function editarPagamentoParcial(
  pagamentoId: string,
  novoValor?: number,
  novaObservacao?: string
): Promise<ResultadoEdicaoPagamento> {
  const { data, error } = await supabase
    .rpc('editar_pagamento_informativo', {
      p_pagamento_id: pagamentoId,
      p_novo_valor: novoValor || null,
      p_nova_observacao: novaObservacao !== undefined ? novaObservacao : null
    });

  if (error) throw error;
  return data;
}

export async function desmarcarPagamentoInformativo(contaPagarId: string): Promise<void> {
  const { error } = await supabase
    .from('visao_estrategica_pagamentos_informativos')
    .delete()
    .eq('conta_pagar_id', contaPagarId);

  if (error) throw error;
}

export async function getPagamentosInformativos(semanaId?: string): Promise<PagamentoInformativo[]> {
  let query = supabase
    .from('visao_estrategica_pagamentos_informativos')
    .select('*')
    .order('criado_em', { ascending: false });

  if (semanaId) {
    query = query.eq('semana_id', semanaId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export interface PagamentoDetalhado {
  id: string;
  conta_pagar_id: string;
  fornecedor_nome: string;
  categoria_id: string;
  categoria_nome: string;
  subcategoria_id: string | null;
  subcategoria_nome: string | null;
  descricao: string | null;
  valor_total_conta: number;
  valor_pago: number;
  data_pagamento_informativo: string;
  data_vencimento: string;
  observacao: string | null;
  semana_id: string;
  semana_data_inicio: string;
  semana_faturamento: number;
  criado_em: string;
  atualizado_em: string;
}

export async function getTodosPagamentosDetalhados(): Promise<PagamentoDetalhado[]> {
  try {
    // Buscar pagamentos
    const { data: pagamentos, error: errorPag } = await supabase
      .from('visao_estrategica_pagamentos_informativos')
      .select('*')
      .order('data_pagamento_informativo', { ascending: false });

    if (errorPag) {
      console.error('Erro ao buscar pagamentos:', errorPag);
      return [];
    }

    if (!pagamentos || pagamentos.length === 0) {
      return [];
    }

    // Buscar contas a pagar relacionadas
    const contasIds = [...new Set(pagamentos.map(p => p.conta_pagar_id))];
    const { data: contas, error: errorContas } = await supabase
      .from('contas_pagar')
      .select(`
        id,
        descricao,
        valor_total,
        data_vencimento,
        fornecedor_id,
        categoria_id,
        fornecedores (nome),
        categorias_financeiras (nome, categoria_pai_id)
      `)
      .in('id', contasIds);

    if (errorContas) {
      console.error('Erro ao buscar contas:', errorContas);
      return [];
    }

    // Buscar semanas relacionadas
    const semanasIds = [...new Set(pagamentos.map(p => p.semana_id))];
    const { data: semanas, error: errorSemanas } = await supabase
      .from('visao_estrategica_semanas')
      .select('id, data_inicio, faturamento')
      .in('id', semanasIds);

    if (errorSemanas) {
      console.error('Erro ao buscar semanas:', errorSemanas);
      return [];
    }

    // Buscar categorias pai quando necessário
    const categoriasFilhas = contas?.filter(c => c.categorias_financeiras?.categoria_pai_id).map(c => c.categorias_financeiras?.categoria_pai_id).filter(Boolean) || [];
    let categoriasPai: any[] = [];
    if (categoriasFilhas.length > 0) {
      const { data: catPai } = await supabase
        .from('categorias_financeiras')
        .select('id, nome')
        .in('id', categoriasFilhas);
      categoriasPai = catPai || [];
    }

    // Montar resultado
    return pagamentos.map((p: any) => {
      const conta = contas?.find(c => c.id === p.conta_pagar_id);
      const semana = semanas?.find(s => s.id === p.semana_id);
      const categoriaPai = conta?.categorias_financeiras?.categoria_pai_id
        ? categoriasPai.find(cp => cp.id === conta.categorias_financeiras.categoria_pai_id)
        : null;

      return {
        id: p.id,
        conta_pagar_id: p.conta_pagar_id,
        fornecedor_nome: conta?.fornecedores?.nome || '-',
        categoria_id: categoriaPai?.id || conta?.categoria_id || '',
        categoria_nome: categoriaPai?.nome || conta?.categorias_financeiras?.nome || '-',
        subcategoria_id: categoriaPai ? conta?.categoria_id : null,
        subcategoria_nome: categoriaPai ? conta?.categorias_financeiras?.nome : null,
        descricao: conta?.descricao || null,
        valor_total_conta: parseFloat(conta?.valor_total || 0),
        valor_pago: parseFloat(p.valor_pago || 0),
        data_pagamento_informativo: p.data_pagamento_informativo,
        data_vencimento: conta?.data_vencimento || '',
        observacao: p.observacao,
        semana_id: p.semana_id,
        semana_data_inicio: semana?.data_inicio || '',
        semana_faturamento: parseFloat(semana?.faturamento || 0),
        criado_em: p.criado_em,
        atualizado_em: p.atualizado_em
      };
    });
  } catch (error) {
    console.error('Erro geral em getTodosPagamentosDetalhados:', error);
    return [];
  }
}

// RELATÓRIOS DE PAGAMENTOS INFORMATIVOS
export interface RelatorioPagamentoInformativo {
  id: string;
  conta_pagar_id: string;
  semana_id: string;
  valor_pago: number;
  data_pagamento_informativo: string;
  observacao: string | null;
  criado_em: string;
  conta_descricao: string;
  conta_valor_total: number;
  data_vencimento: string;
  fornecedor_nome: string;
  categoria_nome: string;
  centro_custo_nome: string;
  semana_data_inicio: string;
  semana_faturamento: number;
}

export interface ResumoPagamentosPorData {
  data_pagamento_informativo: string;
  quantidade_pagamentos: number;
  total_pago: number;
  quantidade_fornecedores: number;
  quantidade_categorias: number;
  por_categoria: Array<{
    categoria_id: string;
    categoria_nome: string;
    total: number;
  }>;
}

export async function getRelatorioPagamentosInformativos(dataInicio?: string, dataFim?: string): Promise<RelatorioPagamentoInformativo[]> {
  let query = supabase
    .from('v_relatorio_pagamentos_informativos')
    .select('*');

  if (dataInicio) {
    query = query.gte('data_pagamento_informativo', dataInicio);
  }

  if (dataFim) {
    query = query.lte('data_pagamento_informativo', dataFim);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getResumoPagamentosPorData(dataInicio?: string, dataFim?: string): Promise<ResumoPagamentosPorData[]> {
  let query = supabase
    .from('v_resumo_pagamentos_informativos_por_data')
    .select('*');

  if (dataInicio) {
    query = query.gte('data_pagamento_informativo', dataInicio);
  }

  if (dataFim) {
    query = query.lte('data_pagamento_informativo', dataFim);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPagamentosInformativosDoDia(data?: string): Promise<RelatorioPagamentoInformativo[]> {
  const dataFiltro = data || new Date().toISOString().split('T')[0];

  const { data: result, error } = await supabase
    .from('v_relatorio_pagamentos_informativos')
    .select('*')
    .eq('data_pagamento_informativo', dataFiltro)
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return result || [];
}

// NOVAS FUNÇÕES - PREVISÕES E CONVERSÕES

export async function confirmarPrevisao(despesaId: string): Promise<any> {
  const { data, error } = await supabase.rpc('confirmar_previsao_despesa', {
    p_despesa_id: despesaId
  });

  if (error) {
    console.error('Erro ao confirmar previsão:', error);
    throw error;
  }

  return data;
}

export async function converterPrevisaoEmContaPagar(
  despesaId: string,
  fornecedorId: string
): Promise<any> {
  const { data, error } = await supabase.rpc('converter_despesa_em_conta_pagar', {
    p_despesa_id: despesaId,
    p_fornecedor_id: fornecedorId
  });

  if (error) {
    console.error('Erro ao converter despesa em conta a pagar:', error);
    throw error;
  }

  return data;
}

// VINCULAÇÃO DE DESPESAS COM CONTAS A PAGAR
export interface ContaPagarDisponivel {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  saldo_restante: number;
  data_vencimento: string;
  categoria_financeira_id: string;
  categoria_nome: string;
  status: string;
  ja_vinculada: boolean;
}

export async function getContasPagarDisponiveis(): Promise<ContaPagarDisponivel[]> {
  const { data, error } = await supabase
    .from('view_ve_despesas_contas_pagar_disponiveis')
    .select('*')
    .order('data_vencimento', { ascending: true });

  if (error) {
    console.error('Erro ao buscar contas disponíveis:', error);
    throw error;
  }

  return data || [];
}

export async function vincularDespesaContaPagar(
  despesaId: string,
  contaPagarId: string
): Promise<any> {
  const { data, error } = await supabase.rpc('vincular_despesa_conta_pagar', {
    p_despesa_id: despesaId,
    p_conta_pagar_id: contaPagarId
  });

  if (error) {
    console.error('Erro ao vincular despesa:', error);
    throw error;
  }

  return data;
}

export async function desvincularDespesaContaPagar(despesaId: string): Promise<any> {
  const { data, error } = await supabase.rpc('desvincular_despesa_conta_pagar', {
    p_despesa_id: despesaId
  });

  if (error) {
    console.error('Erro ao desvincular despesa:', error);
    throw error;
  }

  return data;
}

// IMPORTAÇÃO DE CONTAS FUTURAS
export interface ContaFuturaDisponivel {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  descricao: string;
  valor_total: number;
  data_vencimento: string;
  categoria_financeira_id: string;
  categoria_nome: string;
  categoria_pai_id: string | null;
  status: string;
  dias_ate_vencimento: number;
  ja_importada: boolean;
}

export async function getContasFuturasDisponiveis(): Promise<ContaFuturaDisponivel[]> {
  const { data, error } = await supabase
    .from('view_ve_contas_futuras_disponiveis')
    .select('*')
    .order('data_vencimento', { ascending: true });

  if (error) {
    console.error('Erro ao buscar contas futuras:', error);
    throw error;
  }

  return data || [];
}

export async function importarContaFuturaComoPrevisao(
  contaPagarId: string,
  semanaId: string,
  dataPagamentoPrevista?: string
): Promise<any> {
  const { data, error } = await supabase.rpc('importar_conta_futura_como_previsao', {
    p_conta_pagar_id: contaPagarId,
    p_semana_id: semanaId,
    p_data_pagamento_prevista: dataPagamentoPrevista || null
  });

  if (error) {
    console.error('Erro ao importar conta futura:', error);
    throw error;
  }

  return data;
}
