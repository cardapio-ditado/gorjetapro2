import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Receipt, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import { Badge, Button, Chip, EmptyState, IconButton, KPICard } from '../ui';
import type { BadgeVariante } from '../ui/Badge';

dayjs.locale('pt-br');

/**
 * Aba "Pagamentos" dos módulos de Extras e de Músicos (Kadu, 22/11/2026): o extrato das
 * baixas que o Cristiano dá no módulo, mês a mês, com a conferência de cada pagamento no
 * financeiro (a conta da diária/do show) e no banco (o Pix no extrato). Só leitura.
 * Um Pix que pagou várias diárias (lote) é uma linha só, que abre e mostra as diárias.
 * Os "saldos iniciais" da implantação ficam fora (fn_extrato_pagamentos).
 */

interface Linha {
  id: string; grupo: string; data_pagamento: string; valor: number; valor_grupo: number | null; forma: string | null; observacao: string | null;
  lancado_por: string | null; lancado_em: string; estornado_em: string | null; estornado_por: string | null; motivo_estorno: string | null;
  quem: string; quem_pix: string | null; ref_data: string | null; ref_texto: string; ref_valor: number | null;
  fin_status: string | null; fin_saldo: number | null;
  banco: 'achado' | 'nao_achado' | 'sem_extrato' | 'nao_se_aplica' | 'estornado'; banco_data: string | null; banco_valor: number | null; banco_nome: string | null;
}
interface Grupo { chave: string; itens: Linha[]; data: string; quem: string; valor: number; estornado: boolean; banco: Linha['banco']; banco_data: string | null; banco_nome: string | null }

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

const BANCO: Record<Linha['banco'], { rotulo: string; variante: BadgeVariante; dica: string }> = {
  achado: { rotulo: 'Pix no banco', variante: 'success', dica: 'Achei no extrato do banco um Pix desse valor, para essa pessoa, até 3 dias antes ou depois.' },
  nao_achado: { rotulo: 'Pix não achado', variante: 'warning', dica: 'Não achei no extrato do banco um Pix desse valor para essa pessoa, até 3 dias antes ou depois. Conferir.' },
  sem_extrato: { rotulo: 'Fora do extrato', variante: 'neutral', dica: 'O extrato do banco no sistema ainda não cobre essa data (antes do início ou depois da última importação).' },
  nao_se_aplica: { rotulo: 'Não é Pix', variante: 'neutral', dica: 'Pago em dinheiro, salário ou outra forma: não aparece no extrato.' },
  estornado: { rotulo: 'Estornado', variante: 'danger', dica: 'Pagamento desfeito no módulo.' },
};
const FIN: Record<string, { rotulo: string; variante: BadgeVariante }> = {
  pago: { rotulo: 'Pago', variante: 'success' },
  parcialmente_pago: { rotulo: 'Parcial', variante: 'warning' },
  em_aberto: { rotulo: 'Em aberto', variante: 'warning' },
  vencido: { rotulo: 'Vencido', variante: 'danger' },
};
const finDe = (s: string | null) => (s ? FIN[s] ?? { rotulo: s, variante: 'neutral' as BadgeVariante } : { rotulo: 'Sem conta', variante: 'neutral' as BadgeVariante });

type Filtro = 'todos' | 'conferir' | 'estornados';

