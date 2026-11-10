import { supabase } from '../../../lib/supabase';

// Peças comuns da Conciliação Bancária: a importação por arquivo (OFX/XML) e o
// extrato automático da Stone (Pluggy) usam o mesmo cartão e o mesmo lançamento.

export interface Banco { id: string; banco: string; tipo_conta: string; }
export interface Forma { id: string; nome: string; }
export interface Categoria { id: string; nome: string; }
export interface Fornecedor { id: string; nome: string; categoria_padrao_id: string | null; }

export interface SugFornecedor { id: string; nome: string; categoria_padrao_id: string | null; categoria_padrao_nome: string | null; score: number; }
export interface SugConta { id: string; descricao: string; fornecedor_id: string; fornecedor_nome: string; valor_total: number; saldo_restante: number; data_vencimento: string; categoria_id: string | null; }
export interface SugJa { fluxo_id: string; data: string; valor: number; descricao: string; }
/** contas_musicos: contas de show em aberto (qualquer valor); a de músico só se paga por ela. */
export interface Sugestao { fornecedores: SugFornecedor[]; contas_abertas: SugConta[]; contas_musicos?: SugConta[]; ja_conciliado: SugJa[]; }

/** Contas que dá para escolher em "Pagar conta aberta": mesmo valor + shows do músico escolhido. */
export function contasParaBaixa(sug: Sugestao, fornecedorId: string): SugConta[] {
  const ids = new Set(sug.contas_abertas.map(c => c.id));
  return [...sug.contas_abertas, ...(sug.contas_musicos || []).filter(c => c.fornecedor_id === fornecedorId && !ids.has(c.id))];
}

/** transferencia: só no extrato automático (Pix entre contas do próprio bar). */
export type Acao = 'nova' | 'baixa' | 'ja' | 'ignorar' | 'transferencia';

export interface Linha {
  fitid: string;
  data: string;          // YYYY-MM-DD
  valor: number;         // positivo
  descricao: string;
  acao: Acao;
  contaPagarId: string;  // quando acao='baixa'
  fornecedorId: string;  // quando acao='nova'
  categoriaId: string;
  formaPagamentoId: string;
  contaOutraId?: string; // quando acao='transferencia': a outra conta do bar
  numeroNota?: string;   // nº da nota/espelho: vai para o documento da conta a pagar
  observacao?: string;   // vai para as observações da conta a pagar / da baixa
  notasIds?: string[];   // notas de compra (entradas_compras) pagas por este lançamento
  sug: Sugestao;
  status: 'pendente' | 'conciliada' | 'ignorada';
  jaImportada: boolean;  // veio de importação anterior
  salvando: boolean;
  erro: string | null;
}

export const SUG_VAZIA: Sugestao = { fornecedores: [], contas_abertas: [], ja_conciliado: [] };

export const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const inputCls = 'w-full text-xs border border-white/15 rounded-md px-2 py-1.5 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-wine/40';

/** Sugestões do banco (fornecedor parecido, conta a pagar com o mesmo valor, já lançado no fluxo). */
export async function sugerir(descricao: string, valor: number, data: string, bancoContaId: string | null): Promise<Sugestao> {
  const { data: sug } = await supabase.rpc('fn_conciliacao_sugerir', {
    p_descricao: descricao, p_valor: valor, p_data: data, p_banco_conta_id: bancoContaId,
  });
  return (sug as Sugestao) || SUG_VAZIA;
}

/** Ação inicial: já no fluxo > baixa de conta aberta > nova. */
export function acaoInicial(sug: Sugestao, jaImportada = false): Acao {
  if (jaImportada || sug.ja_conciliado.length > 0) return 'ja';
  if (sug.contas_abertas.length > 0) return 'baixa';
  return 'nova';
}

/** Valida a linha antes de lançar; devolve a mensagem de erro, ou null. */
export function validar(l: Linha, bancoContaId: string): string | null {
  if (l.acao === 'baixa' && !l.contaPagarId) return 'Escolha a conta a pagar.';
  if (l.acao === 'nova' && !l.fornecedorId) return 'Escolha o fornecedor.';
  if (l.acao === 'transferencia' && !l.contaOutraId) return 'Escolha a conta para onde foi a transferência.';
  if ((l.acao === 'baixa' || l.acao === 'nova') && (!l.formaPagamentoId || !bancoContaId)) return 'Escolha a forma de pagamento.';
  return null;
}

/**
 * Lança a saída: cria a conta a pagar (nova) e dá baixa, ou só dá baixa numa
 * conta aberta, ou só marca (já está no fluxo). Registra em conciliacao_transacoes.
 * Devolve a conta a pagar usada (null quando só marcou).
 */
