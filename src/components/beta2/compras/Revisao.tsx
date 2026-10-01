import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Check, ClipboardCheck, EyeOff, Search } from 'lucide-react';
import { Badge, Button, Chip, EmptyState, Input, KPICard, Segmented } from '../../ui';
import { fmtData } from '../../inventory/comprasShared';
import { agruparPorCategoria } from '../../inventory/agruparPorCategoria';
import { fmt } from '../api';
import { semAcento } from '../cadastros/api';
import { comprasApi, type Classe, type ItemRevisao, type PontoSemGiro, type RevisaoTela } from './api';

interface Props { onMudou: () => void }
type Secao = 'classe' | 'pontos';

const CLASSE_ROTULO: Record<Classe, string> = { rua: 'Rua', pedido: 'Pedido', sob_demanda: 'Sob demanda' };
const CLASSES: Classe[] = ['rua', 'pedido', 'sob_demanda'];
const MOTIVO: Record<PontoSemGiro['motivo'], string> = { categoria: 'utensílio / equipamento', nunca_comprado: 'nunca comprado em 180 dias', sem_consumo: 'sem consumo e sem compra' };

/**
 * Revisão do cadastro de compras: cada item é Rua (lista do comprador),
 * Pedido (fornecedor escolhido no dia) ou Sob demanda (só entra por "Incluir").
 * Na mesma linha ajusta o ponto de pedido. Segunda seção: pontos que não giram.
 */
