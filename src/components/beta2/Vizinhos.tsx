import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Handshake, MessageCircle, Pencil, Plus, RefreshCw, Undo2, X } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select } from '../ui';
import { fmt, vizinhosApi, type EmprestimoAberto, type SentidoEmprestimo, type Vizinho, type VizinhosTela } from './api';
import { brl, cadastrosApi, type ItemBasico } from './cadastros/api';
import { urlWhatsApp } from '../inventory/comprasShared';
import BuscaItem from './BuscaItem';

interface Props { responsavel: string | null; onVoltar: () => void }
interface Linha { chave: number; item_id: string; nome: string; um: string; quantidade: string }
const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
const dataBR = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const SENTIDO: Record<SentidoEmprestimo, { r: string; v: 'warning' | 'info' }> = { pegamos: { r: 'devemos', v: 'warning' }, emprestamos: { r: 'nos devem', v: 'info' } };

/** Mensagem para o vizinho com o que está em aberto entre as duas casas. */
function textoCobranca(vizinho: string, abertos: EmprestimoAberto[]): string {
  const devemos = abertos.filter(a => a.sentido === 'pegamos').map(a => `• ${fmt(a.falta)} ${a.um} ${a.item} (${dataBR(a.data)})`);
  const nosDevem = abertos.filter(a => a.sentido === 'emprestamos').map(a => `• ${fmt(a.falta)} ${a.um} ${a.item} (${dataBR(a.data)})`);
  const partes = [`🤝 Ditado Popular · empréstimos com ${vizinho}`];
  if (nosDevem.length) partes.push(`\nEstá com vocês:\n${nosDevem.join('\n')}`);
  if (devemos.length) partes.push(`\nEstá conosco (vamos devolver):\n${devemos.join('\n')}`);
  partes.push('\nQualquer coisa é só chamar. Obrigado!');
  return partes.join('\n');
}

/**
 * Empréstimo com vizinhos: pegamos emprestado com outro bar (entra no Central)
 * ou emprestamos (sai do Central). Cada linha fica em aberto até devolver.
 * O vizinho não é estoque: nada de saldo negativo em lugar nenhum.
 */
