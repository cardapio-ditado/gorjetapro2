import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, Permissao } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  DollarSign,
  Package,
  Users,
  Music,
  CalendarDays,
  Settings,
  BookOpen,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  CreditCard,
  CheckSquare,
  Building2,
  Activity,
  Receipt,
  PieChart,
  Warehouse,
  Factory,
  ClipboardList,
  ArrowLeftRight,
  ShoppingCart,
  FileText,
  BarChart3,
  Calculator,
  Percent,
  Calendar,
  User,
  UserCog,
  Globe,
  Tag,
  Lock,
  Bell,
  ClipboardCheck,
  Rocket,
  Target,
  Scale,
  CalendarClock,
  Award
} from 'lucide-react';

interface SubModule {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface Module {
  id?: string; // Adicionado para corresponder ao DB
  name: string;
  href: string;
  icon: React.ElementType;
  color: string;
  slug: string; // Adicionado para corresponder ao DB
  subModules?: SubModule[];
}

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { temAcessoModulo, temAcessoAba, usuario, permissoes } = useAuth();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  
  // Define navigation structure with submodules
  const navigation: Module[] = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, color: 'from-blue-500 to-blue-600', slug: 'dashboard' },
    { 
      name: 'Financeiro', 
      href: '/finance', 
      icon: DollarSign, 
      color: 'from-green-500 to-emerald-600',
      slug: 'financeiro',
      subModules: [
        { name: 'Fluxo de Caixa', href: '/finance?tab=0', icon: TrendingUp },
        { name: 'Resumo do Dia', href: '/finance?tab=1', icon: Calendar },
        { name: 'Extrato Diário', href: '/finance?tab=2', icon: FileText },
        { name: 'Contas a Pagar', href: '/finance?tab=3', icon: CreditCard },
        { name: 'Contas a Receber', href: '/finance?tab=4', icon: Receipt },
        { name: 'Histórico e Estornos', href: '/finance?tab=5', icon: ArrowLeftRight },
        { name: 'Categorizar Lançamentos', href: '/finance?tab=6', icon: Tag },
        { name: 'Ficha Fornecedor', href: '/finance?tab=7', icon: Building2 },
        { name: 'Kardex Fornecedor', href: '/finance?tab=8', icon: Activity },
        { name: 'Kardex Completo', href: '/finance?tab=9', icon: FileText },
        { name: 'Relatórios Gerenciais', href: '/finance?tab=10', icon: PieChart },
        { name: 'Cadastros Gerais', href: '/finance?tab=11', icon: Settings }
      ]
    },
    {
      name: 'Estoque',
      href: '/advanced-inventory',
      icon: Warehouse,
      color: 'from-indigo-500 to-purple-600',
      slug: 'estoque',
      subModules: [
        { name: 'Receber mercadoria',  href: '/advanced-inventory?area=operacao&tela=receber',    icon: Package },
        { name: 'Transferir',          href: '/advanced-inventory?area=operacao&tela=transferir', icon: ArrowLeftRight },
        { name: 'Produzir',            href: '/advanced-inventory?area=operacao&tela=produzir',   icon: Factory },
        { name: 'Contagem',            href: '/advanced-inventory?area=operacao&tela=contar',     icon: ClipboardList },
        { name: 'Requisições',         href: '/advanced-inventory?area=operacao&tela=requisicoes', icon: FileText },
        { name: 'Compras',             href: '/advanced-inventory?area=compras&tela=compras',     icon: ShoppingCart },
        { name: 'Lista de Compras',    href: '/advanced-inventory?area=compras&tela=lista-compras', icon: FileText },
        { name: 'Dashboard',           href: '/advanced-inventory?area=analise&tela=dashboard',   icon: BarChart3 },
        { name: 'Extrato do Item',     href: '/advanced-inventory?area=analise&tela=kardex',      icon: Activity },
        { name: 'Posição do Estoque',  href: '/advanced-inventory?area=analise&tela=inventario',  icon: Warehouse },
        { name: 'Relatórios',          href: '/advanced-inventory?area=analise&tela=relatorios',  icon: BarChart3 },
        { name: 'ZIG Vendas',          href: '/advanced-inventory?area=analise&tela=zig',         icon: Activity },
        { name: 'Itens',               href: '/advanced-inventory?area=cadastros&tela=itens',     icon: Package },
        { name: 'Fichas Técnicas',     href: '/advanced-inventory?area=cadastros&tela=fichas',    icon: ClipboardList },
        { name: 'Estoques',            href: '/advanced-inventory?area=cadastros&tela=estoques',  icon: Warehouse },
        { name: 'Controle De Ville',   href: '/controle-deville',                                  icon: FileText },
      ]
    },
    { 
      name: 'RH', 
      href: '/staff', 
      icon: Users, 
      color: 'from-purple-500 to-violet-600',
      slug: 'rh',
      subModules: [
        { name: 'Funcionários', href: '/staff?tab=0', icon: Users },
        { name: 'Escalas', href: '/staff?tab=1', icon: CalendarDays },
        { name: 'Férias', href: '/staff?tab=2', icon: FileText },
        { name: 'Ocorrências', href: '/staff?tab=3', icon: AlertTriangle },
        { name: 'Extras/Freelancers', href: '/staff?tab=4', icon: Users },
        { name: 'Relatórios', href: '/staff?tab=7', icon: BarChart3 },
        { name: 'Gorjetas', href: '/staff?tab=8', icon: Calculator },
        { name: 'Avaliações', href: '/staff?tab=9', icon: ClipboardCheck },
        { name: 'Onboarding', href: '/staff?tab=10', icon: Rocket },
        { name: 'Perfil DISC', href: '/staff?tab=11', icon: Target },
        { name: 'Disciplinar', href: '/staff?tab=12', icon: Scale },
        { name: 'Carreira', href: '/staff?tab=13', icon: TrendingUp },
        { name: 'Datas e Marcos', href: '/staff?tab=14', icon: CalendarClock }
      ]
    },
    { name: 'Músicos', href: '/musicians', icon: Music, color: 'from-pink-500 to-rose-600', slug: 'musicos' },
    { name: 'Eventos', href: '/events', icon: CalendarDays, color: 'from-indigo-500 to-blue-600', slug: 'eventos' },
    { name: 'Ocorrências', href: '/ocorrencias', icon: AlertTriangle, color: 'from-red-500 to-rose-600', slug: 'ocorrencias' },
    { name: 'Solicitações', href: '/solicitacoes', icon: ClipboardList, color: 'from-teal-500 to-cyan-600', slug: 'solicitacoes' },
    { name: 'Manual do Usuário', href: '/manual', icon: BookOpen, color: 'from-blue-500 to-indigo-600', slug: 'manual' },
    {
      name: 'Configurações', 
      href: '/settings', 
      icon: Settings, 
      color: 'from-gray-500 to-slate-600', 
      slug: 'configuracoes',
      subModules: [
        { name: 'Perfil', href: '/settings?tab=profile', icon: User },
        { name: 'Segurança', href: '/settings?tab=security', icon: Lock },
        { name: 'Notificações', href: '/settings?tab=notifications', icon: Bell },
        { name: 'Usuários', href: '/settings?tab=users', icon: UserCog },
        { name: 'Pagamentos', href: '/settings?tab=payment', icon: CreditCard },
        { name: 'Geral', href: '/settings?tab=global', icon: Globe },
      ]
    },
  ];

  // Filtrar módulos baseado nas permissões do usuário
  const modulosPermitidos = navigation.filter(module => {
    // Manual do Usuário está disponível para todos
    if (module.slug === 'manual') {
      return true;
    }

    // Master tem acesso a tudo
    if (usuario?.nivel === 'master') {
      console.log(`[Sidebar Debug] Master tem acesso ao módulo ${module.name}`);
      return true;
    }

    // Para outros usuários, verificar se tem acesso ao módulo
    const temAcesso = temAcessoModulo(module.slug);
    console.log(`[Sidebar Debug] Usuário ${usuario?.nome_completo} (${usuario?.nivel}) verificando acesso ao módulo ${module.name} (slug: ${module.slug}):`, temAcesso);
    console.log(`[Sidebar Debug] Permissões do usuário para módulo ${module.slug}:`, permissoes.filter(p => p.modulo_slug === module.slug));
    return temAcesso;
  });

  console.log('[Sidebar Debug] Módulos permitidos:', modulosPermitidos.map(m => m.name));
  console.log('[Sidebar Debug] Total de permissões carregadas:', permissoes.length);

  // Determine which module should be expanded based on current path
  useEffect(() => {
    const currentModule = modulosPermitidos.find(module => 
      location.pathname === module.href || 
      (module.subModules && module.subModules.some(sub => location.pathname + location.search === sub.href))
    );
    
    if (currentModule && currentModule.subModules) {
      // Check if any submodule is active, if so, expand the parent module
      const activeSubmodule = currentModule.subModules.find(sub => location.pathname + location.search === sub.href);
      if (activeSubmodule) {
        setExpandedModule(currentModule.name);
      } else {
        // If no submodule is active, but the parent module itself is, expand it
        if (location.pathname === currentModule.href) {
          setExpandedModule(currentModule.name);
        }
      }
      
    }
  }, [location]);

  const toggleModule = (moduleName: string) => {
    if (expandedModule === moduleName) {
      setExpandedModule(null);
    } else {
      setExpandedModule(moduleName);
    }
  };

  const handleModuleClick = (item: Module) => {
    if (item.subModules && item.subModules.length > 0) {
      // If has submodules, toggle expansion
      toggleModule(item.name); // Use name for UI expansion state
    } else {
      // If no submodules, navigate directly to the route
      navigate(item.href);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Informações do usuário */}
      {usuario && (
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-[#7D1F2C] flex items-center justify-center text-white text-sm font-medium mr-3">
              {usuario.nome_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {usuario.nome_completo}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {usuario.cargo || usuario.nivel}
              </p>
            </div>
          </div>
        </div>
      )}
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {modulosPermitidos.map((item) => {
          const isActive = location.pathname === item.href;
          const isExpanded = expandedModule === item.name;
          const hasSubModules = item.subModules && item.subModules.length > 0;
          
          return (
            <div key={item.name} className="space-y-1">
              <button
                className={`flex items-center justify-between w-full px-4 py-3.5 text-sm font-medium rounded-xl transition-all duration-300 transform hover:scale-[1.02] ${
                  isActive
                    ? 'bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] text-white shadow-lg shadow-[#7D1F2C]/25'
                    : 'text-white/80 hover:bg-white/60 hover:shadow-md hover:text-white'
                }`}
                onClick={() => handleModuleClick(item)}
              >
                <div className="flex items-center">
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-white rounded-r-full"></div>
                  )}
                  
                  {/* Icon with gradient background for active state */}
                  <div className={`relative mr-4 p-2 rounded-lg transition-all duration-300 ${
                    isActive 
                      ? 'bg-white/20' 
                      : 'bg-gray-100 group-hover:bg-white'
                  }`}>
                    <item.icon
                      className={`h-5 w-5 transition-all duration-300 ${
                        isActive 
                          ? 'text-white' 
                          : 'text-gray-600 group-hover:text-white/90'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  
                  <span className="flex-1 text-left">{item.name}</span>
                </div>
                
                {hasSubModules && (
                  <div className="ml-2">
                    {isExpanded ? (
                      <ChevronDown className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                    ) : (
                      <ChevronRight className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                    )}
                  </div>
                )}
              </button>
              
              {/* Submodules */}
              {hasSubModules && isExpanded && (
                <div className="pl-4 mt-1 space-y-1">
                  {item.subModules
                    ?.filter(subItem => {
                      // Master tem acesso a tudo
                      if (usuario?.nivel === 'master') {
                        console.log(`[Sidebar Debug] Master tem acesso à aba ${subItem.name} (módulo: ${item.slug})`);
                        return true;
                      }
                      
                      // Dashboard sub-modules são permitidos se tem acesso ao módulo pai
                      if (item.slug === 'estoque') return true; // area= links don't use tab= numbering
                      if (item.slug === 'financeiro' && subItem.href === '/finance?tab=0') return true;
                      if (item.slug === 'rh' && subItem.href === '/staff?tab=0') return true;
                      if (item.slug === 'solicitacoes' && subItem.href === '/solicitacoes?tab=0') return true;
                      
                      // Para outras abas, extrair o slug da URL
                      let abaSlug = '';
                      if (subItem.href.includes('tab=')) {
                        abaSlug = subItem.href.split('tab=')[1];
                      } else {
                        // Se não tem 'tab=', o slug é o próprio href (ex: /settings?tab=profile -> profile)
                        // Ou se for um path direto, como /musicians, mas aqui estamos dentro de subModules
                        // Então, para sub-módulos sem 'tab=', o slug é o último segmento do path
                        const pathSegments = subItem.href.split('/');
                        abaSlug = pathSegments[pathSegments.length - 1].split('?')[0];
                      }
                      
                      const temAcesso = temAcessoAba(item.slug, abaSlug);
                      console.log(`[Sidebar Debug] Usuário ${usuario?.nome_completo} (${usuario?.nivel}) verificando acesso à aba ${subItem.name} (módulo: ${item.slug}, abaSlug: ${abaSlug}):`, temAcesso);
                      return temAcesso;
                    })
                    .map((subItem) => {
                    const isSubActive = location.pathname + location.search === subItem.href;
                    
                    return (
                      <Link
                        key={subItem.name}
                        to={subItem.href}
                        className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                          isSubActive
                            ? 'bg-[#7D1F2C]/10 text-[#7D1F2C] font-semibold'
                            : 'text-gray-600 hover:bg-[#7D1F2C]/5 hover:text-[#7D1F2C]'
                        }`}
                      >
                        <subItem.icon className="w-4 h-4 mr-3" />
                        <span>{subItem.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Debug info - apenas em desenvolvimento */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 bg-gray-100 rounded text-xs">
            <div className="font-semibold mb-1">Debug Info:</div>
            <div>Usuário: {usuario?.nome_completo} ({usuario?.nivel})</div>
            <div>Módulos: {modulosPermitidos.length}/{navigation.length}</div>
            <div>Permissões: {permissoes.length}</div>
            {modulosPermitidos.length === 0 && (
              <div className="text-red-600 mt-1">
                ⚠️ Nenhum módulo disponível para este usuário
              </div>
            )}
          </div>
        )}
      </nav>
      
      {/* Indicador de nível de acesso */}
      {usuario && (
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Nível de Acesso</span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              usuario.nivel === 'master' ? 'bg-red-100 text-red-700' :
              usuario.nivel === 'admin' ? 'bg-purple-100 text-purple-700' :
              usuario.nivel === 'usuario' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-white/80'
            }`}>
              {usuario.nivel === 'master' ? 'Master' :
               usuario.nivel === 'admin' ? 'Admin' :
               usuario.nivel === 'usuario' ? 'Usuário' :
               'Visitante'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;