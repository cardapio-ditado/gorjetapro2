import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Home, DollarSign, Warehouse, Users, Music, CalendarDays,
  Settings, BookOpen, Target, ClipboardList,
  TrendingUp, ChevronDown, LogOut, Star, X, LayoutDashboard, Hexagon,
} from 'lucide-react';

const ESTOQUE_SUBMODS_ADMIN = [
  { name: 'Receber mercadoria',    path: '/advanced-inventory?area=operacao&tela=receber' },
  { name: 'Transferir',            path: '/advanced-inventory?area=operacao&tela=transferir' },
  { name: 'Produzir',              path: '/advanced-inventory?area=operacao&tela=produzir' },
  { name: 'Contagem',              path: '/advanced-inventory?area=operacao&tela=contar' },
  { name: 'Requisições',           path: '/advanced-inventory?area=operacao&tela=requisicoes' },
  { name: '─ Compras',             path: '/advanced-inventory?area=compras&tela=compras' },
  { name: 'Lista de Compras',      path: '/advanced-inventory?area=compras&tela=lista-compras' },
  { name: '─ Análise',             path: '/advanced-inventory?area=analise&tela=dashboard' },
  { name: 'Dashboard',             path: '/advanced-inventory?area=analise&tela=dashboard' },
  { name: 'Extrato do Item',       path: '/advanced-inventory?area=analise&tela=kardex' },
  { name: 'Posição do Estoque',    path: '/advanced-inventory?area=analise&tela=inventario' },
  { name: 'Relatórios',            path: '/advanced-inventory?area=analise&tela=relatorios' },
  { name: 'ZIG Vendas',            path: '/advanced-inventory?area=analise&tela=zig' },
  { name: '─ Cadastros',           path: '/advanced-inventory?area=cadastros&tela=itens' },
  { name: 'Itens',                 path: '/advanced-inventory?area=cadastros&tela=itens' },
  { name: 'Fichas Técnicas',       path: '/advanced-inventory?area=cadastros&tela=fichas' },
  { name: 'Estoques',              path: '/advanced-inventory?area=cadastros&tela=estoques' },
  { name: 'Controle De Ville',     path: '/controle-deville' },
];

const ESTOQUE_SUBMODS_USER = [
  { name: 'Operação', path: '/advanced-inventory?area=operacao&tela=home' },
];

export interface SubModule { name: string; path: string; }

/** As cinco áreas da casa. São os favos do saguão. */
export type Area = 'financeiro' | 'estoque' | 'rh' | 'operacao' | 'gestao';

export interface Module {
  name: string; path: string;
  icon: React.ElementType; slug: string;
  subModules?: SubModule[];
  group?: Area;
}

/**
 * A definição de cada área: nome, ícone e o que mora nela.
 *
 * Exportada porque o saguão desenha um favo por área e a lateral rotula o
 * grupo aberto — dois lugares, uma verdade. A ordem aqui é a ordem na tela.
 */
export const AREAS: Array<{ id: Area; nome: string; icone: React.ElementType; descricao: string }> = [
  { id: 'operacao',   nome: 'Operação',          icone: ClipboardList, descricao: 'O turno de hoje: agenda, eventos e diário' },
  { id: 'financeiro', nome: 'Financeiro',        icone: DollarSign,    descricao: 'Caixa, contas, faturamento e DRE' },
  { id: 'estoque',    nome: 'Estoque',           icone: Warehouse,     descricao: 'Contagem, compras, produção e fichas' },
  { id: 'rh',         nome: 'Recursos Humanos',  icone: Users,         descricao: 'Equipe, escalas, férias e recrutamento' },
  { id: 'gestao',     nome: 'Gestão',            icone: TrendingUp,    descricao: 'Metas, fidelidade e ajustes do sistema' },
];

