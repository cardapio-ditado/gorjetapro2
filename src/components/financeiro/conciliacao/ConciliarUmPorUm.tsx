import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, Clock, FileText, RotateCcw, SkipForward } from 'lucide-react';
import { Badge, Button, Combobox, EmptyState, IconButton, Input, Segmented, Select } from '../../ui';
import type { OpcaoCombo } from '../../ui';
import { contasParaBaixa, fmt, notasSugeridas, type Acao, type Forma, type Fornecedor, type NotasSugeridas } from './lancar';
import { aplicarFornecedor, documento, type Conta, type LinhaAuto } from './extrato';

// Conciliação "um por um": um pagamento de cada vez, já preenchido. Confere,
// completa o que falta (nota, observação) e só passa para o próximo lançando,
// pulando (com motivo, fica "para depois" na lista) ou ignorando.

type Ordem = 'antigos' | 'maiores';
type Resultado = 'lancado' | 'pulado' | 'ignorado';

const MOTIVOS = ['Falta a nota', 'Perguntar a quem pagou', 'Conferir o valor'];

interface Props {
  linhas: LinhaAuto[];
  fornecedores: OpcaoCombo[];
  categorias: OpcaoCombo[];
  formas: Forma[];
  contas: Conta[];
  fornPorId: Map<string, Fornecedor>;
  onMudar: (extratoId: string, f: (l: LinhaAuto) => LinhaAuto) => void;
  /** lança uma linha; devolve true se deu certo (o erro fica na linha) */
  onLancar: (l: LinhaAuto) => Promise<boolean>;
  onIgnorar: (l: LinhaAuto) => Promise<void>;
  onAdiar: (l: LinhaAuto, motivo: string | null) => Promise<void>;
  onCriarFornecedor: (l: LinhaAuto, texto: string) => void;
  onVerLista: () => void;
}

const ordenar = (ls: LinhaAuto[], ordem: Ordem) => [...ls].sort((a, b) => (ordem === 'maiores'
  ? b.valor - a.valor || a.data.localeCompare(b.data)
  : a.data.localeCompare(b.data) || b.valor - a.valor));

/** Monta a fila: os ainda não pulados primeiro; os pulados só quando pedir. */
function montarFila(linhas: LinhaAuto[], ordem: Ordem, soPulados: boolean) {
  const pend = linhas.filter(l => l.status === 'pendente');
  return ordenar(soPulados ? pend.filter(l => l.adiado) : pend.filter(l => !l.adiado), ordem).map(l => l.extratoId);
}

