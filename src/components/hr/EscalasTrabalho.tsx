import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Calendar, Clock, User, Users, MapPin, CheckCircle, AlertCircle, CreditCard as Edit, Trash2, Download, Eye, CalendarDays, Building, Grid2x2 as Grid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

// Sugere o tipo de turno a partir do horário de início — evita ter que
// escolher manualmente algo que o próprio horário já responde.
// A pessoa ainda pode trocar depois (ex.: marcar "Variável" num caso atípico).
function detectarTurno(horarioInicio: string): 'diurno' | 'noturno' | 'madrugada' {
  const hora = Number(horarioInicio.split(':')[0]);
  if (hora >= 0 && hora < 6) return 'madrugada';
  if (hora >= 6 && hora < 18) return 'diurno';
  return 'noturno';
}

interface EscalaTrabalho {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  funcao_nome: string;
  data_escala: string;
  horario_inicio: string;
  horario_fim: string;
  tipo_turno: 'diurno' | 'noturno' | 'madrugada' | 'variavel';
  setor: string;
  eh_folga: boolean;
  observacoes?: string;
  criado_em: string;
  posto_trabalho_id?: string | null;
  posto_trabalho_nome?: string | null;
}

interface PostoTrabalho {
  id: string;
  setor: string;
  nome: string;
  ordem: number;
}

interface FormData {
  colaborador_id: string;
  data_escala: string;
  horario_inicio: string;
  horario_fim: string;
  tipo_turno: 'diurno' | 'noturno' | 'madrugada' | 'variavel';
  setor: string;
  posto_trabalho_id: string;
  eh_folga: boolean;
  observacoes: string;
  // Novos campos para escalas em lote
  tipo_cadastro: 'individual' | 'semanal' | 'mensal';
  data_inicio_periodo: string;
  data_fim_periodo: string;
  dias_semana: string[]; // Para escalas semanais
  aplicar_todos_colaboradores: boolean;
  colaboradores_selecionados: string[];
}

interface IndicadoresEscalas {
  total_escalas_semana: number;
  colaboradores_escalados: number;
  setores_ativos: number;
  folgas_semana: number;
  turnos_diurnos: number;
  turnos_noturnos: number;
}

