import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import {
  Users,
  Calendar,
  FileText,
  BarChart3,
  Plus,
  Search,
  Filter,
  Download,
  UserPlus,
  CalendarDays,
  Award,
  Clock,
  Target,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  User,
  Briefcase,
  Settings,
  MessageSquare,
  Brain,
  ClipboardCheck,
  Rocket,
  CalendarClock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { testConnection } from '../lib/supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import FuncoesRH from '../components/hr/FuncoesRH';
import { KPICard, SectionCard } from '../components/ui';
import { PageLayout } from '../components/layout';
import ColaboradoresRH from '../components/hr/ColaboradoresRH';
import EscalasTrabalho from '../components/hr/EscalasTrabalho';
import FeriasColaboradores from '../components/hr/FeriasColaboradores';
import OcorrenciasColaborador from '../components/hr/OcorrenciasColaborador';
import ExtrasFreelancers from '../components/hr/ExtrasFreelancers';
import ConfiguracoesRH from '../components/hr/ConfiguracoesRH';
import RelatoriosRH from '../components/hr/RelatoriosRH';
import GorjetaGarcons from '../components/hr/GorjetaGarcons';
import ProcessarConsumoExcel from '../components/hr/ProcessarConsumoExcel';
import ChatFinanceiroIA from '../components/financeiro/ChatFinanceiroIA';
import AvaliacoesDesempenho from '../components/rh/AvaliacoesDesempenho';
import Onboarding from '../components/rh/Onboarding';
import PerfilDISC from '../components/rh/PerfilDISC';
import HistoricoCarreira from '../components/rh/HistoricoCarreira';
import DatasMarcos from '../components/rh/DatasMarcos';

interface IndicadoresRH {
  colaboradores_ativos: number;
  colaboradores_inativos: number;
  total_colaboradores: number;
  escalas_mes_atual: number;
  setores_ativos: number;
  colaboradores_ferias: number;
  ocorrencias_mes: number;
  comissoes_mes: number;
  extras_mes: number;
  colaboradores_sem_folga_7_dias: number;
}

const Staff: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [indicadores, setIndicadores] = useState<IndicadoresRH | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChatIA, setShowChatIA] = useState(false);
  const [showProcessarConsumo, setShowProcessarConsumo] = useState(false);

  const tabTitles = [
    'Colaboradores',
    'Escalas',
    'Férias',
    'Ocorrências',
    'Extras/Freelancers',
    'Funções',
    'Configurações',
    'Relatórios',
    'Gorjetas',
    'Avaliações',
    'Onboarding',
    'Perfil DISC',
    'Carreira',
    'Marcos'
  ];

  const tabIcons = [
    Users,
    Calendar,
    CalendarDays,
    AlertTriangle,
    UserPlus,
    Briefcase,
    Settings,
    BarChart3,
    Award,
    ClipboardCheck,
    Rocket,
    Target,
    TrendingUp,
    CalendarClock
  ];

  // Sincronizar com URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam !== null) {
      const tabIndex = parseInt(tabParam);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < 14) {
        setSelectedTab(tabIndex);
      }
    }
  }, [location.search]);

  useEffect(() => {
    fetchIndicadores();
  }, []);

  // Handle tab change with URL update
  const handleTabChange = (index: number) => {
    setSelectedTab(index);
    navigate(`/staff?tab=${index}`);
  };

  const fetchIndicadores = async () => {
    try {
      if (!supabase) {
        console.warn('Supabase client not initialized');
        setIndicadores(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('vw_indicadores_rh')
        .select('*')
        .single();

      if (error) {
        console.warn('View vw_indicadores_rh not found, using default indicators');
        setIndicadores(null);
      } else {
        setIndicadores(data);
      }
    } catch (err) {
      console.error('Error fetching HR indicators:', err);
      setIndicadores(null);
    } finally {
      setLoading(false);
    }
  };

  const renderTabContent = (index: number) => {
    switch (index) {
      case 0:
        return <ColaboradoresRH />;
      case 1:
        return <EscalasTrabalho />;
      case 2:
        return <FeriasColaboradores />;
      case 3:
        return <OcorrenciasColaborador />;
      case 4:
        return <ExtrasFreelancers />;
      case 5:
        return <FuncoesRH />;
      case 6:
        return <ConfiguracoesRH />;
      case 7:
        return <RelatoriosRH />;
      case 8:
        return <GorjetaGarcons />;
      case 9:
        return <AvaliacoesDesempenho />;
      case 10:
        return <Onboarding />;
      case 11:
        return <PerfilDISC />;
      case 12:
        return <HistoricoCarreira />;
      case 13:
        return <DatasMarcos />;
      default:
        return (
          <div className="text-center py-8">
            <p className="text-white/40">Módulo em desenvolvimento</p>
          </div>
        );
    }
  };

  return (
    <PageLayout
      title="Recursos Humanos"
      description="Gestão completa de colaboradores e escalas"
      icon={Users}
      breadcrumb={['RH', 'Gestão de Pessoas']}
      variant="wine"
      actions={
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-lg text-white flex items-center gap-2 transition-all hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onClick={() => setShowProcessarConsumo(true)}
          >
            <Brain className="w-4 h-4" />
            <span className="text-sm font-semibold">Processar Consumo IA</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {indicadores && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <KPICard
              label="Colaboradores Ativos"
              value={indicadores.colaboradores_ativos}
              format="number"
              icon={Users}
              subtitle={`Total: ${indicadores.total_colaboradores}`}
            />
            <KPICard
              label="Escalas Este Mês"
              value={indicadores.escalas_mes_atual}
              format="number"
              icon={Calendar}
              subtitle={`${indicadores.setores_ativos} setores ativos`}
            />
            <KPICard
              label="Colaboradores em Férias"
              value={indicadores.colaboradores_ferias}
              format="number"
              icon={CalendarDays}
              subtitle="Atualmente"
            />
            <KPICard
              label="Ocorrências Este Mês"
              value={indicadores.ocorrencias_mes}
              format="number"
              icon={AlertTriangle}
              subtitle="Registradas"
            />
          </div>
        )}

        {/* Main Content */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Tab.Group selectedIndex={selectedTab} onChange={handleTabChange}>
            <Tab.List className="flex overflow-x-auto scrollbar-hide px-4 pt-4 gap-1"
              style={{ borderBottom: '1px solid var(--border)' }}>
              {tabTitles.map((title, index) => {
                const Icon = tabIcons[index];
                return (
                  <Tab
                    key={title}
                    className={({ selected }) =>
                      `flex items-center whitespace-nowrap px-3 py-2.5 text-[12px] font-medium transition-all duration-150 focus:outline-none border-b-2 select-none ${
                        selected
                          ? 'border-wine text-white'
                          : 'border-transparent text-white/50 hover:text-white hover:bg-white/[0.05]'
                      }`
                    }
                  >
                    <Icon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
                    {title}
                  </Tab>
                );
              })}
            </Tab.List>

            <Tab.Panels>
              {tabTitles.map((title, index) => (
                <Tab.Panel key={title} className="p-5 focus:outline-none">
                  {renderTabContent(index)}
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </Tab.Group>
        </div>
      </div>

      {/* Botão flutuante do Chat IA */}
      {!showChatIA && (
        <button
          onClick={() => setShowChatIA(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:scale-110 transition-all duration-300 flex items-center justify-center z-40 group"
          title="Chat com Super Agente IA"
        >
          <MessageSquare className="w-7 h-7" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></span>
          <div className="absolute right-full mr-4 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Super Agente IA - RH
          </div>
        </button>
      )}

      {/* Modal do Chat IA */}
      {showChatIA && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl">
            <ChatFinanceiroIA onClose={() => setShowChatIA(false)} />
          </div>
        </div>
      )}

      {/* Modal Processar Consumo Excel */}
      {showProcessarConsumo && (
        <ProcessarConsumoExcel onClose={() => setShowProcessarConsumo(false)} />
      )}
    </PageLayout>
  );
};

export default Staff;