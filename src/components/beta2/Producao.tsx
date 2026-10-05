import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChefHat, Plus, RefreshCw, Undo2, X } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard } from '../ui';
import { producaoApi, type FichaProducao, type InsumoProducao, type ProducaoTela } from './api';
import { brl, cadastrosApi, fmt, type ItemBasico } from './cadastros/api';
import BuscaItem from './BuscaItem';

interface Props { responsavel: string | null; onVoltar: () => void }
interface Linha { chave: number; item_id: string; nome: string; um: string; quantidade: string }
const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
const dataBR = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const dataHoraBR = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Produção: o insumo in natura sai do Central para o estoque Produção; lá a
 * ficha técnica de produção é feita e o produto novo volta para o Central.
 * Três ações: mandar insumos, produzir uma ficha (N lotes), devolver sobras.
 */
const Producao: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [tela, setTela] = useState<ProducaoTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mandando, setMandando] = useState(false);
  const [devolvendo, setDevolvendo] = useState<InsumoProducao | null>(null);
  const [produzindo, setProduzindo] = useState<FichaProducao | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await producaoApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const feito = async (m: string) => { setAviso(m); setMandando(false); setDevolvendo(null); setProduzindo(null); await carregar(); };
  const fichas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (tela?.fichas || []).filter(f => !t || f.nome.toLowerCase().includes(t) || f.produz.nome.toLowerCase().includes(t));
  }, [tela, busca]);
  const porCategoria = useMemo(() => {
    const m = new Map<string, InsumoProducao[]>();
    for (const i of tela?.insumos || []) { if (!m.has(i.categoria)) m.set(i.categoria, []); m.get(i.categoria)!.push(i); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tela]);

  const t = tela?.totais;
  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Produção" subtitle="O insumo sai do Central para a Produção. Lá a ficha é feita e o produto novo volta para o Central com o custo dos insumos."
        actions={<div className="flex items-center gap-2">
          <Button tamanho="sm" icone={<ArrowRight size={14} />} onClick={() => setMandando(true)} disabled={!tela}>Mandar insumos</Button>
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard rotulo="na Produção" valor={t.insumos} detalhe={`${brl(t.valor_insumos)} em insumos`} tom={t.insumos ? 'destaque' : 'normal'} />
          <KPICard rotulo="fichas de produção" valor={t.fichas} detalhe="ativas, com item produzido" />
          <KPICard rotulo="produções · 7 dias" valor={t.producoes_7d} detalhe={t.producoes_7d ? 'feitas por aqui' : 'nenhuma ainda'} tom={t.producoes_7d ? 'certo' : 'normal'} />
          <KPICard rotulo="prontas para produzir" valor={tela?.fichas.filter(f => f.lotes_possiveis > 0).length ?? 0} detalhe="com insumo na Produção" />
        </div>
      )}

      {tela && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
          <SectionCard title="Fichas de produção" descricao="Escolha a ficha e quantos lotes. O que faltar na Produção pode vir do Central na hora." noPadding
            action={<div style={{ width: 200 }}><Input aria-label="Buscar ficha" placeholder="Buscar ficha…" value={busca} onChange={e => setBusca(e.target.value)} /></div>}>
            {fichas.length === 0 && <div className="p-5"><EmptyState compact icon={ChefHat} title={busca ? 'Nenhuma ficha com esse nome' : 'Nenhuma ficha de produção'} description={busca ? '' : 'Em Cadastros › Fichas técnicas, marque o tipo "produção" e o item que ela produz.'} /></div>}
            {fichas.map(f => (
              <div key={f.id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-[200px]">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{f.nome}</p>
                  <p className="t-caption" style={{ margin: 0 }}>
                    rende {fmt(f.rendimento)} {f.um_rend} de {f.produz.nome} · {f.ingredientes.length} insumo{f.ingredientes.length === 1 ? '' : 's'}
                    {f.ultima && ` · última ${dataBR(f.ultima)}`}
                  </p>
                </div>
                <Badge variant={f.lotes_possiveis > 0 ? 'success' : 'neutral'}>{f.lotes_possiveis > 0 ? `dá ${fmt(f.lotes_possiveis)} lote${f.lotes_possiveis === 1 ? '' : 's'}` : 'sem insumo aqui'}</Badge>
                <div className="text-right" style={{ minWidth: 90 }}>
                  <p className="t-body num" style={{ margin: 0, fontWeight: 600 }}>{fmt(f.produz.central)} {f.produz.um}</p>
                  <p className="t-caption" style={{ margin: 0 }}>no Central</p>
                </div>
                <Button tamanho="sm" variante="primario" icone={<ChefHat size={14} />} onClick={() => setProduzindo(f)}>Produzir</Button>
              </div>
            ))}
          </SectionCard>

          <div className="flex flex-col gap-4">
            <SectionCard title="Na Produção agora" descricao={tela.insumos.length ? `${tela.insumos.length} insumo${tela.insumos.length === 1 ? '' : 's'} · ${brl(tela.totais.valor_insumos)}` : 'Nada por aqui'} noPadding>
              {tela.insumos.length === 0 && <div className="p-5"><EmptyState compact icon={ArrowRight} title="Produção vazia" description="Mande insumos do Central, ou produza puxando o que falta na hora." action={{ label: 'Mandar insumos', onClick: () => setMandando(true) }} /></div>}
              {porCategoria.map(([cat, itens]) => (
                <div key={cat}>
                  <p className="t-caps px-5 pt-3 pb-1" style={{ margin: 0, color: 'var(--text-secondary)' }}>{cat}</p>
                  {itens.map(i => (
                    <div key={i.item_id} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                        <p className="t-caption" style={{ margin: 0 }}>{brl(i.valor)}{i.ultima && ` · ${dataHoraBR(i.ultima)}`}</p>
                      </div>
                      <p className={`t-body num ${i.saldo < 0 ? 'texto-perigo' : ''}`} style={{ margin: 0, fontWeight: 600 }}>{fmt(i.saldo)} {i.um}</p>
                      {i.saldo > 0 && <IconButton aria-label={`Devolver ${i.nome} ao Central`} title="Devolver ao Central" onClick={() => setDevolvendo(i)}><Undo2 size={14} /></IconButton>}
                    </div>
                  ))}
                </div>
              ))}
            </SectionCard>

            <SectionCard title="Últimas produções" descricao="30 dias" noPadding>
              {tela.ultimas.length === 0 && <p className="t-caption p-5" style={{ margin: 0 }}>Nenhuma produção nos últimos 30 dias.</p>}
              {tela.ultimas.map(p => (
                <div key={p.id} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{p.ficha}</p>
                    <p className="t-caption" style={{ margin: 0 }}>{dataHoraBR(p.criado_em)} · {p.lotes} lote{p.lotes === 1 ? '' : 's'}{p.responsavel && ` · ${p.responsavel}`}{p.lote && ` · ${p.lote}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="t-body num" style={{ margin: 0, fontWeight: 600 }}>{fmt(p.produzido)} {p.um}</p>
                    <p className="t-caption" style={{ margin: 0 }}>{brl(p.custo)}</p>
                  </div>
                </div>
              ))}
            </SectionCard>
          </div>
        </div>
      )}

      {mandando && <Mandar responsavel={responsavel} onFechar={() => setMandando(false)} onFeito={feito} />}
      {devolvendo && <Devolver i={devolvendo} responsavel={responsavel} onFechar={() => setDevolvendo(null)} onFeito={feito} />}
      {produzindo && <Produzir f={produzindo} responsavel={responsavel} onFechar={() => setProduzindo(null)} onFeito={feito} />}
    </div>
  );
};

// ── Mandar insumos Central → Produção ───────────────────────────────────────
const Mandar: React.FC<{ responsavel: string | null; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ responsavel, onFechar, onFeito }) => {
  const [quem, setQuem] = useState(responsavel || '');
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

  const salvar = async () => {
    if (validas.length === 0) { setErro('Adicione pelo menos um item com quantidade.'); return; }
    setOcupado(true); setErro(null);
    try {
      const r = await producaoApi.mover('mandar', validas, quem.trim() || null);
      await onFeito(`${r.itens} item(ns) foram do Central para a Produção.${r.faltou.length ? ` O Central não tinha tudo: ${r.faltou.join('; ')}.` : ''}`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };

  return (
    <Modal aberto onFechar={onFechar} titulo="Mandar insumos para a Produção" descricao="Sai do Central e entra na Produção. Só vai o que o Central tem." largura="lg" travado={ocupado}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<ArrowRight size={16} />} onClick={salvar} carregando={ocupado} disabled={validas.length === 0}>Mandar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3"><Input rotulo="Quem mandou" value={quem} onChange={e => setQuem(e.target.value)} /></div>
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

// ── Devolver sobra Produção → Central ───────────────────────────────────────
const Devolver: React.FC<{ i: InsumoProducao; responsavel: string | null; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ i, responsavel, onFechar, onFeito }) => {
  const [qtd, setQtd] = useState(String(i.saldo));
  const [quem, setQuem] = useState(responsavel || '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const q = num(qtd);
  const salvar = async () => {
    if (q <= 0) { setErro('Quantidade maior que zero.'); return; }
    setOcupado(true); setErro(null);
    try {
      const r = await producaoApi.mover('devolver', [{ item_id: i.item_id, quantidade: q }], quem.trim() || null);
      await onFeito(r.faltou.length ? `Devolvido só o que tinha: ${r.faltou.join('; ')}.` : `${fmt(q)} ${i.um} de ${i.nome} voltaram para o Central.`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };
  return (
    <Modal aberto onFechar={onFechar} titulo={`Devolver ${i.nome}`} descricao={`Na Produção: ${fmt(i.saldo)} ${i.um}. Volta para o Central.`} largura="sm" travado={ocupado}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Undo2 size={16} />} onClick={salvar} carregando={ocupado} disabled={q <= 0}>Devolver</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 gap-3">
        <Input rotulo={`Quantidade (${i.um})`} type="number" min={0} max={i.saldo} step="any" inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus />
        <Input rotulo="Quem devolveu" value={quem} onChange={e => setQuem(e.target.value)} />
      </div>
    </Modal>
  );
};

// ── Produzir uma ficha ──────────────────────────────────────────────────────
const Produzir: React.FC<{ f: FichaProducao; responsavel: string | null; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ f, responsavel, onFechar, onFeito }) => {
  const [lotes, setLotes] = useState('1');
  const [puxar, setPuxar] = useState(true);
  const [quem, setQuem] = useState(responsavel || '');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const n = Math.floor(num(lotes));
  const previa = f.ingredientes.map(i => {
    const precisa = i.quantidade * n;
    const faltaAqui = Math.max(precisa - i.em_producao, 0);
    const vemCentral = puxar ? Math.min(faltaAqui, Math.max(i.em_central, 0)) : 0;
    return { ...i, precisa, faltaAqui, vemCentral, fica: faltaAqui - vemCentral, custo_linha: precisa * i.custo };
  });
  const custoTotal = previa.reduce((s, p) => s + p.custo_linha, 0);
  const produzido = f.rendimento * n;
  const negativos = previa.filter(p => p.fica > 0);

  const salvar = async () => {
    if (n <= 0) { setErro('Lotes deve ser um número inteiro maior que zero.'); return; }
    if (negativos.length && !window.confirm(`Vai faltar insumo e a Produção fica negativa em: ${negativos.map(p => `${p.nome} (${fmt(p.fica)} ${p.um})`).join(', ')}. Produzir mesmo assim?`)) return;
    setOcupado(true); setErro(null);
    try {
      const r = await producaoApi.produzir({ ficha_id: f.id, lotes: n, puxar_central: puxar, responsavel: quem.trim() || null, observacoes: obs.trim() || null });
      await onFeito(`Produzido: ${fmt(r.produzido)} ${r.um} de ${r.produto} (${brl(r.custo_total)}, ${brl(r.custo_unitario)} cada). Já está no Central.${r.puxados.length ? ` Veio do Central: ${r.puxados.join('; ')}.` : ''}${r.negativos.length ? ` Ficou faltando: ${r.negativos.join('; ')}.` : ''}`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };

  return (
    <Modal aberto onFechar={onFechar} titulo={`Produzir ${f.nome}`} descricao={`Cada lote rende ${fmt(f.rendimento)} ${f.um_rend} de ${f.produz.nome}. Os insumos saem da Produção e o produto entra no Central.`} largura="lg" travado={ocupado}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado} disabled={n <= 0}>Produzir {n > 0 ? `${n} lote${n === 1 ? '' : 's'}` : ''}</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Input rotulo="Lotes" type="number" min={1} step={1} inputMode="numeric" value={lotes} onChange={e => setLotes(e.target.value)} autoFocus dica={f.lotes_possiveis > 0 ? `dá ${fmt(f.lotes_possiveis)} com o que tem aqui` : 'nada na Produção ainda'} />
        <Input rotulo="Quem produziu" value={quem} onChange={e => setQuem(e.target.value)} />
        <Input rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} className="col-span-2" dica="Opcional" />
      </div>
      <label className="flex items-center gap-2 t-body mb-3" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={puxar} onChange={e => setPuxar(e.target.checked)} />
        Puxar do Central o que faltar na Produção
      </label>
      <div className="card" style={{ padding: 0 }}>
        <div className="px-4 py-2 grid grid-cols-[minmax(0,1fr)_80px_80px_90px] gap-2 t-caps" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
          <span>Insumo</span><span className="text-right">precisa</span><span className="text-right">aqui</span><span className="text-right">do Central</span>
        </div>
        {previa.map(p => (
          <div key={p.item_id} className="px-4 py-2 grid grid-cols-[minmax(0,1fr)_80px_80px_90px] gap-2 items-center" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="min-w-0"><p className="t-body truncate" style={{ margin: 0 }}>{p.nome}</p><p className="t-caption" style={{ margin: 0 }}>{fmt(p.quantidade)} {p.um} por lote · {brl(p.custo_linha)}</p></div>
            <span className="t-body num text-right">{fmt(p.precisa)}</span>
            <span className={`t-body num text-right ${p.fica > 0 ? 'texto-perigo' : ''}`}>{fmt(p.em_producao)}</span>
            <span className={`t-body num text-right ${p.vemCentral > 0 ? 'texto-atencao' : ''}`}>{p.vemCentral > 0 ? `+${fmt(p.vemCentral)}` : p.fica > 0 ? `falta ${fmt(p.fica)}` : '—'}</span>
          </div>
        ))}
        <div className="px-4 py-2 flex items-center justify-between">
          <span className="t-body">Rende <b className="num">{fmt(produzido)} {f.um_rend}</b> de {f.produz.nome}</span>
          <span className="t-body num" style={{ fontWeight: 600 }}>{brl(custoTotal)} · {brl(produzido > 0 ? custoTotal / produzido : 0)} cada</span>
        </div>
      </div>
      {negativos.length > 0 && <div className="aviso aviso-atencao mt-3">Vai faltar na Produção: {negativos.map(p => `${p.nome} (${fmt(p.fica)} ${p.um})`).join(', ')}. {puxar ? 'O Central também não tem o suficiente.' : 'Marque "puxar do Central" ou mande os insumos antes.'} Dá para produzir mesmo assim; a Produção fica negativa e a contagem acerta.</div>}
    </Modal>
  );
};

export default Producao;
