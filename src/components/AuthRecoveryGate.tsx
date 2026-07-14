import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * AuthRecoveryGate
 * Intercepta a chegada por link de CONVITE ou RECUPERAÇÃO do Supabase
 * (a URL vem com type=invite ou type=recovery no hash) e força a pessoa
 * a definir a própria senha em /redefinir-senha antes de usar o sistema.
 * Deve ser renderizado DENTRO do Router, acima das rotas.
 */
export default function AuthRecoveryGate() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Caso 1: hash do link do Supabase presente na URL
    const hash = window.location.hash || '';
    const veioDeLink = hash.includes('type=invite') || hash.includes('type=recovery');
    if (veioDeLink && location.pathname !== '/redefinir-senha') {
      navigate('/redefinir-senha', { replace: true });
      return;
    }

    // Caso 2: evento do supabase-js (cobre navegadores que limpam o hash)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/redefinir-senha', { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
