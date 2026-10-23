import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { supabase } from '../../lib/supabase';
import { ReportGenerator } from '../../utils/reportGenerator';
import type { BadgeVariante } from '../ui';

dayjs.locale('pt-br');

/**
 * Livro da Noite: o gerente do turno relata a noite setor por setor, o caixa
 * (dinheiro) e os pagamentos feitos (só informativo: nada vai ao Financeiro).
 * A "noite" de uma data vai até as 6h do dia seguinte (fuso de Cuiabá).
 */

export type Setor = 'salao' | 'bar' | 'cozinha' | 'caixa' | 'seguranca' | 'limpeza' | 'estoque' | 'manutencao' | 'geral';
export const SETORES: { id: Setor; nome: string }[] = [
  { id: 'salao', nome: 'Salão' }, { id: 'bar', nome: 'Bar' }, { id: 'cozinha', nome: 'Cozinha' },
  { id: 'caixa', nome: 'Caixa e Recepção' }, { id: 'seguranca', nome: 'Segurança' }, { id: 'limpeza', nome: 'Limpeza' },
  { id: 'estoque', nome: 'Estoque' }, { id: 'manutencao', nome: 'Manutenção' }, { id: 'geral', nome: 'Geral' },
];
export const nomeSetor = (s: string) => SETORES.find(x => x.id === s)?.nome || s;

export type Tipo = 'pessoal' | 'cliente' | 'falta_produto' | 'equipamento' | 'seguranca' | 'elogio' | 'outro';
export const TIPOS: { id: Tipo; nome: string }[] = [
  { id: 'pessoal', nome: 'Equipe' }, { id: 'cliente', nome: 'Cliente' }, { id: 'falta_produto', nome: 'Falta de produto' },
  { id: 'equipamento', nome: 'Equipamento' }, { id: 'seguranca', nome: 'Segurança' }, { id: 'elogio', nome: 'Elogio' }, { id: 'outro', nome: 'Outro' },
];
export const nomeTipo = (t: string) => TIPOS.find(x => x.id === t)?.nome || t;

export type Gravidade = 'info' | 'atencao' | 'grave';
export const GRAVIDADES: { id: Gravidade; nome: string; variante: BadgeVariante }[] = [
  { id: 'info', nome: 'Informativa', variante: 'neutral' }, { id: 'atencao', nome: 'Atenção', variante: 'warning' }, { id: 'grave', nome: 'Grave', variante: 'danger' },
];

export const MOVIMENTOS = [
  { valor: 'fraco', rotulo: 'Fraco' }, { valor: 'medio', rotulo: 'Médio' }, { valor: 'forte', rotulo: 'Forte' }, { valor: 'lotado', rotulo: 'Lotado' },
] as const;
export const rotuloMovimento = (m: string | null) => MOVIMENTOS.find(x => x.valor === m)?.rotulo || '—';

export const FORMAS = [
  { valor: 'dinheiro_caixa', rotulo: 'Dinheiro do caixa' }, { valor: 'pix', rotulo: 'PIX' }, { valor: 'outro', rotulo: 'Outra forma' },
] as const;
export const rotuloForma = (f: string) => FORMAS.find(x => x.valor === f)?.rotulo || f;

