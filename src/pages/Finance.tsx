import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutDashboard } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

import FluxoCaixa               from '../components/financeiro/FluxoCaixa';
import FechamentoSocios         from '../components/financeiro/FechamentoSocios';
import FaturamentoZig           from '../components/financeiro/FaturamentoZig';
import ExtratoDiario            from '../components/financeiro/ExtratoDiario';
import ContasPagar              from '../components/financeiro/ContasPagar';
import ContasReceber            from '../components/financeiro/ContasReceber';
import HistoricoPagamentosEstorno from '../components/financeiro/HistoricoPagamentosEstorno';
import ConciliacaoBancaria       from '../components/financeiro/ConciliacaoBancaria';
import CategorizarLancamentos   from '../components/financeiro/CategorizarLancamentos';
import FichaFinanceiraFornecedor from '../components/financeiro/FichaFinanceiraFornecedor';
import KardexFinanceiroFornecedor from '../components/financeiro/KardexFinanceiroFornecedor';
import KardexFornecedor         from '../components/financeiro/KardexFornecedor';
import RelatoriosGerenciais     from '../components/diretoria/RelatoriosGerenciais';
import DRESimplificado          from '../components/diretoria/DRESimplificado';
import GeneralRegistrations     from './GeneralRegistrations';
import ChatFinanceiroIA         from '../components/financeiro/ChatFinanceiroIA';
import { Button, Modal, PageHeader, Segmented } from '../components/ui';

dayjs.locale('pt-br');

// Casca do Financeiro, no kit novo. Nove entradas em vez de catorze abas: as
// telas parecidas viraram vistas dentro da mesma entrada (?tab=…&ver=…). Os
// links antigos continuam valendo (ANTIGOS leva cada um para o lugar novo).

interface Vista { slug: string; rotulo: string; conteudo: React.ReactNode }
interface Entrada { slug: string; rotulo: string; descricao: string; vistas: Vista[] }

const ENTRADAS: Entrada[] = [
  { slug: 'pagar', rotulo: 'Contas a pagar', descricao: 'Boletos e contas em aberto: lançar, pagar e acompanhar vencimentos.',
    vistas: [{ slug: 'contas', rotulo: 'Contas', conteudo: <ContasPagar /> }, { slug: 'historico', rotulo: 'Pagamentos e estornos', conteudo: <HistoricoPagamentosEstorno /> }] },
  { slug: 'receber', rotulo: 'Contas a receber', descricao: 'Eventos, cartões e outros valores a receber.',
    vistas: [{ slug: 'contas', rotulo: 'Contas', conteudo: <ContasReceber /> }] },
  { slug: 'fluxo', rotulo: 'Movimentações', descricao: 'Tudo que entrou e saiu das contas e do cofre.',
    vistas: [
      { slug: 'periodo', rotulo: 'Por período', conteudo: <FluxoCaixa /> },
      { slug: 'dia', rotulo: 'Dia a dia', conteudo: <ExtratoDiario /> },
      { slug: 'categorizar', rotulo: 'Sem categoria', conteudo: <CategorizarLancamentos /> },
    ] },
  { slug: 'conciliacao', rotulo: 'Conciliação', descricao: 'Extrato do banco conferido com o que está lançado.',
    vistas: [{ slug: 'banco', rotulo: 'Banco', conteudo: <ConciliacaoBancaria /> }] },
  { slug: 'faturamento', rotulo: 'Vendas ZIG', descricao: 'Vendas por dia: bebidas, alimentos, couvert e taxa de serviço.',
    vistas: [{ slug: 'vendas', rotulo: 'Vendas', conteudo: <FaturamentoZig /> }] },
  { slug: 'fornecedor', rotulo: 'Fornecedores', descricao: 'Quanto se comprou, pagou e deve a cada fornecedor.',
    vistas: [
      { slug: 'ficha', rotulo: 'Ficha', conteudo: <FichaFinanceiraFornecedor /> },
      { slug: 'extrato', rotulo: 'Extrato', conteudo: <KardexFinanceiroFornecedor /> },
      { slug: 'completo', rotulo: 'Extrato completo', conteudo: <KardexFornecedor /> },
    ] },
  { slug: 'relatorios', rotulo: 'Relatórios', descricao: 'Fechamento de sócios, DRE e relatórios gerenciais.',
    vistas: [
      { slug: 'fechamento', rotulo: 'Fechamento de sócios', conteudo: <FechamentoSocios /> },
      { slug: 'dre', rotulo: 'DRE', conteudo: <DRESimplificado /> },
      { slug: 'gerenciais', rotulo: 'Gerenciais', conteudo: <RelatoriosGerenciais /> },
    ] },
  { slug: 'cadastros', rotulo: 'Cadastros', descricao: 'Fornecedores, clientes, categorias, formas de pagamento e contas.',
    vistas: [{ slug: 'geral', rotulo: 'Cadastros', conteudo: <GeneralRegistrations /> }] },
];

