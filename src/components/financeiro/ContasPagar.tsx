import React, { useState, useEffect } from 'react';
import { Plus, Search, DollarSign, Eye, CreditCard as Edit, Trash2, CheckSquare, XSquare, Clock, AlertTriangle, CheckCircle, XCircle, Download, FileText, Star, MessageSquare, Receipt, Target, Activity, Sparkles, Calendar } from 'lucide-react';
import { supabase, testConnection } from '../../lib/supabase';
import { ReportGenerator, exportToExcel, formatCurrency } from '../../utils/reportGenerator';
import dayjs from 'dayjs';
import ImportarBoletoIA from './ImportarBoletoIA';
import LancamentoLoteIA from './LancamentoLoteIA';
import ModalVisualizarConta from './ModalVisualizarConta';
import { sugerirCategoria } from '../../services/aiCategorizacao';
import { detectarDuplicatas } from '../../services/aiDetectorDuplicatas';
import { SearchableSelect } from '../common/SearchableSelect';

interface ContaPagar {
  id: string; fornecedor_id: string; fornecedor_nome: string; descricao: string;
  categoria_id?: string; categoria_nome?: string; centro_custo_id?: string; centro_custo_nome?: string;
  forma_pagamento_id?: string; forma_pagamento_nome?: string;
  valor_total: number; valor_pago: number; saldo_restante: number;
  valor_original?: number; valor_final?: number; desconto?: number; juros?: number;
  data_vencimento: string; data_emissao: string; data_primeira_baixa?: string; data_baixa_integral?: string;
  numero_documento?: string;
  status: 'em_aberto'|'parcialmente_pago'|'pago'|'vencido'|'cancelado'|'autorizado_pagamento';
  aprovado_para_pagamento: boolean; aprovado_por?: string; data_aprovacao?: string;
  observacoes?: string; prioridade_sugerida?: 'baixa'|'media'|'alta'|'urgente';
  observacao_tesouraria?: string; observacao_aprovacao?: string;
  sugerido_por?: string; data_sugestao?: string;
  esta_vencida: boolean; dias_vencimento: number;
  situacao_vencimento?: 'atrasada'|'vence_hoje'|'vence_em_breve'|'no_prazo'|'paga'|'cancelada';
  dias_para_vencer?: number; criado_em: string;
  criado_por_nome?: string; sugerido_por_nome?: string; aprovado_por_nome?: string;
  eh_recorrente?: boolean; frequencia_recorrencia?: string; dia_vencimento_recorrente?: number;
  recorrencia_ativa?: boolean; data_inicio_recorrencia?: string; data_fim_recorrencia?: string;
  eh_parcelado?: boolean; numero_parcela?: number; total_parcelas?: number; parcelamento_grupo_id?: string;
  pagamentos_historico?: any[]; total_pagamentos_parciais?: number;
}
interface FormData {
  fornecedor_id: string; descricao: string; categoria_id: string; centro_custo_id: string;
  forma_pagamento_id: string; valor_total: number; desconto: number; juros: number;
  data_emissao: string; data_vencimento: string; numero_documento: string; observacoes: string;
  prioridade_sugerida: 'baixa'|'media'|'alta'|'urgente'; observacao_tesouraria: string;
  eh_recorrente: boolean; frequencia_recorrencia: string; dia_vencimento_recorrente: number;
  data_fim_recorrencia: string; eh_parcelado: boolean; total_parcelas: number;
}
interface BaixaModal {
  isOpen: boolean; conta: ContaPagar|null; valorPagamento: number; dataPagamento: string;
  formaPagamentoId: string; contaBancariaId: string; numeroComprovante: string; observacoes: string;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const S = {
  card:'#12141f', border:'rgba(255,255,255,0.06)', label:'rgba(255,255,255,0.35)',
  text:'rgba(255,255,255,0.85)', muted:'rgba(255,255,255,0.5)',
  green:'#4ade80', red:'#f87171', blue:'#60a5fa', gold:'#D4AF37', orange:'#fb923c', amber:'#fbbf24',
  greenBg:'rgba(74,222,128,0.08)', redBg:'rgba(248,113,113,0.08)',
  blueBg:'rgba(96,165,250,0.08)', goldBg:'rgba(212,175,55,0.08)', orangeBg:'rgba(251,146,60,0.08)',
  greenBorder:'rgba(74,222,128,0.15)', redBorder:'rgba(248,113,113,0.15)',
  blueBorder:'rgba(96,165,250,0.15)', goldBorder:'rgba(212,175,55,0.15)', orangeBorder:'rgba(251,146,60,0.15)',
  wine:'#7D1F2C', modalBg:'#0f1020',
};

const inputStyle: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'7px 12px', color:S.text, fontSize:12, outline:'none', width:'100%', boxSizing:'border-box' };
const labelStyle: React.CSSProperties = { color:S.label, fontSize:11, marginBottom:4, display:'block' };
const fStyle: React.CSSProperties = { display:'flex', flexDirection:'column', gap:2 };

const STATUS_MAP: Record<string, { label:string; color:string; bg:string; icon:React.ElementType }> = {
  pago:                 { label:'Pago',        color:S.green,  bg:'rgba(74,222,128,0.12)',  icon:CheckCircle },
  em_aberto:            { label:'Em Aberto',   color:S.blue,   bg:'rgba(96,165,250,0.12)',  icon:Clock },
  parcialmente_pago:    { label:'Parcial',     color:S.gold,   bg:'rgba(212,175,55,0.12)',  icon:AlertTriangle },
  vencido:              { label:'Vencido',     color:S.red,    bg:'rgba(248,113,113,0.12)', icon:XCircle },
  cancelado:            { label:'Cancelado',   color:S.muted,  bg:'rgba(255,255,255,0.06)', icon:FileText },
  autorizado_pagamento: { label:'Autorizado',  color:'#2dd4bf',bg:'rgba(45,212,191,0.12)', icon:CheckSquare },
  atrasada:             { label:'Atrasada',    color:S.red,    bg:'rgba(248,113,113,0.12)', icon:AlertTriangle },
  vence_hoje:           { label:'Vence Hoje',  color:S.amber,  bg:'rgba(251,191,36,0.12)', icon:Clock },
  vence_em_breve:       { label:'Prox. Venc.', color:S.orange, bg:'rgba(251,146,60,0.12)', icon:Clock },
};

const PRIORIDADE_MAP: Record<string, { color:string; bg:string }> = {
  urgente: { color:S.red,    bg:'rgba(248,113,113,0.12)' },
  alta:    { color:S.orange, bg:'rgba(251,146,60,0.12)' },
  media:   { color:S.gold,   bg:'rgba(212,175,55,0.12)' },
  baixa:   { color:S.green,  bg:'rgba(74,222,128,0.12)' },
};

