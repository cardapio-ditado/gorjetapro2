import { supabase } from '../../../lib/supabase';

/** Chama a edge function contrato-assinatura; erro vira Error com a mensagem do servidor (e o estado do link, se houver). */
export async function chamarAssinatura<T = Record<string, unknown>>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('contrato-assinatura', { body: corpo });
  if (error) {
    let msg = error.message, estado: string | undefined;
    try {
      const j = await (error as { context?: Response }).context?.json();
      msg = j?.error || msg; estado = j?.estado;
    } catch { /* corpo sem JSON */ }
    throw Object.assign(new Error(msg), { estado });
  }
  return data as T;
}

export const linkAssinatura = (token: string) => `${window.location.origin}/assinar/${token}`;
