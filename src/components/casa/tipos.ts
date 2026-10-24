/** O que a função casa-ao-vivo devolve. */

export type StatusCliente = 'consumindo' | 'parado' | 'saiu' | 'sem_consumo';

export interface ItemCliente { p: string; q: number; v: number; h: string | null; garcom: string | null; couvert: boolean }

export interface ClienteCasa {
  id: string;
  nome: string;
  genero: string | null;
  /** O garçom que mais atendeu: define a praça. */
  garcom: string | null;
  garcons: string[];
  /** De onde saiu o último pedido. */
  balcao: 'chopp' | 'cozinha' | null;
  chegou: string | null;
  ultimo: string | null;
  status: StatusCliente;
  consumo: number;
  couvert: number;
  itens: ItemCliente[];
  visitas: number | null;
  nivel: string | null;
  aniversario: boolean;
  premio: boolean;
  clube: boolean;
}

export interface GarcomCasa { nome: string; clientes: number; consumo: number; pedidos: number; ultimo: string | null }

export interface Casa {
  noite: string;
  lido_em: string;
  /** Preenchido quando é a reconstituição de ontem num instante. */
  momento: string | null;
  resumo: { na_casa: number; consumindo: number; parados: number; sairam: number; sem_consumo: number; consumo: number; couvert: number };
  garcons: GarcomCasa[];
  clientes: ClienteCasa[];
}

/** Onde o gerente arrastou a praça de cada garçom (pontos do PDF). */
export type Pracas = Record<string, [number, number]>;
