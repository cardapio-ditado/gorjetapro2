export interface Funcionario {
  id: string;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  funcao: string | null;
  tipo: 'fixo' | 'freelancer';
  pix: string | null;
  ativo: boolean;
}

export interface Veiculo {
  id: string;
  nome: string;
  placa: string | null;
  modelo: string | null;
  ativo: boolean;
}

export interface Evento {
  id: string;
  nome: string;
  cidade: string | null;
  local: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: 'planejado' | 'em_andamento' | 'encerrado' | 'cancelado';
  obs: string | null;
}

export type ViagemStatus = 'em_viagem' | 'prestacao_pendente' | 'fechada' | 'cancelada';

export interface Viagem {
  id: string;
  evento_id: string | null;
  funcionario_id: string;
  veiculo_id: string | null;
  data_partida: string;
  data_retorno_prevista: string | null;
  data_retorno_real: string | null;
  valor_alocado: number;
  status: ViagemStatus;
  obs: string | null;
  arquivada: boolean;
  criado_em: string;
  token_publico?: string;
  funcionario?: Funcionario;
  veiculo?: Veiculo;
  evento?: Evento;
}

export type LancamentoTipo = 'despesa' | 'aporte' | 'devolucao';

export interface ViagemLancamento {
  id: string;
  viagem_id: string;
  tipo: LancamentoTipo;
  categoria: string | null;
  descricao: string | null;
  valor: number;
  data_lancamento: string;
  comprovante_url: string | null;
  criado_em: string;
}

export interface ViagemOcorrencia {
  id: string;
  viagem_id: string;
  descricao: string;
  foto_url: string | null;
  criado_em: string;
}

export const CATEGORIAS_DESPESA = [
  'Combustível',
  'Alimentação',
  'Hospedagem',
  'Pedágio',
  'Material / Compras',
  'Manutenção veículo',
  'Outros',
];

export const STATUS_VIAGEM_LABEL: Record<ViagemStatus, string> = {
  em_viagem: 'Em viagem',
  prestacao_pendente: 'Prestação pendente',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
};

export const EVENTO_STATUS_LABEL: Record<Evento['status'], string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

// ---- cadastros de apoio ----

export interface Fornecedor {
  id: string;
  nome: string;
  cnpj_cpf: string | null;
  telefone: string | null;
  email: string | null;
  pix: string | null;
  obs: string | null;
  ativo: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  unidade: string;
  categoria: string | null;
  ativo: boolean;
}

export interface FinCategoria {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  ativo: boolean;
}

export interface FinConta {
  id: string;
  nome: string;
  banco: string | null;
  tipo: 'banco' | 'caixa';
  saldo_inicial: number;
  ativo: boolean;
}

// ---- estoque do evento ----

export interface EventoArea {
  id: string;
  evento_id: string;
  nome: string;
  is_recebimento: boolean;
}

export type EstoqueMovTipo = 'entrada' | 'transferencia' | 'saida' | 'perda';

export interface EstoqueMov {
  id: string;
  evento_id: string;
  produto_id: string;
  tipo: EstoqueMovTipo;
  origem_area_id: string | null;
  destino_area_id: string | null;
  quantidade: number;
  obs: string | null;
  criado_em: string;
  produto?: Produto;
  origem?: EventoArea | null;
  destino?: EventoArea | null;
}

export const ESTOQUE_MOV_LABEL: Record<EstoqueMovTipo, string> = {
  entrada: 'Entrada',
  transferencia: 'Transferência',
  saida: 'Saída / Consumo',
  perda: 'Perda',
};

// ---- financeiro ----

export type FinLancamentoTipo = 'pagar' | 'receber';
export type FinLancamentoStatus = 'aberto' | 'pago' | 'cancelado';

export interface FinLancamento {
  id: string;
  tipo: FinLancamentoTipo;
  descricao: string;
  fornecedor_id: string | null;
  categoria_id: string | null;
  evento_id: string | null;
  conta_id: string | null;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: FinLancamentoStatus;
  obs: string | null;
  criado_em: string;
  fornecedor?: Fornecedor | null;
  categoria?: FinCategoria | null;
  conta?: FinConta | null;
  evento?: Evento | null;
}

export interface FinExtrato {
  id: string;
  conta_id: string;
  fitid: string;
  data: string;
  descricao: string | null;
  valor: number;
  lancamento_id: string | null;
}
