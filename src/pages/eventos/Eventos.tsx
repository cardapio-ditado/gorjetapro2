import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Evento, EVENTO_STATUS_LABEL } from '../../types';
import { formatarData } from '../../utils/format';
import Modal from '../../components/Modal';

const STATUS_COR: Record<Evento['status'], string> = {
  planejado: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  em_andamento: 'bg-gold-500/15 text-gold-300 border-gold-500/30',
  encerrado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelado: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export default function Eventos() {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [fNome, setFNome] = useState('');
  const [fCidade, setFCidade] = useState('');
  const [fLocal, setFLocal] = useState('');
  const [fInicio, setFInicio] = useState('');
  const [fFim, setFFim] = useState('');
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

  function abrirNovo() {
    setFNome('');
    setFCidade('');
    setFLocal('');
    setFInicio('');
    setFFim('');
    setFObs('');
    setErroForm(null);
    setModal(true);
  }

  async function criar(ev: FormEvent) {
    ev.preventDefault();
    setSalvando(true);
    setErroForm(null);
    const { data, error } = await supabase
      .from('rr_eventos')
      .insert({
        nome: fNome.trim(),
        cidade: fCidade.trim() || null,
        local: fLocal.trim() || null,
        data_inicio: fInicio || null,
        data_fim: fFim || null,
        obs: fObs.trim() || null,
      })
      .select('id')
      .single();
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModal(false);
    if (data) navigate(`/eventos/${data.id}`);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Cada evento é um hub: dados, estoque por área e financeiro ficam dentro dele.
        </p>
        <button onClick={abrirNovo} className="btn-gold">
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
            <Link key={e.id} to={`/eventos/${e.id}`} className="card group p-5 transition hover:border-gold-500/50">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{e.nome}</h3>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-gold-400" />
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
                {EVENTO_STATUS_LABEL[e.status]}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Modal aberto={modal} titulo="Novo evento" onFechar={() => setModal(false)}>
        <form onSubmit={criar} className="space-y-4">
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
              {salvando ? 'Criando…' : 'Criar e abrir evento'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
