import React from 'react';
import { Video as LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  variation?: number;
  icon?: LucideIcon;
  format?: 'currency' | 'percent' | 'number';
  trend?: 'up' | 'down' | 'neutral';
}

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  variation,
  icon: Icon,
  format = 'number',
  trend
}) => {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val;

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(val);
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        return val.toLocaleString('pt-BR');
    }
  };

  const getVariationColor = () => {
    if (!variation) return '';
    if (trend === 'neutral') return 'text-text-muted';
    return variation > 0 ? 'text-success' : 'text-danger';
  };

  const VariationIcon = variation && variation > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="card p-6 hover:shadow-wine transition-all duration-200 relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-[11px] font-sans font-semibold uppercase tracking-widest text-text-secondary mb-2">
            {label}
          </p>
          <h2 className="font-display text-4xl font-bold text-white leading-none">
            {formatValue(value)}
          </h2>
        </div>

        {Icon && (
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-wine/10">
            <Icon className="text-wine" size={24} />
          </div>
        )}
      </div>

      {variation !== undefined && (
        <div className={`flex items-center gap-1.5 mt-3 ${getVariationColor()}`}>
          <VariationIcon size={16} />
          <span className="font-sans font-semibold text-sm">
            {Math.abs(variation).toFixed(1)}%
          </span>
          <span className="text-xs text-text-secondary font-sans">
            vs. período anterior
          </span>
        </div>
      )}
    </div>
  );
};

export default KPICard;
