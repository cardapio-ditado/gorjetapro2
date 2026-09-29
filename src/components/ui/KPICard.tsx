import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';

export type KPITom = 'normal' | 'destaque' | 'alerta' | 'atencao' | 'certo';

interface KPICardProps {
  /** Rótulo em 12px acima do número. (`label` é o nome antigo, ainda aceito.) */
  rotulo?: string;
  label?: string;
  /** O número, 26px. (`value` é o nome antigo.) */
  valor?: string | number;
  value?: string | number;
  /** Uma frase de 12px abaixo do número: "600 itens ativos". */
  detalhe?: string;
  /** Cor do número: destaque = ouro, alerta = vermelho, atenção = âmbar, certo = verde. */
  tom?: KPITom;
  /** Formata números: moeda, percentual ou inteiro. */
  format?: 'currency' | 'percent' | 'number';
  /** Variação em % contra o período anterior; positiva é verde. */
  variation?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
  /** Clicável: vira botão e mostra a seta. */
  onClick?: () => void;
  className?: string;
}

const COR: Record<KPITom, string> = {
  normal: 'var(--text-primary)',
  destaque: 'var(--gold)',
  alerta: '#f87171',
  atencao: '#fbbf24',
  certo: '#34d399',
};

function formatar(val: string | number, format: KPICardProps['format']): string {
  if (typeof val === 'string') return val;
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    case 'percent':
      return `${val.toFixed(1)}%`;
    default:
      return val.toLocaleString('pt-BR');
  }
}

/**
 * O número que importa, num cartão: rótulo, valor, detalhe. Até quatro por
 * tela, sempre logo abaixo do cabeçalho.
 */
export const KPICard: React.FC<KPICardProps> = ({
  rotulo, label, valor, value, detalhe, tom = 'normal', format = 'number', variation, trend, icon: Icon, onClick, className = '',
}) => {
  const titulo = rotulo ?? label ?? '';
  const numero = valor ?? value ?? '—';
  const corVariacao = trend === 'neutral' ? 'var(--text-secondary)' : (variation ?? 0) >= 0 ? '#34d399' : '#f87171';
  const IconeVariacao = (variation ?? 0) >= 0 ? TrendingUp : TrendingDown;

  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="t-label" style={{ color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>{titulo}</p>
        {onClick ? <ChevronRight size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" /> : Icon ? <Icon size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" /> : null}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: COR[tom], fontVariantNumeric: 'tabular-nums' }}>
        {formatar(numero, format)}
      </p>
      {detalhe && <p className="t-label" style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 400 }}>{detalhe}</p>}
      {variation !== undefined && (
        <p className="t-label flex items-center gap-1" style={{ color: corVariacao, margin: '6px 0 0' }}>
          <IconeVariacao size={14} aria-hidden="true" />
          {Math.abs(variation).toFixed(1)}%
          <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>vs. período anterior</span>
        </p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`kpi-card text-left w-full focus-ring transition-colors hover:bg-white/[0.03] ${className}`.trim()}>
        {conteudo}
      </button>
    );
  }
  return <div className={`kpi-card ${className}`.trim()}>{conteudo}</div>;
};

export default KPICard;
