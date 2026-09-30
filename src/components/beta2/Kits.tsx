import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Settings2, SprayCan } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, SectionCard } from '../ui';
import { beta2Api, fmt, type Kit } from './api';

interface Props {
  responsavel: string | null;
  onConfigurar: (kitId: string) => void;
}

/**
 * Kits de limpeza: garçons, cozinha, bar e serviços gerais. Cada kit tem a
 * lista do que deve ter (configurada em Configurar setores). Repor = mandar
 * do Central o que falta, num toque.
 */
const Kits: React.FC<Props> = ({ responsavel, onConfigurar }) => {
  const [kits, setKits] = useState<Kit[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async () => {
    setErro(null);
    try { setKits(await beta2Api.kits()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const kit = useMemo(() => kits?.find(k => k.id === aberto) ?? null, [kits, aberto]);

  const abrir = (k: Kit) => {
    setAberto(k.id); setAviso(null); setErro(null);
    setQuantidades(Object.fromEntries(k.itens.map(i => [i.item_id, i.falta > 0 ? String(i.falta) : ''])));
  };

  const numero = (s: string) => { const n = Number((s || '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
  const pedidos = kit ? kit.itens.map(i => ({ item_id: i.item_id, quantidade: numero(quantidades[i.item_id] ?? '') })).filter(p => p.quantidade > 0) : [];

  const repor = async () => {
    if (!kit || pedidos.length === 0) return;
    if (!window.confirm(`Mandar ${pedidos.length} item(ns) do Central para ${kit.nome}?`)) return;
    setOcupado(true); setErro(null); setAviso(null);
    try {
      const r = await beta2Api.kitRepor(kit.id, pedidos, responsavel);
      setAviso(`${r.itens} item(ns) repostos.${r.faltou.length ? ` O Central não tinha tudo: ${r.faltou.join('; ')}.` : ''}`);
      await carregar();
      setQuantidades({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao repor');
    } finally {
      setOcupado(false);
    }
  };

  // ── Um kit aberto ────────────────────────────────────────────────────────
  if (kit) {
    return (
      <div className="max-w-3xl pb-28">
        <button type="button" onClick={() => setAberto(null)} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={14} /> Kits
        </button>
        <PageHeader
          caminho={['Estoque', 'Kits de limpeza', kit.nome]}
          title={kit.nome}
          subtitle={kit.ultima_reposicao ? `Última reposição ${new Date(kit.ultima_reposicao).toLocaleDateString('pt-BR')}.` : 'Ainda não foi reposto pelo sistema.'}
          actions={<Button tamanho="sm" icone={<Settings2 size={14} />} onClick={() => onConfigurar(kit.id)}>Configurar lista</Button>}
        />
        {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
        {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

        {kit.itens.length === 0 && (
          <EmptyState icon={SprayCan} title="Este kit ainda não tem lista" description="Configure o que ele deve ter: itens e quantidade." action={{ label: 'Configurar lista', onClick: () => onConfigurar(kit.id) }} />
        )}

        {kit.itens.length > 0 && (
          <section className="card">
            <div className="hidden md:grid px-4 py-2 t-caps" style={{ gridTemplateColumns: '1fr 90px 90px 90px 120px', gap: 12, color: 'var(--text-secondary)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
              <span>Item</span><span className="text-right">Deve ter</span><span className="text-right">Tem</span><span className="text-right">Central</span><span className="text-right">Mandar</span>
            </div>
            {kit.itens.map(i => (
              <div key={i.item_id} className="grid items-center px-4 py-2 gap-3" style={{ gridTemplateColumns: '1fr auto', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="min-w-0">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                  <p className="t-caption" style={{ margin: 0 }}>
                    deve ter {fmt(i.nivel)} · tem <span className={i.falta > 0 ? 'texto-atencao' : undefined}>{fmt(i.saldo)}</span> · Central tem {fmt(i.central_tem)} {i.rotulo}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {i.falta > 0 ? <Badge variant="warning">falta {fmt(i.falta)}</Badge> : <Badge variant="success"><Check size={12} aria-hidden="true" /> ok</Badge>}
                  <input
                    type="number" inputMode="decimal" min={0} step="any"
                    aria-label={`Quantidade a mandar de ${i.nome}`}
                    value={quantidades[i.item_id] ?? ''}
                    onChange={e => setQuantidades(p => ({ ...p, [i.item_id]: e.target.value }))}
                    placeholder="0"
                    className="input-dark text-right font-semibold"
                    style={{ width: 96 }}
                  />
                </div>
              </div>
            ))}
          </section>
        )}

        {kit.itens.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
            <div className="max-w-3xl flex items-center justify-between gap-3">
              <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{pedidos.length} item(ns) para mandar do Central</span>
              <Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={repor} carregando={ocupado} disabled={pedidos.length === 0}>Repor o kit</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Lista de kits ────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl">
      <PageHeader caminho={['Estoque', 'Kits de limpeza']} title="Kits de limpeza" subtitle="Cada kit tem sua lista. Repor é mandar do Central o que falta." />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {!kits && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kits?.map(k => (
          <SectionCard key={k.id} title={k.nome} descricao={k.descricao ?? undefined} action={<Button variante={k.faltando ? 'primario' : 'secundario'} tamanho="sm" onClick={() => abrir(k)}>{k.faltando ? 'Repor' : 'Abrir'}</Button>}>
            <div className="flex flex-wrap gap-2">
              {k.itens.length === 0 && <Badge variant="neutral">sem lista ainda</Badge>}
              {k.itens.length > 0 && k.faltando === 0 && <Badge variant="success">completo</Badge>}
              {k.faltando > 0 && <Badge variant="warning">{k.faltando} item{k.faltando > 1 ? 's' : ''} faltando</Badge>}
              {k.itens.length > 0 && <Badge variant="neutral">{k.itens.length} na lista</Badge>}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
};

export default Kits;
