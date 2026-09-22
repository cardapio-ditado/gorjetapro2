import React, { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, BookOpen, Boxes, ClipboardList, FileText, Home, Layers,
  MoreHorizontal, Package, Search, ShoppingCart, Sliders, Sparkles, Truck, Warehouse,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Hoje from '../components/estoque-beta/Hoje';
import Posicao from '../components/estoque-beta/Posicao';
import Extrato from '../components/estoque-beta/Extrato';
import FichaItem from '../components/estoque-beta/FichaItem';
import Itens from '../components/estoque-beta/Itens';
import Transferir from '../components/estoque-beta/Transferir';
import Produzir from '../components/estoque-beta/Produzir';
import PainelDia from '../components/estoque-beta/PainelDia';

// Telas que já são novas e funcionam: abrem dentro do beta, sem reescrever.
const Compras = lazy(() => import('../components/inventory/Compras'));
const FichasTecnicas = lazy(() => import('../components/inventory/FichasTecnicas'));
const EstoquesGerenciamento = lazy(() => import('../components/inventory/EstoquesGerenciamento'));
const RelatoriosEstoque = lazy(() => import('../components/inventory/RelatoriosEstoque'));
const ZigVendasSync = lazy(() => import('./ZigVendasSync'));

type Grupo = 'hoje' | 'estoque' | 'compras' | 'cadastros' | 'mais';

type Tela =
  | 'hoje' | 'central' | 'receber'
  | 'estoque' | 'posicao' | 'itens' | 'ficha' | 'extrato' | 'transferir' | 'produzir' | 'painel'
  | 'compras'
  | 'cadastros' | 'fichas' | 'estoques'
  | 'mais' | 'zig' | 'relatorios';

const GRUPO_DA_TELA: Record<Tela, Grupo> = {
  hoje: 'hoje', central: 'hoje', receber: 'hoje',
  estoque: 'estoque', posicao: 'estoque', itens: 'estoque', ficha: 'estoque', extrato: 'estoque',
  transferir: 'estoque', produzir: 'estoque', painel: 'estoque',
  compras: 'compras',
  cadastros: 'cadastros', fichas: 'cadastros', estoques: 'cadastros',
  mais: 'mais', zig: 'mais', relatorios: 'mais',
};

const GRUPOS: Array<{ id: Grupo; nome: string; icone: React.ElementType }> = [
  { id: 'hoje', nome: 'Hoje', icone: Home },
  { id: 'estoque', nome: 'Estoque', icone: Boxes },
  { id: 'compras', nome: 'Compras', icone: ShoppingCart },
  { id: 'cadastros', nome: 'Cadastros', icone: BookOpen },
  { id: 'mais', nome: 'Mais', icone: MoreHorizontal },
];

/**
 * Estoque Beta: o módulo inteiro, com navegação própria.
 *
 * A barra de baixo tem cinco grupos. "Hoje" é a rotina (montar, receber,
 * pedir mais, contar o Central). Os outros grupos abrem um menu de botões
 * grandes. Tudo lê e grava as mesmas tabelas do módulo antigo.
 */
const EstoqueBeta: React.FC = () => {
  const { usuario, isAdmin, isMaster } = useAuth();
  const gestor = isAdmin() || isMaster();
  const responsavel = usuario?.nome_completo || null;

  const [params, setParams] = useSearchParams();
  const tela = (params.get('tela') as Tela) || 'hoje';
  const itemId = params.get('item');
  const grupo = GRUPO_DA_TELA[tela] || 'hoje';

  const ir = (nova: Tela, item?: string | null) => {
    const p = new URLSearchParams();
    if (nova !== 'hoje') p.set('tela', nova);
    if (item) p.set('item', item);
    setParams(p);
    window.scrollTo({ top: 0 });
  };

  const abrirItem = (id: string) => ir('ficha', id);

  const Menu = ({ titulo, itens }: { titulo: string; itens: Array<{ tela: Tela; nome: string; sub: string; icone: React.ElementType; so_gestor?: boolean }> }) => (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-5 pt-6 pb-4">
        <div className="text-xs font-bold tracking-widest uppercase text-[#D4AF37]">Estoque Beta</div>
        <h1 className="font-black text-3xl leading-tight mt-1">{titulo}</h1>
      </div>
      <div className="px-5 pb-10 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {itens.filter((i) => !i.so_gestor || gestor).map((i) => {
          const Icone = i.icone;
          return (
            <button key={i.tela} onClick={() => ir(i.tela)} className="text-left rounded-3xl p-5 bg-white/5 border-2 border-white/10 active:scale-[0.98] flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/15 flex items-center justify-center flex-shrink-0">
                <Icone className="w-7 h-7 text-[#D4AF37]" />
              </div>
              <div>
                <div className="font-black text-xl">{i.nome}</div>
                <div className="text-white/60 text-sm">{i.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  /** Casca para as telas reaproveitadas do módulo atual. */
  const Reaproveitada = ({ titulo, voltar, children }: { titulo: string; voltar: Tela; children: React.ReactNode }) => (
    <div className="min-h-screen" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 text-white/70 text-sm">
        <button onClick={() => ir(voltar)} className="flex items-center gap-1 py-2 pr-3"><ArrowLeft className="w-5 h-5" /> Voltar</button>
        <span className="text-white/30">·</span>
        <span className="font-bold text-white">{titulo}</span>
      </div>
      <Suspense fallback={<div className="p-10 text-center text-white/50">Carregando...</div>}>{children}</Suspense>
    </div>
  );

  const conteudo = useMemo(() => {
    switch (tela) {
      case 'hoje':
        return <Hoje responsavel={responsavel} gestor={gestor} />;
      case 'central':
        return <Hoje responsavel={responsavel} gestor={gestor} telaInicial="central" />;
      case 'receber':
        return <Hoje responsavel={responsavel} gestor={gestor} telaInicial="receber" />;

      case 'estoque':
        return (
          <Menu
            titulo="Estoque"
            itens={[
              { tela: 'posicao', nome: 'Posição do estoque', sub: 'Quanto tem de cada coisa, por lugar', icone: Warehouse },
              { tela: 'itens', nome: 'Itens', sub: 'Buscar, cadastrar, ativar e inativar', icone: Package },
              { tela: 'extrato', nome: 'Extrato do item', sub: 'Cada movimento e o saldo depois', icone: Search },
              { tela: 'transferir', nome: 'Transferir', sub: 'Entre quaisquer estoques', icone: Truck },
              { tela: 'produzir', nome: 'Produzir', sub: 'Ficha técnica que vira produto', icone: Layers },
              { tela: 'painel', nome: 'Painel do dia', sub: 'Os números que importam hoje', icone: BarChart3 },
            ]}
          />
        );
      case 'posicao':
        return <Posicao onVoltar={() => ir('estoque')} onAbrirItem={abrirItem} />;
      case 'itens':
        return <Itens onVoltar={() => ir('estoque')} onAbrirItem={abrirItem} />;
      case 'ficha':
        return itemId ? (
          <FichaItem itemId={itemId} onVoltar={() => ir('itens')} onExtrato={(id) => ir('extrato', id)} />
        ) : (
          <Itens onVoltar={() => ir('estoque')} onAbrirItem={abrirItem} />
        );
      case 'extrato':
        return <Extrato itemId={itemId} onVoltar={() => ir(itemId ? 'ficha' : 'estoque', itemId)} onAbrirItem={abrirItem} />;
      case 'transferir':
        return <Transferir responsavel={responsavel} onVoltar={() => ir('estoque')} />;
      case 'produzir':
        return <Produzir responsavel={responsavel} onVoltar={() => ir('estoque')} />;
      case 'painel':
        return (
          <PainelDia
            onVoltar={() => ir('estoque')}
            onIr={(d) => ir(d === 'hoje' ? 'hoje' : d === 'central' ? 'central' : d === 'compras' ? 'compras' : d === 'itens' ? 'itens' : 'posicao')}
          />
        );

      case 'compras':
        return <Reaproveitada titulo="Compras" voltar="hoje"><Compras /></Reaproveitada>;

      case 'cadastros':
        return (
          <Menu
            titulo="Cadastros"
            itens={[
              { tela: 'itens', nome: 'Itens', sub: 'O cadastro de tudo que entra e sai', icone: Package },
              { tela: 'fichas', nome: 'Fichas técnicas', sub: 'Receitas e o que baixa em cada venda', icone: ClipboardList },
              { tela: 'estoques', nome: 'Estoques', sub: 'Central, Bar, Cozinha', icone: Warehouse },
              { tela: 'hoje', nome: 'Níveis dos balcões', sub: 'Em Hoje › Configurar', icone: Sliders, so_gestor: true },
            ]}
          />
        );
      case 'fichas':
        return <Reaproveitada titulo="Fichas técnicas" voltar="cadastros"><FichasTecnicas /></Reaproveitada>;
      case 'estoques':
        return <Reaproveitada titulo="Estoques" voltar="cadastros"><EstoquesGerenciamento /></Reaproveitada>;

      case 'mais':
        return (
          <Menu
            titulo="Mais"
            itens={[
              { tela: 'painel', nome: 'Painel do dia', sub: 'Os números que importam hoje', icone: BarChart3 },
              { tela: 'zig', nome: 'ZIG Vendas', sub: 'Sincronizar e conferir as vendas', icone: Sparkles },
              { tela: 'relatorios', nome: 'Relatórios', sub: 'Consumo, custo e perdas por período', icone: FileText },
            ]}
          />
        );
      case 'zig':
        return <Reaproveitada titulo="ZIG Vendas" voltar="mais"><ZigVendasSync /></Reaproveitada>;
      case 'relatorios':
        return <Reaproveitada titulo="Relatórios" voltar="mais"><RelatoriosEstoque /></Reaproveitada>;

      default:
        return <Hoje responsavel={responsavel} gestor={gestor} />;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, itemId, responsavel, gestor]);

  return (
    <div className="pb-24" style={{ background: '#0d0f1a' }}>
      {conteudo}

      {/* Barra de navegação */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0d0f1a]/95 backdrop-blur border-t border-white/10">
        <div className="max-w-4xl mx-auto grid grid-cols-5">
          {GRUPOS.map((g) => {
            const Icone = g.icone;
            const ativo = grupo === g.id;
            return (
              <button
                key={g.id}
                onClick={() => ir(g.id === 'hoje' ? 'hoje' : (g.id as Tela))}
                className={`flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-bold ${ativo ? 'text-[#D4AF37]' : 'text-white/50'}`}
              >
                <Icone className="w-6 h-6" />
                {g.nome}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default EstoqueBeta;
