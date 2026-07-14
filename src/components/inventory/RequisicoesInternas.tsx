import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, FileText, Printer, Search, Filter, X, Trash2,
  CheckCircle, Eye, Download, QrCode, Loader2, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { gerarImpressaoTermicaRequisicao } from '../../utils/impressaoTermica';
import { SearchableSelect } from '../common/SearchableSelect';
import jsPDF from 'jspdf';

function fmtQtd(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(3)).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

interface Estoque { id: string; nome: string; tipo: string; }

interface ItemEstoque {
  id: string; nome: string; unidade_medida: string;
  custo_medio: number; categoria: string | null;
}

interface ItemEstoqueComSaldo extends ItemEstoque {
  saldo: number | null;
}

interface ItemRequisicao {
  id?: string; item_id: string;
  quantidade_solicitada: number; observacao?: string;
  itens_estoque?: ItemEstoque;
}

interface Requisicao {
  id: string; numero_requisicao: string; data_requisicao: string;
  funcionario_nome: string; setor: string;
  estoque_origem_id: string; estoque_destino_id: string;
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'concluido';
  observacoes?: string; whatsapp?: string; criado_anonimamente?: boolean;
  estoque_origem?: { nome: string }; estoque_destino?: { nome: string };
  itens?: ItemRequisicao[];
}

