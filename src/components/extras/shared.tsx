import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Check, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button, Input, Modal, Select, Textarea } from '../ui';
import type { BadgeVariante } from '../ui';

/**
 * Peças dos Extras (diaristas) usadas na tela de Extras (Operação) e no Painel do
 * Gerente: tipos, formatação e o modal de lançar diárias.
 *
 * Cada diária gera a conta a pagar no Financeiro (trigger no banco), na
 * subcategoria do tipo. Os pagamentos lançados aqui são controle à parte.
 */

export const SETORES = ['Salão', 'Bar', 'Cozinha', 'Recepção', 'Segurança', 'Limpeza', 'Estoque', 'Eventos', 'Outros'];
export const MOTIVOS = ['Movimento alto', 'Evento', 'Cobrir falta', 'Cobrir folga ou férias', 'Feijoada', 'Outro'];
export const FORMAS = ['PIX', 'Dinheiro', 'Transferência', 'Outro'];

export interface TipoExtra {
  id: string;
  nome: string;
  setor: string;
  valor_diaria: number;
  categoria_financeira_id: string | null;
  ativo: boolean;
  ordem: number;
}

export interface PessoaExtra {
  id: string;
  nome: string;
  telefone: string | null;
  pix: string | null;
  tipo_id: string | null;
  valor_diaria: number | null;
  observacoes: string | null;
  ativo: boolean;
  juntado_com: string | null;
}

export interface Diaria {
  id: string;
  nome: string;
  telefone: string | null;
  funcao_temporaria: string;
  valor_diaria: number;
  data_trabalho: string;
  horario_inicio: string | null;
  horario_fim: string | null;
  setor: string;
  motivo_contratacao: string | null;
  observacoes: string | null;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  data_pagamento: string | null;
  pessoa_id: string | null;
  tipo_id: string | null;
  valor_pago: number;
  saldo_restante: number;
  presenca: 'prevista' | 'confirmada' | 'faltou';
  pedido_por: string | null;
  lancado_por_nome: string | null;
  conta_pagar_id: string | null;
  pessoa?: { nome: string; telefone: string | null; pix: string | null } | null;
  pagamentos?: { valor: number; data_pagamento: string; estornado_em: string | null }[];
}

export const SELECT_DIARIA = '*, pessoa:extras_pessoas(nome, telefone, pix)';
const PAGAMENTOS = 'valor, data_pagamento, estornado_em';
/** Diária com os pagamentos, para a coluna "Pago em". */
export const SELECT_DIARIA_PAG = `${SELECT_DIARIA}, pagamentos:extras_pagamentos(${PAGAMENTOS})`;
/** Só as diárias com pagamento no dia filtrado (o filtro vai no embed). */
export const SELECT_DIARIA_PAGO_EM = `${SELECT_DIARIA}, pagamentos:extras_pagamentos!inner(${PAGAMENTOS})`;

/** Datas dos pagamentos que valem (sem os estornados), da mais antiga à mais nova. */
export const datasPagamento = (d: Diaria) =>
  [...new Set((d.pagamentos || []).filter(p => !p.estornado_em).map(p => p.data_pagamento))].sort();

export type Situacao = 'pendente' | 'parcial' | 'pago' | 'faltou' | 'cancelado';

export const SITUACAO: Record<Situacao, { rotulo: string; variante: BadgeVariante }> = {
  pendente: { rotulo: 'A pagar', variante: 'warning' },
  parcial: { rotulo: 'Parcial', variante: 'info' },
  pago: { rotulo: 'Pago', variante: 'success' },
  faltou: { rotulo: 'Faltou', variante: 'danger' },
  cancelado: { rotulo: 'Cancelado', variante: 'neutral' },
};

export const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (s: string) => Number((s || '').replace(/\./g, '').replace(',', '.')) || 0;
export const hora = (h: string | null) => (h ? h.slice(0, 5) : '');
export const dataCurta = (s: string | null) => (s ? dayjs(s).format('DD/MM') : '—');
export const nomeDe = (d: Diaria) => d.pessoa?.nome || d.nome;

export function situacao(d: Diaria): Situacao {
  if (d.presenca === 'faltou') return 'faltou';
  if (d.status_pagamento === 'cancelado') return 'cancelado';
  if ((d.valor_pago || 0) <= 0) return 'pendente';
  if ((d.saldo_restante || 0) > 0.004) return 'parcial';
  return 'pago';
}
export const emAberto = (d: Diaria) => d.status_pagamento !== 'cancelado' && (d.saldo_restante || 0) > 0.004;
export const temTelefone = (c: string | null | undefined) => (c || '').replace(/\D/g, '').length >= 10;

/** Valor da diária: o da pessoa, se ela tiver, senão o da tabela. */
export const valorPadrao = (p: PessoaExtra | undefined, t: TipoExtra | undefined) => Number(p?.valor_diaria || t?.valor_diaria || 0);

