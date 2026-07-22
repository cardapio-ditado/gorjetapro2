import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import Dashboard from './Dashboard';
import MeuPainel from './MeuPainel';

/**
 * Roteador da tela inicial ('/' e '/dashboard').
 * Master/admin veem o Painel do Dono (financeiro completo: caixa, CMV,
 * contas, custo RH, cachês). Demais níveis veem o MeuPainel (sem números
 * financeiros) — ambos usam moduloSlug="dashboard" no ProtectedRoute, que
 * é liberado por padrão para todo mundo; a separação de CONTEÚDO sensível
 * acontece aqui, não no gate de rota.
 */
const PainelInicial: React.FC = () => {
  const { usuario } = useAuth();
  const podeVerPainelDono = usuario?.nivel === 'master' || usuario?.nivel === 'admin';
  return podeVerPainelDono ? <Dashboard /> : <MeuPainel />;
};

export default PainelInicial;
