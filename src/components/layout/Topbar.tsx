import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Settings, LogOut, ChevronDown, Command, ChevronRight, Menu, X, Home, DollarSign, Warehouse, Users, Music, CalendarDays, BookOpen, AlertTriangle, Target, TrendingUp, Star } from 'lucide-react';
import { Usuario } from '../../contexts/AuthContext';

interface TopbarProps {
  toggleSidebar: () => void;
  user: Usuario | null;
  onLogout: () => void;
}

interface SearchResult {
  label: string;
  sublabel?: string;
  path: string;
  icon?: React.ElementType;
}

const ALL_ROUTES: SearchResult[] = [
  { label: 'Dashboard',               path: '/',                                                    icon: Home },
  { label: 'Agenda do Dia',           path: '/agenda-diaria',                                       icon: CalendarDays },
  // RH
  { label: 'RH — Colaboradores',      path: '/staff?tab=0',                                         icon: Users },
  { label: 'RH — Escalas',            path: '/staff?tab=1',                                         icon: Users },
  { label: 'RH — Férias',             path: '/staff?tab=2',                                         icon: Users },
  { label: 'RH — Ocorrências',        path: '/staff?tab=3',                                         icon: Users },
  { label: 'RH — Extras',             path: '/staff?tab=4',                                         icon: Users },
  { label: 'RH — Funções',            path: '/staff?tab=5',                                         icon: Users },
  { label: 'RH — Configurações',      path: '/staff?tab=6',                                         icon: Users },
  { label: 'RH — Relatórios',         path: '/staff?tab=7',                                         icon: Users },
  { label: 'RH — Gorjetas',           path: '/staff?tab=8',                                         icon: Users },
  { label: 'Recrutamento',            path: '/recruitment',                                          icon: Users },
  // Músicos & Eventos
  { label: 'Músicos',                 path: '/musicians',                                            icon: Music },
  { label: 'Eventos',                 path: '/events',                                               icon: CalendarDays },
  // Financeiro
  { label: 'Financeiro — Fluxo de Caixa',        path: '/finance?tab=fluxo',             icon: DollarSign },
  { label: 'Financeiro — Faturamento (ZIG)',     path: '/finance?tab=faturamento',       icon: DollarSign },
  { label: 'Financeiro — Extrato Diário',        path: '/finance?tab=extrato',           icon: DollarSign },
  { label: 'Financeiro — Contas a Pagar',        path: '/finance?tab=pagar',             icon: DollarSign },
  { label: 'Financeiro — Contas a Receber',      path: '/finance?tab=receber',           icon: DollarSign },
  { label: 'Financeiro — Histórico / Estornos',  path: '/finance?tab=historico',         icon: DollarSign },
  { label: 'Financeiro — Categorizar',           path: '/finance?tab=categorizar',       icon: DollarSign },
  { label: 'Financeiro — Ficha Fornecedor',      path: '/finance?tab=ficha-fornecedor',  icon: DollarSign },
  { label: 'Financeiro — Kardex Fornecedor',     path: '/finance?tab=kardex-fornecedor', icon: DollarSign },
  { label: 'Financeiro — Kardex Completo',       path: '/finance?tab=kardex-completo',   icon: DollarSign },
  { label: 'Financeiro — Relatórios',            path: '/finance?tab=relatorios',        icon: DollarSign },
  { label: 'Financeiro — Cadastros',             path: '/finance?tab=cadastros',         icon: DollarSign },
  { label: 'Dashboard Financeiro',               path: '/financeiro',       icon: DollarSign },
  { label: 'Visão Estratégica',                  path: '/visao-estrategica',icon: DollarSign },
  { label: 'Entradas Previsto x Real',           path: '/entradas',         icon: DollarSign },
  { label: 'ZIG Recebimentos',                   path: '/zig-recebimentos', icon: DollarSign },
  { label: 'DRE Simplificado',                   path: '/dre-simplificado', icon: DollarSign },
  // Estoque
  { label: 'Estoque — Receber Mercadoria',  path: '/advanced-inventory?area=operacao&tela=receber',     icon: Warehouse },
  { label: 'Estoque — Transferir',          path: '/advanced-inventory?area=operacao&tela=transferir',  icon: Warehouse },
  { label: 'Estoque — Produzir',            path: '/advanced-inventory?area=operacao&tela=produzir',    icon: Warehouse },
  { label: 'Estoque — Contagem',            path: '/advanced-inventory?area=operacao&tela=contar',      icon: Warehouse },
  { label: 'Estoque — Requisições',         path: '/advanced-inventory?area=operacao&tela=requisicoes', icon: Warehouse },
  { label: 'Estoque — Dashboard',           path: '/advanced-inventory?area=analise&tela=dashboard',    icon: Warehouse },
  { label: 'Estoque — Extrato do Item',     path: '/advanced-inventory?area=analise&tela=kardex',       icon: Warehouse },
  { label: 'Estoque — Posição do Estoque',  path: '/advanced-inventory?area=analise&tela=inventario',   icon: Warehouse },
  { label: 'Estoque — Relatórios',          path: '/advanced-inventory?area=analise&tela=relatorios',   icon: Warehouse },
  { label: 'Estoque — ZIG Vendas',          path: '/advanced-inventory?area=analise&tela=zig',          icon: Warehouse },
  { label: 'Estoque — Lista de Compras',    path: '/advanced-inventory?area=compras&tela=lista-compras',icon: Warehouse },
  { label: 'Estoque — Itens',               path: '/advanced-inventory?area=cadastros&tela=itens',      icon: Warehouse },
  { label: 'Estoque — Fichas Técnicas',     path: '/advanced-inventory?area=cadastros&tela=fichas',     icon: Warehouse },
  { label: 'Estoque — Estoques',            path: '/advanced-inventory?area=cadastros&tela=estoques',   icon: Warehouse },
  { label: 'Controle De Ville',             path: '/controle-deville',                                  icon: Warehouse },
  // Estratégico & Fidelidade
  { label: 'OKRs Estratégicos',             path: '/gestao-estrategica',                                icon: TrendingUp },
  { label: 'Fidelidade — Sincronização',    path: '/fidelidade',                                        icon: Star },
  { label: 'Fidelidade — Buscar Cliente',   path: '/fidelidade?tab=busca',                              icon: Star },
  { label: 'Fidelidade — Aniversariantes',  path: '/fidelidade?tab=aniversario',                        icon: Star },
  { label: 'Fidelidade — Rankings',         path: '/fidelidade?tab=rankings',                           icon: Star },
  { label: 'Fidelidade — Gatilhos de Prêmio', path: '/fidelidade?tab=gatilhos',                         icon: Star },
  { label: 'Fidelidade — Programa de Pontos', path: '/fidelidade?tab=pontos',                           icon: Star },
  // Sistema
  { label: 'Metas & Tarefas',  path: '/metas-tarefas',  icon: Target },
  { label: 'Ocorrências',      path: '/ocorrencias',     icon: AlertTriangle },
  { label: 'Manual',           path: '/manual',          icon: BookOpen },
  { label: 'Configurações',    path: '/settings',        icon: Settings },
];

