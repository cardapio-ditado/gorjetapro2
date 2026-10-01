import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ArrowRight, Package, Users, ClipboardCheck, Truck, Store, Clock3, BarChart3, Warehouse, BookOpen, Settings2, SprayCan, ShoppingCart, FileText, ArrowLeftRight, Handshake, ShieldCheck, Sliders, History } from 'lucide-react';
import { Badge, Button, SectionCard } from '../components/ui';
import ConfigurarSetores from './ConfigurarSetores';
import Hoje, { type DestinoHoje } from '../components/beta2/Hoje';
import Kits from '../components/beta2/Kits';
import Itens from '../components/beta2/cadastros/Itens';
import Estoques from '../components/beta2/cadastros/Estoques';
import Fornecedores from '../components/beta2/cadastros/Fornecedores';
import Fichas from '../components/beta2/cadastros/Fichas';
import ConfigurarCentral from '../components/beta2/ConfigurarCentral';
import Recebimento from '../components/beta2/Recebimento';
import Reposicao from '../components/beta2/Reposicao';
import Movimentos from '../components/beta2/Movimentos';
import Movimentacoes from '../components/beta2/Movimentacoes';
import Contagem from '../components/beta2/Contagem';
import Aprovacoes from '../components/beta2/Aprovacoes';
import Compras from '../components/beta2/compras/Compras';
import RelatoriosEstoque from '../components/inventory/RelatoriosEstoque';
import KardexProduto from '../components/inventory/KardexProduto';
import ContagemEstoque from '../components/inventory/contagem/ContagemEstoque';

/**
 * Estoque Beta 2: a porta única do estoque. Entrada "Hoje" por pessoa e os
 * sete grupos do dono. A tela escolhida vai na URL (?tela=…), então voltar
 * do navegador funciona e dá para mandar link direto.
 */
type View = 'menu' | 'itens' | 'fichas' | 'estoques' | 'fornecedores' | 'setores' | 'central' | 'kits'
  | 'recebimento' | 'reposicao' | 'emergencias' | 'movimentacoes'
  | 'contagem' | 'contagem_central' | 'aprovacoes' | 'compras' | 'relatorios' | 'kardex';
const VIEWS: View[] = ['menu', 'itens', 'fichas', 'estoques', 'fornecedores', 'setores', 'central', 'kits', 'recebimento', 'reposicao', 'emergencias', 'movimentacoes', 'contagem', 'contagem_central', 'aprovacoes', 'compras', 'relatorios', 'kardex'];
const TITULOS: Record<View, string> = {
  menu: 'Estoque Beta 2', itens: 'Itens do estoque', fichas: 'Fichas técnicas', estoques: 'Estoques', fornecedores: 'Fornecedores', setores: 'Configurar setores', central: 'Configurar Central', kits: 'Kits de limpeza',
  recebimento: 'Receber compras', reposicao: 'Repor os setores', emergencias: 'Retiradas e pedidos', movimentacoes: 'Movimentações',
  contagem: 'Contagem dos setores', contagem_central: 'Contagem do Central', aprovacoes: 'Aprovar diferenças', compras: 'Compras', relatorios: 'Relatórios', kardex: 'Kardex por produto',
};
/** grava = mexe em dado real · breve = ainda não existe */
type Estado = 'grava' | 'breve';
type MenuItem = { v?: View; n: string; icon: React.ElementType; estado: Estado; dica?: string };
type MenuGrupo = { id: string; title: string; hint: string; items: MenuItem[] };
const GRUPOS: MenuGrupo[] = [
  { id: 'cadastros', title: '1 · Cadastros', hint: 'Itens, estoques, fichas e fornecedores', items: [
    { v: 'itens', n: 'Itens do estoque', icon: Package, estado: 'grava' },
    { v: 'estoques', n: 'Estoques', icon: Warehouse, estado: 'grava' },
    { v: 'fichas', n: 'Fichas técnicas', icon: BookOpen, estado: 'grava' },
    { v: 'fornecedores', n: 'Fornecedores', icon: Users, estado: 'grava' },
  ] },
  { id: 'configuracao', title: '2 · Configuração', hint: 'O que fica onde, quanto deve ter, como sai', items: [
    { v: 'setores', n: 'Configurar setores e kits', icon: Settings2, estado: 'grava', dica: 'itens, nível e saída por setor' },
    { v: 'central', n: 'Configurar Central', icon: Sliders, estado: 'grava', dica: 'ponto de pedido: seu número ou calculado' },
  ] },
  { id: 'movimentacoes', title: '3 · Movimentações', hint: 'Entradas, reposição, retiradas, empréstimos', items: [
    { v: 'recebimento', n: 'Receber compras', icon: Truck, estado: 'grava', dica: 'nota com foto, confere e dá entrada' },
    { v: 'reposicao', n: 'Repor os setores', icon: Store, estado: 'grava', dica: 'o que falta até o nível, sai do Central num toque' },
    { v: 'emergencias', n: 'Retiradas e pedidos', icon: Clock3, estado: 'grava', dica: 'pedido do setor; retirada fora de hora com conferência' },
    { n: 'Empréstimo com vizinhos', icon: Handshake, estado: 'breve' },
    { v: 'movimentacoes', n: 'Movimentações (histórico)', icon: ArrowLeftRight, estado: 'grava', dica: 'tudo que entrou, saiu e andou' },
  ] },
  { id: 'contagem', title: '4 · Contagem', hint: 'Setores todo dia, auditoria seg · qui · sáb, Central por zonas', items: [
    { v: 'contagem', n: 'Contagem dos setores', icon: ClipboardCheck, estado: 'grava', dica: 'diária e auditoria geral' },
    { v: 'contagem_central', n: 'Contagem do Central', icon: ClipboardCheck, estado: 'grava', dica: 'por zonas, no ciclo' },
    { v: 'aprovacoes', n: 'Aprovar diferenças', icon: ShieldCheck, estado: 'grava', dica: 'Cristiano ou Kadu' },
  ] },
  { id: 'compras', title: '5 · Compras', hint: 'Pelo ponto de pedido do Central', items: [
    { v: 'compras', n: 'Compras', icon: ShoppingCart, estado: 'grava' },
  ] },
  { id: 'relatorios', title: '6 · Relatórios', hint: 'Inventário, kardex, contagens, CMV', items: [
    { v: 'relatorios', n: 'Relatórios', icon: BarChart3, estado: 'grava' },
    { v: 'kardex', n: 'Kardex por produto', icon: History, estado: 'grava' },
    { n: 'Kardex por fornecedor · CMV', icon: FileText, estado: 'breve' },
  ] },
  { id: 'kits', title: '7 · Kits de limpeza', hint: 'Garçons, cozinha, bar e serviços gerais', items: [
    { v: 'kits', n: 'Kits de limpeza', icon: SprayCan, estado: 'grava', dica: 'repor do Central num toque' },
  ] },
];

