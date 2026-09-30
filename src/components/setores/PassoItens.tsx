import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Search, Truck } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Modal, Segmented } from '../ui';
import { setoresApi, fmt, type DadosSetor, type ItemSetor } from './api';

interface Props {
  dados: DadosSetor;
  onRecarregar: () => Promise<void>;
  onAvancar: () => void;
}

/** Passo 1: o que fica neste setor. Marca e desmarca; mover leva saldo e vendas junto. */
const PassoItens: React.FC<Props> = ({ dados, onRecarregar, onAvancar }) => {
  const presentes = useMemo(() => new Set(dados.itens.filter(i => i.presente).map(i => i.item_id)), [dados]);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(presentes));
  const [busca, setBusca] = useState('');
  const [soMarcados, setSoMarcados] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mover, setMover] = useState<ItemSetor | null>(null);
  const [destino, setDestino] = useState<string>(dados.outros_setores[0]?.id ?? '');

  const alternar = (id: string) => setMarcados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.itens.filter(i => (!soMarcados || marcados.has(i.item_id)) && (!t || i.nome.toLowerCase().includes(t) || i.categoria.toLowerCase().includes(t)));
  }, [dados.itens, busca, soMarcados, marcados]);

  const grupos = useMemo(() => {
    const m = new Map<string, ItemSetor[]>();
    for (const i of visiveis) { const l = m.get(i.categoria); if (l) l.push(i); else m.set(i.categoria, [i]); }
    return Array.from(m.entries());
  }, [visiveis]);

  const incluir = Array.from(marcados).filter(id => !presentes.has(id));
  const remover = Array.from(presentes).filter(id => !marcados.has(id));
  const mudou = incluir.length + remover.length > 0;

  const salvar = async (avancar: boolean) => {
    setSalvando(true); setErro(null); setAviso(null);
    try {
      if (mudou) {
        const r = await setoresApi.presenca(dados.estoque.id, incluir, remover);
        if (r.bloqueados.length) {
          setAviso(`Não dá para tirar: ${r.bloqueados.join('; ')}. Transfira o saldo ou desligue a venda antes.`);
        }
        await onRecarregar();
        if (r.bloqueados.length) { setSalvando(false); return; }
      }
      if (avancar) onAvancar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarMover = async () => {
    if (!mover || !destino) return;
    setSalvando(true); setErro(null);
    try {
      const r = await setoresApi.moverItem(dados.estoque.id, destino, mover.item_id);
      const nomeDestino = dados.outros_setores.find(s => s.id === destino)?.nome ?? 'outro setor';
      setAviso(`${mover.nome} foi para ${nomeDestino}: saldo ${fmt(r.saldo_movido)}, ${r.vendas_movidas} venda(s) Zig direta(s) junto${r.vendas_por_ficha_ficaram ? `. ${r.vendas_por_ficha_ficaram} venda(s) por ficha ficaram aqui, confira no passo 3` : ''}.`);
      setMover(null);
      setMarcados(prev => { const n = new Set(prev); n.delete(mover.item_id); return n; });
      await onRecarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao mover');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="search" placeholder="Buscar produto ou categoria" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[200px]" />
        <Segmented rotulo="Mostrar" valor={soMarcados ? 'marcados' : 'todos'} onMudar={v => setSoMarcados(v === 'marcados')} opcoes={[{ valor: 'todos', rotulo: 'Todos os produtos' }, { valor: 'marcados', rotulo: `Só os daqui (${marcados.size})` }]} />
      </div>

      {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-atencao">{aviso}</div>}

      {grupos.length === 0 && <EmptyState icon={Search} title="Nada com esse nome" variant="filtered" compact />}

      {grupos.map(([categoria, itens]) => (
        <section key={categoria} className="card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="t-subsec" style={{ margin: 0 }}>{categoria}</h2>
            <span className="t-caption">{itens.filter(i => marcados.has(i.item_id)).length} de {itens.length} aqui</span>
          </div>
          <div>
            {itens.map(i => {
              const on = marcados.has(i.item_id);
              return (
                <div key={i.item_id} className="flex items-center gap-3 px-4 min-h-[56px]" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${on ? 'Tirar' : 'Colocar'} ${i.nome}`}
                    onClick={() => alternar(i.item_id)}
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 focus-ring"
                    style={{ background: on ? 'var(--wine)' : 'transparent', border: `2px solid ${on ? 'var(--wine)' : 'var(--border-strong)'}`, color: '#fff' }}
                  >
                    {on && <Check size={16} strokeWidth={3} />}
                  </button>
                  <button type="button" onClick={() => alternar(i.item_id)} className="flex-1 min-w-0 text-left py-2">
                    <p className="t-body truncate" style={{ margin: 0, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400 }}>{i.nome}</p>
                    <p className="t-caption truncate" style={{ margin: 0 }}>
                      {i.presente && i.saldo !== 0 && <span style={{ color: i.saldo < 0 ? 'var(--danger-text)' : undefined }}>saldo {fmt(i.saldo)} {i.rotulo}</span>}
                      {i.presente && i.saldo !== 0 && (i.vendas_direto + i.vendas_ficha > 0) && ' · '}
                      {i.presente && (i.vendas_direto + i.vendas_ficha > 0) && `${i.vendas_direto + i.vendas_ficha} venda(s) Zig`}
                    </p>
                  </button>
                  {i.presente && !on && <Badge variant="warning">vai sair</Badge>}
                  {!i.presente && on && <Badge variant="success">vai entrar</Badge>}
                  {i.presente && dados.outros_setores.length > 0 && (
                    <Button tamanho="sm" variante="discreto" icone={<Truck size={14} />} onClick={() => { setMover(i); setDestino(dados.outros_setores[0]?.id ?? ''); }} aria-label={`Mover ${i.nome} para outro setor`}>
                      Mover
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-5xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>
            {marcados.size} produtos no {dados.estoque.nome}{mudou && <span style={{ color: 'var(--gold)' }}> · {incluir.length} entram, {remover.length} saem</span>}
          </span>
          <div className="flex gap-2">
            <Button onClick={() => salvar(false)} disabled={!mudou || salvando} carregando={salvando && !mudou}>Salvar</Button>
            <Button variante="primario" icone={<ArrowRight size={16} />} onClick={() => salvar(true)} carregando={salvando}>{mudou ? 'Salvar e continuar' : 'Continuar'}</Button>
          </div>
        </div>
      </div>

      <Modal
        aberto={!!mover}
        onFechar={() => setMover(null)}
        titulo={mover ? `Mover ${mover.nome}` : 'Mover'}
        descricao="Nível, forma de baixa, saldo e vendas diretas vão junto."
        travado={salvando}
        rodape={<><Button variante="discreto" onClick={() => setMover(null)} disabled={salvando}>Cancelar</Button><Button variante="primario" onClick={confirmarMover} carregando={salvando} disabled={!destino}>Mover</Button></>}
      >
        {mover && (
          <>
            <p className="t-body" style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Saldo aqui: <strong style={{ color: 'var(--text-primary)' }}>{fmt(mover.saldo)} {mover.rotulo}</strong>. Vendas Zig ligadas: <strong style={{ color: 'var(--text-primary)' }}>{mover.vendas_direto} direta(s), {mover.vendas_ficha} por ficha</strong>.
            </p>
            <div className="flex flex-col gap-1">
              <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Para onde</span>
              <Segmented rotulo="Setor de destino" valor={destino} onMudar={setDestino} opcoes={dados.outros_setores.map(s => ({ valor: s.id, rotulo: s.nome }))} />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default PassoItens;
