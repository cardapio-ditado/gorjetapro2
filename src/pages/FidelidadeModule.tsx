import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── TEMA ────────────────────────────────────────────────────────────────────
const S = {
  bg:      '#0d0f1a',
  card:    '#13162a',
  border:  'rgba(212,175,55,0.15)',
  gold:    '#D4AF37',
  wine:    '#7D1F2C',
  text:    'rgba(255,255,255,0.88)',
  muted:   'rgba(255,255,255,0.4)',
  green:   '#4ade80',
  red:     '#f87171',
  blue:    '#60a5fa',
  purple:  '#a78bfa',
  inputBg: 'rgba(255,255,255,0.05)',
};

const tierColor: Record<string, string> = {
  bronze: '#cd7f32', prata: '#aaa', ouro: S.gold, vip: S.purple,
};
const tierLabel: Record<string, string> = {
  bronze: '🥉 Bronze', prata: '🥈 Prata', ouro: '🥇 Ouro', vip: '👑 VIP',
};

const fmt      = (d: Date) => d.toISOString().split('T')[0];
const fmtData  = (s: string) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const fmtMoeda = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

// ─── COMPONENTES BASE ────────────────────────────────────────────────────────
const Card = ({ children, style = {} }: any) => (
  <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: 20, ...style }}>
    {children}
  </div>
);

const Badge = ({ tier }: { tier: string }) => (
  <span style={{
    background: `${tierColor[tier]}22`, border: `1px solid ${tierColor[tier]}55`,
    color: tierColor[tier], borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  }}>{tierLabel[tier] || tier}</span>
);

const Input = ({ style = {}, ...props }: any) => (
  <input style={{
    background: S.inputBg, border: `1px solid ${S.border}`, borderRadius: 8,
    padding: '8px 12px', color: S.text, fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box' as any, ...style,
  }} {...props} />
);

const Btn = ({ children, onClick, variant = 'default', disabled = false, style = {} }: any) => {
  const variants: any = {
    default: { background: `${S.gold}22`, border: `1px solid ${S.gold}44`, color: S.gold },
    primary: { background: S.gold, border: 'none', color: '#0d0f1a' },
    danger:  { background: `${S.red}22`, border: `1px solid ${S.red}44`, color: S.red },
    green:   { background: `${S.green}22`, border: `1px solid ${S.green}44`, color: S.green },
    ghost:   { background: 'transparent', border: `1px solid ${S.border}`, color: S.muted },
    wine:    { background: `${S.wine}44`, border: `1px solid ${S.wine}88`, color: '#fff' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant], borderRadius: 8, padding: '8px 16px',
      fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'opacity .2s', ...style,
    }}>{children}</button>
  );
};