const STATUS_BADGE: Record<string, string> = {
  pendente:  'bg-yellow-500/15 text-yellow-300',
  aprovado:  'bg-green-500/15 text-green-300',
  rejeitado: 'bg-red-500/15 text-red-300',
  concluido: 'bg-blue-500/15 text-blue-300',
};
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado',
  rejeitado: 'Rejeitado', concluido: 'Concluído',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[status] || 'bg-white/10 text-white/50'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function RequisicoesInternas() {
  const [mostrarFormulario, setMostrarFormulario]   = useState(false);
  const [requisicoes, setRequisicoes]               = useState<Requisicao[]>([]);
  const [estoques, setEstoques]                     = useState<Estoque[]>([]);
  const [todosItens, setTodosItens]                 = useState<ItemEstoque[]>([]);
  const [itensComSaldo, setItensComSaldo]           = useState<ItemEstoqueComSaldo[]>([]);
  const [loadingSaldos, setLoadingSaldos]           = useState(false);
  const [loading, setLoading]                       = useState(false);
  const [loadingImpressao, setLoadingImpressao]     = useState(false);
  const [filtroStatus, setFiltroStatus]             = useState('todos');
  const [busca, setBusca]                           = useState('');
  const [requisicaoDetalhes, setRequisicaoDetalhes] = useState<Requisicao | null>(null);
  const [mostrarDetalhes, setMostrarDetalhes]       = useState(false);

  // form
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [setor, setSetor]                     = useState('');
  const [estoqueOrigemId, setEstoqueOrigemId] = useState('');
  const [estoqueDestinoId, setEstoqueDestinoId] = useState('');
  const [observacoes, setObservacoes]         = useState('');
  const [itens, setItens]                     = useState<ItemRequisicao[]>([]);
  const [itemSelecionado, setItemSelecionado] = useState('');
  const [quantidadeItem, setQuantidadeItem]   = useState('');
  const [observacaoItem, setObservacaoItem]   = useState('');

  useEffect(() => { carregarDados(); }, [filtroStatus]);

  // Carregar saldos quando o estoque de origem muda — APENAS INFORMATIVO
  useEffect(() => {
    if (!estoqueOrigemId) { setItensComSaldo([]); return; }
    carregarSaldosInformativos();
  }, [estoqueOrigemId, todosItens]);

  async function carregarDados() {
    setLoading(true);
    try {
      const [estRes, itensRes, reqRes] = await Promise.all([
        supabase.from('estoques').select('id, nome, tipo').eq('status', true).order('nome'),
        // CORRETO: todos os insumos ativos, SEM filtro de saldo
        supabase.from('itens_estoque')
          .select('id, nome, unidade_medida, custo_medio, categoria')
          .eq('status', 'ativo')
          .eq('tipo_item', 'insumo')
          .order('nome'),
        (() => {
          let q = supabase
            .from('requisicoes_internas')
            .select('*, estoque_origem:estoques!requisicoes_internas_estoque_origem_id_fkey(nome), estoque_destino:estoques!requisicoes_internas_estoque_destino_id_fkey(nome)')
            .order('data_requisicao', { ascending: false });
          if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus);
          return q;
        })(),
      ]);

      if (estRes.data) setEstoques(estRes.data);
      if (itensRes.data) setTodosItens(itensRes.data);

      if (reqRes.data) {
        const comItens = await Promise.all(
          reqRes.data.map(async req => {
            const { data: itensReq } = await supabase
              .from('requisicoes_internas_itens')
              .select('*, itens_estoque(id, nome, unidade_medida)')
              .eq('requisicao_id', req.id);
            return { ...req, itens: itensReq || [] };
          })
        );
        setRequisicoes(comItens);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function carregarSaldosInformativos() {
    if (!estoqueOrigemId || todosItens.length === 0) return;
    setLoadingSaldos(true);
    // Buscar saldos do cache para exibição informativa (NÃO bloqueia seleção)
    const { data: saldos } = await supabase
      .from('saldos_estoque')
      .select('item_id, quantidade_atual')
      .eq('estoque_id', estoqueOrigemId);

    const saldoMap: Record<string, number> = {};
    (saldos || []).forEach((s: any) => { saldoMap[s.item_id] = Number(s.quantidade_atual); });

    setItensComSaldo(todosItens.map(item => ({
      ...item,
      saldo: saldoMap[item.id] ?? null,
    })));
    setLoadingSaldos(false);
  }

  function adicionarItem() {
    if (!itemSelecionado || !quantidadeItem || parseFloat(quantidadeItem) <= 0) {
      alert('Selecione um item e informe a quantidade');
      return;
    }
    // Não bloquear por saldo — permitir qualquer item ativo
    const itemInfo = todosItens.find(i => i.id === itemSelecionado);
    if (!itemInfo) return;

    const jaAdicionado = itens.some(i => i.item_id === itemSelecionado);
    if (jaAdicionado) { alert('Este item já foi adicionado à requisição'); return; }

    setItens(prev => [...prev, {
      item_id: itemSelecionado,
      quantidade_solicitada: parseFloat(quantidadeItem),
      observacao: observacaoItem || undefined,
      itens_estoque: itemInfo,
    }]);
    setItemSelecionado('');
    setQuantidadeItem('');
    setObservacaoItem('');
  }

  function removerItem(index: number) {
    setItens(prev => prev.filter((_, i) => i !== index));
  }

  async function salvarRequisicao() {
    if (!funcionarioNome || !setor || !estoqueOrigemId || !estoqueDestinoId || itens.length === 0) {
      alert('Preencha todos os campos obrigatórios e adicione pelo menos um item');
      return;
    }
    setLoading(true);
    try {
      const { data: requisicao, error: reqError } = await supabase
        .from('requisicoes_internas')
        .insert({
          numero_requisicao: '',
          funcionario_nome: funcionarioNome,
          setor, estoque_origem_id: estoqueOrigemId,
          estoque_destino_id: estoqueDestinoId,
          observacoes: observacoes || null,
          status: 'pendente',
        })
        .select().single();

      if (reqError) throw reqError;

      const { error: itensError } = await supabase
        .from('requisicoes_internas_itens')
        .insert(itens.map(item => ({
          requisicao_id: requisicao.id,
          item_id: item.item_id,
          quantidade_solicitada: item.quantidade_solicitada,
          observacao: item.observacao || null,
        })));

      if (itensError) throw itensError;

      limparFormulario();
      setMostrarFormulario(false);
      carregarDados();

      if (confirm('Deseja imprimir a requisição?')) {
        imprimirRequisicao(requisicao.id);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar requisição');
    } finally {
      setLoading(false);
    }
  }

  async function concluirTransferencia(id: string) {
    if (!confirm('Confirma a conclusão desta transferência? Os itens serão movimentados entre os estoques.')) return;
    setLoading(true);
    try {
      const { data: req } = await supabase
        .from('requisicoes_internas')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();

      if (!req) { alert('Requisição não encontrada'); return; }
      if (req.status === 'concluido') { alert('Esta requisição já foi concluída'); return; }

      const { error } = await supabase
        .from('requisicoes_internas')
        .update({ status: 'concluido', data_conclusao: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      carregarDados();
    } catch (e) {
      console.error(e);
      alert('Erro ao concluir transferência');
    } finally {
      setLoading(false);
    }
  }

  async function visualizarDetalhes(id: string) {
    setLoading(true);
    try {
      const { data: req } = await supabase
        .from('requisicoes_internas')
        .select('*, estoque_origem:estoques!requisicoes_internas_estoque_origem_id_fkey(nome), estoque_destino:estoques!requisicoes_internas_estoque_destino_id_fkey(nome)')
        .eq('id', id).maybeSingle();

      if (!req) { alert('Requisição não encontrada'); return; }

      const { data: itensReq } = await supabase
        .from('requisicoes_internas_itens')
        .select('*, itens_estoque(id, nome, unidade_medida)')
        .eq('requisicao_id', id);

      setRequisicaoDetalhes({ ...req, itens: itensReq || [] });
      setMostrarDetalhes(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function imprimirRequisicao(id: string) {
    setLoadingImpressao(true);
    try {
      const { data: req } = await supabase
        .from('requisicoes_internas')
        .select('*, estoque_origem:estoques!requisicoes_internas_estoque_origem_id_fkey(nome), estoque_destino:estoques!requisicoes_internas_estoque_destino_id_fkey(nome)')
        .eq('id', id).maybeSingle();

      if (!req) { alert('Requisição não encontrada'); return; }

      const { data: itensReq } = await supabase
        .from('requisicoes_internas_itens')
        .select('*, itens_estoque(id, nome, unidade_medida)')
        .eq('requisicao_id', id);

      await new Promise(r => setTimeout(r, 300));
      gerarImpressaoTermicaRequisicao({ ...req, itens: itensReq || [] });
    } catch (e) {
      console.error(e);
      alert('Erro ao imprimir');
    } finally {
      setLoadingImpressao(false);
    }
  }

  async function gerarPDF(req: Requisicao) {
    const pdf = new jsPDF();
    const pw = pdf.internal.pageSize.getWidth();
    let y = 20;

    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
    pdf.text('Ditado Popular — Requisição Interna', pw / 2, y, { align: 'center' });
    y += 10;
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
    pdf.text(`Nº ${req.numero_requisicao}  |  ${new Date(req.data_requisicao).toLocaleDateString('pt-BR')}`, pw / 2, y, { align: 'center' });
    y += 8; pdf.line(20, y, pw - 20, y); y += 8;

    const fields = [
      ['Funcionário', req.funcionario_nome], ['Setor', req.setor],
      ['De', req.estoque_origem?.nome || ''], ['Para', req.estoque_destino?.nome || ''],
      ['Status', STATUS_LABEL[req.status] || req.status],
    ];
    fields.forEach(([k, v]) => {
      pdf.setFont('helvetica', 'bold'); pdf.text(k + ':', 20, y);
      pdf.setFont('helvetica', 'normal'); pdf.text(v, 55, y);
      y += 7;
    });

    y += 5; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
    pdf.text('Itens Requisitados', 20, y); y += 7;
    pdf.setFontSize(9);
    pdf.setFillColor(230, 230, 230); pdf.rect(20, y - 4, pw - 40, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Item', 22, y); pdf.text('Un', 130, y); pdf.text('Qtd', 155, y);
    y += 7; pdf.setFont('helvetica', 'normal');

    (req.itens || []).forEach((item, idx) => {
      if (y > 270) { pdf.addPage(); y = 20; }
      if (idx % 2 === 0) { pdf.setFillColor(250, 250, 250); pdf.rect(20, y - 4, pw - 40, 7, 'F'); }
      const nome = (item.itens_estoque?.nome || '').substring(0, 55);
      pdf.text(nome, 22, y);
      pdf.text(item.itens_estoque?.unidade_medida || '-', 130, y);
      pdf.text(String(item.quantidade_solicitada), 155, y);
      y += 7;
    });

    pdf.save(`Requisicao_${req.numero_requisicao}.pdf`);
  }

  function limparFormulario() {
    setFuncionarioNome(''); setSetor('');
    setEstoqueOrigemId(''); setEstoqueDestinoId('');
    setObservacoes(''); setItens([]);
    setItemSelecionado(''); setQuantidadeItem(''); setObservacaoItem('');
  }

  const requisicoesFiltradas = requisicoes.filter(req =>
    req.numero_requisicao.toLowerCase().includes(busca.toLowerCase()) ||
    req.funcionario_nome.toLowerCase().includes(busca.toLowerCase()) ||
    req.setor.toLowerCase().includes(busca.toLowerCase())
  );

  const itemAtualSaldo = itensComSaldo.find(i => i.id === itemSelecionado);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Requisições Internas</h2>
          <p className="text-sm text-white/50 mt-0.5">Transferências entre estoques</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.open('/cartaz-requisicao', '_blank')}
            className="flex items-center gap-2 border border-white/20 text-white/80 px-4 py-2 rounded-xl hover:bg-white/5 text-sm font-semibold"
          >
            <QrCode className="w-4 h-4" /> Gerar Cartaz
          </button>
          <button
            onClick={() => setMostrarFormulario(true)}
            className="flex items-center gap-2 bg-[#7D1F2C] text-white px-4 py-2 rounded-xl hover:bg-[#6a1a25] text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Nova Requisição
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por número, funcionário ou setor..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/20 text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"
          />
        </div>
        <SearchableSelect
          options={[
            { value: 'todos', label: 'Todos os Status' },
            { value: 'pendente', label: 'Pendente' },
            { value: 'aprovado', label: 'Aprovado' },
            { value: 'rejeitado', label: 'Rejeitado' },
            { value: 'concluido', label: 'Concluído' },
          ]}
          value={filtroStatus} onChange={setFiltroStatus}
          placeholder="Todos os Status" className="w-44"
        />
      </div>

      {/* Tabela */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : requisicoesFiltradas.length === 0 ? (
          <p className="text-center text-white/30 py-12">Nenhuma requisição encontrada</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  {['Número', 'Data', 'Funcionário', 'Setor', 'De → Para', 'Itens', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requisicoesFiltradas.map(req => (
                  <tr key={req.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-white whitespace-nowrap">
                      {req.numero_requisicao}
                      {req.criado_anonimamente && (
                        <span className="ml-2 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 text-[10px] rounded-full">Público</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50 whitespace-nowrap">
                      {new Date(req.data_requisicao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{req.funcionario_nome}</td>
                    <td className="px-4 py-3 text-sm text-white/50 whitespace-nowrap">{req.setor}</td>
                    <td className="px-4 py-3 text-xs text-white/40 whitespace-nowrap">
                      <div>{req.estoque_origem?.nome}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <ChevronRight className="w-3 h-3" />{req.estoque_destino?.nome}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50">{req.itens?.length || 0}</td>
                    <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => visualizarDetalhes(req.id)} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg" title="Ver Detalhes">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => imprimirRequisicao(req.id)} disabled={loadingImpressao} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg" title="Imprimir">
                          <Printer className="w-4 h-4" />
                        </button>
                        {req.status === 'pendente' && (
                          <button onClick={() => concluirTransferencia(req.id)} className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg" title="Concluir">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detalhes */}
      {mostrarDetalhes && requisicaoDetalhes && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Requisição {requisicaoDetalhes.numero_requisicao}</h3>
              <button onClick={() => { setMostrarDetalhes(false); setRequisicaoDetalhes(null); }} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Data', new Date(requisicaoDetalhes.data_requisicao).toLocaleDateString('pt-BR')],
                  ['Status', null],
                  ['Funcionário', requisicaoDetalhes.funcionario_nome],
                  ['Setor', requisicaoDetalhes.setor],
                  ['De', requisicaoDetalhes.estoque_origem?.nome || '—'],
                  ['Para', requisicaoDetalhes.estoque_destino?.nome || '—'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">{label}</p>
                    {label === 'Status'
                      ? <StatusBadge status={requisicaoDetalhes.status} />
                      : <p className="text-sm text-white">{value as string}</p>
                    }
                  </div>
                ))}
              </div>

              {requisicaoDetalhes.observacoes && (
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">Observações</p>
                  <p className="text-sm text-white/70 bg-white/5 rounded-xl p-3">{requisicaoDetalhes.observacoes}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
                  Itens ({requisicaoDetalhes.itens?.length || 0})
                </p>
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-white/5">
                      <tr>
                        {['Item', 'Un', 'Qtd Solicitada', 'Obs'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(requisicaoDetalhes.itens || []).map((item, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5 text-sm text-white">{item.itens_estoque?.nome}</td>
                          <td className="px-4 py-2.5 text-sm text-white/50">{item.itens_estoque?.unidade_medida}</td>
                          <td className="px-4 py-2.5 text-sm font-semibold text-white tabular-nums">{fmtQtd(item.quantidade_solicitada)}</td>
                          <td className="px-4 py-2.5 text-sm text-white/40">{item.observacao || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex justify-between items-center">
              <button onClick={() => { setMostrarDetalhes(false); setRequisicaoDetalhes(null); }}
                className="px-4 py-2 border border-white/20 text-white/80 rounded-xl hover:bg-white/5 text-sm font-semibold">
                Fechar
              </button>
              <div className="flex gap-2">
                <button onClick={() => imprimirRequisicao(requisicaoDetalhes.id)} disabled={loadingImpressao}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold disabled:opacity-50">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button onClick={() => gerarPDF(requisicaoDetalhes)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] text-sm font-semibold">
                  <Download className="w-4 h-4" /> Baixar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Requisição */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Nova Requisição Interna</h3>
              <button onClick={() => { setMostrarFormulario(false); limparFormulario(); }} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Dados básicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-1.5">Nome do Funcionário *</label>
                  <input type="text" value={funcionarioNome} onChange={e => setFuncionarioNome(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"
                    placeholder="Digite o nome" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-1.5">Setor *</label>
                  <input type="text" value={setor} onChange={e => setSetor(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"
                    placeholder="Digite o setor" />
                </div>
                <div>
                  <SearchableSelect
                    label="Estoque de Origem *"
                    options={estoques.map(e => ({ value: e.id, label: e.nome }))}
                    value={estoqueOrigemId} onChange={setEstoqueOrigemId}
                    placeholder="Selecione..." required className="w-full"
                  />
                </div>
                <div>
                  <SearchableSelect
                    label="Estoque de Destino *"
                    options={estoques.map(e => ({ value: e.id, label: e.nome }))}
                    value={estoqueDestinoId} onChange={setEstoqueDestinoId}
                    placeholder="Selecione..." required className="w-full"
                  />
                </div>
              </div>

              {/* Adicionar itens */}
              <div className="border-t border-white/10 pt-5">
                <h4 className="font-semibold text-white mb-3">Adicionar Itens</h4>

                {!estoqueOrigemId && (
                  <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300">
                    Selecione o estoque de origem para ver os saldos informativos
                  </div>
                )}

                {estoqueOrigemId && (
                  <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300">
                    Todos os insumos ativos estão disponíveis para requisição. O saldo exibido é informativo — não bloqueia a seleção.
                    {loadingSaldos && <span className="ml-2 opacity-60">Carregando saldos...</span>}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5">
                    <SearchableSelect
                      options={(estoqueOrigemId ? itensComSaldo : todosItens).map(item => {
                        const saldo = 'saldo' in item ? item.saldo : null;
                        return {
                          value: item.id,
                          label: item.nome,
                          sublabel: saldo !== null
                            ? `Saldo: ${fmtQtd(saldo)} ${item.unidade_medida}${saldo < 0 ? ' ⚠️' : ''}`
                            : item.unidade_medida,
                        };
                      })}
                      value={itemSelecionado} onChange={setItemSelecionado}
                      placeholder="Selecione o item..." className="w-full"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input type="number" step="0.01" min="0.01"
                      value={quantidadeItem} onChange={e => setQuantidadeItem(e.target.value)}
                      placeholder="Qtd"
                      className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30" />
                    {itemAtualSaldo && itemAtualSaldo.saldo !== null && (
                      <p className={`text-[11px] mt-1 ${(itemAtualSaldo.saldo ?? 0) < 0 ? 'text-red-400' : 'text-white/40'}`}>
                        Saldo: {fmtQtd(itemAtualSaldo.saldo)} {itemAtualSaldo.unidade_medida}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-3">
                    <input type="text" value={observacaoItem} onChange={e => setObservacaoItem(e.target.value)}
                      placeholder="Observação (opcional)"
                      className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30" />
                  </div>
                  <div className="md:col-span-2">
                    <button onClick={adicionarItem}
                      className="w-full flex items-center justify-center gap-2 bg-[#7D1F2C] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#6a1a25]">
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {/* Itens adicionados */}
              {itens.length > 0 && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-white/5">
                      <tr>
                        {['Item', 'Un', 'Qtd', 'Obs', ''].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {itens.map((item, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5 text-sm text-white">{item.itens_estoque?.nome}</td>
                          <td className="px-4 py-2.5 text-sm text-white/50">{item.itens_estoque?.unidade_medida}</td>
                          <td className="px-4 py-2.5 text-sm font-semibold text-white tabular-nums">{fmtQtd(item.quantidade_solicitada)}</td>
                          <td className="px-4 py-2.5 text-sm text-white/40">{item.observacao || '—'}</td>
                          <td className="px-4 py-2.5">
                            <button onClick={() => removerItem(i)} className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-1.5">Observações Gerais</label>
                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3}
                  className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 resize-none"
                  placeholder="Observações adicionais..." />
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => { setMostrarFormulario(false); limparFormulario(); }} disabled={loading}
                className="px-4 py-2 border border-white/20 text-white/80 rounded-xl hover:bg-white/5 text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={salvarRequisicao} disabled={loading || itens.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] text-sm font-semibold disabled:opacity-40">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {loading ? 'Salvando...' : 'Criar Requisição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