export default function ConciliarUmPorUm({
  linhas, fornecedores, categorias, formas, contas, fornPorId, onMudar, onLancar, onIgnorar, onAdiar, onCriarFornecedor, onVerLista,
}: Props) {
  const [ordem, setOrdem] = useState<Ordem>('antigos');
  const [soPulados, setSoPulados] = useState(false);
  const [fila, setFila] = useState<string[]>(() => montarFila(linhas, 'antigos', false));
  const [pos, setPos] = useState(0);
  const [resultado, setResultado] = useState<Record<string, Resultado>>({});
  const [ocupado, setOcupado] = useState(false);
  const [pulando, setPulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState<Record<string, NotasSugeridas | 'carregando' | 'erro'>>({});
  const lancarRef = useRef<HTMLButtonElement>(null);

  const porId = useMemo(() => new Map(linhas.map(l => [l.extratoId, l])), [linhas]);
  const l = pos < fila.length ? porId.get(fila[pos]) : undefined;
  const feito = l ? resultado[l.extratoId] : undefined;
  const chaveNotas = l && l.fornecedorId ? `${l.extratoId}:${l.fornecedorId}` : '';
  const sugNotas = chaveNotas ? notas[chaveNotas] : undefined;
  const pedeNotas = !!l && (l.acao === 'nova' || l.acao === 'baixa');

  const recomecar = (ordemNova: Ordem, pulados: boolean) => {
    setOrdem(ordemNova); setSoPulados(pulados);
    setFila(montarFila(linhas, ordemNova, pulados)); setPos(0); setResultado({}); setPulando(false);
  };

  // notas de compra que batem com o pagamento (uma vez por linha e fornecedor)
  useEffect(() => {
    if (!l || !chaveNotas || !pedeNotas || notas[chaveNotas]) return;
    setNotas(p => ({ ...p, [chaveNotas]: 'carregando' }));
    notasSugeridas(l.fornecedorId, l.valor, l.data)
      .then(r => {
        setNotas(p => ({ ...p, [chaveNotas]: r }));
        // a combinação que bate vem marcada; só se ninguém mexeu ainda
        if (r.combinacao.length) onMudar(l.extratoId, x => (x.notasIds === undefined ? { ...x, notasIds: r.combinacao } : x));
      })
      .catch(() => setNotas(p => ({ ...p, [chaveNotas]: 'erro' })));
  }, [l, chaveNotas, pedeNotas, notas, onMudar]);

  const avancar = () => { setPulando(false); setMotivo(''); setPos(p => p + 1); };

  const lancarAtual = async () => {
    if (!l || feito || ocupado) return;
    setOcupado(true);
    // sem nº digitado, o nº das notas marcadas vira o documento da conta
    const sel = typeof sugNotas === 'object' ? sugNotas.notas.filter(n => l.notasIds?.includes(n.id)) : [];
    const numero = l.numeroNota?.trim() || sel.map(n => n.numero).filter(Boolean).join(', ');
    const pronta = { ...l, numeroNota: numero, notasIds: pedeNotas ? l.notasIds : undefined };
    onMudar(l.extratoId, () => pronta);
    const ok = await onLancar(pronta);
    setOcupado(false);
    if (ok) {
      if (l.adiado) await onAdiar(l, null).catch(() => undefined);
      setResultado(r => ({ ...r, [l.extratoId]: 'lancado' }));
      avancar();
    }
  };

  const confirmarPulo = async () => {
    if (!l || ocupado) return;
    setOcupado(true);
    try {
      await onAdiar(l, motivo.trim() || 'Para depois');
      setResultado(r => ({ ...r, [l.extratoId]: 'pulado' }));
      avancar();
    } catch (e) {
      onMudar(l.extratoId, x => ({ ...x, erro: (e as Error).message || 'Não consegui marcar para depois.' }));
    } finally {
      setOcupado(false);
    }
  };

  const ignorarAtual = async () => {
    if (!l || feito || ocupado) return;
    setOcupado(true);
    await onIgnorar(l);
    setOcupado(false);
    setResultado(r => ({ ...r, [l.extratoId]: 'ignorado' }));
    avancar();
  };

  // atalhos: Enter lança, P pula, setas andam (fora dos campos de texto)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.closest('input, textarea, select, [role="combobox"], [role="listbox"]') || alvo.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter' && !pulando) { e.preventDefault(); lancarRef.current?.click(); }
      else if ((e.key === 'p' || e.key === 'P') && !pulando && l && !feito) { e.preventDefault(); setPulando(true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPos(p => Math.min(p + 1, fila.length)); setPulando(false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(p => Math.max(p - 1, 0)); setPulando(false); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fila.length, pulando, l, feito]);

  const contagem = Object.values(resultado).reduce((c, r) => ({ ...c, [r]: (c[r] || 0) + 1 }), {} as Record<Resultado, number>);
  const pendentesPulados = linhas.filter(x => x.status === 'pendente' && x.adiado).length;
  const pendentesNovos = linhas.filter(x => x.status === 'pendente' && !x.adiado).length;

  const cabecalho = (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <Segmented rotulo="Ordem" valor={ordem} onMudar={o => recomecar(o, soPulados)}
        opcoes={[{ valor: 'antigos', rotulo: 'Mais antigos' }, { valor: 'maiores', rotulo: 'Maiores valores' }]} />
      {soPulados
        ? <Badge variant="warning">revisando os pulados</Badge>
        : pendentesPulados > 0 && <Button tamanho="sm" variante="discreto" icone={<Clock size={14} />} onClick={() => recomecar(ordem, true)}>Ver os pulados ({pendentesPulados})</Button>}
      <span className="flex-1" />
      <span className="t-caption hidden md:inline">
        <kbd className="px-1 rounded" style={{ border: '1px solid var(--border-strong)' }}>Enter</kbd> lança ·{' '}
        <kbd className="px-1 rounded" style={{ border: '1px solid var(--border-strong)' }}>P</kbd> pula ·{' '}
        <kbd className="px-1 rounded" style={{ border: '1px solid var(--border-strong)' }}>← →</kbd> anda
      </span>
    </div>
  );

  // ── fim da fila ──
  if (!l) {
    const nada = fila.length === 0;
    return (
      <div>
        {cabecalho}
        {nada ? (
          <EmptyState icon={CheckCircle2} compact
            title={soPulados ? 'Nenhum pagamento pulado' : 'Nada para conferir aqui'}
            description={soPulados ? 'Tudo que foi deixado para depois já foi resolvido.' : pendentesPulados ? `Sobraram só os pulados (${pendentesPulados}).` : 'Nenhuma saída pendente na Conta Stone.'} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} style={{ color: 'var(--ok-text)' }} />
            <p className="t-subsec m-0">Fim da fila</p>
            <p className="t-body m-0">
              {contagem.lancado || 0} lançado{(contagem.lancado || 0) === 1 ? '' : 's'} · {contagem.pulado || 0} pulado{(contagem.pulado || 0) === 1 ? '' : 's'} · {contagem.ignorado || 0} ignorado{(contagem.ignorado || 0) === 1 ? '' : 's'}
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {pendentesPulados > 0 && <Button variante="primario" icone={<RotateCcw size={16} />} onClick={() => recomecar(ordem, true)}>Revisar os pulados ({pendentesPulados})</Button>}
          {soPulados && pendentesNovos > 0 && <Button onClick={() => recomecar(ordem, false)}>Voltar aos não pulados ({pendentesNovos})</Button>}
          {fila.length > 0 && <Button variante="discreto" icone={<ArrowLeft size={16} />} onClick={() => setPos(fila.length - 1)}>Voltar ao último</Button>}
          <Button variante="discreto" onClick={onVerLista}>Ver a lista</Button>
        </div>
      </div>
    );
  }

  const pct = Math.round((pos / Math.max(fila.length, 1)) * 100);
  const sugForn = l.sug.fornecedores[0]?.id;
  const ehTransf = l.acao === 'transferencia';
  const acoes: Acao[] = ['nova', ...(l.sug.contas_abertas.length ? ['baixa' as Acao] : []), 'ja', 'transferencia'];
  const mudar = (patch: Partial<LinhaAuto>) => onMudar(l.extratoId, x => ({ ...x, ...patch, erro: null }));
  const selNotas = new Set(l.notasIds || []);
  const somaNotas = typeof sugNotas === 'object' ? sugNotas.notas.filter(n => selNotas.has(n.id)).reduce((s, n) => s + n.valor, 0) : 0;

  return (
    <div>
      {cabecalho}

      {/* progresso */}
      <div className="flex items-center gap-3 mb-3">
        <span className="t-body" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Pagamento {pos + 1} de {fila.length}</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--gold)' }} />
        </div>
        <span className="t-caption tabular-nums">{pct}%</span>
      </div>

      <div className="rounded-xl p-4 flex flex-col gap-4" style={{ border: '1px solid var(--border-strong)', background: 'var(--bg-card, #12161f)', opacity: ocupado ? 0.7 : 1 }}>
        {/* quem e quanto */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="t-caption m-0">{dayjs(l.data).locale('pt-br').format('ddd DD/MM/YYYY')}{l.docTipo ? ` · ${documento(l.docTipo, l.doc)}` : ''}</p>
            <p className="t-subsec m-0 break-words" style={{ color: 'var(--text-primary)' }}>{l.nome || l.descricao || 'Sem nome'}</p>
            {l.descricao && l.nome && <p className="t-caption m-0 truncate">{l.descricao}</p>}
          </div>
          <p className="m-0 tabular-nums text-[22px] sm:text-[26px]" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(l.valor)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {l.reconhecido && <Badge variant="success">fornecedor reconhecido</Badge>}
          {l.classe === 'transferencia' && <Badge variant="info">mesmo CNPJ do bar</Badge>}
          {l.adiado && <Badge variant="warning">pulado antes · {l.adiado}</Badge>}
          {feito === 'lancado' && <Badge variant="success">lançado</Badge>}
          {feito === 'ignorado' && <Badge variant="neutral">ignorado</Badge>}
          {feito === 'pulado' && <Badge variant="warning">pulado</Badge>}
        </div>

        {feito || l.status !== 'pendente' ? (
          <p className="t-body m-0" style={{ color: 'var(--text-secondary)' }}>Este pagamento já foi resolvido. Use as setas para andar.</p>
        ) : (
          <>
            {/* o que é */}
            <div className="overflow-x-auto -mx-1 px-1">
              <Segmented rotulo="O que é este pagamento" valor={l.acao} onMudar={a => mudar({ acao: a })}
                opcoes={acoes.map(a => ({ valor: a, rotulo: a === 'nova' ? 'Nova despesa' : a === 'baixa' ? 'Conta aberta' : a === 'ja' ? 'Já lançado' : 'Transferência' }))} />
            </div>

            {ehTransf ? (
              <Select rotulo="Transferência para a conta" value={l.contaOutraId || ''} onChange={e => mudar({ contaOutraId: e.target.value })}>
                <option value="">Escolha a conta…</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.banco.trim()}</option>)}
              </Select>
            ) : l.acao === 'ja' ? (
              <p className="t-body m-0">
                {l.sug.ja_conciliado[0]
                  ? <>Igual ao lançado em {dayjs(l.sug.ja_conciliado[0].data).format('DD/MM')} · {l.sug.ja_conciliado[0].descricao}. Só marca como conciliado.</>
                  : <>Só marca como conciliado, sem criar conta nem baixa.</>}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Combobox rotulo="Fornecedor" valor={l.fornecedorId} opcoes={fornecedores} sugestaoId={sugForn}
                    onEscolher={id => onMudar(l.extratoId, x => aplicarFornecedor(x, fornPorId.get(id)))}
                    rotuloCriar="fornecedor" onCriar={texto => onCriarFornecedor(l, texto || l.nome || '')} />
                  <Combobox rotulo="Categoria" valor={l.categoriaId} opcoes={categorias} onEscolher={id => mudar({ categoriaId: id })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {l.acao === 'baixa' && (
                    <Select rotulo="Conta aberta" value={l.contaPagarId} onChange={e => mudar({ contaPagarId: e.target.value })}>
                      <option value="">Escolha a conta…</option>
                      {contasParaBaixa(l.sug, l.fornecedorId).map(c => <option key={c.id} value={c.id}>{c.fornecedor_nome} · {c.descricao} · vence {dayjs(c.data_vencimento).format('DD/MM')} · falta {fmt(Number(c.saldo_restante))}</option>)}
                    </Select>
                  )}
                  <Select rotulo="Forma de pagamento" value={l.formaPagamentoId} onChange={e => mudar({ formaPagamentoId: e.target.value })}>
                    {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </Select>
                </div>

                {/* notas de compra */}
                <div className="flex flex-col gap-2">
                  <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Notas de compra pagas com este Pix</span>
                  {!l.fornecedorId ? (
                    <p className="t-caption m-0">Escolha o fornecedor para ver as notas dele.</p>
                  ) : sugNotas === 'carregando' || sugNotas === undefined ? (
                    <p className="t-caption m-0">Procurando notas…</p>
                  ) : sugNotas === 'erro' ? (
                    <p className="t-caption m-0" style={{ color: 'var(--danger-text)' }}>Não consegui buscar as notas.</p>
                  ) : sugNotas.notas.length === 0 ? (
                    <p className="t-caption m-0">Nenhuma nota deste fornecedor sem pagamento perto desta data. Se tiver o número, digite abaixo.</p>
                  ) : (
                    <>
                      <ul className="flex flex-col gap-1 m-0 p-0" style={{ listStyle: 'none' }}>
                        {sugNotas.notas.map(n => {
                          const marcada = selNotas.has(n.id);
                          const daSoma = sugNotas.combinacao.includes(n.id);
                          return (
                            <li key={n.id}>
                              <label className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer"
                                style={{ background: marcada ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${marcada ? 'rgba(212,175,55,0.35)' : 'transparent'}` }}>
                                <input type="checkbox" checked={marcada}
                                  onChange={e => mudar({ notasIds: e.target.checked ? [...selNotas, n.id] : [...selNotas].filter(x => x !== n.id) })} />
                                <FileText size={14} aria-hidden="true" />
                                <span className="flex-1 min-w-0">
                                  <span className="t-body block">{n.numero || 'sem número'}</span>
                                  <span className="t-caption block">
                                    {dayjs(n.data).format('DD/MM')} · {n.itens} {n.itens === 1 ? 'item' : 'itens'}
                                    {daSoma && <span className="sm:hidden" style={{ color: 'var(--ok-text)' }}> · bate</span>}
                                  </span>
                                </span>
                                {daSoma && <Badge variant="success" className="hidden sm:inline-flex">bate</Badge>}
                                <span className="t-body tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(n.valor)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {selNotas.size > 0 && (
                        <p className="t-caption m-0" style={{ color: Math.abs(somaNotas - l.valor) <= Math.max(2, l.valor * 0.01) ? 'var(--ok-text)' : 'var(--warning-text, #fbbf24)' }}>
                          Notas marcadas: {fmt(somaNotas)} · Pix: {fmt(l.valor)}
                          {Math.abs(somaNotas - l.valor) > 0.009 && <> · diferença {fmt(Math.abs(somaNotas - l.valor))}</>}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3">
                  <Input rotulo="Nº da nota" value={l.numeroNota || ''} onChange={e => mudar({ numeroNota: e.target.value })}
                    placeholder={selNotas.size ? 'usa o das notas marcadas' : 'se tiver'} />
                  <Input rotulo="Observação" value={l.observacao || ''} onChange={e => mudar({ observacao: e.target.value })} placeholder="opcional" />
                </div>
              </>
            )}

            {l.erro && <p className="aviso aviso-perigo m-0" role="alert">{l.erro}</p>}

            {/* pular com motivo */}
            {pulando && (
              <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Por que deixar para depois? (opcional)</span>
                <div className="flex flex-wrap gap-2">
                  {MOTIVOS.map(m => (
                    <Button key={m} tamanho="sm" variante={motivo === m ? 'primario' : 'secundario'} onClick={() => setMotivo(m)}>{m}</Button>
                  ))}
                </div>
                <Input aria-label="Outro motivo" value={MOTIVOS.includes(motivo) ? '' : motivo} onChange={e => setMotivo(e.target.value)} placeholder="Outro motivo" />
                <div className="flex gap-2 justify-end">
                  <Button variante="discreto" onClick={() => { setPulando(false); setMotivo(''); }}>Cancelar</Button>
                  <Button variante="primario" icone={<SkipForward size={16} />} carregando={ocupado} onClick={confirmarPulo}>Pular e ir para o próximo</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* botões: no celular, Lançar ocupa a linha de baixo inteira */}
      <div className="sticky bottom-0 z-10 flex flex-col sm:flex-row sm:items-center gap-2 mt-3 py-3" style={{ background: 'var(--bg-base, #0b0e14)' }}>
        <div className="flex items-center gap-2">
          <IconButton aria-label="Pagamento anterior" title="Anterior" disabled={pos === 0} onClick={() => { setPulando(false); setPos(p => Math.max(p - 1, 0)); }}><ArrowLeft size={16} /></IconButton>
          {!feito && l.status === 'pendente' && !pulando && (
            <>
              <Button icone={<SkipForward size={16} />} onClick={() => setPulando(true)}>Pular · lançar depois</Button>
              <Button variante="discreto" icone={<Ban size={16} />} onClick={ignorarAtual}>Ignorar</Button>
            </>
          )}
        </div>
        <span className="hidden sm:block flex-1" />
        {feito || l.status !== 'pendente' ? (
          <Button ref={lancarRef} variante="primario" className="w-full sm:w-auto" icone={<ArrowRight size={16} />} onClick={avancar}>Próximo</Button>
        ) : (
          <Button ref={lancarRef} variante="primario" tamanho="toque" className="w-full sm:w-auto" icone={<CheckCircle2 size={18} />} carregando={ocupado} disabled={pulando}
            onClick={lancarAtual}>
            {ehTransf ? 'Lançar transferência' : l.acao === 'ja' ? 'Marcar conciliado' : l.acao === 'baixa' ? 'Pagar e próximo' : 'Lançar e próximo'}
          </Button>
        )}
      </div>
    </div>
  );
}
