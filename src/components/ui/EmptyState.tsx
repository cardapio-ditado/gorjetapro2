import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  /** Titulo curto — o que nao existe aqui. Sem ponto final. */
  title: string;
  /** Uma frase: por que esta vazio ou o que fazer a respeito. */
  description?: string;
  /** A acao que resolve o vazio. Omita quando nao houver o que fazer. */
  action?: { label: string; onClick: () => void };
  /** Vazio por filtro pede tom diferente de vazio por falta de cadastro. */
  variant?: 'empty' | 'filtered';
}

/**
 * Estado de vazio desenhado, no lugar da frase solta.
 *
 * Existiam 310 estados de vazio e carregamento escritos a mao pelo app, cada
 * um com sua propria cor, tamanho e espacamento. Este componente e o unico
 * lugar onde essa aparencia e decidida.
 *
 * Sem animacao: um estado de vazio nao deve chamar mais atencao que o
 * conteudo que o substitui.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  variant = 'empty',
}) => (
  <div
    className="flex flex-col items-center justify-center text-center"
    style={{ padding: 'var(--sp-12) var(--sp-6)' }}
  >
    <div
      className="flex items-center justify-center"
      style={{
        width: 56,
        height: 56,
        borderRadius: 'var(--r-pill)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)',
        marginBottom: 'var(--sp-4)',
      }}
    >
      <Icon size={22} style={{ color: 'var(--text-secondary)' }} strokeWidth={1.75} />
    </div>

    <p className="t-subsec" style={{ color: 'var(--text-primary)', margin: 0 }}>
      {title}
    </p>

    {description && (
      <p
        className="t-body"
        style={{
          color: 'var(--text-secondary)',
          margin: 'var(--sp-2) 0 0',
          maxWidth: 340,
        }}
      >
        {description}
      </p>
    )}

    {action && (
      <button
        type="button"
        onClick={action.onClick}
        className="t-label focus-ring"
        style={{
          marginTop: 'var(--sp-5)',
          padding: '9px 18px',
          borderRadius: 'var(--r-control)',
          background: variant === 'filtered' ? 'rgba(255,255,255,0.06)' : 'var(--wine)',
          border: variant === 'filtered' ? '1px solid var(--border-strong)' : '1px solid var(--wine-light)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'background var(--dur-fast) var(--ease-standard)',
        }}
      >
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;
