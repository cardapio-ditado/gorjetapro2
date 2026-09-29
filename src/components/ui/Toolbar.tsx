import React from 'react';

interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * A linha de filtros de uma tela: segmentado, chips, busca. Uma linha só,
 * que quebra no celular. Use <Toolbar.Espaco /> para empurrar o resto à direita.
 */
export const Toolbar: React.FC<ToolbarProps> & { Espaco: React.FC } = ({ children, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-3 ${className}`.trim()}>{children}</div>
);

const Espaco: React.FC = () => <div className="flex-grow" aria-hidden="true" />;
Toolbar.Espaco = Espaco;

export default Toolbar;