const Topbar: React.FC<TopbarProps> = ({ toggleSidebar, user, onLogout }) => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [showUserMenu,   setShowUserMenu]   = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchFocused,  setSearchFocused]  = useState(false);
  const [selectedIndex,  setSelectedIndex]  = useState(0);
  const menuRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
      ) {
        setSearchQuery('');
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const results: SearchResult[] = searchQuery.trim().length > 0
    ? ALL_ROUTES.filter(r =>
        r.label.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => { setSelectedIndex(0); }, [searchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        navigate(results[selectedIndex].path);
        setSearchQuery('');
        setSearchFocused(false);
        searchRef.current?.blur();
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchFocused(false);
      searchRef.current?.blur();
    }
  }, [results, selectedIndex, navigate]);

  const handleResultClick = (path: string) => {
    navigate(path);
    setSearchQuery('');
    setSearchFocused(false);
    searchRef.current?.blur();
  };

  const initials = user?.nome_completo?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  const getBreadcrumb = () => {
    const path   = location.pathname;
    const search = location.search;

    if (path === '/advanced-inventory' && search.includes('area=')) {
      const areaMatch = search.match(/area=([^&]+)/);
      const telaMatch = search.match(/tela=([^&]+)/);
      const areaLabels: Record<string, string> = { operacao: 'Operação', compras: 'Compras', analise: 'Análise', cadastros: 'Cadastros' };
      const telaLabels: Record<string, string> = {
        home: 'Home', receber: 'Receber Mercadoria', transferir: 'Transferir',
        produzir: 'Produzir', contar: 'Contagem', requisicoes: 'Requisições',
        compras: 'Compras', 'lista-compras': 'Lista de Compras',
        dashboard: 'Dashboard', kardex: 'Extrato do Item', inventario: 'Posição do Estoque',
        relatorios: 'Relatórios', zig: 'ZIG Vendas',
        itens: 'Itens', fichas: 'Fichas Técnicas', estoques: 'Estoques',
      };
      const area = areaMatch ? areaLabels[areaMatch[1]] ?? areaMatch[1] : undefined;
      const tela = telaMatch ? telaLabels[telaMatch[1]] ?? telaMatch[1] : undefined;
      return { module: 'Estoque', sub: area && tela && area !== tela ? `${area} › ${tela}` : (tela ?? area) };
    }

    const routes: { [key: string]: { module: string; sub?: string } } = {
      '/': { module: 'Dashboard' },
      '/finance': { module: 'Financeiro' },
      '/financeiro': { module: 'Financeiro', sub: 'Dashboard' },
      '/advanced-inventory': { module: 'Estoque' },
      '/staff': { module: 'RH' },
      '/recruitment': { module: 'RH', sub: 'Recrutamento' },
      '/musicians': { module: 'Músicos' },
      '/events': { module: 'Eventos' },
      '/solicitacoes': { module: 'Solicitações' },
      '/ocorrencias': { module: 'Ocorrências' },
      '/marketing': { module: 'Marketing' },
      '/gestao-estrategica': { module: 'OKRs Estratégicos' },
      '/visao-estrategica': { module: 'Financeiro', sub: 'Visão Estratégica' },
      '/entradas': { module: 'Financeiro', sub: 'Entradas' },
      '/zig-recebimentos': { module: 'Financeiro', sub: 'ZIG Recebimentos' },
      '/zig-vendas': { module: 'Estoque', sub: 'ZIG Vendas' },
      '/lista-compras': { module: 'Estoque', sub: 'Lista de Compras' },
      '/manual': { module: 'Manual' },
      '/settings': { module: 'Configurações' },
      '/fidelidade': { module: 'Fidelidade' },
      '/metas-tarefas': { module: 'Metas & Tarefas' },
    };

    const search2 = location.search;
    if (search2.includes('tab=')) {
      const slugMatch = search2.match(/tab=([a-z-]+)/);
      if (slugMatch && path === '/finance') {
        const tabsPorSlug: Record<string, string> = {
          'fluxo': 'Fluxo de Caixa', 'extrato': 'Extrato', 'pagar': 'Contas a Pagar',
          'receber': 'Contas a Receber', 'historico': 'Histórico', 'categorizar': 'Categorizar',
          'ficha-fornecedor': 'Ficha Fornecedor', 'kardex-fornecedor': 'Kardex Fornecedor',
          'kardex-completo': 'Kardex Completo', 'relatorios': 'Relatórios', 'cadastros': 'Cadastros',
        };
        return { module: 'Financeiro', sub: tabsPorSlug[slugMatch[1]] ?? 'Fluxo de Caixa' };
      }
      const tabMatch = search2.match(/tab=(\d+)/);
      if (tabMatch && path === '/finance') {
        return { module: 'Financeiro', sub: 'Fluxo de Caixa' };
      }
      if (tabMatch && path === '/staff') {
        const tabs = ['Colaboradores', 'Escalas', 'Férias', 'Ocorrências', 'Extras', 'Funções', 'Configurações', 'Relatórios', 'Gorjetas'];
        return { module: 'RH', sub: tabs[parseInt(tabMatch[1])] };
      }
    }

    return routes[path] || { module: 'Gorjeta Pro' };
  };

  const breadcrumb = getBreadcrumb();
  const showDropdown = searchFocused && results.length > 0;

  return (
    <header className="h-[52px] flex items-center px-4 gap-3" style={{ background: 'var(--bg-dark)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Hamburger — mobile only */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        <span className="font-sans font-semibold text-sm text-white">{breadcrumb.module}</span>
        {breadcrumb.sub && (
          <>
            <ChevronRight size={14} className="text-white/20" />
            <span className="font-sans text-sm text-gold truncate max-w-[160px]">{breadcrumb.sub}</span>
          </>
        )}
      </div>

      {/* Busca central */}
      <div className="flex-1 max-w-xl mx-auto relative">
        <div className={`flex items-center gap-2.5 px-4 py-2 rounded-lg border transition-all duration-200 ${
          searchFocused
            ? 'bg-white/10 border-white/20'
            : 'bg-white/5 border-white/10 hover:bg-white/8'
        }`}>
          <Search className="text-white/30 flex-shrink-0" size={16} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar no sistema..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm font-sans focus:outline-none min-w-0"
          />
          {searchQuery ? (
            <button
              onMouseDown={e => { e.preventDefault(); setSearchQuery(''); }}
              className="text-white/30 hover:text-white/60 flex-shrink-0"
            >
              <X size={14} />
            </button>
          ) : !searchFocused && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 flex-shrink-0">
              <Command className="text-white/30" size={10} />
              <span className="text-white/30 text-[10px] font-mono font-medium">K</span>
            </div>
          )}
        </div>

        {/* Results dropdown */}
        {showDropdown && (
          <div
            ref={dropRef}
            className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-white/10 shadow-2xl shadow-black/60 overflow-hidden z-50"
            style={{ background: 'var(--bg-card)' }}
          >
            {results.map((r, i) => {
              const Icon = r.icon;
              const parts = r.label.split(' — ');
              const main = parts[0];
              const sub  = parts[1];
              return (
                <button
                  key={r.path + r.label}
                  onMouseDown={e => { e.preventDefault(); handleResultClick(r.path); }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                    i === selectedIndex ? 'bg-white/8' : 'hover:bg-white/5'
                  }`}
                >
                  {Icon && <Icon size={15} className="text-white/30 flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <span className="text-white/80 text-sm font-sans font-medium">{main}</span>
                    {sub && <span className="text-white/35 text-xs font-sans ml-2">{sub}</span>}
                  </div>
                  {i === selectedIndex && (
                    <span className="text-white/20 text-[10px] font-mono flex-shrink-0">Enter</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Notificações */}
      <button className="relative flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-5 h-4 bg-gold rounded-full text-[9px] font-sans font-bold text-dark flex items-center justify-center ring-2 ring-dark">
          3
        </span>
      </button>

      {/* Divisor */}
      <div className="hidden sm:block w-px h-5 bg-white/10 flex-shrink-0" />

      {/* Perfil */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
        >
          <div
            className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--wine), var(--gold))' }}
          >
            {initials}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-dark" />
          </div>
          <div className="hidden md:block text-left">
            <p className="text-white text-xs font-sans font-semibold leading-tight">
              {user?.nome_completo?.split(' ')[0] || 'Usuário'}
            </p>
            <p className="text-white/40 text-[10px] font-sans capitalize leading-tight">
              {user?.cargo || user?.nivel || '—'}
            </p>
          </div>
          <ChevronDown className={`text-white/30 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} size={14} />
        </button>

        {showUserMenu && (
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 shadow-2xl shadow-black/60 overflow-hidden z-50" style={{ background: 'var(--bg-card)' }}>
            <div className="px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--wine), var(--gold))' }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-sans font-semibold truncate">{user?.nome_completo || 'Usuário'}</p>
                  <p className="text-white/40 text-xs font-sans truncate mt-0.5">{user?.email || '—'}</p>
                  <span className="inline-block mt-1.5 badge badge-info">
                    {user?.cargo || user?.nivel || 'usuário'}
                  </span>
                </div>
              </div>
            </div>

            <div className="py-2 px-2">
              <button className="flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-sans text-white/50 hover:text-white/80 hover:bg-white/5 transition-all">
                <Settings size={16} />
                Configurações
              </button>
              <div className="my-1.5 h-px bg-white/10" />
              <button
                onClick={onLogout}
                className="flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-sans text-danger/70 hover:text-danger hover:bg-danger/10 transition-all"
              >
                <LogOut size={16} />
                Sair do sistema
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Topbar;
