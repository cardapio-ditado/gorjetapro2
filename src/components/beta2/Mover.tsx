import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Check, Plus, RefreshCw, X } from 'lucide-react';
import { Button, EmptyState, IconButton, Input, PageHeader, SectionCard, Select } from '../ui';
import { moverApi, type MoverTela } from './api';
import { cadastrosApi, fmt, type ItemBasico } from './cadastros/api';
import BuscaItem from './BuscaItem';

interface Props { responsavel: string | null; onVoltar: () => void }
interface Linha { chave: number; item_id: string; nome: string; um: string; quantidade: string }
const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
const dataHoraBR = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Mover entre estoques: transferência livre, de qualquer estoque para qualquer
 * outro. Sem nível, pedido ou aprovação. Para o que volta ao Central, o que
 * passa de um setor para outro, o que vai sem pedido. Só sai o que a origem tem.
 */
const Mover: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [tela, setTela] = useState<MoverTela | null>(null);
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [de, setDe] = useState('');
  const [para, setPara] = useState('');
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [quem, setQuem] = useState(responsavel || '');
  const [motivo, setMotivo] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: 1, item_id: '', nome: '', um: '', quantidade: '' }]);
  const [seq, setSeq] = useState(2);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await moverApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); cadastrosApi.itensBasicos().then(i => setItens(i.filter(x => x.status === 'ativo'))).catch(() => undefined); }, []);
  useEffect(() => { if (!de) { setSaldos({}); return; } moverApi.saldos(de).then(setSaldos).catch(() => setSaldos({})); }, [de]);

  const itemPorId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const opcoes = useMemo(() => itens.map(x => ({ id: x.id, nome: x.nome.trim(), sub: `${x.categoria || 'Sem categoria'} · ${x.unidade_medida}${saldos[x.id] ? ` · tem ${fmt(saldos[x.id])}` : ''}` })), [itens, saldos]);
  const mudar = (chave: number, patch: Partial<Linha>) => setLinhas(p => p.map(l => (l.chave === chave ? { ...l, ...patch } : l)));
  const validas = linhas.filter(l => l.item_id && num(l.quantidade) > 0).map(l => ({ item_id: l.item_id, quantidade: num(l.quantidade) }));
  const nomeDe = tela?.estoques.find(e => e.id === de)?.nome || '';
  const nomePara = tela?.estoques.find(e => e.id === para)?.nome || '';
  const trocar = () => { const a = de; setDe(para); setPara(a); };

  const mover = async () => {
    if (!de || !para) { setErro('Escolha de onde sai e para onde vai.'); return; }
    if (de === para) { setErro('Origem e destino são o mesmo estoque.'); return; }
    if (validas.length === 0) { setErro('Adicione pelo menos um item com quantidade.'); return; }
    setOcupado(true); setErro(null); setAviso(null);
    try {
      const r = await moverApi.mover({ de, para, itens: validas, responsavel: quem.trim() || null, motivo: motivo.trim() || null });
      setAviso(`${r.itens} item(ns) foram de ${r.de} para ${r.para}.${r.faltou.length ? ` Não foi tudo: ${r.faltou.join('; ')}.` : ''}`);
      setLinhas([{ chave: seq, item_id: '', nome: '', um: '', quantidade: '' }]); setSeq(s => s + 1); setMotivo('');
      await carregar();
      moverApi.saldos(de).then(setSaldos).catch(() => undefined);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(false); }
  };

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Mover entre estoques" subtitle="De qualquer estoque para qualquer outro, na hora. Sem nível, pedido ou aprovação. Só sai o que a origem tem."
        actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
        <SectionCard title="Mover" descricao={de && para ? `${nomeDe} → ${nomePara}` : 'Escolha de onde sai e para onde vai'}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-end mb-3">
            <Select rotulo="De" value={de} onChange={e => setDe(e.target.value)}><option value="">Escolher…</option>{tela?.estoques.map(e => <option key={e.id} value={e.id} disabled={e.id === para}>{e.nome}</option>)}</Select>
            <div className="pb-1"><IconButton aria-label="Inverter origem e destino" title="Inverter" onClick={trocar} disabled={!de && !para}><ArrowLeftRight size={16} /></IconButton></div>
            <Select rotulo="Para" value={para} onChange={e => setPara(e.target.value)}><option value="">Escolher…</option>{tela?.estoques.map(e => <option key={e.id} value={e.id} disabled={e.id === de}>{e.nome}</option>)}</Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Input rotulo="Quem moveu" value={quem} onChange={e => setQuem(e.target.value)} />
            <Input rotulo="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} dica="Opcional: sobrou no bar, pegou da cozinha…" />
          </div>
          <div className="flex items-center justify-between mb-2"><span className="t-label" style={{ color: 'var(--text-secondary)' }}>Itens</span><Button tamanho="sm" icone={<Plus size={14} />} onClick={() => { setLinhas(p => [...p, { chave: seq, item_id: '', nome: '', um: '', quantidade: '' }]); setSeq(s => s + 1); }}>Adicionar item</Button></div>
          {linhas.map(l => {
            const tem = l.item_id ? saldos[l.item_id] ?? 0 : 0;
            const q = num(l.quantidade);
            return (
              <div key={l.chave} className="grid grid-cols-[minmax(0,1fr)_100px_auto] gap-2 items-end mb-2">
                {l.item_id
                  ? <div className="min-w-0 pb-1"><p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{l.nome}</p><p className={`t-caption ${de && q > tem ? 'texto-atencao' : ''}`} style={{ margin: 0 }}>{de ? `${nomeDe} tem ${fmt(tem)} ${l.um}${q > tem ? ` · só vai ${fmt(Math.max(tem, 0))}` : ''}` : l.um}</p></div>
                  : <BuscaItem valor="" opcoes={opcoes} placeholder="Digite o nome do item" onEscolher={id => { const it = itemPorId.get(id); if (it) mudar(l.chave, { item_id: id, nome: it.nome.trim(), um: it.unidade_medida }); }} autoFocus={linhas.length > 1} />}
                <Input aria-label="Quantidade" type="number" min={0} step="any" inputMode="decimal" placeholder="qtd" value={l.quantidade} onChange={e => mudar(l.chave, { quantidade: e.target.value })} />
                <div className="pb-1"><button type="button" className="btn-icon btn-icon-danger" aria-label="Tirar linha" onClick={() => setLinhas(p => (p.length > 1 ? p.filter(x => x.chave !== l.chave) : p.map(x => ({ ...x, item_id: '', nome: '', um: '', quantidade: '' }))))}><X size={14} /></button></div>
              </div>
            );
          })}
          <div className="flex justify-end mt-3">
            <Button variante="primario" icone={<Check size={16} />} onClick={mover} carregando={ocupado} disabled={!de || !para || validas.length === 0}>Mover {validas.length > 0 ? `${validas.length} item(ns)` : ''}</Button>
          </div>
        </SectionCard>

        <SectionCard title="Últimas movidas" descricao="30 dias, só as feitas por aqui" noPadding>
          {tela && tela.ultimas.length === 0 && <div className="p-5"><EmptyState compact icon={ArrowLeftRight} title="Nada movido ainda" description="O que você mover aparece aqui, e no histórico de movimentações." /></div>}
          {tela?.ultimas.map(u => (
            <div key={u.id} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex-1 min-w-0">
                <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{u.item}</p>
                <p className="t-caption truncate" style={{ margin: 0 }}>{dataHoraBR(u.quando)} · {u.de} → {u.para}{u.quem ? ` · ${u.quem.replace(/^Por /, '')}` : ''}{u.motivo && u.motivo !== 'Movido entre estoques' ? ` · ${u.motivo}` : ''}</p>
              </div>
              <p className="t-body num" style={{ margin: 0, fontWeight: 600 }}>{fmt(u.quantidade)} {u.um}</p>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
};

export default Mover;
