import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import {
  Plus, Search, CreditCard as Edit, Trash2, Calendar,
  DollarSign, CheckSquare, MessageSquare, X,
  List, CalendarDays, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { testConnection } from '../lib/supabase';
import dayjs from 'dayjs';
import ChatFinanceiroIA from '../components/financeiro/ChatFinanceiroIA';
import MapaMesasAdmin from '../components/events/MapaMesasAdmin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventoFechado {
  id: string;
  nome_evento: string;
  data_evento: string;
  horario_inicio: string;
  horario_fim: string;
  cliente_responsavel: string;
  telefone_cliente?: string;
  tipo_evento: string;
  promocao_vinculada?: string;
  observacoes?: string;
  valor_total: number;
  quantidade_pessoas: number;
  status_pagamento: 'pendente' | 'pago_parcial' | 'pago_total' | 'cancelado';
  forma_pagamento?: string;
  contrato_assinado: boolean;
  convite_impresso: boolean;
  data_retirada_convite?: string;
  data_pagamento_contrato?: string;
  criado_em: string;
}

interface ReservaEspecial {
  id: string;
  data_reserva: string;
  horario_inicio: string;
  horario_fim: string;
  nome_cliente: string;
  telefone_cliente: string;
  quantidade_pessoas: number;
  valor_cobrado: number;
  status_pagamento: 'pendente' | 'pago_parcial' | 'pago_total' | 'cancelado';
  local_reservado: string;
  o_que_esta_incluso?: string;
  detalhes_evento?: string;
  criado_em: string;
}

interface ReservaNormal {
  id: string;
  nome_cliente: string;
  telefone_cliente: string;
  data_reserva: string;
  horario: string;
  numero_pessoas: number;
  local_bar: string;
  observacoes?: string;
  criado_em: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pago_total': case 'pago':   return 'text-emerald-400 bg-emerald-500/20';
    case 'pago_parcial':               return 'text-yellow-400 bg-yellow-500/20';
    case 'pendente': case 'reservado': return 'text-orange-400 bg-orange-500/20';
    case 'cancelado':                  return 'text-red-400 bg-red-500/20';
    default:                           return 'text-white/80 bg-white/10';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'pago_total':  return 'Pago Total';
    case 'pago_parcial':return 'Pago Parcial';
    case 'pendente':    return 'Pendente';
    case 'cancelado':   return 'Cancelado';
    case 'reservado':   return 'Reservado';
    case 'pago':        return 'Pago';
    default:            return status;
  }
};

const inputCls = 'w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:border-[#7D1F2C]';
const selectCls = inputCls;

// ─── Componente Principal ─────────────────────────────────────────────────────

