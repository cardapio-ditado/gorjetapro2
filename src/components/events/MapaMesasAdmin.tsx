import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check, RefreshCw, Plus, Trash2,
  Calendar, ChevronLeft, ChevronRight, X, Link, CheckCircle2,
  Phone, MessageSquare, Move, CopyPlus, Pencil, RotateCw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  telefone: string | null;
  data_reserva: string;
  horario: string;
  numero_pessoas: number;
  status: string;
  observacoes: string | null;
  criado_em: string;
  grupo_reserva_id: string | null;
  mesas?: { numero: string; nome: string; secao: string };
}

interface GrupoReserva {
  grupo_reserva_id: string | null;
  reservas: ReservaMesa[];
  nome_cliente: string;
  telefone: string | null;
  horario: string;
  numero_pessoas: number;
  status: string;
  observacoes: string | null;
  mesas: Array<{ numero: string; nome: string; secao: string }>;
}

const SECAO_LABEL: Record<string, string> = {
  bar_chopp: 'Bar de Chopp',
  bar_drink: 'Bar de Drink',
  salao:     'Salão Principal',
};

const ZONES = [
  { label: 'BANHEIROS',    x: 0,  y: 0,  w: 16, h: 48, color: 'rgba(100,140,200,0.08)', text: 'rgba(120,160,220,0.4)', vertical: true  },
  { label: 'BAR DE DRINK', x: 0,  y: 49, w: 16, h: 29, color: 'rgba(80,160,120,0.08)',  text: 'rgba(80,200,140,0.4)',  vertical: true  },
  { label: 'BAR DE CHOPP', x: 0,  y: 79, w: 30, h: 23, color: 'rgba(80,120,200,0.08)',  text: 'rgba(100,150,220,0.4)', vertical: true  },
  { label: 'PALCO',        x: 58, y: 30, w: 42, h: 19, color: 'rgba(125,31,44,0.12)',   text: 'rgba(200,80,100,0.6)',  vertical: false },
];

const STATUS_COLOR: Record<string, string> = {
  confirmada: 'bg-green-500/15 text-green-400 border-green-500/30',
  pendente: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  cancelada: 'bg-red-500/15 text-red-400 border-red-500/30',
  finalizada: 'bg-white/10 text-white/40 border-white/10',
};

const HORARIOS = ['18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30'];

export default function MapaMesasAdmin() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [reservas, setReservas] = useState<ReservaMesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [horario, setHorario] = useState('20:00');
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [aba, setAba] = useState<'mapa' | 'lista' | 'mesas'>('mapa');
  const [reservaSelecionada, setReservaSelecionada] = useState<ReservaMesa | null>(null);
  const [novaReserva, setNovaReserva] = useState<{ mesa: Mesa | null; aberto: boolean }>({ mesa: null, aberto: false });
  const [form, setForm] = useState({ nome_cliente: '', telefone: '', numero_pessoas: 2, observacoes: '', horario: '20:00' });
  const [salvando, setSalvando] = useState(false);
  // Mesa editor
  const [editandoMesa, setEditandoMesa] = useState<Mesa | null>(null);
  const [novaMesa, setNovaMesa] = useState(false);
  const [formMesa, setFormMesa] = useState({ numero: '', nome: '', capacidade: 4, posicao_x: 50, posicao_y: 50, secao: 'salao', formato: 'round' as Mesa['formato'], rotacao: 0 });
  // Layout editor
  const [modoEdicao, setModoEdicao] = useState(false);
  const [mesaArrastando, setMesaArrastando] = useState<Mesa | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [salvandoPos, setSalvandoPos] = useState(false);
  const mapaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { carregar(); }, [data]);

  const carregar = async () => {
    setLoading(true);
    const [{ data: dMesas }, { data: dReservas }] = await Promise.all([
      supabase.from('mesas').select('*').eq('ativo', true).order('numero'),
      supabase.from('reservas_mesas').select('*, mesas(numero,nome,secao)').eq('data_reserva', data).neq('status', 'cancelada').order('criado_em'),
    ]);
    setMesas(dMesas || []);
    setReservas(dReservas || []);
    setLoading(false);
  };

  // Agrupa reservas pelo grupo_reserva_id (mesas agrupadas viram 1 linha)
  const agruparReservas = (rs: ReservaMesa[]): GrupoReserva[] => {
    const mapa = new Map<string, GrupoReserva>();
    rs.forEach(r => {
      const key = r.grupo_reserva_id ?? r.id;
      if (mapa.has(key)) {
        const g = mapa.get(key)!;
        if (r.mesas) g.mesas.push(r.mesas);
      } else {
        mapa.set(key, {
          grupo_reserva_id: r.grupo_reserva_id,
          reservas: [r],
          nome_cliente: r.nome_cliente,
          telefone: r.telefone,
          horario: r.horario,
          numero_pessoas: r.numero_pessoas,
          status: r.status,
          observacoes: r.observacoes,
          mesas: r.mesas ? [r.mesas] : [],
        });
        if (r.grupo_reserva_id) mapa.get(key)!.reservas = rs.filter(x => x.grupo_reserva_id === r.grupo_reserva_id);
      }
    });
    return Array.from(mapa.values());
  };

  // Sem giro de mesas: qualquer reserva no dia ocupa a mesa o dia todo
  const mesasReservadasIds = new Set(reservas.map(r => r.mesa_id));

  const isMesaDisponivel = (mesa: Mesa) => !mesasReservadasIds.has(mesa.id);

  const linkPublico = `https://www.ditado.org/mapademesas`;

  const copiarLink = async () => {
    await navigator.clipboard.writeText(linkPublico);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2500);
  };

  const handleCriarReserva = async () => {
    if (!novaReserva.mesa || !form.nome_cliente.trim()) return;
    setSalvando(true);
    await supabase.from('reservas_mesas').insert({
      mesa_id: novaReserva.mesa.id,
      nome_cliente: form.nome_cliente.trim(),
      telefone: form.telefone.trim() || null,
      data_reserva: data,
      horario: form.horario,
      numero_pessoas: form.numero_pessoas,
      observacoes: form.observacoes.trim() || null,
      status: 'confirmada',
    });
    setNovaReserva({ mesa: null, aberto: false });
    setForm({ nome_cliente: '', telefone: '', numero_pessoas: 2, observacoes: '', horario: '20:00' });
    setSalvando(false);
    carregar();
  };

  const handleCancelarReserva = async (id: string) => {
    if (!confirm('Cancelar esta reserva?')) return;
    await supabase.from('reservas_mesas').update({ status: 'cancelada' }).eq('id', id);
    setReservaSelecionada(null);
    carregar();
  };

  const handleSalvarMesa = async () => {
    if (!formMesa.numero.trim()) return;
    setSalvando(true);
    if (editandoMesa) {
      await supabase.from('mesas').update({ ...formMesa }).eq('id', editandoMesa.id);
    } else {
      await supabase.from('mesas').insert({ ...formMesa });
    }
    setEditandoMesa(null);
    setNovaMesa(false);
    setSalvando(false);
    carregar();
  };

  const handleDeletarMesa = async (id: string) => {
    if (!confirm('Remover esta mesa? As reservas existentes serão perdidas.')) return;
    await supabase.from('mesas').update({ ativo: false }).eq('id', id);
    carregar();
  };

  const avançarDia = (d: number) => {
    const dt = new Date(data + 'T12:00:00');
    dt.setDate(dt.getDate() + d);
    setData(dt.toISOString().split('T')[0]);
  };

  const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });

  const handleMouseDownMesa = useCallback((e: React.MouseEvent, mesa: Mesa) => {
    if (!modoEdicao) return;
    e.preventDefault();
    e.stopPropagation();
    setMesaArrastando(mesa);
    setDragPos({ x: mesa.posicao_x, y: mesa.posicao_y });

    const handleMouseMove = (ev: MouseEvent) => {
      if (!mapaRef.current) return;
      const rect = mapaRef.current.getBoundingClientRect();
      const x = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((ev.clientY - rect.top) / rect.height) * 100);
      setDragPos({ x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(128, y)) });
    };

    const handleMouseUp = async (ev: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!mapaRef.current) { setMesaArrastando(null); return; }
      const rect = mapaRef.current.getBoundingClientRect();
      const x = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((ev.clientY - rect.top) / rect.height) * 100);
      const newX = Math.max(2, Math.min(98, x));
      const newY = Math.max(2, Math.min(128, y));
      setSalvandoPos(true);
      await supabase.from('mesas').update({ posicao_x: newX, posicao_y: newY }).eq('id', mesa.id);
      setSalvandoPos(false);
      setMesaArrastando(null);
      setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, posicao_x: newX, posicao_y: newY } : m));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [modoEdicao]);

  const handleDuplicarMesa = async (mesa: Mesa) => {
    const baseNum = mesa.numero.replace(/[^0-9]/g, '');
    const suffix = String.fromCharCode(65 + mesas.filter(m => m.numero.startsWith(baseNum)).length);
    await supabase.from('mesas').insert({
      numero: baseNum + suffix,
      nome: 'Mesa ' + baseNum + suffix,
      capacidade: mesa.capacidade,
      posicao_x: Math.min(95, mesa.posicao_x + 8),
      posicao_y: Math.min(125, mesa.posicao_y + 4),
      secao: mesa.secao,
      formato: mesa.formato,
      rotacao: mesa.rotacao || 0,
      ativo: true,
    });
    carregar();
  };

  const handleDuploClique = (mesa: Mesa) => {
    setEditandoMesa(mesa);
    setNovaMesa(false);
    setFormMesa({
      numero: mesa.numero,
      nome: mesa.nome || '',
      capacidade: mesa.capacidade,
      posicao_x: mesa.posicao_x,
      posicao_y: mesa.posicao_y,
      secao: mesa.secao,
      formato: mesa.formato,
      rotacao: mesa.rotacao || 0,
    });
  };

  return (
    <div className="space-y-4">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Navegação de data */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl border border-white/8 p-1">
          <button onClick={() => avançarDia(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 transition-colors"><ChevronLeft size={14}/></button>
          <input
            type="date"
            value={data}
            onChange={e => setData(e.target.value)}
            className="bg-transparent text-white text-sm font-medium px-2 focus:outline-none"
          />
          <button onClick={() => avançarDia(1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 transition-colors"><ChevronRight size={14}/></button>
        </div>

        {/* Horário */}
        <select
          value={horario}
          onChange={e => setHorario(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]">
          {HORARIOS.map(h => <option key={h} value={h} style={{ background: '#12141f' }}>{h}</option>)}
        </select>

        <button onClick={carregar} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/8 text-white/40 hover:text-white/70 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* Link público */}
        <button
          onClick={copiarLink}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ml-auto ${linkCopiado ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-[#7D1F2C]/20 border-[#7D1F2C]/40 text-[#c0384a] hover:bg-[#7D1F2C]/30'}`}>
          {linkCopiado ? <><Check size={15}/> Link copiado!</> : <><Link size={15}/> Copiar link do cliente</>}
        </button>
      </div>

      {/* Abas */}
      {(() => {
        const grupos = agruparReservas(reservas);
        return (
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/8 w-fit">
            {(['mapa', 'lista', 'mesas'] as const).map(a => (
              <button key={a} onClick={() => setAba(a)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${aba === a ? 'bg-[#7D1F2C] text-white' : 'text-white/40 hover:text-white/70'}`}>
                {a === 'mapa' ? 'Mapa' : a === 'lista' ? `Reservas (${grupos.length})` : 'Gerenciar Mesas'}
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── ABA MAPA ─────────────────────────────────────────────────────────── */}
      {aba === 'mapa' && (
        <div>
          {/* Edit mode toolbar */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={() => { setModoEdicao(v => !v); setMesaArrastando(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                modoEdicao
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              }`}>
              <Pencil size={14} />
              {modoEdicao ? 'Modo edição ativo' : 'Editar layout'}
            </button>
            {modoEdicao && (
              <p className="text-xs text-amber-300/60 flex items-center gap-1.5">
                <Move size={12} /> Arraste · 2× clique para editar · <CopyPlus size={12} /> duplicar
              </p>
            )}
            {salvandoPos && <span className="text-xs text-white/30">Salvando posição...</span>}
          </div>

          <div
            ref={mapaRef}
            className="relative w-full rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, #0d1420 0%, #101825 100%)',
              border: modoEdicao ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.08)',
              paddingBottom: '130%',
              userSelect: modoEdicao ? 'none' : undefined,
            }}>
            {/* Grid sutil */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
              backgroundSize: '5% 3.5%',
            }} />

            {/* Zonas decorativas */}
            {ZONES.map(z => (
              <div
                key={z.label}
                className="absolute pointer-events-none flex items-center justify-center"
                style={{
                  left: `${z.x}%`, top: `${z.y}%`,
                  width: `${z.w}%`, height: `${z.h}%`,
                  background: z.color,
                  border: `1px solid ${z.color.replace('0.08', '0.15').replace('0.12', '0.2')}`,
                  borderRadius: '4px',
                }}>
                <span
                  className="font-bold tracking-widest uppercase text-center"
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

            {/* Separadores de zona */}
            {[48, 78].map(y => (
              <div key={y} className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${y}%`, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
            ))}

            {/* Mesas */}
            {mesas.map(mesa => {
              const isDragging = mesaArrastando?.id === mesa.id;
              const posX = isDragging ? dragPos.x : mesa.posicao_x;
              const posY = isDragging ? dragPos.y : mesa.posicao_y;
              const disponivel = isMesaDisponivel(mesa);
              const reservaDaMesa = reservas.find(r => r.mesa_id === mesa.id);
              const isRound  = mesa.formato === 'round';
              const isSquare = mesa.formato === 'square';

              const rot = mesa.rotacao || 0;

              if (modoEdicao) {
                return (
                  <div
                    key={mesa.id}
                    onMouseDown={e => handleMouseDownMesa(e, mesa)}
                    onDoubleClick={e => { e.stopPropagation(); handleDuploClique(mesa); }}
                    className="absolute group z-10"
                    style={{
                      left: `${posX}%`,
                      top: `${posY}%`,
                      width:  isRound || isSquare ? '7%' : rot === 90 ? '2%' : '10%',
                      height: isRound || isSquare ? '3.5%' : rot === 90 ? '7%' : '2%',
                      transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      opacity: isDragging ? 0.85 : 1,
                      zIndex: isDragging ? 50 : 10,
                      transition: isDragging ? 'none' : 'opacity 0.1s',
                    }}>
                    <div className={`
                      w-full h-full flex flex-col items-center justify-center overflow-hidden
                      ${isRound ? 'rounded-full' : isSquare ? 'rounded-md' : 'rounded-lg'}
                      bg-amber-500/25 border-2 border-amber-400/60
                      ${isDragging ? 'shadow-lg shadow-amber-500/30 scale-110' : ''}
                      transition-transform duration-100
                    `}>
                      <span className="text-white font-bold leading-none" style={{ fontSize: 'clamp(5px, 1.1vw, 11px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>{mesa.numero}</span>
                      <span className="text-white/50 leading-none" style={{ fontSize: 'clamp(4px, 0.85vw, 8px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>{mesa.capacidade}p</span>
                    </div>
                    {/* Duplicate button */}
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); handleDuplicarMesa(mesa); }}
                      title="Duplicar mesa"
                      className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:bg-amber-400"
                      style={{ transform: `rotate(-${rot}deg)` }}>
                      <CopyPlus size={8} className="text-black" />
                    </button>
                    {/* Delete button */}
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); handleDeletarMesa(mesa.id); }}
                      title="Deletar mesa"
                      className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:bg-red-500"
                      style={{ transform: `rotate(-${rot}deg)` }}>
                      <Trash2 size={8} className="text-white" />
                    </button>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 rounded-lg bg-black/90 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 border border-amber-500/30"
                      style={{ fontSize: '9px', transform: `rotate(-${rot}deg)` }}>
                      {mesa.nome} · 2× clique para editar
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={mesa.id}
                  onClick={() => {
                    if (disponivel) {
                      setNovaReserva({ mesa, aberto: true });
                      setForm(f => ({ ...f, numero_pessoas: Math.min(f.numero_pessoas, mesa.capacidade), horario }));
                    } else if (reservaDaMesa) {
                      setReservaSelecionada(reservaDaMesa);
                    }
                  }}
                  title={disponivel ? `${mesa.nome} — clique para reservar` : `${mesa.nome} — ${reservaDaMesa?.nome_cliente}`}
                  className="absolute transition-all duration-150 group"
                  style={{
                    left: `${mesa.posicao_x}%`,
                    top: `${mesa.posicao_y}%`,
                    width:  isRound || isSquare ? '7%' : rot === 90 ? '2%' : '10%',
                    height: isRound || isSquare ? '3.5%' : rot === 90 ? '7%' : '2%',
                    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                  }}>
                  <div className={`
                    w-full h-full flex flex-col items-center justify-center overflow-hidden
                    ${isRound ? 'rounded-full' : isSquare ? 'rounded-md' : 'rounded-lg'}
                    ${disponivel
                      ? 'bg-green-500/20 border border-green-500/50 hover:bg-green-500/35 hover:scale-105 cursor-pointer'
                      : 'bg-red-500/20 border border-red-500/50 cursor-pointer hover:bg-red-500/30'}
                    transition-all duration-150
                  `}>
                    <span className="text-white font-bold leading-none" style={{ fontSize: 'clamp(5px, 1.1vw, 11px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>{mesa.numero}</span>
                    <span className="text-white/50 leading-none" style={{ fontSize: 'clamp(4px, 0.85vw, 8px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>{mesa.capacidade}p</span>
                    {!disponivel && reservaDaMesa && (
                      <span className="text-white/60 truncate w-full text-center px-0.5 leading-none" style={{ fontSize: 'clamp(3px, 0.65vw, 7px)', transform: rot === 90 ? 'rotate(-90deg)' : undefined }}>
                        {reservaDaMesa.nome_cliente.split(' ')[0]}
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg bg-black/90 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 border border-white/10"
                    style={{ fontSize: '10px', transform: `rotate(-${rot}deg)` }}>
                    {mesa.nome} · {mesa.capacidade}p
                    {!disponivel && reservaDaMesa && ` · ${reservaDaMesa.nome_cliente}`}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-6 mt-3 px-1">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-500/50 border border-green-500/70" /><span className="text-xs text-white/40">Disponível</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/50 border border-red-500/70" /><span className="text-xs text-white/40">Reservada</span></div>
            <p className="text-xs text-white/30 ml-auto">{mesas.filter(m => isMesaDisponivel(m)).length}/{mesas.length} disponíveis · {fmtData(data)} {horario}</p>
          </div>
        </div>
      )}

      {/* ── ABA LISTA ────────────────────────────────────────────────────────── */}
      {aba === 'lista' && (() => {
        const grupos = agruparReservas(reservas);
        return (
          <div className="space-y-2">
            {grupos.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <Calendar size={32} className="mx-auto mb-3 opacity-40" />
                <p>Nenhuma reserva em {fmtData(data)}</p>
              </div>
            ) : grupos.map(g => (
              <div key={g.grupo_reserva_id ?? g.reservas[0].id}
                className="flex items-center gap-3 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                style={{ background: '#12141f' }}
                onClick={() => setReservaSelecionada(g.reservas[0])}>
                {/* Mesa(s) badge */}
                <div className="flex-shrink-0 flex flex-col gap-1 items-center">
                  {g.mesas.length === 1 ? (
                    <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white font-bold"
                      style={{ background: 'linear-gradient(135deg,#7D1F2C,#5a1520)' }}>
                      <span className="text-[9px] leading-none opacity-60">mesa</span>
                      <span className="text-base leading-none">{g.mesas[0].numero}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-w-[52px]">
                      {g.mesas.map(m => (
                        <div key={m.numero} className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[9px]"
                          style={{ background: 'linear-gradient(135deg,#7D1F2C,#5a1520)' }}>
                          {m.numero}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white/90">{g.nome_cliente}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[g.status] || 'bg-white/10 text-white/40 border-white/10'}`}>{g.status}</span>
                    {g.mesas.length > 1 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30">
                        {g.mesas.length} mesas
                      </span>
                    )}
                  </div>
                  {/* Números das mesas em linha */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {g.mesas.map(m => (
                      <span key={m.numero} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white/70 border border-white/10 bg-white/5">
                        {m.nome}
                      </span>
                    ))}
                    <span className="text-[10px] text-white/30">· {g.horario} · {g.numero_pessoas} pax</span>
                  </div>
                </div>
                {g.telefone && (
                  <a href={`https://wa.me/55${g.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()} className="text-green-400 hover:text-green-300 flex-shrink-0">
                    <Phone size={16}/>
                  </a>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── ABA MESAS ────────────────────────────────────────────────────────── */}
      {aba === 'mesas' && (
        <div className="space-y-3">
          <button
            onClick={() => { setNovaMesa(true); setEditandoMesa(null); setFormMesa({ numero: '', nome: '', capacidade: 4, posicao_x: 50, posicao_y: 50, secao: 'bar_chopp', formato: 'round', rotacao: 0 }); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7D1F2C] text-white text-sm font-semibold hover:bg-[#6a1a25] transition-colors">
            <Plus size={15}/> Nova mesa
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mesas.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl border border-white/5" style={{ background: '#12141f' }}>
                <div className={`w-10 h-10 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${m.formato === 'round' ? 'rounded-full' : 'rounded-lg'}`}
                  style={{ background: 'linear-gradient(135deg,#7D1F2C,#5a1520)' }}>
                  {m.numero}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white/90 text-sm">{m.nome || `Mesa ${m.numero}`}</p>
                  <p className="text-xs text-white/40">{SECAO_LABEL[m.secao] || m.secao} · {m.capacidade}p · {m.formato}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditandoMesa(m); setNovaMesa(false); setFormMesa({ numero: m.numero, nome: m.nome || '', capacidade: m.capacidade, posicao_x: m.posicao_x, posicao_y: m.posicao_y, secao: m.secao, formato: m.formato, rotacao: m.rotacao || 0 }); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors">
                    <MessageSquare size={13}/>
                  </button>
                  <button onClick={() => handleDeletarMesa(m.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: Nova reserva ────────────────────────────────────────────── */}
      {novaReserva.aberto && novaReserva.mesa && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: '#12141f', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">Reservar {novaReserva.mesa.nome}</h3>
              <button onClick={() => setNovaReserva({ mesa: null, aberto: false })} className="text-white/40 hover:text-white/70"><X size={18}/></button>
            </div>
            <p className="text-xs text-white/40">{fmtData(data)} · {SECAO_LABEL[novaReserva.mesa.secao]} · até {novaReserva.mesa.capacidade} pessoas</p>

            <div>
              <label className="text-xs text-white/40 uppercase tracking-wide block mb-1">Horário</label>
              <select value={form.horario} onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]">
                {HORARIOS.map(h => <option key={h} value={h} style={{ background: '#12141f' }}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-wide block mb-1">Nome do cliente *</label>
              <input type="text" value={form.nome_cliente} onChange={e => setForm(f => ({ ...f, nome_cliente: e.target.value }))}
                placeholder="Nome completo"
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-wide block mb-1">WhatsApp</label>
              <input type="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                placeholder="(11) 99999-0000"
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-wide block mb-1">Pessoas</label>
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: novaReserva.mesa.capacidade }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setForm(f => ({ ...f, numero_pessoas: n }))}
                    className={`w-10 h-10 rounded-xl text-sm font-bold border transition-all ${form.numero_pessoas === n ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-white/5 text-white/50 border-white/10'}`}>{n}</button>
                ))}
              </div>
            </div>
            <button onClick={handleCriarReserva} disabled={!form.nome_cliente.trim() || salvando}
              className="w-full py-3 rounded-xl font-bold text-white bg-[#7D1F2C] hover:bg-[#6a1a25] disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {salvando ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Salvando...</> : <><CheckCircle2 size={16}/> Confirmar Reserva</>}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Detalhe de reserva ──────────────────────────────────────── */}
      {reservaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: '#12141f', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">Detalhe da Reserva</h3>
              <button onClick={() => setReservaSelecionada(null)} className="text-white/40 hover:text-white/70"><X size={18}/></button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#7D1F2C]/30 text-white font-bold">
                  {reservaSelecionada.mesas?.numero || '?'}
                </div>
                <div>
                  <p className="font-bold text-white">{reservaSelecionada.nome_cliente}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[reservaSelecionada.status] || ''}`}>{reservaSelecionada.status}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded-xl bg-white/5"><p className="text-white/40 mb-0.5">Mesa</p><p className="text-white font-medium">{reservaSelecionada.mesas?.nome}</p></div>
                <div className="p-2 rounded-xl bg-white/5"><p className="text-white/40 mb-0.5">Horário</p><p className="text-white font-medium">{reservaSelecionada.horario}</p></div>
                <div className="p-2 rounded-xl bg-white/5"><p className="text-white/40 mb-0.5">Pessoas</p><p className="text-white font-medium">{reservaSelecionada.numero_pessoas} pax</p></div>
                <div className="p-2 rounded-xl bg-white/5"><p className="text-white/40 mb-0.5">Criado</p><p className="text-white font-medium">{new Date(reservaSelecionada.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p></div>
              </div>
              {reservaSelecionada.telefone && (
                <a href={`https://wa.me/55${reservaSelecionada.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/25 transition-colors">
                  <Phone size={15}/> {reservaSelecionada.telefone} — WhatsApp
                </a>
              )}
              {reservaSelecionada.observacoes && (
                <div className="p-3 rounded-xl bg-white/5 text-xs text-white/60">
                  <p className="text-white/30 mb-1">Observação</p>
                  {reservaSelecionada.observacoes}
                </div>
              )}
            </div>

            {reservaSelecionada.status !== 'cancelada' && (
              <button onClick={() => handleCancelarReserva(reservaSelecionada.id)}
                className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/15 transition-colors">
                Cancelar reserva
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Editor de mesa ──────────────────────────────────────────── */}
      {(editandoMesa || novaMesa) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: '#12141f', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">{editandoMesa ? 'Editar Mesa' : 'Nova Mesa'}</h3>
              <button onClick={() => { setEditandoMesa(null); setNovaMesa(false); }} className="text-white/40 hover:text-white/70"><X size={18}/></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 block mb-1">Número *</label>
                <input type="text" value={formMesa.numero} onChange={e => setFormMesa(f => ({ ...f, numero: e.target.value }))}
                  placeholder="01" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Nome</label>
                <input type="text" value={formMesa.nome} onChange={e => setFormMesa(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Mesa 01" className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Capacidade</label>
                <input type="number" min={1} max={30} value={formMesa.capacidade} onChange={e => setFormMesa(f => ({ ...f, capacidade: +e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Seção</label>
                <select value={formMesa.secao} onChange={e => setFormMesa(f => ({ ...f, secao: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]">
                  <option value="bar_chopp" style={{ background: '#12141f' }}>Bar de Chopp</option>
                  <option value="bar_drink" style={{ background: '#12141f' }}>Bar de Drink</option>
                  <option value="salao"     style={{ background: '#12141f' }}>Salão Principal</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Formato</label>
                <select value={formMesa.formato} onChange={e => setFormMesa(f => ({ ...f, formato: e.target.value as Mesa['formato'] }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]">
                  <option value="round" style={{ background: '#12141f' }}>Redonda</option>
                  <option value="square" style={{ background: '#12141f' }}>Quadrada</option>
                  <option value="retangular" style={{ background: '#12141f' }}>Retangular</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Rotação</label>
                <div className="flex gap-2">
                  {[0, 90, 180, 270].map(deg => (
                    <button key={deg} type="button"
                      onClick={() => setFormMesa(f => ({ ...f, rotacao: deg }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 ${formMesa.rotacao === deg ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                      <RotateCw size={10} style={{ transform: `rotate(${deg}deg)` }} />
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 block mb-1">Posição X (0-100%)</label>
                <input type="number" min={0} max={100} value={formMesa.posicao_x} onChange={e => setFormMesa(f => ({ ...f, posicao_x: +e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Posição Y (0-100%)</label>
                <input type="number" min={0} max={100} value={formMesa.posicao_y} onChange={e => setFormMesa(f => ({ ...f, posicao_y: +e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#7D1F2C]" />
              </div>
            </div>
            <button onClick={handleSalvarMesa} disabled={!formMesa.numero.trim() || salvando}
              className="w-full py-3 rounded-xl font-bold text-white bg-[#7D1F2C] hover:bg-[#6a1a25] disabled:opacity-40 transition-colors">
              {salvando ? 'Salvando...' : 'Salvar Mesa'}
            </button>
            {editandoMesa && (
              <button
                onClick={() => { handleDeletarMesa(editandoMesa.id); setEditandoMesa(null); }}
                className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2">
                <Trash2 size={14}/> Deletar mesa
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}