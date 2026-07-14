import React, { useState, useEffect } from 'react';
import { Plus, Search, ArrowUpRight, ArrowDownRight, Download, FileText, DollarSign, TrendingUp, TrendingDown, Activity, CreditCard as Edit, Trash2, Upload, Calculator, ArrowUpDown } from 'lucide-react';
import { supabase, testConnection } from '../../lib/supabase';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';
import { SearchableSelect } from '../common/SearchableSelect';

interface Transaction {
  id: string; tipo: 'entrada'|'saida'; valor: number; data: string; descricao: string;
  centro_custo?: string; categoria_id?: string; conta_bancaria_id?: string;
  forma_pagamento_id?: string; comprovante?: string; observacoes?: string;
  origem?: string; criado_por?: string; criado_em: string;
  valor_entrada?: number; valor_saida?: number; saldo_acumulado?: number; saldo_anterior?: number;
}
interface FormData {
  tipo: 'entrada'|'saida'|'transferencia'; valor: number; data: string; descricao: string;
  centro_custo: string; observacoes: string; comprovante?: string;
  conta_bancaria_id?: string; conta_destino_id?: string;
}
interface IndicadoresFluxo {
  saldo_anterior: number; saldo_total: number; entradas_mes: number;
  saidas_mes: number; saldo_mes: number; total_transacoes: number;
}
interface ContaBancaria { id: string; banco: string; tipo_conta: string; numero_conta?: string; saldo_atual: number; }

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const S = {
  card: '#12141f', border: 'rgba(255,255,255,0.06)', label: 'rgba(255,255,255,0.35)',
  text: 'rgba(255,255,255,0.85)', muted: 'rgba(255,255,255,0.5)',
  green: '#4ade80', red: '#f87171', blue: '#60a5fa', gold: '#D4AF37',
  greenBg: 'rgba(74,222,128,0.08)', redBg: 'rgba(248,113,113,0.08)',
  blueBg: 'rgba(96,165,250,0.08)', goldBg: 'rgba(212,175,55,0.08)',
  greenBorder: 'rgba(74,222,128,0.15)', redBorder: 'rgba(248,113,113,0.15)',
  blueBorder: 'rgba(96,165,250,0.15)', goldBorder: 'rgba(212,175,55,0.15)',
  wine: '#7D1F2C', modalBg: '#0f1020',
};
const inputStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, borderRadius: 8, padding: '7px 12px', color: S.text, fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { color: S.label, fontSize: 11, marginBottom: 4, display: 'block' };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

