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
  /** contagem por bloco (categoria); '__zerados' = bloco especial; null = contagem completa */
  bloco?: string | null;
}

export const BLOCO_ZERADOS = '__zerados';
export const nomeBloco = (b: string | null | undefined) => (b === BLOCO_ZERADOS ? 'Zerados na última contagem' : (b || ''));

export type SituacaoBloco = 'em_andamento' | 'atrasado' | 'vence_hoje' | 'nunca' | 'em_dia' | 'concluido_hoje';

export interface BlocoResumo {
  bloco: string;
  especial: boolean;
  itens: number;
  ciclo_dias: number;
  ultima_contagem: string | null;
  vence_em: string | null;
  situacao: SituacaoBloco;
  contagem_hoje_id: string | null;
  contagem_hoje_status: string | null;
  contados_hoje: number;
  total_hoje: number;
}

export interface PainelBlocos {
  hoje: string;
  estoque: { id: string; nome: string; tipo: string };
  blocos: BlocoResumo[];
  resumo: { blocos: number; devidos_hoje: number; concluidos_hoje: number; em_andamento: number; faltam_itens: number };
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