export interface Noite {
  id: string; data: string; gerente_nome: string | null; movimento: 'fraco' | 'medio' | 'forte' | 'lotado' | null; recado: string | null;
  fundo_troco: number | null; dinheiro_entrada: number | null; dinheiro_contado: number | null; caixa_obs: string | null;
  status: 'aberto' | 'fechado'; fechado_por_nome: string | null; fechado_em: string | null; reaberto_por_nome: string | null; reaberto_em: string | null;
}
export interface OcorrenciaL {
  id: string; noite_id: string; setor: Setor; tipo: Tipo; gravidade: Gravidade; texto: string; envolvidos: string | null; fotos: string[];
  precisa_providencia: boolean; responsavel: string | null; prazo: string | null; status_pendencia: 'aberta' | 'resolvida';
  resolvida_em: string | null; resolvida_por_nome: string | null; resolucao: string | null; criado_por_nome: string | null; criado_em: string;
}
export interface CaixaMov { id: string; tipo: 'sangria' | 'suprimento'; valor: number; motivo: string | null; por_nome: string | null; criado_em: string }
export interface PagamentoL { id: string; descricao: string; valor: number; forma: 'dinheiro_caixa' | 'pix' | 'outro'; autorizado_por: string | null; por_nome: string | null; criado_em: string }
export interface Presenca { id: string; nome: string; situacao: 'faltou' | 'atrasou' | 'saiu_cedo' }
export interface ReservaStatus { id: string; referencia: string; situacao: 'veio' | 'nao_veio' }
export interface Adendo { id: string; texto: string; por_nome: string | null; criado_em: string }
export interface Pendencia {
  id: string; data: string; setor: Setor; tipo: Tipo; gravidade: Gravidade; texto: string; responsavel: string | null; prazo: string | null;
  fotos: string[]; criado_por_nome: string | null;
}
export interface CaixaCalc { sangrias: number; suprimentos: number; pagamentos_dinheiro: number; pagamentos_total: number; esperado: number | null; diferenca: number | null }
export interface Carga {
  noite_atual: string; data: string; gestor: boolean; noite: Noite | null; setores: { id: string; setor: Setor; por_nome: string | null }[];
  ocorrencias: OcorrenciaL[]; caixa_movs: CaixaMov[]; pagamentos: PagamentoL[]; presenca: Presenca[]; reservas_status: ReservaStatus[]; adendos: Adendo[];
  pendencias: Pendencia[]; caixa: CaixaCalc | null;
  portal: {
    reservas: { tipo: string; nome: string; telefone?: string; horario?: string; pessoas?: number; local?: string; obs?: string }[];
    escala: { nome: string; setor: string; funcao?: string; horario?: string; folga?: boolean }[];
    'cachê_noite': { nome: string; inicio?: string; fim?: string }[];
  };
  extras: { nome: string; funcao: string; setor: string; presenca: 'prevista' | 'confirmada' | 'faltou' }[];
  eventos: { nome: string; pessoas: number | null; hora: string | null }[];
  zig_total: number | null;
}

export const brl = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (s: string) => Number((s || '').replace(/\./g, '').replace(',', '.')) || 0;
export const numTexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
export const dataLonga = (d: string) => dayjs(d).format('dddd, DD [de] MMMM').replace(/^./, c => c.toUpperCase());
export const dataCurta = (d: string | null) => (d ? dayjs(d).format('DD/MM') : '—');
export const hora = (h?: string | null) => (h ? h.slice(0, 5) : '');
export const refReserva = (r: { tipo: string; nome: string; horario?: string }) => `${r.tipo}:${r.nome}:${r.horario || ''}`;

/** A noite de agora: até as 6h da manhã ainda é a noite de ontem (Cuiabá, UTC-4). */
export const noiteAgora = () => new Date(Date.now() - 10 * 3600 * 1000).toISOString().slice(0, 10);

/** Reduz a foto do celular antes de subir (lado maior 1600 px, JPEG). */
export async function comprimirFoto(arquivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok, falha) => c.toBlob(b => (b ? ok(b) : falha(new Error('Não deu para ler a foto.'))), 'image/jpeg', 0.8));
}

/** Links temporários (1 h) das fotos, que ficam numa pasta privada. */
export function useFotos(caminhos: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const chave = caminhos.join('|');
  useEffect(() => {
    const faltam = caminhos.filter(c => !urls[c]);
    if (!faltam.length) return;
    supabase.storage.from('livro').createSignedUrls(faltam, 3600).then(({ data }) => {
      if (!data) return;
      setUrls(u => ({ ...u, ...Object.fromEntries(data.filter(d => d.signedUrl && d.path).map(d => [d.path as string, d.signedUrl])) }));
    });
  }, [chave]);
  return urls;
}

