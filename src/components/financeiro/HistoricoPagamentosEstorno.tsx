import React, { useState, useEffect } from 'react';
import { RotateCcw, AlertTriangle, DollarSign, Calendar, FileText, Trash2, Search, Filter, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface PagamentoRealizado {
  id: string; valor: number; data: string; descricao: string;
  conta_pagar_id: string; conta_pagar_descricao?: string; fornecedor_nome?: string;
  forma_pagamento_nome?: string; conta_bancaria?: string; observacoes?: string; criado_em: string;
}
interface EstornoHistorico {
  id: string; fluxo_caixa_id: string; valor_estornado: number;
  motivo?: string; data_estorno: string; estornado_por_nome?: string;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const S = {
  card: '#12141f', border: 'rgba(255,255,255,0.06)', label: 'rgba(255,255,255,0.35)',
  text: 'rgba(255,255,255,0.85)', muted: 'rgba(255,255,255,0.5)',
  green: '#4ade80', red: '#f87171', gold: '#D4AF37', orange: '#fb923c',
  greenBg: 'rgba(74,222,128,0.08)', redBg: 'rgba(248,113,113,0.08)',
  orangeBg: 'rgba(251,146,60,0.08)', orangeBorder: 'rgba(251,146,60,0.15)',
  redBorder: 'rgba(248,113,113,0.15)', wine: '#7D1F2C', modalBg: '#0f1020',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, borderRadius: 8,
  padding: '7px 12px', color: S.text, fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};

const HistoricoPagamentosEstorno: React.FC = () => {
  const [pagamentos, setPagamentos] = useState<PagamentoRealizado[]>([]);
  const [estornos, setEstornos] = useState<EstornoHistorico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEstornoModal, setShowEstornoModal] = useState(false);
  const [selectedPagamento, setSelectedPagamento] = useState<PagamentoRealizado | null>(null);
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dataInicio, setDataInicio] = useState(dayjs().subtract(30,'days').format('YYYY-MM-DD'));
  const [dataFim, setDataFim] = useState(dayjs().format('YYYY-MM-DD'));
  const [statusFiltro, setStatusFiltro] = useState<'todos'|'ativos'|'estornados'>('todos');
  const [showFiltros, setShowFiltros] = useState(false);

  useEffect(() => { fetchData(); }, [dataInicio, dataFim]);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const { data: pd, error: pe } = await supabase.from('fluxo_caixa').select(`
        id, valor, data, descricao, conta_pagar_id, observacoes, criado_em, conta_bancaria_id,
        contas_pagar:conta_pagar_id(id, descricao, fornecedores:fornecedor_id(nome), formas_pagamento:forma_pagamento_id(nome)),
        bancos_contas:conta_bancaria_id(banco, tipo_conta)
      `).eq('tipo','saida').not('conta_pagar_id','is',null).gte('data',dataInicio).lte('data',dataFim).order('data',{ascending:false});
      if (pe) throw pe;
      setPagamentos((pd||[]).map((p: any) => ({ id:p.id, valor:p.valor, data:p.data, descricao:p.descricao, conta_pagar_id:p.conta_pagar_id, conta_pagar_descricao:p.contas_pagar?.descricao, fornecedor_nome:p.contas_pagar?.fornecedores?.nome, forma_pagamento_nome:p.contas_pagar?.formas_pagamento?.nome, conta_bancaria: p.bancos_contas?`${p.bancos_contas.banco} - ${p.bancos_contas.tipo_conta}`:null, observacoes:p.observacoes, criado_em:p.criado_em })));
      const { data: ed, error: ee } = await supabase.from('historico_estornos_pagamento').select('*').gte('data_estorno',dataInicio).lte('data_estorno',dataFim).order('data_estorno',{ascending:false});
      if (ee) throw ee;
      setEstornos(ed||[]);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verificarJaEstornado = (id: string) => estornos.some(e => e.fluxo_caixa_id === id);

  const filtrados = pagamentos.filter(p => {
    const est = verificarJaEstornado(p.id);
    if (statusFiltro === 'ativos' && est) return false;
    if (statusFiltro === 'estornados' && !est) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return p.fornecedor_nome?.toLowerCase().includes(t) || p.descricao?.toLowerCase().includes(t) || p.conta_pagar_descricao?.toLowerCase().includes(t);
    }
    return true;
  });

  const handleEstornar = async () => {
    if (!selectedPagamento || !motivo.trim()) { alert('Informe o motivo'); return; }
    if (!confirm(`Confirma estorno de ${fmt(selectedPagamento.valor)}?`)) return;
    try {
      setLoading(true); setError(null);
      const { data, error: rpcError } = await supabase.rpc('estornar_pagamento_parcial', { p_fluxo_caixa_id: selectedPagamento.id, p_motivo: motivo, p_observacoes: observacoes||null });
      if (rpcError) throw rpcError;
      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) throw new Error(result.error || 'Erro ao processar estorno');
      alert(result.message || 'Estorno realizado!');
      setShowEstornoModal(false); setSelectedPagamento(null); setMotivo(''); setObservacoes('');
      fetchData();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const modalOverlay: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 };
  const modalCard: React.CSSProperties = { background: S.modalBg, border:`1px solid ${S.border}`, borderRadius:16, padding:24, width:'100%', maxWidth:480 };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Aviso */}
      <div style={{ background: S.orangeBg, border:`1px solid ${S.orangeBorder}`, borderRadius:10, padding:'12px 16px', display:'flex', gap:10 }}>
        <AlertTriangle style={{ width:16, height:16, color:S.orange, flexShrink:0, marginTop:1 }} />
        <div>
          <p style={{ color: S.orange, fontSize:12, fontWeight:600, margin:'0 0 2px' }}>Atenção ao estornar pagamentos</p>
          <p style={{ color:'rgba(251,146,60,0.7)', fontSize:11, margin:0 }}>O estorno excluirá o lançamento do fluxo de caixa e ajustará o saldo da conta a pagar. Ação irreversível.</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: S.card, borderRadius:12, border:`1px solid ${S.border}`, overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom: showFiltros ? `1px solid ${S.border}` : 'none' }}>
          <div style={{ display:'flex', gap:8 }}>
            {(['todos','ativos','estornados'] as const).map(s => (
              <button key={s} onClick={() => setStatusFiltro(s)} style={{ padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:500,
                background: statusFiltro===s ? S.wine : 'rgba(255,255,255,0.05)',
                color: statusFiltro===s ? 'white' : S.label }}>
                {s === 'todos' ? 'Todos' : s === 'ativos' ? 'Ativos' : 'Estornados'}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ color:S.label, fontSize:11 }}>{filtrados.length} reg.</span>
            <button onClick={() => setShowFiltros(!showFiltros)} style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:7, padding:'5px 10px', color:S.muted, fontSize:11, cursor:'pointer' }}>
              <Filter style={{ width:12, height:12 }} /> Filtros
            </button>
            <button onClick={fetchData} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:7, padding:'5px 10px', color:S.muted, fontSize:11, cursor:'pointer' }}>
              Atualizar
            </button>
          </div>
        </div>
        {showFiltros && (
          <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
            <div style={{ position:'relative' }}>
              <Search style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:12, height:12, color:S.label }} />
              <input type="text" placeholder="Buscar fornecedor, descrição..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft:28 }} />
            </div>
            <input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={inputStyle} />
            <input type="date" value={dataFim} onChange={e=>setDataFim(e.target.value)} style={inputStyle} />
          </div>
        )}
      </div>

      {error && <div style={{ background: S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:10, padding:'10px 14px', color: S.red, fontSize:12 }}>{error}</div>}

      {/* Tabela pagamentos */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', border:`2px solid rgba(212,175,55,0.15)`, borderTop:`2px solid ${S.gold}`, animation:'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ background: S.card, borderRadius:12, border:`1px solid ${S.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${S.border}` }}>
            <span style={{ color: S.text, fontSize:13, fontWeight:600 }}>Pagamentos Realizados</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  {['Data','Fornecedor','Descrição','Valor','Forma Pagamento','Status','Ações'].map((h,i) => (
                    <th key={i} style={{ padding:'9px 14px', textAlign: i>=3 && i<6 ? 'right' : 'left', fontSize:10, fontWeight:600, color:S.label, textTransform:'uppercase', letterSpacing:'0.6px', borderBottom:`1px solid ${S.border}`, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const est = verificarJaEstornado(p.id);
                  return (
                    <tr key={p.id} style={{ borderBottom:`1px solid rgba(255,255,255,0.03)`, background: est ? 'rgba(248,113,113,0.04)' : 'transparent' }}
                      onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background = est?'rgba(248,113,113,0.06)':'rgba(255,255,255,0.02)'}
                      onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background = est?'rgba(248,113,113,0.04)':'transparent'}>
                      <td style={{ padding:'9px 14px', whiteSpace:'nowrap' }}>
                        <span style={{ color:S.text, fontSize:12 }}>{dayjs(p.data).format('DD/MM/YY')}</span>
                      </td>
                      <td style={{ padding:'9px 14px' }}>
                        <span style={{ color:S.text, fontSize:12, fontWeight:500 }}>{p.fornecedor_nome||'—'}</span>
                      </td>
                      <td style={{ padding:'9px 14px' }}>
                        <p style={{ color:S.text, fontSize:12, margin:0 }}>{p.conta_pagar_descricao||p.descricao}</p>
                        {p.observacoes && <p style={{ color:S.label, fontSize:10, margin:0 }}>{p.observacoes}</p>}
                      </td>
                      <td style={{ padding:'9px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                        <span style={{ color:S.red, fontSize:12, fontWeight:700, fontFamily:'monospace' }}>{fmt(p.valor)}</span>
                      </td>
                      <td style={{ padding:'9px 14px', textAlign:'right' }}>
                        <p style={{ color:S.muted, fontSize:12, margin:0 }}>{p.forma_pagamento_nome||'—'}</p>
                        {p.conta_bancaria && <p style={{ color:S.label, fontSize:10, margin:0 }}>{p.conta_bancaria}</p>}
                      </td>
                      <td style={{ padding:'9px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                        <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:600,
                          background: est ? S.redBg : 'rgba(74,222,128,0.1)',
                          color: est ? S.red : S.green }}>
                          {est ? 'Estornado' : 'Ativo'}
                        </span>
                      </td>
                      <td style={{ padding:'9px 14px', whiteSpace:'nowrap' }}>
                        {!est && (
                          <button onClick={() => { setSelectedPagamento(p); setMotivo(''); setObservacoes(''); setShowEstornoModal(true); }}
                            style={{ display:'flex', alignItems:'center', gap:5, background:S.orangeBg, border:`1px solid ${S.orangeBorder}`, borderRadius:7, padding:'5px 10px', color:S.orange, fontSize:11, cursor:'pointer', fontWeight:500 }}>
                            <RotateCcw style={{ width:11, height:11 }} /> Estornar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtrados.length === 0 && <div style={{ textAlign:'center', padding:40, color:S.label, fontSize:13 }}>Nenhum pagamento encontrado</div>}
          </div>
        </div>
      )}

      {/* Histórico de estornos */}
      {estornos.length > 0 && (
        <div style={{ background: S.card, borderRadius:12, border:`1px solid ${S.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${S.border}` }}>
            <span style={{ color:S.text, fontSize:13, fontWeight:600 }}>Histórico de Estornos</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                  {['Data Estorno','Valor','Motivo','Estornado Por'].map((h,i) => (
                    <th key={i} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:600, color:S.label, textTransform:'uppercase', letterSpacing:'0.6px', borderBottom:`1px solid ${S.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estornos.map(e => (
                  <tr key={e.id} style={{ borderBottom:`1px solid rgba(255,255,255,0.03)` }}>
                    <td style={{ padding:'9px 14px' }}><span style={{ color:S.text, fontSize:12 }}>{dayjs(e.data_estorno).format('DD/MM/YY HH:mm')}</span></td>
                    <td style={{ padding:'9px 14px' }}><span style={{ color:S.red, fontSize:12, fontWeight:700, fontFamily:'monospace' }}>{fmt(e.valor_estornado)}</span></td>
                    <td style={{ padding:'9px 14px' }}><span style={{ color:S.muted, fontSize:12 }}>{e.motivo||'—'}</span></td>
                    <td style={{ padding:'9px 14px' }}><span style={{ color:S.label, fontSize:12 }}>{e.estornado_por_nome||'Sistema'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Estorno */}
      {showEstornoModal && selectedPagamento && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <h3 style={{ color:S.text, fontSize:15, fontWeight:700, margin:'0 0 16px', display:'flex', alignItems:'center', gap:8 }}>
              <RotateCcw style={{ width:16, height:16, color:S.orange }} /> Estornar Pagamento
            </h3>
            <div style={{ background:S.redBg, border:`1px solid ${S.redBorder}`, borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', gap:8 }}>
              <AlertTriangle style={{ width:14, height:14, color:S.red, flexShrink:0, marginTop:1 }} />
              <p style={{ color:S.red, fontSize:11, margin:0 }}>Esta ação é irreversível e excluirá o lançamento do fluxo de caixa.</p>
            </div>
            <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:9, padding:'10px 12px', marginBottom:16, border:`1px solid ${S.border}` }}>
              {[['Fornecedor', selectedPagamento.fornecedor_nome||'—'], ['Descrição', selectedPagamento.conta_pagar_descricao||selectedPagamento.descricao], ['Data', dayjs(selectedPagamento.data).format('DD/MM/YYYY')], ['Valor', fmt(selectedPagamento.valor)]].map(([l,v],i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ color:S.label, fontSize:11 }}>{l}</span>
                  <span style={{ color: l==='Valor' ? S.red : S.text, fontSize:12, fontWeight: l==='Valor' ? 700 : 400 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ color:S.label, fontSize:11, display:'block', marginBottom:4 }}>Motivo *</label>
                <select value={motivo} onChange={e=>setMotivo(e.target.value)} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'8px 12px', color: motivo ? S.text : S.label, fontSize:12, outline:'none', width:'100%' }}>
                  <option value="">Selecione o motivo...</option>
                  {['Pagamento duplicado','Valor incorreto','Conta errada','Fornecedor errado','Solicitação do fornecedor','Outro erro operacional'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ color:S.label, fontSize:11, display:'block', marginBottom:4 }}>Observações</label>
                <textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} rows={2} placeholder="Detalhes adicionais..." style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'8px 12px', color:S.text, fontSize:12, outline:'none', width:'100%', resize:'vertical', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
              <button onClick={()=>setShowEstornoModal(false)} style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${S.border}`, borderRadius:8, padding:'8px 14px', color:S.muted, fontSize:12, cursor:'pointer' }}>Cancelar</button>
              <button onClick={handleEstornar} disabled={loading||!motivo}
                style={{ display:'flex', alignItems:'center', gap:6, background:S.orangeBg, border:`1px solid ${S.orangeBorder}`, borderRadius:8, padding:'8px 14px', color:S.orange, fontSize:12, cursor:'pointer', fontWeight:600, opacity:loading||!motivo?0.5:1 }}>
                <RotateCcw style={{ width:13, height:13 }} /> {loading?'Processando...':'Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoricoPagamentosEstorno;
