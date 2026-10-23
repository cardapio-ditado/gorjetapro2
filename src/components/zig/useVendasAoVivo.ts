import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Vendas da noite em andamento, direto da ZIG (função zig-noite-ao-vivo).
 * A ZIG manda os horários em UTC; a função devolve instantes com "Z" e aqui
 * tudo é mostrado no horário de Cuiabá.
 */
export interface Garcom { nome: string; consumo: number; couvert: number; taxa_prevista: number; itens: number; pedidos: number; ultima: string | null }
export interface Vivo {
  noite: string;
  atualizado_em: string | null;
  /** consumo + couvert */
  total: number;
  consumo: number;
  couvert: number;
  /** 10% do consumo (couvert não paga taxa). */
  taxa_prevista: number;
  /** O que a ZIG já registrou de taxa: só das comandas fechadas. */
  taxa_fechada: number;
  itens: number; pedidos: number;
  /** Pelo CPF de cada compra; null se a ZIG não mandou as compras. */
  clientes: { vieram: number; ainda: number; foram: number; ticket_medio: number } | null;
  por_categoria: { categoria: string; valor: number }[];
  por_bar: { bar: string; valor: number }[];
  por_hora: { hora: string; valor: number }[];
  garcons: Garcom[];
  top_produtos: { nome: string; valor: number; qtd: number }[];
}

const FUSO = 'America/Cuiaba';
export const hhmm = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) : '—';

export const haQuanto = (iso: string | null | undefined, agora: number) => {
  if (!iso) return '—';
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

/** "Joel de Souza Batista" vira "Joel Batista". */
export const nomeCurto = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : n;
};


const REFRESCAR_MS = 60_000;

/**
 * Lê a noite em andamento e se atualiza sozinho a cada minuto (e ao voltar
 * para a aba). Com `ativo` falso não busca nada.
 */
export function useVendasAoVivo(ativo = true) {
  const [d, setD] = useState<Vivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(ativo);
  const [agora, setAgora] = useState(() => Date.now());
  const [buscouEm, setBuscouEm] = useState<number | null>(null);
  const emVoo = useRef(false);

  const buscar = useCallback(async () => {
    if (emVoo.current) return;
    emVoo.current = true;
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('zig-noite-ao-vivo', { body: {} });
      if (error || !data?.ok) throw new Error(data?.error || 'sem resposta');
      setD(data as Vivo);
      setErro(null);
      setBuscouEm(Date.now());
    } catch {
      setErro('Não consegui falar com a ZIG agora. Mostrando a última leitura.');
    } finally {
      emVoo.current = false;
      setCarregando(false);
      setAgora(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!ativo) return;
    buscar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') buscar(); }, REFRESCAR_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    const voltou = () => { if (document.visibilityState === 'visible') buscar(); };
    document.addEventListener('visibilitychange', voltou);
    return () => { clearInterval(t); clearInterval(relogio); document.removeEventListener('visibilitychange', voltou); };
  }, [ativo, buscar]);

  return { d, erro, carregando, agora, buscouEm, buscar };
}