const Revisao: React.FC<Props> = ({ onMudou }) => {
  const [tela, setTela] = useState<RevisaoTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [secao, setSecao] = useState<Secao>('classe');
  const [soPendentes, setSoPendentes] = useState(true);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pontoDraft, setPontoDraft] = useState<Record<string, string>>({});
  const [pontoSalvo, setPontoSalvo] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await comprasApi.revisao()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const b = semAcento(busca.trim());
  const bate = (nome: string, categoria: string | null) => !b || semAcento(nome).includes(b) || semAcento(categoria || '').includes(b);
  const visiveis = useMemo(() => (tela?.itens || []).filter(p => (!soPendentes || p.classe === null) && bate(p.nome, p.categoria)), [tela, soPendentes, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const grupos = useMemo(() => agruparPorCategoria(visiveis), [visiveis]);
  const semGiro = useMemo(() => (tela?.pontosSemGiro || []).filter(p => bate(p.nome, p.categoria)), [tela, b]); // eslint-disable-line react-hooks/exhaustive-deps
  const comSugestao = visiveis.filter(p => p.sugestao && p.classe === null);
  const t = tela?.totais || {};
  const total = t.total ?? 0; const pendentes = t.pendentes ?? 0;
  const pct = total ? Math.round(((total - pendentes) / total) * 100) : 0;

  const rodar = async (chave: string, fn: () => Promise<void>) => {
    setOcupado(chave); setErro(null);
    try { await fn(); onMudou(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); } finally { setOcupado(null); }
  };
  const aplicarLocal = (ids: Set<string>, classe: Classe) => setTela(prev => {
    if (!prev) return prev;
    const totais = { ...prev.totais };
    for (const x of prev.itens) if (ids.has(x.item_id) && x.classe !== classe) {
      if (x.classe === null) totais.pendentes = Math.max(0, (totais.pendentes ?? 0) - 1); else totais[x.classe] = Math.max(0, (totais[x.classe] ?? 0) - 1);
      totais[classe] = (totais[classe] ?? 0) + 1;
    }
    return { ...prev, totais, itens: prev.itens.map(x => (ids.has(x.item_id) ? { ...x, classe } : x)) };
  });
  const definir = (p: ItemRevisao, classe: Classe) => rodar(p.item_id, async () => { await comprasApi.classeDefinir(p.item_id, classe); aplicarLocal(new Set([p.item_id]), classe); });
  const definirLote = (itens: ItemRevisao[], classe: Classe, rotulo: string) => {
    if (!itens.length || !window.confirm(`Marcar ${itens.length} item(ns) de "${rotulo}" como ${CLASSE_ROTULO[classe]}?`)) return;
    void rodar(`lote:${rotulo}`, async () => { await comprasApi.classeLote(itens.map(p => ({ item_id: p.item_id, classe }))); aplicarLocal(new Set(itens.map(p => p.item_id)), classe); });
  };
  const aplicarSugestoes = () => {
    if (!comSugestao.length || !window.confirm(`Aplicar a sugestão do histórico em ${comSugestao.length} item(ns) pendente(s)? Depois dá para trocar um a um.`)) return;
    void rodar('lote:sugestao', async () => { await comprasApi.classeLote(comSugestao.map(p => ({ item_id: p.item_id, classe: p.sugestao as Classe }))); await carregar(); });
  };
  const revisarPonto = (p: PontoSemGiro, acao: 'zerar' | 'manter') => rodar(p.item_id, async () => {
    await comprasApi.pontoRevisar(p.item_id, acao);
    setTela(prev => prev ? { ...prev, pontosSemGiro: prev.pontosSemGiro.filter(x => x.item_id !== p.item_id), itens: acao === 'zerar' ? prev.itens.map(x => (x.item_id === p.item_id ? { ...x, ponto: 0 } : x)) : prev.itens } : prev);
  });
  const zerarTodos = () => {
    if (!semGiro.length || !window.confirm(`Zerar o ponto de pedido de ${semGiro.length} item(ns)? Eles só entram em Compras por "Incluir item".`)) return;
    void rodar('lote:pontos', async () => { for (const p of semGiro) await comprasApi.pontoRevisar(p.item_id, 'zerar'); await carregar(); });
  };
  const salvarPonto = (p: ItemRevisao) => {
    const texto = pontoDraft[p.item_id];
    if (texto === undefined) return;
    const limpar = () => setPontoDraft(prev => { const n = { ...prev }; delete n[p.item_id]; return n; });
    const valor = parseFloat(texto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0 || valor === p.ponto) { limpar(); return; }
    void rodar(`ponto:${p.item_id}`, async () => {
      await comprasApi.pontoRevisar(p.item_id, 'definir', valor);
      setTela(prev => prev ? { ...prev, itens: prev.itens.map(x => (x.item_id === p.item_id ? { ...x, ponto: valor } : x)), pontosSemGiro: prev.pontosSemGiro.filter(x => x.item_id !== p.item_id) } : prev);
      limpar(); setPontoSalvo(p.item_id); setTimeout(() => setPontoSalvo(s => (s === p.item_id ? null : s)), 2000);
    });
  };
  const inativar = (p: ItemRevisao) => {
    if (!window.confirm(`Inativar "${p.nome}"? Ele sai de Compras e da contagem. Dá para reativar em Cadastros › Itens.`)) return;
    void rodar(p.item_id, async () => { await comprasApi.inativar(p.item_id); await carregar(); });
  };

  if (!tela && carregando) return <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>;

  return (
    <div className="flex flex-col gap-3">
      {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard rotulo="classificados" valor={`${pct}%`} detalhe={`${total - pendentes} de ${total} itens`} tom={pct === 100 ? 'certo' : 'atencao'} />
        <KPICard rotulo="pendentes" valor={pendentes} detalhe={t.pendentes_com_ponto ? `${t.pendentes_com_ponto} com ponto de pedido` : 'sem classe'} tom={pendentes ? 'atencao' : 'certo'} onClick={() => { setSecao('classe'); setSoPendentes(true); }} />
        <KPICard rotulo="rua · pedido · sob demanda" valor={`${t.rua ?? 0} · ${t.pedido ?? 0} · ${t.sob_demanda ?? 0}`} detalhe="como cada item é comprado" />
        <KPICard rotulo="pontos que não giram" valor={tela?.pontosSemGiro.length ?? 0} detalhe="ponto de pedido sem compra" tom={tela?.pontosSemGiro.length ? 'atencao' : 'certo'} onClick={() => setSecao('pontos')} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Secao> rotulo="Seção" valor={secao} onMudar={setSecao} opcoes={[{ valor: 'classe', rotulo: 'Classificar itens' }, { valor: 'pontos', rotulo: 'Pontos que não giram' }]} />
        {secao === 'classe' && <Chip ligado={soPendentes} onMudar={setSoPendentes} tom="atencao">Só pendentes</Chip>}
        <Input type="search" placeholder="Buscar item ou categoria" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[200px]" />
        {secao === 'classe' && comSugestao.length > 0 && <Button tamanho="sm" variante="primario" icone={<Check size={14} />} onClick={aplicarSugestoes} carregando={ocupado === 'lote:sugestao'}>Aplicar {comSugestao.length} sugestões</Button>}
        {secao === 'pontos' && semGiro.length > 0 && <Button tamanho="sm" variante="perigo" icone={<Ban size={14} />} onClick={zerarTodos} carregando={ocupado === 'lote:pontos'}>Zerar os {semGiro.length} listados</Button>}
      </div>

      {secao === 'classe' && (
        visiveis.length === 0
          ? <EmptyState icon={soPendentes ? ClipboardCheck : Search} title={soPendentes && !b ? 'Nenhum item pendente' : 'Nada encontrado'} description={soPendentes && !b ? 'Revisão concluída. Desligue "Só pendentes" para rever os demais.' : undefined} variant={b ? 'filtered' : 'empty'} compact />
          : grupos.map(([cat, itens]) => (
            <section key={cat} className="card">
              <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="t-subsec" style={{ margin: 0 }}>{cat} <span className="t-caption">· {itens.length}</span></h2>
                <div className="flex items-center gap-1">
                  <span className="t-caption mr-1">categoria toda:</span>
                  {CLASSES.map(c => <button key={c} type="button" className="btn-ghost btn-sm" onClick={() => definirLote(itens, c, cat)} disabled={ocupado !== null}>{CLASSE_ROTULO[c]}</button>)}
                </div>
              </div>
              {itens.map(p => (
                <div key={p.item_id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1 min-w-[200px]">
                    <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{p.nome} <span className="t-caption">{p.um}</span></p>
                    <p className="t-caption" style={{ margin: 0 }}>
                      Central {fmt(p.saldo)} · {p.ultimo_fornecedor
                        ? `${p.ultimo_fornecedor.modalidade === 'rua' ? 'rua' : 'entrega'}: ${p.ultimo_fornecedor.nome} · ${p.compras_180d}x${p.ultima_compra ? ` · ${fmtData(p.ultima_compra)}` : ''}`
                        : `sem compra em 180 dias${p.consumo_dia > 0 ? ' · tem consumo' : ''}`}
                      {p.classe === null && p.sugestao && <span className="texto-certo"> · sugestão: {CLASSE_ROTULO[p.sugestao]}</span>}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 t-caption">ponto
                    <input type="text" inputMode="decimal" aria-label={`Ponto de pedido de ${p.nome}`} placeholder="0"
                      value={pontoDraft[p.item_id] ?? (p.ponto > 0 ? String(p.ponto).replace('.', ',') : '')}
                      onChange={e => setPontoDraft(prev => ({ ...prev, [p.item_id]: e.target.value }))}
                      onBlur={() => salvarPonto(p)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onFocus={e => e.target.select()}
                      className="input-dark text-right font-semibold" style={{ width: 80, borderColor: pontoSalvo === p.item_id ? 'var(--ok-border)' : undefined }} />
                  </label>
                  <div className="flex items-center gap-1">
                    {CLASSES.map(c => <Chip key={c} ligado={p.classe === c} onMudar={() => definir(p, c)} tom={c === 'rua' ? 'atencao' : c === 'pedido' ? 'certo' : 'neutro'}>{CLASSE_ROTULO[c]}</Chip>)}
                    <button type="button" className="btn-icon" aria-label={`Inativar ${p.nome}`} title="Inativar: sai de Compras e da contagem" onClick={() => inativar(p)} disabled={ocupado !== null}><EyeOff size={14} /></button>
                  </div>
                </div>
              ))}
            </section>
          ))
      )}

      {secao === 'pontos' && (
        semGiro.length === 0
          ? <EmptyState icon={ClipboardCheck} title="Nenhum ponto parado" description="Pontos de pedido sem compra nem consumo aparecem aqui." compact />
          : <section className="card">
            <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="t-caption" style={{ margin: 0 }}>Zerar tira o item da lista automática (entra só por "Incluir item"). Manter só some daqui.</p>
            </div>
            {semGiro.map(p => (
              <div key={p.item_id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-[200px]">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{p.nome} <span className="t-caption">{p.categoria || 'Sem categoria'} · {p.um}</span></p>
                  <p className="t-caption" style={{ margin: 0 }}>ponto {fmt(p.ponto)} · Central {fmt(p.saldo)} · {p.ultima_compra ? `última compra ${fmtData(p.ultima_compra)} (${p.compras_180d}x)` : 'nenhuma compra em 180 dias'}</p>
                </div>
                <Badge variant="warning">{MOTIVO[p.motivo]}</Badge>
                <div className="flex items-center gap-1">
                  <Button tamanho="sm" variante="perigo" icone={<Ban size={14} />} onClick={() => revisarPonto(p, 'zerar')} carregando={ocupado === p.item_id}>Zerar ponto</Button>
                  <Button tamanho="sm" variante="discreto" icone={<Check size={14} />} onClick={() => revisarPonto(p, 'manter')} disabled={ocupado !== null}>Manter</Button>
                </div>
              </div>
            ))}
          </section>
      )}
    </div>
  );
};

export default Revisao;
