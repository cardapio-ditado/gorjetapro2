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
