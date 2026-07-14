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
          <tr style={{ background: 'transparent' }} className="bg-white/5 border-b border-white/10">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-white font-sans text-[11px] font-semibold uppercase tracking-wider ${getAlignment(column.align)}`}
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
                className="px-4 py-8 text-center text-white/50 font-sans text-sm"
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
                  border-b border-gray-100 transition-colors
                  ${zebra && rowIndex % 2 === 1 ? 'bg-wine/[0.03]' : 'bg-white'}
                  ${onRowClick ? 'cursor-pointer hover:bg-wine/[0.06]' : ''}
                `}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`
                      px-4 py-3 text-sm
                      ${getAlignment(column.align)}
                      ${column.isCurrency || column.isNumeric ? 'font-mono font-medium text-white' : 'font-sans text-white/60'}
                    `}
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
