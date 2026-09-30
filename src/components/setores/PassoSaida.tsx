import React, { useMemo, useState } from 'react';
import { Check, Link2, Search } from 'lucide-react';
import { Badge, Button, Chip, EmptyState, Input, Segmented } from '../ui';
import { setoresApi, type Controle, type DadosSetor, type ItemSetor } from './api';
import LigarVenda from './LigarVenda';

interface Props {
  dados: DadosSetor;
  onRecarregar: () => Promise<void>;
  onConcluir: () => void;
}

/** Passo 3: como o item sai daqui. Zig baixa, ou conta todo dia. Grava na hora. */
const PassoSaida: React.FC<Props> = ({ dados, onRecarregar, onConcluir }) => {
  const presentes = useMemo(() => dados.itens.filter(i => i.presente), [dados]);
  const ehKit = dados.estoque.tipo === 'kit';
  const [busca, setBusca] = useState('');
  const [soPendencias, setSoPendencias] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ligando, setLigando] = useState<ItemSetor | null>(null);

  const pendente = (i: ItemSetor) => i.controle === 'venda' && i.vendas_direto + i.vendas_ficha === 0;
  const pendencias = presentes.filter(pendente).length;

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return presentes.filter(i => (!soPendencias || pendente(i)) && (!t || i.nome.toLowerCase().includes(t) || i.categoria.toLowerCase().includes(t)));
  }, [presentes, busca, soPendencias]);

  const mudarControle = async (i: ItemSetor, c: Controle) => {
    if (i.controle === c) return;
    setOcupado(i.item_id); setErro(null);
    try {
      await setoresApi.controle(dados.estoque.id, i.item_id, c);
      await onRecarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setOcupado(null);
    }
  };

  if (ehKit) {
    return (
      <div className="flex flex-col gap-4 pb-28">
        <div className="rounded-lg px-4 py-3 t-body" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          Kit não vende nada: tudo aqui sai por <strong style={{ color: 'var(--text-primary)' }}>contagem</strong>. O que falta até o nível é reposto do Central na tela Kits de limpeza. Nada a configurar neste passo.
        </div>
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
          <div className="max-w-5xl flex items-center justify-end">
            <Button variante="primario" icone={<Check size={16} />} onClick={onConcluir}>Concluir kit</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="rounded-lg px-4 py-3 t-body" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Zig baixa:</strong> a venda desconta o item deste setor sozinha, às 6h. Precisa de pelo menos uma venda ligada.{' '}
        <strong style={{ color: 'var(--text-primary)' }}>Conta todo dia:</strong> a Zig ignora o item aqui e o gerente informa o físico no fechamento.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input type="search" placeholder="Buscar produto" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[200px]" />
        <Chip ligado={soPendencias} onMudar={setSoPendencias} tom="atencao">Só pendências ({pendencias})</Chip>
      </div>

      {erro && <div className="rounded-lg px-4 py-3 t-body" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5' }}>{erro}</div>}

      {presentes.length === 0 && <EmptyState icon={Search} title="Nenhum produto neste setor" description="Volte ao passo 1 e marque o que fica aqui." compact />}
      {presentes.length > 0 && visiveis.length === 0 && <EmptyState icon={Search} title={soPendencias ? 'Sem pendências' : 'Nada com esse nome'} variant="filtered" compact />}

      {visiveis.length > 0 && (
        <section className="card">
          {visiveis.map(i => {
            const zig = i.controle === 'venda';
            const vendas = i.vendas_direto + i.vendas_ficha;
            return (
              <div key={i.item_id} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: ocupado === i.item_id ? 0.6 : 1 }}>
                <div className="flex-1 min-w-[180px]">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                  <p className="t-caption truncate" style={{ margin: 0 }}>{i.categoria}</p>
                </div>
                <Segmented<Controle>
                  rotulo={`Como sai ${i.nome}`}
                  valor={i.controle ?? 'contagem'}
                  onMudar={c => mudarControle(i, c)}
                  opcoes={[{ valor: 'venda', rotulo: 'Zig baixa' }, { valor: 'contagem', rotulo: 'Conta todo dia' }]}
                />
                <div className="flex items-center gap-2 min-w-[220px] justify-end">
                  {zig && vendas > 0 && (
                    <Badge variant="success">
                      <Check size={12} aria-hidden="true" /> {i.vendas_direto > 0 && `${i.vendas_direto} direta${i.vendas_direto > 1 ? 's' : ''}`}{i.vendas_direto > 0 && i.vendas_ficha > 0 && ' + '}{i.vendas_ficha > 0 && `${i.vendas_ficha} por ficha`}
                    </Badge>
                  )}
                  {zig && vendas === 0 && <Badge variant="warning">sem venda ligada</Badge>}
                  {!zig && vendas > 0 && <Badge variant="neutral">{vendas} venda(s) ignorada(s) aqui</Badge>}
                  {zig && (
                    <Button tamanho="sm" variante={vendas === 0 ? 'primario' : 'secundario'} icone={<Link2 size={14} />} onClick={() => setLigando(i)}>
                      {vendas === 0 ? 'Ligar venda' : 'Vendas'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-5xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>
            {presentes.filter(i => i.controle === 'venda').length} pela Zig · {presentes.filter(i => i.controle !== 'venda').length} por contagem
            {pendencias > 0 && <span style={{ color: '#fcd34d' }}> · {pendencias} Zig sem venda ligada</span>}
          </span>
          <Button variante="primario" icone={<Check size={16} />} onClick={onConcluir}>Concluir setor</Button>
        </div>
      </div>

      <LigarVenda
        estoqueId={dados.estoque.id}
        estoqueNome={dados.estoque.nome}
        item={ligando}
        onFechar={() => setLigando(null)}
        onMudou={() => { void onRecarregar(); }}
      />
    </div>
  );
};

export default PassoSaida;
