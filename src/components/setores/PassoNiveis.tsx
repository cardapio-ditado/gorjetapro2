import React, { useMemo, useState } from 'react';
import { ArrowRight, Search, Wand2 } from 'lucide-react';
import { Button, EmptyState, Input, Segmented } from '../ui';
import { setoresApi, fmt, type DadosSetor } from './api';

interface Props {
  dados: DadosSetor;
  onRecarregar: () => Promise<void>;
  onAvancar: () => void;
}

type Dias = '1' | '2' | '3' | '7';

/** Passo 2: quanto deve ter de cada item. A sugestão vem do consumo dos últimos 30 dias. */
const PassoNiveis: React.FC<Props> = ({ dados, onRecarregar, onAvancar }) => {
  const presentes = useMemo(() => dados.itens.filter(i => i.presente), [dados]);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(presentes.map(i => [i.item_id, i.nivel > 0 ? String(i.nivel) : ''])));
  const [dias, setDias] = useState<Dias>('2');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sugestao = (consumoDia: number) => Math.ceil(consumoDia * Number(dias));
  const numero = (s: string) => { const n = Number((s || '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; };

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return presentes.filter(i => !t || i.nome.toLowerCase().includes(t) || i.categoria.toLowerCase().includes(t));
  }, [presentes, busca]);

  const alterados = presentes.filter(i => { const n = numero(valores[i.item_id] ?? ''); return n !== null && n !== i.nivel; });
  const vazios = presentes.filter(i => numero(valores[i.item_id] ?? '') === null || numero(valores[i.item_id] ?? '') === 0).length;

  const usarSugestaoNosVazios = () => {
    setValores(prev => {
      const n = { ...prev };
      for (const i of presentes) {
        const atual = numero(n[i.item_id] ?? '');
        if ((atual === null || atual === 0) && i.consumo_dia > 0) n[i.item_id] = String(sugestao(i.consumo_dia));
      }
      return n;
    });
  };

  const salvar = async (avancar: boolean) => {
    setSalvando(true); setErro(null);
    try {
      if (alterados.length) {
        await setoresApi.niveis(dados.estoque.id, alterados.map(i => ({ item_id: i.item_id, nivel: numero(valores[i.item_id]) ?? 0 })));
        await onRecarregar();
      }
      if (avancar) onAvancar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="search" placeholder="Buscar produto" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[200px]" />
        <div className="flex items-center gap-2">
          <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Sugestão para</span>
          <Segmented<Dias> rotulo="Dias de consumo" valor={dias} onMudar={setDias} opcoes={[{ valor: '1', rotulo: '1 dia' }, { valor: '2', rotulo: '2 dias' }, { valor: '3', rotulo: '3 dias' }, { valor: '7', rotulo: '7 dias' }]} />
        </div>
        <Button icone={<Wand2 size={16} />} onClick={usarSugestaoNosVazios} disabled={vazios === 0}>Usar sugestão nos {vazios} sem nível</Button>
      </div>

      {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}

      {presentes.length === 0 && <EmptyState icon={Search} title="Nenhum produto neste setor" description="Volte ao passo 1 e marque o que fica aqui." compact />}

      {presentes.length > 0 && (
        <section className="card">
          <div className="hidden md:grid px-4 py-2 t-caps" style={{ gridTemplateColumns: '1fr 140px 150px 120px', gap: 12, color: 'var(--text-secondary)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>
            <span>Produto</span><span className="text-right">Gasta por dia</span><span className="text-right">Sugestão</span><span className="text-right">Deve ter</span>
          </div>
          {visiveis.map(i => {
            const sug = sugestao(i.consumo_dia);
            const atual = numero(valores[i.item_id] ?? '');
            const pendente = atual === null || atual === 0;
            return (
              <div key={i.item_id} className="grid items-center px-4 py-2 gap-3" style={{ gridTemplateColumns: '1fr auto', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="min-w-0">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                  <p className="t-caption truncate" style={{ margin: 0 }}>
                    {i.categoria} · gasta {fmt(i.consumo_dia)} {i.rotulo}/dia
                    {i.consumo_dia > 0 && <> · sugestão <strong style={{ color: 'var(--text-primary)' }}>{fmt(sug)}</strong></>}
                    {pendente && <span className="texto-atencao"> · sem nível</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {i.consumo_dia > 0 && (
                    <Button tamanho="sm" variante="discreto" onClick={() => setValores(p => ({ ...p, [i.item_id]: String(sug) }))} aria-label={`Usar sugestão ${sug} em ${i.nome}`}>
                      usar {fmt(sug)}
                    </Button>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    aria-label={`Nível de ${i.nome}`}
                    value={valores[i.item_id] ?? ''}
                    onChange={e => setValores(p => ({ ...p, [i.item_id]: e.target.value }))}
                    placeholder="0"
                    className="input-dark text-right font-semibold"
                    style={{ width: 110, borderColor: pendente ? 'var(--warn-border)' : undefined }}
                  />
                  <span className="t-caption w-14 truncate">{i.rotulo}</span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-5xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>
            {presentes.length - vazios} de {presentes.length} com nível{alterados.length > 0 && <span style={{ color: 'var(--gold)' }}> · {alterados.length} para salvar</span>}
          </span>
          <div className="flex gap-2">
            <Button onClick={() => salvar(false)} disabled={!alterados.length || salvando}>Salvar</Button>
            <Button variante="primario" icone={<ArrowRight size={16} />} onClick={() => salvar(true)} carregando={salvando}>{alterados.length ? 'Salvar e continuar' : 'Continuar'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PassoNiveis;
