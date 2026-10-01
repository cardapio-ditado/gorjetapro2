import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Modal, PageHeader, Segmented, Select } from '../../ui';
import ListaAgrupada, { agrupar } from './ListaAgrupada';
import ExcluirModal from './ExcluirModal';
import { brl, cadastrosApi, semAcento, UNIDADES, type Estoque, type Fornecedor, type Item } from './api';

type Filtro = 'ativos' | 'arquivados' | 'todos';
const NOVA = '__nova__';
const vazio = (): Partial<Item> => ({ nome: '', codigo: '', categoria: '', tipo_item: 'insumo', unidade_medida: 'unidade', custo_medio: 0, fornecedor_padrao_id: null, tem_validade: false, entra_no_cmv: true, estoque_nativo_id: null, grupo_contagem: 'outros', tipo_compra: 'ambos', ignorar_contagem: false, descricao: '', observacoes: '', status: 'ativo' });

/** Itens do estoque: lista por categoria, edição em janela, arquivar ou excluir. */
const Itens: React.FC = () => {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Partial<Item> | null>(null);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [mais, setMais] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Item | null>(null);

  const carregar = async () => {
    setErro(null);
    try {
      const [i, f, e] = await Promise.all([cadastrosApi.itens(), cadastrosApi.fornecedores(), cadastrosApi.estoques()]);
      setItens(i); setFornecedores(f.filter(x => x.status !== 'inativo')); setEstoques(e.filter(x => x.status !== false));
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const categorias = useMemo(() => [...new Set((itens || []).map(i => (i.categoria || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [itens]);
  const fornecedorNome = useMemo(() => new Map(fornecedores.map(f => [f.id, f.nome])), [fornecedores]);

  const visiveis = useMemo(() => {
    const t = semAcento(busca.trim());
    return (itens || []).filter(i => {
      const ativo = i.status !== 'inativo';
      if (filtro === 'ativos' && !ativo) return false;
      if (filtro === 'arquivados' && ativo) return false;
      return !t || semAcento(`${i.nome} ${i.codigo || ''} ${i.categoria || ''}`).includes(t);
    });
  }, [itens, busca, filtro]);

  const grupos = useMemo(() => agrupar(visiveis, i => i.categoria, i => ({
    id: i.id,
    titulo: i.nome.trim(),
    sub: [i.unidade_medida, i.custo_medio ? brl(i.custo_medio) : null, i.fornecedor_padrao_id ? fornecedorNome.get(i.fornecedor_padrao_id) : null, i.codigo].filter(Boolean).join(' · '),
    inativo: i.status === 'inativo',
    etiquetas: <>{i.tipo_item === 'produto_final' && <Badge variant="gold">produto final</Badge>}{i.status === 'inativo' && <Badge variant="neutral">arquivado</Badge>}</>,
  }), 'Sem categoria'), [visiveis, fornecedorNome]);

  const abrir = (id: string) => { const i = itens?.find(x => x.id === id); if (i) { setEdicao({ ...i }); setNovaCategoria(''); setMais(false); setErro(null); } };
  const novo = () => { setEdicao(vazio()); setNovaCategoria(''); setMais(false); setErro(null); };
  const campo = <K extends keyof Item>(k: K, v: Item[K]) => setEdicao(p => (p ? { ...p, [k]: v } : p));

  const salvar = async () => {
    if (!edicao) return;
    const nome = (edicao.nome || '').trim();
    const categoria = (edicao.categoria === NOVA ? novaCategoria : edicao.categoria || '').trim();
    if (!nome) { setErro('Informe o nome.'); return; }
    if (!categoria) { setErro('Escolha a categoria.'); return; }
    if ((itens || []).some(x => x.id !== edicao.id && semAcento(x.nome.trim()) === semAcento(nome))) { setErro('Já existe um item com esse nome.'); return; }
    setSalvando(true); setErro(null);
    try {
      const valores: Record<string, unknown> = {
        nome, categoria, codigo: (edicao.codigo || '').trim() || null, tipo_item: edicao.tipo_item || 'insumo', unidade_medida: edicao.unidade_medida || 'unidade',
        custo_medio: Number(edicao.custo_medio) || 0, fornecedor_padrao_id: edicao.fornecedor_padrao_id || null, tem_validade: !!edicao.tem_validade, entra_no_cmv: edicao.entra_no_cmv !== false,
        estoque_nativo_id: edicao.estoque_nativo_id || null, grupo_contagem: edicao.grupo_contagem || 'outros', tipo_compra: edicao.tipo_compra || 'ambos', ignorar_contagem: !!edicao.ignorar_contagem,
        descricao: (edicao.descricao || '').trim() || null, observacoes: (edicao.observacoes || '').trim() || null,
      };
      if (!edicao.id) { valores.status = 'ativo'; valores.estoque_minimo = 0; valores.ponto_reposicao = 0; }
      await cadastrosApi.salvar('itens_estoque', edicao.id || null, valores);
      setAviso(edicao.id ? `"${nome}" salvo.` : `"${nome}" cadastrado.`);
      setEdicao(null);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const unidades = useMemo(() => { const u = edicao?.unidade_medida; return u && !UNIDADES.includes(u) ? [u, ...UNIDADES] : UNIDADES; }, [edicao?.unidade_medida]);

  return (
    <div className="max-w-5xl">
      <PageHeader caminho={['Estoque', 'Cadastros']} title="Itens do estoque" subtitle={itens ? `${itens.filter(i => i.status !== 'inativo').length} ativos em ${categorias.length} categorias` : ' '}
        actions={<Button variante="primario" icone={<Plus size={16} />} onClick={novo}>Novo item</Button>} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input type="search" placeholder="Buscar por nome, código ou categoria" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[220px]" />
        <Segmented<Filtro> rotulo="Mostrar" valor={filtro} onMudar={setFiltro} opcoes={[{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'arquivados', rotulo: 'Arquivados' }, { valor: 'todos', rotulo: 'Todos' }]} />
      </div>
      {erro && !edicao && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!itens && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {itens && <ListaAgrupada grupos={grupos} onAbrir={abrir} vazio="Nenhum item cadastrado" filtrado={!!busca || filtro !== 'ativos'} />}

      <Modal aberto={!!edicao} onFechar={() => setEdicao(null)} titulo={edicao?.id ? 'Editar item' : 'Novo item'} largura="lg" travado={salvando}
        descricao="Ponto de pedido e níveis por setor ficam em Configuração."
        rodape={<>
          {edicao?.id && <Button variante="discreto" icone={<Trash2 size={14} />} onClick={() => setExcluir(edicao as Item)} className="mr-auto" style={{ color: 'var(--danger-text)' }}>Excluir…</Button>}
          <Button onClick={() => setEdicao(null)} disabled={salvando}>Cancelar</Button>
          <Button variante="primario" onClick={salvar} carregando={salvando}>Salvar</Button>
        </>}
      >
        {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
        {edicao && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input rotulo="Nome" value={edicao.nome || ''} onChange={e => campo('nome', e.target.value)} className="md:col-span-2" autoFocus />
            <Select rotulo="Categoria" value={edicao.categoria || ''} onChange={e => campo('categoria', e.target.value)}>
              <option value="">Escolha…</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              {edicao.categoria && !categorias.includes(edicao.categoria) && edicao.categoria !== NOVA && <option value={edicao.categoria}>{edicao.categoria}</option>}
              <option value={NOVA}>+ Nova categoria…</option>
            </Select>
            {edicao.categoria === NOVA
              ? <Input rotulo="Nome da nova categoria" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} />
              : <Select rotulo="Unidade" value={edicao.unidade_medida || 'unidade'} onChange={e => campo('unidade_medida', e.target.value)}>{unidades.map(u => <option key={u} value={u}>{u}</option>)}</Select>}
            {edicao.categoria === NOVA && <Select rotulo="Unidade" value={edicao.unidade_medida || 'unidade'} onChange={e => campo('unidade_medida', e.target.value)}>{unidades.map(u => <option key={u} value={u}>{u}</option>)}</Select>}
            <Select rotulo="Tipo" value={edicao.tipo_item || 'insumo'} onChange={e => campo('tipo_item', e.target.value)}>
              <option value="insumo">Insumo (compra pronto)</option>
              <option value="produto_final">Produto final (feito aqui)</option>
            </Select>
            <Input rotulo="Custo médio (R$)" type="number" inputMode="decimal" min={0} step="any" value={edicao.custo_medio ?? 0} onChange={e => campo('custo_medio', Number(e.target.value))} />
            <Select rotulo="Fornecedor padrão" value={edicao.fornecedor_padrao_id || ''} onChange={e => campo('fornecedor_padrao_id', e.target.value || null)}>
              <option value="">Nenhum</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Select>
            <Input rotulo="Código" value={edicao.codigo || ''} onChange={e => campo('codigo', e.target.value)} dica="Opcional" />
            <div className="md:col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 t-body"><input type="checkbox" checked={!!edicao.tem_validade} onChange={e => campo('tem_validade', e.target.checked)} /> Tem validade</label>
              <label className="flex items-center gap-2 t-body"><input type="checkbox" checked={edicao.entra_no_cmv !== false} onChange={e => campo('entra_no_cmv', e.target.checked)} /> Entra no CMV</label>
            </div>
            <button type="button" onClick={() => setMais(m => !m)} className="md:col-span-2 text-left t-label focus-ring" style={{ color: 'var(--gold)' }}>{mais ? '− Menos opções' : '+ Mais opções'}</button>
            {mais && (
              <>
                <Select rotulo="Estoque nativo" value={edicao.estoque_nativo_id || ''} onChange={e => campo('estoque_nativo_id', e.target.value || null)} dica="Onde o item normalmente fica">
                  <option value="">Nenhum</option>
                  {estoques.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </Select>
                <Select rotulo="Grupo de contagem" value={edicao.grupo_contagem || 'outros'} onChange={e => campo('grupo_contagem', e.target.value)}>
                  {['bebidas', 'alimentos', 'hortifruti', 'estoque_seco', 'estoque_central', 'outros'].map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
                <Select rotulo="Como compra" value={edicao.tipo_compra || 'ambos'} onChange={e => campo('tipo_compra', e.target.value)}>
                  <option value="ambos">Fornecedor ou rua</option><option value="fornecedor">Só fornecedor</option><option value="rua">Só rua / feira</option>
                </Select>
                <label className="flex items-center gap-2 t-body self-end pb-2"><input type="checkbox" checked={!!edicao.ignorar_contagem} onChange={e => campo('ignorar_contagem', e.target.checked)} /> Ignorar na contagem</label>
                <Input rotulo="Descrição" value={edicao.descricao || ''} onChange={e => campo('descricao', e.target.value)} className="md:col-span-2" />
                <Input rotulo="Observações" value={edicao.observacoes || ''} onChange={e => campo('observacoes', e.target.value)} className="md:col-span-2" />
              </>
            )}
          </div>
        )}
      </Modal>

      <ExcluirModal tipo="item" id={excluir?.id ?? null} nome={excluir?.nome.trim() ?? ''} arquivado={excluir?.status === 'inativo'}
        onFechar={() => setExcluir(null)}
        onFeito={async m => { setExcluir(null); setEdicao(null); setAviso(m); await carregar(); }} />
    </div>
  );
};

export default Itens;