export async function lancar(l: Linha, bancoContaId: string, importacaoId: string | null): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const usuario = userData?.user?.id || null;
  let contaPagarId: string | null = null;
  const nota = l.numeroNota?.trim() || '';
  const obs = l.observacao?.trim() || '';

  if (l.acao === 'nova') {
    const { data: nova, error: cErr } = await supabase.from('contas_pagar').insert([{
      fornecedor_id: l.fornecedorId,
      descricao: l.descricao || 'Conciliação bancária',
      categoria_id: l.categoriaId || null,
      forma_pagamento_id: l.formaPagamentoId || null,
      valor_original: l.valor, valor_total: l.valor, valor_final: l.valor,
      data_emissao: l.data, data_vencimento: l.data,
      // o código do banco continua no comprovante da baixa
      numero_documento: nota || l.fitid || null,
      observacoes: ['Criado via conciliação bancária', obs].filter(Boolean).join(' · '),
    }]).select().single();
    if (cErr) throw cErr;
    contaPagarId = nova.id;
  } else if (l.acao === 'baixa') {
    contaPagarId = l.contaPagarId;
  }

  if (l.acao === 'nova' || l.acao === 'baixa') {
    const { error: bErr } = await supabase.rpc('api_fin_dar_baixa_conta', {
      p_conta_pagar_id: contaPagarId,
      p_valor_pagamento: l.valor,
      p_data_pagamento: l.data,
      p_forma_pagamento_id: l.formaPagamentoId,
      p_conta_bancaria_id: bancoContaId,
      p_numero_comprovante: l.fitid || null,
      p_observacoes: ['Conciliação bancária', l.acao === 'baixa' && nota ? `Nota ${nota}` : '', obs].filter(Boolean).join(' · '),
      p_usuario: usuario,
    });
    if (bErr) throw bErr;
    // as notas de compra pagas por este Pix ficam ligadas à conta (aparecem pagas).
    // A baixa já liga sozinha as que batem; aqui vale a escolha de quem concilia
    // (lista vazia = desmarcou todas). undefined = não houve escolha: fica a automática.
    if (contaPagarId && l.notasIds !== undefined) {
      const { error: vErr } = await supabase.rpc('fn_banco_vincular_notas', { p_conta_pagar: contaPagarId, p_notas: l.notasIds });
      if (vErr) throw vErr;
    }
  }

  const { error: tErr } = await supabase.from('conciliacao_transacoes').insert({
    importacao_id: importacaoId,
    banco_conta_id: bancoContaId,
    fitid: l.fitid || null,
    data: l.data,
    valor: l.valor,
    tipo: 'debito',
    descricao: l.descricao,
    status: 'conciliada',
    conta_pagar_id: contaPagarId,
  });
  if (tErr) throw tErr;
  return contaPagarId;
}

/**
 * Lança um movimento do extrato automático como transferência entre contas do
 * bar: saída numa conta e entrada na outra, sem conta a pagar e sem afetar o
 * resultado. Se a transferência já estava lançada à mão, só concilia.
 */
export async function lancarTransferencia(extratoId: string, contaOutraId: string) {
  const { data, error } = await supabase.rpc('fn_banco_lancar_transferencia', { p_extrato_id: extratoId, p_outra_conta: contaOutraId });
  if (error) throw error;
  return data as { ja_lancada: boolean; origem: string; destino: string; valor: number };
}

export interface NotaCompra { id: string; numero: string | null; data: string; valor: number; itens: number }
export interface NotasSugeridas { notas: NotaCompra[]; combinacao: string[]; diferenca: number | null }

/**
 * Notas de compra do fornecedor, ainda sem pagamento, perto da data do Pix.
 * `combinacao` é a nota (ou soma de até 3) que dá o valor pago.
 */
export async function notasSugeridas(fornecedorId: string, valor: number, data: string): Promise<NotasSugeridas> {
  const { data: r, error } = await supabase.rpc('fn_banco_notas_sugeridas', { p_fornecedor: fornecedorId, p_valor: valor, p_data: data });
  if (error) throw error;
  const v = (r || {}) as Partial<NotasSugeridas>;
  return { notas: (v.notas || []).map(n => ({ ...n, valor: Number(n.valor) })), combinacao: v.combinacao || [], diferenca: v.diferenca ?? null };
}

/** "Pular, lançar depois": guarda o motivo no extrato (null tira a marca). */
export async function adiar(extratoId: string, motivo: string | null) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('banco_extrato').update(motivo
    ? { adiado_motivo: motivo, adiado_em: new Date().toISOString(), adiado_por: u?.user?.id || null }
    : { adiado_motivo: null, adiado_em: null, adiado_por: null }).eq('id', extratoId);
  if (error) throw error;
}

/** Marca a saída como ignorada (não é lançamento do financeiro). */
export async function registrarIgnorada(l: Linha, bancoContaId: string, importacaoId: string | null) {
  const { error } = await supabase.from('conciliacao_transacoes').insert({
    importacao_id: importacaoId, banco_conta_id: bancoContaId, fitid: l.fitid || null,
    data: l.data, valor: l.valor, tipo: 'debito', descricao: l.descricao, status: 'ignorada',
  });
  if (error) throw error;
}
