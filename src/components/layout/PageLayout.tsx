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

const GRADIENTS = {
  wine: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)',
  gold: 'linear-gradient(135deg, #D4AF37 0%, #b8941f 60%, #8a6f15 100%)',
  blue: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 60%, #172554 100%)',
  green: 'linear-gradient(135deg, #059669 0%, #047857 60%, #065f46 100%)',
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
      <div
        className="relative overflow-hidden"
        style={{ background: GRADIENTS[variant] }}
      >
        {/* Ruído decorativo */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Glow dourado */}
        <div
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #D4AF37, transparent 70%)' }}
        />

        <div className="relative px-6 lg:px-8 pt-7 pb-8">
          {/* Breadcrumb */}
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1.5 mb-4">
              {breadcrumb.map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <ChevronRight className="text-white/20" style={{width:'12px',height:'12px'}} />
                  )}
                  <span className={idx === breadcrumb.length - 1 ? "text-white/60 text-xs font-medium" : "text-white/30 text-xs"}>
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
                <p className="text-white/30 text-xs capitalize leading-relaxed">{hoje}</p>
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
