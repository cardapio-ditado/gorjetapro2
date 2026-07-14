import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  TrendingUp,
  Download,
  Receipt,
  Calculator,
  Award,
  Eye,
  Zap,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Link2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { testConnection } from '../../lib/supabase';
import dayjs from '../../lib/dayjs';
import { formatCurrency } from '../../utils/currency';
import { imprimirRecibo } from '../../utils/recibo';
import type { DadosRecibo } from '../../utils/recibo';

const SUPABASE_URL = (supabase as any).supabaseUrl as string;

interface SaldoGorjeta {
  colaborador_id: string;
  colaborador_nome: string;
  funcao_nome?: string;
  total_vendas: number;
  comissao_base: number;
  bonus_meta: number;
  adicionais_total: number;
  descontos_total: number;
  total_liquido: number;
}

interface VendaGarcom {
  id: string;
  colaborador_id: string;
  data_venda: string;
  turno: string;
  valor_vendas: number;
  quantidade_comandas: number;
  valor_gorjeta: number;
  observacoes?: string;
}

interface GorjetaAdicional {
  id: string;
  colaborador_id: string;
  semana: number;
  ano: number;
  tipo: string;
  descricao: string;
  valor: number;
  data_referencia: string;
}

interface DescontoConsumo {
  id: string;
  colaborador_id: string;
  data_desconto: string;
  valor_desconto: number;
  tipo_consumo: string;
  descricao: string;
}

// Ocorrências de consumo puxadas da tabela de ocorrências
interface OcorrenciaConsumo {
  id: string;
  colaborador_id: string;
  data_ocorrencia: string;
  valor_vale: number;
  tipo_ocorrencia: string;
  descricao: string;
}

interface ConfigGorjetas {
  percentual_base: number;
  bonus_meta1_pct: number;
  bonus_meta2_pct: number;
  meta1_valor: number;
  meta2_valor: number;
  teto_adiantamento_semanal: number;
  adiantamento_abate_saldo: boolean;
}

// ─── tipos para o modal ZIG ────────────────────────────────────────────────
interface ZigVendaPreview {
  nome_zig: string;
  colaborador_id: string | null;
  nome_colaborador: string | null;
  valor_total: number;
  qtd_itens: number;
  qtd_transacoes: number;
  mapeado: boolean;
  selecionado: boolean;          // controle local do checkbox
  colaborador_id_editado?: string; // se o usuário escolher manualmente no modal
}

