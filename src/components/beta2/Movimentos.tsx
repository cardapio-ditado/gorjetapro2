import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ClipboardList, Moon, Plus, RefreshCw, X } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, Input, Modal, PageHeader, SectionCard, Select } from '../ui';
import BuscaItem from './BuscaItem';
import { fmt, movimentosApi, type MovLinha, type MovRequisicao, type MovTela } from './api';
import { cadastrosApi, type ItemBasico } from './cadastros/api';

interface Props { responsavel: string | null; onVoltar: () => void }
const quando = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Retiradas e pedidos: o setor pede ao Central (o estoquista entrega), e a
 * retirada direta fora de hora (sai do Central na hora, alguém de outra
 * pessoa confere de manhã).
 */
const Movimentos: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [tela, setTela] = useState<MovTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novo, setNovo] = useState<'pedido' | 'retirada' | null>(null);
  const [entregando, setEntregando] = useState<MovRequisicao | null>(null);
  const [confirmando, setConfirmando] = useState<MovRequisicao | null>(null);
  const [quemConfere, setQuemConfere] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await movimentosApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const confirmar = async () => {
    if (!confirmando) return;
    setOcupado(true); setErro(null);
    try {
      await movimentosApi.retiradaConfirmar(confirmando.id, quemConfere.trim());
      setAviso(`Retirada de ${confirmando.quem} para ${confirmando.destino} conferida por ${quemConfere.trim()}.`);
      setConfirmando(null); setQuemConfere('');
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(false); }
  };

  if (novo) return <Formulario tipo={novo} setores={tela?.setores || []} responsavel={responsavel} onVoltar={() => setNovo(null)} onFeito={async m => { setNovo(null); setAviso(m); await carregar(); }} />;
  if (entregando) return <Entrega pedido={entregando} responsavel={responsavel} onVoltar={() => setEntregando(null)} onFeito={async m => { setEntregando(null); setAviso(m); await carregar(); }} />;

  const Linha: React.FC<{ r: MovRequisicao; acao?: React.ReactNode }> = ({ r, acao }) => (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex-1 min-w-[220px]">
        <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>{r.destino} <span className="t-caption">· {r.tipo === 'retirada' ? 'retirou' : 'pediu'} {r.quem}</span></p>
        <p className="t-caption truncate" style={{ margin: 0 }}>{quando(r.quando)} · {r.itens.map(i => `${fmt(i.entregue ?? i.solicitada)} ${i.nome}`).join(', ')}</p>
      </div>
      {r.tipo === 'retirada' && <Badge variant={r.confirmado_em ? 'success' : 'warning'}>{r.confirmado_em ? `conferida por ${r.confirmado_nome}` : 'sem conferência'}</Badge>}
      {r.tipo === 'pedido' && r.status === 'concluido' && <Badge variant="success">entregue{r.entregue_por ? ` por ${r.entregue_por}` : ''}</Badge>}
      {r.status === 'rejeitado' && <Badge variant="neutral">não entregue</Badge>}
      {acao}
    </div>
  );

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Retiradas e pedidos" subtitle="O setor pede e o Central entrega. Fora de hora, registra a retirada e alguém confere de manhã."
        actions={<div className="flex gap-2">
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
          <Button icone={<ClipboardList size={16} />} onClick={() => setNovo('pedido')}>Pedido ao Central</Button>
          <Button variante="primario" icone={<Moon size={16} />} onClick={() => setNovo('retirada')}>Registrar retirada</Button>
        </div>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {tela && (
        <div className="flex flex-col gap-4">
          <SectionCard title="Retiradas para conferir" descricao="Saíram do Central fora de hora. Outra pessoa confere o que chegou no setor." noPadding>
            {tela.retiradas_sem_confirmacao.length === 0 && <p className="t-body px-5 py-4" style={{ margin: 0, color: 'var(--text-secondary)' }}>Nenhuma pendente.</p>}
            {tela.retiradas_sem_confirmacao.map(r => <Linha key={r.id} r={r} acao={<Button variante="primario" tamanho="sm" icone={<Check size={14} />} onClick={() => { setConfirmando(r); setQuemConfere(responsavel && responsavel.toLowerCase() !== r.quem.toLowerCase() ? responsavel : ''); }}>Conferir</Button>} />)}
          </SectionCard>

          <SectionCard title="Pedidos a entregar" descricao="Pedidos dos setores ao Central" noPadding>
            {tela.pedidos_abertos.length === 0 && <div className="p-4"><EmptyState icon={ClipboardList} title="Nenhum pedido aberto" compact /></div>}
            {tela.pedidos_abertos.map(r => <Linha key={r.id} r={r} acao={<Button variante="primario" tamanho="sm" icone={<Check size={14} />} onClick={() => setEntregando(r)}>Entregar</Button>} />)}
          </SectionCard>

          <SectionCard title="Últimos 7 dias" noPadding>
            {tela.recentes.length === 0 && <p className="t-body px-5 py-4" style={{ margin: 0, color: 'var(--text-secondary)' }}>Nada ainda.</p>}
            {tela.recentes.map(r => <Linha key={r.id} r={r} />)}
          </SectionCard>
        </div>
      )}

      <Modal aberto={!!confirmando} onFechar={() => setConfirmando(null)} titulo="Conferir retirada" travado={ocupado}
        descricao={confirmando ? `${confirmando.quem} retirou para ${confirmando.destino} em ${quando(confirmando.quando)}` : undefined}
        rodape={<><Button onClick={() => setConfirmando(null)} disabled={ocupado}>Cancelar</Button><Button variante="primario" onClick={confirmar} carregando={ocupado} disabled={!quemConfere.trim()}>Confirmar que chegou</Button></>}>
        {confirmando && (
          <>
            <ul className="t-body pl-4" style={{ margin: 0, listStyle: 'disc' }}>{confirmando.itens.map(i => <li key={i.item_id}>{fmt(i.entregue ?? i.solicitada)} {i.um} {i.nome}</li>)}</ul>
            <Input rotulo="Quem conferiu" value={quemConfere} onChange={e => setQuemConfere(e.target.value)} dica="Tem que ser outra pessoa, não quem retirou." autoFocus />
          </>
        )}
      </Modal>
    </div>
  );
};

