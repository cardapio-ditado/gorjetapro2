import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Chip, Input, Modal, PageHeader, Segmented, Select } from '../../ui';
import ListaAgrupada, { agrupar } from './ListaAgrupada';
import ExcluirModal from './ExcluirModal';
import { cadastrosApi, DIAS, semAcento, type CategoriaFinanceira, type Fornecedor } from './api';

type Filtro = 'ativos' | 'arquivados' | 'todos';
const NOVO = '__novo__';
const GRUPOS_SUGERIDOS = ['Bebidas', 'Carnes', 'Hortifruti', 'Mercearia', 'Limpeza', 'Descartáveis', 'Serviços', 'Músicos', 'RH'];

/** Fornecedores: lista por grupo, edição em janela, arquivar ou excluir. Cadastro compartilhado com o Financeiro. */
const Fornecedores: React.FC = () => {
  const [lista, setLista] = useState<Fornecedor[] | null>(null);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Partial<Fornecedor> | null>(null);
  const [novoGrupo, setNovoGrupo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Fornecedor | null>(null);

  const carregar = async () => {
    setErro(null);
    try {
      const [f, c] = await Promise.all([cadastrosApi.fornecedores(), cadastrosApi.categoriasFinanceiras()]);
      setLista(f); setCategorias(c);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const grupos = useMemo(() => [...new Set([...GRUPOS_SUGERIDOS, ...(lista || []).map(f => (f.grupo || '').trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [lista]);

  const visiveis = useMemo(() => {
    const t = semAcento(busca.trim());
    return (lista || []).filter(f => {
      const ativo = f.status !== 'inativo';
      if (filtro === 'ativos' && !ativo) return false;
      if (filtro === 'arquivados' && ativo) return false;
      return !t || semAcento(`${f.nome} ${f.cnpj || ''} ${f.grupo || ''} ${f.responsavel || ''}`).includes(t);
    });
  }, [lista, busca, filtro]);

  const agrupados = useMemo(() => agrupar(visiveis, f => f.grupo, f => ({
    id: f.id, titulo: f.nome.trim(), inativo: f.status === 'inativo',
    sub: [f.modalidade === 'rua' ? 'comprador busca' : 'entrega', f.telefone, f.responsavel].filter(Boolean).join(' · ') || undefined,
    etiquetas: <>{f.tipo === 'musico' && <Badge variant="gold">músico</Badge>}{f.tipo === 'rh' && <Badge variant="info">RH</Badge>}{f.status === 'inativo' && <Badge variant="neutral">arquivado</Badge>}</>,
  }), 'Sem grupo'), [visiveis]);

  const campo = <K extends keyof Fornecedor>(k: K, v: Fornecedor[K]) => setEdicao(p => (p ? { ...p, [k]: v } : p));
  const abrir = (id: string) => { const f = lista?.find(x => x.id === id); if (f) { setEdicao({ ...f, dias_compra: f.dias_compra || [] }); setNovoGrupo(''); setErro(null); } };
  const novo = () => { setEdicao({ nome: '', grupo: '', tipo: 'geral', modalidade: 'entrega', telefone: '', email: '', responsavel: '', cnpj: '', categoria_padrao_id: null, ciclo_compra_dias: null, dias_compra: [], endereco: '', observacoes: '' }); setNovoGrupo(''); setErro(null); };

  const salvar = async () => {
    if (!edicao) return;
    const nome = (edicao.nome || '').trim();
    const grupo = (edicao.grupo === NOVO ? novoGrupo : edicao.grupo || '').trim() || null;
    if (!nome) { setErro('Informe o nome.'); return; }
    if ((lista || []).some(x => x.id !== edicao.id && semAcento(x.nome.trim()) === semAcento(nome))) { setErro('Já existe um fornecedor com esse nome.'); return; }
    const cnpj = (edicao.cnpj || '').replace(/\D/g, '');
    if (cnpj && (lista || []).some(x => x.id !== edicao.id && (x.cnpj || '').replace(/\D/g, '') === cnpj)) { setErro('CNPJ já cadastrado.'); return; }
    const ciclo = edicao.ciclo_compra_dias == null || Number.isNaN(Number(edicao.ciclo_compra_dias)) ? null : Number(edicao.ciclo_compra_dias);
    if (ciclo !== null && (!Number.isInteger(ciclo) || ciclo < 1)) { setErro('Ciclo de compra deve ser um número inteiro de dias.'); return; }
    setSalvando(true); setErro(null);
    try {
      const valores: Record<string, unknown> = {
        nome, grupo, tipo: edicao.tipo || 'geral', modalidade: edicao.modalidade || 'entrega', telefone: (edicao.telefone || '').trim() || null, email: (edicao.email || '').trim() || null,
        responsavel: (edicao.responsavel || '').trim() || null, cnpj: (edicao.cnpj || '').trim() || null, categoria_padrao_id: edicao.categoria_padrao_id || null,
        ciclo_compra_dias: ciclo, dias_compra: edicao.dias_compra && edicao.dias_compra.length ? edicao.dias_compra : null,
        endereco: (edicao.endereco || '').trim() || null, observacoes: (edicao.observacoes || '').trim() || null,
      };
      if (!edicao.id) valores.status = 'ativo';
      await cadastrosApi.salvar('fornecedores', edicao.id || null, valores);
      setAviso(`"${nome}" salvo.`); setEdicao(null); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const dias = edicao?.dias_compra || [];
  const alternarDia = (d: number) => campo('dias_compra', dias.includes(d) ? dias.filter(x => x !== d) : [...dias, d].sort());

  return (
    <div className="max-w-5xl">
      <PageHeader caminho={['Estoque', 'Cadastros']} title="Fornecedores" subtitle={lista ? `${lista.filter(f => f.status !== 'inativo').length} ativos · cadastro compartilhado com o Financeiro` : ' '}
        actions={<Button variante="primario" icone={<Plus size={16} />} onClick={novo}>Novo fornecedor</Button>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input type="search" placeholder="Buscar por nome, grupo, CNPJ ou responsável" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[220px]" />
        <Segmented<Filtro> rotulo="Mostrar" valor={filtro} onMudar={setFiltro} opcoes={[{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'arquivados', rotulo: 'Arquivados' }, { valor: 'todos', rotulo: 'Todos' }]} />
      </div>
      {erro && !edicao && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!lista && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {lista && <ListaAgrupada grupos={agrupados} onAbrir={abrir} vazio="Nenhum fornecedor" filtrado={!!busca || filtro !== 'ativos'} />}

      <Modal aberto={!!edicao} onFechar={() => setEdicao(null)} titulo={edicao?.id ? 'Editar fornecedor' : 'Novo fornecedor'} largura="lg" travado={salvando}
        rodape={<>
          {edicao?.id && <Button variante="discreto" icone={<Trash2 size={14} />} onClick={() => setExcluir(edicao as Fornecedor)} className="mr-auto" style={{ color: 'var(--danger-text)' }}>Excluir…</Button>}
          <Button onClick={() => setEdicao(null)} disabled={salvando}>Cancelar</Button>
          <Button variante="primario" onClick={salvar} carregando={salvando}>Salvar</Button>
        </>}
      >
        {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
        {edicao && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input rotulo="Nome" value={edicao.nome || ''} onChange={e => campo('nome', e.target.value)} className="md:col-span-2" autoFocus />
            <Select rotulo="Grupo" value={edicao.grupo || ''} onChange={e => campo('grupo', e.target.value)}>
              <option value="">Sem grupo</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
              <option value={NOVO}>+ Novo grupo…</option>
            </Select>
            {edicao.grupo === NOVO ? <Input rotulo="Nome do novo grupo" value={novoGrupo} onChange={e => setNovoGrupo(e.target.value)} /> : (
              <Select rotulo="Tipo" value={edicao.tipo || 'geral'} onChange={e => campo('tipo', e.target.value)}>
                <option value="geral">Fornecedor</option><option value="musico">Músico / artista</option><option value="rh">RH / colaborador</option>
              </Select>
            )}
            {edicao.grupo === NOVO && (
              <Select rotulo="Tipo" value={edicao.tipo || 'geral'} onChange={e => campo('tipo', e.target.value)}>
                <option value="geral">Fornecedor</option><option value="musico">Músico / artista</option><option value="rh">RH / colaborador</option>
              </Select>
            )}
            <Select rotulo="Como compramos" value={edicao.modalidade || 'entrega'} onChange={e => campo('modalidade', e.target.value)}>
              <option value="entrega">Mandamos pedido, ele entrega</option><option value="rua">Comprador vai buscar</option>
            </Select>
            <Input rotulo="Telefone / WhatsApp" value={edicao.telefone || ''} onChange={e => campo('telefone', e.target.value)} inputMode="tel" />
            <Input rotulo="Responsável" value={edicao.responsavel || ''} onChange={e => campo('responsavel', e.target.value)} />
            <Input rotulo="E-mail" type="email" value={edicao.email || ''} onChange={e => campo('email', e.target.value)} />
            <Input rotulo="CNPJ" value={edicao.cnpj || ''} onChange={e => campo('cnpj', e.target.value)} />
            <Select rotulo="Categoria financeira" value={edicao.categoria_padrao_id || ''} onChange={e => campo('categoria_padrao_id', e.target.value || null)} className="md:col-span-2" dica="Para o lançamento no contas a pagar">
              <option value="">Nenhuma</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.caminho_completo || c.nome}</option>)}
            </Select>
            <Input rotulo="Ciclo de compra (dias)" type="number" min={1} step={1} value={edicao.ciclo_compra_dias ?? ''} onChange={e => campo('ciclo_compra_dias', e.target.value === '' ? null : Number(e.target.value))} dica="Vazio = compra quando precisa" />
            <div className="flex flex-col gap-1">
              <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Dias de compra</span>
              <div className="flex flex-wrap gap-1">{DIAS.map(d => <Chip key={d.id} ligado={dias.includes(d.id)} onMudar={() => alternarDia(d.id)}>{d.txt}</Chip>)}</div>
            </div>
            <Input rotulo="Endereço" value={edicao.endereco || ''} onChange={e => campo('endereco', e.target.value)} className="md:col-span-2" />
            <Input rotulo="Observações" value={edicao.observacoes || ''} onChange={e => campo('observacoes', e.target.value)} className="md:col-span-2" />
          </div>
        )}
      </Modal>

      <ExcluirModal tipo="fornecedor" id={excluir?.id ?? null} nome={excluir?.nome.trim() ?? ''} arquivado={excluir?.status === 'inativo'}
        onFechar={() => setExcluir(null)}
        onFeito={async m => { setExcluir(null); setEdicao(null); setAviso(m); await carregar(); }} />
    </div>
  );
};

export default Fornecedores;
