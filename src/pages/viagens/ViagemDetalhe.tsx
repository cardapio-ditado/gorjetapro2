import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Link2,
  MessageCircle,
  Paperclip,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { supabase, BUCKET_COMPROVANTES } from '../../lib/supabase';
import {
  CATEGORIAS_DESPESA,
  LancamentoTipo,
  STATUS_VIAGEM_LABEL,
  Viagem,
  ViagemLancamento,
} from '../../types';
import { formatarData, formatarMoeda, hojeISO } from '../../utils/format';
import Modal from '../../components/Modal';

export default function ViagemDetalhe() {
  const { id } = useParams();
  const [viagem, setViagem] = useState<Viagem | null>(null);
  const [lancamentos, setLancamentos] = useState<ViagemLancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalLanc, setModalLanc] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  // formulário de lançamento
  const [lTipo, setLTipo] = useState<LancamentoTipo>('despesa');
  const [lCategoria, setLCategoria] = useState(CATEGORIAS_DESPESA[0]);
  const [lDescricao, setLDescricao] = useState('');
  const [lValor, setLValor] = useState('');
  const [lData, setLData] = useState(hojeISO());
  const [lArquivo, setLArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    const [{ data: v, error: e1 }, { data: l, error: e2 }] = await Promise.all([
      supabase
        .from('rr_viagens')
        .select('*, token_publico, funcionario:rr_funcionarios(*), veiculo:rr_veiculos(*), evento:rr_eventos(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('rr_viagem_lancamentos')
        .select('*')
        .eq('viagem_id', id)
        .order('data_lancamento', { ascending: true })
        .order('criado_em', { ascending: true }),
    ]);
    if (e1 || e2) setErro(e1?.message ?? e2?.message ?? 'Erro ao carregar');
    setViagem(v as Viagem | null);
    setLancamentos((l as ViagemLancamento[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [id]);

  const resumo = useMemo(() => {
    const soma = (tipo: LancamentoTipo) =>
      lancamentos.filter((l) => l.tipo === tipo).reduce((acc, l) => acc + Number(l.valor), 0);
    const alocado = Number(viagem?.valor_alocado ?? 0);
    const aportes = soma('aporte');
    const despesas = soma('despesa');
    const devolvido = soma('devolucao');
    const saldo = alocado + aportes - despesas - devolvido;
    return { alocado, aportes, despesas, devolvido, saldo };
  }, [viagem, lancamentos]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    lancamentos
      .filter((l) => l.tipo === 'despesa')
      .forEach((l) => {
        const cat = l.categoria ?? 'Outros';
        mapa.set(cat, (mapa.get(cat) ?? 0) + Number(l.valor));
      });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [lancamentos]);

  async function adicionarLancamento(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    const valor = parseFloat(lValor.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) return setErroForm('Informe um valor válido.');
    setSalvando(true);
    try {
      let comprovanteUrl: string | null = null;
      if (lArquivo) {
        const ext = lArquivo.name.split('.').pop() ?? 'jpg';
        const caminho = `${id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_COMPROVANTES)
          .upload(caminho, lArquivo, { upsert: false });
        if (upErr) throw new Error(`Falha ao enviar comprovante: ${upErr.message}`);
        comprovanteUrl = supabase.storage.from(BUCKET_COMPROVANTES).getPublicUrl(caminho).data.publicUrl;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('rr_viagem_lancamentos').insert({
        viagem_id: id,
        tipo: lTipo,
        categoria: lTipo === 'despesa' ? lCategoria : null,
        descricao: lDescricao.trim() || null,
        valor,
        data_lancamento: lData,
        comprovante_url: comprovanteUrl,
        criado_por: userData.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      setModalLanc(false);
      setLDescricao('');
      setLValor('');
      setLArquivo(null);
      await carregar();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirLancamento(l: ViagemLancamento) {
    if (!window.confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('rr_viagem_lancamentos').delete().eq('id', l.id);
    if (error) return alert(error.message);
    await carregar();
  }

  async function mudarStatus(novo: Viagem['status'], extras: Record<string, unknown> = {}) {
    const { error } = await supabase.from('rr_viagens').update({ status: novo, ...extras }).eq('id', id);
    if (error) return alert(error.message);
    await carregar();
  }

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  if (!viagem) {
    return (
      <div className="py-20 text-center text-sm text-zinc-400">
        {erro ?? 'Viagem não encontrada.'}
        <div className="mt-4">
          <Link to="/viagens" className="btn-ghost">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </div>
    );
  }

  const aberta = viagem.status === 'em_viagem' || viagem.status === 'prestacao_pendente';
  const linkPublico = viagem.token_publico ? `${window.location.origin}/p/${viagem.token_publico}` : null;

  function copiarLink() {
    if (!linkPublico) return;
    navigator.clipboard.writeText(linkPublico);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  function compartilharWhatsApp() {
    if (!linkPublico) return;
    const texto =
      `Olá${viagem?.funcionario?.nome ? `, ${viagem.funcionario.nome.split(' ')[0]}` : ''}! ` +
      `Use este link para lançar seus gastos da viagem (tire foto dos comprovantes): ${linkPublico}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  return (
    <div className="print:text-black">
      {/* cabeçalho */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <Link to="/viagens" className="btn-ghost !py-1.5">
          <ChevronLeft className="h-4 w-4" /> Viagens
        </Link>
        <div className="flex flex-wrap gap-2">
          {linkPublico && aberta && (
            <>
              <button onClick={copiarLink} className="btn-ghost" title="Copiar link do colaborador">
                <Link2 className="h-4 w-4" /> {linkCopiado ? 'Copiado!' : 'Link do colaborador'}
              </button>
              <button onClick={compartilharWhatsApp} className="btn-ghost !px-3" title="Enviar por WhatsApp">
                <MessageCircle className="h-4 w-4 text-emerald-400" />
              </button>
            </>
          )}
          <button onClick={() => window.print()} className="btn-ghost">
            <Printer className="h-4 w-4" /> Relatório
          </button>
          {viagem.status === 'em_viagem' && (
            <button
              onClick={() => mudarStatus('prestacao_pendente', { data_retorno_real: hojeISO() })}
              className="btn-ghost"
            >
              <Undo2 className="h-4 w-4" /> Registrar retorno
            </button>
          )}
          {viagem.status === 'prestacao_pendente' && (
            <button onClick={() => mudarStatus('fechada')} className="btn-gold">
              <CheckCircle2 className="h-4 w-4" /> Fechar prestação
            </button>
          )}
          {viagem.status === 'fechada' && (
            <button onClick={() => mudarStatus('prestacao_pendente')} className="btn-ghost">
              <RotateCcw className="h-4 w-4" /> Reabrir
            </button>
          )}
          {aberta && (
            <button onClick={() => setModalLanc(true)} className="btn-gold">
              <Plus className="h-4 w-4" /> Lançamento
            </button>
          )}
        </div>
      </div>

      {/* título do relatório (impressão) */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold">RR Bares — Prestação de Contas de Viagem</h1>
      </div>

      {/* dados da viagem */}
      <div className="card p-5 print:border print:border-zinc-300 print:bg-white print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white print:text-black">{viagem.funcionario?.nome}</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {viagem.evento ? `Evento: ${viagem.evento.nome}` : 'Sem evento vinculado'}
              {viagem.evento?.cidade ? ` · ${viagem.evento.cidade}` : ''}
            </p>
          </div>
          <span className="rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-300 print:text-black">
            {STATUS_VIAGEM_LABEL[viagem.status]}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Veículo</div>
            <div className="mt-1 text-zinc-200 print:text-black">
              {viagem.veiculo ? `${viagem.veiculo.nome}${viagem.veiculo.placa ? ` · ${viagem.veiculo.placa}` : ''}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Partida</div>
            <div className="mt-1 text-zinc-200 print:text-black">{formatarData(viagem.data_partida)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Retorno previsto</div>
            <div className="mt-1 text-zinc-200 print:text-black">{formatarData(viagem.data_retorno_prevista)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Retorno real</div>
            <div className="mt-1 text-zinc-200 print:text-black">{formatarData(viagem.data_retorno_real)}</div>
          </div>
        </div>
        {viagem.obs && <p className="mt-4 border-t border-night-700 pt-3 text-sm text-zinc-400">{viagem.obs}</p>}
      </div>

      {/* resumo financeiro */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { rotulo: 'Valor alocado', valor: resumo.alocado, cor: 'text-zinc-100' },
          { rotulo: 'Aportes extras', valor: resumo.aportes, cor: 'text-sky-300' },
          { rotulo: 'Total gasto', valor: resumo.despesas, cor: 'text-red-300' },
          { rotulo: 'Devolvido', valor: resumo.devolvido, cor: 'text-emerald-300' },
          {
            rotulo: resumo.saldo >= 0 ? 'Saldo em mãos' : 'Saldo (estourou)',
            valor: resumo.saldo,
            cor: resumo.saldo >= 0 ? 'text-gold-300' : 'text-red-400',
          },
        ].map((c) => (
          <div key={c.rotulo} className="card px-4 py-3 print:border print:border-zinc-300 print:bg-white print:shadow-none">
            <div className="text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">{c.rotulo}</div>
            <div className={`mt-1 font-display text-lg font-bold ${c.cor} print:text-black`}>{formatarMoeda(c.valor)}</div>
          </div>
        ))}
      </div>

      {/* gastos por categoria */}
      {porCategoria.length > 0 && (
        <div className="card mt-4 p-5 print:border print:border-zinc-300 print:bg-white print:shadow-none">
          <h3 className="text-sm font-semibold text-white print:text-black">Gastos por categoria</h3>
          <div className="mt-3 space-y-2">
            {porCategoria.map(([cat, val]) => (
              <div key={cat} className="flex items-center gap-3 text-sm">
                <div className="w-40 shrink-0 text-zinc-400 print:text-black">{cat}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-night-800 print:bg-zinc-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400"
                    style={{ width: `${Math.max(4, (val / (resumo.despesas || 1)) * 100)}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right font-medium text-zinc-200 print:text-black">{formatarMoeda(val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* lançamentos */}
      <div className="card mt-4 overflow-hidden print:border print:border-zinc-300 print:bg-white print:shadow-none">
        <div className="flex items-center justify-between border-b border-night-700 px-5 py-4">
          <h3 className="text-sm font-semibold text-white print:text-black">
            Lançamentos <span className="text-zinc-500">({lancamentos.length})</span>
          </h3>
          {aberta && (
            <button onClick={() => setModalLanc(true)} className="btn-ghost !py-1.5 print:hidden">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          )}
        </div>

        {lancamentos.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            Nenhum lançamento ainda. O colaborador registra aqui cada gasto da viagem, com foto do comprovante.
          </p>
        ) : (
          <div className="divide-y divide-night-800">
            {lancamentos.map((l) => (
              <div key={l.id} className="flex items-center gap-4 px-5 py-3.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                    l.tipo === 'despesa'
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : l.tipo === 'aporte'
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  }`}
                >
                  {l.tipo === 'despesa' ? (
                    <ArrowDownCircle className="h-4.5 w-4.5" />
                  ) : l.tipo === 'aporte' ? (
                    <ArrowUpCircle className="h-4.5 w-4.5" />
                  ) : (
                    <Undo2 className="h-4.5 w-4.5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100 print:text-black">
                    {l.tipo === 'aporte' ? 'Aporte extra' : l.tipo === 'devolucao' ? 'Devolução à central' : (l.categoria ?? 'Despesa')}
                    {l.descricao ? <span className="font-normal text-zinc-400"> — {l.descricao}</span> : null}
                  </div>
                  <div className="text-xs text-zinc-500">{formatarData(l.data_lancamento)}</div>
                </div>

                {l.comprovante_url && (
                  <button
                    onClick={() => setFotoAmpliada(l.comprovante_url)}
                    className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-night-700 print:hidden"
                    title="Ver comprovante"
                  >
                    <img src={l.comprovante_url} alt="Comprovante" className="h-full w-full object-cover transition group-hover:scale-110" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <Paperclip className="h-4 w-4 text-white" />
                    </span>
                  </button>
                )}

                <div
                  className={`w-28 shrink-0 text-right text-sm font-semibold ${
                    l.tipo === 'despesa' ? 'text-red-300' : l.tipo === 'aporte' ? 'text-sky-300' : 'text-emerald-300'
                  } print:text-black`}
                >
                  {l.tipo === 'despesa' || l.tipo === 'devolucao' ? '−' : '+'} {formatarMoeda(l.valor)}
                </div>

                {aberta && (
                  <button
                    onClick={() => excluirLancamento(l)}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition hover:bg-red-950/40 hover:text-red-300 print:hidden"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* modal novo lançamento */}
      <Modal aberto={modalLanc} titulo="Novo lançamento" onFechar={() => setModalLanc(false)}>
        <form onSubmit={adicionarLancamento} className="space-y-4">
          <div>
            <label className="label">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['despesa', 'Despesa'],
                  ['aporte', 'Aporte extra'],
                  ['devolucao', 'Devolução'],
                ] as [LancamentoTipo, string][]
              ).map(([t, rotulo]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLTipo(t)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    lTipo === t
                      ? 'border-gold-500/60 bg-gold-500/15 text-gold-300'
                      : 'border-night-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              {lTipo === 'despesa'
                ? 'Gasto feito pelo colaborador durante a viagem.'
                : lTipo === 'aporte'
                  ? 'Dinheiro extra enviado pela central durante a viagem.'
                  : 'Dinheiro devolvido pelo colaborador ao final da viagem.'}
            </p>
          </div>

          {lTipo === 'despesa' && (
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={lCategoria} onChange={(e) => setLCategoria(e.target.value)}>
                {CATEGORIAS_DESPESA.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Valor (R$) *</label>
              <input
                type="text"
                inputMode="decimal"
                className="input"
                placeholder="0,00"
                value={lValor}
                onChange={(e) => setLValor(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={lData} onChange={(e) => setLData(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Descrição</label>
            <input
              type="text"
              className="input"
              placeholder="Ex.: abastecimento na BR-163"
              value={lDescricao}
              onChange={(e) => setLDescricao(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Foto do comprovante</label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-night-700 bg-night-800/60 px-4 py-3 text-sm text-zinc-400 transition hover:border-gold-500/50 hover:text-zinc-200">
              <Camera className="h-5 w-5 text-gold-500" />
              {lArquivo ? lArquivo.name : 'Tirar foto ou escolher imagem…'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setLArquivo(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {erroForm && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erroForm}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalLanc(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Salvar lançamento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* visualização de comprovante */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setFotoAmpliada(null)}
        >
          <img src={fotoAmpliada} alt="Comprovante" className="max-h-full max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
