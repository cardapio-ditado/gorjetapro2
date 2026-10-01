import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, PageHeader, SectionCard } from '../ui';
import { contagemApi, fmt, type AprovacoesTela } from './api';
import { brl } from './cadastros/api';

interface Props { onVoltar: () => void }

/** Fila de diferenças das auditorias. Cristiano ou Kadu aprovam (tudo, ou mantendo o sistema em alguns itens) ou rejeitam. */
const Aprovacoes: React.FC<Props> = ({ onVoltar }) => {
  const [tela, setTela] = useState<AprovacoesTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [manter, setManter] = useState<Record<string, Set<string>>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await contagemApi.aprovacoes()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const alternar = (id: string, linha: string) => setManter(p => { const s = new Set(p[id] || []); if (s.has(linha)) s.delete(linha); else s.add(linha); return { ...p, [id]: s }; });

  const decidir = async (id: string, acao: 'aprovar' | 'rejeitar', estoque: string) => {
    const mantidos = [...(manter[id] || [])];
    const motivo = acao === 'rejeitar' ? window.prompt(`Rejeitar a auditoria de ${estoque}? O saldo não muda e o setor pode contar de novo. Motivo (opcional):`) : null;
    if (acao === 'rejeitar' && motivo === null) return;
    if (acao === 'aprovar' && !window.confirm(`Aprovar a auditoria de ${estoque}?${mantidos.length ? ` ${mantidos.length} item(ns) ficam com o saldo do sistema.` : ''} Os demais acertam o saldo agora.`)) return;
    setOcupado(id); setErro(null);
    try {
      const r = await contagemApi.decidir(id, acao, mantidos, motivo || null);
      setAviso(acao === 'aprovar' ? `${estoque}: aprovada, ${r.acertos ?? 0} acerto(s) no saldo${r.mantidos ? `, ${r.mantidos} mantido(s)` : ''}.` : `${estoque}: auditoria rejeitada.`);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Contagem']} title="Aprovar diferenças" subtitle={tela ? `Quem aprova: ${tela.aprovadores.join(' e ') || 'ninguém definido'}. Até aprovar, o saldo não muda.` : ' '}
        actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {tela && !tela.posso_aprovar && <div className="aviso aviso-atencao mb-3">Você pode ver a fila, mas só {tela.aprovadores.join(' ou ')} decide.</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {tela && tela.pendentes.length === 0 && <EmptyState icon={ShieldCheck} title="Nada para aprovar" description="As auditorias com diferença aparecem aqui." />}

      <div className="flex flex-col gap-4">
        {tela?.pendentes.map(p => {
          const sel = manter[p.id] || new Set<string>();
          const total = p.itens.reduce((s, i) => s + (sel.has(i.linha_id) ? 0 : i.valor), 0);
          return (
            <SectionCard key={p.id} title={p.estoque} descricao={`${p.responsavel} · ${new Date(p.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${p.contados} contados, ${p.itens.length} com diferença`} noPadding
              action={tela.posso_aprovar ? <div className="flex gap-2">
                <Button tamanho="sm" variante="discreto" icone={<X size={14} />} onClick={() => decidir(p.id, 'rejeitar', p.estoque)} disabled={!!ocupado}>Rejeitar</Button>
                <Button tamanho="sm" variante="primario" icone={<Check size={14} />} onClick={() => decidir(p.id, 'aprovar', p.estoque)} carregando={ocupado === p.id}>Aprovar</Button>
              </div> : undefined}>
              {p.itens.map(i => {
                const mantido = sel.has(i.linha_id);
                return (
                  <div key={i.linha_id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: mantido ? 0.55 : 1 }}>
                    <div className="flex-1 min-w-[200px]">
                      <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                      <p className="t-caption" style={{ margin: 0 }}>sistema {fmt(i.sistema)} · contado {fmt(i.contada)} {i.um}</p>
                    </div>
                    <Badge variant={i.diferenca < 0 ? 'danger' : 'warning'}>{i.diferenca > 0 ? '+' : ''}{fmt(i.diferenca)} · {brl(i.valor)}</Badge>
                    {tela.posso_aprovar && <label className="flex items-center gap-2 t-caption whitespace-nowrap"><input type="checkbox" checked={mantido} onChange={() => alternar(p.id, i.linha_id)} /> manter sistema</label>}
                  </div>
                );
              })}
              <div className="px-5 py-3 flex items-center justify-between"><span className="t-caption">impacto no saldo se aprovar</span><span className="t-subsec" style={{ margin: 0 }}>{brl(total)}</span></div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
};

export default Aprovacoes;