export const MODULES: Module[] = [
  { name: 'Dashboard',      path: '/dashboard',          icon: Home,          slug: 'dashboard',       group: 'operacao' },
  { name: 'Portal do Gerente', path: '/portal-gerente',  icon: LayoutDashboard, slug: 'dashboard',     group: 'operacao' },
  { name: 'Agenda do Dia',  path: '/agenda-diaria',      icon: ClipboardList, slug: 'dashboard',       group: 'operacao' },
  { name: 'RH',             path: '/staff',              icon: Users,         slug: 'rh',              group: 'rh',
    subModules: [
      { name: 'Recrutamento',  path: '/recruitment' },
      { name: 'Colaboradores', path: '/staff?tab=0' },
      { name: 'Escalas',       path: '/staff?tab=1' },
      { name: 'Férias',        path: '/staff?tab=2' },
      { name: 'Ocorrências',   path: '/staff?tab=3' },
      { name: 'Extras',        path: '/staff?tab=4' },
      { name: 'Funções',       path: '/staff?tab=5' },
      { name: 'Configurações', path: '/staff?tab=6' },
      { name: 'Relatórios',    path: '/staff?tab=7' },
      { name: 'Gorjetas',      path: '/staff?tab=8' },
    ],
  },
  { name: 'Músicos',        path: '/musicians',          icon: Music,         slug: 'musicos',         group: 'operacao' },
  { name: 'Eventos',        path: '/events',             icon: CalendarDays,  slug: 'eventos',         group: 'operacao' },
  { name: 'Financeiro',     path: '/finance',            icon: DollarSign,    slug: 'financeiro',      group: 'financeiro',
    subModules: [
      { name: 'Dashboard Financeiro',     path: '/financeiro' },
      { name: 'Fluxo de Caixa',           path: '/finance?tab=fluxo' },
      { name: 'Faturamento (ZIG)',        path: '/finance?tab=faturamento' },
      { name: 'Extrato Diário',           path: '/finance?tab=extrato' },
      { name: 'Contas a Pagar',           path: '/finance?tab=pagar' },
      { name: 'Contas a Receber',         path: '/finance?tab=receber' },
      { name: 'Histórico / Estornos',     path: '/finance?tab=historico' },
      { name: 'Categorizar',              path: '/finance?tab=categorizar' },
      { name: 'Ficha Fornecedor',         path: '/finance?tab=ficha-fornecedor' },
      { name: 'Kardex Fornecedor',        path: '/finance?tab=kardex-fornecedor' },
      { name: 'Kardex Completo',          path: '/finance?tab=kardex-completo' },
      { name: 'Relatórios',               path: '/finance?tab=relatorios' },
      { name: 'Cadastros',                path: '/finance?tab=cadastros' },
      { name: 'Visão Estratégica',        path: '/visao-estrategica' },
      { name: 'Entradas Previsto x Real', path: '/entradas' },
      { name: 'ZIG Recebimentos',         path: '/zig-recebimentos' },
      { name: 'DRE Simplificado',         path: '/dre-simplificado' },
    ],
  },
  { name: 'Estoque',        path: '/advanced-inventory', icon: Warehouse,     slug: 'estoque',         group: 'estoque' },
  { name: 'OKRs',           path: '/gestao-estrategica', icon: TrendingUp,    slug: 'financeiro',      group: 'gestao' },
  { name: 'Fidelidade',     path: '/fidelidade',         icon: Star,          slug: 'dashboard',       group: 'gestao',
    subModules: [
      { name: 'Sincronização',        path: '/fidelidade' },
      { name: 'Buscar Cliente',       path: '/fidelidade?tab=busca' },
      { name: 'Aniversariantes',      path: '/fidelidade?tab=aniversario' },
      { name: 'Rankings',             path: '/fidelidade?tab=rankings' },
      { name: 'Gatilhos de Prêmio',   path: '/fidelidade?tab=gatilhos' },
      { name: 'Programa de Pontos',   path: '/fidelidade?tab=pontos' },
    ],
  },
  { name: 'Metas & Tarefas', path: '/metas-tarefas',    icon: Target,        slug: 'solicitacoes',    group: 'gestao' },
  { name: 'Diário de Bordo', path: '/ocorrencias',        icon: BookOpen,      slug: 'ocorrencias',     group: 'operacao' },
  { name: 'Manual',         path: '/manual',             icon: BookOpen,      slug: 'manual',          group: 'gestao' },
  { name: 'Configurações',  path: '/settings',           icon: Settings,      slug: 'configuracoes',   group: 'gestao' },
];

