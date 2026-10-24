import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Casa, Pracas } from './tipos';

const REFRESCAR_MS = 60_000;

/**
 * A casa da noite. Sem `momento`, lê ao vivo e se atualiza a cada minuto (e ao
 * voltar para a aba). Com `momento` (ISO), pede a reconstituição de ontem
 * naquele instante, uma vez.
 */
export function useCasa(momento: string | null) {
  const [casa, setCasa] = useState<Casa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const pedido = useRef(0);

  const buscar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke('casa-ao-vivo', { body: momento ? { momento } : {} });
      if (meu !== pedido.current) return; // chegou depois de outro pedido: descarta
      if (error || !data?.ok) throw new Error(data?.error || 'sem resposta');
      setCasa(data as Casa);
      setErro(null);
    } catch {
      if (meu === pedido.current) setErro('Não consegui falar com a ZIG agora. Mostrando a última leitura.');
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [momento]);

  useEffect(() => {
    buscar();
    if (momento) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') buscar(); }, REFRESCAR_MS);
    const voltou = () => { if (document.visibilityState === 'visible') buscar(); };
    document.addEventListener('visibilitychange', voltou);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', voltou); };
  }, [buscar, momento]);

  return { casa, erro, carregando, buscar };
}

/** Onde o gerente arrastou cada praça. Fica salvo para as próximas noites. */
export function usePracas(quem: string | null) {
  const [pracas, setPracas] = useState<Pracas>({});

  useEffect(() => {
    supabase.from('casa_pracas').select('garcom, x, z').then(({ data }) => {
      const p: Pracas = {};
      for (const r of (data ?? []) as Array<{ garcom: string; x: number; z: number }>) p[r.garcom] = [Number(r.x), Number(r.z)];
      setPracas(p);
    });
  }, []);

  const mover = useCallback(async (garcom: string, ponto: [number, number]) => {
    setPracas((p) => ({ ...p, [garcom]: ponto }));
    const { error } = await supabase.from('casa_pracas').upsert({
      garcom, x: Math.round(ponto[0] * 10) / 10, z: Math.round(ponto[1] * 10) / 10,
      atualizado_por: quem, atualizado_em: new Date().toISOString(),
    });
    return !error;
  }, [quem]);

  return { pracas, mover };
}
