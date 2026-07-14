import React from 'react';

interface SectionCardProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  action,
  children,
  className = '',
  noPadding = false
}) => {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          {title && (
            <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-secondary">
              {title}
            </h3>
          )}
          {action && (
            <div className="flex items-center gap-2">
              {action}
            </div>
          )}
        </div>
      )}

      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  );
};

export default SectionCard;