const Vizinhos: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [tela, setTela] = useState<VizinhosTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [editando, setEditando] = useState<Partial<Vizinho> | null>(null);
  const [devolvendo, setDevolvendo] = useState<EmprestimoAberto | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await vizinhosApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const porVizinho = useMemo(() => {
    const m = new Map<string, { vizinho: string; telefone: string | null; itens: EmprestimoAberto[] }>();
    for (const a of tela?.abertos || []) { if (!m.has(a.vizinho_id)) m.set(a.vizinho_id, { vizinho: a.vizinho, telefone: a.telefone, itens: [] }); m.get(a.vizinho_id)!.itens.push(a); }
    return [...m.entries()];
  }, [tela]);

  const rodar = async (chave: string, fn: () => Promise<string | void>) => {
    setOcupado(chave); setErro(null); setAviso(null);
    try { const m = await fn(); if (m) setAviso(m); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };
  const cancelar = (a: EmprestimoAberto) => {
    const motivo = window.prompt(`Cancelar o empréstimo de ${fmt(a.quantidade)} ${a.um} ${a.item} com ${a.vizinho}? O saldo do Central volta ao que era. Motivo (opcional):`);
    if (motivo === null) return;
    void rodar(a.id, async () => { await vizinhosApi.cancelar(a.id, motivo || null); return 'Empréstimo cancelado.'; });
  };

  const t = tela?.totais;
  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Empréstimo com vizinhos" subtitle="Pegou emprestado com outro bar, ou emprestou? Registre aqui e devolva quando puder. Mexe no Central na hora."
        actions={<div className="flex items-center gap-2">
          <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setEditando({})}>Novo vizinho</Button>
          <Button variante="primario" icone={<Handshake size={16} />} onClick={() => setRegistrando(true)} disabled={!tela}>Registrar empréstimo</Button>
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard rotulo="devemos aos vizinhos" valor={t.devemos_itens} detalhe={brl(t.devemos_valor)} tom={t.devemos_itens ? 'atencao' : 'certo'} />
          <KPICard rotulo="vizinhos nos devem" valor={t.nos_devem_itens} detalhe={brl(t.nos_devem_valor)} tom={t.nos_devem_itens ? 'destaque' : 'normal'} />
          <KPICard rotulo="há mais de 7 dias" valor={t.antigos} detalhe={t.mais_antigo_dias ? `o mais antigo tem ${t.mais_antigo_dias} dias` : 'nada atrasado'} tom={t.antigos ? 'alerta' : 'certo'} />
          <KPICard rotulo="vizinhos" valor={tela?.vizinhos.filter(v => v.ativo).length ?? 0} detalhe="cadastrados" />
        </div>
      )}

      {tela && porVizinho.length === 0 && <EmptyState icon={Handshake} title="Nada em aberto" description="Quando pegar ou emprestar algo, registre aqui." action={{ label: 'Registrar empréstimo', onClick: () => setRegistrando(true) }} />}

      <div className="flex flex-col gap-4">
        {porVizinho.map(([id, g]) => (
          <SectionCard key={id} title={g.vizinho} descricao={`${g.itens.length} em aberto · ${brl(g.itens.reduce((s, a) => s + a.valor, 0))}`} noPadding
            action={g.telefone ? <Button tamanho="sm" icone={<MessageCircle size={14} />} onClick={() => window.open(urlWhatsApp(textoCobranca(g.vizinho, g.itens), g.telefone), '_blank', 'noopener')}>WhatsApp</Button> : undefined}>
            {g.itens.map(a => (
              <div key={a.id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-[200px]">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{a.item} <span className="t-caption">{a.um}</span></p>
                  <p className="t-caption" style={{ margin: 0 }}>
                    {dataBR(a.data)} · <span className={a.dias > 7 ? 'texto-atencao' : undefined}>{a.dias === 0 ? 'hoje' : `${a.dias} dia${a.dias === 1 ? '' : 's'}`}</span>
                    {a.responsavel && ` · ${a.responsavel}`}{a.observacoes && ` · ${a.observacoes}`}
                    {a.devolvido > 0 && ` · já voltou ${fmt(a.devolvido)}`}
                  </p>
                </div>
                <Badge variant={SENTIDO[a.sentido].v}>{SENTIDO[a.sentido].r}</Badge>
                <div className="text-right" style={{ minWidth: 90 }}>
                  <p className="t-body num" style={{ margin: 0, fontWeight: 600 }}>{fmt(a.falta)} {a.um}</p>
                  <p className="t-caption" style={{ margin: 0 }}>{brl(a.valor)}</p>
                </div>
                <Button tamanho="sm" icone={<Undo2 size={14} />} onClick={() => setDevolvendo(a)} disabled={!!ocupado}>{a.sentido === 'pegamos' ? 'Devolvemos' : 'Devolveu'}</Button>
                {a.devolvido === 0 && <IconButton aria-label="Cancelar empréstimo" title="Lançado errado? Cancela e o Central volta ao que era." onClick={() => cancelar(a)} disabled={!!ocupado}><X size={14} /></IconButton>}
              </div>
            ))}
          </SectionCard>
        ))}
      </div>

      {tela && tela.vizinhos.length > 0 && (
        <SectionCard title="Vizinhos" descricao="Quem a casa troca mercadoria. Toque no lápis para editar o telefone." noPadding className="mt-6">
          {tela.vizinhos.map(v => (
            <div key={v.id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: v.ativo ? 1 : 0.55 }}>
              <div className="flex-1 min-w-[200px]">
                <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{v.nome}{!v.ativo && <Badge variant="neutral" className="ml-2">inativo</Badge>}</p>
                <p className="t-caption" style={{ margin: 0 }}>{v.telefone || 'sem telefone'}{v.observacoes && ` · ${v.observacoes}`} · {v.abertos} em aberto · {v.historico} no total</p>
              </div>
              <IconButton aria-label={`Editar ${v.nome}`} onClick={() => setEditando(v)}><Pencil size={14} /></IconButton>
            </div>
          ))}
        </SectionCard>
      )}

      {tela && tela.recentes.length > 0 && (
        <details className="mt-6">
          <summary className="t-label cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>Quitados e cancelados · últimos 30 dias ({tela.recentes.length})</summary>
          <section className="card mt-2">
            {tela.recentes.map(r => (
              <div key={r.id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-[200px]">
                  <p className="t-body truncate" style={{ margin: 0 }}>{fmt(r.quantidade)} {r.um} {r.item} · {r.vizinho}</p>
                  <p className="t-caption" style={{ margin: 0 }}>{SENTIDO[r.sentido].r} · {dataBR(r.data)} → {dataBR(r.quitado_em)}{r.motivo && ` · ${r.motivo}`}</p>
                </div>
                <Badge variant={r.status === 'quitado' ? 'success' : 'neutral'}>{r.status}</Badge>
              </div>
            ))}
          </section>
        </details>
      )}

      {registrando && tela && <Registrar vizinhos={tela.vizinhos.filter(v => v.ativo)} responsavel={responsavel} onFechar={() => setRegistrando(false)} onNovoVizinho={() => { setRegistrando(false); setEditando({}); }}
        onFeito={async m => { setRegistrando(false); setAviso(m); await carregar(); }} />}
      {editando && <EditarVizinho inicial={editando} onFechar={() => setEditando(null)} onSalvo={async () => { setEditando(null); await carregar(); }} />}
      {devolvendo && <Devolver a={devolvendo} responsavel={responsavel} onFechar={() => setDevolvendo(null)} onFeito={async m => { setDevolvendo(null); setAviso(m); await carregar(); }} />}
    </div>
  );
};

