import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ClipboardCheck, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, PageHeader, SectionCard } from '../ui';
import { contagemApi, fmt, type ContagemFolha, type ContagemTela } from './api';
import { semAcento } from './cadastros/api';

interface Props { responsavel: string | null; onVoltar: () => void; onAprovacoes: () => void }
const dataBR = (s: string | null) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR') : 'nunca');
const DIA = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/**
 * Contagem dos setores. Diária: só os itens que a Zig não baixa; o contado
 * vira o saldo na hora. Auditoria geral (seg, qui, sáb): tudo do setor; as
 * diferenças esperam aprovação de Cristiano ou Kadu.
 */
const Contagem: React.FC<Props> = ({ responsavel, onVoltar, onAprovacoes }) => {
  const [tela, setTela] = useState<ContagemTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [folha, setFolha] = useState<ContagemFolha | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await contagemApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const abrir = async (estoqueId: string, modo: 'diaria' | 'auditoria') => {
    setErro(null);
    try { setFolha(await contagemApi.abrir(estoqueId, modo, responsavel)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao abrir'); }
  };

  if (folha) return <Folha inicial={folha} onVoltar={() => setFolha(null)} onFeito={async m => { setFolha(null); setAviso(m); await carregar(); }} />;

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Contagem']} title="Contagem dos setores"
        subtitle={tela ? `Diária: o que a Zig não baixa. Auditoria geral: ${tela.dias_auditoria.map(d => DIA[d]).join(', ')}${tela.auditoria_hoje ? ' — hoje é dia.' : '.'}` : ' '}
        actions={<div className="flex gap-2">
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
          {tela && tela.aprovacoes_pendentes > 0 && <Button variante="primario" icone={<ShieldCheck size={16} />} onClick={onAprovacoes}>Aprovar diferenças ({tela.aprovacoes_pendentes})</Button>}
        </div>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tela?.setores.map(s => {
          const d = s.diaria; const a = s.auditoria;
          const diariaFeita = d?.status === 'processada';
          return (
            <SectionCard key={s.id} title={s.nome} descricao={`${s.itens_contagem} por contagem · ${s.itens_total} no total`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>Contagem diária</p>
                    <p className="t-caption" style={{ margin: 0 }}>
                      {diariaFeita ? 'feita hoje' : d?.status === 'em_andamento' ? `em andamento, ${d.contados} de ${d.total}` : d?.status === 'finalizada' ? 'fechando…' : `última ${dataBR(s.ultima_diaria)}`}
                    </p>
                  </div>
                  {diariaFeita ? <Badge variant="success">feita</Badge>
                    : <Button variante={s.itens_contagem ? 'primario' : 'secundario'} tamanho="sm" icone={<ClipboardCheck size={14} />} onClick={() => abrir(s.id, 'diaria')} disabled={!s.itens_contagem}>{d?.status === 'em_andamento' ? 'Continuar' : 'Contar hoje'}</Button>}
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>Auditoria geral</p>
                    <p className="t-caption" style={{ margin: 0 }}>
                      {a?.status === 'processada' ? 'feita e aprovada hoje' : a?.status === 'finalizada' ? 'aguardando aprovação' : a?.status === 'em_andamento' ? `em andamento, ${a.contados} de ${a.total}` : `última ${dataBR(s.ultima_auditoria)}`}
                      {s.aguardando_aprovacao > 0 && a?.status !== 'finalizada' && ` · ${s.aguardando_aprovacao} aguardando aprovação`}
                    </p>
                  </div>
                  {/* Pode haver mais de uma auditoria no dia: a feita vira selo e o botão abre outra (só com o que faltou, por exemplo). */}
                  <div className="flex items-center gap-2">
                    {a?.status === 'processada' && <Badge variant="success">feita</Badge>}
                    {a?.status === 'finalizada' && <Badge variant="warning">aguarda aprovação</Badge>}
                    {a?.status === 'em_andamento'
                      ? <Button variante="primario" tamanho="sm" icone={<ShieldCheck size={14} />} onClick={() => abrir(s.id, 'auditoria')}>Continuar</Button>
                      : <Button variante={tela.auditoria_hoje && !a ? 'primario' : 'secundario'} tamanho="sm" icone={<ShieldCheck size={14} />} onClick={() => abrir(s.id, 'auditoria')} disabled={!s.itens_total}>{a ? 'Nova auditoria' : tela.auditoria_hoje ? 'Auditar hoje' : 'Auditoria'}</Button>}
                  </div>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
};

export default Contagem;

/** Lupa fixa no topo: acha o item sem rolar a folha inteira. */
export const BarraBusca: React.FC<{ valor: string; onMudar: (v: string) => void }> = ({ valor, onMudar }) => (
  <div className="sticky top-0 z-20 -mx-1 px-1 py-2 mb-2" style={{ background: 'var(--bg-dark)' }}>
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)', pointerEvents: 'none' }} />
      <input type="search" enterKeyHint="search" placeholder="Buscar item pelo nome…" aria-label="Buscar item" value={valor} onChange={e => onMudar(e.target.value)}
        className="input-dark w-full" style={{ paddingLeft: 38, paddingRight: valor ? 38 : undefined, height: 44 }} />
      {valor && <button type="button" className="btn-icon absolute right-1 top-1/2 -translate-y-1/2" aria-label="Limpar busca" onClick={() => onMudar('')}><X size={14} /></button>}
    </div>
  </div>
);

// ── A folha de contagem ─────────────────────────────────────────────────────
const Folha: React.FC<{ inicial: ContagemFolha; onVoltar: () => void; onFeito: (m: string) => Promise<void> }> = ({ inicial, onVoltar, onFeito }) => {
  const [folha, setFolha] = useState(inicial);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(inicial.itens.map(i => [i.linha_id, i.contada === null ? '' : String(i.contada)])));
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const pendentes = useRef<Map<string, string>>(new Map());
  const timer = useRef<number | null>(null);

  const num = (s: string) => { const n = Number((s || '').replace(',', '.')); return s.trim() === '' || !Number.isFinite(n) ? null : n; };
  const contados = folha.itens.filter(i => (valores[i.linha_id] ?? '').trim() !== '').length;

  const agendar = (linhaId: string, v: string) => {
    pendentes.current.set(linhaId, v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void gravar(), 700);
  };
  const gravar = async () => {
    if (pendentes.current.size === 0) return;
    const lote = [...pendentes.current.entries()].map(([linha_id, v]) => ({ linha_id, contada: num(v) }));
    pendentes.current.clear();
    setSalvando(true);
    try { await contagemApi.anotar(folha.id, lote); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao gravar'); }
    finally { setSalvando(false); }
  };

  const concluir = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    await gravar();
    const faltam = folha.itens.length - contados;
    if (faltam > 0 && !window.confirm(`${faltam} item(ns) sem contagem ficam como estão. Concluir mesmo assim?`)) return;
    setConcluindo(true); setErro(null);
    try {
      const r = await contagemApi.concluir(folha.id);
      await onFeito(r.aprovacao
        ? `${folha.estoque.nome}: auditoria concluída, ${r.diferencas} diferença(s) (${brl(r.valor)}) aguardam aprovação. Até lá o saldo não muda.`
        : `${folha.estoque.nome}: ${r.contados} contados, ${r.acertos ?? 0} acerto(s) no saldo.`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao concluir'); }
    finally { setConcluindo(false); }
  };

  // A lupa filtra por nome sem ligar para acento ou maiúscula; os grupos vazios somem.
  const grupos = useMemo(() => {
    const b = semAcento(busca.trim());
    const m = new Map<string, ContagemFolha['itens']>();
    for (const i of folha.itens) { if (b && !semAcento(i.nome).includes(b)) continue; if (!m.has(i.categoria)) m.set(i.categoria, []); m.get(i.categoria)!.push(i); }
    return [...m.entries()];
  }, [folha, busca]);
  useEffect(() => { setFolha(inicial); }, [inicial]);

  const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="max-w-3xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Contagem dos setores</button>
      <PageHeader caminho={['Estoque', 'Contagem', folha.estoque.nome]} title={folha.modo === 'diaria' ? `Contagem de ${folha.estoque.nome}` : `Auditoria de ${folha.estoque.nome}`}
        subtitle={folha.modo === 'diaria' ? 'Conte o que tem. O contado vira o saldo ao concluir.' : 'Conte tudo. As diferenças vão para aprovação antes de mexer no saldo.'} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <BarraBusca valor={busca} onMudar={setBusca} />
      <div className="flex flex-col gap-3">
        {grupos.length === 0 && <div className="card p-4"><EmptyState icon={ClipboardCheck} title="Nada com esse nome" description="Tente outra parte do nome. Se o item não está no setor, inclua em Configurar setores." variant="filtered" compact /></div>}
        {grupos.map(([cat, itens]) => (
          <section key={cat} className="card">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="t-subsec" style={{ margin: 0 }}>{cat}</h2>
              <span className="t-caption">{itens.filter(i => (valores[i.linha_id] ?? '').trim() !== '').length} de {itens.length}</span>
            </div>
            {itens.map(i => {
              const v = valores[i.linha_id] ?? '';
              const n = num(v);
              const diff = n === null ? null : n - i.sistema;
              return (
                <div key={i.linha_id} className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                    <p className="t-caption" style={{ margin: 0 }}>
                      {folha.modo === 'auditoria' ? `sistema ${fmt(i.sistema)}` : `ontem ${fmt(i.sistema)}`} {i.um}{i.nivel ? ` · nível ${fmt(i.nivel)}` : ''}
                      {diff !== null && diff !== 0 && <span className={diff < 0 ? 'texto-perigo' : 'texto-atencao'}> · {diff > 0 ? '+' : ''}{fmt(diff)}</span>}
                    </p>
                  </div>
                  <button type="button" className="btn-ghost" style={{ height: 32 }} onClick={() => { setValores(p => ({ ...p, [i.linha_id]: '0' })); agendar(i.linha_id, '0'); }} aria-label={`Zerar ${i.nome}`}>0</button>
                  <input type="number" inputMode="decimal" min={0} step="any" aria-label={`Contado de ${i.nome}`} value={v}
                    onChange={e => { setValores(p => ({ ...p, [i.linha_id]: e.target.value })); agendar(i.linha_id, e.target.value); }}
                    className="input-dark text-right font-semibold" style={{ width: 96, borderColor: v.trim() === '' ? undefined : 'var(--ok-border)' }} />
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-3xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{contados} de {folha.itens.length} contados{salvando ? ' · gravando…' : ''}</span>
          <Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={concluir} carregando={concluindo} disabled={contados === 0}>{folha.modo === 'diaria' ? 'Concluir contagem' : 'Enviar para aprovação'}</Button>
        </div>
      </div>
    </div>
  );
};
