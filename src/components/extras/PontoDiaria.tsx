import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, Image as Foto, MessageCircle, PenLine, Undo2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, Button, Input, Modal, Textarea } from '../ui';
import { brl, num, type Diaria } from './shared';

/**
 * Ponto do extra (Kadu, 28/11/2026), para o Portal do Gerente e a tela de Extras.
 * A partir de CORTE_PONTO a diária só vale com chegada e saída pelo link (GPS + selfie) e confirmação do gerente
 * ou do Cristiano (fn_extra_confirmar). Marcar à mão exige motivo. A conta a pagar nasce na confirmação (banco).
 */
export const CORTE_PONTO = '2026-11-28';
export const usaPonto = (d: Pick<Diaria, 'data_trabalho'>) => d.data_trabalho >= CORTE_PONTO;

export interface Ponto {
  diaria_id: string;
  token: string;
  dispositivo_alerta: boolean;
  entrada_em: string | null; entrada_dist_m: number | null; entrada_selfie: string | null;
  saida_em: string | null; saida_dist_m: number | null;
  confirmado_em: string | null; confirmado_por: string | null; confirmado_modo: 'gps' | 'manual' | null; motivo: string | null;
  link_enviado_em: string | null;
}

export async function carregarPontos(ids: string[]): Promise<Record<string, Ponto>> {
  if (!ids.length) return {};
  const { data } = await supabase.from('extras_ponto').select('*').in('diaria_id', ids);
  return Object.fromEntries(((data || []) as Ponto[]).map(p => [p.diaria_id, p]));
}

const horaDe = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba' }) : '');
const zap = (tel: string | null | undefined) => {
  const n = (tel || '').replace(/\D/g, '');
  return n.length >= 10 ? (n.startsWith('55') ? n : `55${n}`) : '';
};

