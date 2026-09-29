import React from 'react';

export type ChipTom = 'neutro' | 'perigo' | 'atencao' | 'certo' | 'ouro';

interface ChipProps {
  children: React.ReactNode;
  ligado: boolean;
  onMudar: (ligado: boolean) => void;
  /** Cor quando ligado. Neutro por padrão; perigo para "negativos", atenção para "vence hoje". */
  tom?: ChipTom;
  className?: string;
}

const TOM: Record<ChipTom, string> = {
  neutro: '',
  perigo: 'chip-perigo',
  atencao: 'chip-atencao',
  certo: 'chip-certo',
  ouro: 'chip-ouro',
};

/** Filtro que liga e desliga. Vários podem estar ligados ao mesmo tempo. */
export const Chip: React.FC<ChipProps> = ({ children, ligado, onMudar, tom = 'neutro', className = '' }) => (
  <button
    type="button"
    aria-pressed={ligado}
    onClick={() => onMudar(!ligado)}
    className={`chip ${ligado ? `chip-on ${TOM[tom]}` : ''} ${className}`.trim()}
  >
    {children}
  </button>
);

export default Chip;
