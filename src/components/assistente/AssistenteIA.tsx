import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircleQuestion, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Markdown from './Markdown';

/**
 * O assistente de IA do sistema: o balão "Posso ajudar?" no canto de todas as
 * telas. Por enquanto responde sobre o estoque (função assistente-ia, que só
 * consulta o banco). Aparece para quem tem o módulo de estoque.
 */

interface Mensagem { role: 'user' | 'assistant'; texto: string; erro?: boolean }

const SUGESTOES = [
  'Qual foi a última vez que comprei chopp e por quanto o litro?',
  'Como variou o preço da Corona 600 nos últimos 3 meses?',
  'Quanto saiu de Old Parr do Central este mês?',
  'Quais itens mais faltaram nas contagens de outubro?',
];
const GUARDA = 'assistente-ia:conversa';

function lerConversa(): Mensagem[] {
  try { const s = sessionStorage.getItem(GUARDA); return s ? (JSON.parse(s) as Mensagem[]) : []; } catch { return []; }
}

const AssistenteIA: React.FC = () => {
  const { usuario, temAcessoModulo } = useAuth();
  const location = useLocation();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>(lerConversa);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { sessionStorage.setItem(GUARDA, JSON.stringify(mensagens.slice(-30))); } catch { /* sem armazenamento */ } }, [mensagens]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, pensando, aberto]);
  useEffect(() => { if (aberto) campo.current?.focus(); }, [aberto]);

  const pode = !!usuario && (usuario.nivel === 'master' || temAcessoModulo('estoque'));
  if (!pode) return null;

  const perguntar = async (pergunta: string) => {
    const p = pergunta.trim();
    if (!p || pensando) return;
    const conversa: Mensagem[] = [...mensagens, { role: 'user', texto: p }];
    setMensagens(conversa);
    setTexto('');
    setPensando(true);
    try {
      const historico = conversa.filter(m => !m.erro).map(({ role, texto: t }) => ({ role, texto: t }));
      const { data, error } = await supabase.functions.invoke('assistente-ia', { body: { mensagens: historico, tela: location.pathname } });
      if (error || !data?.ok) {
        let msg = data?.error as string | undefined;
        if (!msg && error && 'context' in error) { try { msg = (await (error as { context: Response }).context.json())?.error; } catch { /* sem corpo */ } }
        throw new Error(msg || 'Não consegui responder agora. Tente de novo em instantes.');
      }
      setMensagens(m => [...m, { role: 'assistant', texto: String(data.resposta) }]);
    } catch (e) {
      setMensagens(m => [...m, { role: 'assistant', texto: e instanceof Error ? e.message : 'Erro', erro: true }]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} aria-label="Abrir o assistente"
          className="fixed z-[60] flex items-center gap-2 focus-ring"
          style={{ right: 20, bottom: 20, padding: '12px 16px', borderRadius: 999, background: 'linear-gradient(135deg, var(--wine, #7a1f2b), #a33a3a)', color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontWeight: 700, fontSize: 14 }}>
          <MessageCircleQuestion size={20} /> Posso ajudar?
        </button>
      )}

      {aberto && (
        <div role="dialog" aria-label="Assistente" className="fixed z-[60] flex flex-col"
          style={{ right: 16, bottom: 16, width: 'min(420px, calc(100vw - 32px))', height: 'min(640px, calc(100vh - 32px))', background: 'var(--bg-elevated, #161b22)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <Sparkles size={18} style={{ color: 'var(--gold, #d4af37)' }} />
            <div className="flex-1 min-w-0">
              <p className="t-body" style={{ margin: 0, fontWeight: 700 }}>Assistente do Ditado</p>
              <p className="t-caption" style={{ margin: 0 }}>Pergunte sobre o estoque · só consulta, não lança nada</p>
            </div>
            {mensagens.length > 0 && (
              <button type="button" className="btn-icon" aria-label="Nova conversa" title="Nova conversa" onClick={() => setMensagens([])} disabled={pensando}><RotateCcw size={16} /></button>
            )}
            <button type="button" className="btn-icon" aria-label="Fechar" onClick={() => setAberto(false)}><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {mensagens.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="t-body" style={{ margin: 0 }}>Oi, {usuario?.nome_completo?.split(' ')[0] || 'tudo bem'}! Pergunte o que quiser sobre o estoque: compras, preços, fornecedores, saldos, transferências, contagens, perdas.</p>
                <p className="t-caption" style={{ margin: 0 }}>Por exemplo:</p>
                {SUGESTOES.map(s => (
                  <button key={s} type="button" onClick={() => void perguntar(s)} className="text-left t-body px-3 py-2 focus-ring"
                    style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>{s}</button>
                ))}
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'self-end' : 'self-start'} style={{ maxWidth: m.role === 'user' ? '85%' : '100%' }}>
                {m.role === 'user'
                  ? <div className="t-body px-3 py-2" style={{ background: 'var(--wine, #7a1f2b)', color: '#fff', borderRadius: '14px 14px 4px 14px', whiteSpace: 'pre-wrap' }}>{m.texto}</div>
                  : <div className="t-body px-3 py-2" style={{ background: m.erro ? 'rgba(229,72,77,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '14px 14px 14px 4px' }}><Markdown texto={m.texto} /></div>}
              </div>
            ))}
            {pensando && (
              <div className="self-start flex items-center gap-2 t-caption px-3 py-2"><Loader2 size={14} className="animate-spin" /> Consultando o estoque…</div>
            )}
            <div ref={fim} />
          </div>

          <form className="flex items-end gap-2 px-3 py-3" style={{ borderTop: '1px solid var(--border)' }} onSubmit={e => { e.preventDefault(); void perguntar(texto); }}>
            <textarea ref={campo} value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder="Escreva sua pergunta…" aria-label="Pergunta"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void perguntar(texto); } }}
              className="flex-1 t-body px-3 py-2 focus-ring" style={{ resize: 'none', maxHeight: 120, background: 'var(--bg-base, #0d1117)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)' }} />
            <button type="submit" className="btn-primary" aria-label="Enviar" disabled={pensando || !texto.trim()} style={{ height: 40, width: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default AssistenteIA;
