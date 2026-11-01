import type { LucideIcon } from 'lucide-react';
import {
  Beer, BookOpen, CalendarDays, ChefHat, DollarSign, Gamepad2, Martini, Home, Music, Palette, Settings, Star, Target, TrendingUp, UserPlus, Users, Warehouse, Wine,
} from 'lucide-react';

/** Uma tela que a busca do topo sabe abrir. */
export interface RotaBusca {
  label: string;
  path: string;
  icon?: LucideIcon;
  /** Palavras extras que a pessoa pode digitar: "boleto" acha Contas a Pagar. */
  apelidos?: string;
}

/**
 * Toda tela do sistema, uma vez, para a busca do topo. É a lista que a
 * paleta (Ctrl K) consulta antes de procurar itens no banco.
 */
export const ROTAS_BUSCA: RotaBusca[] = [
  { label: 'Dashboard',               path: '/',                                                    icon: Home },
  { label: 'Agenda do Dia',           path: '/agenda-diaria',                                       icon: CalendarDays, apelidos: 'hoje turno' },
  { label: 'Portal do Gerente',       path: '/portal-gerente',                                      icon: Home },
  // RH
  { label: 'RH — Colaboradores',      path: '/staff?tab=0',                                         icon: Users, apelidos: 'funcionários equipe' },
  { label: 'RH — Escalas',            path: '/staff?tab=1',                                         icon: Users },
  { label: 'RH — Férias',             path: '/staff?tab=2',                                         icon: Users },
  { label: 'RH — Ocorrências',        path: '/staff?tab=3',                                         icon: Users },
  { label: 'RH — Funções',            path: '/staff?tab=4',                                         icon: Users },
  { label: 'RH — Configurações',      path: '/staff?tab=5',                                         icon: Users },
  { label: 'RH — Relatórios',         path: '/staff?tab=6',                                         icon: Users },
  { label: 'RH — Gorjetas',           path: '/staff?tab=7',                                         icon: Users },
  { label: 'Recrutamento',            path: '/recruitment',                                          icon: Users, apelidos: 'vaga currículo entrevista' },
  // Músicos & Eventos
  { label: 'Clube do Whisky',         path: '/clube-whisky',                                         icon: Wine, apelidos: 'garrafa guardada whisky clube socio' },
  { label: 'Livro da Noite',          path: '/livro',                                                icon: BookOpen, apelidos: 'ocorrencias ocorrencia diario caixa noite gerente' },
  { label: 'A Casa ao Vivo',          path: '/casa',                                                 icon: Gamepad2, apelidos: 'maquete jogo clientes garcom praca 3d tempo real' },
  { label: 'KDS da Cozinha',          path: '/kds',                                                  icon: ChefHat, apelidos: 'cozinha pedidos pratos tempo tablet fila preparo' },
  { label: 'KDS do Bar',              path: '/kds/bar',                                              icon: Beer, apelidos: 'bar chopp cerveja pedidos tempo tablet fila' },
  { label: 'KDS de Drinks',           path: '/kds/drinks',                                           icon: Martini, apelidos: 'drinks caipirinha dose garrafa pedidos tempo tablet fila' },
  { label: 'Extras',                  path: '/extras',                                               icon: UserPlus, apelidos: 'diarista freelancer freela diaria' },
  { label: 'Músicos',                 path: '/musicians',                                            icon: Music, apelidos: 'show agenda banda' },
  { label: 'Eventos',                 path: '/events',                                               icon: CalendarDays, apelidos: 'festa reserva' },
  // Financeiro
  { label: 'Financeiro — Painel',                 path: '/financeiro',                          icon: DollarSign, apelidos: 'dashboard resultado lucro margem saldo' },
  { label: 'Financeiro — Contas a Pagar',         path: '/finance?tab=pagar',                   icon: DollarSign, apelidos: 'boleto fornecedor pagar baixa' },
  { label: 'Financeiro — Pagamentos e Estornos',  path: '/finance?tab=pagar&ver=historico',     icon: DollarSign, apelidos: 'estorno historico' },
  { label: 'Financeiro — Contas a Receber',       path: '/finance?tab=receber',                 icon: DollarSign },
  { label: 'Financeiro — Movimentações',          path: '/finance?tab=fluxo',                   icon: DollarSign, apelidos: 'fluxo de caixa extrato lancamento' },
  { label: 'Financeiro — Extrato do dia',         path: '/finance?tab=fluxo&ver=dia',           icon: DollarSign, apelidos: 'extrato diario' },
  { label: 'Financeiro — Categorizar',            path: '/finance?tab=fluxo&ver=categorizar',   icon: DollarSign, apelidos: 'sem categoria' },
  { label: 'Financeiro — Conciliação Bancária',   path: '/finance?tab=conciliacao',             icon: DollarSign, apelidos: 'stone extrato banco pix ofx' },
  { label: 'Financeiro — Vendas ZIG',             path: '/finance?tab=faturamento',             icon: DollarSign, apelidos: 'faturamento venda' },
  { label: 'Financeiro — Fornecedores',           path: '/finance?tab=fornecedor',              icon: DollarSign, apelidos: 'ficha kardex fornecedor' },
  { label: 'Financeiro — Fechamento de Sócios',   path: '/finance?tab=relatorios&ver=fechamento', icon: DollarSign, apelidos: 'socios sobrou' },
  { label: 'Financeiro — DRE',                    path: '/finance?tab=relatorios&ver=dre',      icon: DollarSign, apelidos: 'resultado lucro dre' },
  { label: 'Financeiro — Relatórios Gerenciais',  path: '/finance?tab=relatorios&ver=gerenciais', icon: DollarSign },
  { label: 'Financeiro — Cadastros',              path: '/finance?tab=cadastros',               icon: DollarSign, apelidos: 'categoria forma pagamento banco cliente' },
  { label: 'ZIG Recebimentos',                    path: '/zig-recebimentos',                    icon: DollarSign },
  // Estoque
  { label: 'Estoque — Configurar setores',  path: '/setores',                                           icon: Warehouse, apelidos: 'bar cozinha nível zig contagem balcão' },
  { label: 'Estoque — Configurar Central',  path: '/estoque-beta2?tela=central',                         icon: Warehouse, apelidos: 'ponto de pedido mínimo compras automático' },
  { label: 'Estoque — Kits de limpeza',     path: '/estoque-beta2?tela=kits',                            icon: Warehouse, apelidos: 'garçons cozinha bar serviços gerais' },
  { label: 'Estoque — Vínculos da Zig',      path: '/estoque-beta2?tela=zig',                             icon: Warehouse, apelidos: 'mapeamento zig produto item ficha baixa' },
  { label: 'Estoque — Contagem do Central',  path: '/estoque-beta2?tela=contagem_central',                icon: Warehouse, apelidos: 'zonas blocos ciclo agenda contar central' },
  { label: 'Estoque — Produção',           path: '/estoque-beta2?tela=producao',                        icon: Warehouse, apelidos: 'produzir ficha lote insumo central produção' },
  { label: 'Estoque — Mover entre estoques',  path: '/estoque-beta2?tela=mover',                           icon: Warehouse, apelidos: 'transferir transferência devolver central setor' },
  { label: 'Estoque — Empréstimo com vizinhos', path: '/estoque-beta2?tela=vizinhos',                     icon: Warehouse, apelidos: 'emprestar pegar emprestado devolver bar vizinho' },
  { label: 'Estoque — Relatórios', path: '/estoque-beta2?tela=relatorios',                      icon: Warehouse, apelidos: 'inventário cmv curva abc perdas parados contagens compras' },
  { label: 'Estoque — Kardex por produto',  path: '/estoque-beta2?tela=kardex',                          icon: Warehouse, apelidos: 'extrato saldo item' },
  { label: 'Estoque — Kardex por fornecedor', path: '/estoque-beta2?tela=kardex_fornecedor',             icon: Warehouse, apelidos: 'preço fornecedor variação' },
  { label: 'Estoque — Fichas Técnicas',     path: '/advanced-inventory?area=cadastros&tela=fichas',     icon: Warehouse, apelidos: 'receita' },
  { label: 'Estoque — Estoques',            path: '/advanced-inventory?area=cadastros&tela=estoques',   icon: Warehouse },
  { label: 'Controle De Ville',             path: '/controle-deville',                                  icon: Warehouse },
  // Estratégico & Fidelidade
  { label: 'OKRs Estratégicos',             path: '/gestao-estrategica',                                icon: TrendingUp, apelidos: 'metas' },
  { label: 'Fidelidade — Sincronização',    path: '/fidelidade',                                        icon: Star },
  { label: 'Fidelidade — Buscar Cliente',   path: '/fidelidade?tab=busca',                              icon: Star },
  { label: 'Fidelidade — Aniversariantes',  path: '/fidelidade?tab=aniversario',                        icon: Star },
  { label: 'Fidelidade — Rankings',         path: '/fidelidade?tab=rankings',                           icon: Star },
  { label: 'Fidelidade — Gatilhos de Prêmio', path: '/fidelidade?tab=gatilhos',                         icon: Star },
  { label: 'Fidelidade — Programa de Pontos', path: '/fidelidade?tab=pontos',                           icon: Star },
  // Sistema
  { label: 'Metas & Tarefas',  path: '/metas-tarefas',  icon: Target },
  { label: 'Manual',           path: '/manual',          icon: BookOpen, apelidos: 'ajuda' },
  { label: 'Configurações',    path: '/settings',        icon: Settings },
  { label: 'Kit de padrões',   path: '/kit',             icon: Palette, apelidos: 'design layout cores' },
];
