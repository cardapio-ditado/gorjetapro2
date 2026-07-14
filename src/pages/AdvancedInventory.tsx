import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Warehouse, MessageSquare,
  ArrowLeftRight, ClipboardCheck, Factory, Package,
  ShoppingCart, BarChart3, FileText, Eye,
  Settings, Zap, ChevronRight,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';

// ── Componentes existentes (não tocados) ─────────────────────────────────────
import EstoquesGerenciamento   from '../components/inventory/EstoquesGerenciamento';
import MovimentacoesEstoque    from '../components/inventory/MovimentacoesEstoque';
import ProducaoEstoque         from '../components/inventory/ProducaoEstoque';
import ComprasEstoque          from '../components/inventory/ComprasEstoque';
import ItensEstoque            from '../components/inventory/ItensEstoque';
import FichasTecnicas          from '../components/inventory/FichasTecnicas';
import KardexProduto           from '../components/inventory/KardexProduto';
import RequisicoesInternas     from '../components/inventory/RequisicoesInternas';
import ContagemEstoque         from '../components/inventory/contagem/ContagemEstoque';
import ChatFinanceiroIA        from '../components/financeiro/ChatFinanceiroIA';
import InventarioConsolidado   from '../components/inventory/InventarioConsolidado';
import DashboardEstoque        from '../components/inventory/DashboardEstoque';
import ZigVendasSync           from './ZigVendasSync';
import ListaCompra             from '../components/inventory/ListaCompra';
import RelatoriosEstoque       from '../components/inventory/RelatoriosEstoque';
import VendasDashboard         from '../components/inventory/VendasDashboard';
import MapeamentoItensExcel    from '../components/inventory/MapeamentoItensExcel';
import MovimentacoesCompostas  from '../components/inventory/MovimentacoesCompostas';

// ── Componentes novos ────────────────────────────────────────────────────────
import OperacaoHome      from '../components/inventory/operacao/OperacaoHome';
import TransferirEstoque from '../components/inventory/operacao/TransferirEstoque';

// ── Tipos ────────────────────────────────────────────────────────────────────
type Area = 'operacao' | 'compras' | 'analise' | 'cadastros';
type Tela =
  | 'home' | 'receber' | 'transferir' | 'produzir' | 'contar' | 'requisicoes'
  | 'compras' | 'lista-compras'
  | 'dashboard' | 'kardex' | 'inventario' | 'relatorios' | 'zig' | 'movimentacoes-avancadas'
  | 'itens' | 'fichas' | 'estoques' | 'mapeamento';

interface TelaConfig {
  key: Tela;
  label: string;
  icon: React.ElementType;
}

const TELAS_COMPRAS: TelaConfig[] = [
  { key: 'compras',      label: 'Compras',        icon: ShoppingCart },
  { key: 'lista-compras', label: 'Lista de Compras', icon: FileText },
];

const TELAS_ANALISE: TelaConfig[] = [
  { key: 'dashboard',    label: 'Dashboard',          icon: BarChart3 },
  { key: 'kardex',       label: 'Extrato do item',     icon: FileText },
  { key: 'inventario',   label: 'Posição do estoque',  icon: Eye },
  { key: 'relatorios',   label: 'Relatórios',          icon: BarChart3 },
  { key: 'zig',          label: 'ZIG Vendas',          icon: Zap },
  { key: 'movimentacoes-avancadas', label: 'Movimentações avançadas', icon: ArrowLeftRight },
];

const TELAS_CADASTROS: TelaConfig[] = [
  { key: 'itens',      label: 'Itens',                icon: Package },
  { key: 'fichas',     label: 'Fichas Técnicas',      icon: ClipboardCheck },
  { key: 'estoques',   label: 'Estoques',             icon: Warehouse },
  { key: 'mapeamento', label: 'Mapeamento Excel',     icon: Settings },
];

// Mapa de retrocompatibilidade: tab antigo → {area, tela}
const TAB_MAP: Record<number, { area: Area; tela: Tela }> = {
  0:  { area: 'analise',   tela: 'dashboard' },
  1:  { area: 'cadastros', tela: 'estoques' },
  2:  { area: 'cadastros', tela: 'itens' },
  3:  { area: 'cadastros', tela: 'fichas' },
  4:  { area: 'operacao',  tela: 'produzir' },
  5:  { area: 'compras',   tela: 'compras' },
  6:  { area: 'operacao',  tela: 'transferir' },
  7:  { area: 'analise',   tela: 'movimentacoes-avancadas' },
  8:  { area: 'operacao',  tela: 'contar' },
  9:  { area: 'analise',   tela: 'zig' },
  10: { area: 'analise',   tela: 'kardex' },
  11: { area: 'analise',   tela: 'inventario' },
};

