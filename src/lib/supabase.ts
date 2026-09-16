import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Credenciais corretas do Supabase
const CORRECT_URL = 'https://nzdiojmrukdxavrdazot.supabase.co';
const CORRECT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56ZGlvam1ydWtkeGF2cmRhem90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4OTA1NjksImV4cCI6MjA2NDQ2NjU2OX0.-6VLiW0Ui4OEhMhYXpXJKhKC2tgujjrPywgnRW4BLY0';

// Usar credenciais do .env, mas com fallback para as corretas
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || CORRECT_URL;
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || CORRECT_KEY;

// Se detectar credenciais erradas do Bolt, usar as corretas
if (supabaseUrl.includes('0ec90b57d6e95fcbda19832f') || supabaseUrl === 'https://placeholder.supabase.co') {
  console.warn('🔄 Detectadas credenciais incorretas. Usando credenciais corretas do Supabase.');
  supabaseUrl = CORRECT_URL;
  supabaseAnonKey = CORRECT_KEY;
}

console.log('🔗 Conectando ao Supabase:', supabaseUrl);

/**
 * Sessão vencida no meio do trabalho (contagem longa, notebook que dormiu):
 * o token de acesso dura 1 hora e a renovação automática nem sempre roda a
 * tempo. Em vez de estourar "JWT expired" na cara do usuário, renova a
 * sessão e repete a chamada uma vez. Se nem a renovação funcionar, a sessão
 * acabou de verdade: desloga, e o app volta para a tela de login.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clienteRef: SupabaseClient<any, any, any> | null = null;
let renovando: Promise<string | null> | null = null;

const renovarToken = (): Promise<string | null> => {
  if (!renovando) {
    renovando = (async () => {
      try {
        const { data, error } = await clienteRef!.auth.refreshSession();
        if (error || !data.session) {
          await clienteRef!.auth.signOut();
          return null;
        }
        return data.session.access_token;
      } catch {
        return null;
      } finally {
        renovando = null;
      }
    })();
  }
  return renovando;
};

const fetchComRenovacao: typeof fetch = async (input, init) => {
  const resposta = await fetch(input, init);
  if (resposta.status !== 401 || !clienteRef) return resposta;

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/auth/v1/')) return resposta;

  let corpo = '';
  try { corpo = await resposta.clone().text(); } catch { /* sem corpo */ }
  if (!/jwt expired|PGRST301|invalid jwt|token is expired/i.test(corpo)) return resposta;

  const token = await renovarToken();
  if (!token) return resposta;

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: { fetch: fetchComRenovacao },
});
clienteRef = supabase;

// Função para testar conexão
export const testConnection = async () => {
  try {
    const { error } = await supabase
      .from('usuarios')
      .select('count')
      .limit(1);

    if (error) {
      console.warn('❌ Supabase connection test failed:', error.message);
      return false;
    }

    console.log('✅ Conexão com Supabase OK!');
    return true;
  } catch (err) {
    console.warn('❌ Supabase connection test failed:', err);
    return false;
  }
};