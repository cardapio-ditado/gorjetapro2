import { supabase } from '../lib/supabase';

export interface CategorizacaoSugestao {
  categoria_id: string;
  categoria_nome: string;
  subcategoria_id?: string;
  subcategoria_nome?: string;
  confianca: number; // 0-1
  razao: string;
  alternativas?: Array<{
    categoria_id: string;
    categoria_nome: string;
    confianca: number;
  }>;
}

/**
 * Analisa histórico e sugere categoria baseado em padrões
 */
export async function sugerirCategoria(
  fornecedorId?: string,
  fornecedorNome?: string,
  descricao?: string,
  valor?: number
): Promise<CategorizacaoSugestao | null> {
  try {
    // 1. Buscar histórico do fornecedor (mais confiável)
    if (fornecedorId) {
      const { data: historico } = await supabase
        .from('contas_pagar')
        .select('categoria_id, categorias_financeiras(id, nome)')
        .eq('fornecedor_id', fornecedorId)
        .not('categoria_id', 'is', null)
        .order('criado_em', { ascending: false })
        .limit(10);

      if (historico && historico.length > 0) {
        // Contar frequência de cada categoria
        const categoriaCount = new Map<string, { count: number; nome: string }>();
        historico.forEach(item => {
          if (item.categoria_id && item.categorias_financeiras) {
            const key = item.categoria_id;
            const atual = categoriaCount.get(key) || { count: 0, nome: item.categorias_financeiras.nome };
            atual.count++;
            categoriaCount.set(key, atual);
          }
        });

        // Pegar a mais frequente
        const ordenado = Array.from(categoriaCount.entries())
          .sort((a, b) => b[1].count - a[1].count);

        if (ordenado.length > 0) {
          const [categoriaId, dados] = ordenado[0];
          const confianca = dados.count / historico.length;

          // Alternativas
          const alternativas = ordenado.slice(1, 3).map(([id, d]) => ({
            categoria_id: id,
            categoria_nome: d.nome,
            confianca: d.count / historico.length,
          }));

          return {
            categoria_id: categoriaId,
            categoria_nome: dados.nome,
            confianca,
            razao: `Histórico mostra ${dados.count} de ${historico.length} transações (${(confianca * 100).toFixed(0)}%) nesta categoria`,
            alternativas: alternativas.length > 0 ? alternativas : undefined,
          };
        }
      }
    }

    // 2. Buscar por nome do fornecedor (similaridade)
    if (fornecedorNome) {
      const { data: similarFornecedores } = await supabase
        .from('contas_pagar')
        .select('categoria_id, categorias_financeiras(id, nome), fornecedores(nome)')
        .ilike('fornecedores.nome', `%${fornecedorNome}%`)
        .not('categoria_id', 'is', null)
        .limit(20);

      if (similarFornecedores && similarFornecedores.length > 0) {
        const categoriaCount = new Map<string, { count: number; nome: string }>();
        similarFornecedores.forEach(item => {
          if (item.categoria_id && item.categorias_financeiras) {
            const key = item.categoria_id;
            const atual = categoriaCount.get(key) || { count: 0, nome: item.categorias_financeiras.nome };
            atual.count++;
            categoriaCount.set(key, atual);
          }
        });

        const ordenado = Array.from(categoriaCount.entries())
          .sort((a, b) => b[1].count - a[1].count);

        if (ordenado.length > 0) {
          const [categoriaId, dados] = ordenado[0];
          const confianca = (dados.count / similarFornecedores.length) * 0.7; // Reduzir confiança pois não é exato

          return {
            categoria_id: categoriaId,
            categoria_nome: dados.nome,
            confianca,
            razao: `Fornecedores similares usam esta categoria em ${dados.count} de ${similarFornecedores.length} casos`,
          };
        }
      }
    }

    // 3. Buscar por palavras-chave na descrição
    if (descricao) {
      const categoriaPorPalavraChave = await buscarPorPalavrasChave(descricao);
      if (categoriaPorPalavraChave) {
        return categoriaPorPalavraChave;
      }
    }

    // 4. Buscar por faixa de valor (menos confiável)
    if (valor) {
      const { data: porValor } = await supabase
        .from('contas_pagar')
        .select('categoria_id, categorias_financeiras(id, nome), valor')
        .gte('valor', valor * 0.8)
        .lte('valor', valor * 1.2)
        .not('categoria_id', 'is', null)
        .limit(20);

      if (porValor && porValor.length >= 5) {
        const categoriaCount = new Map<string, { count: number; nome: string }>();
        porValor.forEach(item => {
          if (item.categoria_id && item.categorias_financeiras) {
            const key = item.categoria_id;
            const atual = categoriaCount.get(key) || { count: 0, nome: item.categorias_financeiras.nome };
            atual.count++;
            categoriaCount.set(key, atual);
          }
        });

        const ordenado = Array.from(categoriaCount.entries())
          .sort((a, b) => b[1].count - a[1].count);

        if (ordenado.length > 0) {
          const [categoriaId, dados] = ordenado[0];
          const confianca = (dados.count / porValor.length) * 0.5; // Baixa confiança

          return {
            categoria_id: categoriaId,
            categoria_nome: dados.nome,
            confianca,
            razao: `Valores similares (${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) frequentemente nesta categoria`,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Erro ao sugerir categoria:', error);
    return null;
  }
}

/**
 * Busca categoria por palavras-chave na descrição
 */
async function buscarPorPalavrasChave(descricao: string): Promise<CategorizacaoSugestao | null> {
  const descricaoLower = descricao.toLowerCase();

  // Mapeamento de palavras-chave para categorias
  const palavrasChave: Record<string, { palavras: string[]; confianca: number }> = {
    'aluguel': { palavras: ['aluguel', 'aluguer', 'locação', 'locacao', 'imóvel', 'imovel'], confianca: 0.9 },
    'energia': { palavras: ['energia', 'luz', 'eletricidade', 'elétrica', 'eletrica', 'cemig', 'copel', 'celpe'], confianca: 0.95 },
    'água': { palavras: ['água', 'agua', 'saneamento', 'sabesp', 'cedae'], confianca: 0.95 },
    'telefone': { palavras: ['telefone', 'celular', 'internet', 'telecom', 'vivo', 'tim', 'claro', 'oi'], confianca: 0.9 },
    'combustível': { palavras: ['combustível', 'combustivel', 'gasolina', 'diesel', 'posto', 'abastecimento'], confianca: 0.85 },
    'material de limpeza': { palavras: ['limpeza', 'higiene', 'detergente', 'sabão', 'sabao', 'desinfetante'], confianca: 0.8 },
    'manutenção': { palavras: ['manutenção', 'manutencao', 'reparo', 'conserto', 'reforma'], confianca: 0.8 },
    'contabilidade': { palavras: ['contabilidade', 'contador', 'contabil', 'honorários contábeis', 'honorarios contabeis'], confianca: 0.9 },
    'marketing': { palavras: ['marketing', 'publicidade', 'propaganda', 'anúncio', 'anuncio', 'divulgação', 'divulgacao'], confianca: 0.85 },
    'salário': { palavras: ['salário', 'salario', 'folha de pagamento', 'pró-labore', 'pro-labore'], confianca: 0.9 },
    'imposto': { palavras: ['imposto', 'taxa', 'tributo', 'iptu', 'irpj', 'inss', 'fgts', 'pis', 'cofins'], confianca: 0.95 },
  };

  // Buscar match
  for (const [categoriaNome, config] of Object.entries(palavrasChave)) {
    for (const palavra of config.palavras) {
      if (descricaoLower.includes(palavra)) {
        // Buscar ID da categoria no banco
        const { data: categoria } = await supabase
          .from('categorias_financeiras')
          .select('id, nome')
          .ilike('nome', `%${categoriaNome}%`)
          .limit(1)
          .single();

        if (categoria) {
          return {
            categoria_id: categoria.id,
            categoria_nome: categoria.nome,
            confianca: config.confianca,
            razao: `Palavra-chave "${palavra}" identificada na descrição`,
          };
        }

        // Se não encontrou, tentar criar sugestão genérica
        return {
          categoria_id: '',
          categoria_nome: categoriaNome.charAt(0).toUpperCase() + categoriaNome.slice(1),
          confianca: config.confianca * 0.7,
          razao: `Palavra-chave "${palavra}" sugere categoria "${categoriaNome}"`,
        };
      }
    }
  }

  return null;
}

/**
 * Aprende com feedback do usuário (melhora ao longo do tempo)
 */
export async function registrarFeedbackCategorizacao(
  fornecedorId: string,
  categoriaId: string,
  descricao: string,
  aceitou: boolean
) {
  try {
    // Poderia criar uma tabela de feedback para melhorar o algoritmo
    // Por enquanto, apenas registrar no log
    console.log('Feedback categorização:', {
      fornecedorId,
      categoriaId,
      descricao,
      aceitou,
      timestamp: new Date().toISOString(),
    });

    // Futuramente: usar este feedback para treinar modelo ML
  } catch (error) {
    console.error('Erro ao registrar feedback:', error);
  }
}