const Events: React.FC = () => {
  const [selectedTab, setSelectedTab]   = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [editingItem, setEditingItem]   = useState<any>(null);
  const [showChatIA, setShowChatIA]     = useState(false);

  // Modal conta a receber
  const [showGerarContaModal, setShowGerarContaModal]   = useState(false);
  const [eventoParaGerarConta, setEventoParaGerarConta] = useState<any>(null);
  const [dataVencimentoConta, setDataVencimentoConta]   = useState('');

  // Dados
  const [eventosFechados, setEventosFechados]     = useState<EventoFechado[]>([]);
  const [reservasEspeciais, setReservasEspeciais] = useState<ReservaEspecial[]>([]);
  const [reservasNormais, setReservasNormais]     = useState<ReservaNormal[]>([]);

  // Filtros
  const [searchTerm, setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mesFilter, setMesFilter]     = useState(dayjs().month() + 1);
  const [anoFilter, setAnoFilter]     = useState(dayjs().year());

  // Forms
  const [formEventoFechado, setFormEventoFechado] = useState({
    nome_evento: '', data_evento: dayjs().format('YYYY-MM-DD'),
    horario_inicio: '19:00', horario_fim: '23:00',
    cliente_responsavel: '', telefone_cliente: '', tipo_evento: 'festa_privada',
    valor_total: 0, quantidade_pessoas: 1, observacoes: '',
    contrato_assinado: false, convite_impresso: false,
    data_retirada_convite: '', data_pagamento_contrato: '',
    status_pagamento: 'pendente' as EventoFechado['status_pagamento'],
  });

  const [formReservaEspecial, setFormReservaEspecial] = useState({
    data_reserva: dayjs().format('YYYY-MM-DD'), horario_inicio: '19:00', horario_fim: '23:00',
    nome_cliente: '', telefone_cliente: '', quantidade_pessoas: 1,
    valor_cobrado: 0, local_reservado: 'mezanino', o_que_esta_incluso: '', detalhes_evento: '',
  });

  const [formReservaNormal, setFormReservaNormal] = useState({
    nome_cliente: '', telefone_cliente: '',
    data_reserva: dayjs().format('YYYY-MM-DD'), horario: '19:00',
    numero_pessoas: 1, local_bar: 'interna', observacoes: '',
  });

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(dayjs().startOf('month'));
  const [allCalendarEvents, setAllCalendarEvents] = useState<any[]>([]);

  const tabTitles = ['Eventos Fechados', 'Reservas Especiais', 'Reservas Normais', 'Mapa de Mesas'];

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => { fetchData(); }, [selectedTab, mesFilter, anoFilter, statusFilter]);
  useEffect(() => { if (viewMode === 'calendar') fetchCalendarData(); }, [viewMode, calendarMonth]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const connectionOk = await testConnection();
      if (!connectionOk) {
        setEventosFechados([]); setReservasEspeciais([]);
        setReservasNormais([]);
        setLoading(false); return;
      }

      const inicioMes = dayjs().year(anoFilter).month(mesFilter - 1).startOf('month').format('YYYY-MM-DD');
      const fimMes    = dayjs().year(anoFilter).month(mesFilter - 1).endOf('month').format('YYYY-MM-DD');

      if (selectedTab === 0) {
        let q = supabase.from('eventos_fechados').select('*')
          .gte('data_evento', inicioMes).lte('data_evento', fimMes);
        if (statusFilter !== 'all') q = q.eq('status_pagamento', statusFilter);
        const { data, error } = await q.order('data_evento', { ascending: false });
        if (error) throw error;
        setEventosFechados(data || []);

      } else if (selectedTab === 1) {
        let q = supabase.from('reservas_especiais').select('*')
          .gte('data_reserva', inicioMes).lte('data_reserva', fimMes);
        if (statusFilter !== 'all') q = q.eq('status_pagamento', statusFilter);
        const { data, error } = await q.order('data_reserva', { ascending: false });
        if (error) throw error;
        setReservasEspeciais(data || []);

      } else if (selectedTab === 2) {
        const { data, error } = await supabase.from('reservas_normais').select('*')
          .gte('data_reserva', inicioMes).lte('data_reserva', fimMes)
          .order('data_reserva', { ascending: false });
        if (error) throw error;
        setReservasNormais(data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendarData = async () => {
    try {
      const inicio = calendarMonth.startOf('month').format('YYYY-MM-DD');
      const fim    = calendarMonth.endOf('month').format('YYYY-MM-DD');

      const [ef, re, rn] = await Promise.all([
        supabase.from('eventos_fechados').select('id,nome_evento,data_evento,horario_inicio,status_pagamento,tipo_evento').gte('data_evento', inicio).lte('data_evento', fim),
        supabase.from('reservas_especiais').select('id,nome_cliente,data_reserva,horario_inicio,status_pagamento,local_reservado').gte('data_reserva', inicio).lte('data_reserva', fim),
        supabase.from('reservas_normais').select('id,nome_cliente,data_reserva,horario,local_bar').gte('data_reserva', inicio).lte('data_reserva', fim),
      ]);

      const combined = [
        ...(ef.data || []).map(e => ({ ...e, _type: 'evento', _date: e.data_evento, _label: e.nome_evento, _hora: e.horario_inicio })),
        ...(re.data || []).map(r => ({ ...r, _type: 'especial', _date: r.data_reserva, _label: r.nome_cliente, _hora: r.horario_inicio })),
        ...(rn.data || []).map(r => ({ ...r, _type: 'normal', _date: r.data_reserva, _label: r.nome_cliente, _hora: r.horario })),
      ];
      setAllCalendarEvents(combined);
    } catch { /* silently fail */ }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      let tableName = '';
      let data: any = {};
      if (selectedTab === 0) {
        tableName = 'eventos_fechados';
        data = {
          ...formEventoFechado,
          data_pagamento_contrato: formEventoFechado.data_pagamento_contrato || null,
          data_retirada_convite:   formEventoFechado.data_retirada_convite   || null,
        };
      } else if (selectedTab === 1) {
        tableName = 'reservas_especiais';
        data = { ...formReservaEspecial, status_pagamento: 'pendente' };
      } else {
        tableName = 'reservas_normais';
        data = formReservaNormal;
      }

      if (editingItem) {
        const { error } = await supabase.from(tableName).update(data).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(tableName).insert([data]);
        if (error) throw error;
      }

      setShowForm(false); setEditingItem(null); resetForm(); fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    try {
      setLoading(true);
      const tables = ['eventos_fechados', 'reservas_especiais', 'reservas_normais'];
      await supabase.from(tables[selectedTab]).delete().eq('id', id);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally { setLoading(false); }
  };

  // ── Open form ─────────────────────────────────────────────────────────────
  const openForm = (item?: any) => {
    setEditingItem(item || null);
    if (item) {
      if (selectedTab === 0) setFormEventoFechado({ nome_evento: item.nome_evento||'', data_evento: item.data_evento||'', horario_inicio: item.horario_inicio||'', horario_fim: item.horario_fim||'', cliente_responsavel: item.cliente_responsavel||'', telefone_cliente: item.telefone_cliente||'', tipo_evento: item.tipo_evento||'festa_privada', valor_total: item.valor_total||0, quantidade_pessoas: item.quantidade_pessoas||1, observacoes: item.observacoes||'', contrato_assinado: item.contrato_assinado||false, convite_impresso: item.convite_impresso||false, data_retirada_convite: item.data_retirada_convite||'', data_pagamento_contrato: item.data_pagamento_contrato||'', status_pagamento: item.status_pagamento||'pendente' });
      else if (selectedTab === 1) setFormReservaEspecial({ data_reserva: item.data_reserva||'', horario_inicio: item.horario_inicio||'', horario_fim: item.horario_fim||'', nome_cliente: item.nome_cliente||'', telefone_cliente: item.telefone_cliente||'', quantidade_pessoas: item.quantidade_pessoas||1, valor_cobrado: item.valor_cobrado||0, local_reservado: item.local_reservado||'mezanino', o_que_esta_incluso: item.o_que_esta_incluso||'', detalhes_evento: item.detalhes_evento||'' });
      else setFormReservaNormal({ nome_cliente: item.nome_cliente||'', telefone_cliente: item.telefone_cliente||'', data_reserva: item.data_reserva||'', horario: item.horario||'', numero_pessoas: item.numero_pessoas||1, local_bar: item.local_bar||'interna', observacoes: item.observacoes||'' });
    } else {
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormEventoFechado({ nome_evento:'', data_evento: dayjs().format('YYYY-MM-DD'), horario_inicio:'19:00', horario_fim:'23:00', cliente_responsavel:'', telefone_cliente:'', tipo_evento:'festa_privada', valor_total:0, quantidade_pessoas:1, observacoes:'', contrato_assinado:false, convite_impresso:false, data_retirada_convite:'', data_pagamento_contrato:'', status_pagamento:'pendente' });
    setFormReservaEspecial({ data_reserva: dayjs().format('YYYY-MM-DD'), horario_inicio:'19:00', horario_fim:'23:00', nome_cliente:'', telefone_cliente:'', quantidade_pessoas:1, valor_cobrado:0, local_reservado:'mezanino', o_que_esta_incluso:'', detalhes_evento:'' });
    setFormReservaNormal({ nome_cliente:'', telefone_cliente:'', data_reserva: dayjs().format('YYYY-MM-DD'), horario:'19:00', numero_pessoas:1, local_bar:'interna', observacoes:'' });
  };

  // ── Render form ───────────────────────────────────────────────────────────
  const renderForm = () => {
    if (selectedTab === 0) return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-white/80 mb-1">Nome do Evento *</label>
          <input type="text" value={formEventoFechado.nome_evento}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, nome_evento: e.target.value })}
            className={inputCls} placeholder="Ex: Festa de Aniversário João Silva" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Cliente Responsável *</label>
          <input type="text" value={formEventoFechado.cliente_responsavel}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, cliente_responsavel: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Telefone do Cliente *</label>
          <input type="tel" value={formEventoFechado.telefone_cliente}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, telefone_cliente: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Data do Evento *</label>
          <input type="date" value={formEventoFechado.data_evento}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, data_evento: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Tipo de Evento</label>
          <select value={formEventoFechado.tipo_evento}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, tipo_evento: e.target.value })}
            className={selectCls}>
            <option value="festa_privada">Festa Privada</option>
            <option value="casamento">Casamento</option>
            <option value="aniversario">Aniversário</option>
            <option value="corporativo">Corporativo</option>
            <option value="formatura">Formatura</option>
            <option value="show">Show</option>
            <option value="outros">Outros</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Horário de Início</label>
          <input type="time" value={formEventoFechado.horario_inicio}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, horario_inicio: e.target.value })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Horário de Fim</label>
          <input type="time" value={formEventoFechado.horario_fim}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, horario_fim: e.target.value })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Quantidade de Pessoas</label>
          <input type="number" min="1" value={formEventoFechado.quantidade_pessoas}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, quantidade_pessoas: parseInt(e.target.value) || 1 })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Valor Total</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">R$</span>
            <input type="number" step="0.01" min="0" value={formEventoFechado.valor_total}
              onChange={e => setFormEventoFechado({ ...formEventoFechado, valor_total: parseFloat(e.target.value) || 0 })}
              className={inputCls + ' pl-9'} />
          </div>
        </div>
        <div className="md:col-span-2 p-4 bg-white/5 rounded-lg border border-white/10">
          <h4 className="font-medium text-white mb-3 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-[#7D1F2C]" /> Checklist do Evento
          </h4>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formEventoFechado.contrato_assinado}
                onChange={e => {
                  const c = e.target.checked;
                  setFormEventoFechado({ ...formEventoFechado, contrato_assinado: c, data_pagamento_contrato: c ? formEventoFechado.data_pagamento_contrato : '' });
                  if (c && editingItem && !editingItem.conta_receber_id) { setEventoParaGerarConta(editingItem); setDataVencimentoConta(formEventoFechado.data_evento); setShowGerarContaModal(true); }
                }}
                className="rounded border-white/20 text-[#7D1F2C]" />
              <span className="text-sm text-white/80">📄 Contrato Assinado</span>
            </label>
            {formEventoFechado.contrato_assinado && (
              <div className="ml-6">
                <label className="block text-xs text-white/50 mb-1">Data do Pagamento do Contrato</label>
                <input type="date" value={formEventoFechado.data_pagamento_contrato}
                  onChange={e => setFormEventoFechado({ ...formEventoFechado, data_pagamento_contrato: e.target.value })}
                  className={inputCls} />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formEventoFechado.convite_impresso}
                onChange={e => setFormEventoFechado({ ...formEventoFechado, convite_impresso: e.target.checked, data_retirada_convite: e.target.checked ? formEventoFechado.data_retirada_convite : '' })}
                className="rounded border-white/20 text-[#7D1F2C]" />
              <span className="text-sm text-white/80">🎟️ Ingressos Entregues</span>
            </label>
            {formEventoFechado.convite_impresso && (
              <div className="ml-6">
                <label className="block text-xs text-white/50 mb-1">Data de Retirada</label>
                <input type="date" value={formEventoFechado.data_retirada_convite}
                  onChange={e => setFormEventoFechado({ ...formEventoFechado, data_retirada_convite: e.target.value })}
                  className={inputCls} />
              </div>
            )}
            <div>
              <label className="block text-sm text-white/80 mb-2">💰 Status do Pagamento</label>
              <select value={formEventoFechado.status_pagamento}
                onChange={e => setFormEventoFechado({ ...formEventoFechado, status_pagamento: e.target.value as EventoFechado['status_pagamento'] })}
                className={selectCls + ' ml-6'}>
                <option value="pendente">Pendente</option>
                <option value="pago_parcial">Pago Parcial</option>
                <option value="pago_total">Pago Total</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-white/80 mb-1">Observações</label>
          <textarea value={formEventoFechado.observacoes}
            onChange={e => setFormEventoFechado({ ...formEventoFechado, observacoes: e.target.value })}
            className={inputCls + ' resize-none'} rows={3} />
        </div>
      </div>
    );

    if (selectedTab === 1) return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Nome do Cliente *</label>
          <input type="text" value={formReservaEspecial.nome_cliente}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, nome_cliente: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Telefone *</label>
          <input type="tel" value={formReservaEspecial.telefone_cliente}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, telefone_cliente: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Data *</label>
          <input type="date" value={formReservaEspecial.data_reserva}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, data_reserva: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Local</label>
          <select value={formReservaEspecial.local_reservado}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, local_reservado: e.target.value })}
            className={selectCls}>
            <option value="mezanino">Mezanino</option>
            <option value="deck_externo">Deck Externo</option>
            <option value="area_vip">Área VIP</option>
            <option value="salao_principal">Salão Principal</option>
            <option value="varanda">Varanda</option>
            <option value="outros">Outros</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Início</label>
          <input type="time" value={formReservaEspecial.horario_inicio}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, horario_inicio: e.target.value })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Fim</label>
          <input type="time" value={formReservaEspecial.horario_fim}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, horario_fim: e.target.value })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Pessoas</label>
          <input type="number" min="1" value={formReservaEspecial.quantidade_pessoas}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, quantidade_pessoas: parseInt(e.target.value) || 1 })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Valor</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">R$</span>
            <input type="number" step="0.01" min="0" value={formReservaEspecial.valor_cobrado}
              onChange={e => setFormReservaEspecial({ ...formReservaEspecial, valor_cobrado: parseFloat(e.target.value) || 0 })}
              className={inputCls + ' pl-9'} />
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-white/80 mb-1">O que está incluso</label>
          <textarea value={formReservaEspecial.o_que_esta_incluso}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, o_que_esta_incluso: e.target.value })}
            className={inputCls + ' resize-none'} rows={2} placeholder="Decoração, som..." />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-white/80 mb-1">Detalhes</label>
          <textarea value={formReservaEspecial.detalhes_evento}
            onChange={e => setFormReservaEspecial({ ...formReservaEspecial, detalhes_evento: e.target.value })}
            className={inputCls + ' resize-none'} rows={3} />
        </div>
      </div>
    );

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Nome do Cliente *</label>
          <input type="text" value={formReservaNormal.nome_cliente}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, nome_cliente: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Telefone *</label>
          <input type="tel" value={formReservaNormal.telefone_cliente}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, telefone_cliente: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Data *</label>
          <input type="date" value={formReservaNormal.data_reserva}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, data_reserva: e.target.value })}
            className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Horário</label>
          <input type="time" value={formReservaNormal.horario}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, horario: e.target.value })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Nº de Pessoas</label>
          <input type="number" min="1" value={formReservaNormal.numero_pessoas}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, numero_pessoas: parseInt(e.target.value) || 1 })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Local</label>
          <select value={formReservaNormal.local_bar}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, local_bar: e.target.value })}
            className={selectCls}>
            <option value="interna">Área Interna</option>
            <option value="varanda">Varanda</option>
            <option value="deck">Deck</option>
            <option value="mezanino">Mezanino</option>
            <option value="outros">Outros</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-white/80 mb-1">Observações</label>
          <textarea value={formReservaNormal.observacoes}
            onChange={e => setFormReservaNormal({ ...formReservaNormal, observacoes: e.target.value })}
            className={inputCls + ' resize-none'} rows={2} />
        </div>
      </div>
    );
  };

  // ── Gerar conta a receber ─────────────────────────────────────────────────
  const gerarContaReceber = async () => {
    if (!eventoParaGerarConta) return;
    try {
      setLoading(true);
      const { error } = await supabase.rpc('criar_conta_receber_evento', {
        p_evento_id: eventoParaGerarConta.id,
        p_data_vencimento: dataVencimentoConta || null,
      });
      if (error) throw error;
      alert('Conta a receber gerada com sucesso!');
      setShowGerarContaModal(false); setEventoParaGerarConta(null); fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar conta');
    } finally { setLoading(false); }
  };

  // ── Calendar view ─────────────────────────────────────────────────────────
  const renderCalendar = () => {
    const startOfMonth = calendarMonth.startOf('month');
    const endOfMonth   = calendarMonth.endOf('month');
    const startGrid    = startOfMonth.startOf('week');
    const endGrid      = endOfMonth.endOf('week');

    const days: dayjs.Dayjs[] = [];
    let cur = startGrid;
    while (cur.isBefore(endGrid) || cur.isSame(endGrid, 'day')) {
      days.push(cur);
      cur = cur.add(1, 'day');
    }

    const eventsForDay = (day: dayjs.Dayjs) =>
      allCalendarEvents.filter(e => dayjs(e._date).isSame(day, 'day'));

    const typeStyle = (type: string, status?: string) => {
      if (type === 'evento') {
        if (status === 'pago_total')  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        if (status === 'cancelado')   return 'bg-red-500/15 text-red-300/60 border-red-500/20';
        if (status === 'pago_parcial')return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
        return 'bg-[#7D1F2C]/40 text-rose-200 border-[#7D1F2C]/50';
      }
      if (type === 'especial') return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      return 'bg-blue-500/15 text-blue-300 border-blue-500/25';
    };

    const typeIcon = (type: string) => {
      if (type === 'evento')  return '🎉';
      if (type === 'especial')return '⭐';
      return '📋';
    };

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setCalendarMonth(m => m.subtract(1, 'month'))}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-white min-w-[200px] text-center capitalize">
              {calendarMonth.format('MMMM [de] YYYY')}
            </h3>
            <button onClick={() => setCalendarMonth(m => m.add(1, 'month'))}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={() => setCalendarMonth(dayjs().startOf('month'))}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-colors">
              Hoje
            </button>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#7D1F2C]" />Evento Fechado</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500/70" />Reserva Especial</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500/60" />Reserva Normal</span>
          </div>
        </div>

        <div className="border border-white/10 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/10">
            {weekDays.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-white/30 uppercase tracking-wide bg-white/3">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const isCurrentMonth = day.isSame(calendarMonth, 'month');
              const isToday = day.isSame(dayjs(), 'day');
              const dayEvents = eventsForDay(day);

              return (
                <div key={i}
                  className={`min-h-[110px] p-1.5 border-b border-r border-white/5 transition-colors ${
                    isCurrentMonth ? 'bg-[#12141f]' : 'bg-[#0d0f1a]'
                  } ${i % 7 === 6 ? 'border-r-0' : ''}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1 mx-auto ${
                    isToday ? 'bg-[#7D1F2C] text-white' : isCurrentMonth ? 'text-white/70' : 'text-white/20'
                  }`}>
                    {day.format('D')}
                  </div>

                  {isCurrentMonth && (
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev, idx) => (
                        <div key={idx} title={`${ev._label}${ev._hora ? ' — ' + ev._hora : ''}`}
                          className={`rounded px-1 py-0.5 text-[10px] font-medium border truncate cursor-default leading-tight ${typeStyle(ev._type, ev.status_pagamento)}`}>
                          <span className="mr-0.5">{typeIcon(ev._type)}</span>
                          {ev._label}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-white/30 text-center">
                          +{dayEvents.length - 3} mais
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex md:hidden flex-wrap gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#7D1F2C]" />Evento Fechado</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500/70" />Reserva Especial</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500/60" />Reserva Normal</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />Pago</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />Pago Parcial</span>
        </div>
      </div>
    );
  };

  // ── Render tables ─────────────────────────────────────────────────────────
  const getCurrentData = () => {
    switch (selectedTab) {
      case 0: return eventosFechados;
      case 1: return reservasEspeciais;
      case 2: return reservasNormais;
      default: return [];
    }
  };

  const filteredData = getCurrentData().filter((item: any) =>
    !searchTerm ||
    (item.nome_evento   && item.nome_evento.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.nome_cliente  && item.nome_cliente.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.cliente_responsavel && item.cliente_responsavel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const renderTable = () => {
    if (selectedTab === 0) return (
      <table className="w-full">
        <thead>
          <tr className="text-left bg-white/5 border-b border-white/10">
            {['Evento','Cliente','Data/Hora','Pessoas','Valor','Status','Checklist','Ações'].map(h => (
              <th key={h} className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {(filteredData as EventoFechado[]).map(e => (
            <tr key={e.id} className="hover:bg-white/5">
              <td className="px-6 py-4"><div className="font-medium text-white">{e.nome_evento}</div><div className="text-sm text-white/40">{e.tipo_evento}</div></td>
              <td className="px-6 py-4"><div className="font-medium text-white">{e.cliente_responsavel}</div>{e.telefone_cliente && <div className="text-sm text-white/40">{e.telefone_cliente}</div>}</td>
              <td className="px-6 py-4"><div className="text-sm text-white">{dayjs(e.data_evento).format('DD/MM/YYYY')}</div><div className="text-sm text-white/40">{e.horario_inicio} - {e.horario_fim}</div></td>
              <td className="px-6 py-4 text-sm text-white">{e.quantidade_pessoas}</td>
              <td className="px-6 py-4 font-medium text-white">{formatCurrency(e.valor_total)}</td>
              <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(e.status_pagamento)}`}>{getStatusText(e.status_pagamento)}</span></td>
              <td className="px-6 py-4">
                <div className="flex items-center space-x-2">
                  <span title="Contrato">{e.contrato_assinado ? '✅' : '❌'} 📄</span>
                  <span title="Ingressos">{e.convite_impresso ? '✅' : '❌'} 🎟️</span>
                  <span title="Pagamento">{e.status_pagamento === 'pago_total' ? '✅' : '❌'} 💰</span>
                </div>
                {e.contrato_assinado && e.convite_impresso && e.status_pagamento === 'pago_total' && <div className="text-xs text-green-400 mt-1">🎉 Completo</div>}
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => openForm(e)} className="text-blue-400 hover:text-blue-300"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );

    if (selectedTab === 1) return (
      <table className="w-full">
        <thead>
          <tr className="text-left bg-white/5 border-b border-white/10">
            {['Cliente','Data/Hora','Local','Pessoas','Valor','Status','Ações'].map(h => (
              <th key={h} className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {(filteredData as ReservaEspecial[]).map(r => (
            <tr key={r.id} className="hover:bg-white/5">
              <td className="px-6 py-4"><div className="font-medium text-white">{r.nome_cliente}</div><div className="text-sm text-white/40">{r.telefone_cliente}</div></td>
              <td className="px-6 py-4"><div className="text-sm text-white">{dayjs(r.data_reserva).format('DD/MM/YYYY')}</div><div className="text-sm text-white/40">{r.horario_inicio} - {r.horario_fim}</div></td>
              <td className="px-6 py-4 text-sm text-white">{r.local_reservado}</td>
              <td className="px-6 py-4 text-sm text-white">{r.quantidade_pessoas}</td>
              <td className="px-6 py-4 font-medium text-white">{formatCurrency(r.valor_cobrado)}</td>
              <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(r.status_pagamento)}`}>{getStatusText(r.status_pagamento)}</span></td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => openForm(r)} className="text-blue-400 hover:text-blue-300"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );

    return (
      <table className="w-full">
        <thead>
          <tr className="text-left bg-white/5 border-b border-white/10">
            {['Cliente','Data/Hora','Pessoas','Local','Observações','Ações'].map(h => (
              <th key={h} className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {(filteredData as ReservaNormal[]).map(r => (
            <tr key={r.id} className="hover:bg-white/5">
              <td className="px-6 py-4"><div className="font-medium text-white">{r.nome_cliente}</div><div className="text-sm text-white/40">{r.telefone_cliente}</div></td>
              <td className="px-6 py-4"><div className="text-sm text-white">{dayjs(r.data_reserva).format('DD/MM/YYYY')}</div><div className="text-sm text-white/40">{r.horario}</div></td>
              <td className="px-6 py-4 text-sm text-white">{r.numero_pessoas}</td>
              <td className="px-6 py-4 text-sm text-white">{r.local_bar}</td>
              <td className="px-6 py-4 text-sm text-white/40">{r.observacoes || '-'}</td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => openForm(r)} className="text-blue-400 hover:text-blue-300"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0f1a]">
      <div className="container mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-white/90">Sistema de Reservas</h2>
            <div className="flex rounded-lg p-0.5 bg-white/10">
              <button onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'list' ? 'bg-[#7D1F2C] text-white shadow' : 'text-white/50 hover:text-white/80'
                }`}>
                <List className="w-3.5 h-3.5" /> Lista
              </button>
              <button onClick={() => { setViewMode('calendar'); fetchCalendarData(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'calendar' ? 'bg-[#7D1F2C] text-white shadow' : 'text-white/50 hover:text-white/80'
                }`}>
                <CalendarDays className="w-3.5 h-3.5" /> Calendário
              </button>
            </div>
          </div>
          <button onClick={() => openForm()}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] flex items-center gap-2 text-sm font-medium">
            <Plus className="w-4 h-4" />
            {`Nova ${tabTitles[selectedTab].slice(0, -1)}`}
          </button>
        </div>

        {error && <div className="mb-6 p-4 bg-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

        {/* Filtros */}
        <div className="bg-[#12141f] p-4 rounded-lg border border-white/10 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
              <input type="text" placeholder="Buscar..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#7D1F2C]" />
            </div>

            {selectedTab !== 2 && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]">
                <option value="all">Todos os Status</option>
                <option value="pendente">Pendente</option>
                <option value="pago_parcial">Pago Parcial</option>
                <option value="pago_total">Pago Total</option>
                <option value="cancelado">Cancelado</option>
              </select>
            )}

            <select value={mesFilter} onChange={e => setMesFilter(parseInt(e.target.value))}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i+1} value={i+1}>{dayjs().month(i).format('MMMM')}</option>
              ))}
            </select>
            <select value={anoFilter} onChange={e => setAnoFilter(parseInt(e.target.value))}
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]">
              {Array.from({ length: 3 }, (_, i) => dayjs().year() - 1 + i).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-[#12141f] rounded-xl">
          <Tab.Group selectedIndex={selectedTab} onChange={i => { setSelectedTab(i); setStatusFilter('all'); }}>
            <Tab.List className="flex space-x-1 rounded-xl bg-white/5 p-1 mb-0 overflow-x-auto">
              {tabTitles.map((title) => (
                <Tab key={title}
                  className={({ selected }) =>
                    `flex items-center whitespace-nowrap rounded-lg py-2.5 px-4 text-sm font-medium leading-5 transition-all
                    ${selected ? 'bg-[#7D1F2C] text-white shadow' : 'text-white/60 hover:bg-white/5 hover:text-white'}`
                  }>
                  {title}
                </Tab>
              ))}
            </Tab.List>

            <Tab.Panels>
              {['Eventos Fechados', 'Reservas Especiais', 'Reservas Normais'].map((title) => (
                <Tab.Panel key={title} className="rounded-xl p-6">
                  {viewMode === 'calendar' ? (
                    renderCalendar()
                  ) : loading ? (
                    <div className="flex justify-center items-center h-64">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]" />
                    </div>
                  ) : filteredData.length > 0 ? (
                    <div className="overflow-x-auto">{renderTable()}</div>
                  ) : (
                    <div className="text-center py-12">
                      <Calendar className="w-16 h-16 text-white/20 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-white mb-2">Nenhum registro encontrado</h3>
                      <p className="text-white/40 text-sm">Ajuste os filtros ou crie um novo registro.</p>
                    </div>
                  )}
                </Tab.Panel>
              ))}
              <Tab.Panel className="rounded-xl p-6">
                <MapaMesasAdmin />
              </Tab.Panel>
            </Tab.Panels>
          </Tab.Group>
        </div>

        {/* Modal formulário */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h3 className="text-white font-semibold">
                  {editingItem ? 'Editar' : 'Nova'} {tabTitles[selectedTab].slice(0, -1)}
                </h3>
                <button onClick={() => { setShowForm(false); setEditingItem(null); resetForm(); }}
                  className="p-1.5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-4">{renderForm()}</div>
              <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
                <button onClick={() => { setShowForm(false); setEditingItem(null); resetForm(); }}
                  className="px-4 py-2 border border-white/20 rounded-xl text-white/70 hover:bg-white/5 text-sm transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={loading}
                  className="px-6 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] text-sm font-medium transition-colors disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal gerar conta */}
        {showGerarContaModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6">
              <h3 className="text-lg font-medium text-white mb-4">Gerar Conta a Receber</h3>
              <p className="text-sm text-white/60 mb-4">Deseja gerar uma conta a receber para este evento?</p>
              <div className="mb-4 space-y-1 text-sm">
                <p className="text-white/80">Evento: <span className="font-bold text-white">{eventoParaGerarConta?.nome_evento}</span></p>
                <p className="text-white/80">Valor: <span className="font-bold text-white">{formatCurrency(eventoParaGerarConta?.valor_total)}</span></p>
              </div>
              <div className="mb-4">
                <label className="block text-sm text-white/60 mb-1">Data de Vencimento</label>
                <input type="date" value={dataVencimentoConta} onChange={e => setDataVencimentoConta(e.target.value)}
                  className={inputCls} />
                <p className="text-xs text-white/30 mt-1">Deixe em branco para usar a data do evento</p>
              </div>
              {error && <div className="mb-4 p-3 bg-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setShowGerarContaModal(false); setEventoParaGerarConta(null); setError(null); }}
                  className="px-4 py-2 border border-white/20 rounded-xl text-white/70 hover:bg-white/5 text-sm">
                  Não agora
                </button>
                <button onClick={gerarContaReceber} disabled={loading}
                  className="px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] text-sm font-medium disabled:opacity-50">
                  {loading ? 'Gerando...' : 'Sim, gerar conta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat IA */}
        {!showChatIA && (
          <button onClick={() => setShowChatIA(true)}
            className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all flex items-center justify-center z-40 group">
            <MessageSquare className="w-7 h-7" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            <div className="absolute right-full mr-4 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Super Agente IA - Eventos
            </div>
          </button>
        )}
        {showChatIA && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-3xl">
              <ChatFinanceiroIA onClose={() => setShowChatIA(false)} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Events;
