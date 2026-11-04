import type { Acao, Fornecedor, Linha } from './lancar';

// Peças do extrato automático usadas pela lista e pelo modo "um por um".

export type LinhaAuto = Linha & {
  extratoId: string; nome: string | null; docTipo: string | null; doc: string | null; classe: string;
  /** fornecedor veio de regra ou do CNPJ cadastrado (sugestão confiável) */
  reconhecido: boolean;
  selecionada: boolean;
  /** "pular, lançar depois": o motivo (null = não foi pulado) */
  adiado: string | null;
};

export interface Conta { id: string; banco: string; tipo_conta: string }

export const ACOES: Record<Acao, string> = {
  nova: 'Criar conta e pagar', baixa: 'Pagar conta aberta', ja: 'Já está lançada', ignorar: 'Ignorar', transferencia: 'Transferência entre contas',
};

/** CPF aparece mascarado na tela; CNPJ inteiro. */
export function documento(tipo: string | null, d: string | null) {
  if (!d) return '';
  if (d.length === 11) return `CPF •••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return `${tipo ?? 'Doc'} ${d}`;
}

/** Pronta = tem tudo que precisa para aprovar. */
export const pronta = (l: LinhaAuto) => l.status === 'pendente'
  && (l.acao === 'ja' || (l.acao === 'baixa' && !!l.contaPagarId) || (l.acao === 'nova' && !!l.fornecedorId)
    || (l.acao === 'transferencia' && !!l.contaOutraId));

/** Ao escolher o fornecedor: conta aberta dele com o mesmo valor vira "pagar conta aberta"; senão "criar conta e pagar". */
export function aplicarFornecedor(l: LinhaAuto, f: Fornecedor | undefined, categoriaId?: string): LinhaAuto {
  if (!f) return { ...l, fornecedorId: '', notasIds: undefined, erro: null };
  const conta = l.sug.contas_abertas.find(c => c.fornecedor_id === f.id);
  return {
    ...l,
    fornecedorId: f.id,
    categoriaId: categoriaId || l.categoriaId || f.categoria_padrao_id || '',
    acao: l.acao === 'ja' || l.acao === 'transferencia' ? l.acao : conta ? 'baixa' : 'nova',
    contaPagarId: conta?.id || l.contaPagarId,
    // outro fornecedor, outras notas: a sugestão é refeita
    notasIds: f.id === l.fornecedorId ? l.notasIds : undefined,
    erro: null,
  };
}
