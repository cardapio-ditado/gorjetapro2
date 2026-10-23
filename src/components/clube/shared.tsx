import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Check, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, Button, Input, Modal, Segmented, Textarea, type BadgeVariante } from '../ui';

/**
 * Peças do Clube do Whisky usadas na tela do Clube e no Portal do Gerente.
 * A garrafa é do cliente e fica guardada no bar por 6 meses; vencida, fica
 * para a casa. O quanto resta é no olho (cheia, 3/4, 1/2, 1/4).
 */

export type Nivel = 'cheia' | '3/4' | '1/2' | '1/4' | 'acabou';
export const NIVEIS: { valor: Nivel; rotulo: string }[] = [
  { valor: 'cheia', rotulo: 'Cheia' }, { valor: '3/4', rotulo: '3/4' }, { valor: '1/2', rotulo: 'Metade' },
  { valor: '1/4', rotulo: '1/4' }, { valor: 'acabou', rotulo: 'Acabou' },
];
export const rotuloNivel = (n: Nivel) => NIVEIS.find(x => x.valor === n)?.rotulo || n;

export interface Garrafa {
  id: string; cpf: string | null; nome: string; telefone: string | null; item_id: string | null; garrafa_nome: string;
  etiqueta: string | null; data_compra: string; validade: string; nivel: Nivel; status: 'ativa' | 'finalizada' | 'cancelada';
  aceita_whatsapp: boolean; observacoes: string | null; criado_por_nome: string | null; criado_em: string;
}

export type Situacao = 'ativa' | 'vence_30' | 'vence_7' | 'vencida' | 'finalizada' | 'cancelada';
export const SITUACAO: Record<Situacao, { rotulo: string; variante: BadgeVariante }> = {
  ativa: { rotulo: 'Ativa', variante: 'success' },
  vence_30: { rotulo: 'Vence em 30 dias', variante: 'warning' },
  vence_7: { rotulo: 'Vence em 7 dias', variante: 'danger' },
  vencida: { rotulo: 'Vencida', variante: 'neutral' },
  finalizada: { rotulo: 'Acabou', variante: 'neutral' },
  cancelada: { rotulo: 'Encerrada', variante: 'neutral' },
};

