import React, { useState, useEffect } from 'react';
import { Plus, Search, TrendingUp, Eye, CreditCard as Edit, Trash2, Download, CheckCircle, Clock, XCircle, AlertTriangle, Receipt, FileText, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';
import { SearchableSelect } from '../common/SearchableSelect';

interface ContaReceber {
  id: string; cliente_id: string; cliente_nome: string; cliente_documento?: string;
  cliente_telefone?: string; descricao: string; categoria_nome?: string;
  forma_recebimento_id?: string; valor_total: number; valor_recebido: number;
  saldo_restante: number; data_emissao: string; data_vencimento: string;
  numero_documento?: string; status: 'em_aberto'|'parcialmente_recebido'|'recebido'|'vencido'|'cancelado';
  observacoes?: string; esta_vencida: boolean; dias_vencimento: number; criado_em: string;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const S = {
  card: '#12141f', border: 'rgba(255,255,255,0.06)', label: 'rgba(255,255,255,0.35)',
  text: 'rgba(255,255,255,0.85)', muted: 'rgba(255,255,255,0.5)',
  green: '#4ade80', red: '#f87171', blue: '#60a5fa', gold: '#D4AF37', orange: '#fb923c',
  greenBg: 'rgba(74,222,128,0.08)', redBg: 'rgba(248,113,113,0.08)',
  blueBg: 'rgba(96,165,250,0.08)', goldBg: 'rgba(212,175,55,0.08)',
  greenBorder: 'rgba(74,222,128,0.15)', redBorder: 'rgba(248,113,113,0.15)',
  blueBorder: 'rgba(96,165,250,0.15)', goldBorder: 'rgba(212,175,55,0.15)',
  wine: '#7D1F2C', modalBg: '#0f1020',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, borderRadius: 8,
  padding: '8px 12px', color: S.text, fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = { color: S.label, fontSize: 11, marginBottom: 4, display: 'block' };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  recebido:               { label: 'Recebido',      color: S.green,  bg: 'rgba(74,222,128,0.12)',   icon: CheckCircle   },
  em_aberto:              { label: 'Em Aberto',     color: S.blue,   bg: 'rgba(96,165,250,0.12)',   icon: Clock         },
  parcialmente_recebido:  { label: 'Parcial',       color: S.gold,   bg: 'rgba(212,175,55,0.12)',   icon: AlertTriangle },
  vencido:                { label: 'Vencido',       color: S.red,    bg: 'rgba(248,113,113,0.12)',  icon: XCircle       },
  cancelado:              { label: 'Cancelado',     color: S.muted,  bg: 'rgba(255,255,255,0.06)',  icon: FileText      },
};

const ContasReceber: React.FC = () => {
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [indicadores, setIndicadores] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFormConta, setShowFormConta] = useState(false);
  const [showFormRecebimento, setShowFormRecebimento] = useState(false);
  const [editingConta, setEditingConta] = useState<ContaReceber | null>(null);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clienteFilter, setClienteFilter] = useState('all');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<any[]>([]);
  const [contasBancarias, setContasBancarias] = useState<any[]>([]);

  const [formDataConta, setFormDataConta] = useState({ cliente_id: '', descricao: '', categoria_id: '', centro_custo_id: '', forma_recebimento_id: '', valor_total: 0, data_emissao: dayjs().format('YYYY-MM-DD'), data_vencimento: dayjs().add(30,'days').format('YYYY-MM-DD'), numero_documento: '', observacoes: '' });
  const [formDataRecebimento, setFormDataRecebimento] = useState({ valor_recebimento: 0, data_recebimento: dayjs().format('YYYY-MM-DD'), forma_pagamento_id: '', conta_bancaria_id: '', numero_comprovante: '', observacoes: '' });

  useEffect(() => { fetchData(); fetchIndicadores(); fetchFormData(); }, []);
  useEffect(() => { fetchData(); fetchIndicadores(); }, [statusFilter, clienteFilter, dataInicial, dataFinal]);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      let query = supabase.from('vw_contas_receber').select('*');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (clienteFilter !== 'all') query = query.eq('cliente_id', clienteFilter);
      if (dataInicial) query = query.gte('data_vencimento', dataInicial);
      if (dataFinal) query = query.lte('data_vencimento', dataFinal);
      const { data, error } = await query.order('data_vencimento', { ascending: false });
      if (error) throw error;
      setContas(data || []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const fetchIndicadores = async () => {
    try {
      let query = supabase.from('contas_receber').select('valor_total, valor_recebido, saldo_restante, status, data_vencimento');
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (clienteFilter !== 'all') query = query.eq('cliente_id', clienteFilter);
      if (dataInicial) query = query.gte('data_vencimento', dataInicial);
      if (dataFinal) query = query.lte('data_vencimento', dataFinal);
      const { data } = await query;
      const hoje = new Date().toISOString().split('T')[0];
      setIndicadores({
        total_contas: (data||[]).length,
        valor_total: (data||[]).reduce((s,c) => s+c.valor_total,0),
        valor_recebido: (data||[]).reduce((s,c) => s+c.valor_recebido,0),
        saldo_pendente: (data||[]).reduce((s,c) => s+c.saldo_restante,0),
        contas_vencidas: (data||[]).filter(c => c.data_vencimento < hoje && c.saldo_restante > 0).length,
        valor_vencido: (data||[]).filter(c => c.data_vencimento < hoje && c.saldo_restante > 0).reduce((s,c) => s+c.saldo_restante,0),
      });
    } catch {}
  };

  const fetchFormData = async () => {
    const [a,b,c,d,e] = await Promise.all([
      supabase.from('clientes').select('*').eq('status','ativo'),
      supabase.from('vw_categoria_tree').select('*').eq('tipo','receita').eq('status','ativo'),
      supabase.from('centros_custo').select('*').eq('status','ativo'),
      supabase.from('formas_pagamento').select('*').eq('status','ativo'),
      supabase.from('vw_bancos_contas_saldo').select('*').eq('status','ativo'),
    ]);
    setClientes(a.data||[]); setCategorias(b.data||[]); setCentrosCusto(c.data||[]);
    setFormasPagamento(d.data||[]); setContasBancarias(e.data||[]);
  };

  const handleSaveConta = async () => {
    try {
      setLoading(true); setError(null);

      // FIX 1: Montar payload APENAS com campos que a tabela aceita no INSERT/UPDATE
      // saldo_restante é coluna GERADA (valor_total - valor_recebido) — nunca enviar
      // Campos opcionais vazios viram null (evita erro de UUID inválido)
      const payload = {
        cliente_id:           formDataConta.cliente_id || null,
        descricao:            formDataConta.descricao,
        valor_total:          parseFloat(formDataConta.valor_total.toString()),
        data_emissao:         formDataConta.data_emissao || null,
        data_vencimento:      formDataConta.data_vencimento,
        categoria_id:         formDataConta.categoria_id         || null,
        centro_custo_id:      formDataConta.centro_custo_id      || null,
        forma_recebimento_id: formDataConta.forma_recebimento_id || null,
        numero_documento:     formDataConta.numero_documento      || null,
        observacoes:          formDataConta.observacoes           || null,
      };

      // FIX 2: Validar cliente_id antes de enviar
      if (!payload.cliente_id) {
        setError('Selecione um cliente antes de salvar.');
        setLoading(false);
        return;
      }

      if (editingConta) {
        const { error } = await supabase.from('contas_receber').update(payload).eq('id', editingConta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contas_receber').insert([payload]);
        if (error) throw error;
      }

      setShowFormConta(false); setEditingConta(null); resetFormConta(); fetchData(); fetchIndicadores();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSaveRecebimento = async () => {
    if (!contaSelecionada) return;
    try {
      setLoading(true); setError(null);

      // FIX 3: Campos opcionais UUID também viram null se vazios
      const payload = {
        conta_receber_id:    contaSelecionada.id,
        valor_recebimento:   parseFloat(formDataRecebimento.valor_recebimento.toString()),
        data_recebimento:    formDataRecebimento.data_recebimento,
        forma_pagamento_id:  formDataRecebimento.forma_pagamento_id  || null,
        conta_bancaria_id:   formDataRecebimento.conta_bancaria_id   || null,
        numero_comprovante:  formDataRecebimento.numero_comprovante  || null,
        observacoes:         formDataRecebimento.observacoes          || null,
      };

      const { error } = await supabase.from('recebimentos_contas').insert([payload]);
      if (error) throw error;
      setShowFormRecebimento(false); setContaSelecionada(null); resetFormRecebimento(); fetchData(); fetchIndicadores();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta?')) return;
    try { setLoading(true); const { error } = await supabase.from('contas_receber').delete().eq('id', id); if (error) throw error; fetchData(); fetchIndicadores(); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const resetFormConta = () => setFormDataConta({ cliente_id:'', descricao:'', categoria_id:'', centro_custo_id:'', forma_recebimento_id:'', valor_total:0, data_emissao: dayjs().format('YYYY-MM-DD'), data_vencimento: dayjs().add(30,'days').format('YYYY-MM-DD'), numero_documento:'', observacoes:'' });
  const resetFormRecebimento = () => setFormDataRecebimento({ valor_recebimento:0, data_recebimento: dayjs().format('YYYY-MM-DD'), forma_pagamento_id:'', conta_bancaria_id:'', numero_comprovante:'', observacoes:'' });

  const openFormConta = (c?: ContaReceber) => {
    if (c) { setEditingConta(c); setFormDataConta({ cliente_id: c.cliente_id, descricao: c.descricao, categoria_id:'', centro_custo_id:'', forma_recebimento_id: c.forma_recebimento_id||'', valor_total: c.valor_total, data_emissao: c.data_emissao, data_vencimento: c.data_vencimento, numero_documento: c.numero_documento||'', observacoes: c.observacoes||'' }); }
    else { setEditingConta(null); resetFormConta(); }
    setShowFormConta(true);
  };

  const openFormRecebimento = (c: ContaReceber) => {
    setContaSelecionada(c);
    setFormDataRecebimento({ ...formDataRecebimento, valor_recebimento: c.saldo_restante });
    setShowFormRecebimento(true);
  };

  const filtered = contas.filter(c =>
    c.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.numero_documento?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const btnStyle = (color = S.wine): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, background: color, border: 'none',
    borderRadius: 8, padding: '8px 14px', color: 'white', fontSize: 12, cursor: 'pointer', fontWeight: 500,
  });

  const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 };
  const modalCard: React.CSSProperties = { background: S.modalBg, border: `1px solid ${S.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' };
  const modalTitle: React.CSSProperties = { color: S.text, fontSize: 16, fontWeight: 700, margin: '0 0 20px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={{ ...btnStyle('rgba(255,255,255,0.08)'), color: S.muted, border: `1px solid ${S.border}` }}
          onClick={() => exportToExcel(filtered.map(c => [c.cliente_nome,c.descricao,fmt(c.valor_total),fmt(c.saldo_restante),dayjs(c.data_vencimento).format('DD/MM/YYYY')]), ['Cliente','Descrição','Total','Saldo','Vencimento'], 'contas-receber')}>
          <Download style={{ width: 13, height: 13 }} /> Excel
        </button>
        <button style={btnStyle()} onClick={() => openFormConta()}>
          <Plus style={{ width: 13, height: 13 }} /> Nova Conta a Receber
        </button>
      </div>

      {error && <div style={{ background: S.redBg, border: `1px solid ${S.redBorder}`, borderRadius: 10, padding: '10px 14px', color: S.red, fontSize: 12 }}>{error}</div>}

      {/* Indicadores */}
      {indicadores && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Total Contas', value: indicadores.total_contas, color: S.blue, bg: S.blueBg, border: S.blueBorder },
            { label: 'Saldo Pendente', value: fmt(indicadores.saldo_pendente), color: S.gold, bg: S.goldBg, border: S.goldBorder },
            { label: 'Contas Vencidas', value: indicadores.contas_vencidas, color: S.red, bg: S.redBg, border: S.redBorder },
            { label: 'Valor Vencido', value: fmt(indicadores.valor_vencido), color: S.orange, bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.15)' },
          ].map((c, i) => (
            <div key={i} style={{ background: c.bg, borderRadius: 12, padding: '12px 14px', border: `1px solid ${c.border}` }}>
              <p style={{ color: c.color, opacity: 0.6, fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{c.label}</p>
              <p style={{ color: c.color, fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: S.card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${S.border}`, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: S.label }} />
          <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <SearchableSelect options={[{value:'all',label:'Todos os Status'},...Object.entries(STATUS_MAP).map(([v,m])=>({value:v,label:m.label}))]} value={statusFilter} onChange={v => setStatusFilter(v)} placeholder="Status" theme="dark" />
        <SearchableSelect options={[{value:'all',label:'Todos Clientes'},...clientes.map(c=>({value:c.id,label:c.nome}))]} value={clienteFilter} onChange={v => setClienteFilter(v)} placeholder="Cliente" theme="dark" />
        <input type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)} style={inputStyle} />
        <input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)} style={inputStyle} />
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(212,175,55,0.15)`, borderTop: `2px solid ${S.gold}`, animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['Cliente', 'Descrição', 'Vencimento', 'Total', 'Recebido', 'Saldo', 'Status', 'Ações'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: i > 2 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: S.label, textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: `1px solid ${S.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(conta => {
                  const st = STATUS_MAP[conta.status] || STATUS_MAP['em_aberto'];
                  const Icon = st.icon;
                  return (
                    <tr key={conta.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <td style={{ padding: '10px 14px' }}>
                        <p style={{ color: S.text, fontSize: 12, fontWeight: 500, margin: 0 }}>{conta.cliente_nome}</p>
                        {conta.cliente_documento && <p style={{ color: S.label, fontSize: 10, margin: 0 }}>{conta.cliente_documento}</p>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <p style={{ color: S.text, fontSize: 12, margin: 0 }}>{conta.descricao}</p>
                        {conta.numero_documento && <p style={{ color: S.label, fontSize: 10, margin: 0 }}>Doc: {conta.numero_documento}</p>}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <p style={{ color: conta.esta_vencida ? S.red : S.text, fontSize: 12, fontWeight: 500, margin: 0 }}>{dayjs(conta.data_vencimento).format('DD/MM/YYYY')}</p>
                        {conta.esta_vencida && <p style={{ color: S.red, fontSize: 10, margin: 0 }}>{conta.dias_vencimento}d atraso</p>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: S.text, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{fmt(conta.valor_total)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: S.green, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{fmt(conta.valor_recebido)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: conta.saldo_restante > 0 ? S.orange : S.green, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{fmt(conta.saldo_restante)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st.bg, borderRadius: 20, padding: '3px 10px' }}>
                          <Icon style={{ width: 11, height: 11, color: st.color }} />
                          <span style={{ color: st.color, fontSize: 10, fontWeight: 600 }}>{st.label}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {conta.status !== 'recebido' && conta.status !== 'cancelado' && (
                            <button onClick={() => openFormRecebimento(conta)} title="Registrar Recebimento"
                              style={{ background: 'rgba(74,222,128,0.1)', border: `1px solid rgba(74,222,128,0.2)`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: S.green }}>
                              <Receipt style={{ width: 13, height: 13 }} />
                            </button>
                          )}
                          <button onClick={() => openFormConta(conta)} title="Editar"
                            style={{ background: 'rgba(96,165,250,0.1)', border: `1px solid rgba(96,165,250,0.2)`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: S.blue }}>
                            <Edit style={{ width: 13, height: 13 }} />
                          </button>
                          <button onClick={() => handleDelete(conta.id)} title="Excluir"
                            style={{ background: S.redBg, border: `1px solid ${S.redBorder}`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: S.red }}>
                            <Trash2 style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: S.label, fontSize: 13 }}>Nenhuma conta encontrada</div>
            )}
          </div>
        </div>
      )}

      {/* Modal Nova/Editar Conta */}
      {showFormConta && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <h3 style={modalTitle}>{editingConta ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Cliente *</label>
                <SearchableSelect options={clientes.map(c=>({value:c.id,label:c.nome}))} value={formDataConta.cliente_id} onChange={v=>setFormDataConta({...formDataConta,cliente_id:v})} placeholder="Buscar cliente..." theme="dark" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Valor Total *</label>
                <input type="number" step="0.01" value={formDataConta.valor_total} onChange={e=>setFormDataConta({...formDataConta,valor_total:parseFloat(e.target.value)||0})} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Data Emissão *</label>
                <input type="date" value={formDataConta.data_emissao} onChange={e=>setFormDataConta({...formDataConta,data_emissao:e.target.value})} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Data Vencimento *</label>
                <input type="date" value={formDataConta.data_vencimento} onChange={e=>setFormDataConta({...formDataConta,data_vencimento:e.target.value})} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Categoria</label>
                <SearchableSelect options={categorias.map(c=>({value:c.id,label:c.caminho_completo||c.nome}))} value={formDataConta.categoria_id} onChange={v=>setFormDataConta({...formDataConta,categoria_id:v})} placeholder="Buscar..." theme="dark" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Forma de Recebimento</label>
                <SearchableSelect options={formasPagamento.map(f=>({value:f.id,label:f.nome}))} value={formDataConta.forma_recebimento_id} onChange={v=>setFormDataConta({...formDataConta,forma_recebimento_id:v})} placeholder="Buscar..." theme="dark" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Número do Documento</label>
                <input type="text" value={formDataConta.numero_documento} onChange={e=>setFormDataConta({...formDataConta,numero_documento:e.target.value})} style={inputStyle} />
              </div>
              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle}>Descrição *</label>
                <input type="text" value={formDataConta.descricao} onChange={e=>setFormDataConta({...formDataConta,descricao:e.target.value})} style={inputStyle} />
              </div>
              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle}>Observações</label>
                <textarea value={formDataConta.observacoes} onChange={e=>setFormDataConta({...formDataConta,observacoes:e.target.value})} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={()=>setShowFormConta(false)} style={{ background:'rgba(255,255,255,0.05)',border:`1px solid ${S.border}`,borderRadius:8,padding:'8px 16px',color:S.muted,fontSize:12,cursor:'pointer' }}>Cancelar</button>
              <button onClick={handleSaveConta} disabled={loading||!formDataConta.cliente_id||!formDataConta.descricao} style={{ ...btnStyle(), opacity: loading||!formDataConta.cliente_id||!formDataConta.descricao?0.5:1 }}>{loading?'Salvando...':'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Recebimento */}
      {showFormRecebimento && contaSelecionada && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, maxWidth: 520 }}>
            <h3 style={modalTitle}>Registrar Recebimento</h3>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: `1px solid ${S.border}` }}>
              <p style={{ color: S.text, fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{contaSelecionada.cliente_nome}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[['Total', fmt(contaSelecionada.valor_total), S.text], ['Recebido', fmt(contaSelecionada.valor_recebido), S.green], ['Saldo', fmt(contaSelecionada.saldo_restante), S.orange]].map(([l,v,c],i) => (
                  <div key={i}><span style={{ color: S.label, fontSize: 11 }}>{l}: </span><span style={{ color: c as string, fontSize: 12, fontWeight: 600 }}>{v}</span></div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Valor do Recebimento *</label>
                <input type="number" step="0.01" max={contaSelecionada.saldo_restante} value={formDataRecebimento.valor_recebimento} onChange={e=>setFormDataRecebimento({...formDataRecebimento,valor_recebimento:parseFloat(e.target.value)||0})} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Data do Recebimento *</label>
                <input type="date" value={formDataRecebimento.data_recebimento} onChange={e=>setFormDataRecebimento({...formDataRecebimento,data_recebimento:e.target.value})} style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Forma de Pagamento</label>
                <SearchableSelect options={formasPagamento.map(f=>({value:f.id,label:f.nome}))} value={formDataRecebimento.forma_pagamento_id} onChange={v=>setFormDataRecebimento({...formDataRecebimento,forma_pagamento_id:v})} placeholder="Buscar..." theme="dark" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Conta Bancária</label>
                <SearchableSelect options={contasBancarias.map(c=>({value:c.id,label:`${c.banco} - ${c.tipo_conta}`}))} value={formDataRecebimento.conta_bancaria_id} onChange={v=>setFormDataRecebimento({...formDataRecebimento,conta_bancaria_id:v})} placeholder="Buscar..." theme="dark" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Número do Comprovante</label>
                <input type="text" value={formDataRecebimento.numero_comprovante} onChange={e=>setFormDataRecebimento({...formDataRecebimento,numero_comprovante:e.target.value})} style={inputStyle} />
              </div>
              <div style={{ ...fieldStyle, gridColumn: 'span 2' }}>
                <label style={labelStyle}>Observações</label>
                <textarea value={formDataRecebimento.observacoes} onChange={e=>setFormDataRecebimento({...formDataRecebimento,observacoes:e.target.value})} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={()=>setShowFormRecebimento(false)} style={{ background:'rgba(255,255,255,0.05)',border:`1px solid ${S.border}`,borderRadius:8,padding:'8px 16px',color:S.muted,fontSize:12,cursor:'pointer' }}>Cancelar</button>
              <button onClick={handleSaveRecebimento} disabled={loading||!formDataRecebimento.valor_recebimento||formDataRecebimento.valor_recebimento>contaSelecionada.saldo_restante}
                style={{ background:'rgba(74,222,128,0.15)',border:`1px solid rgba(74,222,128,0.25)`,borderRadius:8,padding:'8px 16px',color:S.green,fontSize:12,cursor:'pointer',fontWeight:600,opacity:loading?0.5:1 }}>
                {loading?'Salvando...':'Registrar Recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContasReceber;
