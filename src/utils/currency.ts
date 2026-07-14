// Formatação de moeda para pt-BR (BRL)
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Formatação de porcentagem
const formatPercentage = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
};

// Função para parsing de valores monetários
const parseCurrency = (value: string): number => {
  if (!value) return 0;
  
  // Remove caracteres não numéricos exceto vírgula e ponto
  const cleanValue = value.replace(/[^0-9,.]/g, '');
  
  // Substitui vírgula por ponto para parsing
  const normalizedValue = cleanValue.replace(',', '.');
  
  return parseFloat(normalizedValue) || 0;
};