import React, { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

dayjs.locale('pt-br');

interface PageLayoutProps {
  title: string;
  description: string;
  icon: LucideIcon;
  breadcrumb?: string[];
  actions?: ReactNode;
  children: ReactNode;
  variant?: 'wine' | 'gold' | 'blue' | 'green';
}

// Chapado, sem degradê: o kit não usa brilho nem gradiente.
const GRADIENTS = {
  wine: 'var(--wine)',
  gold: '#8a6f15',
  blue: '#1e3a8a',
  green: '#047857',
};

export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  description,
  icon: Icon,
  breadcrumb = [],
  actions,
  children,
  variant = 'wine'
}) => {
  const hoje = dayjs().format('dddd, D [de] MMMM [de] YYYY');

  return (
    <div className="flex flex-col min-h-screen -m-5 lg:-m-7" style={{ background: 'var(--bg-base)' }}>

      {/* HERO SECTION */}
      {/* fundo-saturado: no tema claro, o texto branco daqui continua branco */}
      <div
        className="relative overflow-hidden fundo-saturado"
        style={{ background: GRADIENTS[variant] }}
      >
        <div className="relative px-6 lg:px-8 pt-6 pb-6">
          {/* Breadcrumb */}
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4">
              {breadcrumb.map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <ChevronRight className="text-white/20" style={{width:'12px',height:'12px'}} />
                  )}
                  <span className={idx === breadcrumb.length - 1 ? "text-white/60 text-xs font-medium" : "text-white/60 text-xs"}>
                    {item}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Título + Ações */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}
              >
                <Icon className="text-white/90" style={{width:'22px',height:'22px'}} />
              </div>
              <div>
                <h1 className="text-white text-3xl font-bold leading-none tracking-tight" style={{ fontFamily: 'Playfair Display' }}>
                  {title}
                </h1>
                <p className="text-white/50 text-sm mt-1.5">{description}</p>
              </div>
            </div>

            {/* Data + Ações */}
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right flex-shrink-0">
                <p className="text-white/60 text-xs capitalize leading-relaxed">{hoje}</p>
              </div>
              {actions && (
                <div className="flex items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 px-5 lg:px-7 py-6">
        {children}
      </div>
    </div>
  );
};
