import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, PageHeader } from '../ui';
import { conversasApi, type ConversaResumo, type MensagemAgente } from './api';

interface Props { onVoltar: () => void }

const DIA = 24 * 3600 * 1000;

function hora(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return d.toLocaleString('pt-BR', mesmoDia ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** *negrito* e _itálico_ do WhatsApp, sem HTML cru. */
export function Formatado({ texto }: { texto: string }) {
  const pedacos = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return <>{pedacos.map((p, i) => {
    if (/^\*[^*\n]+\*$/.test(p)) return <b key={i}>{p.slice(1, -1)}</b>;
    if (/^_[^_\n]+_$/.test(p)) return <i key={i}>{p.slice(1, -1)}</i>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  })}</>;
}

function Midia({ m }: { m: MensagemAgente }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (m.midia_path && m.tipo !== 'audio') void conversasApi.foto(m.midia_path).then(u => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [m.midia_path, m.tipo]);
  if (!m.midia_path || m.tipo === 'audio') return null;
  if (!url) return <p className="t-caption" style={{ margin: '0 0 4px' }}>carregando arquivo…</p>;
  if (m.tipo === 'imagem') {
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto enviada" style={{ maxWidth: 240, maxHeight: 280, borderRadius: 8, display: 'block', marginBottom: 4 }} /></a>;
  }
  return <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 t-caption" style={{ marginBottom: 4 }}><FileText size={14} /> abrir arquivo</a>;
}

function Situacao({ m }: { m: MensagemAgente }) {
  if (m.direcao === 'entrada') return null;
  if (m.status === 'falha_envio') return <span style={{ color: 'var(--danger-text)' }} title={m.erro ?? ''}>não enviada</span>;
  if (m.status === 'aguardando_janela') return <span title="Fora das 24 h da Meta: sai quando a pessoa tocar em Ver">esperando a pessoa abrir</span>;
  if (m.status === 'pendente_envio' || m.status === 'enviando') return <span>na fila</span>;
  if (m.entrega === 'lida') return <span style={{ color: 'var(--info-text, #4fa3e0)' }}>✓✓ lida</span>;
  if (m.entrega === 'entregue') return <span>✓✓</span>;
  return <span>✓</span>;
}

function Balao({ m }: { m: MensagemAgente }) {
  const minha = m.direcao === 'saida';
  if (m.aviso) {
    return <div className="flex justify-center my-1"><span className="t-caption" style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.05))', padding: '4px 10px', borderRadius: 12 }}>{m.texto}</span></div>;
  }
  return (
    <div className={`flex ${minha ? 'justify-end' : 'justify-start'} my-1`}>
      <div style={{
        maxWidth: '85%', padding: '8px 10px', borderRadius: 10,
        background: minha ? 'rgba(122, 32, 52, 0.35)' : 'var(--bg-elevated, rgba(255,255,255,0.06))',
        border: '1px solid var(--border-subtle)',
      }}>
        {m.manual && <p className="t-caption" style={{ margin: '0 0 2px', fontWeight: 600 }}>✍️ {m.por ?? 'manual'}</p>}
        <Midia m={m} />
        {m.tipo === 'audio' && <p className="t-caption" style={{ margin: '0 0 2px' }}>🎤 áudio{m.texto ? ' (transcrito)' : ''}</p>}
        {m.texto && <p className="t-body" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><Formatado texto={m.texto} /></p>}
        {m.nota && <p className="t-caption" style={{ margin: '4px 0 0' }}>🧾 lida: {m.nota.fornecedor ?? '?'}{m.nota.numero ? ` nº ${m.nota.numero}` : ''}{m.nota.total ? ` · R$ ${m.nota.total}` : ''}</p>}
        <p className="t-caption flex gap-2 justify-end" style={{ margin: '4px 0 0', opacity: 0.8 }}>
          <span>{hora(m.criado_em)}</span><Situacao m={m} />
        </p>
      </div>
    </div>
  );
}

/**
 * O que a equipe conversa com o agente de estoque, como no celular. Admin e
 * master leem tudo e podem responder por cima do agente.
 */
