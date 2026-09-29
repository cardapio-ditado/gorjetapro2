import React from 'react';

export interface Column<T = any> {
  key: string;
  label: string;
  render?: (value: any, row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  isCurrency?: boolean;
  isNumeric?: boolean;
}

interface DataTableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T, index: number) => void;
  emptyMessage?: string;
  className?: string;
  zebra?: boolean;
}

export const DataTable = <T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'Nenhum registro encontrado',
  className = '',
  zebra = true
}: DataTableProps<T>) => {
  const getAlignment = (align?: string) => {
    switch (align) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  const getCellValue = (row: T, column: Column<T>, index: number) => {
    const value = row[column.key];

    if (column.render) {
      return column.render(value, row, index);
    }

    if (column.isCurrency && typeof value === 'number') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    }

    if (column.isNumeric && typeof value === 'number') {
      return value.toLocaleString('pt-BR');
    }

    return value ?? '—';
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-2.5 ${getAlignment(column.align)}`}
                style={{ width: column.width }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={`
                  transition-colors
                  ${zebra && rowIndex % 2 === 1 ? 'bg-white/[0.02]' : ''}
                  ${onRowClick ? 'cursor-pointer hover:bg-white/[0.04]' : ''}
                `}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`
                      px-4 py-3 text-sm
                      ${getAlignment(column.align)}
                      ${column.isCurrency || column.isNumeric ? 'num font-medium' : ''}
                    `}
                    style={{ color: column.isCurrency || column.isNumeric ? 'var(--text-primary)' : 'var(--text-primary)' }}
                  >
                    {getCellValue(row, column, rowIndex)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
