import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Página /redefinir-senha
 * Destino dos links de CONVITE e de RECUPERAÇÃO de senha do Supabase.
 * A pessoa chega aqui já com sessão temporária válida (vinda do link)
 * e é obrigada a definir a própria senha antes de usar o sistema.
 */
export default function RedefinirSenha() {
  const navigate = useNavigate();
  const { refreshUsuario } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [temSessao, setTemSessao] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setTemSessao(!!data.session);
    });
  }, []);

  const salvar = async () => {
    setErro(null);
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmar) {
      setErro('As senhas não conferem.');
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSalvando(false);
      setErro('Erro ao salvar a senha: ' + error.message);
      return;
    }
    // Libera o acesso normal caso a conta tivesse senha provisória pendente
    // (sem efeito se a pessoa chegou aqui por link de convite/recuperação).
    // refreshUsuario() atualiza o perfil em memória — sem isso o App.tsx
    // continuaria vendo precisa_trocar_senha=true e bloquearia em loop.
    await supabase.rpc('fn_marcar_senha_trocada');
    await refreshUsuario();
    setSalvando(false);
    // Senha definida: limpa o hash do link e segue para o sistema
    window.history.replaceState(null, '', '/');
    navigate('/', { replace: true });
  };

  if (temSessao === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-300">
        Carregando…
      </div>
    );
  }

  if (temSessao === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-white mb-3">Link expirado</h1>
          <p className="text-gray-400 mb-6">
            Este link de acesso não é mais válido. Peça um novo convite ao
            administrador ou use "Esqueci minha senha" na tela de login.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Ir para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-white mb-1">
          Defina sua senha de acesso
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Bem-vindo ao sistema do Ditado Popular. Crie sua senha pessoal para
          continuar. Ela é individual — não compartilhe com ninguém.
        </p>

        <label className="block text-sm text-gray-300 mb-1">Nova senha</label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          className="w-full mb-4 px-4 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
        />

        <label className="block text-sm text-gray-300 mb-1">Confirmar senha</label>
        <input
          type="password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && salvar()}
          placeholder="Repita a senha"
          className="w-full mb-4 px-4 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
        />

        {erro && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
            {erro}
          </div>
        )}

        <button
          onClick={salvar}
          disabled={salvando}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
        >
          {salvando ? 'Salvando…' : 'Salvar senha e entrar'}
        </button>
      </div>
    </div>
  );
}
