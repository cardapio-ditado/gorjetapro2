import React, { useState, useEffect } from 'react';
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { 
  Calendar,
  Download,
  Filter,
  BarChart3,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Users,
  Settings,
  Package
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface RelatorioSolicitacoes {
  periodo: string;
  total_solicitacoes: number;
  solicitacoes_aprovadas: number;
  solicitacoes_rejeitadas: number;
  solicitacoes_concluidas: number;
  valor_total_estimado: number;
  valor_total_orcado: number;
  tempo_medio_aprovacao: number;
  tempo_medio_execucao: number;
}

interface SolicitacoesPorTipo {
  tipo_nome: string;
  tipo_categoria: string;
  total: number;
  aprovadas: number;
  rejeitadas: number;
  valor_total: number;
  tempo_medio: number;
}

interface SolicitacoesPorSetor {
  setor: string;
  total: number;
  pendentes: number;
  aprovadas: number;
  concluidas: number;
  valor_medio: number;
}

const RelatoriosSolicitacoes: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dados dos relatórios
  const [relatorioSolicitacoes, setRelatorioSolicitacoes] = useState<RelatorioSolicitacoes[]>([]);
  const [solicitacoesPorTipo, setSolicitacoesPorTipo] = useState<SolicitacoesPorTipo[]>([]);
  const [solicitacoesPorSetor, setSolicitacoesPorSetor] = useState<SolicitacoesPorSetor[]>([]);
  
  // Filtros
  const [periodoInicial, setPeriodoInicial] = useState(dayjs().subtract(6, 'month').format('YYYY-MM-DD'));
  const [periodoFinal, setPeriodoFinal] = useState(dayjs().format('YYYY-MM-DD'));
  const [agrupamento, setAgrupamento] = useState<'mensal' | 'trimestral'>('mensal');

  const COLORS = ['#7D1F2C', '#D4AF37', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#ea580c', '#0891b2'];

  useEffect(() => {
    fetchRelatorios();
  }, [periodoInicial, periodoFinal, agrupamento]);

  const fetchRelatorios = async () => {
    try {
      setLoading(true);
      setError(null);

      await Promise.all([
        fetchRelatorioSolicitacoes(),
        fetchSolicitacoesPorTipo(),
        fetchSolicitacoesPorSetor()
      ]);

    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatorioSolicitacoes = async () => {
    try {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select('*')
        .gte('data_solicitacao', periodoInicial)
        .lte('data_solicitacao', periodoFinal);

      if (error) throw error;

      // Processar dados por período
      const periodos: { [key: string]: {
        total: number;
        aprovadas: number;
        rejeitadas: number;
        concluidas: number;
        valor_estimado: number;
        valor_orcado: number;
        tempos_aprovacao: number[];
        tempos_execucao: number[];
      } } = {};

      (data || []).forEach(sol => {
        const data = dayjs(sol.data_solicitacao);
        let periodo = '';
        
        if (agrupamento === 'mensal') {
          periodo = data.format('MM/YYYY');
        } else {
          const trimestre = Math.ceil(data.month() / 3);
          periodo = `T${trimestre}/${data.year()}`;
        }

        if (!periodos[periodo]) {
          periodos[periodo] = {
            total: 0,
            aprovadas: 0,
            rejeitadas: 0,
            concluidas: 0,
            valor_estimado: 0,
            valor_orcado: 0,
            tempos_aprovacao: [],
            tempos_execucao: []
          };
        }

        periodos[periodo].total += 1;
        
        if (sol.status === 'aprovado' || sol.status === 'em_execucao' || sol.status === 'concluido') {
          periodos[periodo].aprovadas += 1;
          
          if (sol.data_aprovacao) {
            const tempoAprovacao = dayjs(sol.data_aprovacao).diff(dayjs(sol.data_solicitacao), 'hours');
            periodos[periodo].tempos_aprovacao.push(tempoAprovacao);
          }
        }
        
        if (sol.status === 'rejeitado') {
          periodos[periodo].rejeitadas += 1;
        }
        
        if (sol.status === 'concluido') {
          periodos[periodo].concluidas += 1;
          
          if (sol.data_conclusao) {
            const tempoExecucao = dayjs(sol.data_conclusao).diff(dayjs(sol.data_solicitacao), 'hours');
            periodos[periodo].tempos_execucao.push(tempoExecucao);
          }
        }

        periodos[periodo].valor_estimado += sol.valor_estimado || 0;
        periodos[periodo].valor_orcado += sol.valor_total_orcado || 0;
      });

      // Converter para array
      const relatorioArray: RelatorioSolicitacoes[] = Object.entries(periodos)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periodo, dados]) => ({
          periodo,
          total_solicitacoes: dados.total,
          solicitacoes_aprovadas: dados.aprovadas,
          solicitacoes_rejeitadas: dados.rejeitadas,
          solicitacoes_concluidas: dados.concluidas,
          valor_total_estimado: dados.valor_estimado,
          valor_total_orcado: dados.valor_orcado,
          tempo_medio_aprovacao: dados.tempos_aprovacao.length > 0 
            ? dados.tempos_aprovacao.reduce((sum, t) => sum + t, 0) / dados.tempos_aprovacao.length
            : 0,
          tempo_medio_execucao: dados.tempos_execucao.length > 0
            ? dados.tempos_execucao.reduce((sum, t) => sum + t, 0) / dados.tempos_execucao.length
            : 0
        }));

      setRelatorioSolicitacoes(relatorioArray);
    } catch (err) {
      console.error('Error fetching report data:', err);
      setRelatorioSolicitacoes([]);
    }
  };

  const fetchSolicitacoesPorTipo = async () => {
    try {
      const { data: solicitacoesData, error: solError } = await supabase
        .from('vw_solicitacoes_completas')
        .select('*')
        .gte('data_solicitacao', periodoInicial)
        .lte('data_solicitacao', periodoFinal);

      if (solError) throw solError;

      // Agrupar por tipo
      const tiposMap: { [key: string]: {
        tipo_nome: string;
        tipo_categoria: string;
        total: number;
        aprovadas: number;
        rejeitadas: number;
        valor_total: number;
        tempos: number[];
      } } = {};

      (solicitacoesData || []).forEach(sol => {
        const chave = sol.tipo_nome || 'Sem Tipo';
        
        if (!tiposMap[chave]) {
          tiposMap[chave] = {
            tipo_nome: sol.tipo_nome || 'Sem Tipo',
            tipo_categoria: sol.tipo_categoria || 'outros',
            total: 0,
            aprovadas: 0,
            rejeitadas: 0,
            valor_total: 0,
            tempos: []
          };
        }

        tiposMap[chave].total += 1;
        
        if (['aprovado', 'em_execucao', 'concluido'].includes(sol.status)) {
          tiposMap[chave].aprovadas += 1;
        }
        
        if (sol.status === 'rejeitado') {
          tiposMap[chave].rejeitadas += 1;
        }

        tiposMap[chave].valor_total += sol.valor_estimado || sol.valor_total_orcado || 0;

        if (sol.data_conclusao) {
          const tempo = dayjs(sol.data_conclusao).diff(dayjs(sol.data_solicitacao), 'days');
          tiposMap[chave].tempos.push(tempo);
        }
      });

      // Converter para array
      const tiposArray: SolicitacoesPorTipo[] = Object.values(tiposMap)
        .map(dados => ({
          tipo_nome: dados.tipo_nome,
          tipo_categoria: dados.tipo_categoria,
          total: dados.total,
          aprovadas: dados.aprovadas,
          rejeitadas: dados.rejeitadas,
          valor_total: dados.valor_total,
          tempo_medio: dados.tempos.length > 0 
            ? dados.tempos.reduce((sum, t) => sum + t, 0) / dados.tempos.length
            : 0
        }))
        .sort((a, b) => b.total - a.total);

      setSolicitacoesPorTipo(tiposArray);
    } catch (err) {
      console.error('Error fetching type data:', err);
      setSolicitacoesPorTipo([]);
    }
  };

  const fetchSolicitacoesPorSetor = async () => {
    try {
      const { data, error } = await supabase
        .from('solicitacoes')
        .select('setor_solicitante, status, valor_estimado, valor_total_orcado')
        .gte('data_solicitacao', periodoInicial)
        .lte('data_solicitacao', periodoFinal);

      if (error) throw error;

      // Agrupar por setor
      const setoresMap: { [key: string]: {
        total: number;
        pendentes: number;
        aprovadas: number;
        concluidas: number;
        valores: number[];
      } } = {};

      (data || []).forEach(sol => {
        const setor = sol.setor_solicitante || 'Sem Setor';
        
        if (!setoresMap[setor]) {
          setoresMap[setor] = {
            total: 0,
            pendentes: 0,
            aprovadas: 0,
            concluidas: 0,
            valores: []
          };
        }

        setoresMap[setor].total += 1;

        if (['enviado', 'em_analise'].includes(sol.status)) {
          setoresMap[setor].pendentes += 1;
        }
        
        if (['aprovado', 'em_execucao'].includes(sol.status)) {
          setoresMap[setor].aprovadas += 1;
        }
        
        if (sol.status === 'concluido') {
          setoresMap[setor].concluidas += 1;
        }

        const valor = sol.valor_estimado || sol.valor_total_orcado || 0;
        if (valor > 0) {
          setoresMap[setor].valores.push(valor);
        }
      });

      // Converter para array
      const setoresArray: SolicitacoesPorSetor[] = Object.entries(setoresMap)
        .map(([setor, dados]) => ({
          setor,
          total: dados.total,
          pendentes: dados.pendentes,
          aprovadas: dados.aprovadas,
          concluidas: dados.concluidas,
          valor_medio: dados.valores.length > 0 
            ? dados.valores.reduce((sum, v) => sum + v, 0) / dados.valores.length
            : 0
        }))
        .sort((a, b) => b.total - a.total);

      setSolicitacoesPorSetor(setoresArray);
    } catch (err) {
      console.error('Error fetching sector data:', err);
      setSolicitacoesPorSetor([]);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const exportarRelatorio = () => {
    console.log('Exportar relatório de solicitações');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Relatórios de Solicitações</h3>
        <button
          onClick={exportarRelatorio}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
        >
          <Download className="w-4 h-4 inline mr-2" />
          Exportar Relatório
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg shadow-sm border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Período Inicial
            </label>
            <input
              type="date"
              value={periodoInicial}
              onChange={(e) => setPeriodoInicial(e.target.value)}
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Período Final
            </label>
            <input
              type="date"
              value={periodoFinal}
              onChange={(e) => setPeriodoFinal(e.target.value)}
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Agrupamento
            </label>
            <select
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as any)}
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchRelatorios}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Evolução das Solicitações */}
          {relatorioSolicitacoes.length > 0 && (
            <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
              <h4 className="text-lg font-medium text-white mb-4">
                Evolução das Solicitações
              </h4>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={relatorioSolicitacoes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="periodo" />
                    <YAxis />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="total_solicitacoes" fill="#2563eb" name="Total" />
                    <Bar dataKey="solicitacoes_aprovadas" fill="#059669" name="Aprovadas" />
                    <Bar dataKey="solicitacoes_concluidas" fill="#7D1F2C" name="Concluídas" />
                    <Bar dataKey="solicitacoes_rejeitadas" fill="#dc2626" name="Rejeitadas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Distribuição por Tipo e Setor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Por Tipo */}
            {solicitacoesPorTipo.length > 0 && (
              <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
                <h4 className="text-lg font-medium text-white mb-4">
                  Solicitações por Tipo
                </h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={solicitacoesPorTipo}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="total"
                      >
                        {solicitacoesPorTipo.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {solicitacoesPorTipo.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        <span className="text-sm text-white/70">{item.tipo_nome}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-white">{item.total}</span>
                        <div className="text-xs text-white/50">
                          {formatCurrency(item.valor_total)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Por Setor */}
            {solicitacoesPorSetor.length > 0 && (
              <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
                <h4 className="text-lg font-medium text-white mb-4">
                  Solicitações por Setor
                </h4>
                <div className="space-y-3">
                  {solicitacoesPorSetor.map((setor, index) => (
                    <div key={index} className="p-3 bg-white/5 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-white">{setor.setor}</span>
                        <span className="text-lg font-bold text-[#7D1F2C]">{setor.total}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <div className="text-yellow-400 font-medium">{setor.pendentes}</div>
                          <div className="text-white/50">Pendentes</div>
                        </div>
                        <div className="text-center">
                          <div className="text-green-400 font-medium">{setor.aprovadas}</div>
                          <div className="text-white/50">Aprovadas</div>
                        </div>
                        <div className="text-center">
                          <div className="text-blue-400 font-medium">{setor.concluidas}</div>
                          <div className="text-white/50">Concluídas</div>
                        </div>
                      </div>
                      {setor.valor_medio > 0 && (
                        <div className="mt-2 text-center">
                          <span className="text-xs text-white/50">Valor médio: </span>
                          <span className="text-xs font-medium text-white/80">
                            {formatCurrency(setor.valor_medio)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mensagem quando não há dados */}
          {relatorioSolicitacoes.length === 0 && solicitacoesPorTipo.length === 0 && (
            <div className="text-center py-12">
              <BarChart3 className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhum dado encontrado</h3>
              <p className="text-white/50">
                Não há solicitações para o período selecionado.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RelatoriosSolicitacoes;