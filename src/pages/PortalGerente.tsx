import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * PORTAL DO GERENTE — visão operacional do turno
 * Página autossuficiente: lê tudo do dia via fn_portal_gerente_dia
 * e valida cupom de fidelidade via fn_portal_fidelidade_busca
 * (ambas já existem no banco). Não escreve saldo, não depende de
 * outros componentes. Pensada para o gerente do turno (Cristiano/Claudeano).
 */

interface Reserva { tipo: string; nome: string; telefone?: string; horario?: string; pessoas?: number; local?: string; obs?: string; }
interface Escala { nome: string; setor: string; funcao?: string; horario?: string; folga?: boolean; }
interface Cache { nome: string; inicio?: string; fim?: string; valor?: number; status?: string; }
interface ResumoDia {
  data: string;
  reservas: Reserva[];
  escala: Escala[];
  'cachê_noite': Cache[];
  totais: { reservas_dia: number; pessoas_esperadas: number; na_escala: number };
}

const hoje = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
const fmtHora = (h?: string) => (h ? h.slice(0, 5) : '');
const fmtReais = (v?: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PortalGerente() {
  const { usuario } = useAuth();
  const [data, setData] = useState(hoje());
  const [resumo, setResumo] = useState<ResumoDia | null>(null);
  const [loading, setLoading] = useState(true);

  // Fidelidade
  const [termo, setTermo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [fidelidade, setFidelidade] = useState<any>(null);
  const [semResultado, setSemResultado] = useState(false);

  const carregar = async (d: string) => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc('fn_portal_gerente_dia', { p_data: d });
    if (!error) setResumo(res as ResumoDia);
    setLoading(false);
  };

  useEffect(() => { carregar(data); }, [data]);

  const buscarFidelidade = async () => {
    if (!termo.trim()) return;
    setBuscando(true); setSemResultado(false); setFidelidade(null);
    const { data: res } = await supabase.rpc('fn_portal_fidelidade_busca', { p_termo: termo });
    setBuscando(false);
    if (res && res.cpf) setFidelidade(res); else setSemResultado(true);
  };

  const validarPremio = async (premioId: string) => {
    const { error } = await supabase
      .from('fidelidade_premios')
      .update({ status: 'resgatado', resgatado_em: new Date().toISOString(), resgatado_por: usuario?.id ?? null })
      .eq('id', premioId);
    if (!error) buscarFidelidade();
    else alert('Erro ao validar: ' + error.message);
  };

  const abrirManutencao = async () => {
    const desc = window.prompt('Descreva o problema de manutenção:');
    if (!desc) return;
    const { error } = await supabase.from('ocorrencias_setor').insert({
      data_ocorrencia: data, setor: 'manutencao', tipo_ocorrencia: 'equipamento',
      gravidade: 'media', titulo: desc.slice(0, 80), descricao: desc,
      status: 'pendente', registrado_por: usuario?.id ?? null,
    });
    alert(error ? 'Erro: ' + error.message : 'Manutenção registrada!');
  };

  const card = 'rounded-xl p-4' ;
  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)' };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Portal do Gerente</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {usuario?.nome_completo} · turno de {new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', colorScheme: 'dark' }} />
      </div>

      {/* Totais do dia */}
      {resumo && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className={card} style={cardStyle}>
            <p className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>{resumo.totais.reservas_dia}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>reservas hoje</p>
          </div>
          <div className={card} style={cardStyle}>
            <p className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>{resumo.totais.pessoas_esperadas}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>pessoas esperadas</p>
          </div>
          <div className={card} style={cardStyle}>
            <p className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>{resumo.totais.na_escala}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>na escala do dia</p>
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-secondary)' }}>Carregando o turno…</p>}

      {resumo && !loading && (
        <div className="grid md:grid-cols-2 gap-4">

          {/* Reservas */}
          <div className={card} style={cardStyle}>
            <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Reservas do dia</h2>
            {resumo.reservas.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma reserva.</p>}
            {resumo.reservas.map((r, i) => (
              <div key={i} className="py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-primary)' }}>{r.nome}</span>
                  <span className="text-sm" style={{ color: 'var(--gold-light)' }}>{fmtHora(r.horario)}</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {r.pessoas ? `${r.pessoas} pessoas` : ''} {r.local ? `· ${r.local}` : ''} {r.telefone ? `· ${r.telefone}` : ''}
                </p>
                {r.obs && <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{r.obs}</p>}
              </div>
            ))}
          </div>

          {/* Escala */}
          <div className={card} style={cardStyle}>
            <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Escala de hoje</h2>
            {resumo.escala.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Escala não lançada para hoje.</p>}
            {resumo.escala.filter(e => !e.folga).map((e, i) => (
              <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-primary)' }}>{e.nome} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.funcao}</span></span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{e.setor} · {e.horario}</span>
              </div>
            ))}
          </div>

          {/* Cachê da noite */}
          <div className={card} style={cardStyle}>
            <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Atrações da noite</h2>
            {resumo['cachê_noite'].length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sem atração lançada.</p>}
            {resumo['cachê_noite'].map((c, i) => (
              <div key={i} className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <span style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtHora(c.inicio)} às {fmtHora(c.fim)}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm" style={{ color: 'var(--gold-light)' }}>{fmtReais(c.valor)}</span>
                  <p className="text-xs" style={{ color: c.status === 'pendente' ? 'var(--warning)' : 'var(--success)' }}>{c.status}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Fidelidade / validar cupom */}
          <div className={card} style={cardStyle}>
            <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Validar cupom / fidelidade</h2>
            <div className="flex gap-2 mb-3">
              <input value={termo} onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarFidelidade()}
                placeholder="CPF ou telefone do cliente"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }} />
              <button onClick={buscarFidelidade} disabled={buscando}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--wine)', color: '#fff' }}>
                {buscando ? '…' : 'Buscar'}
              </button>
            </div>
            {semResultado && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cliente não encontrado no programa.</p>}
            {fidelidade && (
              <div>
                <div className="flex gap-4 mb-2 text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{fidelidade.total_visitas} visitas</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Total: {fmtReais(fidelidade.gasto_total)}</span>
                </div>
                {(fidelidade.premios_disponiveis || []).length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sem prêmios disponíveis.</p>
                )}
                {(fidelidade.premios_disponiveis || []).map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <span style={{ color: 'var(--text-primary)' }}>{p.descricao}</span>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.valor ? fmtReais(p.valor) : p.tipo}</p>
                    </div>
                    <button onClick={() => validarPremio(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--success)', color: '#062' }}>
                      Validar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ação rápida */}
      <div className="mt-5 flex gap-3">
        <button onClick={abrirManutencao}
          className="px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
          🔧 Abrir manutenção
        </button>
      </div>
    </div>
  );
}