const EscalasTrabalho: React.FC = () => {
  const [escalas, setEscalas] = useState<EscalaTrabalho[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresEscalas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEscala, setEditingEscala] = useState<EscalaTrabalho | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [escalaToDelete, setEscalaToDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [calendarioMes, setCalendarioMes] = useState(dayjs());
  const [escalasCalendario, setEscalasCalendario] = useState<EscalaTrabalho[]>([]);
  const [apenasfolgas, setApenasfolgas] = useState(false);
  const [postosTrabalho, setPostosTrabalho] = useState<PostoTrabalho[]>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [colaboradorFilter, setColaboradorFilter] = useState('all');
  const [setorFilter, setSetorFilter] = useState('all');
  const [turnoFilter, setTurnoFilter] = useState('all');
  const [semanaFilter, setSemanaFilter] = useState(dayjs().isoWeek());
  const [anoFilter, setAnoFilter] = useState(dayjs().year());

  const [formData, setFormData] = useState<FormData>({
    colaborador_id: '',
    data_escala: dayjs().format('YYYY-MM-DD'),
    horario_inicio: '08:00',
    horario_fim: '17:00',
    tipo_turno: 'diurno',
    setor: 'Salão',
    posto_trabalho_id: '',
    eh_folga: false,
    observacoes: '',
    tipo_cadastro: 'individual',
    data_inicio_periodo: dayjs().format('YYYY-MM-DD'),
    data_fim_periodo: dayjs().add(7, 'days').format('YYYY-MM-DD'),
    dias_semana: ['1', '2', '3', '4', '5'], // Segunda a sexta por padrão
    aplicar_todos_colaboradores: false,
    colaboradores_selecionados: []
  });

  const setores = [
    'Salão', 'Bar', 'Cozinha', 'Recepção', 'Limpeza', 
    'Segurança', 'Administração', 'Estoque', 'Outros'
  ];

  useEffect(() => {
    fetchColaboradores();
    fetchPostosTrabalho();
    fetchEscalas();
    fetchIndicadores();
    if (viewMode === 'calendar') {
      fetchEscalasCalendario();
    }
  }, [colaboradorFilter, setorFilter, turnoFilter, semanaFilter, anoFilter, apenasfolgas]);

  useEffect(() => {
    if (viewMode === 'calendar') {
      fetchEscalasCalendario();
    }
  }, [viewMode, calendarioMes, colaboradorFilter, setorFilter, turnoFilter, apenasfolgas]);

  const fetchColaboradores = async () => {
    try {
      const { data, error } = await supabase
        .from('vw_colaboradores_completo')
        .select('id, nome_completo, funcao_nome, status')
        .eq('status', 'ativo')
        .order('nome_completo');

      if (error) throw error;
      setColaboradores(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  };

  const fetchPostosTrabalho = async () => {
    try {
      const { data, error } = await supabase
        .from('postos_trabalho')
        .select('id, setor, nome, ordem')
        .eq('ativo', true)
        .order('ordem');

      if (error) throw error;
      setPostosTrabalho(data || []);
    } catch (err) {
      console.error('Error fetching postos de trabalho:', err);
    }
  };

  const fetchEscalas = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calcular período da semana selecionada
      const inicioSemana = dayjs().year(anoFilter).isoWeek(semanaFilter).startOf('isoWeek');
      const fimSemana = dayjs().year(anoFilter).isoWeek(semanaFilter).endOf('isoWeek');

      let query = supabase
        .from('vw_escalas_detalhadas')
        .select('*')
        .gte('data_escala', inicioSemana.format('YYYY-MM-DD'))
        .lte('data_escala', fimSemana.format('YYYY-MM-DD'));

      // Aplicar filtros
      if (colaboradorFilter !== 'all') {
        query = query.eq('colaborador_id', colaboradorFilter);
      }

      if (setorFilter !== 'all') {
        query = query.eq('setor', setorFilter);
      }

      if (turnoFilter !== 'all') {
        query = query.eq('tipo_turno', turnoFilter);
      }

      if (apenasfolgas) {
        query = query.eq('eh_folga', true);
      }

      const { data, error } = await query.order('data_escala', { ascending: true });

      if (error) throw error;

      setEscalas(data || []);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar escalas');
    } finally {
      setLoading(false);
    }
  };

  const fetchEscalasCalendario = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar escalas do mês selecionado
      const inicioMes = calendarioMes.startOf('month').format('YYYY-MM-DD');
      const fimMes = calendarioMes.endOf('month').format('YYYY-MM-DD');

      let query = supabase
        .from('vw_escalas_detalhadas')
        .select('*')
        .gte('data_escala', inicioMes)
        .lte('data_escala', fimMes);

      // Aplicar filtros
      if (colaboradorFilter !== 'all') {
        query = query.eq('colaborador_id', colaboradorFilter);
      }

      if (setorFilter !== 'all') {
        query = query.eq('setor', setorFilter);
      }

      if (turnoFilter !== 'all') {
        query = query.eq('tipo_turno', turnoFilter);
      }

      if (apenasfolgas) {
        query = query.eq('eh_folga', true);
      }

      const { data, error } = await query.order('data_escala', { ascending: true });

      if (error) throw error;
      setEscalasCalendario(data || []);
    } catch (err) {
      console.error('Error fetching calendar schedules:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar escalas do calendário');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const inicioSemana = dayjs().year(anoFilter).isoWeek(semanaFilter).startOf('isoWeek');
      const fimSemana = dayjs().year(anoFilter).isoWeek(semanaFilter).endOf('isoWeek');

      const { data, error } = await supabase
        .from('escalas_trabalho')
        .select('*')
        .gte('data_escala', inicioSemana.format('YYYY-MM-DD'))
        .lte('data_escala', fimSemana.format('YYYY-MM-DD'));

      if (error) throw error;

      const escalasData = data || [];
      const colaboradoresUnicos = new Set(escalasData.map(e => e.colaborador_id));
      const setoresUnicos = new Set(escalasData.map(e => e.setor));

      setIndicadores({
        total_escalas_semana: escalasData.length,
        colaboradores_escalados: colaboradoresUnicos.size,
        setores_ativos: setoresUnicos.size,
        folgas_semana: escalasData.filter(e => e.eh_folga).length,
        turnos_diurnos: escalasData.filter(e => e.tipo_turno === 'diurno').length,
        turnos_noturnos: escalasData.filter(e => e.tipo_turno === 'noturno').length
      });
    } catch (err) {
      console.error('Error fetching indicators:', err);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      if (formData.tipo_cadastro === 'individual') {
        await salvarEscalaIndividual();
      } else {
        await salvarEscalaEmLote();
      }

      setShowForm(false);
      setEditingEscala(null);
      resetForm();
      fetchEscalas();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving schedule:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar escala');
    } finally {
      setLoading(false);
    }
  };

  const salvarEscalaIndividual = async () => {
    // Validações
    if (!formData.colaborador_id || !formData.data_escala || !formData.setor) {
      throw new Error('Preencha todos os campos obrigatórios');
    }

    // Verificar se já existe escala para o colaborador na data
    if (!editingEscala) {
      const { data: existingEscala, error: checkError } = await supabase
        .from('escalas_trabalho')
        .select('id')
        .eq('colaborador_id', formData.colaborador_id)
        .eq('data_escala', formData.data_escala)
        .maybeSingle();

      if (checkError) throw checkError;
      
      if (existingEscala) {
        throw new Error('Já existe uma escala para este colaborador nesta data');
      }
    }

    const dataToSave = {
      colaborador_id: formData.colaborador_id,
      data_escala: formData.data_escala,
      horario_inicio: formData.eh_folga ? null : formData.horario_inicio,
      horario_fim: formData.eh_folga ? null : formData.horario_fim,
      tipo_turno: formData.tipo_turno,
      setor: formData.setor,
      posto_trabalho_id: formData.setor === 'Cozinha' ? (formData.posto_trabalho_id || null) : null,
      eh_folga: formData.eh_folga,
      observacoes: formData.observacoes
    };

    if (editingEscala) {
      const { error } = await supabase
        .from('escalas_trabalho')
        .update(dataToSave)
        .eq('id', editingEscala.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('escalas_trabalho')
        .insert([dataToSave]);

      if (error) throw error;
    }
  };

  const salvarEscalaEmLote = async () => {
    // Validações para escalas em lote
    if (!formData.data_inicio_periodo || !formData.data_fim_periodo || !formData.setor) {
      throw new Error('Preencha todos os campos obrigatórios para escalas em lote');
    }

    if (dayjs(formData.data_fim_periodo).isBefore(dayjs(formData.data_inicio_periodo))) {
      throw new Error('Data fim deve ser posterior à data início');
    }

    // Definir colaboradores
    let colaboradoresParaEscala: string[] = [];
    if (formData.aplicar_todos_colaboradores) {
      colaboradoresParaEscala = colaboradores.map(c => c.id);
    } else if (formData.colaboradores_selecionados.length > 0) {
      colaboradoresParaEscala = formData.colaboradores_selecionados;
    } else if (formData.colaborador_id) {
      colaboradoresParaEscala = [formData.colaborador_id];
    } else {
      throw new Error('Selecione pelo menos um colaborador');
    }

    // Gerar datas do período
    const datas = gerarDatasPeriodo();
    
    // Preparar escalas para inserção
    const escalasParaInserir: any[] = [];
    
    for (const colaboradorId of colaboradoresParaEscala) {
      for (const data of datas) {
        // Verificar se já existe escala para este colaborador nesta data
        const { data: existingEscala } = await supabase
          .from('escalas_trabalho')
          .select('id')
          .eq('colaborador_id', colaboradorId)
          .eq('data_escala', data)
          .single();

        if (!existingEscala) {
          escalasParaInserir.push({
            colaborador_id: colaboradorId,
            data_escala: data,
            horario_inicio: formData.eh_folga ? null : formData.horario_inicio,
            horario_fim: formData.eh_folga ? null : formData.horario_fim,
            tipo_turno: formData.tipo_turno,
            setor: formData.setor,
            posto_trabalho_id: formData.setor === 'Cozinha' ? (formData.posto_trabalho_id || null) : null,
            eh_folga: formData.eh_folga,
            observacoes: formData.observacoes
          });
        }
      }
    }

    if (escalasParaInserir.length === 0) {
      throw new Error('Todas as escalas para o período já existem');
    }

    // Inserir todas as escalas
    const { error } = await supabase
      .from('escalas_trabalho')
      .insert(escalasParaInserir);

    if (error) throw error;

    alert(`${escalasParaInserir.length} escalas criadas com sucesso!`);
  };

  const gerarDatasPeriodo = (): string[] => {
    const inicio = dayjs(formData.data_inicio_periodo);
    const fim = dayjs(formData.data_fim_periodo);
    const datas: string[] = [];
    let current = inicio;

    while (current.isSameOrBefore(fim)) {
      const diaSemana = current.day(); // 0=domingo, 1=segunda, etc.
      
      if (formData.tipo_cadastro === 'semanal') {
        // Para escalas semanais, verificar se o dia está selecionado
        if (formData.dias_semana.includes(diaSemana.toString())) {
          datas.push(current.format('YYYY-MM-DD'));
        }
      } else {
        // Para escalas mensais, incluir todos os dias
        datas.push(current.format('YYYY-MM-DD'));
      }
      
      current = current.add(1, 'day');
    }

    return datas;
  };

  const toggleDiaSemana = (dia: string) => {
    const novosDias = formData.dias_semana.includes(dia)
      ? formData.dias_semana.filter(d => d !== dia)
      : [...formData.dias_semana, dia];
    
    setFormData({ ...formData, dias_semana: novosDias });
  };

  const selecionarTodosColaboradores = () => {
    setFormData({
      ...formData,
      aplicar_todos_colaboradores: !formData.aplicar_todos_colaboradores,
      colaboradores_selecionados: formData.aplicar_todos_colaboradores ? [] : colaboradores.map(c => c.id)
    });
  };

  const toggleColaboradorSelecionado = (colaboradorId: string) => {
    const novosColaboradores = formData.colaboradores_selecionados.includes(colaboradorId)
      ? formData.colaboradores_selecionados.filter(id => id !== colaboradorId)
      : [...formData.colaboradores_selecionados, colaboradorId];

    setFormData({
      ...formData,
      colaboradores_selecionados: novosColaboradores,
      aplicar_todos_colaboradores: novosColaboradores.length === colaboradores.length
    });
  };

  // Não existe um "setor" fixo por colaborador (a mesma pessoa pode escalar
  // em setores diferentes em dias diferentes) — a função é o proxy natural
  // (ex.: "Cozinheiro"/"Auxiliar de Cozinha" = pessoal da cozinha). Clicar
  // num chip marca/desmarca de uma vez todo mundo daquela função.
  const funcoesDisponiveis = Array.from(
    new Set(colaboradores.map((c) => c.funcao_nome).filter(Boolean))
  ).sort();

  const selecionarPorFuncao = (funcao: string) => {
    const idsDaFuncao = colaboradores.filter((c) => c.funcao_nome === funcao).map((c) => c.id);
    const todosJaSelecionados = idsDaFuncao.every((id) => formData.colaboradores_selecionados.includes(id));
    const novosColaboradores = todosJaSelecionados
      ? formData.colaboradores_selecionados.filter((id) => !idsDaFuncao.includes(id))
      : Array.from(new Set([...formData.colaboradores_selecionados, ...idsDaFuncao]));

    setFormData({
      ...formData,
      colaboradores_selecionados: novosColaboradores,
      aplicar_todos_colaboradores: novosColaboradores.length === colaboradores.length
    });
  };

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('escalas_trabalho')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setShowDeleteConfirm(false);
      setEscalaToDelete(null);
      fetchEscalas();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting schedule:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir escala');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (escala?: EscalaTrabalho) => {
    if (escala) {
      setEditingEscala(escala);
      setFormData({
        colaborador_id: escala.colaborador_id,
        data_escala: escala.data_escala,
        horario_inicio: escala.horario_inicio || '08:00',
        horario_fim: escala.horario_fim || '17:00',
        tipo_turno: escala.tipo_turno,
        setor: escala.setor,
        posto_trabalho_id: escala.posto_trabalho_id || '',
        eh_folga: escala.eh_folga,
        observacoes: escala.observacoes || '',
        tipo_cadastro: 'individual',
        data_inicio_periodo: dayjs().format('YYYY-MM-DD'),
        data_fim_periodo: dayjs().add(7, 'days').format('YYYY-MM-DD'),
        dias_semana: ['1', '2', '3', '4', '5'],
        aplicar_todos_colaboradores: false,
        colaboradores_selecionados: []
      });
    } else {
      setEditingEscala(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      colaborador_id: '',
      data_escala: dayjs().format('YYYY-MM-DD'),
      horario_inicio: '08:00',
      horario_fim: '17:00',
      tipo_turno: 'diurno',
      setor: 'Salão',
      posto_trabalho_id: '',
      eh_folga: false,
      observacoes: '',
      tipo_cadastro: 'individual',
      data_inicio_periodo: dayjs().format('YYYY-MM-DD'),
      data_fim_periodo: dayjs().add(7, 'days').format('YYYY-MM-DD'),
      dias_semana: ['1', '2', '3', '4', '5'],
      aplicar_todos_colaboradores: false,
      colaboradores_selecionados: []
    });
  };

  const confirmDelete = (id: string) => {
    setEscalaToDelete(id);
    setShowDeleteConfirm(true);
  };

  const filteredEscalas = escalas.filter(escala => {
    const matchesSearch = escala.colaborador_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         escala.setor.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const exportarEscalas = () => {
    if (filteredEscalas.length === 0) {
      alert('Não há escalas para exportar nesta semana/filtro.');
      return;
    }
    const headers = ['Data', 'Dia da Semana', 'Colaborador', 'Função', 'Setor', 'Posto de Trabalho', 'Turno', 'Horário Início', 'Horário Fim', 'Folga', 'Observações'];
    const linhas = filteredEscalas.map((e) => [
      dayjs(e.data_escala).format('DD/MM/YYYY'),
      dayjs(e.data_escala).format('dddd'),
      e.colaborador_nome,
      e.funcao_nome || '',
      e.setor,
      e.posto_trabalho_nome || '',
      e.tipo_turno,
      e.eh_folga ? '' : e.horario_inicio,
      e.eh_folga ? '' : e.horario_fim,
      e.eh_folga ? 'Sim' : 'Não',
      e.observacoes || '',
    ]);
    exportToExcel(linhas, `escalas-semana-${semanaFilter}-${anoFilter}`, headers);
  };

  const getTurnoColor = (turno: string) => {
    switch (turno) {
      case 'diurno': return 'bg-yellow-900/30 text-yellow-300';
      case 'noturno': return 'bg-blue-900/30 text-blue-300';
      case 'madrugada': return 'bg-purple-900/30 text-purple-300';
      case 'variavel': return 'bg-white/10 text-white/90';
      default: return 'bg-white/10 text-white/90';
    }
  };

  const getSetorColor = (setor: string) => {
    const colors = {
      'Salão': 'bg-green-900/30 text-green-300',
      'Bar': 'bg-blue-900/30 text-blue-300',
      'Cozinha': 'bg-red-900/30 text-red-300',
      'Recepção': 'bg-purple-900/30 text-purple-300',
      'Limpeza': 'bg-yellow-900/30 text-yellow-300',
      'Segurança': 'bg-white/10 text-white/90',
      'Administração': 'bg-blue-500/15 text-blue-300',
      'Estoque': 'bg-orange-500/15 text-orange-400'
    };
    return colors[setor as keyof typeof colors] || 'bg-white/10 text-white/90';
  };

  const getDiasDoMes = () => {
    const primeiroDia = calendarioMes.startOf('month');
    const ultimoDia = calendarioMes.endOf('month');
    const primeiroDiaSemana = primeiroDia.day(); // 0 = domingo
    const diasNoMes = ultimoDia.date();
    
    const dias = [];
    
    // Adicionar dias vazios no início (para alinhar com dia da semana)
    for (let i = 0; i < primeiroDiaSemana; i++) {
      dias.push(null);
    }
    
    // Adicionar todos os dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
      dias.push(dia);
    }
    
    return dias;
  };

  const getEscalasParaDia = (dia: number) => {
    const dataCompleta = calendarioMes.date(dia).format('YYYY-MM-DD');
    return escalasCalendario.filter(escala => escala.data_escala === dataCompleta);
  };

  const renderCalendario = () => {
    const dias = getDiasDoMes();
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    return (
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        {/* Header do Calendário */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setCalendarioMes(calendarioMes.subtract(1, 'month'))}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-white">
              {calendarioMes.format('MMMM YYYY')}
            </h3>
            <button
              onClick={() => setCalendarioMes(calendarioMes.add(1, 'month'))}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setCalendarioMes(dayjs())}
            className="px-3 py-1 text-sm bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
          >
            Hoje
          </button>
        </div>

        {/* Calendário */}
        <div className="p-4">
          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {diasSemana.map((dia) => (
              <div key={dia} className="p-2 text-center text-sm font-medium text-white/50">
                {dia}
              </div>
            ))}
          </div>

          {/* Grade do calendário */}
          <div className="grid grid-cols-7 gap-1">
            {dias.map((dia, index) => {
              if (!dia) {
                return <div key={index} className="h-24"></div>;
              }

              const escalasNoDia = getEscalasParaDia(dia);
              const dataCompleta = calendarioMes.date(dia);
              const isToday = dataCompleta.isSame(dayjs(), 'day');
              const isPastDay = dataCompleta.isBefore(dayjs(), 'day');
              
              return (
                <div
                  key={dia}
                  className={`h-24 border border-white/10 rounded-lg p-1 overflow-hidden hover:bg-white/5 cursor-pointer transition-colors ${
                    isToday ? 'ring-2 ring-[#7D1F2C] bg-blue-500/10' : ''
                  } ${isPastDay ? 'bg-white/5' : 'bg-[#12141f]'}`}
                  onClick={() => {
                    // Abrir modal para adicionar escala neste dia
                    setFormData({
                      ...formData,
                      data_escala: dataCompleta.format('YYYY-MM-DD'),
                      tipo_cadastro: 'individual'
                    });
                    openForm();
                  }}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    isToday ? 'text-[#7D1F2C]' : isPastDay ? 'text-white/30' : 'text-white/80'
                  }`}>
                    {dia}
                  </div>
                  
                  {/* Escalas do dia */}
                  <div className="space-y-0.5">
                    {escalasNoDia.slice(0, 3).map((escala) => (
                      <div
                        key={escala.id}
                        className={`text-xs px-1 py-0.5 rounded truncate ${
                          escala.eh_folga 
                            ? 'bg-white/10 text-white/60'
                            : getTurnoColor(escala.tipo_turno)
                        }`}
                        title={`${escala.colaborador_nome}${escala.posto_trabalho_nome ? ' · ' + escala.posto_trabalho_nome : ''} - ${
                          escala.eh_folga
                            ? 'FOLGA'
                            : `${escala.horario_inicio} - ${escala.horario_fim}`
                        }`}
                      >
                        {escala.eh_folga ? (
                          <span>🏖️ {escala.colaborador_nome.split(' ')[0]}</span>
                        ) : (
                          <span>
                            👤 {escala.colaborador_nome.split(' ')[0]}
                            <br />
                            ⏰ {escala.horario_inicio?.slice(0, 5)}
                          </span>
                        )}
                      </div>
                    ))}
                    
                    {/* Indicador de mais escalas */}
                    {escalasNoDia.length > 3 && (
                      <div className="text-xs text-center text-white/40 font-medium">
                        +{escalasNoDia.length - 3} mais
                      </div>
                    )}
                    
                    {/* Placeholder para dia vazio */}
                    {escalasNoDia.length === 0 && !isPastDay && (
                      <div className="text-xs text-center text-white/30 mt-2">
                        Clique para<br />adicionar
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legenda */}
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-200 rounded mr-1"></div>
              <span>Turno Diurno</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-200 rounded mr-1"></div>
              <span>Turno Noturno</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-purple-200 rounded mr-1"></div>
              <span>Madrugada</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-gray-200 rounded mr-1"></div>
              <span>Folga</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 border-2 border-[#7D1F2C] rounded mr-1"></div>
              <span>Hoje</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Escalas de Trabalho</h3>
        <div className="flex gap-2">
          {/* Toggle View Mode */}
          <div className="flex border border-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#7D1F2C] text-white'
                  : 'bg-[#12141f] text-white/80 hover:bg-white/5'
              }`}
            >
              <List className="w-4 h-4 inline mr-1" />
              Tabela
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-[#7D1F2C] text-white'
                  : 'bg-[#12141f] text-white/80 hover:bg-white/5'
              }`}
            >
              <Grid className="w-4 h-4 inline mr-1" />
              Calendário
            </button>
          </div>
          <button
            onClick={exportarEscalas}
            className="px-4 py-2 bg-[#12141f] border border-white/20 rounded-lg text-white/80 hover:bg-white/5"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar
          </button>
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Nova Escala
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">
          {error}
        </div>
      )}

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Escalas da Semana</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.total_escalas_semana}
                </p>
                <p className="text-sm text-white/50">
                  {indicadores.colaboradores_escalados} colaboradores
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Building className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Setores Ativos</p>
                <p className="text-2xl font-bold text-green-400">
                  {indicadores.setores_ativos}
                </p>
                <p className="text-sm text-white/50">
                  {indicadores.folgas_semana} folgas
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Clock className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Turnos</p>
                <p className="text-2xl font-bold text-purple-400">
                  {indicadores.turnos_diurnos + indicadores.turnos_noturnos}
                </p>
                <p className="text-sm text-white/50">
                  {indicadores.turnos_diurnos}D / {indicadores.turnos_noturnos}N
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {viewMode === 'table' && (
      <div className="bg-white/5 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div>
            <select
              value={colaboradorFilter}
              onChange={(e) => setColaboradorFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Colaboradores</option>
              {colaboradores.map((colaborador) => (
                <option key={colaborador.id} value={colaborador.id}>
                  {colaborador.nome_completo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="apenas-folgas"
                checked={apenasfolgas}
                onChange={(e) => setApenasfolgas(e.target.checked)}
                className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
              />
              <label htmlFor="apenas-folgas" className="ml-2 text-sm text-white/80">
                🏖️ Apenas Folgas
              </label>
            </div>
          </div>

          <div>
            <select
              value={setorFilter}
              onChange={(e) => setSetorFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Setores</option>
              {setores.map((setor) => (
                <option key={setor} value={setor}>
                  {setor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={turnoFilter}
              onChange={(e) => setTurnoFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Turnos</option>
              <option value="diurno">Diurno</option>
              <option value="noturno">Noturno</option>
              <option value="madrugada">Madrugada</option>
              <option value="variavel">Variável</option>
            </select>
          </div>

          <div>
            <select
              value={semanaFilter}
              onChange={(e) => setSemanaFilter(parseInt(e.target.value))}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              {Array.from({ length: 52 }, (_, i) => i + 1).map(semana => {
                const inicioSemana = dayjs().year(anoFilter).isoWeek(semana).startOf('isoWeek');
                const fimSemana = dayjs().year(anoFilter).isoWeek(semana).endOf('isoWeek');
                return (
                  <option key={semana} value={semana}>
                    {inicioSemana.format('DD/MM')} a {fimSemana.format('DD/MM')} (Sem {semana})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <select
              value={anoFilter}
              onChange={(e) => setAnoFilter(parseInt(e.target.value))}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              {Array.from({ length: 3 }, (_, i) => dayjs().year() - 1 + i).map(ano => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      )}

      {/* Filtros específicos para calendário */}
      {viewMode === 'calendar' && (
        <div className="bg-white/5 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                />
              </div>
            </div>

            <div>
              <select
                value={colaboradorFilter}
                onChange={(e) => setColaboradorFilter(e.target.value)}
                className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              >
                <option value="all">Todos os Colaboradores</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome_completo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="apenas-folgas-calendario"
                  checked={apenasfolgas}
                  onChange={(e) => setApenasfolgas(e.target.checked)}
                  className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                />
                <label htmlFor="apenas-folgas-calendario" className="ml-2 text-sm text-white/80">
                  🏖️ Apenas Folgas
                </label>
              </div>
            </div>

            <div>
              <select
                value={setorFilter}
                onChange={(e) => setSetorFilter(e.target.value)}
                className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              >
                <option value="all">Todos os Setores</option>
                {setores.map((setor) => (
                  <option key={setor} value={setor}>
                    {setor}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={turnoFilter}
                onChange={(e) => setTurnoFilter(e.target.value)}
                className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              >
                <option value="all">Todos os Turnos</option>
                <option value="diurno">Diurno</option>
                <option value="noturno">Noturno</option>
                <option value="madrugada">Madrugada</option>
                <option value="variavel">Variável</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      {viewMode === 'calendar' ? (
        renderCalendario()
      ) : (
        <div className="bg-[#12141f] rounded-lg border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Colaborador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Setor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Horário
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Turno
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#12141f] divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-white/40">
                      Carregando escalas...
                    </td>
                  </tr>
                ) : filteredEscalas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-white/40">
                      Nenhuma escala encontrada
                    </td>
                  </tr>
                ) : (
                  filteredEscalas.map((escala) => (
                    <tr key={escala.id} className="hover:bg-white/5">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {dayjs(escala.data_escala).format('DD/MM/YYYY')}
                        <div className="text-xs text-white/40">
                          {dayjs(escala.data_escala).format('dddd')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-white/30 mr-2" />
                          <div>
                            <div className="text-sm font-medium text-white">
                              {escala.colaborador_nome}
                            </div>
                            <div className="text-sm text-white/40">
                              {escala.funcao_nome}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSetorColor(escala.setor)}`}>
                          {escala.setor}
                        </span>
                        {escala.posto_trabalho_nome && (
                          <div className="text-xs text-white/40 mt-1">{escala.posto_trabalho_nome}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {escala.eh_folga ? (
                          <span className="text-white/40 italic">Folga</span>
                        ) : (
                          <div className="flex items-center">
                            <Clock className="w-4 h-4 text-white/30 mr-1" />
                            {escala.horario_inicio} - {escala.horario_fim}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTurnoColor(escala.tipo_turno)}`}>
                          {escala.tipo_turno}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {escala.eh_folga ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-white/10 text-white/90">
                            🏖️ Folga
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-900/30 text-green-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => openForm(escala)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(escala.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-white">
                {editingEscala ? 'Editar Escala' : 'Nova Escala'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-white/30 hover:text-white/50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Tipo de Cadastro */}
              {!editingEscala && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Tipo de Cadastro
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="tipo_cadastro"
                        value="individual"
                        checked={formData.tipo_cadastro === 'individual'}
                        onChange={(e) => setFormData({ ...formData, tipo_cadastro: e.target.value as 'individual' | 'semanal' | 'mensal' })}
                        className="mr-2"
                      />
                      Individual
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="tipo_cadastro"
                        value="semanal"
                        checked={formData.tipo_cadastro === 'semanal'}
                        onChange={(e) => setFormData({ ...formData, tipo_cadastro: e.target.value as 'individual' | 'semanal' | 'mensal' })}
                        className="mr-2"
                      />
                      Semanal
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="tipo_cadastro"
                        value="mensal"
                        checked={formData.tipo_cadastro === 'mensal'}
                        onChange={(e) => setFormData({ ...formData, tipo_cadastro: e.target.value as 'individual' | 'semanal' | 'mensal' })}
                        className="mr-2"
                      />
                      Mensal
                    </label>
                  </div>
                </div>
              )}

              {/* Campos para escala individual */}
              {formData.tipo_cadastro === 'individual' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Colaborador *
                    </label>
                    <select
                      value={formData.colaborador_id}
                      onChange={(e) => setFormData({ ...formData, colaborador_id: e.target.value })}
                      className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      required
                    >
                      <option value="">Selecione um colaborador</option>
                      {colaboradores.map((colaborador) => (
                        <option key={colaborador.id} value={colaborador.id}>
                          {colaborador.nome_completo} - {colaborador.funcao_nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Data da Escala *
                    </label>
                    <input
                      type="date"
                      value={formData.data_escala}
                      onChange={(e) => setFormData({ ...formData, data_escala: e.target.value })}
                      className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Campos para escalas em lote */}
              {formData.tipo_cadastro !== 'individual' && (
                <div className="space-y-4">
                  {/* Período */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Data Início *
                      </label>
                      <input
                        type="date"
                        value={formData.data_inicio_periodo}
                        onChange={(e) => setFormData({ ...formData, data_inicio_periodo: e.target.value })}
                        className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Data Fim *
                      </label>
                      <input
                        type="date"
                        value={formData.data_fim_periodo}
                        onChange={(e) => setFormData({ ...formData, data_fim_periodo: e.target.value })}
                        className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                        required
                      />
                    </div>
                  </div>

                  {/* Dias da semana (apenas para escalas semanais) */}
                  {formData.tipo_cadastro === 'semanal' && (
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        Dias da Semana
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: '0', label: 'Dom' },
                          { value: '1', label: 'Seg' },
                          { value: '2', label: 'Ter' },
                          { value: '3', label: 'Qua' },
                          { value: '4', label: 'Qui' },
                          { value: '5', label: 'Sex' },
                          { value: '6', label: 'Sáb' }
                        ].map((dia) => (
                          <label key={dia.value} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.dias_semana.includes(dia.value)}
                              onChange={() => toggleDiaSemana(dia.value)}
                              className="mr-1 rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                            />
                            {dia.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seleção de colaboradores */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-white/80">
                        Colaboradores
                      </label>
                      <button
                        type="button"
                        onClick={selecionarTodosColaboradores}
                        className="text-sm text-[#7D1F2C] hover:text-[#6a1a25]"
                      >
                        {formData.aplicar_todos_colaboradores ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </button>
                    </div>

                    {funcoesDisponiveis.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {funcoesDisponiveis.map((funcao) => {
                          const idsDaFuncao = colaboradores.filter((c) => c.funcao_nome === funcao).map((c) => c.id);
                          const ativo = idsDaFuncao.every((id) => formData.colaboradores_selecionados.includes(id));
                          return (
                            <button
                              type="button"
                              key={funcao}
                              onClick={() => selecionarPorFuncao(funcao)}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                ativo
                                  ? 'bg-[#7D1F2C] border-[#7D1F2C] text-white'
                                  : 'bg-white/5 border-white/20 text-white/60 hover:bg-white/10'
                              }`}
                            >
                              {funcao}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="max-h-40 overflow-y-auto border border-white/20 rounded-lg p-2">
                      {colaboradores.map((colaborador) => (
                        <label key={colaborador.id} className="flex items-center p-2 hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={formData.colaboradores_selecionados.includes(colaborador.id)}
                            onChange={() => toggleColaboradorSelecionado(colaborador.id)}
                            className="mr-2 rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                          />
                          <div>
                            <div className="text-sm font-medium">{colaborador.nome_completo}</div>
                            <div className="text-xs text-white/40">{colaborador.funcao_nome}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Campos comuns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Setor *
                  </label>
                  <select
                    value={formData.setor}
                    onChange={(e) => setFormData({ ...formData, setor: e.target.value, posto_trabalho_id: '' })}
                    className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                    required
                  >
                    {setores.map((setor) => (
                      <option key={setor} value={setor}>
                        {setor}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.setor === 'Cozinha' && (
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Posto de Trabalho
                    </label>
                    <select
                      value={formData.posto_trabalho_id}
                      onChange={(e) => setFormData({ ...formData, posto_trabalho_id: e.target.value })}
                      className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                    >
                      <option value="">Sem posto definido</option>
                      {postosTrabalho.filter(p => p.setor === 'Cozinha').map((posto) => (
                        <option key={posto.id} value={posto.id}>
                          {posto.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Tipo de Turno <span className="text-white/40 font-normal">(sugerido pelo horário)</span>
                  </label>
                  <select
                    value={formData.tipo_turno}
                    onChange={(e) => setFormData({ ...formData, tipo_turno: e.target.value as 'diurno' | 'noturno' | 'madrugada' | 'variavel' })}
                    className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  >
                    <option value="diurno">Diurno</option>
                    <option value="noturno">Noturno</option>
                    <option value="madrugada">Madrugada</option>
                    <option value="variavel">Variável</option>
                  </select>
                </div>
              </div>

              {/* Checkbox de folga */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.eh_folga}
                    onChange={(e) => setFormData({ ...formData, eh_folga: e.target.checked })}
                    className="mr-2 rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                  />
                  <span className="text-sm font-medium text-white/80">
                    🏖️ Esta é uma folga (não definir horários)
                  </span>
                </label>
              </div>

              {/* Horários (apenas se não for folga) */}
              {!formData.eh_folga && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Horário Início
                    </label>
                    <input
                      type="time"
                      value={formData.horario_inicio}
                      onChange={(e) => setFormData({
                        ...formData,
                        horario_inicio: e.target.value,
                        tipo_turno: e.target.value ? detectarTurno(e.target.value) : formData.tipo_turno,
                      })}
                      className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Horário Fim
                    </label>
                    <input
                      type="time"
                      value={formData.horario_fim}
                      onChange={(e) => setFormData({ ...formData, horario_fim: e.target.value })}
                      className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                    />
                  </div>
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Observações
                </label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                  className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  placeholder="Observações adicionais..."
                />
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end space-x-4 mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50"
              >
                {loading ? 'Salvando...' : editingEscala ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 mr-3" />
              <h3 className="text-lg font-medium text-white">Confirmar Exclusão</h3>
            </div>
            <p className="text-white/50 mb-6">
              Tem certeza que deseja excluir esta escala? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => escalaToDelete && handleDelete(escalaToDelete)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EscalasTrabalho;