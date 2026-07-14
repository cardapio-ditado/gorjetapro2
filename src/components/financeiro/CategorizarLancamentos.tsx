import React, { useState, useEffect } from 'react';
import { Tag, Check, X, AlertCircle, Filter, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import { formatCurrency } from '../../utils/reportGenerator';

interface LancamentoSemCategoria {
  id: string;
  tipo: string;
  tipo_nome: string;
  valor: number;
  data: string;
  descricao: string;
  centro_custo_nome?: string;
  forma_pagamento_nome?: string;
  conta_bancaria_banco?: string;
  conta_bancaria_tipo?: string;
  origem?: string;
  observacoes?: string;
  criado_por_nome?: string;
  ano: number;
  mes: number;
}

interface Categoria {
  id: string;
  nome: string;
  caminho_completo: string;
  tipo: string;
}

interface ResumoMes {
  ano: number;
  mes: number;
  tipo: string;
  tipo_nome: string;
  quantidade: number;
  valor_total: number;
}

const CategorizarLancamentos: React.FC = () => {
  const [lancamentos, setLancamentos] = useState<LancamentoSemCategoria[]>([]);
  const [resumo, setResumo] = useState<ResumoMes[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'all' | 'entrada' | 'saida'>('all');
  const [filtroMes, setFiltroMes] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [lancamentosRes, resumoRes, categoriasRes] = await Promise.all([
        supabase.from('vw_fluxo_caixa_sem_categoria').select('*'),
        supabase.from('vw_resumo_lancamentos_sem_categoria').select('*'),
        supabase.from('vw_categoria_tree').select('id, nome, caminho_completo, tipo').order('caminho_completo')
      ]);

      if (lancamentosRes.error) throw lancamentosRes.error;
      if (resumoRes.error) throw resumoRes.error;
      if (categoriasRes.error) throw categoriasRes.error;

      setLancamentos(lancamentosRes.data || []);
      setResumo(resumoRes.data || []);
      setCategorias(categoriasRes.data || []);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorizar = async () => {
    if (!categoriaSelecionada || selectedIds.size === 0) {
      alert('Selecione uma categoria e pelo menos um lançamento');
      return;
    }

    try {
      setProcessando(true);

      const { error } = await supabase.rpc('categorizar_lancamentos_lote', {
        p_lancamento_ids: Array.from(selectedIds),
        p_categoria_id: categoriaSelecionada
      });

      if (error) throw error;

      alert(`${selectedIds.size} lançamento(s) categorizado(s) com sucesso!`);
      setSelectedIds(new Set());
      setCategoriaSelecionada('');
      fetchData();
    } catch (error) {
      console.error('Erro ao categorizar:', error);
      alert('Erro ao categorizar lançamentos');
    } finally {
      setProcessando(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === lancamentosFiltrados.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(lancamentosFiltrados.map(l => l.id)));
    }
  };

  const lancamentosFiltrados = lancamentos.filter(l => {
    if (filtroTipo !== 'all' && l.tipo !== filtroTipo) return false;
    if (filtroMes) {
      const [ano, mes] = filtroMes.split('-');
      if (l.ano !== parseInt(ano) || l.mes !== parseInt(mes)) return false;
    }
    return true;
  });

  const valorTotalSelecionado = lancamentosFiltrados
    .filter(l => selectedIds.has(l.id))
    .reduce((sum, l) => sum + parseFloat(l.valor.toString()), 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-orange-500/8 border-l-4 border-orange-500 p-4 rounded-lg border border-orange-500/30">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5 mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">
              Lançamentos Não Classificados
            </h3>
            <p className="text-sm text-white/80 mb-3">
              Existem lançamentos no fluxo de caixa que não possuem categoria associada.
              Esses lançamentos aparecem no DRE como "Não Classificados".
              Use esta ferramenta para categorizá-los corretamente.
            </p>
          </div>
        </div>
      </div>

      {/* Resumo por Mês */}
      {resumo.length > 0 && (
        <div className="bg-[#12141f] rounded-lg border border-white/10 p-4">
          <h4 className="font-semibold text-white mb-3">Resumo por Período</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumo.map((r, idx) => (
              <div key={idx} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {dayjs(`${r.ano}-${r.mes}-01`).format('MMMM/YYYY')}
                    </p>
                    <p className="text-xs text-white/60">{r.tipo_nome}</p>
                  </div>
                  <span className={`text-sm font-bold ${
                    r.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatCurrency(r.valor_total)}
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-1">{r.quantidade} lançamentos</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] rounded-lg border border-white/10 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              <Filter className="w-4 h-4 inline mr-1" />
              Tipo
            </label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as any)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos</option>
              <option value="entrada">Receitas</option>
              <option value="saida">Despesas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Período
            </label>
            <input
              type="month"
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              <Tag className="w-4 h-4 inline mr-1" />
              Categoria para Aplicar
            </label>
            <select
              value={categoriaSelecionada}
              onChange={(e) => setCategoriaSelecionada(e.target.value)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="">Selecione uma categoria...</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.caminho_completo || cat.nome} ({cat.tipo})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ações em Lote */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4 flex justify-between items-center">
          <div>
            <p className="font-semibold text-white">
              {selectedIds.size} lançamento(s) selecionado(s)
            </p>
            <p className="text-sm text-white/60">
              Valor total: {formatCurrency(valorTotalSelecionado)}
            </p>
          </div>
          <button
            onClick={handleCategorizar}
            disabled={!categoriaSelecionada || processando}
            className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {processando ? 'Processando...' : 'Categorizar Selecionados'}
          </button>
        </div>
      )}

      {/* Tabela de Lançamentos */}
      <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left bg-white/5 border-b border-white/10">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === lancamentosFiltrados.length && lancamentosFiltrados.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-white/20"
                  />
                </th>
                <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase">Data</th>
                <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase">Tipo</th>
                <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase">Descrição</th>
                <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase">Valor</th>
                <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {lancamentosFiltrados.map((lancamento) => (
                <tr key={lancamento.id} className="hover:bg-white/5">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lancamento.id)}
                      onChange={() => toggleSelect(lancamento.id)}
                      className="rounded border-white/20"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {dayjs(lancamento.data).format('DD/MM/YYYY')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      lancamento.tipo === 'entrada'
                        ? 'bg-green-900/30 text-green-400'
                        : 'bg-red-900/30 text-red-400'
                    }`}>
                      {lancamento.tipo_nome}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {lancamento.descricao || 'Sem descrição'}
                      </div>
                      {lancamento.observacoes && (
                        <div className="text-xs text-white/50 mt-1">{lancamento.observacoes}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`font-medium ${
                      lancamento.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(lancamento.valor)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-white/60">
                    {lancamento.origem || 'Manual'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lancamentosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <Tag className="w-16 h-16 text-white/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              Nenhum lançamento encontrado
            </h3>
            <p className="text-white/50">
              {lancamentos.length === 0
                ? 'Todos os lançamentos estão categorizados!'
                : 'Nenhum lançamento corresponde aos filtros aplicados.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategorizarLancamentos;