// ── Registrar um empréstimo ─────────────────────────────────────────────────
const Registrar: React.FC<{ vizinhos: Vizinho[]; responsavel: string | null; onFechar: () => void; onNovoVizinho: () => void; onFeito: (m: string) => Promise<void> }> = ({ vizinhos, responsavel, onFechar, onNovoVizinho, onFeito }) => {
  const [sentido, setSentido] = useState<SentidoEmprestimo>('pegamos');
  const [vizinhoId, setVizinhoId] = useState(vizinhos[0]?.id || '');
  const [quem, setQuem] = useState(responsavel || '');
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: 1, item_id: '', nome: '', um: '', quantidade: '' }]);
  const [seq, setSeq] = useState(2);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { cadastrosApi.itensBasicos().then(i => setItens(i.filter(x => x.status !== 'inativo'))).catch(e => setErro(e instanceof Error ? e.message : 'Erro')); }, []);
  const itemPorId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const opcoes = useMemo(() => itens.map(x => ({ id: x.id, nome: x.nome.trim(), sub: `${x.categoria || 'Sem categoria'} · ${x.unidade_medida}` })), [itens]);
  const mudar = (chave: number, patch: Partial<Linha>) => setLinhas(p => p.map(l => (l.chave === chave ? { ...l, ...patch } : l)));
  const validas = linhas.filter(l => l.item_id && num(l.quantidade) > 0).map(l => ({ item_id: l.item_id, quantidade: num(l.quantidade) }));
  const vizinho = vizinhos.find(v => v.id === vizinhoId)?.nome || '';

  const salvar = async () => {
    if (!vizinhoId) { setErro('Escolha o vizinho.'); return; }
    if (validas.length === 0) { setErro('Adicione pelo menos um item com quantidade.'); return; }
    setOcupado(true); setErro(null);
    try {
      const r = await vizinhosApi.registrar({ vizinho_id: vizinhoId, sentido, itens: validas, responsavel: quem.trim() || null, observacoes: obs.trim() || null });
      await onFeito(sentido === 'pegamos' ? `Registrado: ${r.n} item(ns) que pegamos com ${vizinho}. Já entraram no Central.` : `Registrado: ${r.n} item(ns) emprestados para ${vizinho}. Já saíram do Central.${r.ficou_negativo.length ? ` Atenção, o Central não tinha tudo: ${r.ficou_negativo.join('; ')}.` : ''}`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };

  return (
    <Modal aberto onFechar={onFechar} titulo="Registrar empréstimo" descricao="Pegamos = entra no Central e devemos devolver. Emprestamos = sai do Central e o vizinho devolve." largura="lg" travado={ocupado}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado} disabled={validas.length === 0}>Registrar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {vizinhos.length === 0 && <div className="aviso aviso-atencao mb-3 flex items-center justify-between gap-2"><span>Nenhum vizinho cadastrado.</span><Button tamanho="sm" onClick={onNovoVizinho}>Cadastrar vizinho</Button></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="md:col-span-2"><Segmented<SentidoEmprestimo> rotulo="Sentido" valor={sentido} onMudar={setSentido} opcoes={[{ valor: 'pegamos', rotulo: 'Pegamos emprestado' }, { valor: 'emprestamos', rotulo: 'Emprestamos' }]} /></div>
        <Select rotulo="Vizinho" value={vizinhoId} onChange={e => (e.target.value === '__novo' ? onNovoVizinho() : setVizinhoId(e.target.value))}>
          <option value="">Escolher…</option>{vizinhos.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}<option value="__novo">+ Novo vizinho…</option>
        </Select>
        <Input rotulo="Quem registrou" value={quem} onChange={e => setQuem(e.target.value)} />
        <Input rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} className="md:col-span-2" dica="Opcional: combinado de devolução, quem levou…" />
      </div>
      <div className="flex items-center justify-between mb-2"><span className="t-label" style={{ color: 'var(--text-secondary)' }}>Itens</span><Button tamanho="sm" icone={<Plus size={14} />} onClick={() => { setLinhas(p => [...p, { chave: seq, item_id: '', nome: '', um: '', quantidade: '' }]); setSeq(s => s + 1); }}>Adicionar item</Button></div>
      {linhas.map(l => (
        <div key={l.chave} className="grid grid-cols-[minmax(0,1fr)_100px_auto] gap-2 items-end mb-2">
          {l.item_id
            ? <div className="min-w-0 pb-1"><p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{l.nome}</p><p className="t-caption" style={{ margin: 0 }}>{l.um}</p></div>
            : <BuscaItem valor="" opcoes={opcoes} placeholder="Digite o nome do item" onEscolher={id => { const it = itemPorId.get(id); if (it) mudar(l.chave, { item_id: id, nome: it.nome.trim(), um: it.unidade_medida }); }} autoFocus />}
          <Input aria-label="Quantidade" type="number" min={0} step="any" inputMode="decimal" placeholder="qtd" value={l.quantidade} onChange={e => mudar(l.chave, { quantidade: e.target.value })} />
          <div className="pb-1"><button type="button" className="btn-icon btn-icon-danger" aria-label="Tirar linha" onClick={() => setLinhas(p => p.filter(x => x.chave !== l.chave))}><X size={14} /></button></div>
        </div>
      ))}
    </Modal>
  );
};

