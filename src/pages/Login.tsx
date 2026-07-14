import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, LogIn, User, Lock, AlertCircle, Mail } from 'lucide-react';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [formData, setFormData] = useState({ email: '', senha: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);

    try {
      if (!formData.email || !formData.senha) {
        setLoginError('Por favor, preencha todos os campos');
        return;
      }

      if (!formData.email.includes('@')) {
        setLoginError('Por favor, insira um email válido');
        return;
      }

      const success = await login(formData.email, formData.senha);

      if (success) {
        navigate('/');
      } else {
        setLoginError(error || 'Email ou senha incorretos');
      }
    } catch (err) {
      console.error('Erro no login:', err);
      setLoginError('Erro interno do sistema. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      setLoginError('Digite um email válido');
      return;
    }

    setIsLoading(true);
    setLoginError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        resetEmail,
        { redirectTo: window.location.origin + '/redefinir-senha' }
      );

      if (resetError) throw resetError;

      setResetSent(true);
      setShowReset(false);
    } catch (err: any) {
      setLoginError('Não foi possível enviar o email de redefinição. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (loginError) setLoginError(null);
  };

  const busy = isLoading || loading;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #1a1410 0%, #2d1f1a 50%, #1a1410 100%)' }}>
      <div className="w-full max-w-md">
        {/* Logo e Título */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-2xl shadow-lg" style={{ background: 'linear-gradient(135deg, #7D1F2C, #D4AF37)' }}>
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                <span className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #7D1F2C, #D4AF37)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DP</span>
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#f5f0e8' }}>
            Ditado Popular
          </h1>
          <p className="text-sm" style={{ color: '#a89888' }}>Sistema de Gestão Integrada</p>
        </div>

        {/* Formulário de Login */}
        <div className="rounded-2xl shadow-2xl p-8" style={{ background: 'rgba(45, 35, 30, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(212, 175, 55, 0.15)' }}>
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold mb-1" style={{ color: '#f5f0e8' }}>Fazer Login</h2>
            <p className="text-sm" style={{ color: '#a89888' }}>Acesse sua conta para continuar</p>
          </div>

          {resetSent && (
            <div className="mb-6 p-4 rounded-lg flex items-start" style={{ background: 'rgba(34, 139, 87, 0.15)', border: '1px solid rgba(34, 139, 87, 0.3)' }}>
              <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
              <span className="text-sm" style={{ color: '#86efac' }}>Se o email existir, você receberá o link de redefinição.</span>
            </div>
          )}

          {(loginError || error) && (
            <div className="mb-6 p-4 rounded-lg flex items-center" style={{ background: 'rgba(125, 31, 44, 0.15)', border: '1px solid rgba(125, 31, 44, 0.3)' }}>
              <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" style={{ color: '#fca5a5' }} />
              <span className="text-sm" style={{ color: '#fca5a5' }}>{loginError || error}</span>
            </div>
          )}

          {showReset ? (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#d5c8b8' }}>Email para redefinição</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5" style={{ color: '#8a7868' }} />
                  </div>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-[#D4AF37] transition-all duration-200"
                    style={{ background: 'rgba(30, 22, 18, 0.8)', border: '1px solid rgba(212, 175, 55, 0.2)', color: '#f5f0e8' }}
                    placeholder="seu.email@ditadopopular.com"
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7D1F2C, #D4AF37)', color: '#fff' }}
              >
                {busy ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>Enviar link de redefinição</>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setShowReset(false); setLoginError(null); }}
                className="w-full text-sm transition-colors"
                style={{ color: '#a89888' }}
              >
                Voltar para o login
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#d5c8b8' }}>Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5" style={{ color: '#8a7868' }} />
                    </div>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-[#D4AF37] transition-all duration-200"
                      style={{ background: 'rgba(30, 22, 18, 0.8)', border: '1px solid rgba(212, 175, 55, 0.2)', color: '#f5f0e8' }}
                      placeholder="seu.email@ditadopopular.com"
                      required
                      disabled={busy}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#d5c8b8' }}>Senha</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5" style={{ color: '#8a7868' }} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.senha}
                      onChange={(e) => handleInputChange('senha', e.target.value)}
                      className="w-full pl-10 pr-12 py-3 rounded-xl focus:ring-2 focus:ring-[#D4AF37] transition-all duration-200"
                      style={{ background: 'rgba(30, 22, 18, 0.8)', border: '1px solid rgba(212, 175, 55, 0.2)', color: '#f5f0e8' }}
                      placeholder="••••••••"
                      required
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      disabled={busy}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" style={{ color: '#8a7868' }} />
                      ) : (
                        <Eye className="h-5 w-5" style={{ color: '#8a7868' }} />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || !formData.email || !formData.senha}
                  className="w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center hover:shadow-lg hover:scale-[1.02]"
                  style={{ background: 'linear-gradient(135deg, #7D1F2C, #D4AF37)', color: '#fff' }}
                >
                  {busy ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5 mr-2" />
                      Entrar
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setShowReset(true); setLoginError(null); setResetEmail(formData.email); }}
                  className="text-sm transition-colors hover:underline"
                  style={{ color: '#D4AF37' }}
                >
                  Esqueci minha senha
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: '#6a5a4a' }}>
            Sistema de Gestão Integrada v1.0 — © 2025 Ditado Popular
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
