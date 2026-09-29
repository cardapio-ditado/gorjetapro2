import React from 'react';

interface PageHeaderProps {
  /** Título da página, serifado, 28px. Nomeia a tela, não a explica. */
  title: string;
  /** Uma frase: o que a tela faz ou quando foi atualizada. */
  subtitle?: string;
  /** Botões à direita. No máximo um primário. */
  actions?: React.ReactNode;
  /** Caminho acima do título: ['Estoque', 'Posição do estoque']. */
  caminho?: string[];
  /** Fio dourado abaixo. Desligado por padrão no layout novo. */
  divider?: boolean;
}

/**
 * O cabeçalho de toda tela, sempre na mesma ordem: caminho, título e frase à
 * esquerda, ações à direita. Depois dele vêm os números (KPICard), a linha de
 * filtros (Toolbar) e a lista.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, caminho, divider = false }) => (
  <div className="mb-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {caminho && caminho.length > 0 && (
          <p className="t-label flex items-center gap-2 mb-1" style={{ color: 'var(--text-secondary)', fontWeight: 500, margin: '0 0 4px' }}>
            {caminho.map((parte, i) => (
              <React.Fragment key={`${parte}-${i}`}>
                {i > 0 && <span aria-hidden="true" style={{ opacity: 0.5 }}>/</span>}
                <span style={i === caminho.length - 1 ? { color: 'var(--text-primary)' } : undefined}>{parte}</span>
              </React.Fragment>
            ))}
          </p>
        )}
        <h1 className="t-title" style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>{title}</h1>
        {subtitle && <p className="t-body" style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
    {divider && <div className="divider-gold mt-4" />}
  </div>
);

export default PageHeader;