export const PontoDiaria: React.FC<{ diaria: Diaria; ponto?: Ponto; onMudou: () => Promise<void> | void }> = ({ diaria, ponto, onMudou }) => {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [janela, setJanela] = useState<null | 'confirmar' | 'manual'>(null);
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');

  const rodar = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setErro(null); setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) { setErro(error.message); return false; }
    await onMudou();
    return true;
  };

  const link = async (copiar: boolean) => {
    setErro(null);
    const { data, error } = await supabase.rpc('fn_extra_ponto_link', { p_diaria: diaria.id });
    if (error) { setErro(error.message); return; }
    const j = data as { token: string; nome: string; telefone: string | null; funcao: string; data: string; valor: number };
    const url = `${window.location.origin}/ponto/${j.token}`;
    const texto = `Olá, ${(j.nome || '').split(' ')[0]}! Sua diária no Ditado (${j.funcao}, ${j.data.split('-').reverse().join('/')}, ${brl(Number(j.valor))}).\n`
      + `Ao chegar, marque a chegada (selfie + localização) por este link; ao sair, marque a saída no mesmo link:\n${url}\n`
      + `Sem chegada e saída marcadas a diária não é paga.`;
    if (copiar || !zap(j.telefone)) {
      try { await navigator.clipboard.writeText(texto); setErro(zap(j.telefone) ? null : 'Sem telefone no cadastro: a mensagem foi copiada, cole no WhatsApp.'); }
      catch { window.prompt('Copie a mensagem:', texto); }
    } else {
      window.open(`https://wa.me/${zap(j.telefone)}?text=${encodeURIComponent(texto)}`, '_blank');
    }
    await onMudou();
  };

  const verSelfie = async () => {
    if (!ponto?.entrada_selfie) return;
    const { data, error } = await supabase.storage.from('extras-selfies').createSignedUrl(ponto.entrada_selfie, 600);
    if (error) setErro(error.message); else setSelfie(data.signedUrl);
  };

  const abrir = (tipo: 'confirmar' | 'manual') => { setValor(String(diaria.valor_diaria).replace('.', ',')); setMotivo(''); setErro(null); setJanela(tipo); };
  const confirmar = async () => {
    const v = num(valor);
    const ok = await rodar(async () => supabase.rpc('fn_extra_confirmar', {
      p_diaria: diaria.id, p_manual: janela === 'manual', p_motivo: motivo || null, p_valor: v > 0 ? v : null,
    }));
    if (ok) setJanela(null);
  };

  if (diaria.presenca === 'faltou') {
    return <div className="flex items-center gap-2"><Badge variant="danger">faltou</Badge>
      <Button tamanho="sm" variante="discreto" carregando={ocupado}
        onClick={() => rodar(async () => supabase.from('extras_freelancers').update({ presenca: 'prevista' }).eq('id', diaria.id))}>Desfazer</Button></div>;
  }

  const confirmada = diaria.presenca === 'confirmada';
  const valorMudou = Math.abs(num(valor) - Number(diaria.valor_diaria)) > 0.004;
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 240 }}>
      <p className="t-caption" style={{ margin: 0 }}>
        {ponto?.entrada_em ? <>Chegou {horaDe(ponto.entrada_em)} ({ponto.entrada_dist_m} m)</> : 'Sem chegada'}
        {' · '}
        {ponto?.saida_em ? <>saiu {horaDe(ponto.saida_em)} ({ponto.saida_dist_m} m)</> : 'sem saída'}
        {!ponto?.entrada_em && ponto?.link_enviado_em && ` · link enviado ${horaDe(ponto.link_enviado_em)}`}
      </p>
      {ponto?.dispositivo_alerta && <p className="t-caption" style={{ margin: 0, color: 'var(--danger, #b42318)' }}>
        <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> marcou por outro celular: confira a selfie</p>}
      {confirmada && <p className="t-caption" style={{ margin: 0 }}>
        <Badge variant={ponto?.confirmado_modo === 'manual' ? 'warning' : 'success'}>{ponto?.confirmado_modo === 'manual' ? 'confirmada à mão' : 'confirmada'}</Badge>
        {ponto?.confirmado_por && ` por ${ponto.confirmado_por.split(' ')[0]}`}{ponto?.motivo && ` · ${ponto.motivo}`}</p>}
      <div className="flex flex-wrap gap-1">
        {!confirmada && !ponto?.entrada_em && <>
          <Button tamanho="sm" variante="primario" icone={<MessageCircle size={14} />} onClick={() => link(false)}>Enviar link</Button>
          <Button tamanho="sm" variante="discreto" icone={<Copy size={14} />} onClick={() => link(true)}>Copiar</Button>
        </>}
        {ponto?.entrada_selfie && <Button tamanho="sm" variante="discreto" icone={<Foto size={14} />} onClick={verSelfie}>Selfie</Button>}
        {!confirmada && <>
          <Button tamanho="sm" variante={ponto?.entrada_em && ponto?.saida_em ? 'primario' : undefined} icone={<Check size={14} />}
            disabled={!ponto?.entrada_em || !ponto?.saida_em} title={!ponto?.saida_em ? 'Falta chegada e saída pelo link' : undefined}
            onClick={() => abrir('confirmar')}>Confirmar</Button>
          <Button tamanho="sm" variante="discreto" icone={<PenLine size={14} />} onClick={() => abrir('manual')}>À mão</Button>
          <Button tamanho="sm" variante="discreto" icone={<X size={14} />} carregando={ocupado}
            onClick={() => rodar(async () => supabase.from('extras_freelancers').update({ presenca: 'faltou' }).eq('id', diaria.id))}>Faltou</Button>
        </>}
        {confirmada && (diaria.valor_pago || 0) <= 0 && <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} carregando={ocupado}
          onClick={() => rodar(async () => supabase.rpc('fn_extra_desconfirmar', { p_diaria: diaria.id }))}>Desfazer</Button>}
      </div>
      {erro && <p className="t-caption" role="alert" style={{ margin: 0, color: 'var(--danger, #b42318)' }}>{erro}</p>}

      <Modal aberto={!!selfie} onFechar={() => setSelfie(null)} titulo="Selfie da chegada">
        {selfie && <img src={selfie} alt="Selfie da chegada" style={{ width: '100%', borderRadius: 8 }} />}
      </Modal>

      <Modal aberto={!!janela} onFechar={() => setJanela(null)} travado={ocupado}
        titulo={janela === 'manual' ? 'Marcar presença à mão' : 'Confirmar presença'}
        descricao={janela === 'manual' ? 'Use só quando o link falhou. O motivo fica registrado.' : 'Chegada e saída marcadas pelo link. Confira a selfie.'}
        rodape={<>
          <Button onClick={() => setJanela(null)} disabled={ocupado}>Cancelar</Button>
          <Button variante="primario" carregando={ocupado}
            disabled={(janela === 'manual' || valorMudou) && motivo.trim().length < 5} onClick={confirmar}>Confirmar</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Input rotulo="Valor da diária" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
            dica={valorMudou ? 'Valor diferente do lançado: escreva o motivo.' : undefined} />
          <Textarea rotulo={janela === 'manual' || valorMudou ? 'Motivo (obrigatório)' : 'Observação (opcional)'} value={motivo}
            onChange={e => setMotivo(e.target.value)} rows={2} />
          {erro && <p className="t-caption" role="alert" style={{ margin: 0, color: 'var(--danger, #b42318)' }}>{erro}</p>}
        </div>
      </Modal>
    </div>
  );
};