const getStatusInfo = (conta: ContaPagar) => {
  if (conta.saldo_restante<=0 && conta.status!=='cancelado') return STATUS_MAP['pago'];
  if (conta.situacao_vencimento && STATUS_MAP[conta.situacao_vencimento]) return STATUS_MAP[conta.situacao_vencimento];
  return STATUS_MAP[conta.status] || STATUS_MAP['em_aberto'];
};

const ContasPagar: React.FC = () => {
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [indicadores, setIndicadores] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingConta, setEditingConta] = useState<ContaPagar|null>(null);
  const [showIAModal, setShowIAModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [situacaoFilter, setSituacaoFilter] = useState('all');
  const [fornecedorFilter, setFornecedorFilter] = useState('all');
  const [prioridadeFilter, setPrioridadeFilter] = useState('all');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<any[]>([]);
  const [contasBancarias, setContasBancarias] = useState<any[]>([]);
  const [baixaModal, setBaixaModal] = useState<BaixaModal>({ isOpen:false, conta:null, valorPagamento:0, dataPagamento:dayjs().format('YYYY-MM-DD'), formaPagamentoId:'', contaBancariaId:'', numeroComprovante:'', observacoes:'' });
  const [showLancamentoLoteModal, setShowLancamentoLoteModal] = useState(false);
  const [modalVisualizacao, setModalVisualizacao] = useState<{isOpen:boolean;conta:ContaPagar|null}>({ isOpen:false, conta:null });
  const [formData, setFormData] = useState<FormData>({ fornecedor_id:'', descricao:'', categoria_id:'', centro_custo_id:'', forma_pagamento_id:'', valor_total:0, desconto:0, juros:0, data_emissao:dayjs().format('YYYY-MM-DD'), data_vencimento:dayjs().add(30,'days').format('YYYY-MM-DD'), numero_documento:'', observacoes:'', prioridade_sugerida:'media', observacao_tesouraria:'', eh_recorrente:false, frequencia_recorrencia:'mensal', dia_vencimento_recorrente:10, data_fim_recorrencia:'', eh_parcelado:false, total_parcelas:1 });

  useEffect(() => { fetchData(); fetchIndicadores(); fetchFormData(); }, []);
  useEffect(() => { fetchData(); fetchIndicadores(); }, [statusFilter,situacaoFilter,fornecedorFilter,prioridadeFilter,dataInicial,dataFinal]);

  const fetchFormData = async () => {
    try {
      if (!await testConnection()) return;
      const [a,b,c,d,e] = await Promise.all([
        supabase.from('fornecedores').select('*').eq('status','ativo'),
        supabase.from('vw_categoria_tree').select('*').eq('tipo','despesa').eq('status','ativo'),
        supabase.from('centros_custo').select('*').eq('status','ativo'),
        supabase.from('formas_pagamento').select('*').eq('status','ativo'),
        supabase.from('vw_bancos_contas_saldo').select('*').eq('status','ativo'),
      ]);
      setFornecedores(a.data||[]); setCategorias(b.data||[]); setCentrosCusto(c.data||[]); setFormasPagamento(d.data||[]); setContasBancarias(e.data||[]);
    } catch {}
  };

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      if (!await testConnection()) { setContas([]); setLoading(false); return; }
      let q = supabase.from('vw_contas_pagar').select('*');
      if (statusFilter!=='all') q=q.eq('status',statusFilter);
      if (fornecedorFilter!=='all') q=q.eq('fornecedor_id',fornecedorFilter);
      if (prioridadeFilter!=='all') q=q.eq('prioridade_sugerida',prioridadeFilter);
      if (dataInicial) q=q.gte('data_vencimento',dataInicial);
      if (dataFinal) q=q.lte('data_vencimento',dataFinal);
      const { data, error } = await q.order('data_vencimento',{ascending:true});
      if (error) throw error;
      setContas(data||[]);
    } catch { setContas([]); }
    finally { setLoading(false); }
  };

  const fetchIndicadores = async () => {
    try {
      if (!await testConnection()) { setIndicadores(null); return; }
      let q = supabase.from('vw_contas_pagar').select('valor_total,valor_pago,saldo_restante,status,data_vencimento,aprovado_para_pagamento,fornecedor_id,prioridade_sugerida,situacao_vencimento');
      if (statusFilter!=='all') q=q.eq('status',statusFilter);
      if (fornecedorFilter!=='all') q=q.eq('fornecedor_id',fornecedorFilter);
      if (prioridadeFilter!=='all') q=q.eq('prioridade_sugerida',prioridadeFilter);
      if (dataInicial) q=q.gte('data_vencimento',dataInicial);
      if (dataFinal) q=q.lte('data_vencimento',dataFinal);
      const { data: d } = await q;
      const p=(d||[]).filter(c=>c.saldo_restante>0);
      setIndicadores({
        total_contas:p.length,
        saldo_pendente:p.reduce((s,c)=>s+(c.saldo_restante||0),0),
        contas_vencidas:p.filter(c=>c.situacao_vencimento==='atrasada').length,
        valor_vencido:p.filter(c=>c.situacao_vencimento==='atrasada').reduce((s,c)=>s+(c.saldo_restante||0),0),
        contas_vence_hoje:p.filter(c=>c.situacao_vencimento==='vence_hoje').length,
        valor_vence_hoje:p.filter(c=>c.situacao_vencimento==='vence_hoje').reduce((s,c)=>s+(c.saldo_restante||0),0),
        contas_a_vencer:p.filter(c=>c.situacao_vencimento==='vence_em_breve'||c.situacao_vencimento==='no_prazo').length,
        valor_a_vencer:p.filter(c=>c.situacao_vencimento==='vence_em_breve'||c.situacao_vencimento==='no_prazo').reduce((s,c)=>s+(c.saldo_restante||0),0),
        valor_pago:p.reduce((s,c)=>s+(c.valor_pago||0),0),
        valor_total:p.reduce((s,c)=>s+(c.valor_total||0),0),
      });
    } catch { setIndicadores(null); }
  };

  const handleIAExtraction = async (extracted: any) => {
    try {
      setLoading(true); setShowIAModal(false);
      let fornecedorId='';
      const nome=extracted.beneficiario.nome, cnpj=extracted.beneficiario.cnpj;
      if (cnpj) {
        const { data: e } = await supabase.from('fornecedores').select('id').eq('cnpj',cnpj.replace(/\D/g,'')).maybeSingle();
        if (e) { fornecedorId=e.id; }
        else { const { data: n, error: ne } = await supabase.from('fornecedores').insert({nome,cnpj:cnpj.replace(/\D/g,'')}).select().single(); if(ne)throw ne; fornecedorId=n.id; }
      } else if (nome) {
        const { data: s } = await supabase.from('fornecedores').select('id').ilike('nome',`%${nome}%`).limit(1).maybeSingle();
        if (s) { fornecedorId=s.id; }
        else { const { data: n, error: ne } = await supabase.from('fornecedores').insert({nome}).select().single(); if(ne)throw ne; fornecedorId=n.id; }
      }
      const duplicatas = await detectarDuplicatas({ fornecedor_id:fornecedorId, fornecedor_nome:nome, valor:extracted.valores.total, data_vencimento:extracted.datas.vencimento, numero_documento:extracted.codigo_barras||extracted.linha_digitavel, descricao:extracted.descricao }, 'pagar');
      if (duplicatas.length>0 && duplicatas[0].tipo==='exata') { if(!window.confirm(`⚠️ DUPLICATA DETECTADA!\n\nDeseja continuar?`)){setLoading(false);return;} }
      else if (duplicatas.length>0 && duplicatas[0].similaridade>=0.7) { if(!window.confirm(`💡 Conta similar encontrada. Deseja continuar?`)){setLoading(false);return;} }
      const cat = await sugerirCategoria(fornecedorId, nome, extracted.descricao||extracted.categoria_sugerida, extracted.valores.total);
      setFormData({ fornecedor_id:fornecedorId, descricao:extracted.descricao||`Boleto - ${nome}`, categoria_id:cat?.categoria_id||'', centro_custo_id:'', forma_pagamento_id:'', valor_total:extracted.valores.total, desconto:extracted.valores.desconto, juros:extracted.valores.juros+extracted.valores.multa, data_emissao:extracted.datas.emissao||dayjs().format('YYYY-MM-DD'), data_vencimento:extracted.datas.vencimento, numero_documento:extracted.codigo_barras||extracted.linha_digitavel||'', observacoes:extracted.observacoes||'', prioridade_sugerida:'media', observacao_tesouraria:cat?`IA sugeriu: ${cat.categoria_nome} (${(cat.confianca*100).toFixed(0)}%)`:'', eh_recorrente:false, frequencia_recorrencia:'', dia_vencimento_recorrente:0, data_fim_recorrencia:'', eh_parcelado:false, total_parcelas:0 });
      await supabase.from('ia_extractions_financeiro').insert({ tipo_extracao:'boleto', tipo_conta:'pagar', dados_extraidos:extracted, confidence_media:Object.values(extracted.confidences).reduce((a:any,b:any)=>a+b,0)/Object.keys(extracted.confidences).length, categoria_sugerida_id:cat?.categoria_id, duplicatas_detectadas:duplicatas.length, arquivo_nome:'boleto.jpg', modelo_ia:'gpt-4o' });
      setShowForm(true); setLoading(false);
      if (cat) alert(`✨ Dados extraídos!\n\nCategoria: ${cat.categoria_nome}\nConfiança: ${(cat.confianca*100).toFixed(0)}%`);
    } catch (err: any) { setError('Erro ao processar dados da IA.'); setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setLoading(true); setError(null);
      const vo=parseFloat(formData.valor_total.toString()), desc=parseFloat(formData.desconto.toString())||0, jur=parseFloat(formData.juros.toString())||0, vf=vo-desc+jur;
      if (editingConta) {
        const { error } = await supabase.from('contas_pagar').update({ ...formData, valor_original:vo, valor_total:vf, valor_final:vf, desconto:desc, juros:jur, data_fim_recorrencia:formData.data_fim_recorrencia||null }).eq('id',editingConta.id);
        if (error) throw error;
      } else if (formData.eh_parcelado && formData.total_parcelas>1) {
        const gid=crypto.randomUUID(), vp=vf/formData.total_parcelas;
        const parcelas=Array.from({length:formData.total_parcelas},(_,i)=>({ fornecedor_id:formData.fornecedor_id, descricao:`${formData.descricao} - Parcela ${i+1}/${formData.total_parcelas}`, categoria_id:formData.categoria_id||null, centro_custo_id:formData.centro_custo_id||null, forma_pagamento_id:formData.forma_pagamento_id||null, valor_original:vp, valor_total:vp, valor_final:vp, desconto:0, juros:0, data_emissao:formData.data_emissao, data_vencimento:dayjs(formData.data_vencimento).add(i,'month').format('YYYY-MM-DD'), numero_documento:formData.numero_documento||null, observacoes:formData.observacoes||null, prioridade_sugerida:formData.prioridade_sugerida, observacao_tesouraria:formData.observacao_tesouraria||null, eh_parcelado:true, numero_parcela:i+1, total_parcelas:formData.total_parcelas, parcelamento_grupo_id:gid, eh_recorrente:false, frequencia_recorrencia:null, dia_vencimento_recorrente:null, data_fim_recorrencia:null }));
        const { error } = await supabase.from('contas_pagar').insert(parcelas); if(error)throw error;
      } else {
        const d = { fornecedor_id:formData.fornecedor_id, descricao:formData.descricao, categoria_id:formData.categoria_id||null, centro_custo_id:formData.centro_custo_id||null, forma_pagamento_id:formData.forma_pagamento_id||null, valor_original:vo, valor_total:vf, valor_final:vf, desconto:desc, juros:jur, data_emissao:formData.data_emissao, data_vencimento:formData.data_vencimento, numero_documento:formData.numero_documento||null, observacoes:formData.observacoes||null, prioridade_sugerida:formData.prioridade_sugerida, observacao_tesouraria:formData.observacao_tesouraria||null, eh_recorrente:formData.eh_recorrente, frequencia_recorrencia:formData.eh_recorrente?formData.frequencia_recorrencia:null, dia_vencimento_recorrente:formData.eh_recorrente?formData.dia_vencimento_recorrente:null, data_inicio_recorrencia:formData.eh_recorrente?formData.data_vencimento:null, recorrencia_ativa:formData.eh_recorrente||null, data_fim_recorrencia:formData.data_fim_recorrencia||null, eh_parcelado:false, numero_parcela:null, total_parcelas:null, parcelamento_grupo_id:null };
        const { error } = await supabase.from('contas_pagar').insert([d]); if(error)throw error;
      }
      setShowForm(false); setEditingConta(null); resetForm(); fetchData(); fetchIndicadores();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta?')) return;
    try { setLoading(true); const { error } = await supabase.from('contas_pagar').delete().eq('id',id).select(); if(error)throw error; await fetchData(); await fetchIndicadores(); alert('Conta excluída!'); }
    catch (err: any) { setError(err.message); alert(`Erro: ${err.message}`); }
    finally { setLoading(false); }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size||!confirm(`Excluir ${selectedIds.size} conta(s)?`)) return;
    try {
      setLoading(true);
      for (const id of Array.from(selectedIds)) { await supabase.from('contas_pagar').delete().eq('id',id); }
      setSelectedIds(new Set()); setShowBulkActions(false); await fetchData(); await fetchIndicadores();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const toggleSelect = (id: string) => { const n=new Set(selectedIds); n.has(id)?n.delete(id):n.add(id); setSelectedIds(n); setShowBulkActions(n.size>0); };
  const toggleSelectAll = () => { if(selectedIds.size===filteredContas.length&&filteredContas.length>0){setSelectedIds(new Set());setShowBulkActions(false);}else{setSelectedIds(new Set(filteredContas.map(c=>c.id)));setShowBulkActions(true);} };

  const openForm = (conta?: ContaPagar) => {
    if (conta) { setEditingConta(conta); setFormData({ fornecedor_id:conta.fornecedor_id, descricao:conta.descricao, categoria_id:conta.categoria_id||'', centro_custo_id:conta.centro_custo_id||'', forma_pagamento_id:conta.forma_pagamento_id||'', valor_total:conta.valor_original||conta.valor_total, desconto:conta.desconto||0, juros:conta.juros||0, data_emissao:conta.data_emissao, data_vencimento:conta.data_vencimento, numero_documento:conta.numero_documento||'', observacoes:conta.observacoes||'', prioridade_sugerida:conta.prioridade_sugerida||'media', observacao_tesouraria:conta.observacao_tesouraria||'', eh_recorrente:conta.eh_recorrente||false, frequencia_recorrencia:conta.frequencia_recorrencia||'mensal', dia_vencimento_recorrente:conta.dia_vencimento_recorrente||10, data_fim_recorrencia:conta.data_fim_recorrencia||'', eh_parcelado:conta.eh_parcelado||false, total_parcelas:conta.total_parcelas||1 }); }
    else { setEditingConta(null); resetForm(); }
    setShowForm(true);
  };

  const resetForm = () => setFormData({ fornecedor_id:'', descricao:'', categoria_id:'', centro_custo_id:'', forma_pagamento_id:'', valor_total:0, desconto:0, juros:0, data_emissao:dayjs().format('YYYY-MM-DD'), data_vencimento:dayjs().add(30,'days').format('YYYY-MM-DD'), numero_documento:'', observacoes:'', prioridade_sugerida:'media', observacao_tesouraria:'', eh_recorrente:false, frequencia_recorrencia:'mensal', dia_vencimento_recorrente:10, data_fim_recorrencia:'', eh_parcelado:false, total_parcelas:1 });

  const abrirModalBaixa = (conta: ContaPagar) => setBaixaModal({ isOpen:true, conta, valorPagamento:conta.saldo_restante, dataPagamento:dayjs().format('YYYY-MM-DD'), formaPagamentoId:'', contaBancariaId:'', numeroComprovante:'', observacoes:'' });
  const fecharModalBaixa = () => setBaixaModal({ isOpen:false, conta:null, valorPagamento:0, dataPagamento:dayjs().format('YYYY-MM-DD'), formaPagamentoId:'', contaBancariaId:'', numeroComprovante:'', observacoes:'' });

  const handleDarBaixa = async () => {
    if (!baixaModal.conta) return;
    try {
      setLoading(true); setError(null);
      if (!baixaModal.formaPagamentoId||!baixaModal.contaBancariaId) throw new Error('Selecione forma de pagamento e conta bancária');
      if (baixaModal.valorPagamento<=0) throw new Error('Valor deve ser maior que zero');
      if (baixaModal.valorPagamento>baixaModal.conta.saldo_restante) throw new Error('Valor maior que saldo restante');
      const { data: ud } = await supabase.auth.getUser();
      const { error: re } = await supabase.rpc('api_fin_dar_baixa_conta', { p_conta_pagar_id:baixaModal.conta.id, p_valor_pagamento:baixaModal.valorPagamento, p_data_pagamento:baixaModal.dataPagamento, p_forma_pagamento_id:baixaModal.formaPagamentoId, p_conta_bancaria_id:baixaModal.contaBancariaId, p_numero_comprovante:baixaModal.numeroComprovante||null, p_observacoes:baixaModal.observacoes||null, p_usuario:ud?.user?.id||null });
      if (re) throw re;
      fecharModalBaixa(); fetchData(); fetchIndicadores();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const filteredContas = contas.filter(c => {
    const ms = c.descricao.toLowerCase().includes(searchTerm.toLowerCase())||c.fornecedor_nome.toLowerCase().includes(searchTerm.toLowerCase())||c.numero_documento?.toLowerCase().includes(searchTerm.toLowerCase());
    const msit = situacaoFilter==='all'||c.situacao_vencimento===situacaoFilter;
    return ms && msit;
  });

  const exportData = () => {
    if(!filteredContas.length){alert('Sem dados');return;}
    const headers=['Fornecedor','Descrição','Categoria','Valor Total','Valor Pago','Saldo','Vencimento','Status','Prioridade'];
    const data=filteredContas.map(c=>[c.fornecedor_nome,c.descricao,c.categoria_nome||'',c.valor_total,c.valor_pago,c.saldo_restante,dayjs(c.data_vencimento).format('DD/MM/YYYY'),getStatusInfo(c).label,c.prioridade_sugerida||'']);
    exportToExcel(data,`contas-pagar-${dayjs().format('YYYY-MM-DD')}`,headers);
  };

  const modalOverlay: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 };
  const modalCard: React.CSSProperties = { background:S.modalBg, border:`1px solid ${S.border}`, borderRadius:16, padding:24, width:'100%', maxHeight:'90vh', overflowY:'auto' };
  const sectionTitle: React.CSSProperties = { color:S.label, fontSize:10, fontWeight:600, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'0.6px', borderBottom:`1px solid ${S.border}`, paddingBottom:6 };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, flexWrap:'wrap' }}>
        <button onClick={exportData} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'7px 12px', color:S.muted, fontSize:11, cursor:'pointer' }}>
          <Download style={{ width:12, height:12 }} /> Excel
        </button>
        <button onClick={()=>setShowLancamentoLoteModal(true)} style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(74,222,128,0.1)', border:`1px solid rgba(74,222,128,0.2)`, borderRadius:8, padding:'7px 12px', color:S.green, fontSize:11, cursor:'pointer', fontWeight:500 }}>
          <Sparkles style={{ width:12, height:12 }} /> Lote IA
        </button>
        <button onClick={()=>setShowIAModal(true)} style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(167,139,250,0.1)', border:`1px solid rgba(167,139,250,0.2)`, borderRadius:8, padding:'7px 12px', color:'#a78bfa', fontSize:11, cursor:'pointer', fontWeight:500 }}>
          <Sparkles style={{ width:12, height:12 }} /> Boleto IA
        </button>
        <button onClick={()=>openForm()} style={{ display:'flex', alignItems:'center', gap:5, background:S.wine, border:'none', borderRadius:8, padding:'7px 12px', color:'white', fontSize:11, cursor:'pointer', fontWeight:500 }}>
          <Plus style={{ width:12, height:12 }} /> Nova Conta
        </button>
      </div>

      {error && <div style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:10, padding:'10px 14px', color:S.red, fontSize:12 }}>{error}</div>}

      {/* Bulk actions */}
      {showBulkActions && (
        <div style={{ background:'rgba(96,165,250,0.08)', border:`1px solid rgba(96,165,250,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:S.blue, fontSize:12 }}>{selectedIds.size} conta(s) selecionada(s)</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleBulkDelete} disabled={loading} style={{ display:'flex', alignItems:'center', gap:5, background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:7, padding:'5px 10px', color:S.red, fontSize:11, cursor:'pointer' }}>
              <Trash2 style={{ width:11, height:11 }} /> Excluir
            </button>
            <button onClick={()=>{setSelectedIds(new Set());setShowBulkActions(false);}} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:7, padding:'5px 10px', color:S.muted, fontSize:11, cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Indicadores */}
      {indicadores && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
          {[
            { label:'Pendentes',    value:indicadores.total_contas,              sub:fmt(indicadores.saldo_pendente),  color:S.blue,   bg:S.blueBg,   border:S.blueBorder },
            { label:'Atrasadas',    value:indicadores.contas_vencidas,           sub:fmt(indicadores.valor_vencido),   color:S.red,    bg:S.redBg,    border:S.redBorder },
            { label:'Vencem Hoje',  value:indicadores.contas_vence_hoje,         sub:fmt(indicadores.valor_vence_hoje),color:S.amber,  bg:'rgba(251,191,36,0.08)', border:'rgba(251,191,36,0.15)' },
            { label:'A Vencer',     value:indicadores.contas_a_vencer,           sub:fmt(indicadores.valor_a_vencer),  color:S.orange, bg:S.orangeBg, border:S.orangeBorder },
            { label:'Já Pago',      value:fmt(indicadores.valor_pago),           sub:`de ${fmt(indicadores.valor_total)}`,color:S.green,bg:S.greenBg,border:S.greenBorder },
          ].map((c,i) => (
            <div key={i} style={{ background:c.bg, borderRadius:12, padding:'12px 14px', border:`1px solid ${c.border}` }}>
              <p style={{ color:c.color, opacity:.6, fontSize:10, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'.6px' }}>{c.label}</p>
              <p style={{ color:c.color, fontSize:i===4?16:20, fontWeight:800, margin:'0 0 4px', letterSpacing:'-.5px' }}>{c.value}</p>
              <p style={{ color:c.color, opacity:.45, fontSize:10, margin:0 }}>{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ background:S.card, borderRadius:12, padding:'12px 14px', border:`1px solid ${S.border}`, display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr 1fr', gap:8 }}>
        <div style={{ position:'relative' }}>
          <Search style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:12, height:12, color:S.label }} />
          <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft:28 }} />
        </div>
        <SearchableSelect options={[{value:'all',label:'Situação'},{value:'atrasada',label:'Atrasadas'},{value:'vence_hoje',label:'Vence Hoje'},{value:'vence_em_breve',label:'Próx. 7 dias'},{value:'no_prazo',label:'No Prazo'},{value:'paga',label:'Pagas'}]} value={situacaoFilter} onChange={v=>setSituacaoFilter(v)} placeholder="Situação" theme="dark" />
        <SearchableSelect options={[{value:'all',label:'Status'},{value:'em_aberto',label:'Em Aberto'},{value:'parcialmente_pago',label:'Parcial'},{value:'autorizado_pagamento',label:'Autorizado'},{value:'pago',label:'Pago'},{value:'cancelado',label:'Cancelado'}]} value={statusFilter} onChange={v=>setStatusFilter(v)} placeholder="Status" theme="dark" />
        <SearchableSelect options={[{value:'all',label:'Fornecedor'},...fornecedores.map(f=>({value:f.id,label:f.nome}))]} value={fornecedorFilter} onChange={v=>setFornecedorFilter(v)} placeholder="Fornecedor" theme="dark" />
        <SearchableSelect options={[{value:'all',label:'Prioridade'},{value:'urgente',label:'Urgente'},{value:'alta',label:'Alta'},{value:'media',label:'Média'},{value:'baixa',label:'Baixa'}]} value={prioridadeFilter} onChange={v=>setPrioridadeFilter(v)} placeholder="Prioridade" theme="dark" />
        <input type="date" value={dataInicial} onChange={e=>setDataInicial(e.target.value)} style={inputStyle} />
        <input type="date" value={dataFinal} onChange={e=>setDataFinal(e.target.value)} style={inputStyle} />
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', border:`2px solid rgba(212,175,55,0.15)`, borderTop:`2px solid ${S.gold}`, animation:'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ background:S.card, borderRadius:12, border:`1px solid ${S.border}`, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding:'9px 10px', borderBottom:`1px solid ${S.border}` }}>
                    <input type="checkbox" checked={selectedIds.size===filteredContas.length&&filteredContas.length>0} onChange={toggleSelectAll} style={{ accentColor:S.wine }} />
                  </th>
                  {['Prioridade','Fornecedor / Descrição','Vencimento','Total','Saldo','Status','Ações'].map((h,i) => (
                    <th key={i} style={{ padding:'9px 12px', textAlign:i>=3&&i<=4?'right':'left', fontSize:10, fontWeight:600, color:S.label, textTransform:'uppercase', letterSpacing:'0.6px', borderBottom:`1px solid ${S.border}`, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredContas.map(conta => {
                  const st = getStatusInfo(conta);
                  const Ico = st.icon;
                  const prior = PRIORIDADE_MAP[conta.prioridade_sugerida||'media'] || PRIORIDADE_MAP['media'];
                  return (
                    <tr key={conta.id} style={{ borderBottom:`1px solid rgba(255,255,255,0.03)` }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.02)'}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                      <td style={{ padding:'9px 10px' }}>
                        <input type="checkbox" checked={selectedIds.has(conta.id)} onChange={()=>toggleSelect(conta.id)} style={{ accentColor:S.wine }} />
                      </td>
                      <td style={{ padding:'9px 12px' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:6, background:prior.bg }}>
                          <span style={{ width:6, height:6, borderRadius:'50%', background:prior.color }} />
                        </span>
                      </td>
                      <td style={{ padding:'9px 12px', minWidth:180 }}>
                        <p style={{ color:S.text, fontSize:12, fontWeight:600, margin:0 }}>{conta.fornecedor_nome}</p>
                        <p style={{ color:S.muted, fontSize:11, margin:'1px 0 0' }}>{conta.descricao}</p>
                        {conta.numero_documento && <p style={{ color:S.label, fontSize:10, margin:0 }}>Doc: {conta.numero_documento}</p>}
                        {conta.categoria_nome && <p style={{ color:S.label, fontSize:10, margin:0, display:'flex', alignItems:'center', gap:3 }}><Target style={{ width:9, height:9 }} />{conta.categoria_nome}</p>}
                        {conta.observacao_tesouraria && <p style={{ color:'rgba(96,165,250,0.7)', fontSize:10, margin:0, display:'flex', alignItems:'center', gap:3 }}><MessageSquare style={{ width:9, height:9 }} />{conta.observacao_tesouraria}</p>}
                        {(conta.total_pagamentos_parciais||0)>0 && <p style={{ color:S.label, fontSize:10, margin:0, display:'flex', alignItems:'center', gap:3 }}><Activity style={{ width:9, height:9 }} />{conta.total_pagamentos_parciais===1?`Pago em ${dayjs(conta.data_primeira_baixa).format('DD/MM/YY')}`:`${conta.total_pagamentos_parciais} pagamentos`}</p>}
                      </td>
                      <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                        <p style={{ color:conta.situacao_vencimento==='atrasada'?S.red:conta.situacao_vencimento==='vence_hoje'?S.amber:conta.situacao_vencimento==='vence_em_breve'?S.orange:S.text, fontSize:12, fontWeight:conta.situacao_vencimento==='atrasada'||conta.situacao_vencimento==='vence_hoje'?600:400, margin:0 }}>
                          {dayjs(conta.data_vencimento).format('DD/MM/YY')}
                        </p>
                        {conta.situacao_vencimento==='atrasada'&&<p style={{ color:S.red, fontSize:10, margin:0 }}>{conta.dias_vencimento}d atraso</p>}
                        {conta.situacao_vencimento==='vence_hoje'&&<p style={{ color:S.amber, fontSize:10, margin:0, fontWeight:700 }}>HOJE</p>}
                        {conta.situacao_vencimento==='vence_em_breve'&&conta.dias_para_vencer!=null&&<p style={{ color:S.orange, fontSize:10, margin:0 }}>{conta.dias_para_vencer}d</p>}
                      </td>
                      <td style={{ padding:'9px 12px', textAlign:'right', whiteSpace:'nowrap' }}>
                        <p style={{ color:S.text, fontSize:12, fontWeight:600, margin:0, fontFamily:'monospace' }}>{fmt(conta.valor_total)}</p>
                        {conta.valor_pago>0&&<p style={{ color:S.green, fontSize:10, margin:0 }}>Pago: {fmt(conta.valor_pago)}</p>}
                      </td>
                      <td style={{ padding:'9px 12px', textAlign:'right', whiteSpace:'nowrap' }}>
                        <p style={{ color:conta.saldo_restante>0?S.red:S.green, fontSize:12, fontWeight:700, margin:0, fontFamily:'monospace' }}>{fmt(conta.saldo_restante)}</p>
                        {conta.valor_pago>0&&conta.saldo_restante>0&&<p style={{ color:S.label, fontSize:10, margin:0 }}>{((conta.valor_pago/conta.valor_total)*100).toFixed(0)}%</p>}
                      </td>
                      <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:4, background:st.bg, borderRadius:20, padding:'3px 9px' }}>
                          <Ico style={{ width:10, height:10, color:st.color }} />
                          <span style={{ color:st.color, fontSize:10, fontWeight:600 }}>{st.label}</span>
                        </div>
                      </td>
                      <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          {conta.saldo_restante>0&&(
                            <button onClick={()=>abrirModalBaixa(conta)} style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(74,222,128,0.1)', border:`1px solid rgba(74,222,128,0.2)`, borderRadius:6, padding:'4px 8px', color:S.green, fontSize:10, cursor:'pointer', fontWeight:600 }}>
                              <Receipt style={{ width:10, height:10 }} /> Baixa
                            </button>
                          )}
                          <button onClick={()=>setModalVisualizacao({isOpen:true,conta})} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:6, padding:'4px 6px', cursor:'pointer', color:S.muted }}>
                            <Eye style={{ width:12, height:12 }} />
                          </button>
                          <button onClick={()=>openForm(conta)} style={{ background:'rgba(96,165,250,0.1)', border:`1px solid rgba(96,165,250,0.2)`, borderRadius:6, padding:'4px 6px', cursor:'pointer', color:S.blue }}>
                            <Edit style={{ width:12, height:12 }} />
                          </button>
                          <button onClick={()=>handleDelete(conta.id)} disabled={loading} style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:6, padding:'4px 6px', cursor:'pointer', color:S.red, opacity:loading?.5:1 }}>
                            <Trash2 style={{ width:12, height:12 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredContas.length===0&&<div style={{ textAlign:'center', padding:40, color:S.label, fontSize:13 }}>Nenhuma conta encontrada</div>}
          </div>
        </div>
      )}

      {/* Modal Formulário */}
      {showForm && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth:760 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, paddingBottom:12, borderBottom:`1px solid ${S.border}` }}>
              <h3 style={{ color:S.text, fontSize:15, fontWeight:700, margin:0 }}>{editingConta?'Editar Conta a Pagar':'Nova Conta a Pagar'}</h3>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {/* Informações Básicas */}
              <div>
                <p style={sectionTitle}>Informações Básicas</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={fStyle}><label style={labelStyle}>Fornecedor *</label><SearchableSelect options={fornecedores.map(f=>({value:f.id,label:f.nome}))} value={formData.fornecedor_id} onChange={v=>setFormData({...formData,fornecedor_id:v})} placeholder="Buscar..." theme="dark" /></div>
                  <div style={fStyle}><label style={labelStyle}>Valor Total *</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:S.label, fontSize:12 }}>R$</span><input type="number" step="0.01" value={formData.valor_total} onChange={e=>setFormData({...formData,valor_total:parseFloat(e.target.value)||0})} style={{ ...inputStyle, paddingLeft:36 }} /></div></div>
                  <div style={fStyle}><label style={labelStyle}>Desconto</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:S.label, fontSize:12 }}>R$</span><input type="number" step="0.01" value={formData.desconto} onChange={e=>setFormData({...formData,desconto:parseFloat(e.target.value)||0})} style={{ ...inputStyle, paddingLeft:36 }} /></div></div>
                  <div style={fStyle}><label style={labelStyle}>Juros</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:S.label, fontSize:12 }}>R$</span><input type="number" step="0.01" value={formData.juros} onChange={e=>setFormData({...formData,juros:parseFloat(e.target.value)||0})} style={{ ...inputStyle, paddingLeft:36 }} /></div></div>
                  <div style={{ gridColumn:'span 2', background:'rgba(212,175,55,0.06)', border:`1px solid ${S.goldBorder}`, borderRadius:8, padding:'10px 14px' }}>
                    <p style={{ color:S.gold, fontSize:14, fontWeight:700, margin:0 }}>Valor Final: {fmt((formData.valor_total||0)-(formData.desconto||0)+(formData.juros||0))}</p>
                    {(formData.desconto>0||formData.juros>0)&&<p style={{ color:S.label, fontSize:11, margin:'4px 0 0' }}>Original: {fmt(formData.valor_total||0)}{formData.desconto>0&&` — Desconto: -${fmt(formData.desconto)}`}{formData.juros>0&&` + Juros: ${fmt(formData.juros)}`}</p>}
                  </div>
                </div>
              </div>

              {/* Datas */}
              <div>
                <p style={sectionTitle}>Datas</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={fStyle}><label style={labelStyle}>Data Emissão *</label><input type="date" value={formData.data_emissao} onChange={e=>setFormData({...formData,data_emissao:e.target.value})} style={inputStyle} /></div>
                  <div style={fStyle}><label style={labelStyle}>Data Vencimento *</label><input type="date" value={formData.data_vencimento} onChange={e=>setFormData({...formData,data_vencimento:e.target.value})} style={inputStyle} /></div>
                </div>
              </div>

              {/* Categorização */}
              <div>
                <p style={sectionTitle}>Categorização</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  <div style={fStyle}><label style={labelStyle}>Categoria</label><SearchableSelect options={categorias.map(c=>({value:c.id,label:c.caminho_completo||c.nome}))} value={formData.categoria_id} onChange={v=>setFormData({...formData,categoria_id:v})} placeholder="Buscar..." theme="dark" /></div>
                  <div style={fStyle}><label style={labelStyle}>Centro de Custo</label><SearchableSelect options={centrosCusto.map(c=>({value:c.id,label:c.nome}))} value={formData.centro_custo_id} onChange={v=>setFormData({...formData,centro_custo_id:v})} placeholder="Buscar..." theme="dark" /></div>
                  <div style={fStyle}><label style={labelStyle}>Forma de Pagamento</label><SearchableSelect options={formasPagamento.map(f=>({value:f.id,label:f.nome}))} value={formData.forma_pagamento_id} onChange={v=>setFormData({...formData,forma_pagamento_id:v})} placeholder="Buscar..." theme="dark" /></div>
                </div>
              </div>

              {/* Detalhes */}
              <div>
                <p style={sectionTitle}>Detalhes Adicionais</p>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12 }}>
                  <div style={fStyle}><label style={labelStyle}>Descrição *</label><input type="text" value={formData.descricao} onChange={e=>setFormData({...formData,descricao:e.target.value})} style={inputStyle} /></div>
                  <div style={fStyle}><label style={labelStyle}>Número do Documento</label><input type="text" value={formData.numero_documento} onChange={e=>setFormData({...formData,numero_documento:e.target.value})} style={inputStyle} /></div>
                  <div style={fStyle}><label style={labelStyle}>Prioridade</label><select value={formData.prioridade_sugerida} onChange={e=>setFormData({...formData,prioridade_sugerida:e.target.value as any})} style={{ ...inputStyle, color:S.text }}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
                  <div style={fStyle}><label style={labelStyle}>Observações</label><textarea value={formData.observacoes} onChange={e=>setFormData({...formData,observacoes:e.target.value})} rows={2} style={{ ...inputStyle, resize:'vertical' }} /></div>
                  <div style={{ ...fStyle, gridColumn:'span 2' }}><label style={labelStyle}>Observação da Tesouraria</label><textarea value={formData.observacao_tesouraria} onChange={e=>setFormData({...formData,observacao_tesouraria:e.target.value})} rows={2} style={{ ...inputStyle, resize:'vertical' }} /></div>
                </div>
              </div>

              {/* Parcelamento */}
              <div style={{ borderTop:`1px solid ${S.border}`, paddingTop:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:10 }}>
                  <input type="checkbox" checked={formData.eh_parcelado} onChange={e=>setFormData({...formData,eh_parcelado:e.target.checked})} style={{ accentColor:S.wine, width:14, height:14 }} />
                  <span style={{ color:S.label, fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.6px' }}>Pagamento Parcelado</span>
                </label>
                {formData.eh_parcelado&&(
                  <div style={{ display:'flex', gap:12, alignItems:'center', background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'10px 12px' }}>
                    <div style={fStyle}><label style={labelStyle}>Número de Parcelas</label><input type="number" min="2" value={formData.total_parcelas} onChange={e=>setFormData({...formData,total_parcelas:parseInt(e.target.value)||2})} style={{ ...inputStyle, width:120 }} /></div>
                    <p style={{ color:S.gold, fontSize:12, margin:'16px 0 0', fontWeight:600 }}>Valor/parcela: {fmt(((formData.valor_total||0)-(formData.desconto||0)+(formData.juros||0))/(formData.total_parcelas||1))}</p>
                  </div>
                )}
              </div>

              {/* Recorrência */}
              <div style={{ borderTop:`1px solid ${S.border}`, paddingTop:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:10 }}>
                  <input type="checkbox" checked={formData.eh_recorrente} onChange={e=>setFormData({...formData,eh_recorrente:e.target.checked})} style={{ accentColor:S.wine, width:14, height:14 }} />
                  <span style={{ color:S.label, fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.6px' }}>Pagamento Recorrente</span>
                </label>
                {formData.eh_recorrente&&(
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'12px' }}>
                    <div style={fStyle}><label style={labelStyle}>Frequência</label><select value={formData.frequencia_recorrencia} onChange={e=>setFormData({...formData,frequencia_recorrencia:e.target.value})} style={{ ...inputStyle, color:S.text }}><option value="mensal">Mensal</option><option value="bimestral">Bimestral</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></div>
                    <div style={fStyle}><label style={labelStyle}>Dia do Vencimento</label><input type="number" min="1" max="31" value={formData.dia_vencimento_recorrente} onChange={e=>setFormData({...formData,dia_vencimento_recorrente:parseInt(e.target.value)||10})} style={inputStyle} /></div>
                    <div style={fStyle}><label style={labelStyle}>Data Fim (Opcional)</label><input type="date" value={formData.data_fim_recorrencia} onChange={e=>setFormData({...formData,data_fim_recorrencia:e.target.value})} style={inputStyle} /></div>
                    <div style={{ gridColumn:'span 3' }}>
                      <p style={{ color:'rgba(96,165,250,0.7)', fontSize:11, background:'rgba(96,165,250,0.06)', border:`1px solid rgba(96,165,250,0.15)`, borderRadius:7, padding:'8px 12px', margin:0 }}>
                        💡 O sistema gerará automaticamente as próximas contas conforme a frequência definida
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20, paddingTop:16, borderTop:`1px solid ${S.border}` }}>
              <button onClick={()=>setShowForm(false)} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'9px 18px', color:S.muted, fontSize:12, cursor:'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={loading||!formData.fornecedor_id||!formData.descricao||!formData.valor_total}
                style={{ background:S.wine, border:'none', borderRadius:8, padding:'9px 18px', color:'white', fontSize:12, cursor:'pointer', fontWeight:500, opacity:loading||!formData.fornecedor_id||!formData.descricao?0.5:1 }}>
                {loading?'Salvando...':'Salvar Conta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Baixa */}
      {baixaModal.isOpen && baixaModal.conta && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth:560 }}>
            <h3 style={{ color:S.text, fontSize:15, fontWeight:700, margin:'0 0 16px' }}>Dar Baixa em Conta a Pagar</h3>
            <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${S.border}`, borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
              <p style={{ color:S.text, fontSize:13, fontWeight:600, margin:'0 0 8px' }}>{baixaModal.conta.fornecedor_nome}</p>
              <p style={{ color:S.muted, fontSize:12, margin:'0 0 8px' }}>{baixaModal.conta.descricao}</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[['Total', fmt(baixaModal.conta.valor_total), S.text], ['Pago', fmt(baixaModal.conta.valor_pago), S.green], ['Saldo', fmt(baixaModal.conta.saldo_restante), S.orange]].map(([l,v,c],i)=>(
                  <div key={i}><span style={{ color:S.label, fontSize:10 }}>{l}</span><p style={{ color:c as string, fontSize:13, fontWeight:700, margin:0, fontFamily:'monospace' }}>{v}</p></div>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={fStyle}><label style={labelStyle}>Valor do Pagamento *</label><div style={{ position:'relative' }}><span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:S.label, fontSize:12 }}>R$</span><input type="number" step="0.01" min="0.01" max={baixaModal.conta.saldo_restante} value={baixaModal.valorPagamento} onChange={e=>setBaixaModal({...baixaModal,valorPagamento:parseFloat(e.target.value)||0})} style={{ ...inputStyle, paddingLeft:36 }} /></div><p style={{ color:S.label, fontSize:10, margin:'3px 0 0' }}>Máx: {fmt(baixaModal.conta.saldo_restante)}</p></div>
              <div style={fStyle}><label style={labelStyle}>Data do Pagamento *</label><input type="date" value={baixaModal.dataPagamento} onChange={e=>setBaixaModal({...baixaModal,dataPagamento:e.target.value})} style={inputStyle} /></div>
              <div style={fStyle}><label style={labelStyle}>Forma de Pagamento *</label><SearchableSelect options={formasPagamento.map(f=>({value:f.id,label:f.nome}))} value={baixaModal.formaPagamentoId} onChange={v=>setBaixaModal({...baixaModal,formaPagamentoId:v})} placeholder="Buscar..." theme="dark" /></div>
              <div style={fStyle}><label style={labelStyle}>Conta Bancária *</label><SearchableSelect options={contasBancarias.map(c=>({value:c.id,label:`${c.banco} - ${c.tipo_conta}`,sublabel:`Saldo: ${fmt(c.saldo_atual)}`}))} value={baixaModal.contaBancariaId} onChange={v=>setBaixaModal({...baixaModal,contaBancariaId:v})} placeholder="Buscar..." theme="dark" /></div>
              <div style={fStyle}><label style={labelStyle}>Número do Comprovante</label><input type="text" value={baixaModal.numeroComprovante} onChange={e=>setBaixaModal({...baixaModal,numeroComprovante:e.target.value})} placeholder="Ex: 123456" style={inputStyle} /></div>
              <div style={fStyle}><label style={labelStyle}>Observações</label><textarea value={baixaModal.observacoes} onChange={e=>setBaixaModal({...baixaModal,observacoes:e.target.value})} rows={2} style={{ ...inputStyle, resize:'vertical' }} /></div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
              <button onClick={fecharModalBaixa} disabled={loading} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'8px 16px', color:S.muted, fontSize:12, cursor:'pointer' }}>Cancelar</button>
              <button onClick={handleDarBaixa} disabled={loading||!baixaModal.formaPagamentoId||!baixaModal.contaBancariaId||baixaModal.valorPagamento<=0||baixaModal.valorPagamento>baixaModal.conta.saldo_restante}
                style={{ background:'rgba(74,222,128,0.15)', border:`1px solid rgba(74,222,128,0.25)`, borderRadius:8, padding:'8px 16px', color:S.green, fontSize:12, cursor:'pointer', fontWeight:600, opacity:loading?0.5:1 }}>
                {loading?'Processando...':'Confirmar Baixa'}
              </button>
            </div>
          </div>
        </div>
      )}

      <LancamentoLoteIA isOpen={showLancamentoLoteModal} onClose={()=>setShowLancamentoLoteModal(false)} onSuccess={()=>{fetchData();setShowLancamentoLoteModal(false);}} />
      <ImportarBoletoIA isOpen={showIAModal} onClose={()=>setShowIAModal(false)} onConfirm={handleIAExtraction} tipo="pagar" />
      <ModalVisualizarConta isOpen={modalVisualizacao.isOpen} conta={modalVisualizacao.conta} onClose={()=>setModalVisualizacao({isOpen:false,conta:null})} />
    </div>
  );
};

export default ContasPagar;
