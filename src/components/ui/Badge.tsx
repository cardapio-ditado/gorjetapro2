import React from 'react';

export type BadgeVariante = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'gold' | 'wine' | 'default';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariante;
  className?: string;
}

const CLASSE: Record<BadgeVariante, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
  gold: 'badge-gold',
  wine: 'badge-wine',
  default: 'badge-neutral',
};

/** Etiqueta de estado: pago, vence hoje, atrasado, rascunho. Pílula de 24px. */
export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => (
  <span className={`badge ${CLASSE[variant]} ${className}`.trim()}>{children}</span>
);

export default Badge;