const EstoqueBeta2: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const telaParam = params.get('tela');
  const view: View = params.has('setor') && !telaParam ? 'setores' : (VIEWS.includes(telaParam as View) ? (telaParam as View) : 'menu');
  const go = (v: View, extra?: Record<string, string>) => {
    const q = new URLSearchParams();
    if (v !== 'menu') q.set('tela', v);
    if (extra) Object.entries(extra).forEach(([k, val]) => q.set(k, val));
    setParams(q);
  };
  const nome = usuario?.nome_completo ?? null;
  const voltar = <Button variante="discreto" tamanho="sm" icone={<ArrowLeft size={14} />} onClick={() => go('menu')} className="mb-2 -ml-2">Estoque Beta 2</Button>;
  const irDeHoje = (d: DestinoHoje) => go(d);

  if (view === 'setores') return <div>{voltar}<ConfigurarSetores /></div>;
  if (view === 'kits') return <div>{voltar}<Kits responsavel={nome} onConfigurar={id => go('setores', { setor: id, passo: '1' })} /></div>;
  if (view === 'itens') return <div>{voltar}<Itens /></div>;
  if (view === 'estoques') return <div>{voltar}<Estoques /></div>;
  if (view === 'fornecedores') return <div>{voltar}<Fornecedores /></div>;
  if (view === 'fichas') return <div>{voltar}<Fichas /></div>;
  if (view === 'central') return <div>{voltar}<ConfigurarCentral /></div>;
  if (view === 'recebimento') return <Recebimento onVoltar={() => go('menu')} />;
  if (view === 'reposicao') return <Reposicao responsavel={nome} onVoltar={() => go('menu')} />;
  if (view === 'emergencias') return <Movimentos responsavel={nome} onVoltar={() => go('menu')} />;
  if (view === 'movimentacoes') return <Movimentacoes onVoltar={() => go('menu')} />;
  if (view === 'contagem') return <Contagem responsavel={nome} onVoltar={() => go('menu')} onAprovacoes={() => go('aprovacoes')} />;
  if (view === 'aprovacoes') return <Aprovacoes onVoltar={() => go('menu')} />;
  if (view === 'compras') return <Compras onVoltar={() => go('menu')} />;

  if (view === 'relatorios' || view === 'kardex' || view === 'contagem_central') return <div>
    <div className="flex items-center gap-3 flex-wrap mb-3">{voltar}<span className="t-subsec">{TITULOS[view]}</span><Badge variant="success">grava</Badge></div>
    {view === 'relatorios' && <RelatoriosEstoque />}
    {view === 'kardex' && <KardexProduto />}
    {view === 'contagem_central' && <ContagemEstoque />}
  </div>;

  return <div className="max-w-5xl">
    <Hoje onIr={irDeHoje} />
    <div className="flex items-center justify-between gap-3 mt-8 mb-3">
      <h2 className="t-subsec" style={{ margin: 0 }}>Tudo do estoque</h2>
      <span className="t-caption hidden md:inline">grava = mexe no saldo real · em breve = ainda não existe</span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {GRUPOS.map(g => <SectionCard key={g.id} title={g.title} descricao={g.hint} noPadding>
        <div className="flex flex-col">
          {g.items.map(item => {
            const breve = item.estado === 'breve';
            return <button key={item.n} type="button" disabled={breve} onClick={() => item.v && go(item.v)} className="flex items-center gap-3 px-5 min-h-12 py-2 text-left hover:bg-white/[0.04] focus-ring disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <item.icon size={16} aria-hidden="true" style={{ color: breve ? 'var(--text-secondary)' : 'var(--gold)' }} />
              <span className="flex-1 min-w-0">
                <span className="block t-body" style={{ fontWeight: breve ? 400 : 600 }}>{item.n}</span>
                {item.dica && <span className="block t-caption">{item.dica}</span>}
              </span>
              {breve ? <Badge variant="neutral">em breve</Badge> : <ArrowRight size={14} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />}
            </button>;
          })}
        </div>
      </SectionCard>)}
    </div>
  </div>;
};
export default EstoqueBeta2;
