import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowUpRight, PackageMinus, PackagePlus, Plus, Trash2, Warehouse, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ESTOQUE_MOV_LABEL, EstoqueMov, EstoqueMovTipo, EventoArea, Produto } from '../../types';
import { formatarData, parseValorBR } from '../../utils/format';
import Modal from '../../components/Modal';

function formatarQtd(q: number): string {
  return Number(q.toFixed(3)).toLocaleString('pt-BR');
}

interface SaldoProduto {
  produto: Produto;
  porArea: Map<string, number>;
  total: number;
}

// Estoque do evento: tudo entra pelo container (área de recebimento) e é
// distribuído para as áreas (pista, camarote...) por transferência.
export default function EstoqueEvento({ eventoId }: { eventoId: string }) {
  const [areas, setAreas] = useState<EventoArea[]>([]);
  const [movs, setMovs] = useState<EstoqueMov[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [modalArea, setModalArea] = useState(false);
  const [nomeArea, setNomeArea] = useState('');

  const [modalMov, setModalMov] = useState(false);
  const [mTipo, setMTipo] = useState<EstoqueMovTipo>('entrada');
  const [mProduto, setMProduto] = useState('');
  const [mQtd, setMQtd] = useState('');
  const [mOrigem, setMOrigem] = useState('');
  const [mDestino, setMDestino] = useState('');
  const [mObs, setMObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    const { data: a } = await supabase.from('rr_evento_areas').select('*').eq('evento_id', eventoId).order('criado_em');
    let listaAreas = (a as EventoArea[]) ?? [];
    if (listaAreas.length === 0) {
      // primeira visita ao estoque deste evento: cria a área de recebimento
      const { data: nova } = await supabase
        .from('rr_evento_areas')
        .insert({ evento_id: eventoId, nome: 'Container', is_recebimento: true })
        .select();
      listaAreas = (nova as EventoArea[]) ?? [];
    }
    setAreas(listaAreas);
    const { data: m } = await supabase
      .from('rr_estoque_movs')
      .select(
        '*, produto:rr_produtos(*), origem:rr_evento_areas!rr_estoque_movs_origem_area_id_fkey(*), destino:rr_evento_areas!rr_estoque_movs_destino_area_id_fkey(*)',
      )
      .eq('evento_id', eventoId)
      .order('criado_em', { ascending: false });
    setMovs((m as unknown as EstoqueMov[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [eventoId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('rr_produtos').select('*').eq('ativo', true).order('nome');
      setProdutos((data as Produto[]) ?? []);
    })();
  }, []);

  const saldos = useMemo<SaldoProduto[]>(() => {
    const porProduto = new Map<string, SaldoProduto>();
    movs.forEach((m) => {
      if (!m.produto) return;
      let item = porProduto.get(m.produto_id);
      if (!item) {
        item = { produto: m.produto, porArea: new Map(), total: 0 };
        porProduto.set(m.produto_id, item);
      }
      const add = (areaId: string | null, delta: number) => {
        if (!areaId) return;
        item!.porArea.set(areaId, (item!.porArea.get(areaId) ?? 0) + delta);
      };
      const q = Number(m.quantidade);
      if (m.tipo === 'entrada') {
        add(m.destino_area_id, q);
        item.total += q;
      } else if (m.tipo === 'transferencia') {
        add(m.origem_area_id, -q);
        add(m.destino_area_id, q);
      } else {
        add(m.origem_area_id, -q);
        item.total -= q;
      }
    });
    return [...porProduto.values()].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));
  }, [movs]);

  function saldoDe(produtoId: string, areaId: string): number {
    const item = saldos.find((s) => s.produto.id === produtoId);
    return item?.porArea.get(areaId) ?? 0;
  }

  function abrirMov(tipo: EstoqueMovTipo) {
    setMTipo(tipo);
    setMProduto(produtos[0]?.id ?? '');
    setMQtd('');
    const recebimento = areas.find((a) => a.is_recebimento) ?? areas[0];
    setMOrigem(recebimento?.id ?? '');
    setMDestino(
      tipo === 'entrada'
        ? (recebimento?.id ?? '')
        : (areas.find((a) => !a.is_recebimento)?.id ?? areas[0]?.id ?? ''),
    );
    setMObs('');
    setErroForm(null);
    setModalMov(true);
  }

  async function salvarArea(e: FormEvent) {
    e.preventDefault();
    if (!nomeArea.trim()) return;
    const { error } = await supabase
      .from('rr_evento_areas')
      .insert({ evento_id: eventoId, nome: nomeArea.trim(), is_recebimento: false });
    if (error) return alert(error.message);
    setModalArea(false);
    setNomeArea('');
    await carregar();
  }

  async function excluirArea(a: EventoArea) {
    if (!window.confirm(`Excluir a área "${a.nome}"?`)) return;
    const { error } = await supabase.from('rr_evento_areas').delete().eq('id', a.id);
    if (error) {
      return alert(
        error.message.toLowerCase().includes('foreign key')
          ? 'Há movimentações nessa área — não dá pra excluir.'
          : error.message,
      );
    }
    await carregar();
  }

  async function salvarMov(e: FormEvent) {
    e.preventDefault();
    const qtd = parseValorBR(mQtd);
    if (!mProduto) return setErroForm('Selecione o produto.');
    if (isNaN(qtd) || qtd <= 0) return setErroForm('Informe a quantidade.');
    const precisaOrigem = mTipo !== 'entrada';
    const precisaDestino = mTipo === 'entrada' || mTipo === 'transferencia';
    if (precisaOrigem && !mOrigem) return setErroForm('Selecione a área de origem.');
    if (precisaDestino && !mDestino) return setErroForm('Selecione a área de destino.');
    if (mTipo === 'transferencia' && mOrigem === mDestino) return setErroForm('Origem e destino não podem ser a mesma área.');
    if (precisaOrigem && saldoDe(mProduto, mOrigem) < qtd) {
      return setErroForm('Saldo insuficiente na área de origem.');
    }
    setSalvando(true);
    const { error } = await supabase.from('rr_estoque_movs').insert({
      evento_id: eventoId,
      produto_id: mProduto,
      tipo: mTipo,
      origem_area_id: precisaOrigem ? mOrigem : null,
      destino_area_id: precisaDestino ? mDestino : null,
      quantidade: qtd,
      obs: mObs.trim() || null,
    });
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModalMov(false);
    await carregar();
  }

  async function excluirMov(m: EstoqueMov) {
    if (!window.confirm('Excluir esta movimentação? O saldo será recalculado.')) return;
    const { error } = await supabase.from('rr_estoque_movs').delete().eq('id', m.id);
    if (error) return alert(error.message);
    await carregar();
  }

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  const precisaOrigem = mTipo !== 'entrada';
  const precisaDestino = mTipo === 'entrada' || mTipo === 'transferencia';

  return (
    <div>
      {/* áreas */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {areas.map((a) => (
          <span
            key={a.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              a.is_recebimento
                ? 'border-gold-500/40 bg-gold-500/10 text-gold-300'
                : 'border-night-700 bg-night-800 text-zinc-300'
            }`}
          >
            <Warehouse className="h-3.5 w-3.5" />
            {a.nome}
            {a.is_recebimento && <span className="text-[0.6rem] uppercase tracking-wider text-gold-500">recebimento</span>}
            {!a.is_recebimento && (
              <button onClick={() => excluirArea(a)} className="text-zinc-600 transition hover:text-red-300" title="Excluir área">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <button onClick={() => setModalArea(true)} className="btn-ghost !px-3 !py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nova área
        </button>
      </div>

      {/* ações */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => abrirMov('entrada')} className="btn-gold" disabled={produtos.length === 0}>
          <PackagePlus className="h-4 w-4" /> Entrada no container
        </button>
        <button onClick={() => abrirMov('transferencia')} className="btn-ghost" disabled={produtos.length === 0}>
          <ArrowLeftRight className="h-4 w-4" /> Transferir entre áreas
        </button>
        <button onClick={() => abrirMov('saida')} className="btn-ghost" disabled={produtos.length === 0}>
          <PackageMinus className="h-4 w-4" /> Saída / Perda
        </button>
      </div>

      {produtos.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Nenhum produto cadastrado — cadastre primeiro em <strong>Cadastros → Produtos</strong>.
        </div>
      )}

      {/* saldo por área */}
      {saldos.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-night-700 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Produto</th>
                {areas.map((a) => (
                  <th key={a.id} className="px-4 py-3 text-right font-medium">
                    {a.nome}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium text-gold-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-800">
              {saldos.map((s) => (
                <tr key={s.produto.id}>
                  <td className="px-4 py-2.5 text-zinc-200">
                    {s.produto.nome} <span className="text-xs text-zinc-600">({s.produto.unidade})</span>
                  </td>
                  {areas.map((a) => {
                    const q = s.porArea.get(a.id) ?? 0;
                    return (
                      <td key={a.id} className={`px-4 py-2.5 text-right tabular-nums ${q < 0 ? 'text-red-400' : q > 0 ? 'text-zinc-200' : 'text-zinc-600'}`}>
                        {formatarQtd(q)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gold-300">{formatarQtd(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card px-6 py-12 text-center text-sm text-zinc-500">
          Nenhuma movimentação ainda. Registre a primeira <strong>entrada no container</strong>.
        </div>
      )}

      {/* histórico */}
      {movs.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <div className="border-b border-night-700 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-white">
              Movimentações <span className="text-zinc-500">({movs.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-night-800">
            {movs.slice(0, 30).map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                    m.tipo === 'entrada'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : m.tipo === 'transferencia'
                        ? 'bg-sky-500/15 text-sky-300'
                        : m.tipo === 'perda'
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {ESTOQUE_MOV_LABEL[m.tipo]}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-zinc-200">
                    {formatarQtd(Number(m.quantidade))}× {m.produto?.nome ?? '—'}
                  </span>
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                    {m.origem?.nome}
                    {m.origem && m.destino && <ArrowUpRight className="h-3 w-3 rotate-45" />}
                    {m.destino?.nome}
                    {m.obs ? ` · ${m.obs}` : ''}
                  </span>
                </div>
                <span className="text-xs text-zinc-600">{formatarData(m.criado_em)}</span>
                <button
                  onClick={() => excluirMov(m)}
                  className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-red-950/40 hover:text-red-300"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* modal nova área */}
      <Modal aberto={modalArea} titulo="Nova área de estoque" onFechar={() => setModalArea(false)}>
        <form onSubmit={salvarArea} className="space-y-4">
          <div>
            <label className="label">Nome da área *</label>
            <input
              className="input"
              placeholder="Ex.: Pista, Camarote, Bar 2…"
              value={nomeArea}
              onChange={(e) => setNomeArea(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalArea(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" className="btn-gold">
              Criar área
            </button>
          </div>
        </form>
      </Modal>

      {/* modal movimentação */}
      <Modal aberto={modalMov} titulo="Movimentar estoque" onFechar={() => setModalMov(false)}>
        <form onSubmit={salvarMov} className="space-y-4">
          <div>
            <label className="label">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ESTOQUE_MOV_LABEL) as [EstoqueMovTipo, string][]).map(([t, rotulo]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMTipo(t)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    mTipo === t ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-night-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Produto *</label>
              <select className="input" value={mProduto} onChange={(e) => setMProduto(e.target.value)}>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.unidade})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quantidade *</label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="0"
                value={mQtd}
                onChange={(e) => setMQtd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {precisaOrigem && (
              <div>
                <label className="label">De (origem)</label>
                <select className="input" value={mOrigem} onChange={(e) => setMOrigem(e.target.value)}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                      {mProduto ? ` — saldo ${formatarQtd(saldoDe(mProduto, a.id))}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {precisaDestino && (
              <div>
                <label className="label">Para (destino)</label>
                <select className="input" value={mDestino} onChange={(e) => setMDestino(e.target.value)}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="label">Observação</label>
            <input className="input" placeholder="Opcional" value={mObs} onChange={(e) => setMObs(e.target.value)} />
          </div>

          {erroForm && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erroForm}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalMov(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
