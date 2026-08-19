import React from 'react';

/**
 * Esqueleto de carregamento.
 *
 * Substitui o "Carregando..." em texto e o disco girando. A regra e imitar a
 * FORMA do conteudo que vem: uma tabela carrega como tabela, um card como
 * card. Assim o layout nao salta quando o dado chega.
 *
 * A animacao da faixa vive em .skeleton (src/index.css) e e desligada por
 * prefers-reduced-motion.
 */

/** Faixa avulsa. Use quando a forma nao for tabela nem card. */
export const SkeletonLine: React.FC<{ width?: number | string; height?: number }> = ({
  width = '100%',
  height = 12,
}) => <div className="skeleton" style={{ width, height }} />;

interface TableSkeletonProps {
  /** Quantas linhas desenhar. Use o tamanho tipico da lista, nao o maximo. */
  rows?: number;
  /** Larguras relativas das colunas, em porcentagem. Define o ritmo. */
  cols?: number[];
}

/** Esqueleto com forma de tabela: cabecalho mais linhas. */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  cols = [14, 42, 14, 14, 16],
}) => (
  <div aria-busy="true" aria-live="polite">
    {/* cabecalho */}
    <div
      className="flex items-center"
      style={{
        gap: 'var(--sp-4)',
        padding: 'var(--sp-3) var(--sp-4)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {cols.map((w, i) => (
        <div key={i} style={{ width: `${w}%` }}>
          <div className="skeleton" style={{ height: 9, width: '62%' }} />
        </div>
      ))}
    </div>

    {/* linhas */}
    {Array.from({ length: rows }).map((_, r) => (
      <div
        key={r}
        className="flex items-center"
        style={{
          gap: 'var(--sp-4)',
          padding: 'var(--sp-3) var(--sp-4)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {cols.map((w, c) => (
          <div key={c} style={{ width: `${w}%` }}>
            <div className="skeleton" style={{ height: 11, width: c === 1 ? '80%' : '68%' }} />
            {c === 0 && (
              <div className="skeleton" style={{ height: 8, width: '40%', marginTop: 4 }} />
            )}
          </div>
        ))}
      </div>
    ))}
  </div>
);

/** Esqueleto com forma de card de indicador. */
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{
          padding: 'var(--sp-4)',
          borderRadius: 'var(--r-card)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="skeleton" style={{ height: 9, width: '45%' }} />
        <div className="skeleton" style={{ height: 24, width: '70%', marginTop: 'var(--sp-3)' }} />
        <div className="skeleton" style={{ height: 8, width: '35%', marginTop: 'var(--sp-2)' }} />
      </div>
    ))}
  </>
);

export default TableSkeleton;