export const Resumo: React.FC<{ rotulo: string; valor: string; destaque?: boolean }> = ({ rotulo, valor, destaque }) => (
  <div className="rounded px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
    <p className="t-caption" style={{ margin: 0 }}>{rotulo}</p>
    <p className="t-body num" style={{ margin: 0, fontWeight: 700, color: destaque ? 'var(--gold)' : undefined }}>{valor}</p>
  </div>
);

export async function carregarCadastros(): Promise<{ tipos: TipoExtra[]; pessoas: PessoaExtra[] }> {
  const [t, p] = await Promise.all([
    supabase.from('extras_tipos').select('*').order('ordem').order('nome'),
    supabase.from('extras_pessoas').select('*').is('juntado_com', null).order('nome'),
  ]);
  if (t.error) throw t.error;
  if (p.error) throw p.error;
  return { tipos: (t.data || []) as TipoExtra[], pessoas: (p.data || []) as PessoaExtra[] };
}

// ── Lançar diárias ──────────────────────────────────────────────────────────
interface Linha { chave: number; pessoa_id: string; novo_nome: string; valor: string }

/**
 * Lança uma ou várias diárias do mesmo dia, tipo e setor (a equipe extra da
 * noite de uma vez). Pessoa nova se cadastra ali mesmo, pelo nome.
 */
