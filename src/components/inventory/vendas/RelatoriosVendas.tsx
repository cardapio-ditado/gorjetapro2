import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, Package, Target, CheckCircle,
  ArrowLeft, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import dayjs from '../../../lib/dayjs';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface Props { onClose: () => void; }

interface Estatisticas {
  total_importacoes: number;
  total_itens_importados: number;
  taxa_sucesso_media: number;
  total_mapeamentos: number;
  mapeamentos_automaticos: number;
  mapeamentos_manuais: number;
}

const CORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const RelatoriosVendas: React.FC<Props> = ({ onClose }) => {
  const [loading, setLoading]                           = useState(true);
  const [periodo, setPeriodo]                           = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [estatisticas, setEstatisticas]                 = useState<Estatisticas | null>(null);
  const [dadosPorDia, setDadosPorDia]                   = useState<any[]>([]);
  const [dadosMapeamentos, setDadosMapeamentos]         = useState<any[]>([]);
  const [dadosTaxa, setDadosTaxa]                       = useState<any[]>([]);
  const [topProdutos, setTopProdutos]                   = useState<any[]>([]);

  const fetchRelatorios = useCallback(async () => {
    setLoading(true);
    try {
      const inicio: Record<string, string> = {
        week:    dayjs().subtract(7, 'days').format('YYYY-MM-DD'),
        month:   dayjs().subtract(30, 'days').format('YYYY-MM-DD'),
        quarter: dayjs().subtract(90, 'days').format('YYYY-MM-DD'),
        year:    dayjs().subtract(365, 'days').format('YYYY-MM-DD'),
      };
      const dataInicio = inicio[periodo];
      const dataFim    = dayjs().format('YYYY-MM-DD');

      const [{ data: importacoes }, { data: mapeamentos }, { data: itensImportacao }] = await Promise.all([
        supabase.from('importacoes_vendas').select('*').gte('criado_em', dataInicio).lte('criado_em', dataFim),
        supabase.from('mapeamento_itens_vendas').select('*'),
        supabase.from('itens_importacao_vendas').select('nome_produto_externo, item_estoque_id').eq('status', 'processado').gte('criado_em', dataInicio),
      ]);

      // Estatísticas gerais
      const totalLinhas  = (importacoes || []).reduce((a, i) => a + (i.total_linhas || 0), 0);
      const totalSucesso = (importacoes || []).reduce((a, i) => a + (i.total_sucesso || 0), 0);
      setEstatisticas({
        total_importacoes:      importacoes?.length || 0,
        total_itens_importados: totalLinhas,
        taxa_sucesso_media:     totalLinhas > 0 ? (totalSucesso / totalLinhas) * 100 : 0,
        total_mapeamentos:      mapeamentos?.length || 0,
        mapeamentos_automaticos: (mapeamentos || []).filter(m => m.tipo_mapeamento === 'automatico').length,
        mapeamentos_manuais:     (mapeamentos || []).filter(m => m.tipo_mapeamento === 'manual').length,
      });

      // Agrupamento por dia
      const porDia: Record<string, any> = {};
      (importacoes || []).forEach(imp => {
        const dia = dayjs(imp.criado_em).format('DD/MM');
        if (!porDia[dia]) porDia[dia] = { dia, sucesso: 0, erro: 0 };
        porDia[dia].sucesso += imp.total_sucesso || 0;
        porDia[dia].erro    += imp.total_erro || 0;
      });
      setDadosPorDia(Object.values(porDia).slice(-14));

      // Mapeamentos por origem
      const porOrigem: Record<string, number> = {};
      (mapeamentos || []).forEach(m => {
        const o = m.origem || 'Sem origem';
        porOrigem[o] = (porOrigem[o] || 0) + 1;
      });
      setDadosMapeamentos(Object.entries(porOrigem).map(([origem, total]) => ({ origem, total })));

      // Taxa de sucesso por importação
      setDadosTaxa(
        (importacoes || []).slice(-10).map(imp => ({
          data: dayjs(imp.criado_em).format('DD/MM'),
          taxa: imp.total_linhas > 0 ? (imp.total_sucesso / imp.total_linhas) * 100 : 0,
        }))
      );

      // Top produtos
      const contagem: Record<string, number> = {};
      (itensImportacao || []).forEach(i => {
        contagem[i.nome_produto_externo] = (contagem[i.nome_produto_externo] || 0) + 1;
      });
      setTopProdutos(
        Object.entries(contagem).sort(([, a], [, b]) => b - a).slice(0, 10)
          .map(([nome, total]) => ({ nome, total }))
      );
    } catch (err) {
      console.error('Erro ao buscar relatórios:', err);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { fetchRelatorios(); }, [fetchRelatorios]);

  const tooltipStyle = { backgroundColor: '#1a1c2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d0f1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-800 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-6 h-6" /> Relatórios e Análises
              </h2>
              <p className="text-purple-200 text-sm mt-0.5">Insights sobre importações e mapeamentos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select value={periodo} onChange={e => setPeriodo(e.target.value as any)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30">
              <option value="week" className="bg-[#1a1c2e]">Última semana</option>
              <option value="month" className="bg-[#1a1c2e]">Último mês</option>
              <option value="quarter" className="bg-[#1a1c2e]">Último trimestre</option>
              <option value="year" className="bg-[#1a1c2e]">Último ano</option>
            </select>
            <button onClick={fetchRelatorios} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors" title="Atualizar">
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-10 h-10 border-b-2 border-purple-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPI Cards */}
              {estatisticas && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Importações',      value: String(estatisticas.total_importacoes),             sub: 'No período',     icon: Package,      color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30' },
                    { label: 'Taxa de Sucesso',   value: `${estatisticas.taxa_sucesso_media.toFixed(1)}%`,   sub: 'Média geral',    icon: TrendingUp,   color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
                    { label: 'Mapeamentos',       value: String(estatisticas.total_mapeamentos),             sub: 'Cadastrados',    icon: Target,       color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
                    { label: 'Itens Processados', value: String(estatisticas.total_itens_importados),        sub: 'Total importado',icon: CheckCircle,  color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
                  ].map(k => {
                    const Icon = k.icon;
                    return (
                      <div key={k.label} className={`p-5 rounded-xl border ${k.bg}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm text-white/50 mb-1">{k.label}</p>
                            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
                            <p className="text-xs text-white/30 mt-1">{k.sub}</p>
                          </div>
                          <Icon className={`w-6 h-6 ${k.color} opacity-60`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Importações por dia */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" /> Importações por Dia
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dadosPorDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#888' }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#888' }} />
                      <Bar dataKey="sucesso" fill="#10B981" name="Sucesso" radius={[4,4,0,0]} />
                      <Bar dataKey="erro"    fill="#EF4444" name="Erro"    radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Taxa de sucesso */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" /> Taxa de Sucesso
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dadosTaxa}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#888' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#888' }} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#888' }} />
                      <Line type="monotone" dataKey="taxa" stroke="#10B981" strokeWidth={2} name="Taxa (%)" dot={{ fill: '#10B981', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Mapeamentos por origem */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-400" /> Mapeamentos por Origem
                  </h3>
                  {dadosMapeamentos.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={dadosMapeamentos} cx="50%" cy="50%" outerRadius={80}
                          dataKey="total" nameKey="origem"
                          label={({ origem, percent }) => `${origem}: ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {dadosMapeamentos.map((_, i) => (
                            <Cell key={i} fill={CORES[i % CORES.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-white/30 text-sm">Sem dados</div>
                  )}
                </div>

                {/* Top produtos */}
                <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4 text-orange-400" /> Top 10 Produtos Importados
                  </h3>
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                    {topProdutos.length === 0 ? (
                      <p className="text-white/30 text-sm text-center py-8">Sem dados no período</p>
                    ) : topProdutos.map((produto, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate mb-1">{produto.nome}</p>
                          <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div className="bg-gradient-to-r from-orange-500 to-orange-400 h-1.5 rounded-full"
                              style={{ width: `${(produto.total / topProdutos[0].total) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-sm font-bold text-white/80 w-8 text-right tabular-nums">{produto.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Distribuição de mapeamentos */}
              {estatisticas && estatisticas.total_mapeamentos > 0 && (
                <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
                  <h3 className="text-sm font-semibold text-white/80 mb-4">Distribuição de Mapeamentos</h3>
                  <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: 'Manuais', value: estatisticas.mapeamentos_manuais, color: 'from-blue-500 to-blue-400', textColor: 'text-blue-400' },
                      { label: 'Automáticos (IA)', value: estatisticas.mapeamentos_automaticos, color: 'from-purple-500 to-purple-400', textColor: 'text-purple-400' },
                    ].map(m => (
                      <div key={m.label}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-white/50">{m.label}</span>
                          <span className={`text-lg font-bold ${m.textColor}`}>{m.value}</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-2.5">
                          <div className={`bg-gradient-to-r ${m.color} h-2.5 rounded-full`}
                            style={{ width: `${(m.value / estatisticas.total_mapeamentos) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2.5 border border-white/20 text-white/70 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default RelatoriosVendas;