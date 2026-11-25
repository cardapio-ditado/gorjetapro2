import type { Produto } from './api';

const fmtBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "64,90" */
export const reais = (v: number) => fmtBRL.format(Number(v) || 0);
/** "R$ 64,90" */
export const rs = (v: number) => `R$ ${reais(v)}`;

/** Desconto anunciado: sempre arredondado para baixo (nunca maior que o real). */
export const pctDesconto = (de: number, por: number) => Math.max(0, Math.floor((1 - por / de) * 100));
/** Bônus do vale de crédito: +25% */
export const pctBonus = (p: Produto) => (p.credito_valor ? Math.floor((p.credito_valor / p.preco_por - 1) * 100) : 0);

export const soDigitos = (s: string) => s.replace(/\D/g, '');

export function mascaraCPF(s: string) {
  const d = soDigitos(s).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function cpfValido(s: string) {
  const d = soDigitos(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function mascaraCelular(s: string) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascaraData(s: string) {
  const d = soDigitos(s).slice(0, 8);
  return d.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
}

/** "dd/mm/aaaa" → "aaaa-mm-dd" (null se a data não existe) */
export function dataISO(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(aaaa) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  if (Number(aaaa) < 1900 || d > new Date()) return null;
  return `${aaaa}-${mm}-${dd}`;
}

export function idade(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  const hoje = new Date();
  let i = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) i--;
  return i;
}

/** "2027-05-25" → "25/05/2027" */
export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Hora de Cuiabá de um instante: "23h59" */
export const horaCuiaba = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(iso)).replace(':', 'h');

/** Dia de Cuiabá: "27/11" */
export const diaCuiaba = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba', day: '2-digit', month: '2-digit' }).format(new Date(iso));

export function partesTempo(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export const WHATSAPP_PADRAO = '556541413655';
export const linkWhats = (numero: string, texto?: string) =>
  `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
export const linkWhatsLivre = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/** Guarda utm_source, utm_campaign e seg da primeira visita (medição por origem). */
export function lerOrigem(): Record<string, string> {
  try {
    const salvo = JSON.parse(sessionStorage.getItem('vale_origem') || 'null');
    if (salvo) return salvo;
    const q = new URLSearchParams(window.location.search);
    const o: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_campaign', 'utm_medium', 'seg']) { const v = q.get(k); if (v) o[k] = v.slice(0, 80); }
    sessionStorage.setItem('vale_origem', JSON.stringify(o));
    return o;
  } catch { return {}; }
}
