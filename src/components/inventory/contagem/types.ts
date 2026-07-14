// types.ts
export interface Estoque {
  id: string;
  nome: string;
}

export interface ContagemItem {
  id: string;
  item_estoque_id: string;
  item_nome: string;
  item_codigo: string;
  unidade_medida: string;
  grupo_contagem: GrupoContagem;
  ignorar_contagem_cadastro: boolean;
  ignorar_override: boolean | null;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  valor_unitario: number;
  diferenca: number | null;
  valor_diferenca: number | null;
  observacao: string | null;
}

export interface Contagem {
  id: string;
  estoque_id: string;
  estoque_nome: string;
  data_contagem: string;
  responsavel: string;
  status: 'em_andamento' | 'finalizada' | 'processada' | 'cancelada';
  total_itens_contados: number;
  total_diferencas: number;
  valor_total_diferencas: number;
  observacoes: string | null;
  criado_em: string;
  finalizado_em: string | null;
  processado_em: string | null;
}

export interface ContagemResultado {
  contagem: Contagem;
  itens: ContagemItem[];
}

export type ContagemView = 'list' | 'counting' | 'result' | 'history';

export type GrupoContagem =
  | 'estoque_seco'
  | 'bebidas'
  | 'alimentos'
  | 'hortifruti'
  | 'estoque_central'
  | 'outros';

export const GRUPOS: { key: GrupoContagem; label: string; emoji: string; cor: string }[] = [
  { key: 'bebidas',          label: 'Bebidas',       emoji: '🍺', cor: 'blue'   },
  { key: 'alimentos',        label: 'Alimentos',     emoji: '🥩', cor: 'red'    },
  { key: 'hortifruti',       label: 'Hortifruti',    emoji: '🥦', cor: 'green'  },
  { key: 'estoque_seco',     label: 'Estoque Seco',  emoji: '🌾', cor: 'yellow' },
  { key: 'estoque_central',  label: 'Central',       emoji: '📦', cor: 'purple' },
  { key: 'outros',           label: 'Outros',        emoji: '🗂️', cor: 'gray'   },
];