/** Links antigos (slug de aba ou índice numérico) → entrada e vista novas. */
const ANTIGOS: Record<string, [string, string?]> = {
  '0': ['fluxo'], '1': ['fluxo'], '2': ['fluxo', 'dia'], '3': ['pagar'], '4': ['receber'], '5': ['pagar', 'historico'],
  '6': ['fluxo', 'categorizar'], '7': ['fornecedor', 'ficha'], '8': ['fornecedor', 'extrato'], '9': ['fornecedor', 'completo'],
  '10': ['relatorios', 'gerenciais'], '11': ['cadastros'],
  extrato: ['fluxo', 'dia'], categorizar: ['fluxo', 'categorizar'], historico: ['pagar', 'historico'],
  fechamento: ['relatorios', 'fechamento'], 'ficha-fornecedor': ['fornecedor', 'ficha'],
  'kardex-fornecedor': ['fornecedor', 'extrato'], 'kardex-completo': ['fornecedor', 'completo'],
};

const Finance: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [chat, setChat] = useState(false);

  const { entrada, vista } = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const bruto = q.get('tab') || 'pagar';
    const [slug, verAntigo] = ANTIGOS[bruto] ?? [bruto];
    const e = ENTRADAS.find(x => x.slug === slug) ?? ENTRADAS[0];
    const ver = q.get('ver') || verAntigo;
    return { entrada: e, vista: e.vistas.find(v => v.slug === ver) ?? e.vistas[0] };
  }, [location.search]);

  // link antigo: reescreve a URL para a forma nova, sem criar histórico
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const bruto = q.get('tab');
    if (bruto && ANTIGOS[bruto]) navigate(`/finance?tab=${entrada.slug}&ver=${vista.slug}`, { replace: true });
  }, [location.search, entrada.slug, vista.slug, navigate]);

  const ir = (tab: string, ver?: string) => navigate(`/finance?tab=${tab}${ver ? `&ver=${ver}` : ''}`, { replace: true });

  return (
    <div className="pb-16">
      <PageHeader
        caminho={['Financeiro', entrada.rotulo]}
        title={entrada.rotulo}
        subtitle={entrada.descricao}
        actions={(
          <>
            <Button variante="discreto" icone={<MessageSquare size={16} />} onClick={() => setChat(true)}>Assistente</Button>
            <Button icone={<LayoutDashboard size={16} />} onClick={() => navigate('/financeiro')}>Painel</Button>
          </>
        )}
      />

      {/* entradas: quebram linha no celular (nada escondido em rolagem lateral) */}
      <nav aria-label="Seções do financeiro" className="flex flex-wrap gap-1 mb-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
        {ENTRADAS.map(e => {
          const ativa = e.slug === entrada.slug;
          return (
            <button key={e.slug} type="button" onClick={() => ir(e.slug)} aria-current={ativa ? 'page' : undefined}
              className="px-3 py-1.5 rounded-md t-label focus-ring"
              style={{ color: ativa ? 'var(--text-primary)' : 'var(--text-secondary)', background: ativa ? 'rgba(255,255,255,0.07)' : 'transparent', fontWeight: ativa ? 600 : 500 }}>
              {e.rotulo}
            </button>
          );
        })}
      </nav>

      {entrada.vistas.length > 1 && (
        <div className="mb-4">
          <Segmented rotulo={`Vista de ${entrada.rotulo}`} valor={vista.slug} onMudar={v => ir(entrada.slug, v)}
            opcoes={entrada.vistas.map(v => ({ valor: v.slug, rotulo: v.rotulo }))} />
        </div>
      )}

      <div key={`${entrada.slug}-${vista.slug}`}>{vista.conteudo}</div>

      <Modal aberto={chat} onFechar={() => setChat(false)} titulo="Assistente financeiro" largura="lg">
        <ChatFinanceiroIA />
      </Modal>
    </div>
  );
};

export default Finance;
