import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export interface Usuario {
  id: string;
  nome_completo: string;
  email: string;
  nivel: 'master' | 'admin' | 'usuario' | 'visitante';
  ativo: boolean;
  ultimo_acesso?: string;
  foto_url?: string;
  telefone?: string;
  cargo?: string;
  departamento?: string;
  configuracoes?: any;
}

export interface Permissao {
  modulo_slug: string;
  aba_slug?: string;
  pode_visualizar?: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
  pode_aprovar: boolean;
}

interface AuthContextType {
  usuario: Usuario | null;
  permissoes: Permissao[];
  loading: boolean;
  error: string | null;
  login: (email: string, senha: string) => Promise<boolean>;
  logout: () => void;
  verificarPermissao: (moduloSlug: string, abaSlug?: string, acao?: string) => boolean;
  temAcessoModulo: (moduloSlug: string) => boolean;
  temAcessoAba: (moduloSlug: string, abaSlug: string) => boolean;
  isMaster: () => boolean;
  isAdmin: () => boolean;
  refreshPermissoes: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs para evitar carregamentos duplicados/concorrentes do perfil
  const usuarioRef = useRef<Usuario | null>(null);
  const carregandoPerfilRef = useRef(false);
  const mountedRef = useRef(true);

  const carregarPerfil = async (): Promise<Usuario | null> => {
    const { data: perfil, error: perfilError } = await supabase.rpc('fn_perfil_atual');
    if (perfilError) throw perfilError;
    if (!perfil || (Array.isArray(perfil) && perfil.length === 0)) return null;
    const p = Array.isArray(perfil) ? perfil[0] : perfil;
    return p as Usuario;
  };

  const loadPermissoes = async (usuarioId: string, nivel?: string) => {
    try {
      if (nivel === 'master') {
        setPermissoes([]);
        return;
      }

      const { data, error } = await supabase
        .from('vw_permissoes_usuario')
        .select('*')
        .eq('usuario_id', usuarioId);

      if (error) throw error;

      setPermissoes((data || []).map((p: any) => ({
        modulo_slug: p.modulo_slug,
        aba_slug: p.aba_slug,
        pode_visualizar: p.pode_visualizar,
        pode_criar: p.pode_criar,
        pode_editar: p.pode_editar,
        pode_excluir: p.pode_excluir,
        pode_aprovar: p.pode_aprovar
      })));
    } catch (err) {
      console.error('Erro ao carregar permissões:', err);
      setPermissoes([]);
    }
  };

  /**
   * Carrega perfil + permissões (fora da trava do gotrue).
   * Guardas: não roda em paralelo consigo mesmo e não recarrega
   * à toa quando o perfil já está em memória (ex.: TOKEN_REFRESHED).
   */
  const processarSessao = async (opts?: { forcar?: boolean }) => {
    if (carregandoPerfilRef.current) return;
    if (usuarioRef.current && !opts?.forcar) return;

    carregandoPerfilRef.current = true;
    try {
      const perfil = await carregarPerfil();
      if (!mountedRef.current) return;

      if (perfil) {
        usuarioRef.current = perfil;
        setUsuario(perfil);
        await loadPermissoes(perfil.id, perfil.nivel);
      } else {
        // Sessão válida mas conta sem acesso liberado
        await supabase.auth.signOut();
        usuarioRef.current = null;
        setUsuario(null);
        setPermissoes([]);
      }
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
    } finally {
      carregandoPerfilRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Restauração inicial da sessão
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await processarSessao();
        }
      } catch (err) {
        console.error('Erro ao restaurar sessão:', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    /**
     * REGRA DE OURO: o callback do onAuthStateChange roda SEGURANDO a
     * trava de sessão do gotrue. NUNCA usar await/chamadas ao Supabase
     * aqui dentro — isso trava o app por 5s (deadlock da trava).
     * O callback só anota o evento; o trabalho pesado é adiado com
     * setTimeout(0), que roda DEPOIS da trava ser liberada.
     */
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT' || !session) {
        usuarioRef.current = null;
        setUsuario(null);
        setPermissoes([]);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Adia para fora da trava; guardas internas evitam duplicação
        setTimeout(() => {
          if (mountedRef.current) processarSessao();
        }, 0);
      }
    });

    return () => {
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, senha: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (signInError) {
        setError('Email ou senha incorretos');
        return false;
      }

      // Carrega o perfil explicitamente (forçado) para poder responder
      // false quando a conta não tem acesso liberado
      const perfil = await carregarPerfil();

      if (!perfil) {
        await supabase.auth.signOut();
        usuarioRef.current = null;
        setError('Conta sem acesso liberado. Fale com o administrador.');
        return false;
      }

      usuarioRef.current = perfil;
      setUsuario(perfil);
      await loadPermissoes(perfil.id, perfil.nivel);

      await supabase
        .from('usuarios_sistema')
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq('id', perfil.id);

      return true;
    } catch (err) {
      console.error('Erro no login:', err);
      setError('Erro interno do sistema');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    usuarioRef.current = null;
    setUsuario(null);
    setPermissoes([]);
  };

  const isMaster = (): boolean => usuario?.nivel === 'master';

  const verificarPermissao = (moduloSlug: string, abaSlug?: string, acao = 'visualizar'): boolean => {
    if (!usuario) return false;
    if (isMaster()) return true;

    const permissao = permissoes.find(p =>
      abaSlug
        ? p.modulo_slug === moduloSlug && p.aba_slug === abaSlug
        : p.modulo_slug === moduloSlug && !p.aba_slug
    );
    if (!permissao) return false;

    switch (acao) {
      case 'visualizar': return !!permissao.pode_visualizar;
      case 'criar':      return !!permissao.pode_criar;
      case 'editar':     return !!permissao.pode_editar;
      case 'excluir':    return !!permissao.pode_excluir;
      case 'aprovar':    return !!permissao.pode_aprovar;
      default:           return false;
    }
  };

  const temAcessoModulo = (moduloSlug: string): boolean => {
    if (!usuario) return false;
    if (isMaster()) return true;
    return permissoes.some(p => p.modulo_slug === moduloSlug && (p.pode_visualizar || false));
  };

  const temAcessoAba = (moduloSlug: string, abaSlug: string): boolean => {
    if (!usuario) return false;
    if (isMaster()) return true;
    return verificarPermissao(moduloSlug, abaSlug, 'visualizar');
  };

  const isAdmin = (): boolean =>
    usuario?.nivel === 'admin' || usuario?.nivel === 'master';

  const refreshPermissoes = async (): Promise<void> => {
    if (usuario) await loadPermissoes(usuario.id, usuario.nivel);
  };

  return (
    <AuthContext.Provider value={{
      usuario, permissoes, loading, error,
      login, logout,
      verificarPermissao, temAcessoModulo, temAcessoAba,
      isMaster, isAdmin, refreshPermissoes
    }}>
      {children}
    </AuthContext.Provider>
  );
};
