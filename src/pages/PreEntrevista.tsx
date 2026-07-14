import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { SectionCard } from '../components/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PreEntrevista {
  id: string;
  candidatura_id: string;
  token: string;
  status: string;
  conversa: Message[];
  expira_em: string;
  candidatura: {
    vaga: {
      titulo: string;
      descricao: string;
      requisitos: string;
      cargo: {
        nome: string;
      };
    };
    candidato: {
      nome: string;
    };
  };
}

export default function PreEntrevista() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [preEntrevista, setPreEntrevista] = useState<PreEntrevista | null>(null);
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [inputMensagem, setInputMensagem] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      setErro('Token inválido');
      setLoading(false);
      return;
    }
    carregarPreEntrevista();
  }, [token]);

  useEffect(() => {
    scrollToBottom();
  }, [mensagens]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const carregarPreEntrevista = async () => {
    try {
      const { data, error } = await supabase
        .from('rh_pre_entrevistas')
        .select(`
          *,
          candidatura:rh_candidaturas(
            vaga:rh_vagas(
              titulo,
              descricao,
              requisitos,
              cargo:rh_cargos(nome)
            ),
            candidato:rh_candidatos(nome)
          )
        `)
        .eq('token', token)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setErro('Link de pré-entrevista inválido ou expirado');
        setLoading(false);
        return;
      }

      if (data.status === 'expirada') {
        setErro('Esta pré-entrevista expirou');
        setLoading(false);
        return;
      }

      if (data.status === 'concluida') {
        setErro('Esta pré-entrevista já foi concluída');
        setLoading(false);
        return;
      }

      setPreEntrevista(data);
      setMensagens(data.conversa || []);

      // Se está pendente, iniciar
      if (data.status === 'pendente') {
        await supabase
          .from('rh_pre_entrevistas')
          .update({
            status: 'em_andamento',
            iniciada_em: new Date().toISOString()
          })
          .eq('id', data.id);

        // Enviar mensagem de boas-vindas
        await enviarMensagemInicial(data);
      }

      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar pré-entrevista:', error);
      setErro('Erro ao carregar pré-entrevista');
      setLoading(false);
    }
  };

  const enviarMensagemInicial = async (data: PreEntrevista) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pre-entrevista-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            token,
            mensagem: 'Olá! Estou pronto para começar a pré-entrevista.',
            conversa_anterior: [],
            vaga_info: data.candidatura.vaga,
            cargo_info: data.candidatura.vaga.cargo
          }),
        }
      );

      if (!response.ok) throw new Error('Erro ao iniciar conversa');

      const { resposta } = await response.json();

      const novaMensagem: Message = {
        role: 'assistant',
        content: resposta,
        timestamp: new Date().toISOString()
      };

      const novaConversa = [novaMensagem];
      setMensagens(novaConversa);

      await supabase
        .from('rh_pre_entrevistas')
        .update({ conversa: novaConversa })
        .eq('id', data.id);
    } catch (error) {
      console.error('Erro ao enviar mensagem inicial:', error);
    }
  };

  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMensagem.trim() || !preEntrevista || enviando) return;

    setEnviando(true);

    try {
      const novaMensagemUsuario: Message = {
        role: 'user',
        content: inputMensagem,
        timestamp: new Date().toISOString()
      };

      const conversaAtualizada = [...mensagens, novaMensagemUsuario];
      setMensagens(conversaAtualizada);
      setInputMensagem('');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pre-entrevista-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            token,
            mensagem: inputMensagem,
            conversa_anterior: mensagens,
            vaga_info: preEntrevista.candidatura.vaga,
            cargo_info: preEntrevista.candidatura.vaga.cargo
          }),
        }
      );

      if (!response.ok) throw new Error('Erro ao enviar mensagem');

      const { resposta } = await response.json();

      const novaMensagemIA: Message = {
        role: 'assistant',
        content: resposta,
        timestamp: new Date().toISOString()
      };

      const conversaFinal = [...conversaAtualizada, novaMensagemIA];
      setMensagens(conversaFinal);

      await supabase
        .from('rh_pre_entrevistas')
        .update({ conversa: conversaFinal })
        .eq('id', preEntrevista.id);

    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  const finalizarEntrevista = async () => {
    if (!preEntrevista || !window.confirm('Deseja finalizar a pré-entrevista?')) return;

    try {
      await supabase
        .from('rh_pre_entrevistas')
        .update({
          status: 'concluida',
          concluida_em: new Date().toISOString()
        })
        .eq('id', preEntrevista.id);

      alert('Pré-entrevista finalizada com sucesso! Obrigado pela participação.');
      navigate('/');
    } catch (error) {
      console.error('Erro ao finalizar:', error);
      alert('Erro ao finalizar pré-entrevista');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-white/60">Carregando pré-entrevista...</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
        <div className="bg-[#12141f] rounded-lg p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Ops!</h2>
          <p className="text-white/60">{erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a]">
      <div className="max-w-4xl mx-auto p-4 h-screen flex flex-col">
        <div className="bg-[#12141f] rounded-t-lg p-6 border-b">
          <h1 className="text-2xl font-bold text-white mb-2">
            Pré-Entrevista - {preEntrevista?.candidatura.vaga.titulo}
          </h1>
          <p className="text-white/60">
            Olá, {preEntrevista?.candidatura.candidato.nome}! Responda algumas perguntas para conhecermos melhor você.
          </p>
        </div>

        <div className="bg-[#12141f] flex-1 overflow-y-auto p-6 shadow-xl">
          <div className="space-y-4">
            {mensagens.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#12141f]/10 text-white'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-xs opacity-70 mt-2 block">
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="bg-[#12141f] rounded-b-lg p-4 border-t">
          <form onSubmit={enviarMensagem} className="flex gap-2">
            <input
              type="text"
              value={inputMensagem}
              onChange={(e) => setInputMensagem(e.target.value)}
              placeholder="Digite sua resposta..."
              className="flex-1 px-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
              disabled={enviando}
            />
            <button
              type="submit"
              disabled={enviando || !inputMensagem.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {enviando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>

          {mensagens.length >= 10 && (
            <button
              onClick={finalizarEntrevista}
              className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              Finalizar Pré-Entrevista
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
