import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  carregando: true,
  entrar: async () => null,
  sair: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const inicializou = useRef(false);

  useEffect(() => {
    if (inicializou.current) return;
    inicializou.current = true;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregando(false);
    });

    // IMPORTANTE: nunca fazer await de chamadas supabase dentro deste callback (deadlock do gotrue)
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSession) => {
      setTimeout(() => setSession(novaSession), 0);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function entrar(email: string, senha: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      if (error.message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
      return error.message;
    }
    return null;
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, carregando, entrar, sair }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
