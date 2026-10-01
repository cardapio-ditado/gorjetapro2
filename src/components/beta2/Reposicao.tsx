import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, Truck } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, PageHeader, Segmented } from '../ui';
import { fmt, reposicaoApi, type ReporSetor, type ReporTela } from './api';

interface Props { responsavel: string | null; onVoltar: () => void }

/**
 * Repor os setores: a lista do dia de cada setor (nível − saldo, depois da
 * Zig). O estoquista ajusta o que vai mandar e manda; a transferência do
 * Central sai num toque e fica registrada como requisição concluída.
 */
const Reposicao: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [tela, setTela] = useState<ReporTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [setorId, setSetorId] = useState<string>('');
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [mandando, setMandando] = useState(false);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try {
      const t = await reposicaoApi.tela();
      setTela(t); setQtd({});
      setSetorId(s => (s && t.setores.some(x => x.id === s) ? s : (t.setores.find(x => x.itens.length > 0)?.id ?? t.setores[0]?.id ?? '')));
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const setor: ReporSetor | undefined = tela?.setores.find(s => s.id === setorId);
  const valor = (itemId: string, sugestao: number) => (qtd[itemId] ?? String(sugestao));
  const num = (s: string) => Number((s || '').replace(',', '.')) || 0;
  const pedidos = useMemo(() => (setor?.itens || []).map(i => ({ item_id: i.item_id, quantidade: num(valor(i.item_id, i.sugestao)) })).filter(p => p.quantidade > 0), [setor, qtd]);  // eslint-disable-line react-hooks/exhaustive-deps
  const grupos = useMemo(() => {
    const m = new Map<string, ReporSetor['itens']>();
    for (const i of setor?.itens || []) { const k = i.categoria || 'Sem categoria'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i); }
    return [...m.entries()];
  }, [setor]);
  const semCentral = (setor?.itens || []).filter(i => i.central < num(valor(i.item_id, i.sugestao))).length;

  const mandar = async () => {
    if (!setor || pedidos.length === 0) return;
    if (!window.confirm(`Mandar ${pedidos.length} item(ns) do Central para ${setor.nome}?${semCentral ? ` ${semCentral} item(ns) o Central não cobre: vai o que tem.` : ''}`)) return;
    setMandando(true); setErro(null); setAviso(null);
    try {
      const r = await reposicaoApi.mandar(setor.id, pedidos, responsavel);
      setAviso(`${r.setor}: ${r.itens} item(ns) mandados, ${r.movimentacoes} transferência(s).${r.faltou.length ? ` O Central não cobriu tudo: ${r.faltou.join('; ')}.` : ''}`);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao mandar'); }
    finally { setMandando(false); }
  };

  const zig = tela?.zig;
  const zigHora = zig?.finalizado_em ? new Date(zig.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="max-w-5xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Repor os setores" subtitle="O que falta em cada setor até o nível. Ajuste e mande; sai do Central na hora."
        actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />

      {zig && (
        <div className={`aviso mb-3 ${zig.de_hoje && zig.status === 'sucesso' ? 'aviso-certo' : 'aviso-atencao'}`}>
          {zig.de_hoje && zig.status === 'sucesso' ? `Zig de hoje baixada às ${zigHora}. A lista já considera as vendas de ontem.` : `A Zig de hoje ainda não baixou (última: ${zigHora ?? 'nenhuma'}). A lista pode mudar depois das 06:00.`}
          {zig.nao_mapeados > 0 && ` ${zig.nao_mapeados} venda(s) sem vínculo.`}
        </div>
      )}
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      {tela && (
        <div className="mb-4">
          <Segmented rotulo="Setor" valor={setorId} onMudar={v => { setSetorId(v); setQtd({}); }} opcoes={tela.setores.map(s => ({ valor: s.id, rotulo: `${s.nome}${s.itens.length ? ` (${s.itens.length})` : ''}` }))} />
        </div>
      )}
      {carregando && !tela && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Calculando o que falta…</p>}

      {setor && setor.itens.length === 0 && (
        <EmptyState icon={Truck} title={`${setor.nome} está no nível`} description={setor.configurados ? `Nada a repor agora.${setor.ultima_entrega ? ` Última reposição ${new Date(setor.ultima_entrega.quando).toLocaleDateString('pt-BR')}.` : ''}` : 'Este setor ainda não tem itens configurados. Configure em Configurar setores.'} />
      )}

      {setor && setor.itens.length > 0 && (
        <div className="flex flex-col gap-3">
          {grupos.map(([cat, itens]) => (
            <section key={cat} className="card">
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="t-subsec" style={{ margin: 0 }}>{cat}</h2>
                <span className="t-caption">{itens.length}</span>
              </div>
              {itens.map(i => {
                const v = valor(i.item_id, i.sugestao);
                const falta = i.central < num(v);
                return (
                  <div key={i.item_id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="flex-1 min-w-[200px]">
                      <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                      <p className="t-caption truncate" style={{ margin: 0 }}>
                        nível {fmt(i.nivel)} · tem {fmt(i.saldo)} · Central tem <span className={falta ? 'texto-atencao' : undefined}>{fmt(i.central)}</span> {i.um}
                        {i.por_contagem && <span className="texto-atencao"> · por contagem{i.contado_em ? `, contado ${new Date(i.contado_em).toLocaleDateString('pt-BR')}` : ', nunca contado'}</span>}
                      </p>
                    </div>
                    {falta && <Badge variant="warning">Central não cobre</Badge>}
                    <div className="flex items-center gap-2">
                      <span className="t-caption whitespace-nowrap">falta {fmt(i.sugestao)}</span>
                      <input type="number" inputMode="decimal" min={0} step="any" aria-label={`Mandar de ${i.nome}`} value={v}
                        onChange={e => setQtd(p => ({ ...p, [i.item_id]: e.target.value }))} className="input-dark text-right font-semibold" style={{ width: 96 }} />
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {setor && setor.itens.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
          <div className="max-w-5xl flex items-center justify-between gap-3">
            <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{pedidos.length} item(ns) para {setor.nome}{semCentral ? <span className="texto-atencao"> · {semCentral} o Central não cobre</span> : null}</span>
            <Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={mandar} carregando={mandando} disabled={pedidos.length === 0}>Mandar para {setor.nome}</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reposicao;
