import React, { useState, useEffect } from 'react';
import { Tag, Check, X, AlertCircle, Filter, Calendar, ArrowRight, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import { formatCurrency } from '../../utils/reportGenerator';

interface LancamentoCategoriaPai {
  id: string;
  tipo: string;
  tipo_nome: string;
  valor: number;
  data: string;
  descricao: string;
  categoria_pai_id: string;
  categoria_pai_nome: string;
  categoria_tipo: string;
  centro_custo_nome?: string;
  forma_pagamento_nome?: string;
  conta_bancaria_banco?: string;
  conta_bancaria_tipo?: string;
  origem?: string;
  observacoes?: string;
  criado_por?: string;
  ano: number;
  mes: number;
}

interface Subcategoria {
  id: string;
  nome: string;
  caminho_completo: string;
  tipo: string;
  nivel: number;
}

interface ResumoCategoriaPai {
  categoria_pai_id: string;
  categoria_pai_nome: string;
  categoria_tipo: string;
  ano: number;
  mes: number;
  tipo: string;
  tipo_nome: string;
  quantidade: number;
  valor_total: number;
}

const RecategorizarLancamentos: React.FC = () => {
  const [lancamentos, setLancamentos] = useState<LancamentoCategoriaPai[]>([]);
  const [resumo, setResumo] = useState<ResumoCategoriaPai[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('');
  const [filtroCategoriaPai, setFiltroCategoriaPai] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'all' | 'entrada' | 'saida'>('all');
  const [filtroMes, setFiltroMes] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (filtroCategoriaPai) {
      fetchSubcategorias(filtroCategoriaPai);
    } else {
      setSubcategorias([]);
    }
  }, [filtroCategoriaPai]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [lancamentosRes, resumoRes] = await Promise.all([
        supabase.from('vw_lancamentos_em_categorias_pai').select('*'),
        supabase.from('vw_resumo_lancamentos_categoria_pai').select('*')
      ]);

      if (lancamentosRes.error) throw lancamentosRes.error;
      if (resumoRes.error) throw resumoRes.error;

      setLancamentos(lancamentosRes.data || []);
      setResumo(resumoRes.data || []);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      alert('Erro ao carregar dados: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubcategorias = async (categoriaPaiId: string) => {
    try {
      const { data, error } = await supabase.rpc('listar_subcategorias', {
        p_categoria_pai_id: categoriaPaiId
      });

      if (error) throw error;
      setSubcategorias(data || []);
    } catch (error) {
      console.error('Erro ao buscar subcategorias:', error);
      setSubcategorias([]);
    }
  };

  const handleRecategorizar = async () => {
    if (!categoriaSelecionada || selectedIds.size === 0) {
      alert('Selecione uma subcategoria de destino e pelo menos um lançamento');
      return;
    }

    const confirmMsg = `Deseja recategorizar ${selectedIds.size} lançamento(s) para a subcategoria selecionada?\n\nEsta ação não pode ser desfeita automaticamente.`;
    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      setProcessando(true);

      const { data, error } = await supabase.rpc('recategorizar_lancamentos_lote', {
        p_lancamento_ids: Array.from(selectedIds),
        p_nova_categoria_id: categoriaSelecionada
      });

      if (error) throw error;

      const resultado = data as any;

      if (resultado.sucesso) {
        alert(
          `Recategorização concluída!\n\n` +
          `✅ Sucesso: ${resultado.total_sucesso}\n` +
          `❌ Erros: ${resultado.total_erros}\n` +
          `📊 Total processado: ${resultado.total_processados}`
        );

        setSelectedIds(new Set());
        setCategoriaSelecionada('');
        setFiltroCategoriaPai('');
        fetchData();
      } else {
        throw new Error(resultado.erro || 'Erro desconhecido ao recategorizar');
      }
    } catch (error) {
      console.error('Erro ao recategorizar:', error);
      alert('Erro ao recategorizar lançamentos: ' + (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleAll = () => {
    if (selectedIds.size === lancamentosFiltrados.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(lancamentosFiltrados.map(l => l.id)));
    }
  };

  const lancamentosFiltrados = lancamentos.filter(l => {
    if (filtroCategoriaPai && l.categoria_pai_id !== filtroCategoriaPai) return false;
    if (filtroTipo !== 'all' && l.tipo !== filtroTipo) return false;
    if (filtroMes) {
      const [ano, mes] = filtroMes.split('-');
      if (l.ano.toString() !== ano || l.mes.toString() !== mes.padStart(2, '0')) return false;
    }
    return true;
  });

  const totalSelecionado = lancamentosFiltrados
    .filter(l => selectedIds.has(l.id))
    .reduce((sum, l) => sum + Math.abs(l.valor), 0);

  const categoriasUnicas = Array.from(
    new Set(resumo.map(r => JSON.stringify({ id: r.categoria_pai_id, nome: r.categoria_pai_nome })))
  ).map(str => JSON.parse(str));

  const mesesUnicos = Array.from(
    new Set(resumo.map(r => `${r.ano}-${String(r.mes).padStart(2, '0')}`))
  ).sort().reverse();

  const getMonthName = (monthStr: string) => {
    const [ano, mes] = monthStr.split('-');
    const date = new Date(parseInt(ano), parseInt(mes) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header com Resumo */}
      <div className="bg-amber-500/8 rounded-lg border border-amber-500/20 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-amber-400 mb-2">
              Lançamentos em Categorias PAI
            </h4>
            <p className="text-sm text-amber-400/80 mb-3">
              Foram encontrados <strong>{lancamentos.length} lançamentos</strong> que estão classificados
              diretamente em categorias PAI. Esses lançamentos devem ser movidos para subcategorias
              específicas para aparecerem corretamente no DRE detalhado.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {resumo.slice(0, 3).map(r => (
                <div key={`${r.categoria_pai_id}-${r.ano}-${r.mes}`} className="bg-[#12141f] rounded p-3 border border-amber-700/40">
                  <div className="text-xs text-white/60 mb-1">{r.categoria_pai_nome}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{r.quantidade} lanç.</span>
                    <span className="text-sm font-bold text-[#D4AF37]">
                      {formatCurrency(r.valor_total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[#12141f] rounded-lg border border-white/10 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Categoria PAI
            </label>
            <select
              value={filtroCategoriaPai}
              onChange={(e) => {
                setFiltroCategoriaPai(e.target.value);
                setSelectedIds(new Set());
                setCategoriaSelecionada('');
              }}
              className="w-full rounded-lg bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring-[#7D1F2C]"
            >
              <option value="">Todas as categorias</option>
              {categoriasUnicas.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Tipo
            </label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as any)}
              className="w-full rounded-lg bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring-[#7D1F2C]"
            >
              <option value="all">Todos</option>
              <option value="entrada">Receitas</option>
              <option value="saida">Despesas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Período
            </label>
            <select
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring-[#7D1F2C]"
            >
              <option value="">Todos os meses</option>
              {mesesUnicos.map(mes => (
                <option key={mes} value={mes}>
                  {getMonthName(mes)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchData}
              className="w-full px-4 py-2 bg-gray-500/15 text-white/80 rounded-lg hover:bg-gray-500/20 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Ação de Recategorização */}
      {selectedIds.size > 0 && filtroCategoriaPai && (
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-white/80 mb-2">
                Mover {selectedIds.size} lançamento(s) para subcategoria:
              </label>
              <select
                value={categoriaSelecionada}
                onChange={(e) => setCategoriaSelecionada(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring-[#7D1F2C]"
              >
                <option value="">Selecione a subcategoria de destino...</option>
                {subcategorias.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {'  '.repeat(sub.nivel - 1)}↳ {sub.nome}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRecategorizar}
              disabled={!categoriaSelecionada || processando}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 ${
                !categoriaSelecionada || processando
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-[#7D1F2C] text-white hover:bg-[#6a1a25]'
              }`}
            >
              {processando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  Recategorizar
                </>
              )}
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-3 text-sm text-white/80">
              <strong>Total selecionado:</strong> {formatCurrency(totalSelecionado)}
            </div>
          )}
        </div>
      )}

      {/* Lista de Lançamentos */}
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        <div className="p-4 border-b border-white/10">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-white">
              Lançamentos Encontrados ({lancamentosFiltrados.length})
            </h4>
            {lancamentosFiltrados.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-sm text-[#7D1F2C] hover:text-[#6a1a25] font-medium"
              >
                {selectedIds.size === lancamentosFiltrados.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            )}
          </div>
        </div>

        {lancamentosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Tag className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {lancamentos.length === 0
                ? 'Nenhum lançamento em categoria PAI'
                : 'Nenhum lançamento com os filtros aplicados'
              }
            </h3>
            <p className="text-white/50">
              {lancamentos.length === 0
                ? 'Todos os lançamentos estão corretamente classificados em subcategorias!'
                : 'Tente ajustar os filtros para ver mais resultados.'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === lancamentosFiltrados.length && lancamentosFiltrados.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-500/40 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase">Categoria PAI</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/50 uppercase">Centro Custo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-white/50 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {lancamentosFiltrados.map(lancamento => (
                  <tr
                    key={lancamento.id}
                    className={`hover:bg-white/5 transition-colors ${
                      selectedIds.has(lancamento.id) ? 'bg-[#7D1F2C]/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lancamento.id)}
                        onChange={() => toggleSelection(lancamento.id)}
                        className="rounded border-gray-500/40 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                      {dayjs(lancamento.data).format('DD/MM/YYYY')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        lancamento.tipo === 'entrada'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {lancamento.categoria_pai_nome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/80 max-w-xs truncate">
                      {lancamento.descricao || '-'}
                      {lancamento.origem && (
                        <span className="ml-2 text-xs text-white/50">({lancamento.origem})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/60">
                      {lancamento.centro_custo_nome || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${
                        lancamento.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(lancamento.valor)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecategorizarLancamentos;
