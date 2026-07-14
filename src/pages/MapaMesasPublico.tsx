import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Users, Clock, Calendar, ChevronLeft,
  MapPin, AlertCircle, LayoutGrid, X,
} from 'lucide-react';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const headers = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

interface Mesa {
  id: string;
  numero: string;
  nome: string;
  capacidade: number;
  posicao_x: number;
  posicao_y: number;
  secao: string;
  formato: 'round' | 'square' | 'retangular';
  rotacao: number;
  ativo: boolean;
}

interface ReservaMesa {
  id: string;
  mesa_id: string;
  nome_cliente: string;
  data_reserva: string;
  horario: string;
  numero_pessoas: number;
  status: string;
}

const SECAO_LABEL: Record<string, string> = {
  bar_chopp: 'Bar de Chopp',
  bar_drink: 'Bar de Drink',
  salao:     'Salão Principal',
};

const HORARIOS = [
  '18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30',
];

const ZONES = [
  { label: 'BANHEIROS',    x: 0, y: 0,  w: 16, h: 48, color: 'rgba(100,140,200,0.08)', text: 'rgba(120,160,220,0.45)', vertical: true  },
  { label: 'BAR DE DRINK', x: 0, y: 49, w: 16, h: 29, color: 'rgba(80,160,120,0.08)',  text: 'rgba(80,200,140,0.45)',  vertical: true  },
  { label: 'BAR DE CHOPP', x: 0, y: 79, w: 30, h: 23, color: 'rgba(80,120,200,0.08)',  text: 'rgba(100,150,220,0.45)', vertical: true  },
  { label: 'PALCO',        x: 58,y: 30, w: 42, h: 19, color: 'rgba(125,31,44,0.12)',   text: 'rgba(200,80,100,0.65)',  vertical: false },
];

