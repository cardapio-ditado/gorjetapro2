import type { LucideIcon } from 'lucide-react';
import {
  BookOpen, CalendarDays, DollarSign, Home, Music, Palette, Settings, Star, Target, TrendingUp, Users, Warehouse,
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
  { label: 'RH — Extras',             path: '/staff?tab=4',                                         icon: Users },
  { label: 'RH — Funções',            path: '/staff?tab=5',                                         icon: Users },
  { label: 'RH — Configurações',      path: '/staff?tab=6',                                         icon: Users },
  { label: 'RH — Relatórios',         path: '/staff?tab=7',                                         icon: Users },
  { label: 'RH — Gorjetas',           path: '/staff?tab=8',                                         icon: Users },
  { label: 'Recrutamento',            path: '/recruitment',                                          icon: Users, apelidos: 'vaga currículo entrevista' },
  // Músicos & Eventos
  { label: 'Músicos',                 path: '/musicians',                                            icon: Music, apelidos: 'show agenda banda' },
  { label: 'Eventos',                 path: '/events',                                               icon: CalendarDays, apelidos: 'festa reserva' },
  // Financeiro
  { label: 'Financeiro — Fluxo de Caixa',        path: '/finance?tab=fluxo',             icon: DollarSign },
  { label: 'Financeiro — Fechamento de Sócios',  path: '/finance?tab=fechamento',        icon: DollarSign },
  { label: 'Financeiro — Faturamento (ZIG)',     path: '/finance?tab=faturamento',       icon: DollarSign },
  { label: 'Financeiro — Extrato Diário',        path: '/finance?tab=extrato',           icon: DollarSign },
  { label: 'Financeiro — Contas a Pagar',        path: '/finance?tab=pagar',             icon: DollarSign, apelidos: 'boleto fornecedor pagar' },
  { label: 'Financeiro — Contas a Receber',      path: '/finance?tab=receber',           icon: DollarSign },
  { label: 'Financeiro — Histórico / Estornos',  path: '/finance?tab=historico',         icon: DollarSign },
  { label: 'Financeiro — Categorizar',           path: '/finance?tab=categorizar',       icon: DollarSign },
  { label: 'Financeiro — Ficha Fornecedor',      path: '/finance?tab=ficha-fornecedor',  icon: DollarSign },
  { label: 'Financeiro — Kardex Fornecedor',     path: '/finance?tab=kardex-fornecedor', icon: DollarSign },
  { label: 'Financeiro — Kardex Completo',       path: '/finance?tab=kardex-completo',   icon: DollarSign },
  { label: 'Financeiro — Relatórios',            path: '/finance?tab=relatorios',        icon: DollarSign },
  { label: 'Financeiro — Cadastros',             path: '/finance?tab=cadastros',         icon: DollarSign },
  { label: 'Dashboard Financeiro',               path: '/financeiro',       icon: DollarSign },
  { label: 'ZIG Recebimentos',                   path: '/zig-recebimentos', icon: DollarSign },
  { label: 'DRE Simplificado',                   path: '/dre-simplificado', icon: DollarSign, apelidos: 'resultado lucro' },
  // Estoque
  { label: 'Estoque — Configurar setores',  path: '/setores',                                           icon: Warehouse, apelidos: 'bar cozinha nível zig contagem balcão' },
  { label: 'Estoque — Configurar Central',  path: '/estoque-beta2?tela=central',                         icon: Warehouse, apelidos: 'ponto de pedido mínimo compras automático' },
  { label: 'Estoque — Kits de limpeza',     path: '/estoque-beta2?tela=kits',                            icon: Warehouse, apelidos: 'garçons cozinha bar serviços gerais' },
  { label: 'Estoque — Contagem do Central',  path: '/estoque-beta2?tela=contagem_central',                icon: Warehouse, apelidos: 'zonas blocos ciclo agenda contar central' },
  { label: 'Estoque — Empréstimo com vizinhos', path: '/estoque-beta2?tela=vizinhos',                     icon: Warehouse, apelidos: 'emprestar pegar emprestado devolver bar vizinho' },
  { label: 'Estoque — Relatórios (Beta 2)', path: '/estoque-beta2?tela=relatorios',                      icon: Warehouse, apelidos: 'inventário cmv curva abc perdas parados contagens compras' },
  { label: 'Estoque — Kardex por produto',  path: '/estoque-beta2?tela=kardex',                          icon: Warehouse, apelidos: 'extrato saldo item' },
  { label: 'Estoque — Kardex por fornecedor', path: '/estoque-beta2?tela=kardex_fornecedor',             icon: Warehouse, apelidos: 'preço fornecedor variação' },
  { label: 'Estoque — Receber Mercadoria',  path: '/advanced-inventory?area=operacao&tela=receber',     icon: Warehouse, apelidos: 'nota entrada' },
  { label: 'Estoque — Transferir',          path: '/advanced-inventory?area=operacao&tela=transferir',  icon: Warehouse },
  { label: 'Estoque — Produzir',            path: '/advanced-inventory?area=operacao&tela=produzir',    icon: Warehouse },
  { label: 'Estoque — Contagem',            path: '/advanced-inventory?area=operacao&tela=contar',      icon: Warehouse, apelidos: 'contar inventário' },
  { label: 'Estoque — Requisições',         path: '/advanced-inventory?area=operacao&tela=requisicoes', icon: Warehouse },
  { label: 'Estoque — Compras',             path: '/advanced-inventory?area=compras&tela=dia',          icon: Warehouse, apelidos: 'comprar lista rua fornecedor' },
  { label: 'Estoque — Dashboard',           path: '/advanced-inventory?area=analise&tela=dashboard',    icon: Warehouse },
  { label: 'Estoque — Extrato do Item',     path: '/advanced-inventory?area=analise&tela=kardex',       icon: Warehouse, apelidos: 'kardex histórico' },
  { label: 'Estoque — Posição do Estoque',  path: '/advanced-inventory?area=analise&tela=inventario',   icon: Warehouse, apelidos: 'saldo' },
  { label: 'Estoque — Relatórios',          path: '/advanced-inventory?area=analise&tela=relatorios',   icon: Warehouse },
  { label: 'Estoque — ZIG Vendas',          path: '/advanced-inventory?area=analise&tela=zig',          icon: Warehouse },
  { label: 'Estoque — Itens',               path: '/advanced-inventory?area=cadastros&tela=itens',      icon: Warehouse, apelidos: 'produto insumo cadastro' },
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
