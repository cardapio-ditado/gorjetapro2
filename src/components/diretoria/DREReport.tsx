import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Download, Calendar, DollarSign, TrendingUp, TrendingDown, Eye, List, BarChart3, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

interface DREData {
  categoria_raiz_id: string;
  categoria_raiz_nome: string;
  categoria_id: string;
  categoria_nome: string;
  tipo: 'receita' | 'despesa';
  nivel: number;
  ano: number;
  mes: number;
  valor_total: number;
  quantidade_lancamentos: number;
}

interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  categoria_id: string | null;
  centro_custo_id: string | null;
  origem: string;
  categoria?: {
    nome: string;
    categoria_pai?: {
      nome: string;
    };
  };
}

interface CategoriaConsolidada {
  nome: string;
  valor: number;
  lancamentos: number;
  subcategorias: CategoriaConsolidada[];
}

type ModoVisualizacao = 'sintetico' | 'analitico' | 'detalhado';

export default function DREReport() {
  const [ano, setAno] = useState(2026);
  const [mes, setMes] = useState<number | 'all'>(3);
  const [modo, setModo] = useState<ModoVisualizacao>('analitico');
  const [dreData, setDreData] = useState<DREData[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const anos = [2024, 2025, 2026, 2027];
  const meses = [
    { value: 'all', label: 'Ano Todo' },
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' },
  ];

  useEffect(() => {
    buscarDados();
  }, [ano, mes]);

  const buscarDados = async () => {
    setLoading(true);
    try {
      console.log('🔍 Iniciando busca de dados...');

      // 1. Buscar DRE consolidado da view
      let queryDRE = supabase
        .from('vw_dre_consolidado')
        .select('*')
        .eq('ano', ano);

      if (mes !== 'all') {
        queryDRE = queryDRE.eq('mes', mes);
      }

      const { data: dreResult, error: dreError } = await queryDRE;

      if (dreError) throw dreError;

      console.log('📊 DRE Data:', dreResult?.length, 'registros');
      setDreData(dreResult || []);

      // 2. Buscar TODOS os lançamentos do fluxo de caixa SEM LIMITE
      const startDate = mes === 'all' ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, '0')}-01`;
      const endDate = mes === 'all'
        ? `${ano}-12-31`
        : `${ano}-${String(mes).padStart(2, '0')}-${new Date(Number(ano), Number(mes), 0).getDate()}`;

      console.log('📅 Buscando lançamentos de', startDate, 'até', endDate);

      // Buscar em lotes para não ter limite
      let allLancamentos: Lancamento[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('fluxo_caixa')
          .select('*')
          .neq('origem', 'transferencia')
          .gte('data', startDate)
          .lte('data', endDate)
          .order('data', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allLancamentos = [...allLancamentos, ...data];
          console.log(`📦 Lote ${Math.floor(from / batchSize) + 1}: ${data.length} lançamentos (Total: ${allLancamentos.length})`);

          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
        }
      }

      // Buscar categorias para enriquecer os dados
      if (allLancamentos.length > 0) {
        const categoriaIds = [...new Set(allLancamentos.map(l => l.categoria_id).filter(Boolean))];

        if (categoriaIds.length > 0) {
          const { data: categorias } = await supabase
            .from('categorias_financeiras')
            .select('id, nome, categoria_pai_id')
            .in('id', categoriaIds);

          if (categorias) {
            const categoriasMap = new Map(categorias.map(c => [c.id, c]));

            // Buscar categorias pai
            const paiIds = [...new Set(categorias.map(c => c.categoria_pai_id).filter(Boolean))];
            let paiMap = new Map();

            if (paiIds.length > 0) {
              const { data: pais } = await supabase
                .from('categorias_financeiras')
                .select('id, nome')
                .in('id', paiIds);

              if (pais) {
                paiMap = new Map(pais.map(p => [p.id, p]));
              }
            }

            // Enriquecer lançamentos com categorias
            allLancamentos = allLancamentos.map(l => {
              if (l.categoria_id) {
                const cat = categoriasMap.get(l.categoria_id);
                if (cat) {
                  const pai = cat.categoria_pai_id ? paiMap.get(cat.categoria_pai_id) : null;
                  return {
                    ...l,
                    categoria: {
                      nome: cat.nome,
                      categoria_pai: pai ? { nome: pai.nome } : undefined
                    }
                  };
                }
              }
              return l;
            });
          }
        }
      }

      console.log('✅ Total de lançamentos carregados:', allLancamentos.length);

      // Agrupar por data para debug
      const porData: { [key: string]: number } = {};
      allLancamentos.forEach(l => {
        porData[l.data] = (porData[l.data] || 0) + 1;
      });
      console.log('📅 Lançamentos por data:', porData);

      setLancamentos(allLancamentos);

    } catch (error) {
      console.error('❌ Erro ao buscar dados:', error);
      alert('Erro ao buscar dados: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const calcularTotais = () => {
    const receitas = dreData
      .filter(d => d.tipo === 'receita')
      .reduce((sum, d) => sum + Math.abs(d.valor_total), 0);

    const despesas = dreData
      .filter(d => d.tipo === 'despesa')
      .reduce((sum, d) => sum + Math.abs(d.valor_total), 0);

    const resultado = receitas - despesas;

    return { receitas, despesas, resultado };
  };

  const consolidarPorCategoria = (tipo: 'receita' | 'despesa'): CategoriaConsolidada[] => {
    const categorias = dreData.filter(d => d.tipo === tipo);
    const raizes: { [key: string]: CategoriaConsolidada } = {};

    categorias.forEach(cat => {
      if (!raizes[cat.categoria_raiz_nome]) {
        raizes[cat.categoria_raiz_nome] = {
          nome: cat.categoria_raiz_nome,
          valor: 0,
          lancamentos: 0,
          subcategorias: []
        };
      }

      const raiz = raizes[cat.categoria_raiz_nome];
      raiz.valor += Math.abs(cat.valor_total);
      raiz.lancamentos += cat.quantidade_lancamentos;

      if (cat.nivel > 1) {
        raiz.subcategorias.push({
          nome: cat.categoria_nome,
          valor: Math.abs(cat.valor_total),
          lancamentos: cat.quantidade_lancamentos,
          subcategorias: []
        });
      }
    });

    return Object.values(raizes);
  };

  const gerarPDF = () => {
    const doc = new jsPDF();
    const totais = calcularTotais();
    const mesNome = mes === 'all' ? 'Ano Completo' : meses.find(m => m.value === mes)?.label;
    const receitas = consolidarPorCategoria('receita');
    const despesas = consolidarPorCategoria('despesa');

    console.log('🎯 Gerando PDF - Modo:', modo);
    console.log('📊 Total de lançamentos:', lancamentos.length);

    let yPos = 20;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;

    // Cabeçalho
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Demonstração do Resultado do Exercício', pageWidth / 2, yPos, { align: 'center' });

    yPos += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${mesNome}/${ano}`, pageWidth / 2, yPos, { align: 'center' });

    yPos += 8;
    doc.setFontSize(10);
    doc.text(`Modo: ${modo.toUpperCase()}`, pageWidth / 2, yPos, { align: 'center' });

    yPos += 15;

    // Modo Sintético ou Analítico - Simples
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('RECEITAS', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    receitas.forEach(cat => {
      doc.text(cat.nome, margin + 5, yPos);
      doc.text(formatCurrency(cat.valor), pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      if (modo === 'analitico' && cat.subcategorias.length > 0) {
        doc.setFontSize(9);
        cat.subcategorias.forEach(sub => {
          doc.text(`  ${sub.nome}`, margin + 10, yPos);
          doc.text(formatCurrency(sub.valor), pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;
        });
        doc.setFontSize(10);
      }
    });

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Receitas', margin + 5, yPos);
    doc.text(formatCurrency(totais.receitas), pageWidth - margin, yPos, { align: 'right' });
    yPos += 15;

    // Despesas
    doc.setFontSize(14);
    doc.setTextColor(220, 38, 38);
    doc.text('DESPESAS', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    despesas.forEach(cat => {
      doc.text(cat.nome, margin + 5, yPos);
      doc.text(formatCurrency(cat.valor), pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      if (modo === 'analitico' && cat.subcategorias.length > 0) {
        doc.setFontSize(9);
        cat.subcategorias.forEach(sub => {
          doc.text(`  ${sub.nome}`, margin + 10, yPos);
          doc.text(formatCurrency(sub.valor), pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;
        });
        doc.setFontSize(10);
      }
    });

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Despesas', margin + 5, yPos);
    doc.text(formatCurrency(totais.despesas), pageWidth - margin, yPos, { align: 'right' });
    yPos += 15;

    // Resultado
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    const cor = totais.resultado >= 0 ? [5, 150, 105] : [220, 38, 38];
    doc.setTextColor(cor[0], cor[1], cor[2]);
    doc.text('RESULTADO DO PERÍODO', margin, yPos);
    doc.text(formatCurrency(totais.resultado), pageWidth - margin, yPos, { align: 'right' });

    // Modo detalhado: adicionar todos os lançamentos agrupados por categoria
    if (modo === 'detalhado') {
      console.log('✅ Entrando no modo DETALHADO');
      console.log('📋 Processando', lancamentos.length, 'lançamentos');

      // Estrutura hierárquica: tipo -> categoria principal -> subcategorias -> lançamentos
      const estruturaHierarquica = lancamentos.reduce((acc, l) => {
        // Converter tipo: entrada = receita, saida = despesa
        const tipoLancamento = l.tipo === 'entrada' ? 'receita' : 'despesa';
        const categoriaPrincipal = l.categoria?.categoria_pai?.nome || l.categoria?.nome || 'SEM CATEGORIA';
        const subcategoria = l.categoria?.categoria_pai?.nome ? l.categoria.nome : null;

        // Criar estrutura se não existir
        if (!acc[tipoLancamento]) {
          acc[tipoLancamento] = {};
        }
        if (!acc[tipoLancamento][categoriaPrincipal]) {
          acc[tipoLancamento][categoriaPrincipal] = {};
        }

        const nomeSubcategoria = subcategoria || '_sem_subcategoria';
        if (!acc[tipoLancamento][categoriaPrincipal][nomeSubcategoria]) {
          acc[tipoLancamento][categoriaPrincipal][nomeSubcategoria] = {
            nome: subcategoria,
            lancamentos: []
          };
        }

        acc[tipoLancamento][categoriaPrincipal][nomeSubcategoria].lancamentos.push(l);
        return acc;
      }, {} as Record<string, any>);

      // Converter estrutura para arrays ordenados
      const receitasDetalhadas = estruturaHierarquica.receita
        ? Object.entries(estruturaHierarquica.receita)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([categoriaPrincipal, subcategorias]) => ({
              categoriaPrincipal,
              subcategorias: Object.values(subcategorias as Record<string, any>)
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
            }))
        : [];

      const despesasDetalhadas = estruturaHierarquica.despesa
        ? Object.entries(estruturaHierarquica.despesa)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([categoriaPrincipal, subcategorias]) => ({
              categoriaPrincipal,
              subcategorias: Object.values(subcategorias as Record<string, any>)
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
            }))
        : [];

      console.log('💰 Categorias de receitas:', receitasDetalhadas.length);
      console.log('💸 Categorias de despesas:', despesasDetalhadas.length);

      // Adicionar lançamentos de RECEITAS
      if (receitasDetalhadas.length > 0) {
        console.log('📄 Adicionando página de RECEITAS');
        doc.addPage();
        yPos = 20;
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(5, 150, 105);
        doc.text('LANÇAMENTOS DE RECEITAS', margin, yPos);
        yPos += 10;

        receitasDetalhadas.forEach(categoria => {
          console.log(`  📁 ${categoria.categoriaPrincipal} (${categoria.subcategorias.length} subcategorias)`);

          // Verifica se precisa adicionar nova página
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }

          // Categoria principal
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(categoria.categoriaPrincipal, margin, yPos);
          yPos += 8;

          // Iterar por todas as subcategorias
          categoria.subcategorias.forEach((sub: any) => {
            // Subcategoria (se existir)
            if (sub.nome) {
              if (yPos > 270) {
                doc.addPage();
                yPos = 20;
              }
              doc.setFontSize(11);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(60, 60, 60);
              doc.text(`  ${sub.nome}`, margin + 5, yPos);
              yPos += 6;
              console.log(`    📂 ${sub.nome} (${sub.lancamentos.length} lançamentos)`);
            }

            // Lançamentos
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 80, 80);

            sub.lancamentos.forEach((l: Lancamento) => {
              if (yPos > 280) {
                doc.addPage();
                yPos = 20;
              }

              const data = new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR');
              const descricao = l.descricao.length > 60 ? l.descricao.substring(0, 57) + '...' : l.descricao;

              doc.text(`    ${data}`, margin + 10, yPos);
              doc.text(descricao, margin + 35, yPos);
              doc.text(formatCurrency(l.valor), pageWidth - margin, yPos, { align: 'right' });
              yPos += 5;
            });

            // Total da subcategoria
            const totalSubcategoria = sub.lancamentos.reduce((sum: number, l: Lancamento) => sum + l.valor, 0);
            if (yPos > 280) {
              doc.addPage();
              yPos = 20;
            }
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(5, 150, 105);
            doc.text(`  Subtotal ${sub.nome || categoria.categoriaPrincipal}:`, margin + 10, yPos);
            doc.text(formatCurrency(totalSubcategoria), pageWidth - margin, yPos, { align: 'right' });
            yPos += 6;
          });

          yPos += 3;
        });
      }

      // Adicionar lançamentos de DESPESAS
      if (despesasDetalhadas.length > 0) {
        console.log('📄 Adicionando página de DESPESAS');
        doc.addPage();
        yPos = 20;
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text('LANÇAMENTOS DE DESPESAS', margin, yPos);
        yPos += 10;

        despesasDetalhadas.forEach(categoria => {
          console.log(`  📁 ${categoria.categoriaPrincipal} (${categoria.subcategorias.length} subcategorias)`);

          // Verifica se precisa adicionar nova página
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }

          // Categoria principal
          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(categoria.categoriaPrincipal, margin, yPos);
          yPos += 8;

          // Iterar por todas as subcategorias
          categoria.subcategorias.forEach((sub: any) => {
            // Subcategoria (se existir)
            if (sub.nome) {
              if (yPos > 270) {
                doc.addPage();
                yPos = 20;
              }
              doc.setFontSize(11);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(60, 60, 60);
              doc.text(`  ${sub.nome}`, margin + 5, yPos);
              yPos += 6;
              console.log(`    📂 ${sub.nome} (${sub.lancamentos.length} lançamentos)`);
            }

            // Lançamentos
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 80, 80);

            sub.lancamentos.forEach((l: Lancamento) => {
              if (yPos > 280) {
                doc.addPage();
                yPos = 20;
              }

              const data = new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR');
              const descricao = l.descricao.length > 60 ? l.descricao.substring(0, 57) + '...' : l.descricao;

              doc.text(`    ${data}`, margin + 10, yPos);
              doc.text(descricao, margin + 35, yPos);
              doc.text(formatCurrency(Math.abs(l.valor)), pageWidth - margin, yPos, { align: 'right' });
              yPos += 5;
            });

            // Total da subcategoria
            const totalSubcategoria = sub.lancamentos.reduce((sum: number, l: Lancamento) => sum + Math.abs(l.valor), 0);
            if (yPos > 280) {
              doc.addPage();
              yPos = 20;
            }
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(220, 38, 38);
            doc.text(`  Subtotal ${sub.nome || categoria.categoriaPrincipal}:`, margin + 10, yPos);
            doc.text(formatCurrency(totalSubcategoria), pageWidth - margin, yPos, { align: 'right' });
            yPos += 6;
          });

          yPos += 3;
        });
      }
    }

    doc.save(`DRE_${modo}_${ano}_${mesNome}.pdf`);
  };

  const exportarExcel = () => {
    const totais = calcularTotais();
    const mesNome = mes === 'all' ? 'Ano_Completo' : meses.find(m => m.value === mes)?.label;
    const receitas = consolidarPorCategoria('receita');
    const despesas = consolidarPorCategoria('despesa');

    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumo
    const sheetResumo = [
      ['Demonstração do Resultado do Exercício'],
      [`Período: ${mesNome}/${ano}`],
      [`Modo: ${modo}`],
      [],
      ['RECEITAS', formatCurrency(totais.receitas)],
      ['(-) DESPESAS', formatCurrency(totais.despesas)],
      [],
      ['RESULTADO DO PERÍODO', formatCurrency(totais.resultado)]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetResumo), 'Resumo');

    // Sheet 2: Receitas Detalhadas
    const receitasData: any[] = [['Categoria', 'Subcategoria', 'Valor', 'Lançamentos']];
    receitas.forEach(cat => {
      receitasData.push([cat.nome, '', cat.valor, cat.lancamentos]);
      cat.subcategorias.forEach(sub => {
        receitasData.push(['', sub.nome, sub.valor, sub.lancamentos]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(receitasData), 'Receitas');

    // Sheet 3: Despesas Detalhadas
    const despesasData: any[] = [['Categoria', 'Subcategoria', 'Valor', 'Lançamentos']];
    despesas.forEach(cat => {
      despesasData.push([cat.nome, '', cat.valor, cat.lancamentos]);
      cat.subcategorias.forEach(sub => {
        despesasData.push(['', sub.nome, sub.valor, sub.lancamentos]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despesasData), 'Despesas');

    // Sheet 4: Todos os Lançamentos
    const sheetLancamentos = lancamentos.map(l => {
      const categoriaNome = l.categoria?.categoria_pai?.nome
        ? `${l.categoria.categoria_pai.nome} > ${l.categoria.nome}`
        : l.categoria?.nome || 'SEM CATEGORIA';

      return {
        'Data': l.data,
        'Descrição': l.descricao,
        'Categoria': categoriaNome,
        'Tipo': l.tipo,
        'Valor': l.valor,
        'Origem': l.origem
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetLancamentos), 'Lancamentos_Todos');

    XLSX.writeFile(wb, `DRE_${modo}_${ano}_${mesNome}.xlsx`);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const totais = calcularTotais();
  const receitasConsolidadas = consolidarPorCategoria('receita');
  const despesasConsolidadas = consolidarPorCategoria('despesa');

  // Agrupar lançamentos por data para debug
  const lancamentosPorData: { [key: string]: number } = {};
  lancamentos.forEach(l => {
    lancamentosPorData[l.data] = (lancamentosPorData[l.data] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">DRE - Demonstração do Resultado</h2>
            <p className="text-sm text-slate-600 mt-1">
              Relatório completo com {lancamentos.length.toLocaleString('pt-BR')} lançamentos
            </p>
          </div>
          <FileText className="w-8 h-8 text-[#7D1F2C]" />
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Ano */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Ano
            </label>
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
            >
              {anos.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Mês */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mês
            </label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
            >
              {meses.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Modo de Visualização */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Modo de Visualização
            </label>
            <select
              value={modo}
              onChange={(e) => setModo(e.target.value as ModoVisualizacao)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
            >
              <option value="sintetico">Sintético (Resumo)</option>
              <option value="analitico">Analítico (Por Categoria)</option>
              <option value="detalhado">Detalhado (Todos Lançamentos)</option>
            </select>
          </div>

          {/* Botões de Ação */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Exportar
            </label>
            <div className="flex gap-2">
              <button
                onClick={gerarPDF}
                disabled={loading || lancamentos.length === 0}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                PDF
              </button>
              <button
                onClick={exportarExcel}
                disabled={loading || lancamentos.length === 0}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </button>
            </div>
          </div>
        </div>

        {/* Debug Toggle */}
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="showDebug"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor="showDebug" className="text-sm text-slate-600 cursor-pointer">
            Mostrar informações de debug
          </label>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]"></div>
            <span className="ml-3 text-slate-600">Carregando dados...</span>
          </div>
        </div>
      )}

      {/* Debug Info */}
      {showDebug && !loading && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">🔍 Debug - Dados Carregados</h3>
          <div className="space-y-2 text-sm">
            <p><strong>Total Lançamentos:</strong> {lancamentos.length.toLocaleString('pt-BR')}</p>
            <p><strong>Registros DRE:</strong> {dreData.length}</p>
            <p><strong>Receitas:</strong> {formatCurrency(totais.receitas)}</p>
            <p><strong>Despesas:</strong> {formatCurrency(totais.despesas)}</p>
            <p><strong>Resultado:</strong> {formatCurrency(totais.resultado)}</p>

            <div className="mt-4">
              <strong>Lançamentos por Data:</strong>
              <div className="mt-2 max-h-40 overflow-y-auto bg-white p-3 rounded border border-slate-200">
                {Object.entries(lancamentosPorData)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([data, qtd]) => (
                    <div key={data} className="text-xs text-slate-600">
                      {new Date(data).toLocaleDateString('pt-BR')}: {qtd} lançamento(s)
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Totalizadores */}
      {!loading && lancamentos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Receitas</p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {formatCurrency(totais.receitas)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Despesas</p>
                <p className="text-2xl font-bold text-red-400 mt-1">
                  {formatCurrency(totais.despesas)}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-400" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Resultado</p>
                <p className={`text-2xl font-bold mt-1 ${totais.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(totais.resultado)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-slate-400" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Margem</p>
                <p className={`text-2xl font-bold mt-1 ${totais.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totais.receitas > 0 ? ((totais.resultado / totais.receitas) * 100).toFixed(1) : '0.0'}%
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-slate-400" />
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      {!loading && lancamentos.length > 0 && (
        <>
          {modo === 'sintetico' && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Modo Sintético - Resumo</h3>
              <div className="space-y-2">
                <div className="flex justify-between py-3 border-b border-slate-200">
                  <span className="font-medium text-slate-700">Receitas Totais</span>
                  <span className="font-semibold text-green-400">{formatCurrency(totais.receitas)}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-slate-200">
                  <span className="font-medium text-slate-700">(-) Despesas Totais</span>
                  <span className="font-semibold text-red-400">{formatCurrency(totais.despesas)}</span>
                </div>
                <div className="flex justify-between py-4 bg-slate-50 px-4 rounded-lg mt-4">
                  <span className="font-bold text-slate-900 text-lg">Resultado do Período</span>
                  <span className={`font-bold text-lg ${totais.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(totais.resultado)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {modo === 'analitico' && (
            <div className="space-y-6">
              {/* Receitas */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  RECEITAS
                </h3>
                <div className="space-y-3">
                  {receitasConsolidadas.map((cat, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between py-2 bg-green-500/10 px-4 rounded-lg">
                        <span className="font-semibold text-slate-900">{cat.nome}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-slate-500">{cat.lancamentos} lanç.</span>
                          <span className="font-semibold text-green-400">{formatCurrency(cat.valor)}</span>
                        </div>
                      </div>
                      {cat.subcategorias.length > 0 && (
                        <div className="ml-6 mt-2 space-y-1">
                          {cat.subcategorias.map((sub, subIdx) => (
                            <div key={subIdx} className="flex justify-between py-1 text-sm">
                              <span className="text-slate-600">{sub.nome}</span>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-slate-400">{sub.lancamentos} lanç.</span>
                                <span className="text-slate-700">{formatCurrency(sub.valor)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between py-3 border-t-2 border-green-200 mt-4 px-4">
                    <span className="font-bold text-slate-900">Total Receitas</span>
                    <span className="font-bold text-green-400">{formatCurrency(totais.receitas)}</span>
                  </div>
                </div>
              </div>

              {/* Despesas */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5" />
                  DESPESAS
                </h3>
                <div className="space-y-3">
                  {despesasConsolidadas.map((cat, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between py-2 bg-red-500/10 px-4 rounded-lg">
                        <span className="font-semibold text-slate-900">{cat.nome}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-slate-500">{cat.lancamentos} lanç.</span>
                          <span className="font-semibold text-red-400">{formatCurrency(cat.valor)}</span>
                        </div>
                      </div>
                      {cat.subcategorias.length > 0 && (
                        <div className="ml-6 mt-2 space-y-1">
                          {cat.subcategorias.map((sub, subIdx) => (
                            <div key={subIdx} className="flex justify-between py-1 text-sm">
                              <span className="text-slate-600">{sub.nome}</span>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-slate-400">{sub.lancamentos} lanç.</span>
                                <span className="text-slate-700">{formatCurrency(sub.valor)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between py-3 border-t-2 border-red-200 mt-4 px-4">
                    <span className="font-bold text-slate-900">Total Despesas</span>
                    <span className="font-bold text-red-400">{formatCurrency(totais.despesas)}</span>
                  </div>
                </div>
              </div>

              {/* Resultado */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between py-4 bg-slate-100 px-6 rounded-lg">
                  <span className="font-bold text-slate-900 text-xl">RESULTADO DO PERÍODO</span>
                  <span className={`font-bold text-xl ${totais.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(totais.resultado)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {modo === 'detalhado' && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <List className="w-5 h-5" />
                  Modo Detalhado - Todos os {lancamentos.length.toLocaleString('pt-BR')} Lançamentos
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase">Origem</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase">Receita</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase">Despesa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {lancamentos.map((l, idx) => {
                      const categoriaNome = l.categoria?.categoria_pai?.nome
                        ? `${l.categoria.categoria_pai.nome} > ${l.categoria.nome}`
                        : l.categoria?.nome || 'SEM CATEGORIA';

                      return (
                        <tr key={l.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(l.data).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900">{l.descricao}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{categoriaNome}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{l.origem}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-green-400">
                            {l.tipo === 'entrada' ? formatCurrency(l.valor) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-red-400">
                            {l.tipo === 'saida' ? formatCurrency(Math.abs(l.valor)) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-semibold">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right text-sm text-slate-900">
                        TOTAIS:
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-400">
                        {formatCurrency(totais.receitas)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-400">
                        {formatCurrency(totais.despesas)}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-slate-300">
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                        RESULTADO:
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${totais.resultado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(totais.resultado)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Sem Dados */}
      {!loading && lancamentos.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Nenhum lançamento encontrado para o período selecionado.</p>
        </div>
      )}
    </div>
  );
}
