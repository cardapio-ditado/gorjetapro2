import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Loader2, Bot, User, Sparkles, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Mensagem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  acao?: any;
  timestamp: Date;
}

interface ChatFinanceiroIAProps {
  onClose?: () => void;
}

const ChatFinanceiroIA: React.FC<ChatFinanceiroIAProps> = ({ onClose }) => {
  const { usuario } = useAuth();
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Olá! Sou seu assistente financeiro. Posso ajudar você a:\n\n✅ Lançar contas a pagar\n✅ Consultar contas pendentes\n✅ Ver resumo financeiro\n\nComo posso ajudar você hoje?',
      timestamp: new Date()
    }
  ]);
  const [inputMensagem, setInputMensagem] = useState('');
  const [loading, setLoading] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[]>([
    'Quanto tenho a pagar essa semana?',
    'Lançar conta de R$ 1000',
    'Me mostre o resumo financeiro'
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [mensagens]);

  useEffect(() => {
    if (!usuario) {
      console.warn('Usuário não autenticado no chat IA');
      const avisoMensagem: Mensagem = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '⚠️ Você precisa estar logado para usar o chat. Por favor, faça login e tente novamente.',
        timestamp: new Date()
      };
      setMensagens([avisoMensagem]);
    } else {
      console.log('Usuário autenticado no chat IA:', usuario.id);
    }
  }, [usuario]);

  const enviarMensagem = async (texto?: string) => {
    const mensagemTexto = texto || inputMensagem.trim();
    if (!mensagemTexto || loading) return;

    const novaMensagemUsuario: Mensagem = {
      id: Date.now().toString(),
      role: 'user',
      content: mensagemTexto,
      timestamp: new Date()
    };

    setMensagens(prev => [...prev, novaMensagemUsuario]);
    setInputMensagem('');
    setLoading(true);

    try {
      if (!usuario) {
        throw new Error('Você precisa estar logado para usar o chat');
      }

      console.log('Enviando mensagem para o chat IA...');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-financeiro-ia`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const contexto = mensagens.slice(-5).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

      let authToken = anonKey;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authToken = session.access_token;
          console.log('Usando token de sessão real');
        } else {
          console.log('Usando anon key (desenvolvimento)');
        }
      } catch (err) {
        console.warn('Erro ao obter sessão, usando anon key:', err);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'apikey': anonKey
        },
        body: JSON.stringify({
          mensagem: mensagemTexto,
          contexto,
          usuario_id: usuario.id
        })
      });

      const resultado = await response.json();

      console.log('📦 RESPOSTA DA API:');
      console.log('  Status:', response.status);
      console.log('  Sucesso:', resultado.sucesso);
      console.log('  Resposta:', resultado.resposta?.substring(0, 200));
      console.log('  Ação:', resultado.acao);
      console.log('  Sugestões:', resultado.sugestoes);

      if (!response.ok || !resultado.sucesso) {
        console.error('❌ Erro da API:', resultado);
        throw new Error(resultado.erro || 'Erro ao processar mensagem');
      }

      const respostaIA: Mensagem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: resultado.resposta,
        acao: resultado.acao,
        timestamp: new Date()
      };

      setMensagens(prev => [...prev, respostaIA]);

      if (resultado.sugestoes && resultado.sugestoes.length > 0) {
        setSugestoes(resultado.sugestoes);
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
      const erroMensagem: Mensagem = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Desculpe, ocorreu um erro: ${mensagemErro}\n\nPor favor, tente novamente ou reformule sua pergunta.`,
        timestamp: new Date()
      };
      setMensagens(prev => [...prev, erroMensagem]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  };

  const limparConversa = () => {
    setMensagens([
      {
        id: '1',
        role: 'assistant',
        content: 'Conversa limpa! Como posso ajudar você?',
        timestamp: new Date()
      }
    ]);
    setSugestoes([
      'Quanto tenho a pagar essa semana?',
      'Lançar conta de R$ 1000',
      'Me mostre o resumo financeiro'
    ]);
  };

  return (
    <div className="flex flex-col h-[600px] bg-[#12141f] rounded-lg shadow-lg border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              Assistente Financeiro
              <Sparkles className="w-4 h-4" />
            </h3>
            <p className="text-xs text-white/80">Powered by IA</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={limparConversa}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Limpar conversa"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
            }`}>
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
              <div className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 text-white/90'
              }`}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                {msg.acao && (
                  <div className="mt-2 pt-2 border-t border-white/20">
                    <p className="text-xs opacity-75">
                      Ação executada: {msg.acao.tipo}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                <span className="text-sm text-white/50">Pensando...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Sugestões */}
      {sugestoes.length > 0 && !loading && (
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-xs text-white/50 mb-2">Sugestões:</p>
          <div className="flex flex-wrap gap-2">
            {sugestoes.map((sugestao, index) => (
              <button
                key={index}
                onClick={() => enviarMensagem(sugestao)}
                className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white/80 rounded-full transition-colors"
              >
                {sugestao}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-white/5">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMensagem}
            onChange={(e) => setInputMensagem(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-3 border border-white/20 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <button
            onClick={() => enviarMensagem()}
            disabled={!inputMensagem.trim() || loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatFinanceiroIA;