interface Props { onNavigate?: () => void; onCloseMobile?: () => void; }

const SidebarModern: React.FC<Props> = ({ onNavigate, onCloseMobile }) => {
  const location = useLocation();
  const { temAcessoModulo, usuario, logout, isAdmin } = useAuth();
  const isAdminOrMaster = isAdmin();

  const modulesWithDynamic: Module[] = MODULES.map(m => {
    if (m.slug === 'estoque') {
      return { ...m, subModules: isAdminOrMaster ? ESTOQUE_SUBMODS_ADMIN : ESTOQUE_SUBMODS_USER };
    }
    return m;
  });

  const [expanded, setExpanded] = useState<string | null>(() => {
    const cur = modulesWithDynamic.find(m =>
      m.subModules?.some(s =>
        location.pathname + location.search === s.path || location.pathname === s.path
      )
    );
    return cur?.name ?? null;
  });

  const filtered = modulesWithDynamic.filter(m => temAcessoModulo(m.slug));

  const isActive    = (path: string) =>
    location.pathname + location.search === path || location.pathname === path;
  const isModActive = (m: Module) =>
    isActive(m.path) || !!m.subModules?.some(s => isActive(s.path));

  const initials = usuario?.nome_completo
    ?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() ?? 'U';

  const renderModule = (m: Module) => {
    const active      = isModActive(m);
    // `expanded === null` = ninguém mexeu ainda: o módulo atual nasce aberto,
    // porque com a lateral contextual ele é a única coisa na tela.
    const open        = expanded === m.name || (expanded === null && moduloAtual?.name === m.name);
    const hasChildren = !!m.subModules?.length;

    const itemClass = `relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg t-body font-medium transition-all duration-150 group ${
      active
        ? 'text-white'
        : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
    }`;

    const iconClass = `flex-shrink-0 transition-colors duration-150 ${
      active ? 'text-gold' : 'text-text-muted group-hover:text-text-secondary'
    }`;

    const activeIndicator = active && (
      <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: 'var(--gold)', boxShadow: '0 0 6px rgba(212,175,55,0.6)' }} />
    );

    return (
      <div key={m.name + m.path}>
        {hasChildren ? (
          <>
            <button
              onClick={() => setExpanded(p => p === m.name ? null : m.name)}
              className={itemClass}
              style={active ? { background: 'rgba(125,31,44,0.18)' } : undefined}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                  style={{ background: 'var(--wine)' }} />
              )}
              <m.icon className={iconClass} size={15} />
              <span className="flex-1 text-left font-sans">{m.name}</span>
              {active && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: 'var(--gold)', boxShadow: '0 0 6px rgba(212,175,55,0.5)' }} />}
              <ChevronDown
                size={13}
                className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-muted)' }}
              />
            </button>

            {open && (
              <div className="mt-0.5 ml-2.5 pl-3.5 space-y-0.5"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
                {m.subModules!.map(sub => {
                  if (sub.name.startsWith('─')) {
                    const label = sub.name.replace('─ ', '').replace('─', '');
                    return (
                      <p key={sub.path + sub.name}
                        className="t-caps font-bold uppercase tracking-widest px-2 pt-2.5 pb-1"
                        style={{ color: 'var(--text-secondary)' }}>
                        {label}
                      </p>
                    );
                  }
                  const subActive = isActive(sub.path);
                  return (
                    <Link
                      key={sub.path}
                      to={sub.path}
                      onClick={onNavigate}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md t-label font-sans transition-all duration-100 ${
                        subActive
                          ? 'font-semibold'
                          : 'hover:bg-white/[0.04]'
                      }`}
                      style={{
                        color: subActive ? 'var(--gold)' : 'var(--text-secondary)',
                        background: subActive ? 'rgba(212,175,55,0.08)' : undefined,
                      }}
                    >
                      {sub.name}
                      {subActive && (
                        <span className="w-1 h-1 rounded-full flex-shrink-0"
                          style={{ background: 'var(--gold)' }} />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <Link
            to={m.path}
            onClick={onNavigate}
            className={itemClass}
            style={active ? { background: 'rgba(125,31,44,0.18)' } : undefined}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                style={{ background: 'var(--wine)' }} />
            )}
            <m.icon className={iconClass} size={15} />
            <span className="font-sans">{m.name}</span>
            {activeIndicator}
          </Link>
        )}
      </div>
    );
  };

  const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="px-2.5 pt-3 pb-1.5 t-caps font-bold uppercase tracking-[0.1em]"
      style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  );

  /**
   * A área em que a pessoa está AGORA.
   *
   * A lateral deixou de listar tudo de uma vez — a escolha de área virou o
   * saguão ("/"). Aqui aparecem os módulos da área aberta (o ativo já
   * expandido), mais o caminho de volta. Fora de qualquer área (rota
   * desconhecida), a lista completa continua sendo o plano B: uma lateral
   * vazia parece defeito.
   */
  const moduloAtual = modulesWithDynamic.find(isModActive) ?? null;
  const areaAtual = moduloAtual?.group ? AREAS.find(a => a.id === moduloAtual.group) ?? null : null;
  const daArea = areaAtual ? filtered.filter(m => m.group === areaAtual.id) : [];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-dark)' }}>

      {/* Logo block */}
      <div className="flex items-center gap-3 h-[52px] px-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--wine), var(--gold))' }}>
          <span className="text-white t-caps font-black tracking-tighter">DP</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="t-body font-bold leading-none tracking-tight"
            style={{ color: 'var(--text-primary)' }}>
            Ditado Popular
          </p>
          <p className="t-caps mt-0.5 tracking-widest uppercase font-medium"
            style={{ color: 'var(--text-secondary)' }}>
            Gestão
          </p>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Fechar menu"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-hide">
        <Link
          to="/"
          onClick={onNavigate}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 mb-2 rounded-lg t-body font-medium transition-all duration-150"
          style={{
            color: 'var(--gold)',
            background: 'rgba(212,175,55,0.07)',
            border: '1px solid rgba(212,175,55,0.14)',
          }}
        >
          <Hexagon size={15} />
          <span className="font-sans">Saguão</span>
        </Link>

        {areaAtual ? (
          <>
            <GroupLabel>{areaAtual.nome}</GroupLabel>
            {daArea.map(renderModule)}
          </>
        ) : (
          AREAS.map(area => {
            const modulos = filtered.filter(m => m.group === area.id);
            if (modulos.length === 0) return null;
            return (
              <React.Fragment key={area.id}>
                <GroupLabel>{area.nome}</GroupLabel>
                {modulos.map(renderModule)}
              </React.Fragment>
            );
          })
        )}
      </nav>

      {/* User footer */}
      <div className="flex-shrink-0 p-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--wine), var(--gold))' }}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="t-label font-semibold truncate leading-tight"
              style={{ color: 'var(--text-primary)' }}>
              {usuario?.nome_completo?.split(' ')[0] ?? 'Usuário'}
            </p>
            <p className="t-caption capitalize truncate leading-tight mt-0.5"
              style={{ color: 'var(--text-secondary)' }}>
              {usuario?.cargo ?? usuario?.nivel ?? '—'}
            </p>
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:bg-danger/10"
            style={{ color: 'var(--text-secondary)' }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidebarModern;
