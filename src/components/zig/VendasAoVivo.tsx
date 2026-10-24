import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, EmptyState, IconButton, KPICard, SectionCard } from '../ui';
import { brl, noiteAgora } from '../livro/shared';
import { hhmm, haQuanto, nomeCurto, useVendasAoVivo, type Vivo } from './useVendasAoVivo';

interface Salva { resumo: Vivo; final: boolean; atualizado_em: string }

/**
 * Vendas da noite. Na noite em andamento (ou no dia de hoje) lê ao vivo da ZIG;
 * numa data passada mostra o resumo salvo em zig_noites.
 */
const VendasAoVivo: React.FC<{ data?: string }> = ({ data }) => {
  const aoVivo = !data || data === noiteAgora() || data === new Date().toLocaleDateString('sv-SE');
  const vivo = useVendasAoVivo(aoVivo);
  const [salva, setSalva] = useState<Salva | null | undefined>(undefined);

  useEffect(() => {
    if (aoVivo) return;
    let vale = true;
    setSalva(undefined);
    supabase.from('zig_noites').select('resumo, final, atualizado_em').eq('data', data).maybeSingle()
      .then(({ data: r }) => { if (vale) setSalva((r as Salva) ?? null); });
    return () => { vale = false; };
  }, [aoVivo, data]);

  const d: Vivo | null = aoVivo ? vivo.d : salva?.resumo ?? null;
  const { erro, agora, buscouEm, buscar } = vivo;
  const carregando = aoVivo ? vivo.carregando : salva === undefined;

  const maxGarcom = Math.max(1, ...(d?.garcons.map(g => g.consumo) ?? [1]));
  // Madrugada vem depois da noite: 00h–05h contam como 24h–29h para ordenar.
  const horas = [...(d?.por_hora ?? [])].sort((a, b) => (Number(a.hora) < 6 ? Number(a.hora) + 24 : Number(a.hora)) - (Number(b.hora) < 6 ? Number(b.hora) + 24 : Number(b.hora)));
  const maxHora = Math.max(1, ...horas.map(h => h.valor));
  const parada = aoVivo && d?.atualizado_em ? (agora - new Date(d.atualizado_em).getTime()) / 60000 > 30 : false;
  const c = d?.clientes;

  return (
    <SectionCard
      title={aoVivo ? 'Vendas da noite · ao vivo' : `Vendas da noite · ${dayjs(data).format('DD/MM')}`}
      descricao={aoVivo
        ? (buscouEm ? `Atualiza sozinho a cada minuto · lido às ${hhmm(new Date(buscouEm).toISOString())}` : 'Direto da ZIG')
        : salva ? (salva.final ? 'Noite fechada · resumo salvo pela manhã' : `Parcial · última leitura salva às ${hhmm(salva.atualizado_em)}`) : 'Resumo salvo da noite'}
      action={aoVivo ? <IconButton aria-label="Atualizar vendas" onClick={() => buscar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton> : undefined}
    >
      {aoVivo && erro && <p className="t-caption" style={{ margin: '0 0 12px', color: 'var(--warning)' }}>{erro}</p>}

      {!d ? (
        carregando ? <p className="t-caption" style={{ margin: 0 }}>Buscando as vendas…</p>
          : aoVivo ? <EmptyState icon={WifiOff} title="Sem leitura ainda" description="Toque em atualizar para tentar de novo." compact />
          : <EmptyState icon={Inbox} title="Nada salvo desta noite" description="As noites ficam salvas a partir de 23/10/2026." compact />
      ) : d.pedidos === 0 ? (
        <EmptyState icon={Inbox} title="Ainda sem vendas nesta noite" description="Assim que a ZIG registrar a primeira venda, ela aparece aqui." compact />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KPICard rotulo={aoVivo ? 'vendido até agora' : 'vendido na noite'} valor={brl(d.total)} detalhe={d.couvert > 0 ? `consumo ${brl(d.consumo)} + couvert ${brl(d.couvert)}` : 'sem a taxa de serviço'} tom="destaque" />
            <KPICard rotulo="pedidos" valor={d.pedidos} detalhe={`${d.itens} itens`} />
            {aoVivo
              ? <KPICard rotulo="taxa de serviço prevista" valor={brl(d.taxa_prevista)} detalhe={`das contas da noite · já paga: ${brl(d.taxa_fechada)}`} />
              : <KPICard rotulo="taxa de serviço" valor={brl(d.taxa_prevista)} detalhe={`paga: ${brl(d.taxa_fechada)}`} />}
            {aoVivo
              ? <KPICard rotulo="última venda" valor={hhmm(d.atualizado_em)} detalhe={haQuanto(d.atualizado_em, agora)} tom={parada ? 'atencao' : 'certo'} />
              : <KPICard rotulo="última venda" valor={hhmm(d.atualizado_em)} detalhe="fechamento da noite" />}
          </div>

          {c && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <KPICard rotulo="clientes que vieram" valor={c.vieram} detalhe={c.sem_consumo ? `${c.sem_consumo} sem consumo próprio` : 'com consumo ou couvert'} />
              {aoVivo ? <>
                <KPICard rotulo="ainda na casa" valor={c.ainda} detalhe="com conta em aberto" tom="certo" />
                <KPICard rotulo="já foram" valor={c.foram} detalhe="conta paga" />
              </> : <>
                <KPICard rotulo="consumiram" valor={c.vieram - (c.sem_consumo ?? 0)} detalhe="com conta própria" />
                <KPICard rotulo="sem consumo próprio" valor={c.sem_consumo ?? 0} detalhe="acompanhantes, entrada" />
              </>}
              <KPICard rotulo="ticket médio" valor={brl(c.ticket_medio)} detalhe={c.ticket_consumidor ? `por pessoa · ${brl(c.ticket_consumidor)} por quem consumiu` : 'por cliente'} />
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <h3 className="t-body" style={{ margin: 0, fontWeight: 600 }}>Por garçom</h3>
            <span className="t-caption">{d.garcons.length} {d.garcons.length === 1 ? 'pessoa' : 'pessoas'}</span>
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
            {d.garcons.map((g, i) => (
              <div key={g.nome} className="px-3 py-2" style={{ borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-body" style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeCurto(g.nome)}</span>
                  <span className="t-body" style={{ fontWeight: 700, color: 'var(--gold-light)' }}>{brl(g.consumo || g.couvert)}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border-subtle)', margin: '6px 0' }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${Math.max(2, (g.consumo / maxGarcom) * 100)}%`, background: 'var(--gold)' }} />
                </div>
                <div className="t-caption flex flex-wrap gap-x-3">
                  {g.consumo > 0 ? <>
                    <span>{g.pedidos} pedido{g.pedidos === 1 ? '' : 's'}</span>
                    <span>{g.itens} iten{g.itens === 1 ? '' : 's'}</span>
                    {g.pedidos > 0 && <span>ticket {brl(g.consumo / g.pedidos)}</span>}
                    <span>taxa prevista {brl(g.taxa_prevista)}</span>
                  </> : <span>só couvert</span>}
                  {g.consumo > 0 && g.couvert > 0 && <span>+ couvert {brl(g.couvert)}</span>}
                  <span>{aoVivo ? `última ${haQuanto(g.ultima, agora)}` : `última às ${hhmm(g.ultima)}`}</span>
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