// ─────────────────────────────────────────────────────────────────────────────
const AdvancedInventory: React.FC = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { usuario, isAdmin } = useAuth();

  const isAdminOrMaster = isAdmin();

  const [area, setArea]     = useState<Area>('operacao');
  const [tela, setTela]     = useState<Tela>('home');
  const [showChatIA, setShowChatIA] = useState(false);

  // Parsear URL ao montar / mudar location
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    // Retrocompatibilidade: ?tab=N
    const tabParam = params.get('tab');
    if (tabParam !== null) {
      const idx = parseInt(tabParam);
      if (!isNaN(idx) && TAB_MAP[idx]) {
        const { area: a, tela: t } = TAB_MAP[idx];
        setArea(a);
        setTela(t);
        return;
      }
    }

    const areaParam = params.get('area') as Area | null;
    const telaParam = params.get('tela') as Tela | null;
    if (areaParam) setArea(areaParam);
    if (telaParam) setTela(telaParam);
  }, [location.search]);

  const navegar = useCallback((a: Area, t: Tela) => {
    setArea(a);
    setTela(t);
    navigate(`/advanced-inventory?area=${a}&tela=${t}`);
  }, [navigate]);

  // Breadcrumb label
  const telaLabel = (): string => {
    if (tela === 'home') return 'Operação';
    const todas = [...TELAS_COMPRAS, ...TELAS_ANALISE, ...TELAS_CADASTROS];
    const found = todas.find(t2 => t2.key === tela);
    if (found) return found.label;
    if (tela === 'receber')    return 'Receber mercadoria';
    if (tela === 'transferir') return 'Transferir estoque';
    if (tela === 'produzir')   return 'Produzir';
    if (tela === 'contar')     return 'Contar';
    if (tela === 'requisicoes') return 'Requisições';
    return tela;
  };

  // ── renderizar conteúdo ──────────────────────────────────────────────────
  const renderConteudo = () => {
    // Operação — fluxos específicos
    if (tela === 'home' || area === 'operacao' && tela === 'home') {
      return (
        <OperacaoHome
          onAcao={(acao) => {
            if (acao === 'receber')    navegar('operacao', 'receber');
            if (acao === 'transferir') navegar('operacao', 'transferir');
            if (acao === 'produzir')   navegar('operacao', 'produzir');
            if (acao === 'contar')     navegar('operacao', 'contar');
            if (acao === 'requisicoes') navegar('operacao', 'requisicoes');
          }}
        />
      );
    }
    if (tela === 'receber')    return <ComprasEstoque />;
    if (tela === 'transferir') return <TransferirEstoque onVoltar={() => navegar('operacao', 'home')} />;
    if (tela === 'produzir')   return <ProducaoEstoque />;
    if (tela === 'contar')     return <ContagemEstoque />;
    if (tela === 'requisicoes') return <RequisicoesInternas />;

    // Compras
    if (tela === 'compras')      return <ComprasEstoque />;
    if (tela === 'lista-compras') return <ListaCompra />;

    // Análise
    if (tela === 'dashboard')   return (
      <DashboardEstoque
        onNavigate={(tab) => {
          const map: Record<string, { area: Area; tela: Tela }> = {
            compras:    { area: 'compras',  tela: 'compras' },
            requisicoes:{ area: 'operacao', tela: 'transferir' },
            contagem:   { area: 'operacao', tela: 'contar' },
            inventario: { area: 'analise',  tela: 'inventario' },
          };
          if (map[tab]) navegar(map[tab].area, map[tab].tela);
        }}
      />
    );
    if (tela === 'kardex')      return <KardexProduto />;
    if (tela === 'inventario')  return <InventarioConsolidado />;
    if (tela === 'relatorios')  return <RelatoriosEstoque />;
    if (tela === 'zig')         return <ZigVendasSync />;
    if (tela === 'movimentacoes-avancadas') return <MovimentacoesCompostas />;

    // Cadastros
    if (tela === 'itens')      return <ItensEstoque />;
    if (tela === 'fichas')     return <FichasTecnicas />;
    if (tela === 'estoques')   return <EstoquesGerenciamento />;
    if (tela === 'mapeamento') return <MapeamentoItensExcel />;

    return <div className="text-white/40 text-center py-16">Módulo em desenvolvimento</div>;
  };

  // ── Área ativa ───────────────────────────────────────────────────────────
  const areaLabel: Record<Area, string> = {
    operacao:  'Operação',
    compras:   'Compras',
    analise:   'Análise',
    cadastros: 'Cadastros',
  };

  // Sub-tabs dentro de cada área (somente admin/master)
  const renderSubTabs = () => {
    if (!isAdminOrMaster) return null;

    let telas: TelaConfig[] = [];
    if (area === 'operacao') return null; // operação usa botões grandes
    if (area === 'compras')  telas = TELAS_COMPRAS;
    if (area === 'analise')  telas = TELAS_ANALISE;
    if (area === 'cadastros') telas = TELAS_CADASTROS;

    return (
      <div className="flex items-center gap-1 px-6 lg:px-8 py-2 overflow-x-auto scrollbar-hide border-b border-white/[0.06]">
        {telas.map(t2 => {
          const Icon = t2.icon;
          const active = tela === t2.key;
          return (
            <button
              key={t2.key}
              onClick={() => navegar(area, t2.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                ${active
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
            >
              <Icon style={{ width: '12px', height: '12px' }} />
              {t2.label}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen -m-6 lg:-m-8" style={{ background: '#0d0f1a' }}>

      {/* HERO */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)' }}
      >
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #D4AF37, transparent 70%)' }} />

        <div className="relative px-6 lg:px-8 pt-7 pb-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-white/30 text-xs">Estoque</span>
            <ChevronRight className="text-white/20" style={{ width: '12px', height: '12px' }} />
            {isAdminOrMaster && (
              <>
                <span className="text-white/50 text-xs">{areaLabel[area]}</span>
                <ChevronRight className="text-white/20" style={{ width: '12px', height: '12px' }} />
              </>
            )}
            <span className="text-white/70 text-xs font-medium">{telaLabel()}</span>
          </div>

          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Warehouse className="text-white/80" style={{ width: '18px', height: '18px' }} />
              </div>
              <div>
                <h1 className="text-white text-2xl font-bold leading-none tracking-tight">Gestão de Estoque</h1>
                <p className="text-white/40 text-sm mt-1">Controle completo do estoque e movimentações</p>
              </div>
            </div>
          </div>

          {/* Abas de área (somente admin/master) */}
          {isAdminOrMaster && (
            <nav className="flex items-end gap-0 mt-6 overflow-x-auto scrollbar-hide">
              {(['operacao', 'compras', 'analise', 'cadastros'] as Area[]).map(a => {
                const active = area === a;
                return (
                  <button
                    key={a}
                    onClick={() => {
                      setArea(a);
                      const defaultTela: Record<Area, Tela> = {
                        operacao:  'home',
                        compras:   'compras',
                        analise:   'dashboard',
                        cadastros: 'itens',
                      };
                      navegar(a, defaultTela[a]);
                    }}
                    className={`px-5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0
                      ${active
                        ? 'border-[#D4AF37] text-white'
                        : 'border-transparent text-white/35 hover:text-white/60'}`}
                  >
                    {areaLabel[a]}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      {renderSubTabs()}

      {/* CONTEÚDO */}
      <div className="flex-1 px-6 lg:px-8 py-6" style={{ background: '#0d0f1a' }}>
        {renderConteudo()}
      </div>

      {/* Botão Chat IA */}
      {!showChatIA && (
        <button
          onClick={() => setShowChatIA(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-[#7D1F2C] to-[#D4AF37] text-white rounded-full shadow-2xl hover:shadow-3xl hover:scale-110 transition-all duration-300 flex items-center justify-center z-40 group"
          title="Chat com Super Agente IA"
        >
          <MessageSquare className="w-7 h-7" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
          <div className="absolute right-full mr-4 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Super Agente IA - Estoque
          </div>
        </button>
      )}

      {showChatIA && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl">
            <ChatFinanceiroIA onClose={() => setShowChatIA(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedInventory;
