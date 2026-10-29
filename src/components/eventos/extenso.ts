/** Números, valores e datas por extenso, para o contrato. */

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number, feminino = false): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(feminino ? CENTENAS[c].replace(/entos$/, 'entas') : CENTENAS[c]);
  if (r) {
    let t: string;
    if (r < 20) t = UNIDADES[r];
    else t = DEZENAS[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNIDADES[r % 10] : '');
    if (feminino) t = t.replace(/\bum$/, 'uma').replace(/\bdois$/, 'duas');
    partes.push(t);
  }
  return partes.join(' e ');
}

/** Inteiro por extenso (até 999.999.999). feminino: "duzentas e vinte" (pessoas). */
export function inteiroPorExtenso(n: number, feminino = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1_000_000), milhares = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  const grupos: string[] = [];
  if (milhoes) grupos.push(milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`);
  if (milhares) grupos.push(milhares === 1 ? 'mil' : `${ate999(milhares, feminino)} mil`);
  if (resto) grupos.push(ate999(resto, feminino));
  // "mil e cem", "dois mil e trinta"; mas "mil cento e vinte"
  if (grupos.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    const ultimo = grupos.pop()!;
    return `${grupos.join(', ')} e ${ultimo}`;
  }
  return grupos.join(' ');
}

/** 7700 → "sete mil e setecentos reais"; 35.5 → "trinta e cinco reais e cinquenta centavos". */
export function reaisPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotais / 100), centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais) {
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${inteiroPorExtenso(reais)}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.length ? partes.join(' e ') : 'zero real';
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** '2026-11-14' → Date local (sem fuso). */
export function dataLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}
export const dataPorExtenso = (iso: string) => { const d = dataLocal(iso); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
export const diaEMes = (iso: string) => { const d = dataLocal(iso); return `${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const diaDaSemana = (iso: string) => DIAS[dataLocal(iso).getDay()];

/** '11:00' → '11h'; '15:30' → '15h30'. */
export const hora = (h: string | null | undefined) => {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return `${Number(hh)}h${mm && mm !== '00' ? mm : ''}`;
};

export const soDigitos = (s: string) => (s || '').replace(/\D/g, '');

export function formatarDocumento(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}
export const formatarCep = (cep: string) => { const d = soDigitos(cep); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : cep; };

/** Confere os dígitos verificadores de CPF (11) ou CNPJ (14). */
export function documentoValido(doc: string): boolean {
  const d = soDigitos(doc);
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[pesos.length - n + i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}
