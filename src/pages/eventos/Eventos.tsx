import { FormEvent, useEffect, useState } from 'react';
import { CalendarDays, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Evento } from '../../types';
import { formatarData } from '../../utils/format';
import Modal from '../../components/Modal';

const STATUS_LABEL: Record<Evento['status'], string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

const STATUS_COR: Record<Evento['status'], string> = {
  planejado: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  em_andamento: 'bg-gold-500/15 text-gold-300 border-gold-500/30',
  encerrado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelado: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export default function Eventos() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Evento | null>(null);
  const [fNome, setFNome] = useState('');
  const [fCidade, setFCidade] = useState('');
  const [fLocal, setFLocal] = useState('');
  const [fInicio, setFInicio] = useState('');
  const [fFim, setFFim] = useState('');
  const [fStatus, setFStatus] = useState<Evento['status']>('planejado');
  const [fObs, setFObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from('rr_eventos')
      .select('*')
      .order('data_inicio', { ascending: false, nullsFirst: false });
    if (error) setErro(error.message);
    setEventos((data as Evento[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrir(e?: Evento) {
    setEdit(e ?? null);
    setFNome(e?.nome ?? '');
    setFCidade(e?.cidade ?? '');
    setFLocal(e?.local ?? '');
    setFInicio(e?.data_inicio ?? '');
    setFFim(e?.data_fim ?? '');
    setFStatus(e?.status ?? 'planejado');
    setFObs(e?.obs ?? '');
    setErroForm(null);
    setModal(true);
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setSalvando(true);
    setErroForm(null);
    const registro = {
      nome: fNome.trim(),
      cidade: fCidade.trim() || null,
      local: fLocal.trim() || null,
      data_inicio: fInicio || null,
      data_fim: fFim || null,
      status: fStatus,
      obs: fObs.trim() || null,
    };
    const { error } = edit
      ? await supabase.from('rr_eventos').update(registro).eq('id', edit.id)
      : await supabase.from('rr_eventos').insert(registro);
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModal(false);
    await carregar();
  }

  async function excluir(e: Evento) {
    if (!window.confirm(`Excluir o evento "${e.nome}"? Não dá pra desfazer.`)) return;
    const { error } = await supabase.from('rr_eventos').delete().eq('id', e.id);
    if (error) {
      return alert(
        error.message.includes('foreign key')
          ? 'Não dá pra excluir: há viagens vinculadas a este evento. Marque como encerrado em vez de excluir.'
          : error.message,
      );
    }
    await carregar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-zinc-500">Agenda dos eventos de bar &amp; show</p>
        <button onClick={() => abrir()} className="btn-gold">
          <Plus className="h-4 w-4" /> Novo evento
        </button>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">{erro}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
        </div>
      ) : eventos.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-zinc-500">Nenhum evento cadastrado.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((e) => (
            <div key={e.id} className="card group p-5 transition hover:border-gold-500/50">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{e.nome}</h3>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => abrir(e)} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-night-800 hover:text-gold-300">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => excluir(e)} className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-red-950/40 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-zinc-600" />
                  {formatarData(e.data_inicio)}
                  {e.data_fim && e.data_fim !== e.data_inicio ? ` → ${formatarData(e.data_fim)}` : ''}
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-600" />
                  {[e.local, e.cidade].filter(Boolean).join(' · ') || 'Local a definir'}
                </div>
              </div>
              <span className={`mt-4 inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_COR[e.status]}`}>
                {STATUS_LABEL[e.status]}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal aberto={modal} titulo={edit ? 'Editar evento' : 'Novo evento'} onFechar={() => setModal(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="label">Nome do evento *</label>
            <input className="input" value={fNome} onChange={(e) => setFNome(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cidade</label>
              <input className="input" value={fCidade} onChange={(e) => setFCidade(e.target.value)} />
            </div>
            <div>
              <label className="label">Local</label>
              <input className="input" value={fLocal} onChange={(e) => setFLocal(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Início</label>
              <input type="date" className="input" value={fInicio} onChange={(e) => setFInicio(e.target.value)} />
            </div>
            <div>
              <label className="label">Fim</label>
              <input type="date" className="input" value={fFim} onChange={(e) => setFFim(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value as Evento['status'])}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input" rows={2} value={fObs} onChange={(e) => setFObs(e.target.value)} />
          </div>
          {erroForm && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erroForm}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