const FluxoCaixa: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFluxo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'all'|'entrada'|'saida'>('all');
  const [dataInicial, setDataInicial] = useState(dayjs().subtract(30,'days').format('YYYY-MM-DD'));
  const [dataFinal, setDataFinal] = useState(dayjs().format('YYYY-MM-DD'));
  const [contaBancariaFilter, setContaBancariaFilter] = useState('all');
  const [ordemVisualizacao, setOrdemVisualizacao] = useState<'asc'|'desc'>('desc');
  const [formData, setFormData] = useState<FormData>({ tipo:'entrada', valor:0, data:dayjs().format('YYYY-MM-DD'), descricao:'', centro_custo:'Ditado Popular', observacoes:'', comprovante:'', conta_bancaria_id:'', conta_destino_id:'' });

  useEffect(() => { fetchContasBancarias(); fetchTransactions(); fetchIndicadores(); }, []);
  useEffect(() => { let m=true; const f=async()=>{await fetchTransactions();if(m)await fetchIndicadores();}; f(); return()=>{m=false;}; }, [tipoFilter,dataInicial,dataFinal,contaBancariaFilter,ordemVisualizacao]);

  const fetchTransactions = async () => {
    try {
      setLoading(true); setError(null);
      if (!await testConnection()) { setTransactions([]); setLoading(false); return; }
      let q = supabase.from('view_extrato_fluxo_caixa').select('id,data,tipo,descricao,valor,categoria_id,conta_bancaria_id,centro_custo_id,forma_pagamento_id,origem,conta_pagar_id,conta_receber_id,observacoes,criado_por,criado_em,valor_entrada,valor_saida,saldo_acumulado,saldo_anterior');
      if (tipoFilter !== 'all') q = q.eq('tipo', tipoFilter);
      if (dataInicial) q = q.gte('data', dataInicial);
      if (dataFinal) q = q.lte('data', dataFinal);
      if (contaBancariaFilter !== 'all') q = q.eq('conta_bancaria_id', contaBancariaFilter);
      const isAsc = ordemVisualizacao === 'asc';
      const { data, error } = await q.order('data',{ascending:isAsc}).order('id',{ascending:isAsc});
      if (error) throw error;
      setTransactions(data || []);
    } catch { setTransactions([]); }
    finally { setLoading(false); }
  };

  const fetchIndicadores = async () => {
    try {
      if (!await testConnection()) { setIndicadores(null); return; }
      const { data, error } = await supabase.rpc('calcular_indicadores_fluxo_caixa', { p_data_inicial:dataInicial, p_data_final:dataFinal, p_conta_bancaria_id:contaBancariaFilter!=='all'?contaBancariaFilter:null, p_tipo:tipoFilter!=='all'?tipoFilter:null });
      if (error) throw error;
      if (data && data.length > 0) {
        const r = data[0];
        setIndicadores({ saldo_anterior:Number(r.saldo_anterior), saldo_total:Number(r.saldo_final), entradas_mes:Number(r.entradas_periodo), saidas_mes:Number(r.saidas_periodo), saldo_mes:Number(r.saldo_periodo), total_transacoes:Number(r.total_transacoes) });
      } else setIndicadores({ saldo_anterior:0, saldo_total:0, entradas_mes:0, saidas_mes:0, saldo_mes:0, total_transacoes:0 });
    } catch { setIndicadores(null); }
  };

  const fetchContasBancarias = async () => {
    const { data } = await supabase.from('vw_bancos_contas_saldo').select('*').eq('status','ativo').order('banco',{ascending:true});
    setContasBancarias(data || []);
  };

  const handleSave = async () => {
    try {
      setLoading(true); setError(null);
      if (formData.tipo === 'transferencia') {
        if (!formData.conta_bancaria_id || !formData.conta_destino_id) { alert('Selecione conta de origem e destino'); setLoading(false); return; }
        if (formData.conta_bancaria_id === formData.conta_destino_id) { alert('Conta de origem e destino devem ser diferentes'); setLoading(false); return; }
        const v = parseFloat(formData.valor.toString());
        const { error: e1 } = await supabase.from('fluxo_caixa').insert([{ tipo:'saida', valor:v, data:formData.data, descricao:`Transferência para ${contasBancarias.find(c=>c.id===formData.conta_destino_id)?.banco} - ${formData.descricao}`, centro_custo:formData.centro_custo, conta_bancaria_id:formData.conta_bancaria_id, observacoes:formData.observacoes, origem:'transferencia' }]);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('fluxo_caixa').insert([{ tipo:'entrada', valor:v, data:formData.data, descricao:`Transferência de ${contasBancarias.find(c=>c.id===formData.conta_bancaria_id)?.banco} - ${formData.descricao}`, centro_custo:formData.centro_custo, conta_bancaria_id:formData.conta_destino_id, observacoes:formData.observacoes, origem:'transferencia' }]);
        if (e2) throw e2;
      } else {
        const d = { tipo:formData.tipo, valor:parseFloat(formData.valor.toString()), data:formData.data, descricao:formData.descricao, centro_custo:formData.centro_custo, conta_bancaria_id:formData.conta_bancaria_id, observacoes:formData.observacoes, comprovante:formData.comprovante, origem:'manual' };
        if (editingTransaction) { const { error } = await supabase.from('fluxo_caixa').update(d).eq('id',editingTransaction.id); if (error) throw error; }
        else { const { error } = await supabase.from('fluxo_caixa').insert([d]); if (error) throw error; }
      }
      setShowForm(false); setEditingTransaction(null); resetForm(); fetchTransactions(); fetchIndicadores(); fetchContasBancarias();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta transação?')) return;
    try { setLoading(true); const { error } = await supabase.from('fluxo_caixa').delete().eq('id',id); if (error) throw error; fetchTransactions(); fetchIndicadores(); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const openForm = (t?: Transaction) => {
    if (t) { setEditingTransaction(t); setFormData({ tipo:t.tipo, valor:t.valor, data:t.data, descricao:t.descricao, centro_custo:t.centro_custo||'', observacoes:t.observacoes||'', comprovante:t.comprovante||'', conta_bancaria_id:t.conta_bancaria_id||'', conta_destino_id:'' }); }
    else { setEditingTransaction(null); resetForm(); }
    setShowForm(true);
  };

  const resetForm = () => setFormData({ tipo:'entrada', valor:0, data:dayjs().format('YYYY-MM-DD'), descricao:'', centro_custo:'Ditado Popular', observacoes:'', comprovante:'', conta_bancaria_id:'', conta_destino_id:'' });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const ext = file.name.split('.').pop(); const path = `${Math.random()}.${ext}`;
      const { error: ue } = await supabase.storage.from('comprovantes').upload(path, file); if (ue) throw ue;
      const { data: { publicUrl } } = supabase.storage.from('comprovantes').getPublicUrl(path);
      setFormData({ ...formData, comprovante: publicUrl });
    } catch {}
  };

  const gerarRelatorioPDF = async () => {
    if (!filteredTransactions.length) { alert('Sem transações'); return; }
    try {
      const g = new ReportGenerator({ title:'Relatório de Fluxo de Caixa', filename:'fluxo-caixa.pdf', orientation:'landscape' });
      const headers = ['Data','Tipo','Descrição','Entrada','Saída','Saldo Acumulado'];
      const data = filteredTransactions.map(t => [dayjs(t.data).format('DD/MM/YYYY'), t.tipo==='entrada'?'Entrada':'Saída', t.descricao||'', t.tipo==='entrada'?fmt(t.valor):'-', t.tipo==='saida'?fmt(t.valor):'-', fmt(t.saldo_acumulado||0)]);
      const kpis = [['Saldo Anterior',fmt(indicadores?.saldo_anterior||0)],['Entradas',fmt(indicadores?.entradas_mes||0)],['Saídas',fmt(indicadores?.saidas_mes||0)],['Saldo Final',fmt(indicadores?.saldo_total||0)]];
      const y = g.addHeader('RELATÓRIO DE FLUXO DE CAIXA', [`Período: ${dayjs(dataInicial).format('DD/MM/YYYY')} a ${dayjs(dataFinal).format('DD/MM/YYYY')}`]);
      g.addFluxoCaixaTable(headers, data, y, kpis);
      g.save(`fluxo-caixa-${dayjs().format('YYYY-MM-DD-HHmm')}.pdf`);
    } catch { alert('Erro ao gerar PDF'); }
  };

  const exportData = () => {
    if (!filteredTransactions.length) { alert('Sem dados'); return; }
    const headers = ['Data','Descrição','Entrada','Saída','Saldo Acumulado','Observações'];
    const data = filteredTransactions.map(t => [dayjs(t.data).format('DD/MM/YYYY'), t.descricao, t.tipo==='entrada'?t.valor:'', t.tipo==='saida'?t.valor:'', t.saldo_acumulado||0, t.observacoes||'']);
    exportToExcel(data, `fluxo-caixa-${dayjs().format('YYYY-MM-DD')}`, headers);
  };

  const filteredTransactions = transactions.filter(t =>
    (t.descricao||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.centro_custo||'').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const modalOverlay: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 };
  const modalCard: React.CSSProperties = { background:S.modalBg, border:`1px solid ${S.border}`, borderRadius:16, padding:24, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button onClick={gerarRelatorioPDF} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'7px 14px', color:S.muted, fontSize:12, cursor:'pointer' }}>
          <FileText style={{ width:13, height:13 }} /> PDF
        </button>
        <button onClick={exportData} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'7px 14px', color:S.muted, fontSize:12, cursor:'pointer' }}>
          <Download style={{ width:13, height:13 }} /> Excel
        </button>
        <button onClick={()=>openForm()} style={{ display:'flex', alignItems:'center', gap:6, background:S.wine, border:'none', borderRadius:8, padding:'7px 14px', color:'white', fontSize:12, cursor:'pointer', fontWeight:500 }}>
          <Plus style={{ width:13, height:13 }} /> Novo Lançamento
        </button>
      </div>

      {error && <div style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:10, padding:'10px 14px', color:S.red, fontSize:12 }}>{error}</div>}

      {/* Aviso */}
      <div style={{ background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.15)', borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
        <Activity style={{ width:14, height:14, color:S.blue, flexShrink:0, marginTop:1 }} />
        <p style={{ color:'rgba(96,165,250,0.7)', fontSize:11, margin:0 }}>
          Valores do período {dayjs(dataInicial).format('DD/MM')} a {dayjs(dataFinal).format('DD/MM/YYYY')}. Para movimentações dia por dia, acesse <strong>Extrato Diário</strong>.
        </p>
      </div>

      {/* Indicadores */}
      {indicadores && (
        <>
          <div style={{ background:S.blueBg, border:`1px solid ${S.blueBorder}`, borderRadius:12, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <p style={{ color:'rgba(96,165,250,0.6)', fontSize:10, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.6px' }}>Saldo Anterior ao Período</p>
              <p style={{ color:S.blue, fontSize:26, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>{fmt(indicadores.saldo_anterior)}</p>
              <p style={{ color:'rgba(96,165,250,0.4)', fontSize:11, margin:'4px 0 0' }}>acumulado até {dayjs(dataInicial).subtract(1,'day').format('DD/MM/YYYY')}</p>
            </div>
            <TrendingUp style={{ width:32, height:32, color:'rgba(96,165,250,0.4)' }} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <div style={{ background:S.greenBg, border:`1px solid ${S.greenBorder}`, borderRadius:12, padding:'14px 16px' }}>
              <p style={{ color:'rgba(74,222,128,0.55)', fontSize:10, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.6px' }}>Entradas</p>
              <p style={{ color:S.green, fontSize:20, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.5px' }}>{fmt(indicadores.entradas_mes)}</p>
              <p style={{ color:'rgba(74,222,128,0.4)', fontSize:10, margin:0 }}>{dayjs(dataInicial).format('DD/MM')} a {dayjs(dataFinal).format('DD/MM')}</p>
            </div>
            <div style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:12, padding:'14px 16px' }}>
              <p style={{ color:'rgba(248,113,113,0.55)', fontSize:10, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.6px' }}>Saídas</p>
              <p style={{ color:S.red, fontSize:20, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.5px' }}>{fmt(indicadores.saidas_mes)}</p>
              <p style={{ color:'rgba(248,113,113,0.4)', fontSize:10, margin:0 }}>{dayjs(dataInicial).format('DD/MM')} a {dayjs(dataFinal).format('DD/MM')}</p>
            </div>
            <div style={{ background: indicadores.saldo_mes>=0?S.greenBg:S.redBg, border:`1px solid ${indicadores.saldo_mes>=0?S.greenBorder:S.redBorder}`, borderRadius:12, padding:'14px 16px' }}>
              <p style={{ color: indicadores.saldo_mes>=0?'rgba(74,222,128,0.55)':'rgba(248,113,113,0.55)', fontSize:10, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.6px' }}>Resultado</p>
              <p style={{ color: indicadores.saldo_mes>=0?S.green:S.red, fontSize:20, fontWeight:800, margin:'0 0 4px', letterSpacing:'-0.5px' }}>{indicadores.saldo_mes>=0?'+':''}{fmt(indicadores.saldo_mes)}</p>
              <p style={{ color: indicadores.saldo_mes>=0?'rgba(74,222,128,0.4)':'rgba(248,113,113,0.4)', fontSize:10, margin:0 }}>período selecionado</p>
            </div>
          </div>

          <div style={{ background:S.goldBg, border:`1px solid ${S.goldBorder}`, borderRadius:12, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <p style={{ color:'rgba(212,175,55,0.6)', fontSize:10, margin:0, textTransform:'uppercase', letterSpacing:'0.6px' }}>Saldo Acumulado</p>
                <span style={{ background:'rgba(212,175,55,0.15)', color:S.gold, fontSize:9, padding:'2px 8px', borderRadius:20, fontWeight:600 }}>TOTAL GERAL</span>
              </div>
              <p style={{ color:S.gold, fontSize:26, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>{fmt(indicadores.saldo_total)}</p>
              <p style={{ color:'rgba(212,175,55,0.4)', fontSize:11, margin:'4px 0 0' }}>posição em {dayjs(dataFinal).format('DD/MM/YYYY')}</p>
            </div>
            <DollarSign style={{ width:32, height:32, color:'rgba(212,175,55,0.4)' }} />
          </div>

          {/* Demonstrativo */}
          <div style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:12, padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <Calculator style={{ width:14, height:14, color:S.label }} />
              <p style={{ color:S.label, fontSize:10, margin:0, textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:600 }}>Demonstrativo do Cálculo</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {[
                { label:`Saldo Anterior (até ${dayjs(dataInicial).subtract(1,'day').format('DD/MM')})`, value:fmt(indicadores.saldo_anterior), color:S.blue },
                { label:`+ Entradas (${dayjs(dataInicial).format('DD/MM')} a ${dayjs(dataFinal).format('DD/MM')})`, value:`+ ${fmt(indicadores.entradas_mes)}`, color:S.green },
                { label:`− Saídas (${dayjs(dataInicial).format('DD/MM')} a ${dayjs(dataFinal).format('DD/MM')})`, value:`− ${fmt(indicadores.saidas_mes)}`, color:S.red },
              ].map((r,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', background:'rgba(255,255,255,0.02)', padding:'8px 10px', borderRadius:7 }}>
                  <span style={{ color:S.label, fontSize:11 }}>{r.label}</span>
                  <span style={{ color:r.color, fontWeight:700, fontSize:12, fontFamily:'monospace' }}>{r.value}</span>
                </div>
              ))}
              <div style={{ borderTop:`1px solid ${S.border}`, paddingTop:8, marginTop:2, display:'flex', justifyContent:'space-between', padding:'10px 10px 0' }}>
                <span style={{ color:S.text, fontSize:13, fontWeight:600 }}>= Saldo Acumulado Final</span>
                <span style={{ color:indicadores.saldo_total>=0?S.gold:S.red, fontWeight:800, fontSize:15, fontFamily:'monospace' }}>{fmt(indicadores.saldo_total)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Filtros */}
      <div style={{ background:S.card, borderRadius:12, padding:'12px 14px', border:`1px solid ${S.border}`, display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:10 }}>
        <div style={{ position:'relative' }}>
          <Search style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:13, height:13, color:S.label }} />
          <input type="text" placeholder="Buscar transações..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft:30 }} />
        </div>
        <SearchableSelect options={[{value:'all',label:'Todos os Tipos'},{value:'entrada',label:'Entradas'},{value:'saida',label:'Saídas'}]} value={tipoFilter} onChange={v=>setTipoFilter(v as any)} placeholder="Tipo" theme="dark" />
        <SearchableSelect options={[{value:'all',label:'Todas as Contas'},...contasBancarias.map(c=>({value:c.id,label:`${c.banco} - ${c.tipo_conta}`}))]} value={contaBancariaFilter} onChange={v=>setContaBancariaFilter(v)} placeholder="Conta" theme="dark" />
        <input type="date" value={dataInicial} onChange={e=>setDataInicial(e.target.value)} style={inputStyle} />
        <input type="date" value={dataFinal} onChange={e=>setDataFinal(e.target.value)} style={inputStyle} />
      </div>

      {/* Extrato */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', border:`2px solid rgba(212,175,55,0.15)`, borderTop:`2px solid ${S.gold}`, animation:'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:12, overflow:'hidden' }}>
          {/* Header da tabela */}
          <div style={{ background:`linear-gradient(135deg, ${S.wine} 0%, #5a1520 100%)`, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ color:'white', fontSize:13, fontWeight:600, margin:0, display:'flex', alignItems:'center', gap:6 }}>
                <FileText style={{ width:14, height:14 }} /> Extrato Bancário — Movimentações
              </p>
              <p style={{ color:'rgba(255,255,255,0.45)', fontSize:11, margin:'2px 0 0' }}>Saldo acumulado progressivo</p>
            </div>
            <button onClick={()=>setOrdemVisualizacao(o=>o==='asc'?'desc':'asc')}
              style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, padding:'6px 12px', color:'white', fontSize:11, cursor:'pointer' }}>
              <ArrowUpDown style={{ width:12, height:12 }} />
              {ordemVisualizacao==='asc'?'Mais antigas primeiro':'Mais recentes primeiro'}
            </button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  {['Data','Descrição','Entrada (+)','Saída (−)','Saldo','Ações'].map((h,i) => (
                    <th key={i} style={{ padding:'9px 14px', textAlign:i>=2&&i<5?'right':'left', fontSize:10, fontWeight:600, color:S.label, textTransform:'uppercase', letterSpacing:'0.6px', borderBottom:`1px solid ${S.border}`, whiteSpace:'nowrap', background:i===4?'rgba(212,175,55,0.05)':'transparent' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t,i) => (
                  <tr key={t.id} style={{ borderBottom:`1px solid rgba(255,255,255,0.03)`, background:i%2===0?'transparent':'rgba(255,255,255,0.01)' }}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.025)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=i%2===0?'transparent':'rgba(255,255,255,0.01)'}>
                    <td style={{ padding:'9px 14px', whiteSpace:'nowrap' }}>
                      <p style={{ color:S.text, fontSize:12, fontWeight:500, margin:0 }}>{dayjs(t.data).format('DD/MM/YYYY')}</p>
                      <p style={{ color:S.label, fontSize:10, margin:0 }}>{dayjs(t.data).format('ddd')}</p>
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        {t.tipo==='entrada'
                          ? <ArrowUpRight style={{ width:14, height:14, color:S.green, flexShrink:0, marginTop:1 }} />
                          : <ArrowDownRight style={{ width:14, height:14, color:S.red, flexShrink:0, marginTop:1 }} />}
                        <div>
                          <p style={{ color:S.text, fontSize:12, fontWeight:500, margin:0 }}>{t.descricao}</p>
                          {t.observacoes && <p style={{ color:S.label, fontSize:10, margin:0 }}>{t.observacoes}</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                      {t.tipo==='entrada' ? <span style={{ color:S.green, fontWeight:700, fontSize:12, fontFamily:'monospace' }}>{fmt(t.valor)}</span> : <span style={{ color:'rgba(255,255,255,0.15)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                      {t.tipo==='saida' ? <span style={{ color:S.red, fontWeight:700, fontSize:12, fontFamily:'monospace' }}>{fmt(t.valor)}</span> : <span style={{ color:'rgba(255,255,255,0.15)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'right', whiteSpace:'nowrap', background:'rgba(212,175,55,0.04)' }}>
                      <span style={{ color:(t.saldo_acumulado||0)>=0?S.gold:S.red, fontWeight:800, fontSize:12, fontFamily:'monospace' }}>{fmt(t.saldo_acumulado||0)}</span>
                    </td>
                    <td style={{ padding:'9px 14px', whiteSpace:'nowrap' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                        <button onClick={()=>openForm(t)} title="Editar" style={{ background:'rgba(96,165,250,0.1)', border:`1px solid rgba(96,165,250,0.2)`, borderRadius:6, padding:'4px 6px', cursor:'pointer', color:S.blue }}>
                          <Edit style={{ width:12, height:12 }} />
                        </button>
                        <button onClick={()=>handleDelete(t.id)} title="Excluir" style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:6, padding:'4px 6px', cursor:'pointer', color:S.red }}>
                          <Trash2 style={{ width:12, height:12 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTransactions.length===0 && (
              <div style={{ textAlign:'center', padding:48, color:S.label, fontSize:13 }}>
                {searchTerm||tipoFilter!=='all'||contaBancariaFilter!=='all' ? 'Nenhuma transação corresponde aos filtros.' : 'Nenhuma transação no período.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <h3 style={{ color:S.text, fontSize:15, fontWeight:700, margin:'0 0 18px' }}>{editingTransaction?'Editar Lançamento':'Novo Lançamento'}</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Tipo *</label>
                <select value={formData.tipo} onChange={e=>setFormData({...formData,tipo:e.target.value as any})} disabled={!!editingTransaction}
                  style={{ ...inputStyle, color:S.text }}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="transferencia">Transferência entre Contas</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Valor *</label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:S.label, fontSize:12 }}>R$</span>
                  <input type="number" step="0.01" min="0.01" value={formData.valor} onChange={e=>setFormData({...formData,valor:parseFloat(e.target.value)||0})} style={{ ...inputStyle, paddingLeft:36 }} />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Data *</label>
                <input type="date" value={formData.data} onChange={e=>setFormData({...formData,data:e.target.value})} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Descrição *</label>
                <input type="text" value={formData.descricao} onChange={e=>setFormData({...formData,descricao:e.target.value})} placeholder="Ex: Venda do dia, Pagamento fornecedor" style={inputStyle} />
              </div>
              {formData.tipo !== 'transferencia' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>Conta Bancária *</label>
                  <SearchableSelect options={contasBancarias.map(c=>({value:c.id,label:`${c.banco} - ${c.tipo_conta}`,sublabel:`Saldo: R$ ${c.saldo_atual.toFixed(2)}`}))} value={formData.conta_bancaria_id||''} onChange={v=>setFormData({...formData,conta_bancaria_id:v})} placeholder="Buscar conta..." theme="dark" />
                </div>
              )}
              {formData.tipo === 'transferencia' && (
                <>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Conta de Origem *</label>
                    <SearchableSelect options={contasBancarias.map(c=>({value:c.id,label:`${c.banco} - ${c.tipo_conta}`}))} value={formData.conta_bancaria_id||''} onChange={v=>setFormData({...formData,conta_bancaria_id:v})} placeholder="Buscar..." theme="dark" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Conta de Destino *</label>
                    <SearchableSelect options={contasBancarias.filter(c=>c.id!==formData.conta_bancaria_id).map(c=>({value:c.id,label:`${c.banco} - ${c.tipo_conta}`}))} value={formData.conta_destino_id||''} onChange={v=>setFormData({...formData,conta_destino_id:v})} placeholder="Buscar..." theme="dark" />
                  </div>
                </>
              )}
              <div style={fieldStyle}>
                <label style={labelStyle}>Observações</label>
                <textarea value={formData.observacoes} onChange={e=>setFormData({...formData,observacoes:e.target.value})} rows={2} style={{ ...inputStyle, resize:'vertical' }} />
              </div>
              <div style={{ border:`2px dashed ${S.border}`, borderRadius:10, padding:'16px', textAlign:'center' }}>
                <Upload style={{ width:24, height:24, color:S.label, margin:'0 auto 8px' }} />
                <label style={{ color:S.wine, fontSize:12, cursor:'pointer' }}>
                  <span>Upload de comprovante</span>
                  <input type="file" style={{ display:'none' }} onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" />
                </label>
                <p style={{ color:S.label, fontSize:10, margin:'4px 0 0' }}>PDF ou imagem até 10MB</p>
                {formData.comprovante && <p style={{ color:S.green, fontSize:10, margin:'4px 0 0' }}>✓ Arquivo carregado</p>}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
              <button onClick={()=>setShowForm(false)} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'8px 16px', color:S.muted, fontSize:12, cursor:'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={loading||!formData.descricao||!formData.valor||formData.valor<=0}
                style={{ background:S.wine, border:'none', borderRadius:8, padding:'8px 16px', color:'white', fontSize:12, cursor:'pointer', fontWeight:500, opacity:loading||!formData.descricao||!formData.valor?0.5:1 }}>
                {loading?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FluxoCaixa;
