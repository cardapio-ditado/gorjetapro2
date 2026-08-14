import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Boxes,
  CalendarDays,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Landmark,
  MapPin,
  Pencil,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Evento, EVENTO_STATUS_LABEL, STATUS_VIAGEM_LABEL, Viagem } from '../../types';
import { formatarData, formatarMoeda } from '../../utils/format';
import Modal from '../../components/Modal';
import EstoqueEvento from './EstoqueEvento';
import FinanceiroEvento from './FinanceiroEvento';

const STATUS_COR: Record<Evento['status'], string> = {
  planejado: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  em_andamento: 'bg-gold-500/15 text-gold-300 border-gold-500/30',
  encerrado: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelado: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

type Aba = 'estoque' | 'financeiro' | 'viagens';

// Hub do evento: tudo que pertence ao evento vive aqui — estoque por área,
// financeiro do evento e viagens de preparação vinculadas.
export default function EventoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('estoque');

  const [modalEditar, setModalEditar] = useState(false);
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
    const { data } = await supabase.from('rr_eventos').select('*').eq('id', id).single();
    setEvento(data as Evento | null);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [id]);

  function abrirEdicao() {
    if (!evento) return;
    setFNome(evento.nome);
    setFCidade(evento.cidade ?? '');
    setFLocal(evento.local ?? '');
    setFInicio(evento.data_inicio ?? '');
    setFFim(evento.data_fim ?? '');
    setFStatus(evento.status);
    setFObs(evento.obs ?? '');
    setErroForm(null);
    setModalEditar(true);
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm(null);
    const { error } = await supabase
      .from('rr_eventos')
      .update({
        nome: fNome.trim(),
        cidade: fCidade.trim() || null,
        local: fLocal.trim() || null,
        data_inicio: fInicio || null,
        data_fim: fFim || null,
        status: fStatus,
        obs: fObs.trim() || null,
      })
      .eq('id', id);
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModalEditar(false);
    await carregar();
  }

  async function excluirEvento() {
    if (!window.confirm('Excluir este evento? Estoque e áreas do evento também serão removidos. Não dá pra desfazer.')) return;
    const { error } = await supabase.from('rr_eventos').delete().eq('id', id);
    if (error) {
      return alert(
        error.message.toLowerCase().includes('foreign key')
          ? 'Não dá pra excluir: há viagens ou lançamentos financeiros vinculados a este evento. Marque como cancelado ou encerrado.'
          : error.message,
      );
    }
    navigate('/eventos');
  }

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  if (!evento) {
    return (
      <div className="py-20 text-center text-sm text-zinc-400">
        Evento não encontrado.
        <div className="mt-4">
          <Link to="/eventos" className="btn-ghost">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <Link to="/eventos" className="btn-ghost !py-1.5">
          <ChevronLeft className="h-4 w-4" /> Eventos
        </Link>
        <div className="flex flex-wrap gap-2">
          <button onClick={abrirEdicao} className="btn-ghost">
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button onClick={excluirEvento} className="btn-ghost !px-3" title="Excluir evento">
            <Trash2 className="h-4 w-4 text-red-400" />
          </button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{evento.nome}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-zinc-600" />
                {[evento.local, evento.cidade].filter(Boolean).join(' · ') || 'Local a definir'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-zinc-600" />
                {formatarData(evento.data_inicio)}
                {evento.data_fim && evento.data_fim !== evento.data_inicio ? ` → ${formatarData(evento.data_fim)}` : ''}
              </span>
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_COR[evento.status]}`}>
            {EVENTO_STATUS_LABEL[evento.status]}
          </span>
        </div>
        {evento.obs && <p className="mt-3 border-t border-night-700 pt-3 text-sm text-zinc-400">{evento.obs}</p>}
      </div>

      {/* abas do hub */}
      <div className="mt-6 mb-5 flex flex-wrap gap-2">
        {(
          [
            ['estoque', 'Estoque do evento', Boxes],
            ['financeiro', 'Financeiro do evento', Landmark],
            ['viagens', 'Viagens de preparação', CarFront],
          ] as [Aba, string, React.ElementType][]
        ).map(([chave, rotulo, Icone]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              aba === chave
                ? 'border border-gold-500/40 bg-gold-500/15 text-gold-300'
                : 'border border-night-700 text-zinc-400 hover:text-white'
            }`}
          >
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === 'estoque' && <EstoqueEvento eventoId={evento.id} />}
      {aba === 'financeiro' && <FinanceiroEvento eventoId={evento.id} />}
      {aba === 'viagens' && <ViagensEvento eventoId={evento.id} />}

      {/* modal editar evento */}
      <Modal aberto={modalEditar} titulo="Editar evento" onFechar={() => setModalEditar(false)}>
        <form onSubmit={salvarEdicao} className="space-y-4">
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
              {Object.entries(EVENTO_STATUS_LABEL).map(([k, v]) => (
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
            <button type="button" onClick={() => setModalEditar(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ViagensEvento({ eventoId }: { eventoId: string }) {
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('rr_viagens')
        .select('*, funcionario:rr_funcionarios(*), veiculo:rr_veiculos(*)')
        .eq('evento_id', eventoId)
        .order('criado_em', { ascending: false });
      setViagens((data as unknown as Viagem[]) ?? []);
      setCarregando(false);
    })();
  }, [eventoId]);

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  if (viagens.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-12 text-center">
        <CarFront className="h-10 w-10 text-zinc-600" />
        <p className="mt-4 text-sm text-zinc-400">Nenhuma viagem de preparação vinculada a este evento.</p>
        <Link to="/viagens" className="btn-ghost mt-4">
          Ir para Prestação de Contas Externa
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {viagens.map((v) => (
        <Link
          key={v.id}
          to={`/viagens/${v.id}`}
          className="card group flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:border-gold-500/50"
        >
          <div className="flex min-w-[12rem] flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold-600/30 bg-gold-500/10 text-gold-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{v.funcionario?.nome ?? '—'}</div>
              <div className="text-xs text-zinc-500">{v.veiculo?.nome ?? 'Sem veículo'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <CalendarDays className="h-3.5 w-3.5 text-zinc-600" />
            {formatarData(v.data_partida)} → {formatarData(v.data_retorno_prevista)}
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gold-300">
            <Wallet className="h-4 w-4 text-gold-500" />
            {formatarMoeda(v.valor_alocado)}
          </div>
          <span className="rounded-full border border-night-700 px-2.5 py-1 text-xs font-medium text-zinc-300">
            {STATUS_VIAGEM_LABEL[v.status]}
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-600 transition group-hover:text-gold-400" />
        </Link>
      ))}
    </div>
  );
}
