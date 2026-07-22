import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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
    <div className="space-y-6 pb-16">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7D1F2C] via-[#9B2535] to-[#3d0e16] border border-[#D4AF37]/25 shadow-[0_24px_80px_rgba(125,31,44,0.45)] p-6 lg:p-8">
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%),repeating-linear-gradient(-45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%)', backgroundSize: '28px 28px' }} />
        <div className="relative">
          <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Ditado Popular</p>
          <h1 className="text-2xl font-black text-white leading-none">{saudacao()}, {primeiroNome}</h1>
          <p className="text-white/50 text-xs mt-1 capitalize">{dataLonga}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold text-white/70 mb-3 px-1">Seus módulos</p>
        {modulosDisponiveis.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-center text-white/40 text-sm">
            Nenhum módulo liberado ainda. Fale com o administrador.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modulosDisponiveis.map(m => (
              <button
                key={m.path}
                onClick={() => navigate(m.path)}
                className="glass-card rounded-2xl p-4 flex items-center gap-3 text-left hover:border-[#D4AF37]/35 transition-colors group"
              >
                <div className="p-2.5 rounded-xl bg-white/5 group-hover:bg-[#7D1F2C]/20 transition-colors">
                  <m.icon className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <span className="flex-1 text-sm font-semibold text-white">{m.name}</span>
                <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/50 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MeuPainel;
