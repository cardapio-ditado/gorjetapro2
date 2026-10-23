import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import PortalGestor from './PortalGestor';
import MeuPainel from './MeuPainel';

/**
 * Roteador da tela inicial ('/' e '/dashboard').
 * Os gestores (configuracoes_sistema.portal_gestores) veem o Portal do
 * Gestor; quem é master/admin mas não está na lista cai no MeuPainel pelo
 * próprio Portal (a função do banco responde gestor:false). Os demais níveis
 * vão direto ao MeuPainel, sem números financeiros.
 */
const PainelInicial: React.FC = () => {
  const { usuario } = useAuth();
  const podeSerGestor = usuario?.nivel === 'master' || usuario?.nivel === 'admin';
  return podeSerGestor ? <PortalGestor /> : <MeuPainel />;
};

export default PainelInicial;