export const ExtratoPagamentos: React.FC<{ modulo: 'extras' | 'musicos' }> = ({ modulo }) => {
  const [mes, setMes] = useState(() => dayjs().startOf('month'));
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setLinhas(null); setErro(null);
    supabase.rpc('fn_extrato_pagamentos', { p_modulo: modulo, p_de: mes.format('YYYY-MM-DD'), p_ate: mes.endOf('month').format('YYYY-MM-DD') })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setErro(error.message.includes('sem acesso') ? 'Seu usuário não tem acesso a este módulo.' : 'Não consegui carregar os pagamentos.'); setLinhas([]); return; }
        setLinhas((data ?? []) as Linha[]);
      });
    return () => { vivo = false; };
  }, [modulo, mes]);

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>();
    for (const l of linhas ?? []) {
      const g = m.get(l.grupo) ?? { chave: l.grupo, itens: [], data: l.data_pagamento, quem: l.quem, valor: 0, estornado: true, banco: l.banco, banco_data: l.banco_data, banco_nome: l.banco_nome };
      g.itens.push(l);
      if (!l.estornado_em) { g.valor += Number(l.valor); g.estornado = false; }
      m.set(l.grupo, g);
    }
    // Grupo inteiro estornado mostra o valor que foi lançado (riscado).
    for (const g of m.values()) if (g.estornado) g.valor = g.itens.reduce((s, l) => s + Number(l.valor), 0);
    return [...m.values()];
  }, [linhas]);

  const termo = busca.trim().toLowerCase();
  const visiveis = grupos.filter((g) => {
    if (filtro === 'estornados' && !g.estornado) return false;
    if (filtro === 'conferir' && (g.estornado || g.banco !== 'nao_achado')) return false;
    if (!termo) return true;
    return `${g.quem} ${g.itens[0].quem_pix ?? ''} ${g.itens.map((l) => l.ref_texto).join(' ')} ${g.itens[0].lancado_por ?? ''}`.toLowerCase().includes(termo);
  });

  const validos = grupos.filter((g) => !g.estornado);
  const total = validos.reduce((s, g) => s + g.valor, 0);
  const pessoas = new Set(validos.map((g) => g.quem.toLowerCase())).size;
  const conferir = validos.filter((g) => g.banco === 'nao_achado');
  const estornados = grupos.filter((g) => g.estornado);
  const nomeRef = modulo === 'extras' ? 'diária' : 'show';

  const exportar = () => {
    exportToExcel((linhas ?? []).map((l) => [
      dayjs(l.data_pagamento).format('DD/MM/YYYY'), l.quem, l.quem_pix ?? '', l.ref_texto, Number(l.valor), l.forma ?? '',
      l.lancado_por ?? '', dayjs(l.lancado_em).format('DD/MM/YYYY HH:mm'),
      l.estornado_em ? `Estornado ${dayjs(l.estornado_em).format('DD/MM')}${l.motivo_estorno ? ` (${l.motivo_estorno})` : ''}` : '',
      finDe(l.fin_status).rotulo, BANCO[l.banco].rotulo, l.banco_nome ?? '',
    ]), `pagamentos-${modulo}-${mes.format('YYYY-MM')}`,
    ['Data', modulo === 'extras' ? 'Pessoa' : 'Artista', 'Recebe o Pix', 'Referente a', 'Valor', 'Forma', 'Lançou', 'Lançado em', 'Estorno', 'Financeiro', 'Banco', 'Pix para (banco)']);
  };

  const cel: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', fontSize: 14 };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <IconButton aria-label="Mês anterior" onClick={() => setMes(mes.subtract(1, 'month'))}><ChevronLeft size={16} /></IconButton>
        <span className="t-subsec" style={{ minWidth: 170, textAlign: 'center' }}>{capital(mes.format('MMMM [de] YYYY'))}</span>
        <IconButton aria-label="Próximo mês" onClick={() => setMes(mes.add(1, 'month'))}><ChevronRight size={16} /></IconButton>
        <Button tamanho="sm" variante="discreto" onClick={() => setMes(dayjs().startOf('month'))}>Mês atual</Button>
        <div className="flex-1" />
        <Button tamanho="sm" icone={<Download size={14} />} onClick={exportar} disabled={!linhas?.length}>Excel</Button>
      </div>

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <KPICard rotulo="pago no mês" valor={brl(total)} detalhe={`${validos.length} pagamento(s)`} />
        <KPICard rotulo={modulo === 'extras' ? 'pessoas pagas' : 'artistas pagos'} valor={pessoas} />
        <KPICard rotulo="Pix não achado no banco" valor={conferir.length} detalhe={conferir.length ? brl(conferir.reduce((s, g) => s + g.valor, 0)) : 'nenhum'}
          tom={conferir.length ? 'atencao' : 'certo'} onClick={conferir.length ? () => setFiltro('conferir') : undefined} />
        <KPICard rotulo="estornados" valor={estornados.length} tom={estornados.length ? 'alerta' : 'normal'}
          onClick={estornados.length ? () => setFiltro('estornados') : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip ligado={filtro === 'todos'} onMudar={() => setFiltro('todos')}>Todos {grupos.length}</Chip>
        <Chip ligado={filtro === 'conferir'} onMudar={() => setFiltro('conferir')} tom="atencao">Conferir {conferir.length}</Chip>
        <Chip ligado={filtro === 'estornados'} onMudar={() => setFiltro('estornados')} tom="perigo">Estornados {estornados.length}</Chip>
        <div className="flex-1" />
        <div className="relative" style={{ minWidth: 220 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder={modulo === 'extras' ? 'Buscar pessoa' : 'Buscar artista'}
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}

      {linhas === null ? (
        <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
      ) : visiveis.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhum pagamento" variant={filtro !== 'todos' || termo ? 'filtered' : 'empty'}
          description={`Não há pagamentos de ${modulo === 'extras' ? 'extras' : 'músicos'} lançados neste mês${filtro !== 'todos' || termo ? ' com esse filtro' : ''}.`} />
      ) : (
        <div className="card-dark" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={cel}>Data</th><th style={cel}>{modulo === 'extras' ? 'Pessoa' : 'Artista'}</th><th style={cel}>Referente a</th>
                <th style={{ ...cel, textAlign: 'right' }}>Valor</th><th style={cel}>Lançado por</th><th style={cel}>Financeiro</th><th style={cel}>Banco</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => {
                const l0 = g.itens[0];
                const varios = g.itens.length > 1;
                const abrir = aberto === g.chave;
                const fins = [...new Set(g.itens.map((l) => l.fin_status ?? ''))];
                const risco: React.CSSProperties = g.estornado ? { textDecoration: 'line-through', opacity: 0.6 } : {};
                return (
                  <React.Fragment key={g.chave}>
                    <tr onClick={varios ? () => setAberto(abrir ? null : g.chave) : undefined} style={{ cursor: varios ? 'pointer' : undefined }}>
                      <td style={{ ...cel, whiteSpace: 'nowrap', fontWeight: 600 }}>{dayjs(g.data).format('DD/MM')}</td>
                      <td style={cel}>
                        <div style={{ fontWeight: 600, ...risco }}>{g.quem}</div>
                        {l0.quem_pix && l0.quem_pix.trim().toLowerCase() !== g.quem.trim().toLowerCase() && (
                          <div className="t-caption">Pix para {l0.quem_pix.trim()}</div>
                        )}
                      </td>
                      <td style={cel}>
                        {varios ? (
                          <span className="inline-flex items-center gap-1" style={{ fontWeight: 600 }}>
                            {g.itens.length} {nomeRef === 'diária' ? 'diárias' : 'shows'} <ChevronDown size={14} style={{ transform: abrir ? 'rotate(180deg)' : undefined }} />
                          </span>
                        ) : (
                          <span style={risco}>{l0.ref_texto}{l0.ref_valor != null && Number(l0.ref_valor) !== Number(l0.valor) ? <span className="t-caption"> (total {brl(Number(l0.ref_valor))})</span> : null}</span>
                        )}
                        {l0.observacao && <div className="t-caption">{l0.observacao}</div>}
                      </td>
                      <td style={{ ...cel, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={risco}>{brl(g.valor)}</span>
                        <div className="t-caption" style={{ fontWeight: 400 }}>{l0.forma ?? '—'}</div>
                      </td>
                      <td style={cel}>
                        <div>{l0.lancado_por ?? '—'}</div>
                        <div className="t-caption">em {dayjs(l0.lancado_em).format('DD/MM HH:mm')}</div>
                        {g.estornado && l0.estornado_em && (
                          <div className="t-caption" style={{ color: 'var(--danger)' }}>
                            Estornado {dayjs(l0.estornado_em).format('DD/MM')}{l0.estornado_por ? ` por ${l0.estornado_por}` : ''}{l0.motivo_estorno ? `: ${l0.motivo_estorno}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={cel}>
                        <div className="flex flex-wrap gap-1">{fins.map((f) => <Badge key={f} variante={finDe(f || null).variante}>{finDe(f || null).rotulo}</Badge>)}</div>
                      </td>
                      <td style={cel} title={BANCO[g.banco].dica}>
                        <Badge variante={BANCO[g.banco].variante}>{BANCO[g.banco].rotulo}</Badge>
                        {g.banco === 'achado' && g.banco_data && <div className="t-caption">Pix em {dayjs(g.banco_data).format('DD/MM')}{g.banco_nome ? ` para ${g.banco_nome}` : ''}</div>}
                      </td>
                    </tr>
                    {varios && abrir && g.itens.map((l) => (
                      <tr key={l.id} style={{ background: 'var(--bg-hover, rgba(0,0,0,0.03))' }}>
                        <td style={cel} />
                        <td style={cel} />
                        <td style={cel}><span style={l.estornado_em ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{l.ref_texto}</span></td>
                        <td style={{ ...cel, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{brl(Number(l.valor))}</td>
                        <td style={cel} />
                        <td style={cel}><Badge variante={finDe(l.fin_status).variante}>{finDe(l.fin_status).rotulo}</Badge></td>
                        <td style={cel} />
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="t-caption mt-3">
        Pagamentos informados no módulo ({modulo === 'extras' ? 'Extras' : 'Músicos'}), sem os saldos iniciais da implantação. "Financeiro" é a situação da conta
        da {nomeRef} no Contas a Pagar; "Banco" procura o Pix no extrato importado (mesmo valor, nome parecido, até 3 dias de diferença).
      </p>
    </div>
  );
};

export default ExtratoPagamentos;
