import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';

export default function Login() {
  const { session, carregando, entrar } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!carregando && session) return <Navigate to="/" replace />;

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const msg = await entrar(email.trim(), senha);
    setEnviando(false);
    if (msg) {
      setErro(msg);
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-night-950 px-4">
      {/* luzes de palco */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-gold-500/10 blur-3xl animate-glow" />
        <div className="absolute -bottom-52 -left-32 h-96 w-96 rounded-full bg-amber-700/10 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-gold-600/5 blur-3xl" />
        {/* linhas finas decorativas */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-500/25 to-transparent" />
      </div>

      <div className="relative w-full max-w-md animate-fadeUp">
        <div className="mb-8 flex justify-center">
          <Logo size={110} />
        </div>

        <div className="card border-night-700/80 bg-night-850/80 p-8 backdrop-blur-sm">
          <h1 className="text-center text-lg font-semibold text-white">Acessar o sistema</h1>
          <p className="mt-1 text-center text-sm text-zinc-500">Entre com suas credenciais</p>

          <form onSubmit={aoEnviar} className="mt-6 space-y-4">
            <div>
              <label className="label">E-mail</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="input pl-9"
                  placeholder="voce@rrbares.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type={verSenha ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="input pl-9 pr-10"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {erro && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">
                {erro}
              </div>
            )}

            <button type="submit" disabled={enviando} className="btn-gold w-full py-3">
              {enviando ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-night-950/30 border-t-night-950" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          RR Bares · Eventos de bar &amp; show — acesso restrito
        </p>
      </div>
    </div>
  );
}
