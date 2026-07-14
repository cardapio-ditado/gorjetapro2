import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Lock, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  moduloSlug: string;
  abaSlug?: string;
  acao?: 'visualizar' | 'criar' | 'editar' | 'excluir' | 'aprovar';
  fallback?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  moduloSlug,
  abaSlug,
  acao = 'visualizar',
  fallback
}) => {
  const { usuario, verificarPermissao, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Lock className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Acesso Negado</h3>
          <p className="text-gray-500">
            Você precisa estar logado para acessar esta funcionalidade.
          </p>
        </div>
      </div>
    );
  }

  // Master tem acesso total
  if (usuario.nivel === 'master') {
    return <>{children}</>;
  }

  // Verificar permissão específica
  const temPermissao = verificarPermissao(moduloSlug, abaSlug, acao);

  if (!temPermissao) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Acesso Negado</h3>
          <p className="text-gray-500">
            Você não tem permissão para {acao} neste módulo.
          </p>
          <div className="mt-4 text-sm text-gray-400">
            <p>Módulo: {moduloSlug}</p>
            {abaSlug && <p>Aba: {abaSlug}</p>}
            <p>Ação: {acao}</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;