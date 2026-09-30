import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Warehouse } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Badge, Button, EmptyState, PageHeader, SectionCard } from '../components/ui';
import { setoresApi, type DadosSetor, type SetorResumo } from '../components/setores/api';
import PassoItens from '../components/setores/PassoItens';
import PassoNiveis from '../components/setores/PassoNiveis';
import PassoSaida from '../components/setores/PassoSaida';
import Regras from '../components/setores/Regras';

type Passo = '1' | '2' | '3';

const PASSOS: Array<{ id: Passo; nome: string; frase: string }> = [
  { id: '1', nome: 'O que fica aqui', frase: 'Marque os produtos que ficam neste setor.' },
  { id: '2', nome: 'Quanto deve ter', frase: 'O nível que o Central repõe todo dia.' },
  { id: '3', nome: 'Como sai', frase: 'Zig baixa, ou conta todo dia. E qual venda baixa o quê.' },
];

/**
 * Configurar setores: a fonte de verdade de cada balcão. Um setor por vez,
 * três passos, cada um salva sozinho.
 */
const ConfigurarSetores: React.FC = () => {
  const { isAdmin } = useAuth();
  const gestor = isAdmin();
  const [params, setParams] = useSearchParams();
  const setorId = params.get('setor');
  const passo = (params.get('passo') as Passo) || '1';

  const [resumo, setResumo] = useState<SetorResumo[] | null>(null);
  const [dados, setDados] = useState<DadosSetor | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ir = (setor: string | null, p?: Passo) => {
    const n = new URLSearchParams();
    if (setor) { n.set('setor', setor); n.set('passo', p ?? '1'); }
    setParams(n);
    window.scrollTo({ top: 0 });
  };

  const carregarResumo = useCallback(async () => {
    try { setResumo(await setoresApi.resumo()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, []);

  const carregarSetor = useCallback(async () => {
    if (!setorId) { setDados(null); return; }
    try { setDados(await setoresApi.itens(setorId)); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar o setor'); }
  }, [setorId]);

  useEffect(() => { setErro(null); if (!setorId) void carregarResumo(); }, [setorId, carregarResumo]);
  useEffect(() => { setErro(null); setDados(null); void carregarSetor(); }, [carregarSetor]);

  if (!gestor) {
    return (
      <div className="max-w-3xl">
        <PageHeader caminho={['Estoque', 'Configurar setores']} title="Configurar setores" />
        <EmptyState icon={Warehouse} title="Só gestor configura setores" description="Peça a um administrador." />
      </div>
    );
  }

  // ── Entrada: os setores ──────────────────────────────────────────────────
  if (!setorId) {
    return (
      <div className="max-w-5xl">
        <PageHeader caminho={['Estoque', 'Configurar setores']} title="Configurar setores" subtitle="Cada balcão tem sua lista: o que fica, quanto deve ter e como sai." />
        {erro && <p className="t-body mb-4" style={{ color: 'var(--danger-text)' }}>{erro}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {resumo === null && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
          {resumo?.map(s => {
            const pend = s.sem_nivel + s.zig_sem_venda + s.saldo_sem_cadastro;
            return (
              <SectionCard key={s.id} title={s.nome} descricao={`${s.itens} produto${s.itens === 1 ? '' : 's'} · ${s.zig} pela Zig · ${s.contagem} por contagem`} action={<Button variante="primario" tamanho="sm" onClick={() => ir(s.id, '1')}>Configurar</Button>}>
                <div className="flex flex-wrap gap-2">
                  {pend === 0 && s.itens > 0 && <Badge variant="success">tudo configurado</Badge>}
                  {s.itens === 0 && <Badge variant="neutral">vazio, comece pelo passo 1</Badge>}
                  {s.sem_nivel > 0 && <Badge variant="warning">{s.sem_nivel} sem nível</Badge>}
                  {s.zig_sem_venda > 0 && <Badge variant="warning">{s.zig_sem_venda} Zig sem venda ligada</Badge>}
                  {s.saldo_sem_cadastro > 0 && <Badge variant="info">{s.saldo_sem_cadastro} com saldo mas fora da lista</Badge>}
                  {s.negativos > 0 && <Badge variant="danger">{s.negativos} negativo{s.negativos > 1 ? 's' : ''}</Badge>}
                </div>
              </SectionCard>
            );
          })}
        </div>
        <Regras />
      </div>
    );
  }

  // ── Dentro do setor: três passos ─────────────────────────────────────────
  const atual = PASSOS.find(p => p.id === passo) ?? PASSOS[0];

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={() => ir(null)} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={14} /> Setores
      </button>
      <PageHeader caminho={['Estoque', 'Configurar setores', dados?.estoque.nome ?? '…']} title={dados?.estoque.nome ?? 'Setor'} subtitle={atual.frase} />

      <div role="tablist" aria-label="Passos" className="grid grid-cols-3 gap-2 mb-5">
        {PASSOS.map(p => {
          const on = p.id === passo;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => ir(setorId, p.id)}
              className="text-left px-4 py-3 rounded-lg focus-ring"
              style={{ background: on ? 'var(--gold-muted)' : 'var(--bg-card)', border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}` }}
            >
              <span className="t-caption block" style={{ color: on ? 'var(--gold)' : undefined }}>Passo {p.id}</span>
              <span className="t-body block truncate" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.nome}</span>
            </button>
          );
        })}
      </div>

      {erro && <p className="t-body mb-4" style={{ color: 'var(--danger-text)' }}>{erro}</p>}
      {!dados && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {dados && passo === '1' && <PassoItens key={`1-${dados.estoque.id}`} dados={dados} onRecarregar={carregarSetor} onAvancar={() => ir(setorId, '2')} />}
      {dados && passo === '2' && <PassoNiveis key={`2-${dados.estoque.id}`} dados={dados} onRecarregar={carregarSetor} onAvancar={() => ir(setorId, '3')} />}
      {dados && passo === '3' && <PassoSaida key={`3-${dados.estoque.id}`} dados={dados} onRecarregar={carregarSetor} onConcluir={() => ir(null)} />}
    </div>
  );
};

export default ConfigurarSetores;
