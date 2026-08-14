export function formatarMoeda(valor: number | null | undefined): string {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(data: string | null | undefined): string {
  if (!data) return '—';
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

// Aceita "1.234,56", "1234,56" e "1234.56"
export function parseValorBR(texto: string): number {
  const t = texto.trim();
  if (!t) return NaN;
  return t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t);
}

export function hojeISO(): string {
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  return agora.toISOString().slice(0, 10);
}