// ─── SEÇÃO: PRÊMIOS PENDENTES ────────────────────────────────────────────────
const SecaoPremios = () => {
  const [premios, setPremios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPremios = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fidelidade_clientes')
      .select('nome, telefone, tier, premio_descricao, premio_gerado_em, cpf')
      .eq('premio_pendente', true)
      .order('premio_gerado_em', { ascending: false });
    setPremios(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPremios(); }, [fetchPremios]);

  const marcarResgatado = async (cpf: string) => {
    await supabase.from('fidelidade_clientes').update({
      premio_pendente: false,
      premio_descricao: null,
      premio_gerado_em: null,
      premio_notificado_whatsapp: false,
    }).eq('cpf', cpf);
    await supabase.from('fidelidade_premios').update({
      status: 'resgatado',
      resgatado_em: new Date().toISOString(),
    }).eq('cpf', cpf).eq('status', 'pendente');
    setPremios(prev => prev.filter(p => p.cpf !== cpf));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: S.gold, fontWeight: 700, fontSize: 16, margin: 0 }}>
          🎁 Prêmios Aguardando Retirada
        </p>
        <span style={{
          background: premios.length > 0 ? `${S.gold}33` : S.inputBg,
          color: premios.length > 0 ? S.gold : S.muted,
          borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700,
        }}>
          {premios.length} pendente{premios.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading && <p style={{ color: S.muted, fontSize: 12 }}>Carregando...</p>}

      {!loading && premios.length === 0 && (
        <Card>
          <p style={{ color: S.muted, fontSize: 13, textAlign: 'center', margin: 0 }}>
            ✅ Nenhum prêmio pendente no momento.
          </p>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {premios.map((p, i) => (
          <div key={i} style={{
            background: S.card,
            border: `1px solid ${S.gold}55`,
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ color: S.text, fontWeight: 700, fontSize: 15, margin: 0 }}>{p.nome}</p>
                <Badge tier={p.tier} />
              </div>
              <p style={{ color: S.muted, fontSize: 12, margin: '0 0 6px' }}>{p.telefone || 'Sem telefone'}</p>
              <div style={{
                background: `${S.gold}22`, border: `1px solid ${S.gold}44`,
                borderRadius: 8, padding: '6px 12px', display: 'inline-block',
              }}>
                <p style={{ color: S.gold, fontWeight: 700, fontSize: 13, margin: 0 }}>🎁 {p.premio_descricao}</p>
              </div>
              <p style={{ color: S.muted, fontSize: 11, margin: '6px 0 0' }}>
                Gerado em {p.premio_gerado_em ? new Date(p.premio_gerado_em).toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
            <Btn variant="green" onClick={() => marcarResgatado(p.cpf)}>
              ✓ Marcar como resgatado
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SEÇÃO: SYNC ─────────────────────────────────────────────────────────────
const SecaoSync = () => {
  const [dtInicio, setDtInicio] = useState(() => fmt(new Date(Date.now() - 86400000)));
  const [dtFim, setDtFim]       = useState(() => fmt(new Date(Date.now() - 86400000)));
  const [loading, setLoading]   = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [logs, setLogs]           = useState<any[]>([]);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('fidelidade_sync_logs')
      .select('*').order('iniciado_em', { ascending: false }).limit(10);
    if (data) setLogs(data);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSync = async () => {
    setLoading(true); setResultado(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${(supabase as any).supabaseUrl}/functions/v1/sync-zig-fidelidade`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ dtinicio: dtInicio, dtfim: dtFim }),
      });
      const json = await res.json();
      setResultado(json);
      await fetchLogs();
    } catch (e: any) {
      setResultado({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <p style={{ color: S.gold, fontWeight: 700, marginBottom: 16, fontSize: 14 }}>⚡ Sincronização Manual</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: S.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Data início</label>
            <Input type="date" value={dtInicio} onChange={(e: any) => setDtInicio(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: S.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Data fim</label>
            <Input type="date" value={dtFim} onChange={(e: any) => setDtFim(e.target.value)} />
          </div>
          <Btn variant="primary" onClick={handleSync} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? '⏳ Sincronizando...' : '🔄 Sincronizar'}
          </Btn>
        </div>
        {resultado && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: resultado.ok ? `${S.green}11` : `${S.red}11`,
            border: `1px solid ${resultado.ok ? S.green : S.red}33`,
          }}>
            {resultado.ok ? (
              <p style={{ color: S.green, fontSize: 12, margin: 0 }}>
                ✅ Clientes: <b>{resultado.resumo?.clientesProcessados}</b> &nbsp;|&nbsp;
                Visitas novas: <b>{resultado.resumo?.visitasNovas}</b> &nbsp;|&nbsp;
                Prêmios: <b>{resultado.resumo?.premiosGerados}</b>
              </p>
            ) : (
              <p style={{ color: S.red, fontSize: 12, margin: 0 }}>❌ {resultado.error}</p>
            )}
          </div>
        )}
        <p style={{ color: S.muted, fontSize: 11, marginTop: 10, marginBottom: 0 }}>
          🕐 Sync automático diário às 06:00
        </p>
      </Card>

      <Card>
        <p style={{ color: S.text, fontWeight: 700, marginBottom: 12, fontSize: 13 }}>Histórico de Sincronizações</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logs.length === 0 && <p style={{ color: S.muted, fontSize: 12 }}>Nenhum log encontrado.</p>}
          {logs.map((l, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', background: S.inputBg, borderRadius: 8,
            }}>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, marginRight: 8,
                  color: l.status === 'sucesso' ? S.green : l.status === 'em_andamento' ? S.gold : S.red,
                }}>
                  {l.status === 'sucesso' ? '✅' : l.status === 'em_andamento' ? '⏳' : '❌'} {l.status}
                </span>
                <span style={{ color: S.muted, fontSize: 11 }}>{fmtData(l.data_ref)}</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: S.muted }}>
                {l.clientes_processados} clientes · {l.visitas_novas} visitas · {l.premios_gerados} prêmios
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ─── SEÇÃO: BUSCA CLIENTE ────────────────────────────────────────────────────
const SecaoBusca = () => {
  const [query, setQuery]       = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selecionado, setSelecionado] = useState<any>(null);
  const [produtos, setProdutos] = useState<any[]>([]);

  const buscar = useCallback(async () => {
    if (query.trim().length < 2) { setClientes([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('fidelidade_clientes')
      .select('*')
      .not('telefone', 'is', null)
      .or(`nome.ilike.%${query}%,telefone.ilike.%${query}%`)
      .order('total_visitas', { ascending: false })
      .limit(20);
    setClientes(data || []);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(buscar, 400);
    return () => clearTimeout(t);
  }, [buscar]);

  const verCliente = async (c: any) => {
    setSelecionado(c);
    const { data } = await supabase
      .from('fidelidade_produtos_consumidos')
      .select('produto_nome, quantidade, valor_unitario_centavos')
      .eq('cpf', c.cpf);
    if (data) {
      const agg: Record<string, { qtd: number; total: number }> = {};
      data.forEach((p: any) => {
        if (!agg[p.produto_nome]) agg[p.produto_nome] = { qtd: 0, total: 0 };
        agg[p.produto_nome].qtd   += p.quantidade;
        agg[p.produto_nome].total += p.quantidade * (p.valor_unitario_centavos || 0);
      });
      setProdutos(Object.entries(agg).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.qtd - a.qtd));
    }
  };

  if (selecionado) return (
    <div>
      <Btn variant="ghost" onClick={() => { setSelecionado(null); setProdutos([]); }} style={{ marginBottom: 16 }}>
        ← Voltar
      </Btn>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ color: S.text, fontWeight: 700, fontSize: 18, margin: 0 }}>{selecionado.nome}</p>
            <p style={{ color: S.muted, fontSize: 12, margin: '4px 0 8px' }}>{selecionado.telefone}</p>
            <Badge tier={selecionado.tier} />
          </div>
          {selecionado.premio_pendente && (
            <div style={{
              background: `${S.gold}22`, border: `1px solid ${S.gold}55`,
              borderRadius: 10, padding: '10px 16px', textAlign: 'center',
            }}>
              <p style={{ color: S.gold, fontSize: 11, fontWeight: 700, margin: 0 }}>🎁 PRÊMIO PENDENTE</p>
              <p style={{ color: S.text, fontSize: 13, margin: '4px 0 0', fontWeight: 600 }}>{selecionado.premio_descricao}</p>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 20 }}>
          {[
            { label: 'Visitas',       value: selecionado.total_visitas,                                    color: S.blue },
            { label: 'Gasto Total',   value: fmtMoeda(selecionado.total_gasto_real),                       color: S.green },
            { label: 'Pontos',        value: (selecionado.pontos_total || 0).toLocaleString('pt-BR'),      color: S.gold },
            { label: 'Última Visita', value: fmtData(selecionado.ultima_visita),                           color: S.text },
            { label: '1ª Visita',     value: fmtData(selecionado.primeira_visita),                         color: S.text },
            { label: 'Aniversário',   value: selecionado.data_nascimento ? `${selecionado.aniversario_dia}/${selecionado.aniversario_mes}` : '—', color: S.purple },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: S.inputBg, borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <p style={{ color: S.muted, fontSize: 10, margin: '0 0 4px' }}>{label}</p>
              <p style={{ color, fontSize: 15, fontWeight: 700, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
        {produtos.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ color: S.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>PRODUTOS CONSUMIDOS</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {produtos.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 12px', background: S.inputBg, borderRadius: 8,
                }}>
                  <span style={{ color: S.text, fontSize: 12 }}>{p.nome}</span>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ color: S.gold, fontSize: 12, fontWeight: 600 }}>{p.qtd}×</span>
                    <span style={{ color: S.green, fontSize: 12 }}>{fmtMoeda(p.total / 100)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div>
      <Input
        placeholder="Buscar por nome ou telefone (mín. 2 caracteres)..."
        value={query} onChange={(e: any) => setQuery(e.target.value)}
        style={{ marginBottom: 16, fontSize: 14, padding: '10px 14px' }}
      />
      {loading && <p style={{ color: S.muted, fontSize: 12 }}>Buscando...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {clientes.map(c => (
          <div key={c.id} onClick={() => verCliente(c)} style={{
            background: S.card, border: `1px solid ${S.border}`, borderRadius: 10,
            padding: '12px 16px', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = S.gold)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = S.border)}
          >
            <div>
              <p style={{ color: S.text, fontWeight: 600, margin: 0, fontSize: 14 }}>{c.nome}</p>
              <p style={{ color: S.muted, fontSize: 11, margin: '2px 0 0' }}>{c.telefone}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tier={c.tier} />
              <span style={{ color: S.muted, fontSize: 11 }}>{c.total_visitas} visitas</span>
              <span style={{ color: S.green, fontSize: 12, fontWeight: 600 }}>{fmtMoeda(c.total_gasto_real)}</span>
              {c.premio_pendente && (
                <span style={{ background: `${S.gold}33`, color: S.gold, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  🎁 Prêmio
                </span>
              )}
            </div>
          </div>
        ))}
        {!loading && query.length >= 2 && clientes.length === 0 && (
          <p style={{ color: S.muted, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            Nenhum cliente encontrado com telefone cadastrado.
          </p>
        )}
      </div>
    </div>
  );
};

// ─── SEÇÃO: ANIVERSARIANTES ──────────────────────────────────────────────────
const SecaoAniversariantes = () => {
  const [lista, setLista]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalhe, setDetalhe] = useState<any>(null);
  const mes      = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();
  const meses    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const hoje     = new Date().getDate();

  const fetchAniversariantes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fidelidade_clientes')
      .select('*')
      .eq('aniversario_mes', mes)
      .not('telefone', 'is', null)
      .order('aniversario_dia', { ascending: true });
    setLista(data || []);
    setLoading(false);
  }, [mes]);

  useEffect(() => { fetchAniversariantes(); }, [fetchAniversariantes]);

  const toggleContactado = async (c: any) => {
    const novoStatus = !c.aniversario_contactado;
    await supabase.from('fidelidade_clientes').update({
      aniversario_contactado:    novoStatus,
      aniversario_contactado_em: novoStatus ? new Date().toISOString() : null,
      aniversario_contactado_ano: novoStatus ? anoAtual : null,
    }).eq('cpf', c.cpf);
    setLista(prev => prev.map(x => x.cpf === c.cpf
      ? { ...x, aniversario_contactado: novoStatus, aniversario_contactado_ano: novoStatus ? anoAtual : 0 }
      : x));
  };

  return (
    <div>
      {detalhe && <ModalDetalheVisitas cliente={detalhe} onClose={() => setDetalhe(null)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: S.gold, fontWeight: 700, fontSize: 16, margin: 0 }}>
          🎂 Aniversariantes de {meses[mes - 1]}
        </p>
        <span style={{ color: S.muted, fontSize: 12 }}>
          {lista.filter(c => !c.aniversario_contactado).length} pendentes de contato
        </span>
      </div>
      {loading && <p style={{ color: S.muted, fontSize: 12 }}>Carregando...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map(c => {
          const isHoje     = c.aniversario_dia === hoje;
          const contactado = c.aniversario_contactado && c.aniversario_contactado_ano === anoAtual;
          return (
            <div key={c.cpf} style={{
              background: S.card,
              border: `1px solid ${isHoje ? S.gold : S.border}`,
              borderRadius: 10, padding: '12px 16px', opacity: contactado ? 0.6 : 1,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              cursor: 'pointer',
            }}
              onClick={() => setDetalhe(c)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = S.gold)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = isHoje ? S.gold : S.border)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: isHoje ? `${S.gold}33` : S.inputBg,
                  border: isHoje ? `1px solid ${S.gold}66` : 'none',
                }}>
                  <span style={{ color: isHoje ? S.gold : S.muted, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                    {c.aniversario_dia}
                  </span>
                  <span style={{ color: S.muted, fontSize: 9 }}>{meses[mes-1].slice(0,3).toUpperCase()}</span>
                </div>
                <div>
                  <p style={{ color: S.text, fontWeight: 600, margin: 0, fontSize: 13 }}>
                    {c.nome} {isHoje && '🎉'}
                  </p>
                  <p style={{ color: S.muted, fontSize: 11, margin: '2px 0 0' }}>
                    {c.telefone} · <Badge tier={c.tier} /> · {c.total_visitas} visitas
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                <Btn variant={contactado ? 'ghost' : 'green'} onClick={() => toggleContactado(c)}>
                  {contactado ? '✓ Contactado' : 'Marcar contactado'}
                </Btn>
              </div>
            </div>
          );
        })}
        {!loading && lista.length === 0 && (
          <p style={{ color: S.muted, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            Nenhum aniversariante com telefone em {meses[mes - 1]}.
          </p>
        )}
      </div>
    </div>
  );
};

// ─── SEÇÃO: RANKINGS ─────────────────────────────────────────────────────────
const SecaoRankings = () => {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [aba, setAba]             = useState<'mes' | 'chopp' | 'produto'>('mes');
  const [rankMes, setRankMes]     = useState<any[]>([]);
  const [rankChopp, setRankChopp] = useState<any[]>([]);
  const [busca, setBusca]         = useState('');
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [rankProduto, setRankProduto] = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [detalheCliente, setDetalheCliente] = useState<any>(null);
  const [dataInicio, setDataInicio] = useState(() => fmt(primeiroDiaMes));
  const [dataFim, setDataFim]       = useState(() => fmt(hoje));

  useEffect(() => {
    if (aba === 'mes')   fetchRankMes();
  }, [aba, dataInicio, dataFim]);

  useEffect(() => {
    if (aba === 'chopp') fetchRankChopp();
  }, [aba]);

  const fetchRankMes = async () => {
    setLoading(true);

    const { data: visitas } = await supabase
      .from('fidelidade_visitas')
      .select('cpf, gasto_centavos')
      .gte('data_visita', dataInicio)
      .lte('data_visita', dataFim);

    if (!visitas || visitas.length === 0) { setRankMes([]); setLoading(false); return; }

    const agg: Record<string, { gasto: number; visitas: number }> = {};
    visitas.forEach((v: any) => {
      if (!agg[v.cpf]) agg[v.cpf] = { gasto: 0, visitas: 0 };
      agg[v.cpf].gasto   += v.gasto_centavos;
      agg[v.cpf].visitas += 1;
    });

    const cpfs = Object.keys(agg);
    const { data: clientes } = await supabase
      .from('fidelidade_clientes')
      .select('cpf, nome, telefone, tier, pontos_total, total_gasto_real, total_visitas')
      .in('cpf', cpfs);

    const clienteMap: Record<string, any> = {};
    (clientes || []).forEach((c: any) => { clienteMap[c.cpf] = c; });

    const resultado = cpfs
      .map(cpf => ({ cpf, ...agg[cpf], ...(clienteMap[cpf] || { nome: cpf, tier: 'bronze' }) }))
      .sort((a: any, b: any) => b.gasto - a.gasto)
      .slice(0, 20);

    setRankMes(resultado);
    setLoading(false);
  };

  const fetchRankChopp = async () => {
    setLoading(true);
    const { data: produtos } = await supabase
      .from('fidelidade_produtos_consumidos')
      .select('cpf, quantidade')
      .ilike('produto_nome', '%chopp%');

    if (!produtos || produtos.length === 0) { setRankChopp([]); setLoading(false); return; }

    const agg: Record<string, number> = {};
    produtos.forEach((p: any) => {
      agg[p.cpf] = (agg[p.cpf] || 0) + p.quantidade;
    });

    const cpfs = Object.keys(agg);
    const { data: clientes } = await supabase
      .from('fidelidade_clientes')
      .select('cpf, nome, telefone, tier, pontos_total, total_gasto_real, total_visitas')
      .in('cpf', cpfs);

    const clienteMap: Record<string, any> = {};
    (clientes || []).forEach((c: any) => { clienteMap[c.cpf] = c; });

    const resultado = cpfs
      .map(cpf => ({ cpf, qtd: agg[cpf], ...(clienteMap[cpf] || { nome: cpf, tier: 'bronze' }) }))
      .sort((a: any, b: any) => b.qtd - a.qtd)
      .slice(0, 20);

    setRankChopp(resultado);
    setLoading(false);
  };

  const buscarProduto = async (termo: string) => {
    if (termo.trim().length < 2) { setRankProduto([]); return; }
    setLoading(true);
    const { data: produtos } = await supabase
      .from('fidelidade_produtos_consumidos')
      .select('cpf, quantidade, valor_unitario_centavos')
      .ilike('produto_nome', `%${termo}%`);

    if (!produtos || produtos.length === 0) { setRankProduto([]); setLoading(false); return; }

    const agg: Record<string, { qtd: number; total: number }> = {};
    produtos.forEach((p: any) => {
      if (!agg[p.cpf]) agg[p.cpf] = { qtd: 0, total: 0 };
      agg[p.cpf].qtd   += p.quantidade;
      agg[p.cpf].total += p.quantidade * (p.valor_unitario_centavos || 0);
    });

    const cpfs = Object.keys(agg);
    const { data: clientes } = await supabase
      .from('fidelidade_clientes')
      .select('cpf, nome, telefone, tier, pontos_total, total_gasto_real, total_visitas')
      .in('cpf', cpfs);

    const clienteMap: Record<string, any> = {};
    (clientes || []).forEach((c: any) => { clienteMap[c.cpf] = c; });

    const resultado = cpfs
      .map(cpf => ({ cpf, ...agg[cpf], ...(clienteMap[cpf] || { nome: cpf, tier: 'bronze' }) }))
      .sort((a: any, b: any) => b.qtd - a.qtd)
      .slice(0, 20);

    setRankProduto(resultado);
    setLoading(false);
  };

  // Live autocomplete for produto search
  useEffect(() => {
    if (busca.trim().length < 2) { setSugestoes([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('fidelidade_produtos_consumidos')
        .select('produto_nome')
        .ilike('produto_nome', `%${busca}%`)
        .limit(50);
      if (data) {
        const nomes = [...new Set(data.map((d: any) => d.produto_nome as string))].slice(0, 8);
        setSugestoes(nomes);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Live ranking results as user types
  useEffect(() => {
    if (aba !== 'produto') return;
    const t = setTimeout(() => buscarProduto(busca), 400);
    return () => clearTimeout(t);
  }, [busca, aba]);

  const abas = [
    { key: 'mes',     label: '🏆 Ranking do Mês' },
    { key: 'chopp',   label: '🍺 Top Chopp' },
    { key: 'produto', label: '🔍 Por Produto' },
  ];

  const nomeClickable = (c: any) => (
    <p
      onClick={() => setDetalheCliente(c)}
      style={{
        color: S.text, fontWeight: 600, margin: 0, fontSize: 13,
        cursor: 'pointer', textDecoration: 'underline', textDecorationColor: `${S.gold}55`,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = S.gold)}
      onMouseLeave={e => (e.currentTarget.style.color = S.text)}
    >{c.nome}</p>
  );

  return (
    <div>
      {detalheCliente && <ModalDetalheVisitas cliente={detalheCliente} onClose={() => setDetalheCliente(null)} />}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {abas.map(a => (
          <Btn key={a.key} variant={aba === a.key ? 'primary' : 'ghost'} onClick={() => setAba(a.key as any)}>
            {a.label}
          </Btn>
        ))}
      </div>

      {aba === 'mes' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: S.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>De</label>
            <Input type="date" value={dataInicio} onChange={(e: any) => setDataInicio(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: S.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>Até</label>
            <Input type="date" value={dataFim} onChange={(e: any) => setDataFim(e.target.value)} />
          </div>
          <Btn variant="default" onClick={fetchRankMes} disabled={loading}>Atualizar</Btn>
        </div>
      )}

      {loading && <p style={{ color: S.muted, fontSize: 12 }}>Carregando...</p>}

      {aba === 'mes' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rankMes.length === 0 && <p style={{ color: S.muted, fontSize: 13 }}>Nenhum dado para o período selecionado.</p>}
          {rankMes.map((c: any, i) => (
            <div key={c.cpf} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: S.card, border: `1px solid ${i < 3 ? S.gold + '44' : S.border}`,
              borderRadius: 10, padding: '10px 16px',
            }}>
              <span style={{ color: i < 3 ? S.gold : S.muted, fontWeight: 700, fontSize: 16, minWidth: 28 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`}
              </span>
              <div style={{ flex: 1 }}>
                {nomeClickable(c)}
                <p style={{ color: S.muted, fontSize: 11, margin: 0 }}>{c.visitas} visita{c.visitas !== 1 ? 's' : ''} no período</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: S.green, fontWeight: 700, fontSize: 14, margin: 0 }}>{fmtMoeda(c.gasto / 100)}</p>
                <Badge tier={c.tier} />
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === 'chopp' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rankChopp.length === 0 && <p style={{ color: S.muted, fontSize: 13 }}>Nenhum dado de chopp encontrado.</p>}
          {rankChopp.map((c: any, i) => (
            <div key={c.cpf} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: S.card, border: `1px solid ${i < 3 ? S.blue + '44' : S.border}`,
              borderRadius: 10, padding: '10px 16px',
            }}>
              <span style={{ color: i < 3 ? S.blue : S.muted, fontWeight: 700, fontSize: 16, minWidth: 28 }}>
                {i === 0 ? '🍺' : `${i+1}º`}
              </span>
              <div style={{ flex: 1 }}>
                {nomeClickable(c)}
                <Badge tier={c.tier} />
              </div>
              <span style={{ color: S.blue, fontWeight: 700, fontSize: 18 }}>{c.qtd}×</span>
            </div>
          ))}
        </div>
      )}

      {aba === 'produto' && (
        <div>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Input
              placeholder="Digite o nome do produto..."
              value={busca}
              onChange={(e: any) => { setBusca(e.target.value); setMostrarSugestoes(true); }}
              onFocus={() => setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
            />
            {mostrarSugestoes && sugestoes.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: S.card, border: `1px solid ${S.border}`, borderRadius: 8,
                marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {sugestoes.map((s, i) => (
                  <div key={i}
                    onMouseDown={() => { setBusca(s); setMostrarSugestoes(false); }}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: S.text,
                      borderBottom: i < sugestoes.length - 1 ? `1px solid ${S.border}` : 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${S.gold}11`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >{s}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rankProduto.map((c: any, i) => (
              <div key={c.cpf} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: S.card, border: `1px solid ${S.border}`,
                borderRadius: 10, padding: '10px 16px',
              }}>
                <span style={{ color: S.muted, fontWeight: 700, fontSize: 14, minWidth: 28 }}>{i+1}º</span>
                <div style={{ flex: 1 }}>
                  {nomeClickable(c)}
                  <Badge tier={c.tier} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: S.gold, fontWeight: 700, fontSize: 14, margin: 0 }}>{c.qtd}×</p>
                  <p style={{ color: S.green, fontSize: 11, margin: 0 }}>{fmtMoeda(c.total / 100)}</p>
                </div>
              </div>
            ))}
            {!loading && rankProduto.length === 0 && busca.length >= 2 && (
              <p style={{ color: S.muted, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                Nenhum resultado para "{busca}".
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SEÇÃO: GATILHOS ─────────────────────────────────────────────────────────
const SecaoGatilhos = () => {
  const [gatilhos, setGatilhos] = useState<any[]>([]);
  const [editando, setEditando] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  useEffect(() => { fetchGatilhos(); }, []);

  const fetchGatilhos = async () => {
    setLoading(true);
    const { data } = await supabase.from('fidelidade_gatilhos').select('*').order('prioridade', { ascending: false });
    setGatilhos(data || []);
    setLoading(false);
  };

  const toggleAtivo = async (g: any) => {
    await supabase.from('fidelidade_gatilhos').update({ ativo: !g.ativo }).eq('id', g.id);
    setGatilhos(prev => prev.map(x => x.id === g.id ? { ...x, ativo: !g.ativo } : x));
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSaving(true);
    await supabase.from('fidelidade_gatilhos').update({
      nome:                    editando.nome,
      premio_descricao:        editando.premio_descricao,
      condicao_visitas:        editando.condicao_visitas,
      condicao_gasto_centavos: editando.condicao_gasto_centavos,
      condicao_produto_nome:   editando.condicao_produto_nome,
      condicao_produto_qtd:    editando.condicao_produto_qtd,
      premio_validade_dias:    editando.premio_validade_dias,
      premio_valor_centavos:   editando.premio_valor_centavos,
      prioridade:              editando.prioridade,
    }).eq('id', editando.id);
    await fetchGatilhos();
    setEditando(null);
    setSaving(false);
  };

  const tipoLabel: Record<string, string> = {
    visitas: '👣 Visitas', gasto: '💰 Gasto', produto: '🍺 Produto',
    combinado: '🔗 Combinado', surpresa: '🎲 Surpresa',
  };

  if (editando) return (
    <Card>
      <p style={{ color: S.gold, fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Editando: {editando.nome}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Nome do gatilho',           key: 'nome',                    type: 'text'   },
          { label: 'Descrição do prêmio',        key: 'premio_descricao',        type: 'text'   },
          { label: 'Condição: Nº visitas',       key: 'condicao_visitas',        type: 'number' },
          { label: 'Condição: Gasto (centavos)', key: 'condicao_gasto_centavos', type: 'number' },
          { label: 'Condição: Produto (nome)',   key: 'condicao_produto_nome',   type: 'text'   },
          { label: 'Condição: Qtd do produto',  key: 'condicao_produto_qtd',    type: 'number' },
          { label: 'Valor cashback (centavos)',  key: 'premio_valor_centavos',   type: 'number' },
          { label: 'Validade (dias)',            key: 'premio_validade_dias',    type: 'number' },
          { label: 'Prioridade',                key: 'prioridade',              type: 'number' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label style={{ color: S.muted, fontSize: 11, display: 'block', marginBottom: 4 }}>{label}</label>
            <Input
              type={type}
              value={editando[key] ?? ''}
              onChange={(e: any) => setEditando({
                ...editando,
                [key]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value,
              })}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn variant="primary" onClick={salvarEdicao} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
        <Btn variant="ghost" onClick={() => setEditando(null)}>Cancelar</Btn>
      </div>
    </Card>
  );

  return (
    <div>
      <p style={{ color: S.muted, fontSize: 12, marginBottom: 16 }}>
        Regras automáticas de premiação. Alterações valem para novos syncs.
      </p>
      {loading && <p style={{ color: S.muted, fontSize: 12 }}>Carregando...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {gatilhos.map(g => (
          <div key={g.id} style={{
            background: S.card, border: `1px solid ${g.ativo ? S.border : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 10, padding: '12px 16px', opacity: g.ativo ? 1 : 0.5,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ background: `${S.blue}22`, color: S.blue, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                  {tipoLabel[g.tipo]}
                </span>
                <p style={{ color: S.text, fontWeight: 600, margin: 0, fontSize: 13 }}>{g.nome}</p>
              </div>
              <p style={{ color: S.gold, fontSize: 12, margin: '4px 0 0' }}>🎁 {g.premio_descricao}</p>
              <p style={{ color: S.muted, fontSize: 11, margin: '2px 0 0' }}>
                {g.condicao_visitas        && `${g.condicao_visitas} visitas`}
                {g.condicao_gasto_centavos && ` · R$ ${(g.condicao_gasto_centavos / 100).toFixed(0)} gastos`}
                {g.condicao_produto_nome   && ` · ${g.condicao_produto_qtd}× ${g.condicao_produto_nome}`}
                {` · Validade: ${g.premio_validade_dias} dias`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="ghost" onClick={() => setEditando(g)}>✏️ Editar</Btn>
              <Btn variant={g.ativo ? 'danger' : 'green'} onClick={() => toggleAtivo(g)}>
                {g.ativo ? 'Desativar' : 'Ativar'}
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MODAL: DETALHE DE VISITAS DO CLIENTE ───────────────────────────────────
const ModalDetalheVisitas = ({ cliente, onClose }: { cliente: any; onClose: () => void }) => {
  const [visitas, setVisitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [produtosPorVisita, setProdutosPorVisita] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('fidelidade_visitas')
        .select('id, data_visita, gasto_centavos, gorjeta_centavos, numero_visita_sequencial')
        .eq('cpf', cliente.cpf)
        .order('data_visita', { ascending: false });
      setVisitas(data || []);
      setLoading(false);
    };
    load();
  }, [cliente.cpf]);

  const verProdutos = async (visita: any) => {
    const vid = visita.id;
    if (expandido === vid) { setExpandido(null); return; }
    setExpandido(vid);
    if (produtosPorVisita[vid]) return;
    const { data } = await supabase
      .from('fidelidade_produtos_consumidos')
      .select('produto_nome, quantidade, valor_unitario_centavos')
      .eq('visita_id', vid)
      .order('quantidade', { ascending: false });
    setProdutosPorVisita(prev => ({ ...prev, [vid]: data || [] }));
  };

  const pontosVisita = (gasto: number) => Math.floor(gasto / 100);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: S.card, border: `1px solid ${S.border}`, borderRadius: 16,
        width: '100%', maxWidth: 640, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid ${S.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <p style={{ color: S.text, fontWeight: 700, fontSize: 18, margin: 0 }}>{cliente.nome}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tier={cliente.tier} />
              <span style={{ color: S.gold, fontSize: 13, fontWeight: 700 }}>
                {(cliente.pontos_total || 0).toLocaleString('pt-BR')} pts
              </span>
              <span style={{ color: S.muted, fontSize: 12 }}>·</span>
              <span style={{ color: S.green, fontSize: 12 }}>{fmtMoeda(cliente.total_gasto_real)}</span>
              <span style={{ color: S.muted, fontSize: 12 }}>·</span>
              <span style={{ color: S.blue, fontSize: 12 }}>{cliente.total_visitas} visitas</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: S.muted, cursor: 'pointer',
            fontSize: 22, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Regra de pontos */}
        <div style={{ padding: '10px 24px', borderBottom: `1px solid ${S.border}`, background: `${S.gold}11` }}>
          <p style={{ color: S.gold, fontSize: 11, margin: 0 }}>
            ⭐ Cada R$ 1,00 gasto = 1 ponto · Clique em uma visita para ver os produtos consumidos
          </p>
        </div>

        {/* Lista de visitas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading && <p style={{ color: S.muted, fontSize: 12 }}>Carregando visitas...</p>}
          {!loading && visitas.length === 0 && (
            <p style={{ color: S.muted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              Nenhuma visita registrada.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visitas.map((v) => {
              const pts = pontosVisita(v.gasto_centavos);
              const isOpen = expandido === v.id;
              const prods = produtosPorVisita[v.id];
              return (
                <div key={v.id} style={{
                  background: S.bg, border: `1px solid ${isOpen ? S.gold + '55' : S.border}`,
                  borderRadius: 10, overflow: 'hidden',
                  transition: 'border-color .15s',
                }}>
                  <div
                    onClick={() => verProdutos(v)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* número da visita */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: `${S.blue}22`, border: `1px solid ${S.blue}44`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: S.blue, fontSize: 12, fontWeight: 700 }}>
                          {v.numero_visita_sequencial ?? '—'}
                        </span>
                      </div>
                      <div>
                        <p style={{ color: S.text, fontWeight: 600, margin: 0, fontSize: 13 }}>
                          {fmtData(v.data_visita)}
                        </p>
                        <p style={{ color: S.muted, fontSize: 11, margin: 0 }}>
                          {fmtMoeda(v.gasto_centavos / 100)}
                          {v.gorjeta_centavos > 0 && ` · gorjeta ${fmtMoeda(v.gorjeta_centavos / 100)}`}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: S.gold, fontWeight: 800, fontSize: 15, margin: 0 }}>+{pts}</p>
                        <p style={{ color: S.muted, fontSize: 10, margin: 0 }}>pontos</p>
                      </div>
                      <span style={{ color: S.muted, fontSize: 16, transition: 'transform .2s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                    </div>
                  </div>

                  {/* Produtos expandidos */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${S.border}`, padding: '10px 16px 12px' }}>
                      {!prods && <p style={{ color: S.muted, fontSize: 11, margin: 0 }}>Carregando produtos...</p>}
                      {prods && prods.length === 0 && (
                        <p style={{ color: S.muted, fontSize: 11, margin: 0 }}>Nenhum produto registrado nesta visita.</p>
                      )}
                      {prods && prods.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <p style={{ color: S.muted, fontSize: 10, fontWeight: 700, margin: '0 0 6px', letterSpacing: 0.5 }}>
                            PRODUTOS CONSUMIDOS
                          </p>
                          {prods.map((p, pi) => (
                            <div key={pi} style={{
                              display: 'flex', justifyContent: 'space-between',
                              padding: '6px 10px', background: S.inputBg, borderRadius: 6,
                            }}>
                              <span style={{ color: S.text, fontSize: 12 }}>{p.produto_nome}</span>
                              <div style={{ display: 'flex', gap: 14 }}>
                                <span style={{ color: S.gold, fontSize: 12, fontWeight: 600 }}>{p.quantidade}×</span>
                                <span style={{ color: S.green, fontSize: 12 }}>
                                  {fmtMoeda((p.quantidade * (p.valor_unitario_centavos || 0)) / 100)}
                                </span>
                              </div>
                            </div>
                          ))}
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: '6px 10px', marginTop: 2,
                            borderTop: `1px solid ${S.border}`,
                          }}>
                            <span style={{ color: S.muted, fontSize: 11 }}>Total gasto nessa visita</span>
                            <div style={{ display: 'flex', gap: 14 }}>
                              <span style={{ color: S.gold, fontSize: 11 }}>+{pts} pts</span>
                              <span style={{ color: S.green, fontSize: 12, fontWeight: 600 }}>
                                {fmtMoeda(v.gasto_centavos / 100)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SEÇÃO: PONTOS ───────────────────────────────────────────────────────────
const SecaoPontos = () => {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busca, setBusca]       = useState('');
  const [detalhe, setDetalhe]   = useState<any>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('fidelidade_clientes')
        .select('cpf, nome, telefone, tier, pontos_total, total_gasto_real, total_visitas, ultima_visita')
        .not('telefone', 'is', null)
        .order('pontos_total', { ascending: false })
        .limit(50);
      setClientes(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtrados = clientes.filter(c => !busca || c.nome?.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div>
      {detalhe && <ModalDetalheVisitas cliente={detalhe} onClose={() => setDetalhe(null)} />}
      <Card style={{ marginBottom: 16 }}>
        <p style={{ color: S.text, fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>⭐ Programa de Pontos</p>
        <p style={{ color: S.muted, fontSize: 12, margin: 0 }}>
          Cada <b style={{ color: S.gold }}>R$ 1,00</b> gasto = <b style={{ color: S.gold }}>1 ponto</b>.
          Acumula automaticamente a cada sync. Clique no nome de um cliente para ver o histórico de visitas e pontos.
        </p>
      </Card>
      <Input placeholder="Filtrar por nome..." value={busca} onChange={(e: any) => setBusca(e.target.value)} style={{ marginBottom: 12 }} />
      {loading && <p style={{ color: S.muted, fontSize: 12 }}>Carregando...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtrados.map((c, i) => (
          <div key={i} style={{
            background: S.card, border: `1px solid ${i < 3 ? S.gold + '33' : S.border}`,
            borderRadius: 10, padding: '10px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: i < 3 ? S.gold : S.muted, fontWeight: 700, fontSize: 13, minWidth: 24 }}>{i+1}º</span>
              <div>
                <p
                  onClick={() => setDetalhe(c)}
                  style={{
                    color: S.text, fontWeight: 600, margin: 0, fontSize: 13,
                    cursor: 'pointer', textDecoration: 'underline', textDecorationColor: `${S.gold}66`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = S.gold)}
                  onMouseLeave={e => (e.currentTarget.style.color = S.text)}
                >
                  {c.nome}
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <Badge tier={c.tier} />
                  <span style={{ color: S.muted, fontSize: 11 }}>{c.total_visitas} visitas</span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p
                onClick={() => setDetalhe(c)}
                style={{ color: S.gold, fontWeight: 800, fontSize: 18, margin: 0, cursor: 'pointer' }}
              >
                {(c.pontos_total || 0).toLocaleString('pt-BR')}
              </p>
              <p style={{ color: S.muted, fontSize: 10, margin: 0 }}>pontos · ver detalhes</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MENU ────────────────────────────────────────────────────────────────────
const MENU = [
  { key: 'premios',       label: 'Prêmios Pendentes',  icon: '🎁' },
  { key: 'sync',          label: 'Sincronização',       icon: '🔄' },
  { key: 'busca',         label: 'Buscar Cliente',      icon: '🔍' },
  { key: 'aniversario',   label: 'Aniversariantes',     icon: '🎂' },
  { key: 'rankings',      label: 'Rankings',            icon: '🏆' },
  { key: 'gatilhos',      label: 'Gatilhos de Prêmio',  icon: '⚙️' },
  { key: 'pontos',        label: 'Programa de Pontos',  icon: '⭐' },
];

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
const FidelidadeModule: React.FC = () => {
  const [secao, setSecao]           = useState('premios');
  const [totalPremios, setTotalPremios] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('fidelidade_clientes')
      .select('id', { count: 'exact', head: true })
      .eq('premio_pendente', true)
      .then(({ count }) => setTotalPremios(count ?? 0));
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)', background: S.bg, fontFamily: 'Inter, sans-serif', margin: '-24px', marginTop: '-24px' }}>

      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0, background: S.card,
        borderRight: `1px solid ${S.border}`, padding: '24px 12px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <p style={{ color: S.gold, fontWeight: 800, fontSize: 13, margin: '0 8px 16px', letterSpacing: 1 }}>
          FIDELIDADE
        </p>
        {MENU.map(m => (
          <button key={m.key} onClick={() => setSecao(m.key)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8, border: 'none',
            background: secao === m.key ? `${S.gold}22` : 'transparent',
            color: secao === m.key ? S.gold : S.muted,
            fontWeight: secao === m.key ? 700 : 400,
            fontSize: 13, cursor: 'pointer', textAlign: 'left', width: '100%',
            transition: 'all .15s', position: 'relative',
          }}>
            <span style={{ fontSize: 16 }}>{m.icon}</span>
            {m.label}
            {/* Badge de contagem nos prêmios */}
            {m.key === 'premios' && totalPremios !== null && totalPremios > 0 && (
              <span style={{
                marginLeft: 'auto', background: S.wine, color: '#fff',
                borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
              }}>{totalPremios}</span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, padding: 28, overflowY: 'auto' }}>
        <p style={{ color: S.text, fontWeight: 800, fontSize: 20, margin: '0 0 20px' }}>
          {MENU.find(m => m.key === secao)?.icon} {MENU.find(m => m.key === secao)?.label}
        </p>
        {secao === 'premios'     && <SecaoPremios />}
        {secao === 'sync'        && <SecaoSync />}
        {secao === 'busca'       && <SecaoBusca />}
        {secao === 'aniversario' && <SecaoAniversariantes />}
        {secao === 'rankings'    && <SecaoRankings />}
        {secao === 'gatilhos'    && <SecaoGatilhos />}
        {secao === 'pontos'      && <SecaoPontos />}
      </div>
    </div>
  );
};

export default FidelidadeModule;
