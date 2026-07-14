import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, X, CheckCircle, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSolicitacaoIAProps {
  onSolicitacaoPreenchida: (dados: any) => void;
  onClose: () => void;
}

export const ChatSolicitacaoIA: React.FC<ChatSolicitacaoIAProps> = ({
  onSolicitacaoPreenchida,
  onClose
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Vou ajudar você a criar uma solicitação. Pode me dizer o que você precisa?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dadosParciais, setDadosParciais] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage }
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-solicitacao-ia`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: newMessages,
            dados_parciais: dadosParciais
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao processar mensagem');
      }

      const result = await response.json();

      setMessages([
        ...newMessages,
        { role: 'assistant', content: result.mensagem }
      ]);

      if (result.dados) {
        setDadosParciais(result.dados);
      }

      if (result.status === 'pronto' && result.dados) {
        setTimeout(() => {
          onSolicitacaoPreenchida(result.dados);
        }, 1000);
      }
    } catch (error) {
      console.error('Erro:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Pode tentar novamente?'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col h-[600px] border border-white/10">
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Assistente de Solicitações</h3>
              <p className="text-sm text-blue-100">Powered by IA</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/5">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-white/90 shadow-sm border border-white/10'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold text-blue-400">IA</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#1a1d2e] rounded-2xl px-4 py-3 shadow-sm border border-white/10">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span className="text-sm text-white/70">Processando...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {dadosParciais && (
          <div className="px-4 py-2 bg-blue-500/10 border-t border-blue-100">
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <CheckCircle className="w-4 h-4" />
              <span>Informações coletadas: {Object.keys(dadosParciais).length} campos</span>
            </div>
          </div>
        )}

        <div className="p-4 border-t bg-white rounded-b-xl">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem..."
              disabled={loading}
              className="flex-1 px-4 py-3 border border-white/20 bg-white/5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-white/10"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span className="font-medium">Enviar</span>
            </button>
          </div>
          <p className="text-xs text-white/50 mt-2">
            Pressione Enter para enviar • Shift + Enter para nova linha
          </p>
        </div>
      </div>
    </div>
  );
};
