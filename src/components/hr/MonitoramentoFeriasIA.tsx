import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  Sparkles,
  Users,
  TrendingUp,
  RefreshCw,
  FileText,
  Eye
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface Alerta {
  id: string;
  colaborador_id: string;
  nome_completo: string;
  funcao_personalizada: string;
  tipo_alerta: string;
  prioridade: string;
  titulo: string;
  mensagem: string;
  data_alerta: string;
  dias_ate_vencimento: number;
  periodo_aquisitivo_inicio: string;
  periodo_aquisitivo_fim: string;
  periodo_concessivo_fim: string;
  dias_restantes: number;
  analise_ia?: any;
  criado_em: string;
}

interface AnaliseIA {
  resumo_geral?: string;
  alertas_criticos?: any[];
  estatisticas?: {
    total_alertas: number;
    urgentes: number;
    dias_total_vencendo: number;
  };
}

const MonitoramentoFeriasIA: React.FC = () => {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [analiseIA, setAnaliseIA] = useState<AnaliseIA | null>(null);
  const [filtroprioridade, setFiltroPrioridade] = useState<string>('all');
  const [alertaSelecionado, setAlertaSelecionado] = useState<Alerta | null>(null);

  useEffect(() => {
    fetchAlertas();
    // Atualizar status e gerar alertas automaticamente
    atualizarStatusEAlertas();
  }, []);

  const atualizarStatusEAlertas = async () => {
    try {
      // Chamar função para atualizar status
      await supabase.rpc('atualizar_status_periodos_aquisitivos');

      // Chamar função para gerar alertas
      await supabase.rpc('gerar_alertas_ferias');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
    }
  };

  const fetchAlertas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vw_alertas_ferias_pendentes')
        .select('*')
        .order('prioridade', { ascending: false });

      if (error) throw error;
      setAlertas(data || []);
    } catch (error) {
      console.error('Erro ao buscar alertas:', error);
    } finally {
      setLoading(false);
    }
  };

  const analisarComIA = async () => {
    try {
      setAnalisando(true);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-ferias-ia`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'analisar_alertas'
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao analisar férias');
      }

      const result = await response.json();
      setAnaliseIA(result.analise);

      // Recarregar alertas para pegar as análises salvas
      await fetchAlertas();
    } catch (error) {
      console.error('Erro na análise com IA:', error);
      alert('Erro ao analisar férias com IA');
    } finally {
      setAnalisando(false);
    }
  };

  const resolverAlerta = async (alertaId: string) => {
    try {
      const { error } = await supabase
        .from('alertas_ferias')
        .update({
          status: 'resolvido',
          resolvido_em: new Date().toISOString()
        })
        .eq('id', alertaId);

      if (error) throw error;
      await fetchAlertas();
    } catch (error) {
      console.error('Erro ao resolver alerta:', error);
    }
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'urgente': return 'bg-red-500/15 text-red-300 border-red-300';
      case 'alta': return 'bg-orange-500/15 text-orange-300 border-orange-300';
      case 'media': return 'bg-yellow-500/15 text-yellow-300 border-yellow-300';
      default: return 'bg-blue-500/15 text-blue-300 border-blue-300';
    }
  };

  const getPrioridadeIcon = (prioridade: string) => {
    switch (prioridade) {
      case 'urgente': return <AlertTriangle className="w-5 h-5" />;
      case 'alta': return <Clock className="w-5 h-5" />;
      case 'media': return <Calendar className="w-5 h-5" />;
      default: return <CheckCircle className="w-5 h-5" />;
    }
  };

  const alertasFiltrados = filtroprioridade === 'all'
    ? alertas
    : alertas.filter(a => a.prioridade === filtroprioridade);

  const estatisticas = {
    total: alertas.length,
    urgentes: alertas.filter(a => a.prioridade === 'urgente').length,
    altas: alertas.filter(a => a.prioridade === 'alta').length,
    medias: alertas.filter(a => a.prioridade === 'media').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white/90 flex items-center gap-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            Monitoramento de Férias com IA
          </h2>
          <p className="text-white/50 mt-1">
            Sistema inteligente de acompanhamento de períodos aquisitivos e concessivos
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAlertas}
            className="px-4 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/15 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            onClick={analisarComIA}
            disabled={analisando || alertas.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-lg hover:from-sky-700 hover:to-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analisando ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analisar com IA
              </>
            )}
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/50 text-sm">Total de Alertas</p>
              <p className="text-3xl font-bold text-white/90 mt-1">{estatisticas.total}</p>
            </div>
            <Users className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-red-500/10 p-6 rounded-lg border border-red-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-300/70 text-sm">Urgentes</p>
              <p className="text-3xl font-bold text-red-300 mt-1">{estatisticas.urgentes}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <div className="bg-orange-500/10 p-6 rounded-lg border border-orange-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-300/70 text-sm">Alta Prioridade</p>
              <p className="text-3xl font-bold text-orange-300 mt-1">{estatisticas.altas}</p>
            </div>
            <Clock className="w-8 h-8 text-orange-400" />
          </div>
        </div>

        <div className="bg-yellow-500/10 p-6 rounded-lg border border-yellow-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-300/70 text-sm">Média Prioridade</p>
              <p className="text-3xl font-bold text-yellow-300 mt-1">{estatisticas.medias}</p>
            </div>
            <Calendar className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Análise da IA */}
      {analiseIA && (
        <div className="bg-gradient-to-r from-sky-500/10 to-blue-500/10 p-6 rounded-lg border border-sky-500/20">
          <h3 className="text-lg font-bold text-white/90 flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-sky-400" />
            Análise da IA
          </h3>

          {analiseIA.resumo_geral && (
            <div className="mb-4">
              <p className="text-white/80 whitespace-pre-wrap">{analiseIA.resumo_geral}</p>
            </div>
          )}

          {analiseIA.estatisticas && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Total Analisado</p>
                <p className="text-2xl font-bold text-white/90">{analiseIA.estatisticas.total_alertas}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Casos Urgentes</p>
                <p className="text-2xl font-bold text-red-300">{analiseIA.estatisticas.urgentes}</p>
              </div>
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <p className="text-sm text-white/50">Dias Total</p>
                <p className="text-2xl font-bold text-blue-300">{analiseIA.estatisticas.dias_total_vencendo}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFiltroPrioridade('all')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filtroprioridade === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-[#12141f] text-white/80 hover:bg-white/5'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setFiltroPrioridade('urgente')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filtroprioridade === 'urgente'
              ? 'bg-red-600 text-white'
              : 'bg-[#12141f] text-white/80 hover:bg-white/5'
          }`}
        >
          Urgentes ({estatisticas.urgentes})
        </button>
        <button
          onClick={() => setFiltroPrioridade('alta')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filtroprioridade === 'alta'
              ? 'bg-orange-600 text-white'
              : 'bg-[#12141f] text-white/80 hover:bg-white/5'
          }`}
        >
          Alta ({estatisticas.altas})
        </button>
        <button
          onClick={() => setFiltroPrioridade('media')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            filtroprioridade === 'media'
              ? 'bg-yellow-600 text-white'
              : 'bg-[#12141f] text-white/80 hover:bg-white/5'
          }`}
        >
          Média ({estatisticas.medias})
        </button>
      </div>

      {/* Lista de Alertas */}
      <div className="space-y-4">
        {alertasFiltrados.length === 0 ? (
          <div className="bg-white/5 p-12 rounded-lg text-center border border-white/10">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white/90 mb-2">
              Nenhum alerta pendente!
            </h3>
            <p className="text-white/50">
              Todas as férias estão em dia ou não há alertas para exibir com o filtro selecionado.
            </p>
          </div>
        ) : (
          alertasFiltrados.map((alerta) => (
            <div
              key={alerta.id}
              className={`bg-[#12141f] p-6 rounded-lg shadow-sm border-l-4 ${
                alerta.prioridade === 'urgente' ? 'border-red-500' :
                alerta.prioridade === 'alta' ? 'border-orange-500' :
                alerta.prioridade === 'media' ? 'border-yellow-500' :
                'border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-2 ${getPrioridadeColor(alerta.prioridade)}`}>
                      {getPrioridadeIcon(alerta.prioridade)}
                      {alerta.prioridade.toUpperCase()}
                    </span>
                    <h3 className="text-lg font-bold text-white/90">{alerta.nome_completo}</h3>
                    <span className="text-sm text-white/50">({alerta.funcao_personalizada})</span>
                  </div>
                  <p className="text-white/80 mb-3">{alerta.mensagem}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                    <div>
                      <p className="text-white/50">Período Aquisitivo</p>
                      <p className="font-semibold text-white/90">
                        {dayjs(alerta.periodo_aquisitivo_inicio).format('DD/MM/YY')} - {dayjs(alerta.periodo_aquisitivo_fim).format('DD/MM/YY')}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50">Vencimento Gozo</p>
                      <p className="font-semibold text-white/90">
                        {dayjs(alerta.periodo_concessivo_fim).format('DD/MM/YYYY')}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/50">Dias Restantes</p>
                      <p className="font-semibold text-white/90">{alerta.dias_restantes} dias</p>
                    </div>
                    <div>
                      <p className="text-white/50">Dias até Vencimento</p>
                      <p className={`font-semibold ${
                        alerta.dias_ate_vencimento < 0 ? 'text-red-300' :
                        alerta.dias_ate_vencimento <= 30 ? 'text-orange-300' :
                        'text-white/90'
                      }`}>
                        {alerta.dias_ate_vencimento < 0
                          ? `Vencido há ${Math.abs(alerta.dias_ate_vencimento)} dias`
                          : `${alerta.dias_ate_vencimento} dias`
                        }
                      </p>
                    </div>
                  </div>

                  {alerta.analise_ia && (
                    <div className="mt-4 p-4 bg-sky-500/10 rounded-lg border border-sky-500/20">
                      <p className="text-sm font-semibold text-sky-300 mb-2 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Análise da IA
                      </p>
                      <div className="text-sm text-white/80 space-y-2">
                        {alerta.analise_ia.analise_completa?.situacao && (
                          <p><strong>Situação:</strong> {alerta.analise_ia.analise_completa.situacao}</p>
                        )}
                        {alerta.analise_ia.analise_completa?.observacoes && (
                          <p><strong>Observações:</strong> {alerta.analise_ia.analise_completa.observacoes}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => resolverAlerta(alerta.id)}
                    className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                    title="Marcar como resolvido"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MonitoramentoFeriasIA;
