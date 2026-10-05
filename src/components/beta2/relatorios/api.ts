import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, BarChart3, BookOpen, ClipboardCheck, Clock3, FileText, History, ListOrdered, Package, PackageX, Percent, ShoppingCart, Store, TrendingDown, Truck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

/**
 * Relatórios do Beta 2. Todos vêm de fn_relatorio(tipo, p) no mesmo desenho,
 * então a tela é uma só: cartões, grupos com linhas, exportar.
 */
export type TipoColuna = 'texto' | 'int' | 'num' | 'brl' | 'pct' | 'data' | 'datahora';
export interface Coluna { k: string; r: string; t: TipoColuna }
export interface Kpi { rotulo: string; valor: number | string | null; formato: 'brl' | 'int' | 'num' | 'pct' | 'texto'; detalhe: string | null; tom: 'normal' | 'destaque' | 'alerta' | 'atencao' | 'certo' }
export type Linha = Record<string, string | number | null>;
export interface Grupo { titulo: string; n: number; valor?: number | null; colunas?: Coluna[]; linhas: Linha[] }
export interface Relatorio { titulo: string; subtitulo: string; kpis: Kpi[]; colunas: Coluna[]; grupos: Grupo[]; avisos: string[] }
export interface Parametros { de?: string; ate?: string; estoque_id?: string | null; item_id?: string | null; fornecedor_id?: string | null; dias?: number }

export type Filtro = 'periodo' | 'estoque' | 'fornecedor' | 'item' | 'dias';
export interface Definicao { tipo: string; nome: string; descricao: string; icon: LucideIcon; filtros: Filtro[]; grupo: 'posicao' | 'movimento' | 'compras' | 'cadastro' | 'legado' }

/** O catálogo da tela. Ordem = ordem dos cartões. */
export const RELATORIOS: Definicao[] = [
  { tipo: 'inventario', nome: 'Inventário', descricao: 'Saldo e valor de hoje, por estoque ou por categoria', icon: Package, filtros: ['estoque'], grupo: 'posicao' },
  { tipo: 'parados', nome: 'Itens parados', descricao: 'Com saldo e sem saída há mais de N dias', icon: PackageX, filtros: ['estoque', 'dias'], grupo: 'posicao' },
  { tipo: 'abc', nome: 'Curva ABC', descricao: 'Os itens que fazem 80% do custo das vendas', icon: ListOrdered, filtros: ['periodo'], grupo: 'posicao' },
  { tipo: 'cmv', nome: 'CMV', descricao: 'Custo da mercadoria vendida e consumo por setor', icon: Percent, filtros: ['periodo'], grupo: 'posicao' },
  { tipo: 'contagens', nome: 'Contagens', descricao: 'Cada contagem do período e suas diferenças', icon: ClipboardCheck, filtros: ['periodo', 'estoque'], grupo: 'movimento' },
  { tipo: 'perdas', nome: 'Perdas e divergências', descricao: 'Diferenças das contagens somadas por item', icon: TrendingDown, filtros: ['periodo', 'estoque'], grupo: 'movimento' },
  { tipo: 'reposicao', nome: 'Reposição dos setores', descricao: 'O que saiu do Central para cada setor e kit', icon: Store, filtros: ['periodo', 'estoque'], grupo: 'movimento' },
  { tipo: 'pedidos', nome: 'Pedidos e retiradas', descricao: 'Pedidos dos setores e retiradas fora de hora', icon: Clock3, filtros: ['periodo', 'estoque'], grupo: 'movimento' },
  { tipo: 'kardex_produto', nome: 'Kardex por produto', descricao: 'Extrato de um item com o saldo linha a linha', icon: History, filtros: ['item', 'estoque', 'periodo'], grupo: 'movimento' },
  { tipo: 'compras', nome: 'Compras', descricao: 'Notas recebidas, por fornecedor', icon: ShoppingCart, filtros: ['periodo', 'fornecedor'], grupo: 'compras' },
  { tipo: 'kardex_fornecedor', nome: 'Kardex por fornecedor', descricao: 'O que cada fornecedor vendeu e como o preço andou', icon: Truck, filtros: ['periodo', 'fornecedor'], grupo: 'compras' },
  { tipo: 'itens', nome: 'Lista de itens', descricao: 'Cadastro ativo com classe, ponto e custo', icon: FileText, filtros: [], grupo: 'cadastro' },
  { tipo: 'fichas', nome: 'Fichas técnicas', descricao: 'Custo de cada ficha, por tipo', icon: BookOpen, filtros: [], grupo: 'cadastro' },
  // Antes do marco zero de 05/10/2026 (esquema legado, só leitura)
  { tipo: 'legado_saldos', nome: 'Saldos em 04/10', descricao: 'Como o estoque estava antes do marco zero', icon: Package, filtros: ['estoque'], grupo: 'legado' },
  { tipo: 'legado_movimentacoes', nome: 'Movimentações antigas', descricao: 'Entradas, saídas e transferências até 04/10', icon: ArrowLeftRight, filtros: ['periodo', 'estoque', 'item'], grupo: 'legado' },
  { tipo: 'legado_kardex', nome: 'Kardex antigo', descricao: 'Extrato de um item até 04/10', icon: History, filtros: ['item', 'estoque', 'periodo'], grupo: 'legado' },
  { tipo: 'legado_contagens', nome: 'Contagens antigas', descricao: 'Contagens e diferenças até 04/10', icon: ClipboardCheck, filtros: ['periodo', 'estoque'], grupo: 'legado' },
];
export const GRUPOS_REL: Array<{ id: Definicao['grupo']; titulo: string; icon: LucideIcon }> = [
  { id: 'posicao', titulo: 'Posição e custo', icon: BarChart3 },
  { id: 'movimento', titulo: 'Movimento', icon: ArrowLeftRight },
  { id: 'compras', titulo: 'Compras', icon: ShoppingCart },
  { id: 'cadastro', titulo: 'Cadastro', icon: FileText },
  { id: 'legado', titulo: 'Histórico até 04/10 (legado)', icon: History },
];

export const relatoriosApi = {
  async gerar(tipo: string, p: Parametros): Promise<Relatorio> {
    const { data, error } = await supabase.rpc('fn_relatorio', { p_tipo: tipo, p });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Relatório não existe');
    const r = data as Relatorio;
    return { ...r, kpis: r.kpis || [], colunas: r.colunas || [], grupos: r.grupos || [], avisos: r.avisos || [] };
  },
};

/** CSV com ; e BOM: abre certo no Excel em português. */
export function csvDoRelatorio(r: Relatorio): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas: string[] = [];
  for (const g of r.grupos) {
    const cols = g.colunas || r.colunas;
    linhas.push(esc(g.titulo));
    linhas.push(cols.map(c => esc(c.r)).join(';'));
    for (const l of g.linhas) linhas.push(cols.map(c => { const v = l[c.k]; return esc(typeof v === 'number' ? String(v).replace('.', ',') : v); }).join(';'));
    linhas.push('');
  }
  return '﻿' + linhas.join('\n');
}
