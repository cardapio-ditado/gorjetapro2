import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, EmptyState, IconButton, KPICard, SectionCard } from '../ui';
import { brl } from '../livro/shared';

/**
 * Vendas da noite em andamento, direto da ZIG (função zig-noite-ao-vivo).
 * A ZIG manda os horários em UTC; a função devolve instantes com "Z" e aqui
 * tudo é mostrado no horário de Cuiabá.
 */
interface Garcom { nome: string; valor: number; gorjeta: number; itens: number; pedidos: number; ultima: string | null }
interface Vivo {
  noite: string;
  atualizado_em: string | null;
  total: number; gorjeta: number; itens: number; pedidos: number;
  por_categoria: { categoria: string; valor: number }[];
  por_bar: { bar: string; valor: number }[];
  por_hora: { hora: string; valor: number }[];
  garcons: Garcom[];
  top_produtos: { nome: string; valor: number; qtd: number }[];
}

const FUSO = 'America/Cuiaba';
const hhmm = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) : '—';

const haQuanto = (iso: string | null | undefined, agora: number) => {
  if (!iso) return '—';
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

/** "Joel de Souza Batista" vira "Joel Batista". */
const nomeCurto = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : n;
};

const REFRESCAR_MS = 60_000;

const VendasAoVivo: React.FC = () => {
  const [d, setD] = useState<Vivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => Date.now());
  const [buscouEm, setBuscouEm] = useState<number | null>(null);
  const emVoo = useRef(false);

  const buscar = useCallback(async () => {
    if (emVoo.current) return;
    emVoo.current = true;
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('zig-noite-ao-vivo', { body: {} });
      if (error || !data?.ok) throw new Error(data?.error || 'sem resposta');
      setD(data as Vivo);
      setErro(null);
      setBuscouEm(Date.now());
    } catch {
      setErro('Não consegui falar com a ZIG agora. Mostrando a última leitura.');
    } finally {
      emVoo.current = false;
      setCarregando(false);
      setAgora(Date.now());
    }
  }, []);

  useEffect(() => {
    buscar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') buscar(); }, REFRESCAR_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    const voltou = () => { if (document.visibilityState === 'visible') buscar(); };
    document.addEventListener('visibilitychange', voltou);
    return () => { clearInterval(t); clearInterval(relogio); document.removeEventListener('visibilitychange', voltou); };
  }, [buscar]);

  const maxGarcom = Math.max(1, ...(d?.garcons.map(g => g.valor) ?? [1]));
  // Madrugada vem depois da noite: 00h–05h contam como 24h–29h para ordenar.
  const horas = [...(d?.por_hora ?? [])].sort((a, b) => (Number(a.hora) < 6 ? Number(a.hora) + 24 : Number(a.hora)) - (Number(b.hora) < 6 ? Number(b.hora) + 24 : Number(b.hora)));
  const maxHora = Math.max(1, ...horas.map(h => h.valor));
  const parada = d?.atualizado_em ? (agora - new Date(d.atualizado_em).getTime()) / 60000 > 30 : false;

  return (
    <SectionCard
      title="Vendas da noite · ao vivo"
      descricao={buscouEm ? `Atualiza sozinho a cada minuto · lido às ${hhmm(new Date(buscouEm).toISOString())}` : 'Direto da ZIG'}
      action={<IconButton aria-label="Atualizar vendas" onClick={() => buscar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>}
    >
      {erro && <p className="t-caption" style={{ margin: '0 0 12px', color: 'var(--warning)' }}>{erro}</p>}

      {!d ? (
        carregando ? <p className="t-caption" style={{ margin: 0 }}>Buscando as vendas…</p>
          : <EmptyState title="Sem leitura ainda" description="Toque em atualizar para tentar de novo." compact />
      ) : d.pedidos === 0 ? (
        <EmptyState title="Ainda sem vendas nesta noite" description="Assim que a ZIG registrar a primeira venda, ela aparece aqui." compact />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KPICard rotulo="vendido até agora" valor={brl(d.total)} detalhe="sem a taxa de serviço" tom="destaque" />
            <KPICard rotulo="pedidos" valor={d.pedidos} detalhe={`${d.itens} itens`} />
            <KPICard rotulo="taxa de serviço" valor={brl(d.gorjeta)} detalhe="gorjeta da noite" />
            <KPICard rotulo="última venda" valor={hhmm(d.atualizado_em)} detalhe={haQuanto(d.atualizado_em, agora)} tom={parada ? 'atencao' : 'certo'} />
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="t-body" style={{ margin: 0, fontWeight: 600 }}>Por garçom</h3>
            <span className="t-caption">{d.garcons.length} {d.garcons.length === 1 ? 'pessoa' : 'pessoas'}</span>
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
            {d.garcons.map((g, i) => (
              <div key={g.nome} className="px-3 py-2" style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-body" style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeCurto(g.nome)}</span>
                  <span className="t-body" style={{ fontWeight: 700, color: 'var(--gold-light)' }}>{brl(g.valor)}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border-subtle)', margin: '6px 0' }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${Math.max(2, (g.valor / maxGarcom) * 100)}%`, background: 'var(--gold)' }} />
                </div>
                <div className="t-caption flex flex-wrap gap-x-3">
                  <span>{g.pedidos} pedido{g.pedidos === 1 ? '' : 's'}</span>
                  <span>{g.itens} iten{g.itens === 1 ? '' : 's'}</span>
                  {g.pedidos > 0 && <span>ticket {brl(g.valor / g.pedidos)}</span>}
                  <span>última {haQuanto(g.ultima, agora)}</span>
                  {g.gorjeta > 0 && <span>taxa {brl(g.gorjeta)}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <h3 className="t-body" style={{ margin: '0 0 8px', fontWeight: 600 }}>Por categoria</h3>
              <div className="flex flex-wrap gap-2">
                {d.por_categoria.map(c => <Badge key={c.categoria} variant="neutral">{c.categoria} · {brl(c.valor)}</Badge>)}
              </div>
              {d.por_bar.length > 1 && (
                <>
                  <h3 className="t-body" style={{ margin: '16px 0 8px', fontWeight: 600 }}>Por bar</h3>
                  <div className="flex flex-wrap gap-2">
                    {d.por_bar.map(b => <Badge key={b.bar} variant="info">{b.bar} · {brl(b.valor)}</Badge>)}
                  </div>
                </>
              )}
              <h3 className="t-body" style={{ margin: '16px 0 8px', fontWeight: 600 }}>Mais vendidos</h3>
              {d.top_produtos.map(p => (
                <div key={p.nome} className="flex justify-between gap-3 t-caption py-1">
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.qtd}× {p.nome}</span>
                  <span>{brl(p.valor)}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="t-body" style={{ margin: '0 0 8px', fontWeight: 600 }}>Por hora</h3>
              {horas.map(h => (
                <div key={h.hora} className="flex items-center gap-2 py-0.5">
                  <span className="t-caption" style={{ width: 34 }}>{h.hora}h</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border-subtle)' }}>
                    <div style={{ height: 8, borderRadius: 4, width: `${Math.max(2, (h.valor / maxHora) * 100)}%`, background: 'var(--wine)' }} />
                  </div>
                  <span className="t-caption" style={{ width: 84, textAlign: 'right' }}>{brl(h.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
};

export default VendasAoVivo;
