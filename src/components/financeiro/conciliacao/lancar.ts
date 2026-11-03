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
export interface Sugestao { fornecedores: SugFornecedor[]; contas_abertas: SugConta[]; ja_conciliado: SugJa[]; }

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

  if (l.acao === 'nova') {
    const { data: nova, error: cErr } = await supabase.from('contas_pagar').insert([{
      fornecedor_id: l.fornecedorId,
      descricao: l.descricao || 'Conciliação bancária',
      categoria_id: l.categoriaId || null,
      forma_pagamento_id: l.formaPagamentoId || null,
      valor_original: l.valor, valor_total: l.valor, valor_final: l.valor,
      data_emissao: l.data, data_vencimento: l.data,
      numero_documento: l.fitid || null,
      observacoes: 'Criado via conciliação bancária',
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
      p_observacoes: 'Conciliação bancária',
      p_usuario: usuario,
    });
    if (bErr) throw bErr;
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

/** Marca a saída como ignorada (não é lançamento do financeiro). */
export async function registrarIgnorada(l: Linha, bancoContaId: string, importacaoId: string | null) {
  const { error } = await supabase.from('conciliacao_transacoes').insert({
    importacao_id: importacaoId, banco_conta_id: bancoContaId, fitid: l.fitid || null,
    data: l.data, valor: l.valor, tipo: 'debito', descricao: l.descricao, status: 'ignorada',
  });
  if (error) throw error;
}