const GorjetaGarcons: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFornecedorModal, setShowFornecedorModal] = useState(false);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [colaboradorParaPagamento, setColaboradorParaPagamento] = useState<string | null>(null);
  const [valorParaPagamento, setValorParaPagamento] = useState(0);
  const [selectedFornecedor, setSelectedFornecedor] = useState('');
  const [semanaAtual, setSemanaAtual] = useState(() => {
    const agora = dayjs();
    return { semana: agora.isoWeek(), ano: agora.year() };
  });

  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [saldos, setSaldos] = useState<SaldoGorjeta[]>([]);
  const [vendas, setVendas] = useState<VendaGarcom[]>([]);
  const [adicionais, setAdicionais] = useState<GorjetaAdicional[]>([]);
  const [descontos, setDescontos] = useState<DescontoConsumo[]>([]);
  const [ocorrenciasConsumo, setOcorrenciasConsumo] = useState<OcorrenciaConsumo[]>([]);
  const [config, setConfig] = useState<ConfigGorjetas | null>(null);

  const [showVendaForm, setShowVendaForm] = useState(false);
  const [showAdicionalForm, setShowAdicionalForm] = useState(false);
  const [showDescontoForm, setShowDescontoForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // ── estados do modal ZIG ──────────────────────────────────────────────────
  const [showZigModal, setShowZigModal] = useState(false);
  const [zigLoading, setZigLoading] = useState(false);
  const [zigErro, setZigErro] = useState('');
  const [zigVendas, setZigVendas] = useState<ZigVendaPreview[]>([]);
  const [zigImportando, setZigImportando] = useState(false);
  const [zigResultado, setZigResultado] = useState<{ inseridos: number; pulados: number } | null>(null);
  const [expandidoZig, setExpandidoZig] = useState<string | null>(null);

  const [formVenda, setFormVenda] = useState({
    colaborador_id: '',
    data_venda: dayjs().format('YYYY-MM-DD'),
    turno: 'almoco',
    valor_vendas: 0,
    quantidade_comandas: 0,
    valor_gorjeta: 0,
    observacoes: ''
  });

  const [formAdicional, setFormAdicional] = useState({
    colaborador_id: '',
    tipo: 'outros',
    descricao: '',
    valor: 0,
    data_referencia: dayjs().format('YYYY-MM-DD')
  });

  const [formDesconto, setFormDesconto] = useState({
    colaborador_id: '',
    data_desconto: dayjs().format('YYYY-MM-DD'),
    tipo_consumo: 'refeicao',
    descricao: '',
    valor_desconto: 0
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [colaboradorFilter, setColaboradorFilter] = useState('all');

  useEffect(() => {
    carregarDadosSemana();
    carregarConfig();
    carregarFornecedores();
  }, [semanaAtual]);

  // Recalcula saldos após config carregar, pois calculateBonusMeta depende de config
  useEffect(() => {
    if (config && colaboradores.length > 0) {
      calcularSaldos(colaboradores, vendas, adicionais, descontos, ocorrenciasConsumo);
    }
  }, [config]);

  // ─── helpers de semana ────────────────────────────────────────────────────
  const getWeekDates = (ano: number, semana: number) => {
    const startOfWeek = dayjs().year(ano).isoWeek(semana).startOf('isoWeek');
    const endOfWeek   = dayjs().year(ano).isoWeek(semana).endOf('isoWeek');
    return {
      start:          startOfWeek.format('YYYY-MM-DD'),
      end:            endOfWeek.format('YYYY-MM-DD'),
      startFormatted: startOfWeek.format('DD/MM'),
      endFormatted:   endOfWeek.format('DD/MM'),
    };
  };

  // ─── carregamentos ────────────────────────────────────────────────────────
  const carregarFornecedores = async () => {
    try {
      const ok = await testConnection();
      if (!ok) { setFornecedores([]); return; }
      const { data, error } = await supabase.from('fornecedores').select('id, nome').eq('status', 'ativo').order('nome');
      if (error) throw error;
      setFornecedores(data || []);
    } catch (err) { console.error(err); setFornecedores([]); }
  };

  const carregarConfig = async () => {
    const fallback: ConfigGorjetas = {
      percentual_base: 0.05, bonus_meta1_pct: 0.01, bonus_meta2_pct: 0.02,
      meta1_valor: 17000, meta2_valor: 24000, teto_adiantamento_semanal: 395,
      adiantamento_abate_saldo: true,
    };
    try {
      const ok = await testConnection();
      if (!ok) { setConfig(fallback); return; }
      const { data, error } = await supabase.from('config_gorjetas').select('*').maybeSingle();
      setConfig(error || !data ? fallback : data);
    } catch { setConfig(fallback); }
  };

  const carregarDadosSemana = async () => {
    try {
      setLoading(true); setError(null);
      if (!supabase) { setColaboradores([]); setSaldos([]); setVendas([]); setAdicionais([]); setDescontos([]); return; }
      const { start, end } = getWeekDates(semanaAtual.ano, semanaAtual.semana);

      const [colRes, vendRes, adicRes, descRes, ocorrRes] = await Promise.all([
        supabase.from('vw_colaboradores_completo').select('*').eq('status', 'ativo').ilike('funcao_nome', '%garcom%'),
        supabase.from('vendas_garcom').select('*').gte('data_venda', start).lte('data_venda', end),
        supabase.from('gorjetas_adicionais').select('*').eq('semana', semanaAtual.semana).eq('ano', semanaAtual.ano),
        supabase.from('descontos_consumo').select('*').gte('data_desconto', start).lte('data_desconto', end),
        supabase.from('ocorrencias_colaborador')
          .select('id, colaborador_id, data_ocorrencia, valor_vale, tipo_ocorrencia, descricao')
          .in('tipo_ocorrencia', ['consumo', 'consumo_bar'])
          .gte('data_ocorrencia', start)
          .lte('data_ocorrencia', end),
      ]);

      if (colRes.error)  throw colRes.error;
      if (vendRes.error) throw vendRes.error;
      if (adicRes.error) throw adicRes.error;
      if (descRes.error) throw descRes.error;

      setColaboradores(colRes.data  || []);
      setVendas(vendRes.data        || []);
      setAdicionais(adicRes.data    || []);
      setDescontos(descRes.data     || []);
      setOcorrenciasConsumo(ocorrRes.data || []);
      calcularSaldos(colRes.data || [], vendRes.data || [], adicRes.data || [], descRes.data || [], ocorrRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados da semana');
    } finally { setLoading(false); }
  };

  const calculateBonusMeta = (totalVendas: number): number => {
    if (!config) return 0;
    if (totalVendas >= config.meta2_valor) return totalVendas * config.bonus_meta2_pct;
    if (totalVendas >= config.meta1_valor) return totalVendas * config.bonus_meta1_pct;
    return 0;
  };

  const calcularSaldos = (
    colaboradoresData: any[], vendasData: VendaGarcom[],
    adicionaisData: GorjetaAdicional[], descontosData: DescontoConsumo[],
    ocorrConsumoData: OcorrenciaConsumo[] = []
  ) => {
    const basePct = config?.percentual_base ?? 0.05;
    setSaldos(colaboradoresData.map((c) => {
      const vends = vendasData.filter(v => v.colaborador_id === c.id);
      const adics = adicionaisData.filter(a => a.colaborador_id === c.id);
      // Descontos da tabela legada descontos_consumo
      const descsLegado = descontosData.filter(d => d.colaborador_id === c.id);
      // Descontos de ocorrências (consumo no bar) - usa valor_vale
      const descsOcorr = ocorrConsumoData.filter(o => o.colaborador_id === c.id);

      const totalVendas     = vends.reduce((s, v) => s + (v.valor_vendas || 0), 0);
      const comissaoBase    = totalVendas * basePct;
      const bonusMeta       = calculateBonusMeta(totalVendas);
      const adicionaisTotal = adics.reduce((s, a) => s + (a.valor || 0), 0);
      // Total de descontos = legado + ocorrências de consumo
      const descontosTotal  = descsLegado.reduce((s, d) => s + (d.valor_desconto || 0), 0)
                            + descsOcorr.reduce((s, o) => s + (o.valor_vale || 0), 0);
      return {
        colaborador_id: c.id, colaborador_nome: c.nome_completo, funcao_nome: c.funcao_nome,
        total_vendas: totalVendas, comissao_base: comissaoBase, bonus_meta: bonusMeta,
        adicionais_total: adicionaisTotal, descontos_total: descontosTotal,
        total_liquido: Math.max(0, comissaoBase + bonusMeta + adicionaisTotal - descontosTotal),
      };
    }));
  };

  // ─── importação ZIG ───────────────────────────────────────────────────────
  const abrirModalZig = async () => {
    setShowZigModal(true);
    setZigErro('');
    setZigVendas([]);
    setZigResultado(null);
    setZigLoading(true);

    const { start, end } = getWeekDates(semanaAtual.ano, semanaAtual.semana);
    // Não buscar datas futuras
    const hoje = dayjs().format('YYYY-MM-DD');
    const dtfim = end > hoje ? hoje : end;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zig-vendas-garcom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dtinicio: start, dtfim }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao buscar vendas na ZIG');

      // Marcar: selecionado por padrão apenas os mapeados
      const vendas: ZigVendaPreview[] = (data.garcons || []).map((g: any) => ({
        ...g,
        selecionado: !!g.colaborador_id,
      }));
      setZigVendas(vendas);
    } catch (e: any) {
      setZigErro(e.message);
    } finally {
      setZigLoading(false);
    }
  };

  const salvarMapeamentoZig = async (nomeZig: string, colaboradorId: string) => {
    await supabase.from('zig_mapeamento_garcom')
      .upsert({ nome_zig: nomeZig, colaborador_id: colaboradorId || null }, { onConflict: 'nome_zig' });

    const col = colaboradores.find(c => c.id === colaboradorId);
    setZigVendas(prev => prev.map(v => v.nome_zig !== nomeZig ? v : {
      ...v,
      colaborador_id: colaboradorId,
      colaborador_id_editado: colaboradorId,
      nome_colaborador: col?.nome_completo ?? null,
      mapeado: !!colaboradorId,
      selecionado: !!colaboradorId,
    }));
  };

  const confirmarImportacaoZig = async () => {
    setZigImportando(true);
    setZigErro('');
    let inseridos = 0;
    let pulados   = 0;

    const { start } = getWeekDates(semanaAtual.ano, semanaAtual.semana);
    const hoje = dayjs().format('YYYY-MM-DD');
    const dtfim = getWeekDates(semanaAtual.ano, semanaAtual.semana).end > hoje
      ? hoje : getWeekDates(semanaAtual.ano, semanaAtual.semana).end;

    try {
      for (const g of zigVendas.filter(v => v.selecionado)) {
        const colId = g.colaborador_id_editado || g.colaborador_id;
        if (!colId) { pulados++; continue; }

        // Verificar se já existe registro para este colaborador nesta semana (evitar duplicata)
        const { data: existente } = await supabase
          .from('vendas_garcom')
          .select('id')
          .eq('colaborador_id', colId)
          .gte('data_venda', start)
          .lte('data_venda', dtfim)
          .eq('observacoes', `Importado ZIG ${start}→${dtfim}`)
          .maybeSingle();

        if (existente) { pulados++; continue; }

        const { error } = await supabase.from('vendas_garcom').insert({
          colaborador_id:    colId,
          data_venda:        dtfim,           // lança na última data do período
          turno:             'noite',
          valor_vendas:      g.valor_total,
          quantidade_comandas: g.qtd_transacoes,
          valor_gorjeta:     0,
          observacoes:       `Importado ZIG ${start}→${dtfim}`,
        });

        if (error) throw error;
        inseridos++;
      }

      setZigResultado({ inseridos, pulados });
      carregarDadosSemana();
    } catch (e: any) {
      setZigErro(e.message);
    } finally {
      setZigImportando(false);
    }
  };

  // ─── pagamento semanal ────────────────────────────────────────────────────
  const gerarPagamentoSemanal = async (colaboradorId: string) => {
    try {
      setLoading(true); setError(null);
      const colaborador = colaboradores.find(c => c.id === colaboradorId);
      if (!colaborador) throw new Error('Colaborador não encontrado');
      const saldoColaborador = saldos.find(s => s.colaborador_id === colaboradorId);
      if (!saldoColaborador) throw new Error('Saldo do colaborador não encontrado');
      const valorLiquido = saldoColaborador.total_liquido;
      if (valorLiquido <= 0) { alert('Não há valor líquido para pagamento deste colaborador.'); return; }

      const { data: contaExistente, error: checkError } = await supabase
        .from('contas_pagar').select('id')
        .eq('origem_rh_tipo', 'gorjeta_semanal').eq('origem_rh_id', colaboradorId)
        .eq('origem_rh_semana', semanaAtual.semana).eq('origem_rh_ano', semanaAtual.ano)
        .maybeSingle();
      if (checkError && checkError.code !== 'PGRST116') throw checkError;
      if (contaExistente) { alert('Já existe uma conta a pagar registrada para este colaborador nesta semana.'); return; }

      setColaboradorParaPagamento(colaboradorId);
      setValorParaPagamento(valorLiquido);
      setShowFornecedorModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao preparar pagamento semanal');
    } finally { setLoading(false); }
  };

  const confirmarPagamentoComFornecedor = async () => {
    try {
      setLoading(true); setError(null);
      if (!selectedFornecedor || !colaboradorParaPagamento) throw new Error('Selecione um fornecedor');
      const colaborador = colaboradores.find(c => c.id === colaboradorParaPagamento);
      if (!colaborador) throw new Error('Colaborador não encontrado');

      const { data: centroCusto } = await supabase.from('centros_custo').select('id')
        .eq('nome', 'Ditado Popular').eq('status', 'ativo').maybeSingle();
      let centroCustoId = centroCusto?.id;
      if (!centroCustoId) {
        const { data: novoCentro, error: criarCentroError } = await supabase.from('centros_custo')
          .insert([{ nome: 'Ditado Popular', descricao: 'Centro de custo principal da empresa', status: 'ativo' }])
          .select('id').single();
        if (criarCentroError) throw criarCentroError;
        centroCustoId = novoCentro.id;
      }

      const sextaFeiraSemana = dayjs().year(semanaAtual.ano).isoWeek(semanaAtual.semana)
        .endOf('isoWeek').subtract(2, 'days').format('YYYY-MM-DD');

      const { error: contaError } = await supabase.from('contas_pagar').insert([{
        fornecedor_id: selectedFornecedor,
        descricao: `Gorjeta semana ${semanaAtual.semana} colaborador ${colaborador.nome_completo}`,
        valor_total: valorParaPagamento,
        data_vencimento: sextaFeiraSemana,
        data_emissao: dayjs().format('YYYY-MM-DD'),
        centro_custo_id: centroCustoId,
        status: 'em_aberto',
        origem_rh_tipo: 'gorjeta_semanal',
        origem_rh_id: colaboradorParaPagamento,
        origem_rh_semana: semanaAtual.semana,
        origem_rh_ano: semanaAtual.ano,
        observacoes: `Pagamento de gorjeta referente à semana ${semanaAtual.semana}/${semanaAtual.ano}`
      }]);
      if (contaError) throw contaError;

      setShowFornecedorModal(false); setColaboradorParaPagamento(null); setValorParaPagamento(0); setSelectedFornecedor('');
      alert('Conta a pagar criada com sucesso no módulo financeiro!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta a pagar');
    } finally { setLoading(false); }
  };

  // ─── salvar venda manual ──────────────────────────────────────────────────
  const salvarVenda = async () => {
    try {
      setLoading(true); setError(null);
      if (!formVenda.colaborador_id || !formVenda.data_venda || !formVenda.valor_vendas)
        throw new Error('Preencha todos os campos obrigatórios');
      const { error } = await supabase.from('vendas_garcom').insert([{
        colaborador_id: formVenda.colaborador_id, data_venda: formVenda.data_venda,
        turno: formVenda.turno, valor_vendas: formVenda.valor_vendas,
        quantidade_comandas: formVenda.quantidade_comandas || 0,
        valor_gorjeta: formVenda.valor_gorjeta || 0, observacoes: formVenda.observacoes
      }]);
      if (error) throw error;
      setShowVendaForm(false);
      setFormVenda({ colaborador_id: '', data_venda: dayjs().format('YYYY-MM-DD'), turno: 'almoco', valor_vendas: 0, quantidade_comandas: 0, valor_gorjeta: 0, observacoes: '' });
      carregarDadosSemana();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar venda'); }
    finally { setLoading(false); }
  };

  const salvarAdicional = async () => {
    try {
      setLoading(true); setError(null);
      if (!formAdicional.colaborador_id || !formAdicional.descricao || !formAdicional.valor)
        throw new Error('Preencha todos os campos obrigatórios');
      const { error } = await supabase.from('gorjetas_adicionais').insert([{
        colaborador_id: formAdicional.colaborador_id, semana: semanaAtual.semana, ano: semanaAtual.ano,
        tipo: formAdicional.tipo, descricao: formAdicional.descricao, valor: formAdicional.valor,
        data_referencia: formAdicional.data_referencia
      }]);
      if (error) throw error;
      setShowAdicionalForm(false);
      setFormAdicional({ colaborador_id: '', tipo: 'outros', descricao: '', valor: 0, data_referencia: dayjs().format('YYYY-MM-DD') });
      carregarDadosSemana();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar gorjeta adicional'); }
    finally { setLoading(false); }
  };

  const salvarDesconto = async () => {
    try {
      setLoading(true); setError(null);
      if (!formDesconto.colaborador_id || !formDesconto.descricao || !formDesconto.valor_desconto)
        throw new Error('Preencha todos os campos obrigatórios');
      const { error } = await supabase.from('descontos_consumo').insert([{
        colaborador_id: formDesconto.colaborador_id, data_desconto: formDesconto.data_desconto,
        valor_desconto: formDesconto.valor_desconto, tipo_consumo: formDesconto.tipo_consumo,
        descricao: formDesconto.descricao
      }]);
      if (error) throw error;
      setShowDescontoForm(false);
      setFormDesconto({ colaborador_id: '', data_desconto: dayjs().format('YYYY-MM-DD'), tipo_consumo: 'refeicao', descricao: '', valor_desconto: 0 });
      carregarDadosSemana();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar desconto'); }
    finally { setLoading(false); }
  };

  const gerarRecibo = async (colaboradorId: string) => {
    try {
      setLoading(true);
      const colaborador = colaboradores.find(c => c.id === colaboradorId);
      if (!colaborador) throw new Error('Colaborador não encontrado');
      const vendasC       = vendas.filter(v => v.colaborador_id === colaboradorId);
      const adicionaisC   = adicionais.filter(a => a.colaborador_id === colaboradorId);
      const descontosC    = descontos.filter(d => d.colaborador_id === colaboradorId);
      const ocorrConsumoC = ocorrenciasConsumo.filter(o => o.colaborador_id === colaboradorId);
      const totalVendas     = vendasC.reduce((s, v) => s + (v.valor_vendas || 0), 0);
      const comissaoBase    = totalVendas * (config?.percentual_base || 0.05);
      const bonusMeta       = calculateBonusMeta(totalVendas);
      const adicionaisTotal = adicionaisC.reduce((s, a) => s + (a.valor || 0), 0);
      const descontosTotal  = descontosC.reduce((s, d) => s + (d.valor_desconto || 0), 0)
                            + ocorrConsumoC.reduce((s, o) => s + (o.valor_vale || 0), 0);
      const valorLiquido = Math.max(0, comissaoBase + bonusMeta + adicionaisTotal - descontosTotal);

      // Mescla descontos legados + ocorrências de consumo no mesmo formato para o recibo
      const descontosRecibo = [
        ...descontosC.map(d => ({ data_desconto: d.data_desconto, tipo_consumo: d.tipo_consumo, descricao: d.descricao, valor_desconto: d.valor_desconto })),
        ...ocorrConsumoC.map(o => ({ data_desconto: o.data_ocorrencia, tipo_consumo: o.tipo_ocorrencia, descricao: o.descricao || 'Consumo', valor_desconto: o.valor_vale })),
      ];

      const dadosRecibo: DadosRecibo = {
        colaborador: { nome_completo: colaborador.nome_completo, funcao_nome: colaborador.funcao_nome || 'Funcionário' },
        periodo: { semana: semanaAtual.semana, ano: semanaAtual.ano },
        totais: { total_vendas: totalVendas, percentual_aplicado: (config?.percentual_base || 0.05)*100, comissao_base: comissaoBase, adicionais_total: adicionaisTotal, descontos_total: descontosTotal, adiantamentos_total: 0, valor_liquido: valorLiquido },
        detalhamento: {
          vendas:    vendasC.map(v => ({ data_venda: v.data_venda, turno: v.turno, valor_vendas: v.valor_vendas, observacoes: v.observacoes })),
          adicionais: adicionaisC.map(a => ({ tipo: a.tipo, descricao: a.descricao, valor: a.valor, data_referencia: a.data_referencia })),
          descontos:  descontosRecibo,
          adiantamentos: []
        },
        configuracao: { meta1_valor: config?.meta1_valor||17000, meta2_valor: config?.meta2_valor||24000, bonus_meta1_pct: config?.bonus_meta1_pct||0.01, bonus_meta2_pct: config?.bonus_meta2_pct||0.02, adiantamento_abate_saldo: config?.adiantamento_abate_saldo??true }
      };
      imprimirRecibo(dadosRecibo);
    } catch (e) { alert('Erro ao gerar recibo: ' + (e instanceof Error ? e.message : 'Erro desconhecido')); }
    finally { setLoading(false); }
  };

  const alterarSemana = (direcao: 'anterior' | 'proxima') => {
    const ref  = dayjs().year(semanaAtual.ano).isoWeek(semanaAtual.semana);
    const nova = direcao === 'anterior' ? ref.subtract(1, 'week') : ref.add(1, 'week');
    setSemanaAtual({ semana: nova.isoWeek(), ano: nova.year() });
  };

  const filteredSaldos = saldos.filter(s => {
    if (colaboradorFilter !== 'all' && s.colaborador_id !== colaboradorFilter) return false;
    return s.colaborador_nome.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const weekDates = getWeekDates(semanaAtual.ano, semanaAtual.semana);
  const zigSelecionados = zigVendas.filter(v => v.selecionado).length;
  const zigSemVinculo   = zigVendas.filter(v => v.selecionado && !v.colaborador_id && !v.colaborador_id_editado).length;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Gestão de Gorjetas</h3>
        <div className="flex gap-2 flex-wrap">
          {/* ★ BOTÃO ZIG */}
          <button
            onClick={abrirModalZig}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2 font-semibold shadow-sm"
          >
            <Zap className="w-4 h-4" />
            Importar da ZIG
          </button>
          <button onClick={() => setShowVendaForm(true)}     className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"><Plus className="w-4 h-4 inline mr-2" />Nova Venda</button>
          <button onClick={() => setShowAdicionalForm(true)} className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"><Plus className="w-4 h-4 inline mr-2" />Gorjeta Adicional</button>
          <button onClick={() => setShowDescontoForm(true)}  className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"><Plus className="w-4 h-4 inline mr-2" />Desconto</button>
          <button className="px-4 py-2 bg-[#12141f] border border-white/20 rounded-lg text-white/80 hover:bg-white/5"><Download className="w-4 h-4 inline mr-2" />Exportar Tudo</button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">{error}</div>}

      {/* Controles de Semana */}
      <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-white flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-[#7D1F2C]" />
            Semana {semanaAtual.semana}/{semanaAtual.ano}
          </h4>
          <div className="flex items-center space-x-4">
            <button onClick={() => alterarSemana('anterior')} className="px-3 py-1 bg-white/10 text-white/80 rounded hover:bg-gray-200">← Anterior</button>
            <span className="text-sm text-white/50">{weekDates.startFormatted} a {weekDates.endFormatted}</span>
            <button onClick={() => alterarSemana('proxima')}  className="px-3 py-1 bg-white/10 text-white/80 rounded hover:bg-gray-200">Próxima →</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label:'Total Vendas',    val: saldos.reduce((s,x)=>s+x.total_vendas,0),                         bg:'bg-blue-500/10',   text:'text-blue-400',   bold:'text-blue-300',   icon: DollarSign },
            { label:'Total Comissões', val: saldos.reduce((s,x)=>s+x.comissao_base+x.bonus_meta,0),           bg:'bg-green-500/10',  text:'text-green-400',  bold:'text-green-300',  icon: Award      },
            { label:'Adicionais',      val: saldos.reduce((s,x)=>s+x.adicionais_total,0),                     bg:'bg-purple-500/10', text:'text-purple-400', bold:'text-purple-300', icon: Plus       },
            { label:'Total Líquido',   val: saldos.reduce((s,x)=>s+x.total_liquido,0),                        bg:'bg-red-500/10',    text:'text-red-400',    bold:'text-red-300',    icon: TrendingUp },
          ].map(({ label, val, bg, text, bold, icon: Icon }) => (
            <div key={label} className={`${bg} p-4 rounded-lg`}>
              <div className="flex items-center">
                <Icon className={`w-6 h-6 ${text} mr-2`} />
                <div>
                  <p className={`text-sm ${text}`}>{label}</p>
                  <p className={`text-xl font-bold ${bold}`}>{formatCurrency(val)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-5 h-5" />
            <input type="text" placeholder="Buscar colaborador..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]" />
          </div>
          <select value={colaboradorFilter} onChange={e => setColaboradorFilter(e.target.value)}
            className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]">
            <option value="all">Todos os Colaboradores</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
          </select>
          <button onClick={carregarDadosSemana} className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]">
            <Filter className="w-4 h-4 inline mr-2" />Atualizar
          </button>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]" />
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b border-white/10">
                  {['Colaborador','Função','Total Vendas','Comissão Base','Bônus Meta','Adicionais','Descontos','Total Líquido','Ações'].map(h => (
                    <th key={h} className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[#12141f] divide-y divide-white/5">
                {filteredSaldos.map(saldo => (
                  <tr key={saldo.colaborador_id} className="hover:bg-white/5">
                    <td className="px-6 py-4 font-medium text-white">{saldo.colaborador_nome}</td>
                    <td className="px-6 py-4 text-sm text-white/50">{saldo.funcao_nome || '-'}</td>
                    <td className="px-6 py-4 font-medium text-blue-400">{formatCurrency(saldo.total_vendas)}</td>
                    <td className="px-6 py-4 font-medium text-green-400">{formatCurrency(saldo.comissao_base)}</td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${saldo.bonus_meta > 0 ? 'text-purple-400' : 'text-white/30'}`}>{formatCurrency(saldo.bonus_meta)}</span>
                      {saldo.bonus_meta > 0 && <div className="text-xs text-purple-500">Meta atingida!</div>}
                    </td>
                    <td className="px-6 py-4"><span className={`font-medium ${saldo.adicionais_total > 0 ? 'text-orange-400' : 'text-white/30'}`}>{formatCurrency(saldo.adicionais_total)}</span></td>
                    <td className="px-6 py-4"><span className={`font-medium ${saldo.descontos_total > 0 ? 'text-red-400' : 'text-white/30'}`}>{saldo.descontos_total > 0 ? '-' : ''}{formatCurrency(saldo.descontos_total)}</span></td>
                    <td className="px-6 py-4 font-bold text-lg text-white">{formatCurrency(saldo.total_liquido)}</td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button onClick={() => gerarRecibo(saldo.colaborador_id)} className="text-[#7D1F2C] hover:text-[#6a1a25]" title="Gerar Recibo"><Receipt className="w-4 h-4" /></button>
                        <button onClick={() => gerarPagamentoSemanal(saldo.colaborador_id)} className="text-green-600 hover:text-green-800" title="Criar Conta a Pagar"><DollarSign className="w-4 h-4" /></button>
                        <button className="text-blue-600 hover:text-blue-800" title="Ver Detalhes"><Eye className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredSaldos.length === 0 && (
            <div className="text-center py-12">
              <Calculator className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhum saldo de gorjeta encontrado</h3>
              <p className="text-white/40">{searchTerm || colaboradorFilter !== 'all' ? 'Nenhum colaborador corresponde aos filtros.' : 'Não há dados de gorjetas para esta semana.'}</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL IMPORTAR DA ZIG
      ════════════════════════════════════════════════════════════════ */}
      {showZigModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

            {/* cabeçalho */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg"><Zap className="w-5 h-5 text-amber-500" /></div>
                <div>
                  <h3 className="text-base font-semibold text-white">Importar Vendas da ZIG</h3>
                  <p className="text-xs text-white/40">Semana {semanaAtual.semana}/{semanaAtual.ano} · {weekDates.startFormatted} a {weekDates.endFormatted}</p>
                </div>
              </div>
              <button onClick={() => setShowZigModal(false)} className="text-white/30 hover:text-white/50"><X className="w-5 h-5" /></button>
            </div>

            {/* corpo */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

              {/* loading */}
              {zigLoading && (
                <div className="flex flex-col items-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <p className="text-sm text-white/40">Buscando vendas na ZIG...</p>
                </div>
              )}

              {/* erro */}
              {zigErro && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{zigErro}</p>
                </div>
              )}

              {/* resultado após importação */}
              {zigResultado && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Importação concluída!</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {zigResultado.inseridos} registro(s) inserido(s) em <em>vendas_garcom</em>
                      {zigResultado.pulados > 0 && ` · ${zigResultado.pulados} pulado(s) (já existiam ou sem vínculo)`}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">Os saldos de gorjeta foram atualizados automaticamente.</p>
                  </div>
                </div>
              )}

              {/* lista de garçons ZIG */}
              {!zigLoading && zigVendas.length > 0 && !zigResultado && (
                <>
                  {/* aviso sem vínculo */}
                  {zigSemVinculo > 0 && (
                    <div className="bg-amber-500/10 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-400">
                        {zigSemVinculo} garçom(ns) selecionado(s) sem colaborador vinculado. Vincule abaixo ou desmarque-os.
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-white/40">
                    Marque os garçons cujas vendas deseja importar. Valores em R$ (ZIG retorna em centavos e já convertemos).
                  </p>

                  <div className="space-y-2">
                    {zigVendas.map(g => {
                      const aberto = expandidoZig === g.nome_zig;
                      const colIdUsado = g.colaborador_id_editado || g.colaborador_id;
                      return (
                        <div key={g.nome_zig} className={`border rounded-xl transition-all ${g.selecionado ? 'border-amber-300 bg-amber-500/10' : 'border-white/10 bg-[#12141f]'}`}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            {/* checkbox */}
                            <input type="checkbox" checked={g.selecionado}
                              onChange={e => setZigVendas(prev => prev.map(v => v.nome_zig !== g.nome_zig ? v : { ...v, selecionado: e.target.checked }))}
                              className="w-4 h-4 accent-amber-500 rounded" />

                            {/* info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-white/90">{g.nome_zig}</p>
                                {colIdUsado
                                  ? <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" />
                                      {colaboradores.find(c => c.id === colIdUsado)?.nome_completo ?? g.nome_colaborador}
                                    </span>
                                  : <span className="text-xs text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">Sem vínculo</span>
                                }
                              </div>
                              <p className="text-xs text-white/30 mt-0.5">{g.qtd_transacoes} comandas · {g.qtd_itens} itens</p>
                            </div>

                            {/* valor */}
                            <p className="text-sm font-bold text-white shrink-0">{formatCurrency(g.valor_total)}</p>

                            {/* expandir */}
                            <button onClick={() => setExpandidoZig(aberto ? null : g.nome_zig)}
                              className="text-white/30 hover:text-white/50 shrink-0">
                              {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* expandido: vincular colaborador */}
                          {aberto && (
                            <div className="px-4 pb-4 pt-0 border-t border-white/5">
                              <p className="text-xs text-white/40 mb-2 mt-2 flex items-center gap-1">
                                <Link2 className="w-3 h-3" /> Vincular ao colaborador (salvo permanentemente)
                              </p>
                              <div className="flex gap-2">
                                <select
                                  value={colIdUsado || ''}
                                  onChange={e => {
                                    const id = e.target.value;
                                    setZigVendas(prev => prev.map(v => v.nome_zig !== g.nome_zig ? v : {
                                      ...v, colaborador_id_editado: id,
                                      nome_colaborador: colaboradores.find(c=>c.id===id)?.nome_completo ?? null,
                                      mapeado: !!id, selecionado: !!id,
                                    }));
                                  }}
                                  className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-sm bg-[#12141f] text-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                                  <option value="">— Selecione —</option>
                                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                                </select>
                                <button
                                  onClick={() => salvarMapeamentoZig(g.nome_zig, colIdUsado || '')}
                                  disabled={!colIdUsado}
                                  className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 disabled:opacity-40">
                                  Salvar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* vazio */}
              {!zigLoading && !zigErro && zigVendas.length === 0 && !zigResultado && (
                <div className="text-center py-10 text-white/30">
                  <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma venda encontrada na ZIG para este período.</p>
                </div>
              )}
            </div>

            {/* rodapé */}
            {!zigLoading && !zigResultado && zigVendas.length > 0 && (
              <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/5 rounded-b-2xl">
                <p className="text-xs text-white/40">
                  {zigSelecionados} de {zigVendas.length} garçom(ns) selecionado(s)
                  {zigSemVinculo > 0 && <span className="text-amber-600 ml-1">· {zigSemVinculo} sem vínculo</span>}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setShowZigModal(false)} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-white/50 hover:bg-white/10">Cancelar</button>
                  <button
                    onClick={confirmarImportacaoZig}
                    disabled={zigImportando || zigSelecionados === 0 || zigSemVinculo === zigSelecionados}
                    className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2">
                    {zigImportando ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : `Importar ${zigSelecionados} garçom(ns)`}
                  </button>
                </div>
              </div>
            )}
            {zigResultado && (
              <div className="px-6 py-4 border-t border-white/5 flex justify-end bg-white/5 rounded-b-2xl">
                <button onClick={() => setShowZigModal(false)} className="px-5 py-2 bg-[#7D1F2C] text-white rounded-lg text-sm font-semibold hover:bg-[#6a1a25]">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Nova Venda */}
      {showVendaForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">{editingItem ? 'Editar Venda' : 'Nova Venda'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Colaborador *</label>
                <select value={formVenda.colaborador_id} onChange={e => setFormVenda({...formVenda, colaborador_id: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required>
                  <option value="">Selecione um colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Data da Venda *</label>
                <input type="date" value={formVenda.data_venda} onChange={e => setFormVenda({...formVenda, data_venda: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Turno *</label>
                <select value={formVenda.turno} onChange={e => setFormVenda({...formVenda, turno: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50">
                  <option value="almoco">Almoço</option><option value="jantar">Jantar</option><option value="noite">Noite</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Valor das Vendas *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-white/40 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={formVenda.valor_vendas}
                    onChange={e => setFormVenda({...formVenda, valor_vendas: parseFloat(e.target.value)||0})}
                    className="pl-10 w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Observações</label>
                <textarea value={formVenda.observacoes} onChange={e => setFormVenda({...formVenda, observacoes: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" rows={2} />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => { setShowVendaForm(false); setEditingItem(null); }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5">Cancelar</button>
              <button onClick={salvarVenda} disabled={loading || !formVenda.colaborador_id || !formVenda.valor_vendas}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gorjeta Adicional */}
      {showAdicionalForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">{editingItem ? 'Editar Gorjeta Adicional' : 'Nova Gorjeta Adicional'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Colaborador *</label>
                <select value={formAdicional.colaborador_id} onChange={e => setFormAdicional({...formAdicional, colaborador_id: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required>
                  <option value="">Selecione um colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Tipo *</label>
                <select value={formAdicional.tipo} onChange={e => setFormAdicional({...formAdicional, tipo: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50">
                  <option value="gratificacao_lideranca">Gratificação Liderança</option>
                  <option value="gorjeta_fixa_feijoada">Gorjeta Fixa Feijoada</option>
                  <option value="bonus_especial">Bônus Especial</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Descrição *</label>
                <input type="text" value={formAdicional.descricao} onChange={e => setFormAdicional({...formAdicional, descricao: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Valor *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-white/40 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={formAdicional.valor}
                    onChange={e => setFormAdicional({...formAdicional, valor: parseFloat(e.target.value)||0})}
                    className="pl-10 w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Data de Referência *</label>
                <input type="date" value={formAdicional.data_referencia} onChange={e => setFormAdicional({...formAdicional, data_referencia: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => { setShowAdicionalForm(false); setEditingItem(null); setFormAdicional({ colaborador_id:'', tipo:'outros', descricao:'', valor:0, data_referencia: dayjs().format('YYYY-MM-DD') }); }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5">Cancelar</button>
              <button onClick={salvarAdicional} disabled={loading || !formAdicional.colaborador_id || !formAdicional.descricao || !formAdicional.valor}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Desconto */}
      {showDescontoForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">{editingItem ? 'Editar Desconto' : 'Novo Desconto'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Colaborador *</label>
                <select value={formDesconto.colaborador_id} onChange={e => setFormDesconto({...formDesconto, colaborador_id: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required>
                  <option value="">Selecione um colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Data do Desconto *</label>
                <input type="date" value={formDesconto.data_desconto} onChange={e => setFormDesconto({...formDesconto, data_desconto: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Tipo de Consumo *</label>
                <select value={formDesconto.tipo_consumo} onChange={e => setFormDesconto({...formDesconto, tipo_consumo: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50">
                  <option value="refeicao">Refeição</option><option value="bebida">Bebida</option>
                  <option value="lanche">Lanche</option><option value="cafe">Café</option><option value="outros">Outros</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Descrição *</label>
                <input type="text" value={formDesconto.descricao} onChange={e => setFormDesconto({...formDesconto, descricao: e.target.value})}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Valor do Desconto *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-white/40 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={formDesconto.valor_desconto}
                    onChange={e => setFormDesconto({...formDesconto, valor_desconto: parseFloat(e.target.value)||0})}
                    className="pl-10 w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => { setShowDescontoForm(false); setEditingItem(null); }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5">Cancelar</button>
              <button onClick={salvarDesconto} disabled={loading || !formDesconto.colaborador_id || !formDesconto.descricao || !formDesconto.valor_desconto}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fornecedor */}
      {showFornecedorModal && colaboradorParaPagamento && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">Selecionar Fornecedor para Pagamento</h3>
            <div className="mb-4">
              <div className="bg-blue-500/10 p-4 rounded-lg text-sm text-blue-400 space-y-1">
                <div><strong>Colaborador:</strong> {colaboradores.find(c => c.id === colaboradorParaPagamento)?.nome_completo}</div>
                <div><strong>Semana:</strong> {semanaAtual.semana}/{semanaAtual.ano}</div>
                <div><strong>Valor:</strong> {formatCurrency(valorParaPagamento)}</div>
                <div><strong>Vencimento:</strong> {dayjs().year(semanaAtual.ano).isoWeek(semanaAtual.semana).endOf('isoWeek').subtract(2,'days').format('DD/MM/YYYY')} (Sexta-feira)</div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Fornecedor *</label>
              <select value={selectedFornecedor} onChange={e => setSelectedFornecedor(e.target.value)}
                className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50" required>
                <option value="">Selecione um fornecedor...</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => { setShowFornecedorModal(false); setColaboradorParaPagamento(null); setValorParaPagamento(0); setSelectedFornecedor(''); }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5">Cancelar</button>
              <button onClick={confirmarPagamentoComFornecedor} disabled={loading || !selectedFornecedor}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50">{loading ? 'Criando Conta...' : 'Criar Conta a Pagar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GorjetaGarcons;
