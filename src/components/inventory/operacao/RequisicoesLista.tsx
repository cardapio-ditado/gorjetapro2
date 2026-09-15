import { useState, useEffect, useCallback } from 'react';
import {
  Printer, Search, X, Eye, Download, Loader2, ChevronRight,
  AlertTriangle, PackageCheck,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { gerarImpressaoTermicaRequisicao } from '../../../utils/impressaoTermica';
import jsPDF from 'jspdf';

function fmtQtd(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(3)).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

interface ItemEstoque {
  id: string; nome: string; unidade_medida: string;
}

interface ItemRequisicao {
  id?: string; item_id: string;
  quantidade_solicitada: number; observacao?: string;
  itens_estoque?: ItemEstoque;
}

// Linha do modal de entrega: o estoquista informa quanto saiu de fato
interface LinhaEntrega {
  item_id: string; nome: string; um: string;
  solicitada: number; saldo_central: number | null;
  entregue: string;
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
  pendente:  'bg-green-500/15 text-green-300',
  aprovado:  'bg-green-500/15 text-green-300',
  rejeitado: 'bg-red-500/15 text-red-300',
  concluido: 'bg-blue-500/15 text-blue-300',
};
const STATUS_LABEL: Record<string, string> = {
  pendente: 'A entregar', aprovado: 'A entregar',
  rejeitado: 'Rejeitado', concluido: 'Concluído',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[status] || 'bg-white/10 text-white/50'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

const SELECT_REQ =
  '*, estoque_origem:estoques!requisicoes_internas_estoque_origem_id_fkey(nome), estoque_destino:estoques!requisicoes_internas_estoque_destino_id_fkey(nome)';

interface Props {
  modo: 'pendentes' | 'historico';
  onMudou?: () => void;
}

export default function RequisicoesLista({ modo, onMudou }: Props) {
  const [requisicoes, setRequisicoes]               = useState<Requisicao[]>([]);
  const [loading, setLoading]                       = useState(false);
  const [loadingImpressao, setLoadingImpressao]     = useState(false);
  const [busca, setBusca]                           = useState('');
  const [requisicaoDetalhes, setRequisicaoDetalhes] = useState<Requisicao | null>(null);
  const [mostrarDetalhes, setMostrarDetalhes]       = useState(false);

  // entrega
  const [entregaReq, setEntregaReq]               = useState<Requisicao | null>(null);
  const [entregaLinhas, setEntregaLinhas]         = useState<LinhaEntrega[]>([]);
  const [carregandoEntrega, setCarregandoEntrega] = useState(false);
  const [entregando, setEntregando]               = useState(false);
  const [erroEntrega, setErroEntrega]             = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('requisicoes_internas').select(SELECT_REQ);
      if (modo === 'pendentes') {
        q = q.in('status', ['pendente', 'aprovado']).order('data_requisicao', { ascending: true });
      } else {
        q = q.in('status', ['concluido', 'rejeitado'])
          .order('data_requisicao', { ascending: false })
          .limit(200);
      }
      const reqRes = await q;

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
        setRequisicoes(comItens as Requisicao[]);
      } else {
        setRequisicoes([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [modo]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // ─── Entrega item a item ───────────────────────────────────────────────────
  async function abrirEntrega(req: Requisicao) {
    setEntregaReq(req);
    setEntregaLinhas([]);
    setErroEntrega(null);
    setCarregandoEntrega(true);
    try {
      const { data: itensReq, error: errItens } = await supabase
        .from('requisicoes_internas_itens')
        .select('item_id, quantidade_solicitada, itens_estoque(nome, unidade_medida)')
        .eq('requisicao_id', req.id);
      if (errItens) throw errItens;

      const rows = (itensReq || []) as unknown as {
        item_id: string; quantidade_solicitada: number | string;
        itens_estoque: { nome: string; unidade_medida: string } | null;
      }[];
      const ids = rows.map(r => r.item_id);

      const saldoMap: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: saldos } = await supabase
          .from('saldos_estoque')
          .select('item_id, quantidade_atual')
          .eq('estoque_id', req.estoque_origem_id)
          .in('item_id', ids);
        ((saldos || []) as { item_id: string; quantidade_atual: number | string }[])
          .forEach(s => { saldoMap[s.item_id] = Number(s.quantidade_atual); });
      }

      setEntregaLinhas(rows.map(r => {
        const solicitada = Number(r.quantidade_solicitada) || 0;
        const saldo = saldoMap[r.item_id] ?? null;
        // Prefill com a solicitada, limitada ao que o Central tem
        const prefill = saldo !== null && saldo < solicitada ? Math.max(saldo, 0) : solicitada;
        return {
          item_id: r.item_id,
          nome: r.itens_estoque?.nome || '',
          um: r.itens_estoque?.unidade_medida || '',
          solicitada,
          saldo_central: saldo,
          entregue: String(prefill),
        };
      }));
    } catch (e) {
      console.error(e);
      setErroEntrega(e instanceof Error ? e.message : 'Erro ao carregar os itens da requisição');
    } finally {
      setCarregandoEntrega(false);
    }
  }

  function fecharEntrega() {
    setEntregaReq(null);
    setEntregaLinhas([]);
    setErroEntrega(null);
  }

  function entregarTudo() {
    setEntregaLinhas(prev => prev.map(l => ({ ...l, entregue: String(l.solicitada) })));
  }

  async function confirmarEntrega() {
    if (!entregaReq) return;
    setEntregando(true);
    setErroEntrega(null);
    try {
      const p_itens = entregaLinhas.map(l => {
        const n = Number(String(l.entregue).replace(',', '.'));
        return { item_id: l.item_id, entregue: isNaN(n) || n < 0 ? 0 : n };
      });
      const { error } = await supabase.rpc('fn_requisicao_entregar', {
        p_requisicao_id: entregaReq.id,
        p_itens,
      });
      if (error) throw error;
      fecharEntrega();
      carregarDados();
      onMudou?.();
    } catch (e) {
      console.error(e);
      setErroEntrega(e instanceof Error ? e.message : 'Erro ao registrar a entrega');
    } finally {
      setEntregando(false);
    }
  }

  async function visualizarDetalhes(id: string) {
    setLoading(true);
    try {
      const { data: req } = await supabase
        .from('requisicoes_internas')
        .select(SELECT_REQ)
        .eq('id', id).maybeSingle();

      if (!req) { alert('Requisição não encontrada'); return; }

      const { data: itensReq } = await supabase
        .from('requisicoes_internas_itens')
        .select('*, itens_estoque(id, nome, unidade_medida)')
        .eq('requisicao_id', id);

      setRequisicaoDetalhes({ ...req, itens: itensReq || [] } as Requisicao);
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
        .select(SELECT_REQ)
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

  const requisicoesFiltradas = requisicoes.filter(req =>
    (req.numero_requisicao || '').toLowerCase().includes(busca.toLowerCase()) ||
    (req.funcionario_nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (req.setor || '').toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-4">

      {/* Busca */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por número, funcionário ou setor..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/20 text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-wine/30"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : requisicoesFiltradas.length === 0 ? (
          <p className="text-center text-white/60 py-12">
            {modo === 'pendentes'
              ? 'Nenhuma transferência aguardando entrega.'
              : 'Nenhuma transferência no histórico.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  {['Número', 'Data', 'Funcionário', 'Setor', 'De → Para', 'Itens', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requisicoesFiltradas.map(req => (
                  <tr key={req.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-white whitespace-nowrap">
                      {req.numero_requisicao}
                      {req.criado_anonimamente && (
                        <span className="ml-2 px-1.5 py-0.5 bg-blue-500/15 text-blue-300 text-caption rounded-full">Público</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50 whitespace-nowrap">
                      {new Date(req.data_requisicao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{req.funcionario_nome}</td>
                    <td className="px-4 py-3 text-sm text-white/50 whitespace-nowrap">{req.setor}</td>
                    <td className="px-4 py-3 text-xs text-white/60 whitespace-nowrap">
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
                        {modo === 'pendentes' && (req.status === 'pendente' || req.status === 'aprovado') && (
                          <button onClick={() => abrirEntrega(req)} className="flex items-center gap-1 px-2 py-1.5 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg text-xs font-semibold" title="Registrar entrega">
                            <PackageCheck className="w-4 h-4" /> Entregar
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
                    <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">{label}</p>
                    {label === 'Status'
                      ? <StatusBadge status={requisicaoDetalhes.status} />
                      : <p className="text-sm text-white">{value as string}</p>
                    }
                  </div>
                ))}
              </div>

              {requisicaoDetalhes.observacoes && (
                <div>
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">Observações</p>
                  <p className="text-sm text-white/70 bg-white/5 rounded-xl p-3">{requisicaoDetalhes.observacoes}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">
                  Itens ({requisicaoDetalhes.itens?.length || 0})
                </p>
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-white/5">
                      <tr>
                        {['Item', 'Un', 'Qtd Solicitada', 'Obs'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/60 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(requisicaoDetalhes.itens || []).map((item, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2.5 text-sm text-white">{item.itens_estoque?.nome}</td>
                          <td className="px-4 py-2.5 text-sm text-white/50">{item.itens_estoque?.unidade_medida}</td>
                          <td className="px-4 py-2.5 text-sm font-semibold text-white tabular-nums">{fmtQtd(item.quantidade_solicitada)}</td>
                          <td className="px-4 py-2.5 text-sm text-white/60">{item.observacao || '—'}</td>
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
                  className="flex items-center gap-2 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#6a1a25] text-sm font-semibold">
                  <Download className="w-4 h-4" /> Baixar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Entregar */}
      {modo === 'pendentes' && entregaReq && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">Entregar {entregaReq.numero_requisicao}</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  {entregaReq.estoque_origem?.nome} → {entregaReq.estoque_destino?.nome} · {entregaReq.funcionario_nome}
                </p>
              </div>
              <button onClick={fecharEntrega} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-xs text-white/50">
                Informe o que saiu de fato do {entregaReq.estoque_origem?.nome || 'Central'}. Zero = item não entregue. O estoque é movimentado com o que for entregue.
              </p>

              {carregandoEntrega ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-white/30" />
                </div>
              ) : entregaLinhas.length === 0 ? (
                <p className="text-center text-white/50 py-8">Requisição sem itens.</p>
              ) : (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-white/5">
                      <tr>
                        {['Item', 'Solicitada', 'Central', 'Entregue'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/60 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {entregaLinhas.map((l, i) => {
                        const semSaldo = l.saldo_central !== null && l.saldo_central < l.solicitada;
                        return (
                          <tr key={l.item_id}>
                            <td className="px-4 py-2.5 text-sm text-white">
                              {l.nome} <span className="text-white/40">{l.um}</span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-white/70 tabular-nums">{fmtQtd(l.solicitada)}</td>
                            <td className={`px-4 py-2.5 text-sm tabular-nums ${semSaldo ? 'text-amber-300' : 'text-white/70'}`}>
                              {l.saldo_central === null ? '—' : fmtQtd(l.saldo_central)}
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                type="number" step="0.01" min="0"
                                value={l.entregue}
                                onChange={e => {
                                  const v = e.target.value;
                                  setEntregaLinhas(prev => prev.map((x, j) => j === i ? { ...x, entregue: v } : x));
                                }}
                                className="w-24 bg-white/5 border border-white/20 text-white rounded-lg px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-wine/30"
                              />
                              {semSaldo && (
                                <p className="text-caption text-amber-300 mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Central tem só {fmtQtd(l.saldo_central)}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {erroEntrega && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{erroEntrega}</span>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-white/10 flex flex-wrap justify-between items-center gap-3">
              <button onClick={fecharEntrega} disabled={entregando}
                className="px-4 py-2 border border-white/20 text-white/80 rounded-xl hover:bg-white/5 text-sm font-semibold">
                Cancelar
              </button>
              <div className="flex gap-2">
                <button onClick={entregarTudo} disabled={entregando || entregaLinhas.length === 0}
                  className="px-4 py-2 border border-white/20 text-white/80 rounded-xl hover:bg-white/5 text-sm font-semibold disabled:opacity-40">
                  Entregar tudo
                </button>
                <button onClick={confirmarEntrega} disabled={entregando || carregandoEntrega || entregaLinhas.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-wine text-white rounded-xl hover:bg-[#6a1a25] text-sm font-semibold disabled:opacity-40">
                  {entregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                  {entregando ? 'Registrando...' : 'Confirmar entrega'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