export const LancarExtras: React.FC<{
  dataInicial?: string;
  tipoInicial?: string;
  quem?: string | null;
  onFechar: () => void;
  onFeito: (m: string) => Promise<void> | void;
}> = ({ dataInicial, tipoInicial, quem, onFechar, onFeito }) => {
  const [tipos, setTipos] = useState<TipoExtra[]>([]);
  const [pessoas, setPessoas] = useState<PessoaExtra[]>([]);
  const [data, setData] = useState(dataInicial || dayjs().format('YYYY-MM-DD'));
  const [tipoId, setTipoId] = useState(tipoInicial || '');
  const [setor, setSetor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pedido, setPedido] = useState(quem || '');
  const [hIni, setHIni] = useState('');
  const [hFim, setHFim] = useState('');
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: 1, pessoa_id: '', novo_nome: '', valor: '' }]);
  const [seq, setSeq] = useState(2);
  const [jaNoDia, setJaNoDia] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    carregarCadastros().then(c => { setTipos(c.tipos.filter(t => t.ativo)); setPessoas(c.pessoas.filter(p => p.ativo)); })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar'));
  }, []);

  // Quem já tem diária neste dia (aviso de lançamento em dobro).
  useEffect(() => {
    supabase.from('extras_freelancers').select('pessoa_id, funcao_temporaria').eq('data_trabalho', data).neq('status_pagamento', 'cancelado')
      .then(({ data: r }) => setJaNoDia(new Map((r || []).filter(x => x.pessoa_id).map(x => [x.pessoa_id as string, x.funcao_temporaria as string]))));
  }, [data]);

  const tipo = tipos.find(t => t.id === tipoId);
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);

  const escolherTipo = (id: string) => {
    setTipoId(id);
    const t = tipos.find(x => x.id === id);
    if (t) {
      setSetor(t.setor);
      setLinhas(ls => ls.map(l => ({ ...l, valor: valorPadrao(pessoaPorId.get(l.pessoa_id), t).toFixed(2).replace('.', ',') })));
    }
  };
  const mudar = (chave: number, patch: Partial<Linha>) => setLinhas(ls => ls.map(l => (l.chave === chave ? { ...l, ...patch } : l)));
  const escolherPessoa = (chave: number, id: string) => {
    const p = pessoaPorId.get(id);
    mudar(chave, { pessoa_id: id, novo_nome: '', valor: valorPadrao(p, tipo).toFixed(2).replace('.', ',') });
  };

  const validas = linhas.filter(l => (l.pessoa_id || l.novo_nome.trim()) && num(l.valor) > 0);
  const total = validas.reduce((a, l) => a + num(l.valor), 0);
  const dobradas = validas.filter(l => l.pessoa_id && jaNoDia.has(l.pessoa_id));

  const salvar = async () => {
    if (!tipo) { setErro('Escolha o tipo de extra.'); return; }
    if (!setor) { setErro('Escolha o setor.'); return; }
    if (!motivo) { setErro('Diga o motivo do extra.'); return; }
    if (!validas.length) { setErro('Adicione pelo menos uma pessoa com valor.'); return; }
    setOcupado(true); setErro(null);
    try {
      // Pessoa nova: cadastra antes, já com o tipo.
      const linhasProntas: { pessoa: PessoaExtra; valor: number }[] = [];
      for (const l of validas) {
        let p = l.pessoa_id ? pessoaPorId.get(l.pessoa_id) : undefined;
        if (!p) {
          const nome = l.novo_nome.trim().replace(/\s+/g, ' ');
          const existe = pessoas.find(x => x.nome.toLowerCase() === nome.toLowerCase());
          if (existe) p = existe;
          else {
            const { data: nova, error } = await supabase.from('extras_pessoas').insert({ nome, tipo_id: tipo.id }).select('*').single();
            if (error) throw error;
            p = nova as PessoaExtra;
          }
        }
        linhasProntas.push({ pessoa: p, valor: num(l.valor) });
      }
      const { error } = await supabase.from('extras_freelancers').insert(linhasProntas.map(({ pessoa, valor }) => ({
        nome: pessoa.nome, telefone: pessoa.telefone, pessoa_id: pessoa.id, tipo_id: tipo.id, funcao_temporaria: tipo.nome,
        setor, valor_diaria: valor, data_trabalho: data, horario_inicio: hIni || null, horario_fim: hFim || null,
        motivo_contratacao: motivo, pedido_por: pedido.trim() || null, observacoes: obs.trim() || null, status_pagamento: 'pendente',
      })));
      if (error) throw error;
      await onFeito(`${linhasProntas.length} diária${linhasProntas.length === 1 ? '' : 's'} de ${tipo.nome} lançada${linhasProntas.length === 1 ? '' : 's'} para ${dayjs(data).format('DD/MM')} (${brl(total)}).`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao lançar');
      setOcupado(false);
    }
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" travado={ocupado} titulo="Lançar extras"
      descricao="Uma ou várias pessoas no mesmo dia, tipo e setor. Cada diária gera a conta a pagar no Financeiro."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado} disabled={!validas.length}>Lançar {validas.length > 1 ? `${validas.length} diárias` : 'diária'} {total > 0 ? `· ${brl(total)}` : ''}</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Select rotulo="Tipo de extra" value={tipoId} onChange={e => escolherTipo(e.target.value)}>
          <option value="">Escolher…</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nome} · {brl(t.valor_diaria)}</option>)}
        </Select>
        <Select rotulo="Setor" value={setor} onChange={e => setSetor(e.target.value)}>
          <option value="">Escolher…</option>
          {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select rotulo="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)}>
          <option value="">Escolher…</option>
          {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Input rotulo="Quem pediu" value={pedido} onChange={e => setPedido(e.target.value)} placeholder="Gerente que pediu o extra" />
        <div className="grid grid-cols-2 gap-2">
          <Input rotulo="Início" type="time" value={hIni} onChange={e => setHIni(e.target.value)} />
          <Input rotulo="Fim" type="time" value={hFim} onChange={e => setHFim(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Pessoas</span>
        <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => { setLinhas(ls => [...ls, { chave: seq, pessoa_id: '', novo_nome: '', valor: tipo ? tipo.valor_diaria.toFixed(2).replace('.', ',') : '' }]); setSeq(s => s + 1); }}>Adicionar pessoa</Button>
      </div>
      <datalist id="extras-pessoas">{pessoas.map(p => <option key={p.id} value={p.nome} />)}</datalist>
      {linhas.map(l => {
        const p = pessoaPorId.get(l.pessoa_id);
        const dobra = l.pessoa_id ? jaNoDia.get(l.pessoa_id) : undefined;
        return (
          <div key={l.chave} className="mb-2">
            <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2 items-end">
              <Input aria-label="Pessoa" list="extras-pessoas" placeholder="Nome da pessoa" value={p ? p.nome : l.novo_nome}
                onChange={e => {
                  const v = e.target.value;
                  const achada = pessoas.find(x => x.nome.toLowerCase() === v.trim().toLowerCase());
                  if (achada) escolherPessoa(l.chave, achada.id);
                  else mudar(l.chave, { pessoa_id: '', novo_nome: v });
                }}
                dica={p ? [p.telefone, p.pix && `PIX ${p.pix}`].filter(Boolean).join(' · ') || undefined : l.novo_nome.trim() ? 'Pessoa nova: entra no cadastro.' : undefined} />
              <Input aria-label="Valor da diária" inputMode="decimal" placeholder="Valor" value={l.valor} onChange={e => mudar(l.chave, { valor: e.target.value })} />
              <div className="pb-1">
                <button type="button" className="btn-icon btn-icon-danger" aria-label="Tirar pessoa" onClick={() => setLinhas(ls => (ls.length > 1 ? ls.filter(x => x.chave !== l.chave) : ls))}><X size={14} /></button>
              </div>
            </div>
            {dobra && <p className="t-caption texto-atencao flex items-center gap-1" style={{ margin: '2px 0 0' }}><AlertTriangle size={12} /> Já tem diária neste dia ({dobra}).</p>}
          </div>
        );
      })}
      {dobradas.length > 0 && <div className="aviso aviso-atencao mt-2">{dobradas.length} pessoa{dobradas.length === 1 ? '' : 's'} já tem diária neste dia. Confira se não é lançamento em dobro.</div>}
      <Textarea rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} rows={2} className="mt-3" />
    </Modal>
  );
};
