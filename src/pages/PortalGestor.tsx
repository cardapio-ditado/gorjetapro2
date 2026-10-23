import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarDays, CheckCircle2, Inbox, Music, RefreshCw, Target, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Badge, Button, EmptyState, IconButton, KPICard, PageHeader, SectionCard, type KPITom } from '../components/ui';
import MeuPainel from './MeuPainel';
import { hhmm, haQuanto, useVendasAoVivo } from '../components/zig/useVendasAoVivo';

/**
 * Portal do Gestor: a tela inicial de quem toca a casa (lista em
 * configuracoes_sistema.portal_gestores). Só o que pede ação hoje, cada
 * número abre a tela que resolve. Tudo vem de fn_portal_gestor; quem não é
 * gestor recebe {gestor:false} e vê o painel comum.
 */

interface Conta { descricao: string; categoria: string | null; valor: number; vencimento: string }
interface Aberto { nome: string; falta: number; desde: string; diarias?: number; shows?: number }
interface Tarefa { id: string; numero: number | null; titulo: string; setor: string | null; responsavel: string | null; prioridade: string | null; fase: string | null; data_limite: string | null; aprovacao: boolean }
interface Portal {
  gestor: boolean;
  hoje: string;
  livro: {
    noite: string; atrasado: boolean; pendencias_abertas: number; pendencias_vencidas: number;
    anterior: { data: string; existe: boolean; status: 'aberto' | 'fechado' | null; gerente: string | null; movimento: string | null; dinheiro_entrada: number | null;
      diferenca: number | null; pagamentos_total: number | null; ocorrencias: number; graves: number; recado: string | null };
  };
  estoque: {
    pedidos_a_entregar: number; retiradas_sem_confirmacao: number; repor_setores: number; contagem_setores_falta: number;
    auditoria_hoje: boolean; aprovacoes_pendentes: number; notas_pendentes: number; negativos: number; central_abaixo_ponto: number;
    kits_faltando: number; emprestimos_abertos: number; emprestimos_antigos: number;
    zonas_central: { vencidas: number; total: number };
    zig: { status: string; nao_mapeados: number; finalizado_em: string } | null;
  };
  extras: { valor: number; diarias: number; pessoas: number; mais_antiga: string | null; lista: Aberto[] };
  musicos: { valor: number; shows: number; artistas: number; mais_antigo: string | null; lista: Aberto[] };
  tarefas: { abertas: number; atrasadas: number; aprovacao: number; lista: Tarefa[] };
  vendas: { data: string; total: number; bebidas: number; alimentos: number; outros: number; transacoes: number; semana_passada: number | null; mes: number } | null;
  contas: { vencidas: { qtd: number; valor: number }; semana: { qtd: number; valor: number }; lista_vencidas: Conta[]; lista_semana: Conta[] };
  semana: {
    eventos: { nome: string; data: string; hora: string | null; pessoas: number | null; pagamento: string | null }[];
    shows: { nome: string; data: string; hora: string | null }[];
    extras: { data: string; qtd: number; valor: number }[];
  };
}

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`);
const dataCurta = (d: string | null) => (d ? dia(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
const diaSemana = (d: string) => dia(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const diasDesde = (d: string | null, hoje: string) => (d ? Math.round((dia(hoje).getTime() - dia(d).getTime()) / 86400000) : 0);
const hora = (h: string | null) => (h ? h.slice(0, 5) : '');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const beta2 = (tela: string) => `/estoque-beta2?tela=${tela}`;

/** Uma linha clicável de lista: data à esquerda, texto, valor à direita. */
const Linha: React.FC<{ esquerda?: React.ReactNode; titulo: React.ReactNode; detalhe?: React.ReactNode; direita?: React.ReactNode; onClick?: () => void }> = ({ esquerda, titulo, detalhe, direita, onClick }) => (
  <button type="button" onClick={onClick} disabled={!onClick} className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.04] focus-ring disabled:hover:bg-transparent"
    style={{ borderBottom: '1px solid var(--border-subtle)', cursor: onClick ? 'pointer' : 'default' }}>
    {esquerda !== undefined && <span className="t-caption num" style={{ minWidth: 44, textAlign: 'left' }}>{esquerda}</span>}
    <span className="flex-1 min-w-0">
      <span className="t-body block truncate" style={{ fontWeight: 500 }}>{titulo}</span>
      {detalhe && <span className="t-caption block truncate">{detalhe}</span>}
    </span>
    {direita !== undefined && <span className="t-body num" style={{ fontWeight: 600 }}>{direita}</span>}
  </button>
);

const PortalGestor: React.FC = () => {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [p, setP] = useState<Portal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    const { data, error } = await supabase.rpc('fn_portal_gestor');
    if (error) setErro(error.message); else setP(data as Portal);
    setCarregando(false);
  };
  useEffect(() => { void carregar(); }, []);
  // A noite em andamento, direto da ZIG (só depois de saber que é gestor).
  const vivo = useVendasAoVivo(p?.gestor === true);

  if (p && !p.gestor) return <MeuPainel />;

  const primeiroNome = usuario?.nome_completo?.split(' ')[0] || '';
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const header = (
    <PageHeader caminho={['Início']} title={`${saudacao()}, ${primeiroNome}`}
      subtitle={`Portal do Gestor · ${dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)}`}
      actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />
  );

  if (!p) return (
    <div className="max-w-7xl mx-auto">
      {header}
      {erro ? <div className="aviso aviso-perigo" role="alert">{erro}</div> : <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando o dia…</p>}
    </div>
  );

  const e = p.estoque;
  const extrasDias = diasDesde(p.extras.mais_antiga, p.hoje);
  const musicosDias = diasDesde(p.musicos.mais_antigo, p.hoje);
  const zigProblema = !!e.zig && (e.zig.status !== 'sucesso' || e.zig.nao_mapeados > 0);

  // Pede sua ação: só o que tem pendência, do mais grave para o mais leve.
  const acoes: { rotulo: string; valor: string; detalhe: string; tom: KPITom; ir: string }[] = [
    p.livro?.atrasado && { rotulo: 'livro da noite sem fechar', valor: dataCurta(p.livro.anterior.data), detalhe: p.livro.anterior.existe ? 'o gerente não fechou' : 'ninguém abriu o livro', tom: 'alerta', ir: `/livro?data=${p.livro.anterior.data}` },
    (p.livro?.anterior.graves || 0) > 0 && { rotulo: 'ocorrências graves na noite', valor: String(p.livro.anterior.graves), detalhe: `livro de ${dataCurta(p.livro.anterior.data)}`, tom: 'alerta', ir: `/livro?data=${p.livro.anterior.data}` },
    p.livro?.anterior.diferenca !== null && p.livro?.anterior.diferenca !== undefined && Math.abs(p.livro.anterior.diferenca) >= 0.005 && { rotulo: 'diferença no caixa', valor: brl(p.livro.anterior.diferenca), detalhe: p.livro.anterior.diferenca > 0 ? `sobrou em ${dataCurta(p.livro.anterior.data)}` : `faltou em ${dataCurta(p.livro.anterior.data)}`, tom: 'atencao', ir: `/livro?data=${p.livro.anterior.data}` },
    (p.livro?.pendencias_abertas || 0) > 0 && { rotulo: 'pendências do livro', valor: String(p.livro.pendencias_abertas), detalhe: p.livro.pendencias_vencidas ? `${p.livro.pendencias_vencidas} com prazo vencido` : 'esperando providência', tom: p.livro.pendencias_vencidas ? 'alerta' : 'atencao', ir: '/livro' },
    p.contas.vencidas.qtd > 0 && { rotulo: 'contas atrasadas', valor: brl(p.contas.vencidas.valor), detalhe: plural(p.contas.vencidas.qtd, 'conta vencida', 'contas vencidas'), tom: 'alerta', ir: '/finance?tab=pagar' },
    p.tarefas.atrasadas > 0 && { rotulo: 'tarefas atrasadas', valor: String(p.tarefas.atrasadas), detalhe: 'passaram do prazo', tom: 'alerta', ir: '/metas-tarefas' },
    zigProblema && { rotulo: 'vendas da Zig', valor: e.zig!.nao_mapeados ? `${e.zig!.nao_mapeados} sem vínculo` : e.zig!.status, detalhe: 'produtos sem mapeamento', tom: 'alerta', ir: beta2('zig') },
    e.negativos > 0 && { rotulo: 'saldos negativos', valor: String(e.negativos), detalhe: 'precisam de contagem aprovada', tom: 'alerta', ir: beta2('contagem') },
    p.extras.valor > 0 && { rotulo: 'extras a pagar', valor: brl(p.extras.valor), detalhe: `${plural(p.extras.pessoas, 'pessoa', 'pessoas')} · mais antiga há ${extrasDias} dias`, tom: extrasDias > 30 ? 'alerta' : 'atencao', ir: '/extras?visao=a_pagar' },
    p.musicos.valor > 0 && { rotulo: 'cachês a pagar', valor: brl(p.musicos.valor), detalhe: `${plural(p.musicos.artistas, 'artista', 'artistas')} · mais antigo há ${musicosDias} dias`, tom: musicosDias > 30 ? 'alerta' : 'atencao', ir: '/musicians?visao=a_pagar' },
    p.tarefas.aprovacao > 0 && { rotulo: 'tarefas para aprovar', valor: String(p.tarefas.aprovacao), detalhe: 'esperando sua decisão', tom: 'atencao', ir: '/metas-tarefas' },
    e.aprovacoes_pendentes > 0 && { rotulo: 'diferenças a aprovar', valor: String(e.aprovacoes_pendentes), detalhe: 'auditorias de estoque', tom: 'atencao', ir: beta2('aprovacoes') },
    e.notas_pendentes > 0 && { rotulo: 'notas para receber', valor: String(e.notas_pendentes), detalhe: 'compras chegando', tom: 'atencao', ir: beta2('recebimento') },
    e.emprestimos_abertos > 0 && { rotulo: 'empréstimos com vizinhos', valor: String(e.emprestimos_abertos), detalhe: e.emprestimos_antigos ? `${e.emprestimos_antigos} há mais de 7 dias` : 'em aberto', tom: e.emprestimos_antigos ? 'atencao' : 'normal', ir: beta2('vizinhos') },
    e.pedidos_a_entregar + e.retiradas_sem_confirmacao > 0 && { rotulo: 'pedidos e retiradas', valor: String(e.pedidos_a_entregar + e.retiradas_sem_confirmacao), detalhe: e.retiradas_sem_confirmacao ? `${e.retiradas_sem_confirmacao} retirada(s) para conferir` : 'pedidos para entregar', tom: 'atencao', ir: beta2('emergencias') },
  ].filter(Boolean) as { rotulo: string; valor: string; detalhe: string; tom: KPITom; ir: string }[];

  // Estoque hoje: tudo, mesmo o que está em dia (fica cinza).
  const estoque: { rotulo: string; valor: string; ok: boolean; tela: string }[] = [
    { rotulo: e.auditoria_hoje ? 'Auditoria geral hoje: setores sem contagem' : 'Setores sem contagem hoje', valor: String(e.contagem_setores_falta), ok: !e.contagem_setores_falta, tela: 'contagem' },
    { rotulo: 'Zonas do Central para contar', valor: `${e.zonas_central.vencidas} de ${e.zonas_central.total}`, ok: !e.zonas_central.vencidas, tela: 'contagem_central' },
    { rotulo: 'Setores para repor', valor: String(e.repor_setores), ok: !e.repor_setores, tela: 'reposicao' },
    { rotulo: 'Central abaixo do ponto (comprar)', valor: String(e.central_abaixo_ponto), ok: !e.central_abaixo_ponto, tela: 'compras' },
    { rotulo: 'Notas para receber', valor: String(e.notas_pendentes), ok: !e.notas_pendentes, tela: 'recebimento' },
    { rotulo: 'Diferenças de auditoria a aprovar', valor: String(e.aprovacoes_pendentes), ok: !e.aprovacoes_pendentes, tela: 'aprovacoes' },
    { rotulo: 'Saldos negativos', valor: String(e.negativos), ok: !e.negativos, tela: 'contagem' },
    { rotulo: 'Kits com item faltando', valor: String(e.kits_faltando), ok: !e.kits_faltando, tela: 'kits' },
    { rotulo: 'Empréstimos com vizinhos', valor: String(e.emprestimos_abertos), ok: !e.emprestimos_abertos, tela: 'vizinhos' },
    { rotulo: 'Vendas da Zig', valor: e.zig ? (zigProblema ? (e.zig.nao_mapeados ? `${e.zig.nao_mapeados} sem vínculo` : e.zig.status) : 'OK') : 'sem registro', ok: !!e.zig && !zigProblema, tela: 'zig' },
  ];

  // Próximos 7 dias, juntos por data.
  const datas = new Map<string, { eventos: Portal['semana']['eventos']; shows: Portal['semana']['shows']; extras: Portal['semana']['extras'][number] | null }>();
  const dataDe = (d: string) => { const k = d.slice(0, 10); if (!datas.has(k)) datas.set(k, { eventos: [], shows: [], extras: null }); return datas.get(k)!; };
  p.semana.eventos.forEach(ev => dataDe(ev.data).eventos.push(ev));
  p.semana.shows.forEach(s => dataDe(s.data).shows.push(s));
  p.semana.extras.forEach(x => { dataDe(x.data).extras = x; });
  const semana = [...datas.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const v = p.vendas;
  const variacao = v && v.semana_passada ? Math.round(((v.total - v.semana_passada) / v.semana_passada) * 100) : null;

  return (
    <div className="max-w-7xl mx-auto">
      {header}
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}

      <h2 className="t-subsec mb-2">Pede sua ação</h2>
      {acoes.length === 0 ? (
        <div className="aviso aviso-certo mb-5 flex items-center gap-2"><CheckCircle2 size={16} /> Nada pendente agora.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
          {acoes.map(a => <KPICard key={a.rotulo} rotulo={a.rotulo} valor={a.valor} detalhe={a.detalhe} tom={a.tom} onClick={() => navigate(a.ir)} />)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Vendas da noite" descricao={v ? `Última fechada: ${diaSemana(v.data)}` : 'Sem vendas da Zig'}>
          {vivo.d && vivo.d.pedidos > 0 && (
            <div className="mb-3">
              <KPICard rotulo="esta noite · ao vivo" valor={brl(vivo.d.total)} tom="certo"
                detalhe={`${vivo.d.pedidos} pedidos · última venda ${hhmm(vivo.d.atualizado_em)} (${haQuanto(vivo.d.atualizado_em, vivo.agora)})`} />
            </div>
          )}
          {v ? (
            <div className="flex flex-col gap-3">
              <KPICard rotulo="total" valor={brl(v.total)} tom="destaque"
                detalhe={`${v.transacoes} comandas${variacao !== null ? ` · ${variacao >= 0 ? '+' : ''}${variacao}% contra a semana passada` : ''}`} />
              <div className="grid grid-cols-2 gap-3">
                <KPICard rotulo="bebidas" valor={brl(v.bebidas)} detalhe={v.total ? `${Math.round((v.bebidas / v.total) * 100)}%` : ''} />
                <KPICard rotulo="comida" valor={brl(v.alimentos)} detalhe={v.total ? `${Math.round((v.alimentos / v.total) * 100)}%` : ''} />
              </div>
              <p className="t-caption" style={{ margin: 0 }}>No mês: {brl(v.mes)}</p>
            </div>
          ) : <EmptyState icon={Inbox} title="Nada sincronizado" compact />}
        </SectionCard>
        <SectionCard noPadding title="Contas atrasadas" descricao={`${plural(p.contas.vencidas.qtd, 'conta', 'contas')} · ${brl(p.contas.vencidas.valor)}`}
          action={<Button tamanho="sm" variante="discreto" onClick={() => navigate('/finance?tab=pagar')}>Abrir</Button>}>
          {p.contas.lista_vencidas.length === 0 ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)' }}>Nenhuma conta atrasada.</p>
            : p.contas.lista_vencidas.map((c, i) => (
              <Linha key={i} esquerda={dataCurta(c.vencimento)} titulo={c.descricao} detalhe={`${c.categoria || 'sem categoria'} · há ${diasDesde(c.vencimento, p.hoje)} dias`}
                direita={<span className="texto-perigo">{brl(c.valor)}</span>} onClick={() => navigate('/finance?tab=pagar')} />
            ))}
        </SectionCard>
        <SectionCard noPadding title="Vence em 7 dias" descricao={`${plural(p.contas.semana.qtd, 'conta', 'contas')} · ${brl(p.contas.semana.valor)}`}
          action={<Button tamanho="sm" variante="discreto" onClick={() => navigate('/finance?tab=pagar')}>Abrir</Button>}>
          {p.contas.lista_semana.length === 0 ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)' }}>Nada vence nos próximos 7 dias.</p>
            : p.contas.lista_semana.map((c, i) => (
              <Linha key={i} esquerda={dataCurta(c.vencimento)} titulo={c.descricao} detalhe={c.categoria || 'sem categoria'} direita={brl(c.valor)} onClick={() => navigate('/finance?tab=pagar')} />
            ))}
        </SectionCard>
      </div>

      {p.livro && (
        <SectionCard noPadding title="Livro da noite" descricao={`${dataCurta(p.livro.anterior.data)}${p.livro.anterior.gerente ? ` · ${p.livro.anterior.gerente.split(' ')[0]}` : ''}`}
          action={<Button tamanho="sm" variante="discreto" icone={<BookOpen size={14} />} onClick={() => navigate(`/livro?data=${p.livro.anterior.data}`)}>Abrir</Button>} className="mb-4">
          {!p.livro.anterior.existe ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)', margin: 0 }}>{p.livro.atrasado ? 'Ninguém abriu o livro desta noite.' : 'Sem livro nesta noite.'}</p> : (
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={p.livro.anterior.status === 'fechado' ? 'success' : 'warning'}>{p.livro.anterior.status === 'fechado' ? 'Fechado' : 'Aberto'}</Badge>
                <span className="t-body">Movimento: {p.livro.anterior.movimento || '—'}</span>
                <span className="t-caption">· {p.livro.anterior.ocorrencias} ocorrência{p.livro.anterior.ocorrencias === 1 ? '' : 's'}{p.livro.anterior.graves ? `, ${p.livro.anterior.graves} grave${p.livro.anterior.graves === 1 ? '' : 's'}` : ''}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <KPICard rotulo="dinheiro que entrou" valor={p.livro.anterior.dinheiro_entrada === null ? '—' : brl(p.livro.anterior.dinheiro_entrada)} />
                <KPICard rotulo="diferença no caixa" valor={p.livro.anterior.diferenca === null ? '—' : brl(p.livro.anterior.diferenca)} tom={p.livro.anterior.diferenca !== null && Math.abs(p.livro.anterior.diferenca) >= 0.005 ? 'atencao' : 'certo'} />
                <KPICard rotulo="pagamentos na noite" valor={p.livro.anterior.pagamentos_total === null ? '—' : brl(p.livro.anterior.pagamentos_total)} detalhe="só informativo" />
              </div>
              {p.livro.anterior.recado && <p className="t-body" style={{ margin: 0 }}><span className="t-caption">Recado do gerente: </span>{p.livro.anterior.recado}</p>}
            </div>
          )}
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard noPadding title="Extras em aberto" descricao={p.extras.valor ? `${brl(p.extras.valor)} · ${plural(p.extras.diarias, 'diária', 'diárias')} de ${plural(p.extras.pessoas, 'pessoa', 'pessoas')}` : 'Tudo pago'}
          action={<Button tamanho="sm" variante="discreto" icone={<UserPlus size={14} />} onClick={() => navigate('/extras?visao=a_pagar')}>A pagar</Button>}>
          {p.extras.lista.length === 0 ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)' }}>Nenhuma diária em aberto.</p>
            : p.extras.lista.map((x, i) => (
              <Linha key={i} titulo={x.nome} detalhe={`${plural(x.diarias || 0, 'diária', 'diárias')} · desde ${dataCurta(x.desde)} (${diasDesde(x.desde, p.hoje)} dias)`}
                direita={brl(x.falta)} onClick={() => navigate('/extras?visao=a_pagar')} />
            ))}
        </SectionCard>
        <SectionCard noPadding title="Cachês em aberto" descricao={p.musicos.valor ? `${brl(p.musicos.valor)} · ${plural(p.musicos.shows, 'show', 'shows')} de ${plural(p.musicos.artistas, 'artista', 'artistas')}` : 'Tudo pago'}
          action={<Button tamanho="sm" variante="discreto" icone={<Music size={14} />} onClick={() => navigate('/musicians?visao=a_pagar')}>A pagar</Button>}>
          {p.musicos.lista.length === 0 ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)' }}>Nenhum cachê em aberto.</p>
            : p.musicos.lista.map((x, i) => (
              <Linha key={i} titulo={x.nome} detalhe={`${plural(x.shows || 0, 'show', 'shows')} · desde ${dataCurta(x.desde)} (${diasDesde(x.desde, p.hoje)} dias)`}
                direita={brl(x.falta)} onClick={() => navigate('/musicians?visao=a_pagar')} />
            ))}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard noPadding title="Estoque hoje" descricao="Cada linha abre a tela do Estoque que resolve."
          action={<Button tamanho="sm" variante="discreto" onClick={() => navigate('/estoque-beta2')}>Abrir</Button>}>
          {estoque.map(x => (
            <Linha key={x.rotulo} titulo={<span style={{ color: x.ok ? 'var(--text-secondary)' : undefined }}>{x.rotulo}</span>}
              direita={x.ok ? <span className="t-caption">{x.valor === '0' ? 'em dia' : x.valor}</span> : <span className="texto-atencao">{x.valor}</span>}
              onClick={() => navigate(beta2(x.tela))} />
          ))}
        </SectionCard>
        <SectionCard noPadding title="Tarefas" descricao={p.tarefas.abertas ? `${plural(p.tarefas.abertas, 'aberta', 'abertas')}${p.tarefas.atrasadas ? ` · ${p.tarefas.atrasadas} atrasada${p.tarefas.atrasadas === 1 ? '' : 's'}` : ''}` : 'Nenhuma aberta'}
          action={<Button tamanho="sm" variante="discreto" icone={<Target size={14} />} onClick={() => navigate('/metas-tarefas')}>Abrir</Button>}>
          {p.tarefas.lista.length === 0 ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)' }}>Nenhuma tarefa aberta.</p>
            : p.tarefas.lista.slice(0, 8).map(t => {
              const atrasada = !!t.data_limite && t.data_limite < p.hoje;
              return (
                <Linha key={t.id} esquerda={t.data_limite ? dataCurta(t.data_limite) : '—'}
                  titulo={<>{t.numero ? <span className="t-caption">#{t.numero} </span> : null}{t.titulo}</>}
                  detalhe={[t.setor, t.responsavel, t.fase?.replace('_', ' ')].filter(Boolean).join(' · ')}
                  direita={<span className="flex items-center gap-1">
                    {atrasada && <Badge variant="danger">atrasada</Badge>}
                    {t.aprovacao && <Badge variant="warning">aprovar</Badge>}
                    {(t.prioridade === 'urgente' || t.prioridade === 'alta') && !atrasada && <Badge variant={t.prioridade === 'urgente' ? 'danger' : 'warning'}>{t.prioridade}</Badge>}
                  </span>}
                  onClick={() => navigate('/metas-tarefas')} />
              );
            })}
        </SectionCard>
      </div>

      <SectionCard noPadding title="Próximos 7 dias" descricao="Eventos fechados, atrações e extras já lançados.">
        {semana.length === 0 ? <div className="p-4"><EmptyState icon={CalendarDays} title="Nada marcado para a semana" compact /></div>
          : semana.map(([d, x]) => (
            <div key={d} className="px-5 py-2.5 flex flex-wrap items-start gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="t-body" style={{ minWidth: 92, fontWeight: 600 }}>{d === p.hoje ? 'Hoje' : diaSemana(d)}</span>
              <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
                {x.eventos.map((ev, i) => (
                  <button key={`e${i}`} type="button" className="t-body text-left hover:underline" onClick={() => navigate('/events')}>
                    <CalendarDays size={13} className="inline mr-1.5" style={{ color: 'var(--gold)' }} />
                    {ev.nome}<span className="t-caption">{ev.hora && ` · ${hora(ev.hora)}`}{ev.pessoas ? ` · ${ev.pessoas} pessoas` : ''}</span>
                    {ev.pagamento && ev.pagamento !== 'pago' && <span className="t-caption texto-atencao"> · pagamento {ev.pagamento}</span>}
                  </button>
                ))}
                {x.shows.map((s, i) => (
                  <button key={`s${i}`} type="button" className="t-body text-left hover:underline" onClick={() => navigate('/musicians')}>
                    <Music size={13} className="inline mr-1.5" style={{ color: 'var(--gold)' }} />{s.nome}<span className="t-caption">{s.hora && ` · ${hora(s.hora)}`}</span>
                  </button>
                ))}
                {x.extras && (
                  <button type="button" className="t-body text-left hover:underline" onClick={() => navigate('/extras')}>
                    <UserPlus size={13} className="inline mr-1.5" style={{ color: 'var(--gold)' }} />{plural(x.extras.qtd, 'extra', 'extras')}<span className="t-caption"> · {brl(x.extras.valor)}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
      </SectionCard>
    </div>
  );
};

export default PortalGestor;
