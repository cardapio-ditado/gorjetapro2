import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  TrendingUp, Calendar, FileText, CreditCard, Receipt,
  ArrowLeftRight, Tag, Building2, Activity, PieChart,
  Settings, Target, RefreshCw, MessageSquare, X,
  DollarSign, ChevronRight,
} from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

import FluxoCaixa               from '../components/financeiro/FluxoCaixa';
import ResumoDia                from '../components/financeiro/ResumoDia';
import ExtratoDiario            from '../components/financeiro/ExtratoDiario';
import ContasPagar              from '../components/financeiro/ContasPagar';
import ContasReceber            from '../components/financeiro/ContasReceber';
import HistoricoPagamentosEstorno from '../components/financeiro/HistoricoPagamentosEstorno';
import CategorizarLancamentos   from '../components/financeiro/CategorizarLancamentos';
import FichaFinanceiraFornecedor from '../components/financeiro/FichaFinanceiraFornecedor';
import KardexFinanceiroFornecedor from '../components/financeiro/KardexFinanceiroFornecedor';
import KardexFornecedor         from '../components/financeiro/KardexFornecedor';
import RelatoriosGerenciais     from '../components/diretoria/RelatoriosGerenciais';
import GeneralRegistrations     from './GeneralRegistrations';
import ChatFinanceiroIA         from '../components/financeiro/ChatFinanceiroIA';

dayjs.locale('pt-br');

interface Tab {
  label: string;
  icon: React.ElementType;
  description: string;
}

const TABS: Tab[] = [
  { label: 'Fluxo de Caixa',           icon: TrendingUp,     description: 'Entradas e saídas do período' },
  { label: 'Resumo do Dia',            icon: Calendar,       description: 'Visão consolidada do dia' },
  { label: 'Extrato Diário',           icon: FileText,       description: 'Lançamentos detalhados por dia' },
  { label: 'Contas a Pagar',           icon: CreditCard,     description: 'Obrigações financeiras em aberto' },
  { label: 'Contas a Receber',         icon: Receipt,        description: 'Valores a receber' },
  { label: 'Histórico e Estornos',     icon: ArrowLeftRight, description: 'Histórico completo e estornos' },
  { label: 'Categorizar',             icon: Tag,            description: 'Categorize os lançamentos' },
  { label: 'Ficha Fornecedor',         icon: Building2,      description: 'Dados financeiros por fornecedor' },
  { label: 'Kardex Fornecedor',        icon: Activity,       description: 'Movimentações por fornecedor' },
  { label: 'Kardex Completo',          icon: FileText,       description: 'Kardex financeiro completo' },
  { label: 'Relatórios',              icon: PieChart,       description: 'Relatórios gerenciais' },
  { label: 'Cadastros',               icon: Settings,       description: 'Cadastros gerais do financeiro' },
];

const CONTENT: Record<number, React.ReactNode> = {
  0:  <FluxoCaixa />,
  1:  <ResumoDia />,
  2:  <ExtratoDiario />,
  3:  <ContasPagar />,
  4:  <ContasReceber />,
  5:  <HistoricoPagamentosEstorno />,
  6:  <CategorizarLancamentos />,
  7:  <FichaFinanceiraFornecedor />,
  8:  <KardexFinanceiroFornecedor />,
  9:  <KardexFornecedor />,
  10: <RelatoriosGerenciais />,
  11: <GeneralRegistrations />,
};

const Finance: React.FC = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [tab, setTab]           = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Sync tab com URL
  useEffect(() => {
    const t = parseInt(new URLSearchParams(location.search).get('tab') || '0');
    if (!isNaN(t) && t >= 0 && t < TABS.length) setTab(t);
  }, [location.search]);

  const goToTab = (i: number) => {
    setTab(i);
    navigate(`/finance?tab=${i}`, { replace: true });
  };

  const current = TABS[tab];
  const Icon    = current.icon;

  // Datas formatadas
  const hoje = dayjs().format('dddd, D [de] MMMM [de] YYYY');

  return (
    <div className="flex flex-col min-h-screen -m-6 lg:-m-8" style={{ background: '#0d0f1a' }}>

      {/* ── HERO DA SEÇÃO ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)',
        }}
      >
        {/* Ruído decorativo */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Glow dourado no canto */}
        <div
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #D4AF37, transparent 70%)' }}
        />

        <div className="relative px-6 lg:px-8 pt-7 pb-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-white/30 text-xs">Financeiro</span>
            <ChevronRight className="text-white/20" style={{width:'12px',height:'12px'}} />
            <span className="text-white/60 text-xs font-medium">{current.label}</span>
          </div>

          {/* Título + descrição */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <Icon className="text-white/80" style={{width:'18px',height:'18px'}} />
              </div>
              <div>
                <h1 className="text-white text-2xl font-bold leading-none tracking-tight">
                  {current.label}
                </h1>
                <p className="text-white/40 text-sm mt-1">{current.description}</p>
              </div>
            </div>
            <div className="hidden md:block text-right flex-shrink-0">
              <p className="text-white/25 text-xs capitalize">{hoje}</p>
            </div>
          </div>

          {/* ── SUBNAV ── */}
          <nav className="flex items-end gap-0 mt-6 overflow-x-auto scrollbar-hide">
            {TABS.map((t, i) => {
              const TIcon = t.icon;
              const active = i === tab;
              return (
                <button
                  key={i}
                  onClick={() => goToTab(i)}
                  className={`
                    flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium
                    border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0
                    ${active
                      ? 'border-[#D4AF37] text-white bg-[#12141f]/5'
                      : 'border-transparent text-white/35 hover:text-white/60 hover:bg-[#12141f]/5'
                    }
                  `}
                >
                  <TIcon style={{width:'12px',height:'12px'}} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div className="flex-1 px-6 lg:px-8 py-6" style={{ background: '#0d0f1a' }}>
        {CONTENT[tab] ?? (
          <div className="flex items-center justify-center py-24">
            <p className="text-white/30 text-sm">Módulo em desenvolvimento</p>
          </div>
        )}
      </div>

      {/* ── CHAT IA ── */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center z-40 group transition-all hover:scale-105"
          style={{ background: 'linear-gradient(135deg,#7D1F2C,#D4AF37)' }}
          title="Assistente Financeiro IA"
        >
          <MessageSquare className="text-white" style={{width:'20px',height:'20px'}} />
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white" />
          <div className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
            Assistente IA
          </div>
        </button>
      )}

      {showChat && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl">
            <ChatFinanceiroIA onClose={() => setShowChat(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