export default function MapaMesasPublico() {
  const [searchParams] = useSearchParams();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [reservas, setReservas] = useState<ReservaMesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(searchParams.get('data') || new Date().toISOString().split('T')[0]);
  const [horario, setHorario] = useState(searchParams.get('horario') || '20:00');
  const [etapa, setEtapa] = useState<'mapa' | 'form' | 'confirmado'>('mapa');
  const [salvando, setSalvando] = useState(false);
  const [secaoAtiva, setSecaoAtiva] = useState<string>('todas');
  const [modoAgrupamento, setModoAgrupamento] = useState(false);
  const [mesasSelecionadas, setMesasSelecionadas] = useState<Mesa[]>([]);
  const mapaRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    nome_cliente: '',
    telefone: '',
    numero_pessoas: 2,
    observacoes: '',
  });

  useEffect(() => { carregar(); }, [data, horario]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [rMesas, rReservas] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/mesas?ativo=eq.true&order=numero`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/reservas_mesas?data_reserva=eq.${data}&status=neq.cancelada`, { headers }),
      ]);
      const [dMesas, dReservas] = await Promise.all([rMesas.json(), rReservas.json()]);
      if (Array.isArray(dMesas)) setMesas(dMesas);
      if (Array.isArray(dReservas)) setReservas(dReservas);
    } finally {
      setLoading(false);
    }
  };

  // Sem giro de mesas: qualquer reserva no dia bloqueia a mesa
  const mesasReservadasIds = new Set(reservas.map(r => r.mesa_id));

  const isMesaDisponivel = (mesa: Mesa) => !mesasReservadasIds.has(mesa.id);

  const secoes = ['todas', ...Array.from(new Set(mesas.map(m => m.secao))).sort()];
  const mesasFiltradas = secaoAtiva === 'todas' ? mesas : mesas.filter(m => m.secao === secaoAtiva);

  const capacidadeTotal = mesasSelecionadas.reduce((s, m) => s + m.capacidade, 0);

  const toggleModoAgrupamento = () => {
    setModoAgrupamento(v => !v);
    setMesasSelecionadas([]);
  };

  const handleSelectMesa = (mesa: Mesa) => {
    if (!isMesaDisponivel(mesa)) return;
    if (modoAgrupamento) {
      setMesasSelecionadas(prev =>
        prev.find(m => m.id === mesa.id)
          ? prev.filter(m => m.id !== mesa.id)
          : [...prev, mesa]
      );
    } else {
      const cap = mesa.capacidade;
      setMesasSelecionadas([mesa]);
      setForm(f => ({ ...f, numero_pessoas: Math.max(2, Math.min(f.numero_pessoas, cap)) }));
      setEtapa('form');
    }
  };

  const handleProsseguirGrupo = () => {
    if (mesasSelecionadas.length === 0) return;
    setForm(f => ({ ...f, numero_pessoas: Math.max(2, Math.min(f.numero_pessoas, capacidadeTotal)) }));
    setEtapa('form');
  };

  const handleConfirmar = async () => {
    if (mesasSelecionadas.length === 0 || !form.nome_cliente.trim()) return;
    setSalvando(true);
    try {
      const grupoId = mesasSelecionadas.length > 1
        ? crypto.randomUUID()
        : null;

      for (const mesa of mesasSelecionadas) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reservas_mesas`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            mesa_id: mesa.id,
            nome_cliente: form.nome_cliente.trim(),
            telefone: form.telefone.trim() || null,
            data_reserva: data,
            horario,
            numero_pessoas: form.numero_pessoas,
            observacoes: form.observacoes.trim() || null,
            status: 'confirmada',
            grupo_reserva_id: grupoId,
          }),
        });
        if (!res.ok) throw new Error('Erro ao salvar');
      }
      setEtapa('confirmado');
      carregar();
    } catch {
      alert('Erro ao confirmar reserva. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const resetar = () => {
    setEtapa('mapa');
    setMesasSelecionadas([]);
    setModoAgrupamento(false);
    setForm({ nome_cliente: '', telefone: '', numero_pessoas: 2, observacoes: '' });
  };

  const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c14' }}>
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#7D1F2C] animate-spin mx-auto mb-4" />
        <p className="text-white/40 text-sm">Carregando mapa de mesas...</p>
      </div>
    </div>
  );

  // ── Confirmação ─────────────────────────────────────────────────────────────
  if (etapa === 'confirmado') return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#080c14' }}>
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Reserva Confirmada!</h1>
        <p className="text-white/50 mb-6">
          Até logo, <strong className="text-white">{form.nome_cliente}</strong>
        </p>
        <div className="rounded-2xl p-5 space-y-3 mb-6 text-left" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-[#7D1F2C] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-white/40 mb-1">
                {mesasSelecionadas.length > 1 ? 'Mesas' : 'Mesa'}
              </p>
              {mesasSelecionadas.map(m => (
                <p key={m.id} className="text-white font-semibold text-sm">
                  {m.nome} <span className="text-white/40 font-normal">({SECAO_LABEL[m.secao] || m.secao})</span>
                </p>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar size={16} className="text-[#7D1F2C] flex-shrink-0" />
            <div>
              <p className="text-xs text-white/40">Data</p>
              <p className="text-white font-semibold capitalize">{fmtData(data)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-[#7D1F2C] flex-shrink-0" />
            <div>
              <p className="text-xs text-white/40">Horário</p>
              <p className="text-white font-semibold">{horario}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Users size={16} className="text-[#7D1F2C] flex-shrink-0" />
            <div>
              <p className="text-xs text-white/40">Pessoas</p>
              <p className="text-white font-semibold">{form.numero_pessoas} {form.numero_pessoas === 1 ? 'pessoa' : 'pessoas'}</p>
            </div>
          </div>
        </div>
        <button onClick={resetar} className="w-full py-3 rounded-xl font-semibold text-white bg-[#7D1F2C] hover:bg-[#6a1a25] transition-colors">
          Fazer outra reserva
        </button>
      </div>
    </div>
  );

  // ── Formulário ──────────────────────────────────────────────────────────────
  if (etapa === 'form') {
    const maxPessoas = modoAgrupamento ? capacidadeTotal : (mesasSelecionadas[0]?.capacidade ?? 4);
    return (
      <div className="min-h-screen px-4 py-8" style={{ background: '#080c14', color: '#e8edf8' }}>
        <div className="max-w-md mx-auto">
          <button onClick={() => { setEtapa('mapa'); if (!modoAgrupamento) setMesasSelecionadas([]); }}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-6 transition-colors">
            <ChevronLeft size={16} /> Voltar ao mapa
          </button>

          {/* Resumo das mesas */}
          <div className="rounded-2xl p-4 mb-6" style={{ background: '#101520', border: '1px solid rgba(125,31,44,0.4)' }}>
            {mesasSelecionadas.length === 1 ? (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#7D1F2C,#5a1520)' }}>
                  {mesasSelecionadas[0].numero}
                </div>
                <div>
                  <p className="font-bold text-white">{mesasSelecionadas[0].nome}</p>
                  <p className="text-sm text-white/50">{SECAO_LABEL[mesasSelecionadas[0].secao] || mesasSelecionadas[0].secao} · até {mesasSelecionadas[0].capacidade} pessoas</p>
                  <p className="text-xs text-white/30 mt-0.5 capitalize">{fmtData(data)} às {horario}</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#7D1F2C,#5a1520)' }}>
                    <LayoutGrid size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-white">{mesasSelecionadas.length} mesas agrupadas</p>
                    <p className="text-sm text-white/50">Capacidade total: até {capacidadeTotal} pessoas</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mesasSelecionadas.map(m => (
                    <span key={m.id} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white border border-amber-500/40 bg-amber-500/10">
                      {m.nome}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-white/30 mt-2 capitalize">{fmtData(data)} às {horario}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl p-5 space-y-4" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="font-bold text-white text-lg">Seus dados</h2>

            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wide block mb-1.5">Nome completo *</label>
              <input type="text" value={form.nome_cliente}
                onChange={e => setForm(f => ({ ...f, nome_cliente: e.target.value }))}
                placeholder="Seu nome"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/50 text-sm" />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wide block mb-1.5">WhatsApp</label>
              <input type="tel" value={form.telefone}
                onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                placeholder="(11) 99999-0000"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/50 text-sm" />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wide block mb-1.5">
                Quantas pessoas? <span className="text-white/20 font-normal">(min. 2)</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: maxPessoas - 1 }, (_, i) => i + 2).map(n => (
                  <button key={n} onClick={() => setForm(f => ({ ...f, numero_pessoas: n }))}
                    className={`w-11 h-11 rounded-xl text-sm font-bold border transition-all ${form.numero_pessoas === n ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wide block mb-1.5">Observação (opcional)</label>
              <textarea value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                placeholder="Aniversário, decoração especial..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/50 text-sm resize-none" />
            </div>
          </div>

          <button onClick={handleConfirmar}
            disabled={!form.nome_cliente.trim() || salvando}
            className="w-full mt-4 py-4 rounded-xl font-bold text-white bg-[#7D1F2C] hover:bg-[#6a1a25] disabled:opacity-40 transition-all text-base flex items-center justify-center gap-2">
            {salvando ? (
              <><div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Confirmando...</>
            ) : (
              <><CheckCircle2 size={20} /> Confirmar Reserva</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Mapa principal ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-28" style={{ background: '#080c14', color: '#e8edf8' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)' }}>
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <MapPin size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Reserva de Mesa</h1>
              <p className="text-white/60 text-sm">Selecione sua mesa no mapa</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/60 text-xs mb-1 block">Data</label>
              <input type="date" value={data}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setData(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30" />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1 block">Horário (até 21:30)</label>
              <select value={horario} onChange={e => setHorario(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30">
                {HORARIOS.map(h => <option key={h} value={h} style={{ background: '#3d0f16' }}>{h}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Legenda + modo agrupamento */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500/60 border border-green-400/50" /><span className="text-xs text-white/50">Disponível</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/50 border border-red-400/40" /><span className="text-xs text-white/50">Reservada</span></div>
            {modoAgrupamento && <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500/60 border border-amber-400/50" /><span className="text-xs text-white/50">Selecionada</span></div>}
          </div>
          <button
            onClick={toggleModoAgrupamento}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${modoAgrupamento ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>
            <LayoutGrid size={13} />
            {modoAgrupamento ? 'Modo grupo ativo' : 'Agrupar mesas'}
          </button>
        </div>

        {/* Filtro de seção */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {secoes.map(s => (
            <button key={s} onClick={() => setSecaoAtiva(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${secaoAtiva === s ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
              {s === 'todas' ? 'Todas as áreas' : (SECAO_LABEL[s] || s)}
            </button>
          ))}
        </div>

        {/* Mapa visual */}
        <div ref={mapaRef} className="relative w-full rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #0e1520 0%, #101825 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            paddingBottom: '130%',
          }}>

          {/* Grid sutil */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '5% 5%',
          }} />

          {/* Zonas decorativas */}
          {ZONES.map(z => (
            <div key={z.label} className="absolute pointer-events-none flex items-center justify-center"
              style={{
                left: `${z.x}%`, top: `${z.y}%`,
                width: `${z.w}%`, height: `${z.h}%`,
                background: z.color,
                border: `1px solid ${z.color.replace('0.08', '0.15').replace('0.12', '0.2')}`,
                borderRadius: '4px',
              }}>
              <span className="font-bold tracking-widest uppercase text-center"
                style={{
                  color: z.text,
                  fontSize: 'clamp(5px, 1vw, 10px)',
                  writingMode: z.vertical ? 'vertical-rl' : undefined,
                  transform: z.vertical ? 'rotate(180deg)' : undefined,
                }}>
                {z.label}
              </span>
            </div>
          ))}

          {/* Separadores */}
          {[48, 78].map(y => (
            <div key={y} className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${y}%`, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
          ))}

          {/* Mesas */}
          {mesasFiltradas.map(mesa => {
            const disponivel = isMesaDisponivel(mesa);
            const isSelected = mesasSelecionadas.some(m => m.id === mesa.id);
            const isRound  = mesa.formato === 'round';
            const isSquare = mesa.formato === 'square';
            const rot = mesa.rotacao || 0;

            let bgClass = '';
            let borderClass = '';
            if (!disponivel) {
              bgClass = 'bg-red-500/20';
              borderClass = 'border border-red-400/40';
            } else if (isSelected) {
              bgClass = 'bg-amber-500/30';
              borderClass = 'border-2 border-amber-400/80 shadow-lg shadow-amber-500/20';
            } else {
              bgClass = 'bg-green-500/20 hover:bg-green-500/35 hover:scale-110';
              borderClass = 'border border-green-400/55';
            }

            return (
              <button key={mesa.id}
                onClick={() => handleSelectMesa(mesa)}
                disabled={!disponivel}
                title={`${mesa.nome} · ${mesa.capacidade} pessoas · ${disponivel ? 'Disponível' : 'Reservada'}`}
                className="absolute transition-all duration-200 group"
                style={{
                  left: `${mesa.posicao_x}%`,
                  top: `${mesa.posicao_y}%`,
                  width:  isRound || isSquare ? '7%' : rot === 90 ? '2%' : '10%',
                  height: isRound || isSquare ? '3.5%' : rot === 90 ? '7%' : '2%',
                  transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                }}>
                <div className={`
                  w-full h-full flex flex-col items-center justify-center
                  ${isRound ? 'rounded-full' : isSquare ? 'rounded-md' : 'rounded-lg'}
                  ${bgClass} ${borderClass}
                  ${disponivel && !isSelected ? 'cursor-pointer' : disponivel ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}
                  transition-all duration-150 select-none overflow-hidden
                `}>
                  <span className="text-white font-bold leading-none" style={{ fontSize: 'clamp(5px, 1.0vw, 10px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>{mesa.numero}</span>
                  <span className="text-white/50 leading-none" style={{ fontSize: 'clamp(4px, 0.8vw, 8px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>{mesa.capacidade}p</span>
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded-lg bg-black/90 text-white text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 border border-white/10">
                  {mesa.nome} · {mesa.capacidade}p · {disponivel ? (isSelected ? 'Selecionada' : 'Disponível') : 'Reservada'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Contador */}
        <div className="flex items-center justify-between mt-3 px-1">
          <p className="text-xs text-white/30">
            {mesasFiltradas.filter(m => isMesaDisponivel(m)).length} mesas disponíveis de {mesasFiltradas.length}
          </p>
          <p className="text-xs text-white/30 capitalize">{fmtData(data)}, {horario}</p>
        </div>

        {mesasFiltradas.length > 0 && mesasFiltradas.every(m => !isMesaDisponivel(m)) && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            Todas as mesas estão reservadas neste horário. Tente outro horário ou data.
          </div>
        )}
      </div>

      {/* Barra flutuante de agrupamento */}
      {modoAgrupamento && mesasSelecionadas.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pt-2"
          style={{ background: 'linear-gradient(to top, #080c14 70%, transparent)' }}>
          <div className="max-w-2xl mx-auto">
            <div className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: '#151d2e', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 0 30px rgba(245,158,11,0.1)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">
                  {mesasSelecionadas.length} {mesasSelecionadas.length === 1 ? 'mesa selecionada' : 'mesas selecionadas'}
                </p>
                <p className="text-amber-300/70 text-xs mt-0.5">
                  Capacidade total: até {capacidadeTotal} pessoas
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {mesasSelecionadas.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {m.numero}
                      <button onClick={() => setMesasSelecionadas(prev => prev.filter(x => x.id !== m.id))}
                        className="hover:text-white transition-colors"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={handleProsseguirGrupo}
                className="flex-shrink-0 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors">
                Prosseguir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
