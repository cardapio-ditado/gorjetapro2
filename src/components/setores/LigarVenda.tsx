import React, { useEffect, useState } from 'react';
import { Link2, Search, Unlink } from 'lucide-react';
import { Badge, Button, IconButton, Input, Modal, Segmented, Select } from '../ui';
import { setoresApi, type ItemSetor, type VendaBusca, type VendasDoItem } from './api';

interface Props {
  estoqueId: string;
  estoqueNome: string;
  item: ItemSetor | null;
  onFechar: () => void;
  /** Chamado quando algo mudou, para a lista de trás recarregar. */
  onMudou: () => void;
}

/** Quais vendas da Zig baixam este item aqui. Liga direto ou por uma ficha que usa o item. */
const LigarVenda: React.FC<Props> = ({ estoqueId, estoqueNome, item, onFechar, onMudou }) => {
  const [dados, setDados] = useState<VendasDoItem | null>(null);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<VendaBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [escolhida, setEscolhida] = useState<VendaBusca | null>(null);
  const [modo, setModo] = useState<'direto' | 'ficha'>('direto');
  const [fichaId, setFichaId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mudou, setMudou] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDados(null); setTermo(''); setResultados([]); setEscolhida(null); setModo('direto'); setFichaId(''); setErro(null); setMudou(false);
    let vivo = true;
    setoresApi.vendasDoItem(estoqueId, item.item_id)
      .then(r => { if (vivo) { setDados(r); setFichaId(r.fichas[0]?.id ?? ''); } })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); });
    return () => { vivo = false; };
  }, [item, estoqueId]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) { setResultados([]); return; }
    let vivo = true;
    setBuscando(true);
    const timer = setTimeout(async () => {
      try { const r = await setoresApi.buscarVendas(t); if (vivo) setResultados(r); }
      catch { if (vivo) setResultados([]); }
      finally { if (vivo) setBuscando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(timer); };
  }, [termo]);

  const fechar = () => { if (mudou) onMudou(); onFechar(); };

  const ligar = async () => {
    if (!item || !escolhida) return;
    if (modo === 'ficha' && !fichaId) { setErro('Escolha a ficha.'); return; }
    setOcupado(true); setErro(null);
    try {
      const r = await setoresApi.ligarVenda(estoqueId, item.item_id, escolhida.id, modo, modo === 'ficha' ? fichaId : null);
      setDados(r); setEscolhida(null); setTermo(''); setResultados([]); setMudou(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao ligar');
    } finally {
      setOcupado(false);
    }
  };

  const desligar = async (mapeamentoId: string) => {
    if (!item) return;
    if (!window.confirm('Desligar esta venda? Ela fica sem vínculo e a Zig passa a avisar que não está mapeada.')) return;
    setOcupado(true); setErro(null);
    try {
      const r = await setoresApi.desligarVenda(estoqueId, item.item_id, mapeamentoId);
      setDados(r); setMudou(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao desligar');
    } finally {
      setOcupado(false);
    }
  };

  const temFichas = (dados?.fichas.length ?? 0) > 0;

  return (
    <Modal
      aberto={!!item}
      onFechar={fechar}
      titulo={item ? `Vendas que baixam ${item.nome}` : 'Vendas'}
      descricao={`Origem da baixa: ${estoqueNome}. Não precisa escolher o estoque de novo.`}
      largura="md"
      travado={ocupado}
      rodape={<Button variante="primario" onClick={fechar} disabled={ocupado}>Concluir</Button>}
    >
      {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}

      <div className="flex flex-col gap-2">
        <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Ligadas hoje</span>
        {!dados && <p className="t-caption" style={{ margin: 0 }}>Carregando…</p>}
        {dados && dados.vinculadas.length === 0 && <p className="t-body texto-atencao" style={{ margin: 0 }}>Nenhuma venda baixa este item aqui. Ligue uma abaixo.</p>}
        {dados?.vinculadas.map(v => (
          <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex-1 min-w-0">
              <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{v.nome_externo}</p>
              <p className="t-caption truncate" style={{ margin: 0 }}>{v.modo === 'direto' ? 'Baixa direta' : `Por ficha: ${v.ficha_nome ?? ''}`}{v.categoria ? ` · ${v.categoria}` : ''} · {v.usos} uso(s)</p>
            </div>
            <Badge variant={v.modo === 'direto' ? 'info' : 'gold'}>{v.modo}</Badge>
            <IconButton aria-label={`Desligar ${v.nome_externo}`} tom="perigo" onClick={() => desligar(v.id)} disabled={ocupado}><Unlink size={14} /></IconButton>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Ligar uma venda</span>
        <Input type="search" value={termo} onChange={e => { setTermo(e.target.value); setEscolhida(null); }} placeholder="Nome da venda na Zig (ex: Heineken 600)" aria-label="Buscar venda" autoFocus />
        {buscando && <p className="t-caption" style={{ margin: 0 }}>Buscando…</p>}
        {!escolhida && resultados.length > 0 && (
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {resultados.map(r => (
              <button key={r.id} type="button" onClick={() => setEscolhida(r)} className="text-left px-3 py-2 rounded-lg hover:bg-white/[0.05] focus-ring" style={{ border: '1px solid var(--border)' }}>
                <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{r.nome_externo}</p>
                <p className="t-caption truncate" style={{ margin: 0 }}>{r.destino}{r.estoque_nome ? ` · ${r.estoque_nome}` : ''}{r.categoria ? ` · ${r.categoria}` : ''} · {r.usos} uso(s)</p>
              </button>
            ))}
          </div>
        )}
        {!buscando && termo.trim().length >= 2 && resultados.length === 0 && !escolhida && <p className="t-caption" style={{ margin: 0 }}>Nenhuma venda com esse nome.</p>}

        {escolhida && (
          <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="t-body truncate" style={{ margin: 0, fontWeight: 600 }}>{escolhida.nome_externo}</p>
                <p className="t-caption truncate" style={{ margin: 0 }}>Hoje: {escolhida.destino}{escolhida.estoque_nome ? ` · ${escolhida.estoque_nome}` : ''}</p>
              </div>
              <Button tamanho="sm" variante="discreto" onClick={() => setEscolhida(null)}>trocar</Button>
            </div>
            <Segmented rotulo="Como baixa" valor={modo} onMudar={setModo} opcoes={[{ valor: 'direto', rotulo: 'Baixa o item direto' }, { valor: 'ficha', rotulo: temFichas ? 'Baixa por ficha técnica' : 'Sem ficha para este item' }]} />
            {modo === 'ficha' && temFichas && (
              <Select rotulo="Qual ficha" value={fichaId} onChange={e => setFichaId(e.target.value)}>
                {dados?.fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
            )}
            {modo === 'ficha' && !temFichas && <p className="t-caption texto-atencao" style={{ margin: 0 }}>Nenhuma ficha técnica ativa usa este item com baixa de estoque. Cadastre a ficha antes ou ligue direto.</p>}
            <Button variante="primario" icone={<Link2 size={16} />} onClick={ligar} carregando={ocupado} disabled={modo === 'ficha' && !temFichas} className="self-start">Ligar venda</Button>
          </div>
        )}
        {!escolhida && termo.trim().length < 2 && <p className="t-caption flex items-center gap-1" style={{ margin: 0 }}><Search size={12} /> Digite duas letras ou mais.</p>}
      </div>
    </Modal>
  );
};

export default LigarVenda;
