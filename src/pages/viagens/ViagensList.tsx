import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CarFront, ChevronRight, Plus, User, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Evento, Funcionario, Veiculo, Viagem, ViagemStatus, STATUS_VIAGEM_LABEL } from '../../types';
import { formatarData, formatarMoeda, hojeISO } from '../../utils/format';
import Modal from '../../components/Modal';

const CORES_STATUS: Record<ViagemStatus, string> = {
  em_viagem: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  prestacao_pendente: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  fechada: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelada: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export default function ViagensList() {
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas');
  const [modalNova, setModalNova] = useState(false);

  // apoio para o formulário
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);

  // campos da nova viagem
  const [fFuncionario, setFFuncionario] = useState('');
  const [fVeiculo, setFVeiculo] = useState('');
  const [fEvento, setFEvento] = useState('');
  const [fPartida, setFPartida] = useState(hojeISO());
  const [fRetorno, setFRetorno] = useState('');
  const [fValor, setFValor] = useState('');
  const [fObs, setFObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    let query = supabase
      .from('rr_viagens')
      .select('*, funcionario:rr_funcionarios(*), veiculo:rr_veiculos(*), evento:rr_eventos(*)')
      .order('criado_em', { ascending: false });
    if (filtro === 'abertas') query = query.in('status', ['em_viagem', 'prestacao_pendente']);
    const { data, error } = await query;
    if (error) setErro(error.message);
    setViagens((data as Viagem[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [filtro]);

  useEffect(() => {
    (async () => {
      const [f, v, e] = await Promise.all([
        supabase.from('rr_funcionarios').select('*').eq('ativo', true).order('nome'),
        supabase.from('rr_veiculos').select('*').eq('ativo', true).order('nome'),
        supabase.from('rr_eventos').select('*').in('status', ['planejado', 'em_andamento']).order('data_inicio'),
      ]);
      setFuncionarios((f.data as Funcionario[]) ?? []);
      setVeiculos((v.data as Veiculo[]) ?? []);
      setEventos((e.data as Evento[]) ?? []);
    })();
  }, []);

  async function criarViagem(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    const valor = parseFloat(fValor.replace(',', '.'));
    if (!fFuncionario) return setErroForm('Selecione o funcionário.');
    if (isNaN(valor) || valor < 0) return setErroForm('Informe um valor alocado válido.');
    setSalvando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('rr_viagens')
      .insert({
        funcionario_id: fFuncionario,
        veiculo_id: fVeiculo || null,
        evento_id: fEvento || null,
        data_partida: fPartida,
        data_retorno_prevista: fRetorno || null,
        valor_alocado: valor,
        obs: fObs.trim() || null,
        criado_por: userData.user?.id ?? null,
      })
      .select('id')
      .single();
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModalNova(false);
    setFFuncionario('');
    setFVeiculo('');
    setFEvento('');
    setFValor('');
    setFObs('');
    setFRetorno('');
    if (data) window.location.href = `/viagens/${data.id}`;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['abertas', 'todas'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                filtro === f ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40' : 'text-zinc-400 border border-night-700 hover:text-white'
              }`}
            >
              {f === 'abertas' ? 'Em aberto' : 'Todas'}
            </button>
          ))}
        </div>
        <button onClick={() => setModalNova(true)} className="btn-gold">
          <Plus className="h-4 w-4" /> Nova viagem
        </button>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">{erro}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
        </div>
      ) : viagens.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <CarFront className="h-10 w-10 text-zinc-600" />
          <p className="mt-4 text-sm text-zinc-400">Nenhuma viagem {filtro === 'abertas' ? 'em aberto' : 'registrada'}.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Registre a saída de um colaborador para preparação de evento em “Nova viagem”.
          </p>
        </div>
      ) : (
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
                  <div className="text-xs text-zinc-500">
                    {v.evento?.nome ?? 'Sem evento vinculado'}
                    {v.veiculo ? ` · ${v.veiculo.nome}` : ''}
                  </div>
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

              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${CORES_STATUS[v.status]}`}>
                {STATUS_VIAGEM_LABEL[v.status]}
              </span>

              <ChevronRight className="h-4 w-4 text-zinc-600 transition group-hover:text-gold-400" />
            </Link>
          ))}
        </div>
      )}

      <Modal aberto={modalNova} titulo="Nova viagem de preparação" onFechar={() => setModalNova(false)}>
        <form onSubmit={criarViagem} className="space-y-4">
          <div>
            <label className="label">Funcionário *</label>
            <select className="input" value={fFuncionario} onChange={(e) => setFFuncionario(e.target.value)} required>
              <option value="">Selecione…</option>
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} {f.funcao ? `(${f.funcao})` : ''}
                </option>
              ))}
            </select>
            {funcionarios.length === 0 && (
              <p className="mt-1 text-xs text-amber-400">Nenhum funcionário ativo — cadastre em Cadastros.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Veículo</label>
              <select className="input" value={fVeiculo} onChange={(e) => setFVeiculo(e.target.value)}>
                <option value="">Sem veículo</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome} {v.placa ? `· ${v.placa}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Evento</label>
              <select className="input" value={fEvento} onChange={(e) => setFEvento(e.target.value)}>
                <option value="">Sem evento</option>
                {eventos.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Data da partida *</label>
              <input type="date" className="input" value={fPartida} onChange={(e) => setFPartida(e.target.value)} required />
            </div>
            <div>
              <label className="label">Retorno previsto</label>
              <input type="date" className="input" value={fRetorno} onChange={(e) => setFRetorno(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Valor alocado para a viagem (R$) *</label>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="0,00"
              value={fValor}
              onChange={(e) => setFValor(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input" rows={2} value={fObs} onChange={(e) => setFObs(e.target.value)} />
          </div>

          {erroForm && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erroForm}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalNova(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Registrar viagem'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
