import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Função para testar conexão
export const testConnection = async () => {
  try {
    const { data, error } = await supabase
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