const ConversasAgente: React.FC<Props> = ({ onVoltar }) => {
  const [lista, setLista] = useState<ConversaResumo[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<MensagemAgente[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const ultimoId = useRef<number | null>(null);

  const carregarLista = async () => {
    try { setLista(await conversasApi.lista()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  const carregarConversa = async (id: string) => {
    try {
      const m = await conversasApi.conversa(id);
      setMsgs(m);
      const novo = m.length ? m[m.length - 1].id : null;
      if (novo !== ultimoId.current) { ultimoId.current = novo; setTimeout(() => fim.current?.scrollIntoView({ block: 'end' }), 50); }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };

  useEffect(() => {
    void carregarLista();
    const iv = setInterval(() => void carregarLista(), 10000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!aberta) return;
    ultimoId.current = null;
    void carregarConversa(aberta);
    const iv = setInterval(() => void carregarConversa(aberta), 5000);
    return () => clearInterval(iv);
  }, [aberta]);

  const pessoa = lista?.find(p => p.id === aberta) ?? null;
  const janelaAte = pessoa?.ultima_entrada ? new Date(pessoa.ultima_entrada).getTime() + DIA : 0;
  const janelaAberta = janelaAte > Date.now();

  const enviar = async () => {
    if (!aberta || !texto.trim()) return;
    setEnviando(true); setErro(null);
    try {
      const r = await conversasApi.responder(aberta, texto.trim());
      setTexto('');
      if (r.status === 'falha_envio') setErro(`Não saiu: ${r.erro ?? 'erro da Meta'}`);
      await carregarConversa(aberta);
      void carregarLista();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao enviar'); }
    finally { setEnviando(false); }
  };

  const listaPainel = (
    <div className="flex flex-col" style={{ borderRight: '1px solid var(--border-subtle)' }}>
      {lista === null && <p className="t-body p-4" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {lista?.length === 0 && <EmptyState icon={MessageCircle} title="Nenhuma conversa" description="Quando a equipe falar com o agente, aparece aqui." />}
      {lista?.map(p => (
        <button key={p.id} type="button" onClick={() => setAberta(p.id)} className="text-left px-4 py-3 hover:bg-white/[0.04] focus-ring"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: p.id === aberta ? 'rgba(255,255,255,0.05)' : undefined }}>
          <div className="flex items-center gap-2">
            <span className="t-body flex-1 truncate" style={{ fontWeight: 600 }}>{p.nome}</span>
            {p.ultima_em && <span className="t-caption">{hora(p.ultima_em)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="t-caption flex-1 truncate">{p.ultima_direcao === 'saida' ? '↪ ' : ''}{p.ultima ?? p.papel}</span>
            {p.falhas > 0 && <Badge variant="danger">{p.falhas} falha</Badge>}
            {p.na_fila > 0 && <Badge variant="warning">{p.na_fila} na fila</Badge>}
          </div>
        </button>
      ))}
    </div>
  );

  const conversaPainel = pessoa && (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button type="button" className="md:hidden focus-ring" onClick={() => setAberta(null)} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <p className="t-body truncate" style={{ margin: 0, fontWeight: 600 }}>{pessoa.nome}</p>
          <p className="t-caption truncate" style={{ margin: 0 }}>{pessoa.papel}{pessoa.telefone ? ` · ${pessoa.telefone}` : ''}</p>
        </div>
        <Badge variant={janelaAberta ? 'success' : 'neutral'}>{janelaAberta ? `janela até ${hora(new Date(janelaAte).toISOString())}` : 'janela fechada'}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 300, maxHeight: '60vh' }}>
        {msgs.length === 0 && <p className="t-caption p-4">Sem mensagens.</p>}
        {msgs.map(m => <Balao key={m.id} m={m} />)}
        <div ref={fim} />
      </div>
      <div className="px-3 py-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {!janelaAberta && <p className="t-caption" style={{ margin: 0 }}>Fora das 24 h da Meta: sua mensagem fica esperando e a pessoa recebe um aviso para tocar em <b>Ver</b>.</p>}
        <div className="flex gap-2 items-end">
          <textarea className="input-dark flex-1" rows={2} placeholder="Responder como o agente…" value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
          <Button variante="primario" icone={<Send size={16} />} onClick={() => void enviar()} carregando={enviando} disabled={!texto.trim()}>Enviar</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Configuração']} title="Conversas do agente" subtitle="O que a equipe fala com o agente de estoque no WhatsApp."
        actions={<IconButton aria-label="Atualizar" onClick={() => { void carregarLista(); if (aberta) void carregarConversa(aberta); }}><RefreshCw size={16} /></IconButton>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="card grid md:grid-cols-[300px_1fr]" style={{ overflow: 'hidden' }}>
        <div className={aberta ? 'hidden md:block' : 'block'}>{listaPainel}</div>
        <div className={aberta ? 'block' : 'hidden md:block'}>
          {conversaPainel ?? <div className="p-8"><EmptyState icon={MessageCircle} title="Escolha uma conversa" description="Toque numa pessoa para ver o que ela conversou com o agente." /></div>}
        </div>
      </div>
    </div>
  );
};

export default ConversasAgente;
