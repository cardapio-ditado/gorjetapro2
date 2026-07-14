import { supabase } from '../lib/supabase';

export interface FiltrosCompras {
  fornecedorNome?: string;
  dataInicio?: string;
  dataFim?: string;
}

export interface MetricasCompras {
  ticketMedio: number;
  topFornecedor: {
    nome: string;
    total: number;
  } | null;
  variacaoMensal: {
    mesAtual: number;
    mesAnterior: number;
    percentual: number;
  };
  totalCompras: number;
  totalItens: number;
}

/**
 * Calcula métricas das compras com filtros opcionais
 */
export async function calcularMetricasCompras(
  filtros: FiltrosCompras = {}
): Promise<MetricasCompras> {
  try {
    // Query base
    let query = supabase
      .from('entradas_compras')
      .select('*, fornecedores(nome)');

    // Aplicar filtros
    if (filtros.fornecedorNome) {
      query = query.ilike('fornecedores.nome', `%${filtros.fornecedorNome}%`);
    }

    if (filtros.dataInicio) {
      query = query.gte('data_compra', filtros.dataInicio);
    }

    if (filtros.dataFim) {
      query = query.lte('data_compra', filtros.dataFim);
    }

    const { data: compras, error } = await query;

    if (error) {
      console.error('Erro ao buscar compras:', error);
      throw error;
    }

    const comprasData = compras || [];

    // Ticket médio
    const totalValor = comprasData.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
    const ticketMedio = comprasData.length > 0 ? totalValor / comprasData.length : 0;

    // Top fornecedor
    const fornecedoresMap = new Map<string, { nome: string; total: number }>();
    comprasData.forEach(c => {
      const nome = c.fornecedores?.nome || c.fornecedor_nome || 'Não identificado';
      const atual = fornecedoresMap.get(nome) || { nome, total: 0 };
      atual.total += Number(c.valor_total || 0);
      fornecedoresMap.set(nome, atual);
    });

    const fornecedoresArray = Array.from(fornecedoresMap.values())
      .sort((a, b) => b.total - a.total);

    const topFornecedor = fornecedoresArray[0] || null;

    // Variação mensal
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const anoAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

    const comprasMesAtual = comprasData.filter(c => {
      if (!c.data_compra) return false;
      const data = new Date(c.data_compra);
      return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
    });

    const comprasMesAnterior = comprasData.filter(c => {
      if (!c.data_compra) return false;
      const data = new Date(c.data_compra);
      return data.getMonth() === mesAnterior && data.getFullYear() === anoAnterior;
    });

    const valorMesAtual = comprasMesAtual.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
    const valorMesAnterior = comprasMesAnterior.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);

    const percentual = valorMesAnterior > 0
      ? ((valorMesAtual - valorMesAnterior) / valorMesAnterior) * 100
      : 0;

    // Contar total de itens
    const { count: totalItens } = await supabase
      .from('itens_entrada_compra')
      .select('*', { count: 'exact', head: true });

    return {
      ticketMedio,
      topFornecedor,
      variacaoMensal: {
        mesAtual: valorMesAtual,
        mesAnterior: valorMesAnterior,
        percentual: Number(percentual.toFixed(1)),
      },
      totalCompras: comprasData.length,
      totalItens: totalItens || 0,
    };
  } catch (error) {
    console.error('Erro ao calcular métricas:', error);
    throw error;
  }
}

/**
 * Busca compras com filtros e paginação
 */
export async function buscarCompras(
  filtros: FiltrosCompras & { page?: number; perPage?: number } = {}
) {
  try {
    const page = filtros.page || 1;
    const perPage = filtros.perPage || 20;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabase
      .from('entradas_compras')
      .select('*, fornecedores(nome, cnpj)', { count: 'exact' });

    // Aplicar filtros
    if (filtros.fornecedorNome) {
      query = query.ilike('fornecedores.nome', `%${filtros.fornecedorNome}%`);
    }

    if (filtros.dataInicio) {
      query = query.gte('data_compra', filtros.dataInicio);
    }

    if (filtros.dataFim) {
      query = query.lte('data_compra', filtros.dataFim);
    }

    const { data, count, error } = await query
      .order('data_compra', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Erro ao buscar compras:', error);
      throw error;
    }

    return {
      compras: data || [],
      total: count || 0,
      page,
      perPage,
      totalPages: Math.ceil((count || 0) / perPage),
    };
  } catch (error) {
    console.error('Erro ao buscar compras:', error);
    throw error;
  }
}
