import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  divider?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  divider = true
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <h1 className="font-display text-3xl font-bold text-white leading-tight mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="font-sans text-sm text-white/60 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {divider && (
        <div className="divider-gold" />
      )}
    </div>
  );
};

export default PageHeader;