// ── Devolver ────────────────────────────────────────────────────────────────
const Devolver: React.FC<{ a: EmprestimoAberto; responsavel: string | null; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ a, responsavel, onFechar, onFeito }) => {
  const [qtd, setQtd] = useState(String(a.falta));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const n = num(qtd);
  const confirmar = async () => {
    if (n <= 0 || n > a.falta + 0.0001) { setErro(`Entre 0 e ${fmt(a.falta)}.`); return; }
    setOcupado(true); setErro(null);
    try {
      const r = await vizinhosApi.devolver(a.id, n, responsavel);
      await onFeito(r.status === 'quitado' ? `${a.item}: quitado com ${a.vizinho}.` : `${a.item}: ${fmt(r.devolvido)} ${a.um} devolvido(s), faltam ${fmt(r.falta)}.`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };
  return (
    <Modal aberto onFechar={onFechar} titulo={a.sentido === 'pegamos' ? `Devolvemos para ${a.vizinho}` : `${a.vizinho} devolveu`} descricao={`${a.item}: faltam ${fmt(a.falta)} ${a.um}. ${a.sentido === 'pegamos' ? 'Sai do Central agora.' : 'Entra no Central agora.'}`} travado={ocupado}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={confirmar} carregando={ocupado}>Confirmar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <Input rotulo={`Quantidade (${a.um})`} type="number" min={0} step="any" inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus dica="Pode ser parcial. O resto continua em aberto." />
    </Modal>
  );
};

// ── Cadastro do vizinho ─────────────────────────────────────────────────────
const EditarVizinho: React.FC<{ inicial: Partial<Vizinho>; onFechar: () => void; onSalvo: () => Promise<void> }> = ({ inicial, onFechar, onSalvo }) => {
  const [nome, setNome] = useState(inicial.nome || '');
  const [telefone, setTelefone] = useState(inicial.telefone || '');
  const [obs, setObs] = useState(inicial.observacoes || '');
  const [ativo, setAtivo] = useState(inicial.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    if (!nome.trim()) { setErro('Dê um nome ao vizinho.'); return; }
    setOcupado(true); setErro(null);
    try { await vizinhosApi.salvar({ id: inicial.id || null, nome: nome.trim(), telefone: telefone.trim() || null, observacoes: obs.trim() || null, ativo }); await onSalvo(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };
  return (
    <Modal aberto onFechar={onFechar} titulo={inicial.id ? 'Editar vizinho' : 'Novo vizinho'} descricao="Outro bar ou restaurante com quem a casa troca mercadoria." travado={ocupado}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Salvar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="flex flex-col gap-3">
        <Input rotulo="Nome" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        <Input rotulo="WhatsApp" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="65 9xxxx-xxxx" dica="Com o telefone dá para mandar a lista do que está em aberto." />
        <Input rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} />
        {inicial.id && <label className="flex items-center gap-2 t-body"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Ativo</label>}
      </div>
    </Modal>
  );
};

export default Vizinhos;
