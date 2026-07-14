import React, { useState, useEffect } from 'react';
import { MessageSquare, Clock, CheckCircle, XCircle, Calendar, Brain, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PreEntrevistaViewProps {
  candidatura_id: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PreEntrevista {
  id: string;
  status: string;
  conversa: Message[];
  pontuacao?: number;
  recomendacao?: string;
  analise_ia?: any;
  iniciada_em?: string;
  concluida_em?: string;
}

export default function PreEntrevistaView({ candidatura_id }: PreEntrevistaViewProps) {
  const [preEntrevista, setPreEntrevista] = useState<PreEntrevista | null>(null);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);

  useEffect(() => {
    carregarPreEntrevista();
  }, [candidatura_id]);

  const carregarPreEntrevista = async () => {
    try {
      const { data, error } = await supabase
        .from('rh_pre_entrevistas')
        .select('*')
        .eq('candidatura_id', candidatura_id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setPreEntrevista(data);
    } catch (error) {
      console.error('Erro ao carregar pré-entrevista:', error);
    } finally {
      setLoading(false);
    }
  };

  const analisarConversa = async () => {
    if (!preEntrevista || !preEntrevista.conversa || preEntrevista.conversa.length === 0) {
      alert('Não há conversa para analisar');
      return;
    }

    try {
      setAnalisando(true);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-pre-entrevista`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pre_entrevista_id: preEntrevista.id,
            conversa: preEntrevista.conversa
          })
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao analisar conversa');
      }

      const result = await response.json();

      // Atualizar o estado local
      setPreEntrevista({
        ...preEntrevista,
        analise_ia: result.analise,
        pontuacao: result.pontuacao,
        recomendacao: result.recomendacao
      });

      alert('Análise concluída com sucesso!');
    } catch (error) {
      console.error('Erro ao analisar conversa:', error);
      alert('Erro ao analisar conversa');
    } finally {
      setAnalisando(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <p className="text-white/50">Carregando pré-entrevista...</p>
      </div>
    );
  }

  if (!preEntrevista) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
        <MessageSquare className="w-12 h-12 text-white/30 mx-auto mb-3" />
        <p className="text-white/50">Nenhuma pré-entrevista realizada ainda</p>
        <p className="text-sm text-white/40 mt-2">
          Clique em "Pré-Entrevista" para gerar o link e enviar ao candidato
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; label: string; icon: any }> = {
      pendente: { color: 'bg-white/10 text-white/90', label: 'Pendente', icon: Clock },
      em_andamento: { color: 'bg-blue-900/30 text-blue-300', label: 'Em Andamento', icon: MessageSquare },
      concluida: { color: 'bg-green-900/30 text-green-300', label: 'Concluída', icon: CheckCircle },
      expirada: { color: 'bg-red-900/30 text-red-300', label: 'Expirada', icon: XCircle }
    };
    const badge = badges[status] || badges.pendente;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        <Icon className="w-4 h-4" />
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h5 className="font-medium text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Pré-Entrevista com IA
        </h5>
        {getStatusBadge(preEntrevista.status)}
      </div>

      {preEntrevista.iniciada_em && (
        <div className="flex items-center gap-2 text-sm text-white/50">
          <Calendar className="w-4 h-4" />
          Iniciada em: {new Date(preEntrevista.iniciada_em).toLocaleString('pt-BR')}
        </div>
      )}

      {preEntrevista.concluida_em && (
        <div className="flex items-center gap-2 text-sm text-white/50">
          <CheckCircle className="w-4 h-4" />
          Concluída em: {new Date(preEntrevista.concluida_em).toLocaleString('pt-BR')}
        </div>
      )}

      {preEntrevista.pontuacao && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white/80">Pontuação da Pré-Entrevista</span>
            <span className="text-lg font-bold text-blue-600">{preEntrevista.pontuacao}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${preEntrevista.pontuacao}%` }}
            />
          </div>
        </div>
      )}

      {preEntrevista.recomendacao && (
        <div className="bg-blue-500/10 border border-blue-200 rounded-lg p-3">
          <p className="text-sm font-medium text-blue-300 mb-1">Recomendação</p>
          <p className="text-sm text-blue-300 capitalize">{preEntrevista.recomendacao}</p>
        </div>
      )}

      {preEntrevista.conversa && preEntrevista.conversa.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white/80">
              Conversa ({preEntrevista.conversa.length} mensagens)
            </p>
            {preEntrevista.status === 'concluida' && (
              <button
                onClick={analisarConversa}
                disabled={analisando}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {analisando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Analisar com IA
                  </>
                )}
              </button>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3">
            {preEntrevista.conversa.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#12141f] border border-white/20 text-white'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {preEntrevista.analise_ia && (
        <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-6 h-6 text-purple-400" />
            <h6 className="text-lg font-semibold text-purple-300">Análise Detalhada da IA</h6>
          </div>

          {preEntrevista.analise_ia.pontos_fortes && preEntrevista.analise_ia.pontos_fortes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h6 className="font-semibold text-green-300">Pontos Fortes</h6>
              </div>
              <ul className="space-y-2">
                {preEntrevista.analise_ia.pontos_fortes.map((ponto: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-white/90">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>{ponto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preEntrevista.analise_ia.pontos_fracos && preEntrevista.analise_ia.pontos_fracos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-orange-400" />
                <h6 className="font-semibold text-orange-300">Pontos de Atenção</h6>
              </div>
              <ul className="space-y-2">
                {preEntrevista.analise_ia.pontos_fracos.map((ponto: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-white/90">
                    <XCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    <span>{ponto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preEntrevista.analise_ia.resumo && (
            <div className="bg-[#12141f] rounded-lg p-4 border border-purple-200">
              <h6 className="font-semibold text-white mb-2">Resumo Geral</h6>
              <p className="text-sm text-white/90 leading-relaxed">{preEntrevista.analise_ia.resumo}</p>
            </div>
          )}

          {preEntrevista.analise_ia.sugestoes && preEntrevista.analise_ia.sugestoes.length > 0 && (
            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-200">
              <h6 className="font-semibold text-blue-300 mb-2">Sugestões para Próxima Etapa</h6>
              <ul className="space-y-1">
                {preEntrevista.analise_ia.sugestoes.map((sugestao: string, idx: number) => (
                  <li key={idx} className="text-sm text-blue-300">• {sugestao}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
