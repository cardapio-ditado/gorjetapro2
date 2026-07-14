import { supabase } from '../lib/supabase';
import dayjs from 'dayjs';

export interface DuplicataEncontrada {
  id: string;
  tipo: 'exata' | 'similar' | 'possivel';
  severidade: 'alta' | 'media' | 'baixa';
  similaridade: number; // 0-1
  conta: {
    id: string;
    fornecedor_nome?: string;
    descricao?: string;
    valor: number;
    data_vencimento: string;
    numero_documento?: string;
    status?: string;
  };
  motivos: string[];
  acao_recomendada: string;
}

/**
 * Detecta possíveis duplicatas antes de criar uma conta
 */
export async function detectarDuplicatas(
  dados: {
    fornecedor_id?: string;
    fornecedor_nome?: string;
    valor: number;
    data_vencimento: string;
    numero_documento?: string;
    descricao?: string;
  },
  tipoConta: 'pagar' | 'receber' = 'pagar'
): Promise<DuplicataEncontrada[]> {
  try {
    const duplicatas: DuplicataEncontrada[] = [];
    const tabela = tipoConta === 'pagar' ? 'contas_pagar' : 'contas_receber';

    // 1. DUPLICATA EXATA - Mesmo documento
    if (dados.numero_documento) {
      const { data: porDocumento } = await supabase
        .from(tabela)
        .select('*, fornecedores(nome)')
        .eq('numero_documento', dados.numero_documento)
        .neq('status', 'cancelado')
        .limit(5);

      if (porDocumento && porDocumento.length > 0) {
        porDocumento.forEach(conta => {
          duplicatas.push({
            id: conta.id,
            tipo: 'exata',
            severidade: 'alta',
            similaridade: 1.0,
            conta: {
              id: conta.id,
              fornecedor_nome: conta.fornecedores?.nome || conta.fornecedor_nome,
              descricao: conta.descricao,
              valor: conta.valor,
              data_vencimento: conta.data_vencimento,
              numero_documento: conta.numero_documento,
              status: conta.status,
            },
            motivos: ['Mesmo número de documento'],
            acao_recomendada: '🚫 NÃO CADASTRAR - Duplicata confirmada',
          });
        });
      }
    }

    // 2. DUPLICATA SIMILAR - Mesmo fornecedor, valor e vencimento próximo
    if (dados.fornecedor_id || dados.fornecedor_nome) {
      let query = supabase
        .from(tabela)
        .select('*, fornecedores(nome)')
        .neq('status', 'cancelado');

      if (dados.fornecedor_id) {
        query = query.eq('fornecedor_id', dados.fornecedor_id);
      }

      // Valor com margem de 2%
      const valorMin = dados.valor * 0.98;
      const valorMax = dados.valor * 1.02;
      query = query.gte('valor', valorMin).lte('valor', valorMax);

      // Vencimento próximo (±7 dias)
      const dataVenc = dayjs(dados.data_vencimento);
      const dataMin = dataVenc.subtract(7, 'days').format('YYYY-MM-DD');
      const dataMax = dataVenc.add(7, 'days').format('YYYY-MM-DD');
      query = query.gte('data_vencimento', dataMin).lte('data_vencimento', dataMax);

      const { data: similares } = await query.limit(5);

      if (similares && similares.length > 0) {
        similares.forEach(conta => {
          // Calcular similaridade
          let pontos = 0;
          const motivos: string[] = [];

          // Fornecedor exato
          if (dados.fornecedor_id && conta.fornecedor_id === dados.fornecedor_id) {
            pontos += 30;
            motivos.push('Mesmo fornecedor');
          }

          // Valor similar (quanto mais próximo, mais pontos)
          const diferencaValor = Math.abs(conta.valor - dados.valor);
          const percDiferencaValor = diferencaValor / dados.valor;
          if (percDiferencaValor < 0.01) {
            pontos += 30;
            motivos.push('Valor idêntico');
          } else if (percDiferencaValor < 0.02) {
            pontos += 20;
            motivos.push('Valor muito similar');
          }

          // Vencimento próximo (quanto mais próximo, mais pontos)
          const diasDiferenca = Math.abs(dayjs(conta.data_vencimento).diff(dados.data_vencimento, 'days'));
          if (diasDiferenca === 0) {
            pontos += 30;
            motivos.push('Mesmo vencimento');
          } else if (diasDiferenca <= 2) {
            pontos += 20;
            motivos.push(`Vencimento próximo (${diasDiferenca} dias)`);
          } else if (diasDiferenca <= 7) {
            pontos += 10;
            motivos.push(`Vencimento na mesma semana (${diasDiferenca} dias)`);
          }

          // Descrição similar
          if (dados.descricao && conta.descricao) {
            const similaridadeDescricao = calcularSimilaridade(
              dados.descricao.toLowerCase(),
              conta.descricao.toLowerCase()
            );
            if (similaridadeDescricao > 0.7) {
              pontos += 10;
              motivos.push('Descrição similar');
            }
          }

          const similaridade = pontos / 100;

          // Só adicionar se similaridade > 50%
          if (similaridade >= 0.5) {
            // Verificar se não é a mesma conta que já encontramos
            const jaExiste = duplicatas.some(d => d.conta.id === conta.id);
            if (!jaExiste) {
              duplicatas.push({
                id: conta.id,
                tipo: similaridade >= 0.8 ? 'similar' : 'possivel',
                severidade: similaridade >= 0.8 ? 'alta' : similaridade >= 0.6 ? 'media' : 'baixa',
                similaridade,
                conta: {
                  id: conta.id,
                  fornecedor_nome: conta.fornecedores?.nome || conta.fornecedor_nome,
                  descricao: conta.descricao,
                  valor: conta.valor,
                  data_vencimento: conta.data_vencimento,
                  numero_documento: conta.numero_documento,
                  status: conta.status,
                },
                motivos,
                acao_recomendada:
                  similaridade >= 0.8
                    ? '⚠️ REVISAR - Alta probabilidade de duplicata'
                    : similaridade >= 0.6
                    ? '💡 VERIFICAR - Conta similar encontrada'
                    : 'ℹ️ INFORMAÇÃO - Possível duplicata',
              });
            }
          }
        });
      }
    }

    // 3. PADRÃO SUSPEITO - Múltiplas contas no mesmo dia/período
    if (dados.fornecedor_id) {
      const { data: contasMesmoDia } = await supabase
        .from(tabela)
        .select('id, valor, data_vencimento')
        .eq('fornecedor_id', dados.fornecedor_id)
        .eq('data_vencimento', dados.data_vencimento)
        .neq('status', 'cancelado');

      if (contasMesmoDia && contasMesmoDia.length >= 2) {
        // Se já existem 2+ contas do mesmo fornecedor no mesmo dia, alertar
        console.warn('Padrão suspeito: Múltiplas contas do mesmo fornecedor no mesmo dia');
      }
    }

    // Ordenar por similaridade (maior primeiro)
    return duplicatas.sort((a, b) => b.similaridade - a.similaridade);
  } catch (error) {
    console.error('Erro ao detectar duplicatas:', error);
    return [];
  }
}