export const Fotos: React.FC<{ caminhos: string[]; onRemover?: (c: string) => void }> = ({ caminhos, onRemover }) => {
  const urls = useFotos(caminhos);
  if (!caminhos.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {caminhos.map(c => (
        <div key={c} className="relative">
          {urls[c]
            ? <a href={urls[c]} target="_blank" rel="noopener noreferrer"><img src={urls[c]} alt="Foto da ocorrência" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 'var(--r-control)', border: '1px solid var(--border-subtle)' }} /></a>
            : <div style={{ width: 84, height: 84, borderRadius: 'var(--r-control)', background: 'var(--bg-hover)' }} />}
          {onRemover && <button type="button" aria-label="Tirar a foto" onClick={() => onRemover(c)} className="absolute -top-2 -right-2 rounded-full px-1.5 t-caption" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>✕</button>}
        </div>
      ))}
    </div>
  );
};

/** PDF de uma noite: cabeçalho, setores, caixa, pagamentos, recado e adendos. */
export function pdfDaNoite(c: Carga) {
  const n = c.noite;
  if (!n) return;
  const r = new ReportGenerator({ title: 'Livro da Noite', filename: `livro-da-noite-${n.data}.pdf`, orientation: 'portrait' });
  const grav = (g: string) => GRAVIDADES.find(x => x.id === g)?.nome || g;
  let y = r.addHeader('Livro da Noite', [dataLonga(n.data), `Gerente do turno: ${n.gerente_nome || '—'} · Movimento: ${rotuloMovimento(n.movimento)} · ${n.status === 'fechado' ? `Fechado por ${n.fechado_por_nome || '—'} em ${dayjs(n.fechado_em).format('DD/MM HH:mm')}` : 'Livro aberto'}`]) as number;
  y = r.addSection('Setores', [], y);
  const linhas: string[][] = [];
  for (const s of SETORES) {
    const oc = c.ocorrencias.filter(o => o.setor === s.id);
    if (!oc.length) linhas.push([s.nome, c.setores.some(x => x.setor === s.id) ? 'Sem ocorrências' : 'Sem resposta', '', '']);
    oc.forEach((o, i) => linhas.push([i === 0 ? s.nome : '', `${nomeTipo(o.tipo)}${o.envolvidos ? ` (${o.envolvidos})` : ''}: ${o.texto}`, grav(o.gravidade),
      o.precisa_providencia ? `${o.status_pendencia === 'resolvida' ? 'Resolvida' : 'Pendente'}${o.responsavel ? ` · ${o.responsavel}` : ''}` : '']));
  }
  y = r.addTable(['Setor', 'Ocorrência', 'Gravidade', 'Providência'], linhas, y) as number;
  const cx = c.caixa;
  y = r.addSection('Caixa (dinheiro)', [], y + 6);
  y = r.addTable(['Item', 'Valor'], [
    ['Fundo de troco', brl(n.fundo_troco)], ['Dinheiro que entrou', brl(n.dinheiro_entrada)],
    ['Suprimentos', brl(cx?.suprimentos)], ['Sangrias', brl(cx?.sangrias)], ['Pagamentos em dinheiro do caixa', brl(cx?.pagamentos_dinheiro)],
    ['Esperado no caixa', brl(cx?.esperado)], ['Dinheiro contado', brl(n.dinheiro_contado)], ['Diferença', brl(cx?.diferenca)],
  ], y) as number;
  if (c.caixa_movs.length) y = r.addTable(['Movimento', 'Valor', 'Motivo'], c.caixa_movs.map(m => [m.tipo === 'sangria' ? 'Sangria' : 'Suprimento', brl(m.valor), m.motivo || '']), y + 4) as number;
  if (c.pagamentos.length) {
    y = r.addSection('Pagamentos feitos na noite (só informativo, não vai ao Financeiro)', [], y + 6);
    y = r.addTable(['Descrição', 'Valor', 'Forma', 'Autorizou'], c.pagamentos.map(p => [p.descricao, brl(p.valor), rotuloForma(p.forma), p.autorizado_por || '']), y) as number;
  }
  if (n.recado) y = r.addSection('Recado para o próximo turno', [n.recado], y + 6);
  if (c.adendos.length) y = r.addSection('Adendos', c.adendos.map(a => `${dayjs(a.criado_em).format('DD/MM HH:mm')} ${a.por_nome || ''}: ${a.texto}`), y + 6);
  r.addFooter();
  r.save(`livro-da-noite-${n.data}.pdf`);
}
