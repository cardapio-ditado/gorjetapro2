import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Modal, PageHeader, Select } from '../../ui';
import ListaAgrupada, { type Grupo } from './ListaAgrupada';
import ExcluirModal from './ExcluirModal';
import { cadastrosApi, type Estoque } from './api';

const TIPOS: Array<{ valor: string; rotulo: string; grupo: string }> = [
  { valor: 'central', rotulo: 'Central', grupo: 'Central' },
  { valor: 'geral', rotulo: 'Setor (bar, cozinha…)', grupo: 'Setores' },
  { valor: 'secundario', rotulo: 'Setor (bar, cozinha…)', grupo: 'Setores' },
  { valor: 'kit', rotulo: 'Kit de limpeza', grupo: 'Kits de limpeza' },
  { valor: 'producao', rotulo: 'Produção', grupo: 'Produção' },
  { valor: 'vizinho', rotulo: 'Vizinho (empréstimo)', grupo: 'Vizinhos' },
];
const ORDEM = ['Central', 'Setores', 'Kits de limpeza', 'Produção', 'Vizinhos', 'Arquivados'];

/** Estoques: cada lugar que tem saldo. Lista por tipo, edição em janela, arquivar ou excluir. */
const Estoques: React.FC = () => {
  const [lista, setLista] = useState<Estoque[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Partial<Estoque> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Estoque | null>(null);

  const carregar = async () => {
    setErro(null);
    try { setLista(await cadastrosApi.estoques()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Estoque[]>();
    for (const e of lista || []) {
      const g = e.status === false ? 'Arquivados' : (TIPOS.find(t => t.valor === e.tipo)?.grupo ?? 'Outros');
      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g)!.push(e);
    }
    return [...mapa.entries()].sort((a, b) => ORDEM.indexOf(a[0]) - ORDEM.indexOf(b[0])).map(([g, es]) => ({
      chave: g, titulo: g,
      linhas: es.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(e => ({
        id: e.id, titulo: e.nome, sub: [e.localizacao, e.descricao].filter(Boolean).join(' · ') || undefined, inativo: e.status === false,
        etiquetas: e.status === false ? <Badge variant="neutral">arquivado</Badge> : (e.tipo === 'geral' || e.tipo === 'secundario') ? undefined : <Badge variant="neutral">{TIPOS.find(t => t.valor === e.tipo)?.rotulo ?? e.tipo}</Badge>,
      })),
    }));
  }, [lista]);

  const campo = <K extends keyof Estoque>(k: K, v: Estoque[K]) => setEdicao(p => (p ? { ...p, [k]: v } : p));
  const salvar = async () => {
    if (!edicao) return;
    const nome = (edicao.nome || '').trim();
    if (!nome) { setErro('Informe o nome.'); return; }
    if ((lista || []).some(x => x.id !== edicao.id && x.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) { setErro('Já existe um estoque com esse nome.'); return; }
    setSalvando(true); setErro(null);
    try {
      const valores: Record<string, unknown> = { nome, tipo: edicao.tipo || 'secundario', localizacao: (edicao.localizacao || '').trim() || null, descricao: (edicao.descricao || '').trim() || null };
      if (!edicao.id) valores.status = true;
      await cadastrosApi.salvar('estoques', edicao.id || null, valores);
      setAviso(`"${nome}" salvo.`); setEdicao(null); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader caminho={['Estoque', 'Cadastros']} title="Estoques" subtitle="Cada lugar que tem saldo: Central, setores, kits, produção e vizinhos de empréstimo."
        actions={<Button variante="primario" icone={<Plus size={16} />} onClick={() => { setEdicao({ nome: '', tipo: 'secundario', localizacao: '', descricao: '' }); setErro(null); }}>Novo estoque</Button>} />
      {erro && !edicao && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!lista && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {lista && <ListaAgrupada grupos={grupos} onAbrir={id => { const e = lista.find(x => x.id === id); if (e) { setEdicao({ ...e }); setErro(null); } }} vazio="Nenhum estoque" />}

      <Modal aberto={!!edicao} onFechar={() => setEdicao(null)} titulo={edicao?.id ? 'Editar estoque' : 'Novo estoque'} largura="md" travado={salvando}
        rodape={<>
          {edicao?.id && <Button variante="discreto" icone={<Trash2 size={14} />} onClick={() => setExcluir(edicao as Estoque)} className="mr-auto" style={{ color: 'var(--danger-text)' }}>Excluir…</Button>}
          <Button onClick={() => setEdicao(null)} disabled={salvando}>Cancelar</Button>
          <Button variante="primario" onClick={salvar} carregando={salvando}>Salvar</Button>
        </>}
      >
        {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
        {edicao && (
          <div className="grid grid-cols-1 gap-3">
            <Input rotulo="Nome" value={edicao.nome || ''} onChange={e => campo('nome', e.target.value)} autoFocus />
            <Select rotulo="Tipo" value={edicao.tipo || 'secundario'} onChange={e => campo('tipo', e.target.value)} disabled={edicao.tipo === 'central'}>
              {TIPOS.filter((t, i, a) => a.findIndex(x => x.rotulo === t.rotulo) === i).map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </Select>
            <Input rotulo="Localização" value={edicao.localizacao || ''} onChange={e => campo('localizacao', e.target.value)} dica="Onde fica fisicamente. Opcional." />
            <Input rotulo="Descrição" value={edicao.descricao || ''} onChange={e => campo('descricao', e.target.value)} />
          </div>
        )}
      </Modal>

      <ExcluirModal tipo="estoque" id={excluir?.id ?? null} nome={excluir?.nome ?? ''} arquivado={excluir?.status === false}
        onFechar={() => setExcluir(null)}
        onFeito={async m => { setExcluir(null); setEdicao(null); setAviso(m); await carregar(); }} />
    </div>
  );
};

export default Estoques;
