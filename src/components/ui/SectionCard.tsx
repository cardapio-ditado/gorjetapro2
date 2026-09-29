import React from 'react';

interface SectionCardProps {
  title?: string;
  /** Uma frase ao lado do título. */
  descricao?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

/** Um bloco da tela: título de 20px, ação à direita, conteúdo dentro do cartão. */
export const SectionCard: React.FC<SectionCardProps> = ({ title, descricao, action, children, className = '', noPadding = false }) => (
  <section className={`card ${className}`.trim()}>
    {(title || action) && (
      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          {title && <h2 className="t-subsec" style={{ color: 'var(--text-primary)', margin: 0, fontSize: 16 }}>{title}</h2>}
          {descricao && <p className="t-label" style={{ color: 'var(--text-secondary)', margin: '2px 0 0', fontWeight: 400 }}>{descricao}</p>}
        </div>
        {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-5'}>{children}</div>
  </section>
);

export default SectionCard;
