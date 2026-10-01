import React, { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Search, Wand2 } from 'lucide-react';
import { Badge, Button, Chip, EmptyState, IconButton, Input, KPICard, PageHeader, Segmented } from '../ui';
import { centralApi, fmt, type CentralDados, type CentralItem } from './api';
import { semAcento } from './cadastros/api';

type Modo = 'manual' | 'auto';
type Filtro = 'todos' | 'diferentes' | 'auto' | 'abaixo';

/**
 * Configurar Central: o ponto de pedido de cada insumo. Manual é o número
 * do gestor; automático é consumo por dia × (ciclo do fornecedor + segurança),
 * recalculado todo dia depois da Zig. A lista mostra os dois lado a lado.
 */
const ConfigurarCentral: React.FC = () => {
  const [dados, setDados] = useState<CentralDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [seguranca, setSeguranca] = useState('');
  const [cobertura, setCobertura] = useState('');
  const [salvandoRegras, setSalvandoRegras] = useState(false);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try {
      const d = await centralApi.dados();
      setDados(d); setSeguranca(String(d.regras.seguranca_dias)); setCobertura(String(d.regras.cobertura_padrao_dias)); setDigitado({});
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const visiveis = useMemo(() => {
    const t = semAcento(busca.trim());
    return (dados?.itens || []).filter(i => {
      if (filtro === 'diferentes' && !(i.modo === 'manual' && i.consumo_dia > 0 && i.sugerido !== i.ponto)) return false;
      if (filtro === 'auto' && i.modo !== 'auto') return false;
      if (filtro === 'abaixo' && !(i.ponto > 0 && i.saldo < i.ponto)) return false;
      return !t || semAcento(`${i.nome} ${i.categoria || ''} ${i.fornecedor || ''}`).includes(t);
    });
  }, [dados, busca, filtro]);

  const grupos = useMemo(() => {
    const m = new Map<string, CentralItem[]>();
    for (const i of visiveis) { const k = i.categoria || 'Sem categoria'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [visiveis]);

  const definir = async (i: CentralItem, modo: Modo, ponto: number | null) => {
    setOcupado(i.item_id); setErro(null);
    try {
      const r = await centralApi.definir(i.item_id, modo, ponto);
      setDados(d => d ? { ...d, itens: d.itens.map(x => x.item_id === i.item_id ? { ...x, modo, ponto: Number(r.ponto) } : x) } : d);
      setDigitado(p => { const n = { ...p }; delete n[i.item_id]; return n; });
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setOcupado(null); }
  };

  const salvarManual = (i: CentralItem) => {
    const v = Number((digitado[i.item_id] ?? '').replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { setErro('Ponto deve ser zero ou mais.'); return; }
    void definir(i, 'manual', v);
  };

  const salvarRegras = async () => {
    setSalvandoRegras(true); setErro(null);
    try {
      await centralApi.regrasSalvar(parseInt(seguranca, 10), parseInt(cobertura, 10));
      setAviso('Regras salvas. Os itens no automático já foram recalculados.');
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvandoRegras(false); }
  };

  const autoEmTodos = async () => {
    const n = dados?.itens.filter(i => i.modo === 'manual' && i.consumo_dia > 0).length ?? 0;
    if (!n) { setAviso('Todos os itens com consumo já estão no automático.'); return; }
    if (!window.confirm(`Ligar o automático em ${n} itens com consumo? O ponto de cada um passa a ser a sugestão e muda todo dia. Quem não tem consumo fica como está.`)) return;
    setOcupado('todos'); setErro(null);
    try {
      const r = await centralApi.autoEmTodos();
      setAviso(`${r.ligados} itens no automático; ${r.aplicado.atualizados} pontos mudaram.`);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };

  const t = dados?.totais;

  return (
    <div className="max-w-5xl pb-8">
      <PageHeader caminho={['Estoque', 'Configuração']} title="Configurar Central" subtitle="O ponto de pedido de cada insumo: o seu número, ou calculado pelo consumo."
        actions={<div className="flex gap-2">
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
          <Button icone={<Wand2 size={16} />} onClick={autoEmTodos} carregando={ocupado === 'todos'} disabled={!dados}>Automático em todos com consumo</Button>
        </div>} />

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard rotulo="insumos" valor={t.itens} detalhe={`${t.com_consumo} com consumo nos últimos 90 dias`} />
          <KPICard rotulo="no automático" valor={t.auto} detalhe={`${t.manual} manuais`} tom={t.auto > 0 ? 'certo' : 'normal'} onClick={() => setFiltro('auto')} />
          <KPICard rotulo="manual diferente da sugestão" valor={t.diferentes} detalhe="com consumo, vale conferir" tom={t.diferentes > 0 ? 'atencao' : 'certo'} onClick={() => setFiltro('diferentes')} />
          <KPICard rotulo="abaixo do ponto" valor={t.abaixo} detalhe="entram em Compras" tom={t.abaixo > 0 ? 'destaque' : 'normal'} onClick={() => setFiltro('abaixo')} />
        </div>
      )}

      <section className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <p className="t-subsec" style={{ margin: 0 }}>A conta do automático</p>
          <p className="t-caption" style={{ margin: '2px 0 0' }}>ponto = consumo por dia × (ciclo de compra do fornecedor + segurança). Sem fornecedor ou sem ciclo, usa a cobertura padrão. Consumo = saídas do Central nos últimos {dados?.regras.historico_dias ?? 90} dias.</p>
        </div>
        <Input rotulo="Segurança (dias)" type="number" min={0} max={30} step={1} inputMode="numeric" value={seguranca} onChange={e => setSeguranca(e.target.value)} className="w-32" />
        <Input rotulo="Cobertura padrão (dias)" type="number" min={1} max={60} step={1} inputMode="numeric" value={cobertura} onChange={e => setCobertura(e.target.value)} className="w-40" />
        <Button onClick={salvarRegras} carregando={salvandoRegras} disabled={!dados || (seguranca === String(dados.regras.seguranca_dias) && cobertura === String(dados.regras.cobertura_padrao_dias))}>Salvar regras</Button>
      </section>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Input type="search" placeholder="Buscar item, categoria ou fornecedor" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[220px]" />
        <Chip ligado={filtro === 'diferentes'} onMudar={v => setFiltro(v ? 'diferentes' : 'todos')} tom="atencao">Só diferentes da sugestão</Chip>
        <Chip ligado={filtro === 'auto'} onMudar={v => setFiltro(v ? 'auto' : 'todos')} tom="certo">Só automáticos</Chip>
        <Chip ligado={filtro === 'abaixo'} onMudar={v => setFiltro(v ? 'abaixo' : 'todos')} tom="ouro">Só abaixo do ponto</Chip>
      </div>

      {carregando && !dados && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Calculando consumo de {''}90 dias…</p>}
      {dados && grupos.length === 0 && <EmptyState icon={Search} title="Nada com esse filtro" variant="filtered" compact />}

      <div className="flex flex-col gap-3">
        {grupos.map(([cat, itens]) => (
          <section key={cat} className="card">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="t-subsec" style={{ margin: 0 }}>{cat}</h2>
              <span className="t-caption">{itens.length}</span>
            </div>
            {itens.map(i => {
              const auto = i.modo === 'auto';
              const dig = digitado[i.item_id];
              const abaixo = i.ponto > 0 && i.saldo < i.ponto;
              const diferente = !auto && i.consumo_dia > 0 && i.sugerido !== i.ponto;
              return (
                <div key={i.item_id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: ocupado === i.item_id ? 0.6 : 1 }}>
                  <div className="flex-1 min-w-[200px]">
                    <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                    <p className="t-caption truncate" style={{ margin: 0 }}>
                      {i.consumo_dia > 0 ? `${fmt(i.consumo_dia)} ${i.um}/dia · ciclo ${i.ciclo_dias}d` : 'sem consumo em 90 dias'}
                      {' · '}tem <span className={abaixo ? 'texto-atencao' : undefined}>{fmt(i.saldo)}</span>
                      {i.cobertura_atual_dias !== null && ` (${fmt(i.cobertura_atual_dias)} dias)`}
                      {i.fornecedor && ` · ${i.fornecedor}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="t-caption whitespace-nowrap">sugestão <strong style={{ color: 'var(--text-primary)' }}>{fmt(i.sugerido)}</strong></span>
                    {diferente && <Badge variant="warning">≠</Badge>}
                  </div>
                  <Segmented<Modo> rotulo={`Modo de ${i.nome}`} valor={i.modo} onMudar={m => { if (m === 'auto') void definir(i, 'auto', null); else void definir(i, 'manual', i.ponto); }}
                    opcoes={[{ valor: 'auto', rotulo: 'Automático' }, { valor: 'manual', rotulo: 'Manual' }]} />
                  <div className="flex items-center gap-1">
                    <input
                      type="number" inputMode="decimal" min={0} step="any"
                      aria-label={`Ponto de pedido de ${i.nome}`}
                      value={auto ? i.ponto : (dig ?? String(i.ponto))}
                      readOnly={auto}
                      onChange={e => setDigitado(p => ({ ...p, [i.item_id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !auto) salvarManual(i); }}
                      className="input-dark text-right font-semibold"
                      style={{ width: 96, opacity: auto ? 0.7 : 1 }}
                    />
                    {!auto && dig !== undefined && dig !== String(i.ponto) && (
                      <IconButton aria-label="Salvar ponto" onClick={() => salvarManual(i)}><Check size={16} /></IconButton>
                    )}
                    {!auto && (dig === undefined || dig === String(i.ponto)) && diferente && (
                      <Button tamanho="sm" variante="discreto" onClick={() => definir(i, 'manual', i.sugerido)}>usar {fmt(i.sugerido)}</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
};

export default ConfigurarCentral;
