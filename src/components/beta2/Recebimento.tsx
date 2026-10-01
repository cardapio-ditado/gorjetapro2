import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Check, FileText, Plus, Truck, X } from 'lucide-react';
import { Badge, Button, EmptyState, Input, PageHeader, SectionCard, Select } from '../ui';
import BuscaItem from './BuscaItem';
import { fmt, recebimentoApi, type LinhaRecebida, type PedidoPendente, type RecebimentoTela } from './api';
import { brl, cadastrosApi, type Fornecedor, type ItemBasico } from './cadastros/api';

interface Props { onVoltar: () => void }

const CONDICOES = [{ v: 'a_vista', r: 'À vista' }, { v: 'd1', r: '1 dia' }, { v: 'd2', r: '2 dias' }, { v: 'd3', r: '3 dias' }, { v: 'semana', r: 'Semana' }, { v: 'consignado', r: 'Consignado' }, { v: 'outro', r: 'Outro' }];
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dataBR = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR');

/**
 * Receber compras: o que está esperando chegar (pedidos da lista) e a nota
 * sem pedido. Abrir uma nota é conferir item a item o que veio e por quanto,
 * tirar a foto, e dar entrada no Central num toque.
 */
const Recebimento: React.FC<Props> = ({ onVoltar }) => {
  const [tela, setTela] = useState<RecebimentoTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberto, setAberto] = useState<PedidoPendente | 'nova' | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = async () => {
    setErro(null);
    try { setTela(await recebimentoApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const verFoto = async (caminho: string) => {
    try { window.open(await recebimentoApi.urlFoto(caminho), '_blank', 'noopener'); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao abrir a foto'); }
  };
  const cancelar = async (p: PedidoPendente) => {
    const motivo = window.prompt(`Cancelar o pedido de ${p.fornecedor}? Os itens voltam para a lista de compras. Motivo (opcional):`);
    if (motivo === null) return;
    setOcupado(p.id); setErro(null);
    try { await recebimentoApi.cancelar(p.id, motivo || null); setAviso(`Pedido de ${p.fornecedor} cancelado.`); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };

  if (aberto) {
    return <Nota pedido={aberto === 'nova' ? null : aberto} onVoltar={() => setAberto(null)} onFeito={async m => { setAberto(null); setAviso(m); await carregar(); }} />;
  }

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Receber compras" subtitle="Confira o que chegou, tire a foto da nota e dê entrada no Central."
        actions={<Button variante="primario" icone={<Plus size={16} />} onClick={() => setAberto('nova')}>Nota sem pedido</Button>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {tela && (
        <div className="flex flex-col gap-4">
          <SectionCard title="Esperando chegar" descricao={tela.pendentes.length ? `${tela.pendentes.length} pedido${tela.pendentes.length > 1 ? 's' : ''} feito${tela.pendentes.length > 1 ? 's' : ''} em Compras` : 'Nenhum pedido aberto'} noPadding>
            {tela.pendentes.length === 0 && <div className="p-4"><EmptyState icon={Truck} title="Nada esperando" description="Pedidos feitos em Compras aparecem aqui até a nota chegar." compact /></div>}
            {tela.pendentes.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: ocupado === p.id ? 0.6 : 1 }}>
                <div className="flex-1 min-w-[200px]">
                  <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>{p.fornecedor}</p>
                  <p className="t-caption" style={{ margin: 0 }}>pedido em {dataBR(p.data_pedido)} · {p.itens.length} item{p.itens.length !== 1 ? 's' : ''} · {brl(p.valor)}</p>
                </div>
                <Button variante="discreto" tamanho="sm" onClick={() => cancelar(p)}>Cancelar</Button>
                <Button variante="primario" tamanho="sm" icone={<Check size={14} />} onClick={() => setAberto(p)}>Receber</Button>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Recebidas" descricao="As últimas notas que entraram no Central" noPadding>
            {tela.recentes.length === 0 && <p className="t-body px-5 py-4" style={{ margin: 0, color: 'var(--text-secondary)' }}>Nenhuma ainda.</p>}
            {tela.recentes.map(n => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 px-5 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-[200px]">
                  <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{n.fornecedor}</p>
                  <p className="t-caption" style={{ margin: 0 }}>{dataBR(n.data_compra)} · {n.itens} item{n.itens !== 1 ? 's' : ''}{n.numero_documento ? ` · nota ${n.numero_documento}` : ''}</p>
                </div>
                <span className="t-body num">{brl(n.valor)}</span>
                {n.arquivo ? <Button tamanho="sm" variante="discreto" icone={<FileText size={14} />} onClick={() => verFoto(n.arquivo!)}>Foto</Button> : <Badge variant="neutral">sem foto</Badge>}
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </div>
  );
};

export default Recebimento;

// ── Uma nota ────────────────────────────────────────────────────────────────
interface Linha { chave: number; linha_id: string | null; item_id: string; nome: string; um: string; pedida: number | null; recebida: string; custo: string; validade: string }
interface NotaProps { pedido: PedidoPendente | null; onVoltar: () => void; onFeito: (mensagem: string) => Promise<void> }

const Nota: React.FC<NotaProps> = ({ pedido, onVoltar, onFeito }) => {
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fornecedorId, setFornecedorId] = useState(pedido?.fornecedor_id || '');
  const [numero, setNumero] = useState('');
  const [data, setData] = useState(hoje());
  const [condicao, setCondicao] = useState('a_vista');
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() => (pedido?.itens || []).map((i, k) => ({ chave: k + 1, linha_id: i.linha_id, item_id: i.item_id, nome: i.nome, um: i.um, pedida: Number(i.quantidade_pedida), recebida: String(i.quantidade_pedida), custo: String(i.custo_unitario), validade: '' })));
  const [seq, setSeq] = useState((pedido?.itens.length || 0) + 1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [i, f] = await Promise.all([cadastrosApi.itensBasicos(), cadastrosApi.fornecedores()]);
        if (!vivo) return;
        setItens(i.filter(x => x.status !== 'inativo')); setFornecedores(f.filter(x => x.status !== 'inativo'));
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!foto) { setFotoUrl(null); return; }
    const u = URL.createObjectURL(foto); setFotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  const itemPorId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
  const total = linhas.reduce((s, l) => s + num(l.recebida) * num(l.custo), 0);
  const mudar = (chave: number, patch: Partial<Linha>) => setLinhas(p => p.map(l => (l.chave === chave ? { ...l, ...patch } : l)));
  const adicionar = () => { setLinhas(p => [...p, { chave: seq, linha_id: null, item_id: '', nome: '', um: '', pedida: null, recebida: '', custo: '', validade: '' }]); setSeq(s => s + 1); };
  const escolherItem = (chave: number, id: string) => { const i = itemPorId.get(id); if (i) mudar(chave, { item_id: id, nome: i.nome.trim(), um: i.unidade_medida, custo: i.custo_medio ? String(i.custo_medio) : '' }); };

  const confirmar = async () => {
    const validas = linhas.filter(l => l.item_id);
    if (validas.length === 0) { setErro('Adicione pelo menos um item.'); return; }
    if (validas.every(l => num(l.recebida) <= 0)) { setErro('Nenhum item com quantidade recebida.'); return; }
    if (validas.some(l => num(l.recebida) > 0 && num(l.custo) <= 0) && !window.confirm('Tem item recebido com custo zero. Continuar mesmo assim?')) return;
    const divergentes = validas.filter(l => l.pedida !== null && num(l.recebida) !== l.pedida).length;
    if (!window.confirm(`Dar entrada de ${validas.filter(l => num(l.recebida) > 0).length} item(ns) no Central, total ${brl(total)}?${divergentes ? ` ${divergentes} item(ns) diferente(s) do pedido.` : ''}`)) return;
    setSalvando(true); setErro(null);
    try {
      const arquivo = foto ? await recebimentoApi.subirFoto(foto) : null;
      const payload: LinhaRecebida[] = validas.map(l => ({ linha_id: l.linha_id, item_id: l.item_id, quantidade_recebida: num(l.recebida), custo_unitario: num(l.custo), data_validade: l.validade || null }));
      const r = await recebimentoApi.confirmar({ entrada_id: pedido?.id || null, fornecedor_id: fornecedorId || null, numero_documento: numero.trim(), data_compra: data, condicao_pagamento: condicao, observacoes: obs.trim() || null, arquivo, itens: payload });
      await onFeito(`Nota recebida: ${r.itens} item(ns), ${brl(r.valor_total)}, ${r.movimentacoes} entrada(s) no Central.`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao dar entrada'); }
    finally { setSalvando(false); }
  };

  const nomeForn = fornecedores.find(f => f.id === fornecedorId)?.nome || '';

  return (
    <div className="max-w-4xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Receber compras</button>
      <PageHeader caminho={['Estoque', 'Movimentações', 'Receber compras']} title={pedido ? `Pedido de ${pedido.fornecedor}` : 'Nota sem pedido'} subtitle={pedido ? 'O que estava no pedido já está na lista. Ajuste o que veio diferente.' : 'Escolha o fornecedor e vá adicionando o que chegou.'} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}

      <section className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <BuscaItem rotulo="Fornecedor" valor={nomeForn} opcoes={fornecedores.map(f => ({ id: f.id, nome: f.nome.trim(), sub: f.grupo || undefined }))} onEscolher={setFornecedorId} autoFocus={!pedido} />
        <Input rotulo="Número da nota" value={numero} onChange={e => setNumero(e.target.value)} dica="Opcional" />
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Select rotulo="Pagamento" value={condicao} onChange={e => setCondicao(e.target.value)}>{CONDICOES.map(c => <option key={c.v} value={c.v}>{c.r}</option>)}</Select>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer inline-flex items-center gap-2" style={{ height: 36, padding: '0 14px', borderRadius: 'var(--r-control)' }}>
            <Camera size={16} /> {foto ? 'Trocar foto da nota' : 'Foto da nota'}
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e => setFoto(e.target.files?.[0] || null)} />
          </label>
          {fotoUrl && foto?.type.startsWith('image/') && <img src={fotoUrl} alt="Foto da nota" style={{ height: 56, borderRadius: 'var(--r-control)', border: '1px solid var(--border)' }} />}
          {foto && !foto.type.startsWith('image/') && <Badge variant="neutral">{foto.name}</Badge>}
          {foto && <button type="button" className="btn-icon" aria-label="Tirar foto" onClick={() => setFoto(null)}><X size={14} /></button>}
          {!foto && <span className="t-caption">Sem foto também dá entrada, mas a foto evita discussão depois.</span>}
        </div>
        <Input rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} className="md:col-span-2" />
      </section>

      <section className="card">
        <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="t-subsec" style={{ margin: 0 }}>O que chegou</h2>
          <Button tamanho="sm" icone={<Plus size={14} />} onClick={adicionar} disabled={carregando}>Adicionar item</Button>
        </div>
        {linhas.length === 0 && <p className="t-body px-4 py-4" style={{ margin: 0, color: 'var(--text-secondary)' }}>Nenhum item ainda.</p>}
        {linhas.map((l, i) => {
          const rec = num(l.recebida);
          const diff = l.pedida !== null && rec !== l.pedida;
          return (
            <div key={l.chave} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_90px_110px_110px_auto] gap-2 items-end" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {l.linha_id || l.item_id
                ? <div className="min-w-0 pb-1"><p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{l.nome}</p><p className="t-caption" style={{ margin: 0 }}>{l.um}{l.pedida !== null && ` · pedido ${fmt(l.pedida)}`}{diff && <span className="texto-atencao"> · veio {rec > l.pedida! ? 'mais' : 'menos'}</span>}{rec === 0 && l.pedida !== null && <span className="texto-perigo"> · não veio</span>}</p></div>
                : <BuscaItem rotulo={i === 0 ? 'Item' : undefined} valor="" opcoes={itens.map(x => ({ id: x.id, nome: x.nome.trim(), sub: `${x.categoria} · ${x.unidade_medida}` }))} onEscolher={id => escolherItem(l.chave, id)} autoFocus />}
              <Input rotulo={i === 0 ? 'Recebido' : undefined} aria-label="Quantidade recebida" type="number" min={0} step="any" inputMode="decimal" value={l.recebida} onChange={e => mudar(l.chave, { recebida: e.target.value })} />
              <Input rotulo={i === 0 ? 'Custo unit.' : undefined} aria-label="Custo unitário" type="number" min={0} step="any" inputMode="decimal" value={l.custo} onChange={e => mudar(l.chave, { custo: e.target.value })} />
              <Input rotulo={i === 0 ? 'Validade' : undefined} aria-label="Validade" type="date" value={l.validade} onChange={e => mudar(l.chave, { validade: e.target.value })} />
              <div className="flex items-center gap-2 pb-1 justify-end">
                <span className="t-body num" style={{ minWidth: 80, textAlign: 'right' }}>{brl(rec * num(l.custo))}</span>
                <button type="button" className="btn-icon btn-icon-danger" aria-label="Tirar linha" onClick={() => l.linha_id ? mudar(l.chave, { recebida: '0' }) : setLinhas(p => p.filter(x => x.chave !== l.chave))}><X size={14} /></button>
              </div>
            </div>
          );
        })}
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-4xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{linhas.filter(l => l.item_id && num(l.recebida) > 0).length} item(ns) · <strong style={{ color: 'var(--text-primary)' }}>{brl(total)}</strong></span>
          <div className="flex gap-2">
            <Button onClick={onVoltar} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={confirmar} carregando={salvando} disabled={carregando}>Dar entrada no Central</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