export const diasPara = (data: string) => dayjs(data).startOf('day').diff(dayjs().startOf('day'), 'day');
export function situacao(g: Garrafa): Situacao {
  if (g.status === 'cancelada') return 'cancelada';
  if (g.status === 'finalizada') return 'finalizada';
  const d = diasPara(g.validade);
  if (d < 0) return 'vencida';
  if (d <= 7) return 'vence_7';
  if (d <= 30) return 'vence_30';
  return 'ativa';
}
export const dataBR = (s: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—');
export const cpfFmt = (c: string | null) => {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c || '';
};
export const nomeGarrafa = (s: string) =>
  s.replace(/\s+GF\b/i, '').replace(/\s{2,}/g, ' ').trim().toLowerCase().replace(/(^|\s|\()\S/g, x => x.toUpperCase());
export const temTelefone = (c: string | null | undefined) => (c || '').replace(/\D/g, '').length >= 10;

/** Abre a conversa no WhatsApp com a mensagem pronta (envio manual pela equipe). */
export function urlZap(g: Garrafa): string {
  let tel = (g.telefone || '').replace(/\D/g, '');
  if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
  const dias = diasPara(g.validade);
  const prazo = dias < 0 ? `venceu em ${dataBR(g.validade)}` : dias === 0 ? 'vence hoje' : `vence em ${dias} dia${dias === 1 ? '' : 's'}, no dia ${dataBR(g.validade)}`;
  const texto = `Olá, ${g.nome.split(' ')[0]}! Sua garrafa de ${nomeGarrafa(g.garrafa_nome)} guardada no Clube do Whisky do Ditado Popular ${prazo}. Depois dessa data a garrafa fica para a casa. Esperamos você! 🥃`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

export const SELECT_GARRAFA = '*';

export const BadgeSituacao: React.FC<{ g: Garrafa }> = ({ g }) => {
  const s = SITUACAO[situacao(g)];
  return <Badge variant={s.variante}>{s.rotulo}</Badge>;
};

/** Botões de nível: o gerente toca no quanto restou depois de servir. */
export const MudarNivel: React.FC<{ g: Garrafa; onMudou: (m: string) => void | Promise<void>; onErro: (m: string) => void }> = ({ g, onMudou, onErro }) => {
  const [ocupado, setOcupado] = useState(false);
  const mudar = async (n: Nivel) => {
    if (n === g.nivel) return;
    if (n === 'acabou' && !window.confirm(`Marcar a garrafa de ${nomeGarrafa(g.garrafa_nome)} de ${g.nome} como acabou?`)) return;
    setOcupado(true);
    const { error } = await supabase.from('clube_whisky_garrafas').update({ nivel: n }).eq('id', g.id);
    setOcupado(false);
    if (error) { onErro(error.message); return; }
    await onMudou(`${g.nome}: ${nomeGarrafa(g.garrafa_nome)} agora ${rotuloNivel(n).toLowerCase()}.`);
  };
  return (
    <div style={{ opacity: ocupado ? 0.6 : 1, pointerEvents: ocupado ? 'none' : undefined }}>
      <Segmented<Nivel> rotulo="Quanto resta" valor={g.nivel} onMudar={mudar} opcoes={NIVEIS} />
    </div>
  );
};

interface ItemGarrafa { id: string; nome: string }

/**
 * Cadastro de garrafa nova. O CPF busca nome e telefone na Fidelidade; a
 * validade é a compra + 6 meses (pode mudar).
 */
export const NovaGarrafa: React.FC<{ inicial?: Partial<Garrafa>; onFechar: () => void; onFeito: (m: string) => void | Promise<void> }> = ({ inicial, onFechar, onFeito }) => {
  const [cpf, setCpf] = useState(cpfFmt(inicial?.cpf || ''));
  const [nome, setNome] = useState(inicial?.nome || '');
  const [telefone, setTelefone] = useState(inicial?.telefone || '');
  const [garrafa, setGarrafa] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [compra, setCompra] = useState(dayjs().format('YYYY-MM-DD'));
  const [validade, setValidade] = useState(dayjs().add(6, 'month').format('YYYY-MM-DD'));
  const [aceita, setAceita] = useState(true);
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<ItemGarrafa[]>([]);
  const [achou, setAchou] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.from('itens_estoque').select('id, nome').eq('status', 'ativo').eq('categoria', 'Bebidas Alcoólicas').ilike('nome', '%GF%').order('nome')
      .then(({ data }) => setItens((data || []) as ItemGarrafa[]));
  }, []);
  useEffect(() => { setValidade(dayjs(compra).add(6, 'month').format('YYYY-MM-DD')); }, [compra]);

  const buscarCpf = async () => {
    const d = cpf.replace(/\D/g, '');
    if (d.length !== 11) return;
    const { data } = await supabase.rpc('fn_clube_whisky_cliente', { p_cpf: d });
    const c = data as { nome: string | null; telefone: string | null; visitas: number | null } | null;
    if (!c) { setAchou('CPF não está na Fidelidade: preencha nome e telefone.'); return; }
    if (!nome && c.nome) setNome(c.nome);
    if (!telefone && c.telefone) setTelefone(c.telefone);
    setAchou(`Achado na Fidelidade${c.visitas ? ` · ${c.visitas} visitas` : ''}.`);
  };

  const itemEscolhido = useMemo(() => itens.find(i => i.nome.toLowerCase() === garrafa.trim().toLowerCase()), [itens, garrafa]);

  const salvar = async () => {
    const d = cpf.replace(/\D/g, '');
    if (d && d.length !== 11) { setErro('CPF incompleto.'); return; }
    if (!nome.trim()) { setErro('Falta o nome do cliente.'); return; }
    if (!garrafa.trim()) { setErro('Qual é a garrafa?'); return; }
    if (aceita && !temTelefone(telefone)) { setErro('Para avisar no WhatsApp precisa do telefone com DDD.'); return; }
    setOcupado(true); setErro(null);
    const { error } = await supabase.from('clube_whisky_garrafas').insert({
      cpf: d || null, nome: nome.trim(), telefone: telefone.trim() || null, item_id: itemEscolhido?.id || null,
      garrafa_nome: itemEscolhido?.nome || garrafa.trim(), etiqueta: etiqueta.trim() || null,
      data_compra: compra, validade, aceita_whatsapp: aceita, observacoes: obs.trim() || null,
    });
    if (error) { setErro(error.message); setOcupado(false); return; }
    await onFeito(`Garrafa de ${nomeGarrafa(itemEscolhido?.nome || garrafa)} de ${nome.trim()} cadastrada. Vale até ${dataBR(validade)}.`);
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" travado={ocupado} titulo="Nova garrafa no Clube do Whisky"
      descricao="A garrafa já foi vendida na Zig. Aqui fica registrado de quem é e até quando vale."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Cadastrar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input rotulo="CPF" value={cpf} onChange={e => { setCpf(e.target.value); setAchou(null); }} onBlur={buscarCpf} inputMode="numeric" placeholder="000.000.000-00" autoFocus
          dica={achou || 'Busca nome e telefone na Fidelidade.'} />
        <Input rotulo="Nome do cliente" value={nome} onChange={e => setNome(e.target.value)} />
        <Input rotulo="WhatsApp" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="65 9xxxx-xxxx" inputMode="tel" />
        <div className="md:col-span-2">
          <Input rotulo="Garrafa" value={garrafa} onChange={e => setGarrafa(e.target.value)} list="clube-garrafas" placeholder="Ex.: Old Parr"
            dica={itemEscolhido ? 'Ligada ao item do estoque.' : 'Escolha da lista ou digite o nome.'} />
          <datalist id="clube-garrafas">{itens.map(i => <option key={i.id} value={i.nome} />)}</datalist>
        </div>
        <Input rotulo="Etiqueta" value={etiqueta} onChange={e => setEtiqueta(e.target.value)} placeholder="Nº na prateleira" />
        <Input rotulo="Comprada em" type="date" value={compra} onChange={e => setCompra(e.target.value)} />
        <Input rotulo="Vale até" type="date" value={validade} onChange={e => setValidade(e.target.value)} dica="6 meses da compra. Depois fica para a casa." />
        <div />
        <label className="md:col-span-3 flex items-start gap-2 t-body">
          <input type="checkbox" checked={aceita} onChange={e => setAceita(e.target.checked)} style={{ marginTop: 3 }} />
          <span><MessageCircle size={14} className="inline mr-1" />O cliente aceita receber aviso no WhatsApp (30 e 7 dias antes de vencer).</span>
        </label>
        <Textarea rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} rows={2} className="md:col-span-3" />
      </div>
    </Modal>
  );
};
