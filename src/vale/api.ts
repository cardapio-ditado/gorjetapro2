/**
 * Acesso do Vale Ditado ao Supabase. A página pública não carrega o cliente supabase-js (é pesado para o 4G):
 * fala direto com as funções do banco (RPC) e com as edge functions, com a chave anônima.
 */

const URL_SUPA = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://nzdiojmrukdxavrdazot.supabase.co';
const CHAVE = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56ZGlvam1ydWtkeGF2cmRhem90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4OTA1NjksImV4cCI6MjA2NDQ2NjU2OX0.-6VLiW0Ui4OEhMhYXpXJKhKC2tgujjrPywgnRW4BLY0';

const cabecalhos = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' };

export class ErroRede extends Error {}

async function postar<T>(url: string, corpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo ?? {}) });
  } catch {
    throw new ErroRede('sem conexão');
  }
  const texto = await r.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
  if (!r.ok && !(json && typeof json === 'object')) throw new Error(`erro ${r.status}`);
  return json as T;
}

export const rpc = <T>(nome: string, args: Record<string, unknown> = {}) => postar<T>(`${URL_SUPA}/rest/v1/rpc/${nome}`, args);
export const funcao = <T>(nome: string, corpo: unknown) => postar<T>(`${URL_SUPA}/functions/v1/${nome}`, corpo);

// ───────────────────────── tipos ─────────────────────────

export interface ItemProduto { descricao: string; quantidade: number; tem_alcool: boolean }

export interface Produto {
  id: string; slug: string; nome: string; composicao: string; selo: string | null;
  preco_de: number; preco_por: number; tipo: 'kit' | 'credito'; credito_valor: number | null;
  tem_alcool: boolean; trava_happy_hour: boolean; lote_total: number; restam: number; vendidos: number;
  limite_por_cpf: number; foto_url: string | null; categoria: 'chopp' | 'kits' | 'drinks' | 'familia' | 'credito';
  destaque_black: number | null; destaque_natal: number | null; itens: ItemProduto[];
}

export interface Campanha {
  fase: 'black' | 'natal'; modo_teste: boolean; venda_inicio: string; venda_fim: string;
  validade_meses: number; validade_ate: string; happy_hour_fim: string;
  brinde_descricao: string | null; brinde_ate: string | null;
  mostrar_contador: boolean; contador_fim: string | null; mostrar_vendidos_a_partir: number;
  hero_foto_url: string | null; textos: Record<string, string>; tem_regulamento: boolean;
}

export interface Vitrine {
  agora: string; situacao: 'aberta' | 'antes' | 'encerrada' | 'fechada';
  campanha: Campanha; vendidos_total: number; produtos: Produto[];
}

export interface SaldoVale { descricao: string; total: number; usado: number; brinde: boolean }
export interface ValeCodigo {
  codigo: string; produto: string; slug: string; tipo: 'kit' | 'credito'; titular: string; validade: string;
  status: 'ativo' | 'parcial' | 'resgatado' | 'vencido' | 'estornado';
  credito_total: number | null; saldo_credito: number | null; trava_happy_hour: boolean; saldos: SaldoVale[];
}

export interface PedidoPublico {
  status: 'pendente' | 'pago' | 'expirado' | 'cancelado' | 'estornado' | 'pago_sem_lote';
  forma_pagamento: 'pix' | 'cartao'; valor_total: number; valor_cheio: number; presente: boolean;
  comprador: string; presenteado: string; pix_copia_cola: string | null; gateway_url: string | null;
  reserva_expira_em: string; pago_em: string | null; agora: string;
  itens: { produto: string; slug: string; quantidade: number; preco: number; restam: number }[];
  vales: ValeCodigo[];
}

export const carregarVitrine = () => rpc<Vitrine>('fn_vale_vitrine');
export const carregarPedido = (token: string) => rpc<PedidoPublico | null>('fn_vale_pedido_publico', { p_token: token });
export const verificarPagamento = (token: string) =>
  funcao<{ ok: boolean; pedido?: PedidoPublico }>('vale/status', { token });
export const consultarVale = (codigo: string, cpf3: string) =>
  rpc<ValeCodigo | null>('fn_vale_consultar', { p_codigo: codigo, p_cpf3: cpf3 });
export const carregarRegulamento = () => rpc<string | null>('fn_vale_regulamento');

export interface RespostaPedido {
  ok: boolean; token?: string; erro?: string; slug?: string; produto?: string;
  restam?: number; limite?: number; ainda_pode?: number;
}
export const criarPedido = (dados: unknown) => funcao<RespostaPedido>('vale/criar-pedido', dados);