export default Movimentos;

// ── Entregar um pedido ──────────────────────────────────────────────────────
const Entrega: React.FC<{ pedido: MovRequisicao; responsavel: string | null; onVoltar: () => void; onFeito: (m: string) => Promise<void> }> = ({ pedido, responsavel, onVoltar, onFeito }) => {
  const [qtd, setQtd] = useState<Record<string, string>>(() => Object.fromEntries(pedido.itens.map(i => [i.item_id, String(Math.min(i.solicitada, Math.max(i.central, 0)))])));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
  const itens = pedido.itens.map(i => ({ item_id: i.item_id, quantidade: num(qtd[i.item_id] ?? '') })).filter(x => x.quantidade > 0);
  const entregar = async () => {
    if (itens.length === 0) { setErro('Informe o que vai entregar.'); return; }
    setOcupado(true); setErro(null);
    try {
      const r = await movimentosApi.pedidoEntregar(pedido.id, itens, responsavel);
      await onFeito(`Entregue para ${pedido.destino}: ${r.itens} item(ns).${r.faltou.length ? ` O Central não cobriu: ${r.faltou.join('; ')}.` : ''}`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(false); }
  };
  return (
    <div className="max-w-3xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Retiradas e pedidos</button>
      <PageHeader caminho={['Estoque', 'Movimentações', 'Pedidos']} title={`Entregar para ${pedido.destino}`} subtitle={`Pedido de ${pedido.quem} em ${quando(pedido.quando)}. Ajuste o que vai de fato.`} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <section className="card">
        {pedido.itens.map(i => {
          const v = num(qtd[i.item_id] ?? '');
          return (
            <div key={i.item_id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex-1 min-w-[200px]">
                <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                <p className="t-caption" style={{ margin: 0 }}>pediu {fmt(i.solicitada)} {i.um} · Central tem <span className={i.central < i.solicitada ? 'texto-atencao' : undefined}>{fmt(i.central)}</span></p>
              </div>
              {v > i.central && <Badge variant="warning">Central não cobre</Badge>}
              <input type="number" inputMode="decimal" min={0} step="any" aria-label={`Entregar de ${i.nome}`} value={qtd[i.item_id] ?? ''} onChange={e => setQtd(p => ({ ...p, [i.item_id]: e.target.value }))} className="input-dark text-right font-semibold" style={{ width: 96 }} />
            </div>
          );
        })}
      </section>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-3xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{itens.length} item(ns)</span>
          <div className="flex gap-2"><Button onClick={onVoltar} disabled={ocupado}>Cancelar</Button><Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={entregar} carregando={ocupado}>Entregar</Button></div>
        </div>
      </div>
    </div>
  );
};

// ── Novo pedido ou retirada ─────────────────────────────────────────────────
interface Linha { chave: number; item_id: string; nome: string; um: string; quantidade: string }
const Formulario: React.FC<{ tipo: 'pedido' | 'retirada'; setores: Array<{ id: string; nome: string }>; responsavel: string | null; onVoltar: () => void; onFeito: (m: string) => Promise<void> }> = ({ tipo, setores, responsavel, onVoltar, onFeito }) => {
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [setorId, setSetorId] = useState(setores[0]?.id || '');
  const [quem, setQuem] = useState(responsavel || '');
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: 1, item_id: '', nome: '', um: '', quantidade: '' }]);
  const [seq, setSeq] = useState(2);
  useEffect(() => {
    let vivo = true;
    cadastrosApi.itensBasicos().then(i => { if (vivo) setItens(i.filter(x => x.status !== 'inativo')); }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro'); }).finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);
  const itemPorId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
  const mudar = (chave: number, patch: Partial<Linha>) => setLinhas(p => p.map(l => (l.chave === chave ? { ...l, ...patch } : l)));
  const validas: MovLinha[] = linhas.filter(l => l.item_id && num(l.quantidade) > 0).map(l => ({ item_id: l.item_id, quantidade: num(l.quantidade) }));
  const setorNome = setores.find(s => s.id === setorId)?.nome || '';

  const salvar = async () => {
    if (!setorId) { setErro('Escolha o setor.'); return; }
    if (!quem.trim()) { setErro(tipo === 'retirada' ? 'Diga quem retirou.' : 'Diga quem está pedindo.'); return; }
    if (validas.length === 0) { setErro('Adicione pelo menos um item com quantidade.'); return; }
    if (tipo === 'retirada' && !window.confirm(`Registrar que ${quem.trim()} levou ${validas.length} item(ns) do Central para ${setorNome}? Sai do saldo agora.`)) return;
    setOcupado(true); setErro(null);
    try {
      if (tipo === 'pedido') {
        const r = await movimentosApi.pedidoCriar({ estoque_id: setorId, quem: quem.trim(), observacoes: obs.trim() || null, itens: validas });
        await onFeito(`Pedido de ${setorNome} registrado: ${r.itens} item(ns). Está em "Pedidos a entregar".`);
      } else {
        const r = await movimentosApi.retiradaRegistrar({ estoque_id: setorId, quem: quem.trim(), observacoes: obs.trim() || null, itens: validas });
        await onFeito(`Retirada registrada: ${r.itens} item(ns) para ${setorNome}.${r.ficou_negativo.length ? ` O Central ficou negativo em: ${r.ficou_negativo.join(', ')}.` : ''} Alguém precisa conferir de manhã.`);
      }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(false); }
  };

  return (
    <div className="max-w-3xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Retiradas e pedidos</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title={tipo === 'pedido' ? 'Pedido ao Central' : 'Registrar retirada'} subtitle={tipo === 'pedido' ? 'O setor pede, o estoquista entrega quando puder.' : 'Já pegou do Central fora de hora? Registre agora; outra pessoa confere de manhã.'} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <section className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select rotulo={tipo === 'pedido' ? 'Setor que pede' : 'Setor que levou'} value={setorId} onChange={e => setSetorId(e.target.value)}>{setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</Select>
        <Input rotulo={tipo === 'pedido' ? 'Quem pede' : 'Quem retirou'} value={quem} onChange={e => setQuem(e.target.value)} />
        <Input rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} className="md:col-span-2" dica="Opcional" />
      </section>
      <section className="card">
        <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="t-subsec" style={{ margin: 0 }}>Itens</h2>
          <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => { setLinhas(p => [...p, { chave: seq, item_id: '', nome: '', um: '', quantidade: '' }]); setSeq(s => s + 1); }} disabled={carregando}>Adicionar item</Button>
        </div>
        {linhas.map((l, i) => (
          <div key={l.chave} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_110px_auto] gap-2 items-end" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {l.item_id
              ? <div className="min-w-0 pb-1"><p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{l.nome}</p><p className="t-caption" style={{ margin: 0 }}>{l.um}</p></div>
              : <BuscaItem rotulo={i === 0 ? 'Item' : undefined} valor="" opcoes={itens.map(x => ({ id: x.id, nome: x.nome.trim(), sub: `${x.categoria} · ${x.unidade_medida}` }))} onEscolher={id => { const it = itemPorId.get(id); if (it) mudar(l.chave, { item_id: id, nome: it.nome.trim(), um: it.unidade_medida }); }} autoFocus />}
            <Input rotulo={i === 0 ? 'Quantidade' : undefined} aria-label="Quantidade" type="number" min={0} step="any" inputMode="decimal" value={l.quantidade} onChange={e => mudar(l.chave, { quantidade: e.target.value })} />
            <div className="pb-1"><button type="button" className="btn-icon btn-icon-danger" aria-label="Tirar linha" onClick={() => setLinhas(p => p.filter(x => x.chave !== l.chave))}><X size={14} /></button></div>
          </div>
        ))}
      </section>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-3xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{validas.length} item(ns)</span>
          <div className="flex gap-2"><Button onClick={onVoltar} disabled={ocupado}>Cancelar</Button><Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={salvar} carregando={ocupado} disabled={carregando}>{tipo === 'pedido' ? 'Enviar pedido' : 'Registrar retirada'}</Button></div>
        </div>
      </div>
    </div>
  );
};