/**
 * Calcula similaridade entre duas strings (Levenshtein simplificado)
 */
function calcularSimilaridade(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Contar palavras em comum
  const palavras1 = new Set(str1.split(/\s+/));
  const palavras2 = new Set(str2.split(/\s+/));
  let comuns = 0;

  palavras1.forEach(palavra => {
    if (palavras2.has(palavra) && palavra.length > 2) {
      comuns++;
    }
  });

  const totalPalavras = Math.max(palavras1.size, palavras2.size);
  return totalPalavras > 0 ? comuns / totalPalavras : 0;
}

/**
 * Verifica se duas contas são duplicatas óbvias
 */
export function saoContasDuplicadas(
  conta1: { valor: number; data_vencimento: string; fornecedor_id?: string },
  conta2: { valor: number; data_vencimento: string; fornecedor_id?: string }
): boolean {
  // Mesmo fornecedor, mesmo valor, mesmo vencimento = DUPLICATA
  const mesmoFornecedor = conta1.fornecedor_id === conta2.fornecedor_id;
  const mesmoValor = Math.abs(conta1.valor - conta2.valor) < 0.01;
  const mesmoVencimento = conta1.data_vencimento === conta2.data_vencimento;

  return mesmoFornecedor && mesmoValor && mesmoVencimento;
}

/**
 * Detecta padrões suspeitos em lote (análise mais profunda)
 */
export async function detectarPadroesSuspeitos(
  periodo: { inicio: string; fim: string },
  tipoConta: 'pagar' | 'receber' = 'pagar'
): Promise<Array<{
  tipo: string;
  descricao: string;
  contas_afetadas: string[];
  severidade: 'alta' | 'media' | 'baixa';
}>> {
  try {
    const padroes: Array<{
      tipo: string;
      descricao: string;
      contas_afetadas: string[];
      severidade: 'alta' | 'media' | 'baixa';
    }> = [];

    const tabela = tipoConta === 'pagar' ? 'contas_pagar' : 'contas_receber';

    // Buscar todas contas do período
    const { data: contas } = await supabase
      .from(tabela)
      .select('*')
      .gte('data_vencimento', periodo.inicio)
      .lte('data_vencimento', periodo.fim);

    if (!contas || contas.length === 0) return [];

    // 1. Valores redondos suspeitos (múltiplas contas de R$ 1.000,00 exatos)
    const valoresRedondos = contas.filter(c => c.valor % 1000 === 0 && c.valor >= 1000);
    if (valoresRedondos.length >= 3) {
      padroes.push({
        tipo: 'valores_redondos',
        descricao: `${valoresRedondos.length} contas com valores redondos (R$ 1.000, R$ 2.000, etc)`,
        contas_afetadas: valoresRedondos.map(c => c.id),
        severidade: 'baixa',
      });
    }

    // 2. Sequência de valores idênticos
    const valorMap = new Map<number, string[]>();
    contas.forEach(c => {
      const ids = valorMap.get(c.valor) || [];
      ids.push(c.id);
      valorMap.set(c.valor, ids);
    });

    valorMap.forEach((ids, valor) => {
      if (ids.length >= 3) {
        padroes.push({
          tipo: 'valores_duplicados',
          descricao: `${ids.length} contas com valor idêntico: ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          contas_afetadas: ids,
          severidade: ids.length >= 5 ? 'alta' : 'media',
        });
      }
    });

    return padroes;
  } catch (error) {
    console.error('Erro ao detectar padrões suspeitos:', error);
    return [];
  }
}
