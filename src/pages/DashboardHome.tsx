import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  AlertTriangle, ArrowUpRight, ArrowDownRight,
  Sparkles, Brain, BarChart3, Activity, Calendar, Target
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { KPICard, SectionCard } from '../components/ui';
import { PageLayout } from '../components/layout';

const COLORS = ['#7D1F2C', '#D4AF37', '#3B82F6', '#10B981'];

interface MetricCard {
  title: string; value: string; change: number;
  changeLabel: string; icon: React.ElementType;
  color: string; trend: 'up' | 'down';
}

interface AIInsight {
  type: 'success' | 'warning' | 'info';
  title: string; message: string; action?: string;
}

const DashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState<any[]>([]);
  const [metricsValues, setMetricsValues] = useState({ receita: 0, despesas: 0, saldo: 0, itens: 0 });

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const dataInicio = new Date(); dataInicio.setDate(1);
      const dataFim = new Date();

      const { data: fluxoCaixa } = await supabase
        .from('fluxo_caixa').select('tipo, valor, data, categoria_id')
        .gte('data', dataInicio.toISOString().split('T')[0])
        .lte('data', dataFim.toISOString().split('T')[0]);

      const entradas = fluxoCaixa?.filter(f => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0) || 0;
      const saidas   = fluxoCaixa?.filter(f => f.tipo === 'saida').reduce((s, f) => s + Number(f.valor), 0) || 0;
      const saldo    = entradas - saidas;

      const { data: saldosEstoque } = await supabase
        .from('saldos_estoque').select('quantidade_atual, itens_estoque!inner(id, nome, estoque_minimo)');
      const itensAbaixoMinimo = saldosEstoque?.filter((s: any) =>
        s.quantidade_atual < (s.itens_estoque?.estoque_minimo || 0)
      ).length || 0;

      setMetricsValues({ receita: entradas, despesas: saidas, saldo, itens: itensAbaixoMinimo });

      setMetrics([
        { title: 'Receita do Mês',   value: `R$ ${entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, change: 12.5,  changeLabel: 'vs mês anterior', icon: DollarSign,    color: 'from-green-500 to-emerald-600', trend: 'up'  },
        { title: 'Despesas do Mês',  value: `R$ ${saidas.toLocaleString('pt-BR',   { minimumFractionDigits: 2 })}`, change: -8.2,  changeLabel: 'vs mês anterior', icon: TrendingDown,  color: 'from-red-500 to-rose-600',     trend: 'down'},
        { title: 'Saldo Atual',      value: `R$ ${saldo.toLocaleString('pt-BR',    { minimumFractionDigits: 2 })}`, change: 15.3,  changeLabel: 'crescimento',     icon: TrendingUp,    color: 'from-blue-500 to-indigo-600',  trend: 'up'  },
        { title: 'Itens em Falta',   value: `${itensAbaixoMinimo}`,                                                  change: -20,   changeLabel: 'atenção',         icon: AlertTriangle, color: 'from-orange-500 to-amber-600', trend: 'down'},
      ]);

      const aiInsights: AIInsight[] = [];
      if (itensAbaixoMinimo > 0) aiInsights.push({ type: 'warning', title: 'Alerta de Estoque', message: `${itensAbaixoMinimo} itens estão abaixo do estoque mínimo.`, action: '/advanced-inventory?tab=2' });
      if (saldo > 0) aiInsights.push({ type: 'success', title: 'Fluxo de Caixa Positivo', message: `Fluxo de caixa positivo este mês.`, action: '/finance?tab=0' });
      setInsights(aiInsights);

      const ultimosDias = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      });
      setFinancialData(ultimosDias.map(dia => ({
        data: new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        entradas: fluxoCaixa?.filter(f => f.data === dia && f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0) || 0,
        saidas:   fluxoCaixa?.filter(f => f.data === dia && f.tipo === 'saida').reduce((s, f) => s + Number(f.valor), 0) || 0,
        saldo:    (fluxoCaixa?.filter(f => f.data === dia && f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor), 0) || 0)
                - (fluxoCaixa?.filter(f => f.data === dia && f.tipo === 'saida').reduce((s, f) => s + Number(f.valor), 0) || 0),
      })));
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]" />
    </div>
  );

  return (
    <PageLayout
      title="Dashboard Principal"
      description="Visão geral do negócio em tempo real"
      icon={BarChart3}
      breadcrumb={['Início', 'Dashboard']}
      variant="wine"
      actions={
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-white" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <Brain className="w-4 h-4" />
          <span className="font-sans font-semibold text-sm">IA Ativa</span>
        </div>
      }
    >
      <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          label="Receita do Mês"
          value={metricsValues.receita}
          format="currency"
          variation={12.5}
          icon={DollarSign}
          trend="up"
        />
        <KPICard
          label="Despesas do Mês"
          value={metricsValues.despesas}
          format="currency"
          variation={-8.2}
          icon={TrendingDown}
          trend="down"
        />
        <KPICard
          label="Saldo Atual"
          value={metricsValues.saldo}
          format="currency"
          variation={15.3}
          icon={TrendingUp}
          trend="up"
        />
        <KPICard
          label="Itens em Falta"
          value={metricsValues.itens}
          format="number"
          variation={-20}
          icon={AlertTriangle}
          trend="neutral"
        />
      </div>

      {insights.length > 0 && (
        <SectionCard
          title="Insights Inteligentes"
          action={
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-wine to-gold rounded-lg">
              <Sparkles className="w-4 h-4 text-white" />
              <span className="font-sans text-xs font-semibold text-white">IA</span>
            </div>
          }
          className="bg-gradient-to-br from-wine/[0.03] to-gold/[0.03]"
        >
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className={`p-4 rounded-lg border-l-4 ${
                insight.type === 'success' ? 'bg-success/10 border-success' :
                insight.type === 'warning' ? 'bg-warning/10 border-warning' :
                'bg-info/10 border-info'
              }`}>
                <h3 className="font-sans font-semibold text-text-primary mb-1">{insight.title}</h3>
                <p className="font-sans text-sm text-text-secondary">{insight.message}</p>
                {insight.action && (
                  <button
                    onClick={() => navigate(insight.action!)}
                    className="mt-2 font-sans text-sm font-semibold text-wine hover:text-wine-dark transition-colors"
                  >
                    Ver Detalhes →
                  </button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Fluxo de Caixa (7 dias)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={financialData}>
              <defs>
                <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="data" stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1d2e', border: 'none', borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="entradas" stroke="#10B981" fillOpacity={1} fill="url(#gE)" />
              <Area type="monotone" dataKey="saidas"   stroke="#EF4444" fillOpacity={1} fill="url(#gS)" />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Saldo Diário">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={financialData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="data" stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1d2e', border: 'none', borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="saldo" radius={[8, 8, 0, 0]}>
                {financialData.map((e, i) => (
                  <Cell key={i} fill={e.saldo >= 0 ? '#10B981' : '#EF4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Ações Rápidas">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Novo Lançamento',   path: '/finance?tab=0',             color: 'from-success to-success', icon: DollarSign  },
            { label: 'Consultar Estoque', path: '/advanced-inventory?tab=2',  color: 'from-wine to-wine-dark',  icon: Package     },
            { label: 'Movimentações',     path: '/advanced-inventory?tab=8',  color: 'from-wine to-gold',       icon: Target      },
            { label: 'Ver Relatórios',    path: '/finance?tab=10',            color: 'from-gold to-gold-dark',  icon: BarChart3   },
          ].map((a, i) => (
            <button key={i} onClick={() => navigate(a.path)}
              className="p-4 rounded-lg border border-white/10 hover:border-wine/30 transition-all duration-300 hover:shadow-wine group text-left">
              <div className={`p-3 bg-gradient-to-br ${a.color} rounded-lg mb-3 group-hover:scale-110 transition-transform duration-300 w-fit text-white`}>
                <a.icon className="w-6 h-6 text-white" />
              </div>
              <p className="font-sans text-sm font-semibold text-white">{a.label}</p>
            </button>
          ))}
        </div>
      </SectionCard>
      </div>
    </PageLayout>
  );
};

export default DashboardHome;
