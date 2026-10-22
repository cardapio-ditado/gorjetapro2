import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileCheck, KeyRound, Link2, LogOut, QrCode, RefreshCw } from 'lucide-react';
import { Badge, Button, IconButton, Input, PageHeader, SectionCard, type BadgeVariante } from '../ui';
import { conversasApi, whatsappApi, type MetaSituacao, type PonteTela, type StatusPonte } from './api';

interface Props { onVoltar: () => void }

const STATUS: Record<StatusPonte, { nome: string; cor: BadgeVariante }> = {
  conectado: { nome: 'Conectado', cor: 'success' },
  aguardando_leitura: { nome: 'Esperando leitura', cor: 'warning' },
  conectando: { nome: 'Conectando', cor: 'info' },
  iniciando: { nome: 'Conectando', cor: 'info' },
  caiu: { nome: 'Reconectando', cor: 'warning' },
  parada: { nome: 'Desconectado', cor: 'danger' },
  sem_sinal: { nome: 'Ponte sem sinal', cor: 'danger' },
};

function ha(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `${Math.floor(h / 24)} dias`;
}

function telefone(t: string | null): string {
  const d = (t ?? '').replace(/\D/g, '');
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return t ?? '';
}

function Item({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className="flex items-start gap-2 t-body" style={{ margin: '2px 0' }}>
    <span aria-hidden="true" style={{ color: ok ? 'var(--success-text, #3fb950)' : 'var(--text-secondary)' }}>{ok ? '✓' : '○'}</span>
    <span style={{ color: ok ? undefined : 'var(--text-secondary)' }}>{children}</span>
  </li>;
}

const NOME_MODELO: Record<string, string> = { APPROVED: 'aprovado', PENDING: 'em análise', REJECTED: 'recusado', PAUSED: 'pausado', DISABLED: 'desativado' };

/** WhatsApp oficial: o que falta, os IDs, o webhook, o modelo de aviso e o canal. */
const MetaCard: React.FC<{ onCanal: (c: 'ponte' | 'meta') => void }> = ({ onCanal }) => {
  const [s, setS] = useState<MetaSituacao | null>(null);
  const [ultimoWebhook, setUltimoWebhook] = useState<string | null>(null);
  const [phoneId, setPhoneId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = async () => {
    setErro(null);
    try {
      const [sit, cfg] = await Promise.all([conversasApi.metaSituacao(), conversasApi.metaConfig({})]);
      setS(sit); onCanal(sit.canal);
      setUltimoWebhook(typeof cfg.meta_ultimo_webhook === 'string' ? cfg.meta_ultimo_webhook : null);
      setPhoneId(sit.phone_number_id ?? ''); setWabaId(sit.waba_id ?? '');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const fazer = async (nome: string, f: () => Promise<unknown>, ok: string) => {
    setOcupado(nome); setErro(null); setAviso(null);
    try { await f(); setAviso(ok); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };

  const secretsOk = !!s && s.secrets.token && s.secrets.app_secret && s.secrets.verify_token;
  const idsOk = !!s?.phone_number_id && !!s?.waba_id;
  const numeroOk = !!s?.telefone && !s?.erro && s?.status_numero === 'CONNECTED';
  const modeloOk = s?.modelo?.status === 'APPROVED';
  const tudoPronto = secretsOk && idsOk && numeroOk && !!ultimoWebhook && modeloOk;

  return (
    <SectionCard title="WhatsApp oficial (Meta)" action={s && <Badge variant={s.canal === 'meta' ? 'success' : 'neutral'}>{s.canal === 'meta' ? 'em uso' : 'desligado'}</Badge>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!s && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {s && <div className="flex flex-col gap-4">
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          <Item ok={secretsOk}>Secrets no Supabase: META_WA_TOKEN {s.secrets.token ? '✓' : '✗'} · META_APP_SECRET {s.secrets.app_secret ? '✓' : '✗'} · META_VERIFY_TOKEN {s.secrets.verify_token ? '✓' : '✗'} · META_WA_PIN {s.secrets.pin ? '✓' : '✗'}</Item>
          <Item ok={idsOk}>IDs do telefone e da conta do WhatsApp</Item>
          <Item ok={numeroOk}>Número {s.telefone ? <b>{s.telefone}</b> : null}{s.nome ? ` · ${s.nome}` : ''}{s.nome_status ? ` (nome: ${s.nome_status})` : ''}{s.qualidade ? ` · qualidade ${s.qualidade}` : ''}{s.status_numero ? ` · ${s.status_numero === 'CONNECTED' ? 'registrado' : `${s.status_numero.toLowerCase()} (clique em Conectar webhook para registrar)`}` : ''}{s.erro ? ` · ${s.erro}` : ''}</Item>
          <Item ok={!!ultimoWebhook}>Webhook {ultimoWebhook ? `recebendo (último: ${new Date(ultimoWebhook).toLocaleString('pt-BR')})` : 'ainda sem mensagem da Meta'}</Item>
          <Item ok={modeloOk}>Modelo de aviso "aviso_estoque": {s.modelo ? NOME_MODELO[s.modelo.status] ?? s.modelo.status : 'não enviado'}</Item>
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <Input rotulo="ID do telefone (Phone number ID)" value={phoneId} onChange={e => setPhoneId(e.target.value)} inputMode="numeric" className="flex-1 min-w-[200px]" />
          <Input rotulo="ID da conta do WhatsApp (WABA ID)" value={wabaId} onChange={e => setWabaId(e.target.value)} inputMode="numeric" className="flex-1 min-w-[200px]" />
          <Button onClick={() => void fazer('ids', () => conversasApi.metaConfig({ phoneId, wabaId }), 'IDs salvos.')} carregando={ocupado === 'ids'} disabled={!!ocupado}>Salvar IDs</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button icone={<Link2 size={16} />} onClick={() => void fazer('webhook', () => conversasApi.metaConectar(), 'Número registrado e webhook conectado. Mande uma mensagem para o número para testar.')}
            carregando={ocupado === 'webhook'} disabled={!!ocupado || !secretsOk || !idsOk}>Conectar webhook</Button>
          {!modeloOk && <Button icone={<FileCheck size={16} />} onClick={() => void fazer('modelo', () => conversasApi.metaCriarModelo(), 'Modelo enviado para a Meta. A aprovação leva de minutos a 1 dia.')}
            carregando={ocupado === 'modelo'} disabled={!!ocupado || !secretsOk || !idsOk || !!s.modelo}>Enviar modelo para aprovação</Button>}
          {s.canal === 'ponte'
            ? <Button variante="primario" onClick={() => { if (window.confirm('Passar o agente para o WhatsApp oficial? A ponte antiga para de enviar.')) void fazer('canal', () => conversasApi.metaConfig({ canal: 'meta' }), 'Agente usando o WhatsApp oficial.'); }}
                carregando={ocupado === 'canal'} disabled={!!ocupado || !tudoPronto}>Usar o WhatsApp oficial</Button>
            : <Button variante="discreto" onClick={() => { if (window.confirm('Voltar para a ponte antiga?')) void fazer('canal', () => conversasApi.metaConfig({ canal: 'ponte' }), 'Agente de volta na ponte.'); }}
                carregando={ocupado === 'canal'} disabled={!!ocupado}>Voltar para a ponte</Button>}
          <IconButton aria-label="Atualizar" onClick={() => void carregar()}><RefreshCw size={16} /></IconButton>
        </div>
        {s.canal === 'ponte' && !tudoPronto && <p className="t-caption" style={{ margin: 0 }}>O botão "Usar o WhatsApp oficial" libera quando todos os itens acima estiverem marcados.</p>}
      </div>}
    </SectionCard>
  );
};

/**
 * Conexão do chip do agente de estoque. A ponte na VPS manda como está a cada
 * 5 s e pega o comando deixado aqui. O QR liga o WhatsApp em outro aparelho:
 * só admin e master entram.
 */
const WhatsappEstoque: React.FC<Props> = ({ onVoltar }) => {
  const [tela, setTela] = useState<PonteTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [canal, setCanal] = useState<'ponte' | 'meta' | null>(null);
  const vivo = useRef(true);

  const carregar = async () => {
    try {
      const t = await whatsappApi.tela();
      if (vivo.current) { setTela(t); setErro(null); }
    } catch (e) { if (vivo.current) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => {
    vivo.current = true;
    void carregar();
    const iv = setInterval(() => void carregar(), 4000);
    return () => { vivo.current = false; clearInterval(iv); };
  }, []);

  const mandar = async (comando: 'reconectar' | 'desconectar' | 'codigo') => {
    if (comando === 'desconectar' && !window.confirm('Desconectar o WhatsApp do estoque? O agente para de responder até alguém parear de novo.')) return;
    setOcupado(comando); setErro(null); setAviso(null);
    try {
      await whatsappApi.comando(comando, comando === 'codigo' ? numero : undefined);
      setAviso('Comando enviado. A ponte pega em até 5 segundos.');
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };

  const st = tela ? STATUS[tela.status] ?? { nome: tela.status, cor: 'neutral' as BadgeVariante } : null;
  const semSinal = tela?.status === 'sem_sinal';
  const conectado = tela?.status === 'conectado';
  const lendo = tela?.status === 'aguardando_leitura';

  return (
    <div className="max-w-3xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Configuração']} title="WhatsApp do estoque" subtitle="O chip que conversa com a equipe e manda o relatório das 7h."
        actions={<IconButton aria-label="Atualizar" onClick={() => void carregar()}><RefreshCw size={16} /></IconButton>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      <div className="mb-4"><MetaCard onCanal={setCanal} /></div>
      {canal === 'meta' && <p className="t-caption">A ponte antiga (QR e VPS) não é mais usada com o WhatsApp oficial ligado.</p>}
      {tela && st && canal !== 'meta' && <div className="flex flex-col gap-4">
        <SectionCard title="Situação" action={<Badge variant={st.cor}>{st.nome}</Badge>}>
          <div className="flex flex-col gap-1">
            {conectado && <p className="t-body" style={{ margin: 0 }}>Conectado como <b>{telefone(tela.telefone)}</b>.</p>}
            {!conectado && tela.fora_desde && <p className="t-body texto-atencao" style={{ margin: 0 }}>Fora do ar há {ha(tela.fora_desde)}.</p>}
            {!conectado && tela.telefone && <p className="t-caption" style={{ margin: 0 }}>Último número conectado: {telefone(tela.telefone)}</p>}
            {tela.detalhe && !semSinal && <p className="t-caption" style={{ margin: 0 }}>{tela.detalhe}</p>}
            {tela.comando && <p className="t-caption" style={{ margin: 0 }}>Comando "{tela.comando}" esperando a ponte pegar…</p>}
            <p className="t-caption" style={{ margin: 0 }}>Último sinal da ponte: {tela.sinal_em ? `há ${ha(tela.sinal_em)}` : 'nunca'}{tela.versao ? ` · versão ${tela.versao}` : ''}</p>
          </div>
          {semSinal && <div className="aviso aviso-perigo mt-3">
            A ponte na VPS não responde. Os botões só funcionam com ela no ar. No terminal da VPS: <code>systemctl restart ponte-estoque</code>.
            Se for a primeira vez com esta versão, rode o instalador de novo.
          </div>}
        </SectionCard>

        {lendo && tela.qr && <SectionCard title="Leia o QR" descricao="No celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho.">
          <div className="flex flex-col items-center gap-2">
            <img src={tela.qr} alt="QR para conectar o WhatsApp do estoque" width={280} height={280} style={{ background: '#fff', padding: 8, borderRadius: 8, imageRendering: 'pixelated' }} />
            <p className="t-caption" style={{ margin: 0 }}>O QR troca sozinho a cada 20 segundos. Se estiver no celular do chip, use o código.</p>
          </div>
        </SectionCard>}

        {lendo && tela.codigo && <SectionCard title="Digite o código" descricao='No celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho → "Conectar com número de telefone".'>
          <p className="text-center" style={{ fontSize: 36, fontWeight: 700, letterSpacing: 4, margin: '8px 0', fontFamily: 'monospace' }}>{tela.codigo}</p>
          <p className="t-caption text-center" style={{ margin: 0 }}>Vale por pouco tempo. Se expirar, toque em Gerar código de novo.</p>
        </SectionCard>}

        {!semSinal && <SectionCard title={conectado ? 'Conexão' : 'Conectar'}>
          {conectado ? <div className="flex flex-wrap gap-2">
            <Button icone={<RefreshCw size={16} />} onClick={() => void mandar('reconectar')} carregando={ocupado === 'reconectar'} disabled={!!ocupado}>Reconectar</Button>
            <Button variante="perigo" icone={<LogOut size={16} />} onClick={() => void mandar('desconectar')} carregando={ocupado === 'desconectar'} disabled={!!ocupado}>Desconectar</Button>
          </div> : <div className="flex flex-col gap-4">
            <div>
              <Button variante="primario" icone={<QrCode size={16} />} onClick={() => void mandar('reconectar')} carregando={ocupado === 'reconectar'} disabled={!!ocupado}>Gerar QR</Button>
              <p className="t-caption" style={{ margin: '4px 0 0' }}>Para ler com a câmera do celular do chip, com esta tela aberta em outro aparelho.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Input rotulo="Número do chip" placeholder="65 99999-9999" inputMode="tel" value={numero} onChange={e => setNumero(e.target.value)} className="flex-1 min-w-[180px]" />
              <Button icone={<KeyRound size={16} />} onClick={() => void mandar('codigo')} carregando={ocupado === 'codigo'} disabled={!!ocupado || numero.replace(/\D/g, '').length < 10}>Gerar código</Button>
            </div>
            <p className="t-caption" style={{ margin: 0 }}>Com o código dá para parear no próprio celular do chip, sem câmera.</p>
          </div>}
        </SectionCard>}

        <SectionCard title="Fila de envio">
          <div className="flex flex-col gap-1">
            <p className="t-body" style={{ margin: 0 }}>
              {tela.fila.pendentes ? <><b>{tela.fila.pendentes}</b> mensagem(ns) esperando{tela.fila.mais_antiga ? `, a mais antiga de ${ha(tela.fila.mais_antiga)} atrás` : ''}.</> : 'Nada esperando para enviar.'}
            </p>
            {tela.fila.falhas_24h > 0 && <p className="t-caption texto-atencao" style={{ margin: 0 }}>{tela.fila.falhas_24h} falharam nas últimas 24 h, depois de 4 tentativas.</p>}
            <p className="t-caption" style={{ margin: 0 }}>Mensagem que falha volta para a fila e é tentada de novo, uma vez por minuto, até 4 vezes.</p>
          </div>
        </SectionCard>
      </div>}
    </div>
  );
};

export default WhatsappEstoque;
