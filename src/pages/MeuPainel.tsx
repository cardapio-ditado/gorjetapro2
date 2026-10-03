import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Inbox } from 'lucide-react';
import { EmptyState, PageHeader, SectionCard } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { MODULES } from '../components/layout/SidebarModern';

/**
 * Painel inicial de quem NÃO é master/admin (nível 'usuario'/'visitante').
 * Propositalmente simples: sem nenhum número financeiro (caixa, CMV,
 * contas, custo RH) — isso é do Painel do Dono, restrito a master/admin.
 * Aqui é só saudação + atalhos para os módulos que a pessoa realmente usa.
 */
const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

const MeuPainel: React.FC = () => {
  const { usuario, temAcessoModulo } = useAuth();
  const navigate = useNavigate();

  const primeiroNome = usuario?.nome_completo?.split(' ')[0] || '';
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  // Módulos de trabalho (exclui o próprio Dashboard e duplicatas de slug)
  const vistos = new Set<string>();
  const modulosDisponiveis = MODULES.filter(m => {
    if (m.slug === 'dashboard') return false;
    if (!temAcessoModulo(m.slug)) return false;
    if (vistos.has(m.path)) return false;
    vistos.add(m.path);
    return true;
  });

  return (
    <div className="max-w-5xl">
      <PageHeader caminho={['Início']} title={`${saudacao()}, ${primeiroNome}`} subtitle={dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)} />
      <SectionCard title="Seus módulos" descricao="O que você usa no dia a dia." noPadding>
        {modulosDisponiveis.length === 0 ? <div className="p-4"><EmptyState icon={Inbox} title="Nenhum módulo liberado ainda" description="Fale com o administrador." compact /></div>
          : modulosDisponiveis.map(m => (
            <button key={m.path} type="button" onClick={() => navigate(m.path)} className="w-full flex items-center gap-3 px-5 min-h-12 py-2 text-left hover:bg-white/[0.04] focus-ring" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <m.icon size={16} aria-hidden="true" style={{ color: 'var(--gold)' }} />
              <span className="flex-1 t-body" style={{ fontWeight: 600 }}>{m.name}</span>
              <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />
            </button>
          ))}
      </SectionCard>
    </div>
  );
};

export default MeuPainel;
