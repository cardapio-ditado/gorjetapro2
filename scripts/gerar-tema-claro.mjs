// Gera src/tema-claro.css: a "pele clara" do sistema.
//
// O app foi escrito com utilitários fixos de tema escuro — text-white,
// bg-white/5, border-white/10, bg-[#12141f], from-emerald-900/40 — em
// milhares de lugares, e com fundos escuros por estilo inline. Trocar tudo por
// token seria reescrever 35 telas. Em vez disso, este script varre o código,
// lista cada utilitário desses que está em uso e emite, para cada um, a regra
// equivalente em tema claro, escopada em [data-theme="light"] .app-shell.
// Login e Saguão ficam fora do escopo: são arte sobre foto, não têm tema.
//
// Rodar sempre que novos utilitários aparecerem:  node scripts/gerar-tema-claro.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = new URL('../src/', import.meta.url).pathname;

function arquivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(tsx|ts|jsx|js)$/.test(n) ? [p] : [];
  });
}

const fonte = arquivos(RAIZ).map(f => readFileSync(f, 'utf8')).join('\n');

// ── Paleta clara ──
const INK = [31, 27, 26];          // #1f1b1a — texto
const SUP = '#ffffff';             // cartão
const FUNDO = '#f3f1ec';           // página (branco quente)
const FUNDO2 = '#faf9f6';          // lateral / topo

// Tailwind (v3) — as cores cromáticas que o app usa. 500 é a "cor da cor";
// 700/800 são o que ela vira como texto sobre branco.
const PALETA = {
  emerald: { 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46' },
  green:   { 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534' },
  red:     { 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b' },
  amber:   { 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e' },
  yellow:  { 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e' },
  orange:  { 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412' },
  blue:    { 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af' },
  sky:     { 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985' },
  indigo:  { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3' },
  purple:  { 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8' },
  violet:  { 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6' },
  pink:    { 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d' },
  rose:    { 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239' },
  teal:    { 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59' },
  cyan:    { 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75' },
  lime:    { 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212' },
  slate:   { 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b' },
  zinc:    { 500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a' },
  neutral: { 500: '#737373', 600: '#525252', 700: '#404040', 800: '#262626' },
  stone:   { 500: '#78716c', 600: '#57534e', 700: '#44403c', 800: '#292524' },
};
const CROMATICAS = Object.keys(PALETA).join('|');

const usados = new Set(fonte.match(new RegExp(`(?:hover:|focus:|group-hover:|disabled:|focus-within:)?(?:text|bg|border|divide|placeholder|ring|from|via|to)-(?:white|black|dark(?:-base|-card|-elevated|-surface)?|text-(?:primary|secondary|muted|disabled)|gray-[1-9]00|gray-750|gold|(?:${CROMATICAS})-[1-9]00|(?:${CROMATICAS})-950)(?:\\/(?:\\d+|\\[[\\d.]+\\]))?(?![\\w-])`, 'g')) || []);
const hexUsados = new Set(fonte.match(/(?:hover:)?(?:bg|border|from|via|to)-\[#[0-9a-fA-F]{3,8}\](?![\w-])/g) || []);

// Alfa de texto: mantém a hierarquia mas nunca cai abaixo do legível.
const alfaTexto = a => Math.min(1, 0.28 + a * 0.7).toFixed(2);
// Alfa de fundo: as superfícies sutis sobre branco precisam de MENOS opacidade.
const alfaFundo = a => Math.min(1, a * 0.85).toFixed(3);
// Alfa de borda: um pouco mais presente que no escuro, senão some no branco.
const alfaBorda = a => Math.min(1, 0.04 + a * 0.9).toFixed(3);

const rgba = (rgb, a) => `rgba(${rgb.join(',')},${a})`;
const hexRgb = h => { const s = h.replace('#', ''); const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)); };
const rgbSerializado = h => `rgb(${hexRgb(h).join(', ')})`;

function escapar(cls) {
  return cls.replace(/[/:\[\]#.]/g, c => '\\' + c);
}

function variante(cls) {
  const m = cls.match(/^(hover|focus|group-hover|disabled|focus-within):(.*)$/);
  if (!m) return { base: cls, sel: s => s };
  const [, v, base] = m;
  const sufixo = { hover: ':hover', focus: ':focus', disabled: ':disabled', 'focus-within': ':focus-within' }[v];
  if (v === 'group-hover') return { base, sel: s => `.group:hover ${s}` };
  return { base, sel: s => `${s}${sufixo}` };
}

function alfaDe(base) {
  const m = base.match(/\/(\d+|\[([\d.]+)\])$/);
  if (!m) return 1;
  return m[2] !== undefined ? parseFloat(m[2]) : parseInt(m[1]) / 100;
}

function decl(prop, seletor, cor, extra = '') {
  switch (prop) {
    case 'text': return `${seletor}{color:${cor}}`;
    case 'placeholder': return `${seletor}::placeholder{color:${cor}}`;
    case 'bg': return `${seletor}{background-color:${cor}${extra}}`;
    case 'border': return `${seletor}{border-color:${cor}}`;
    case 'divide': return `${seletor}>:not([hidden])~:not([hidden]){border-color:${cor}}`;
    case 'ring': return `${seletor}{--tw-ring-color:${cor}}`;
    // gradiente escuro vira superfície chapada clara
    case 'from': case 'via': case 'to': return `${seletor}{background-image:none;background-color:${cor}}`;
    default: return null;
  }
}

function regraPara(cls) {
  const { base, sel } = variante(cls);
  const seletor = sel(`.${escapar(cls)}`);
  const a = alfaDe(base);
  const prop = base.split('-')[0];
  const nome = base.replace(/^(text|bg|border|divide|placeholder|ring|from|via|to)-/, '').replace(/\/.*$/, '');

  // ── cromáticas (emerald-900/40, text-sky-300, border-red-800...) ──
  const crom = nome.match(new RegExp(`^(${CROMATICAS})-(\\d{3})$`));
  if (crom) {
    const [, cor, tomStr] = crom;
    const tom = parseInt(tomStr);
    const p = PALETA[cor];
    if (prop === 'text' || prop === 'placeholder') {
      // tons claros (200-400) são texto sobre escuro; sobre branco viram 700/800
      if (tom <= 200) return decl(prop, seletor, p[800]);
      if (tom <= 400) return decl(prop, seletor, p[700]);
      if (tom === 500) return decl(prop, seletor, p[600]);
      return null; // 600+ já lê sobre branco
    }
    if (prop === 'bg' || prop === 'from' || prop === 'via' || prop === 'to') {
      // fundos escuros tingidos (700-950) viram tinta leve da mesma cor
      if (tom >= 700) return decl(prop, seletor, rgba(hexRgb(p[500]), (a < 1 ? Math.min(0.22, a * 0.4) : 0.12).toFixed(3)));
      return null; // 500/600 com alfa baixo já é tinta; opaco é semáforo, fica
    }
    if (prop === 'border' || prop === 'divide' || prop === 'ring') {
      if (tom >= 600) return decl(prop, seletor, rgba(hexRgb(p[500]), (a < 1 ? Math.max(0.25, a) : 0.35).toFixed(2)));
      return null;
    }
    return null;
  }

  let cor;
  if (nome === 'white') {
    if (prop === 'text' || prop === 'placeholder') cor = a >= 1 ? rgba(INK, 0.95) : rgba(INK, alfaTexto(a));
    else if (prop === 'bg' || prop === 'from' || prop === 'via' || prop === 'to') cor = a >= 1 ? SUP : rgba(INK, alfaFundo(a));
    else cor = a >= 1 ? rgba(INK, 0.2) : rgba(INK, alfaBorda(a));
  } else if (nome === 'black') {
    return null; // preto sobre claro continua fazendo sentido (sombras, véus)
  } else if (nome.startsWith('dark')) {
    cor = { dark: FUNDO2, 'dark-base': FUNDO, 'dark-card': SUP, 'dark-elevated': FUNDO2, 'dark-surface': FUNDO }[nome];
    if (prop === 'text') cor = rgba(INK, 0.95);
    if (prop === 'ring') cor = SUP;
  } else if (nome.startsWith('text-')) {
    cor = { 'text-primary': rgba(INK, 0.95), 'text-secondary': '#5f5955', 'text-muted': '#a8a09b', 'text-disabled': '#cfc9c3' }[nome];
  } else if (nome.startsWith('gray-')) {
    // A escala gray do app é azulada e pensada para o escuro.
    const tom = parseInt(nome.slice(5));
    if (prop === 'text') {
      if (a < 1) return null;
      cor = { 100: '#2b2625', 200: '#3d3735', 300: '#4a4443', 400: '#5f5955', 500: '#6b645f' }[tom];
      if (!cor) return null; // 600+ já é escuro
    } else if (prop === 'bg' || prop === 'from' || prop === 'via' || prop === 'to') {
      if (tom < 600) return null;
      cor = a < 1 ? rgba(INK, Math.min(0.12, a * 0.4).toFixed(3)) : { 600: '#e8e4dd', 700: '#eeeae4', 750: '#f1eee8', 800: '#f3f1ec', 900: '#faf9f6' }[tom] || FUNDO;
    } else if (prop === 'border' || prop === 'divide') {
      if (tom < 500) return null;
      cor = rgba(INK, a < 1 ? Math.max(0.1, a * 0.5).toFixed(2) : 0.14);
    } else return null;
  } else if (nome === 'gold') {
    // Dourado sobre branco mede 2,1:1 — como texto, escurece.
    if (prop !== 'text') return null;
    cor = a >= 1 ? '#7a5f0f' : rgba([122, 95, 15], alfaTexto(a));
  }
  if (!cor) return null;
  return decl(prop, seletor, cor);
}

// Superfícies escuras fixas (hex) — e o que viram no claro.
const HEX = {
  '#12141f': SUP, '#0f1020': SUP, '#0e1019': SUP, '#101520': SUP, '#151d2e': SUP, '#1f2937': SUP,
  '#0d0f1a': FUNDO, '#1a1d2e': FUNDO, '#1a1c2e': FUNDO, '#0a0c14': FUNDO, '#0f0a0b': FUNDO, '#1a1020': FUNDO, '#12172a': FUNDO, '#1a1f35': FUNDO, '#0d1020': FUNDO,
  '#0c0e1a': FUNDO2, '#0c1018': FUNDO2, '#080c14': FUNDO, '#141a28': FUNDO2, '#1a2235': FUNDO,
};
function regraHex(cls) {
  const { base, sel } = variante(cls);
  const m = base.match(/^(bg|border|from|via|to)-\[(#[0-9a-fA-F]+)\]$/);
  if (!m) return null;
  let cor = HEX[m[2].toLowerCase()];
  if (!cor) return null;
  if (cls.startsWith('hover:') && cor === SUP) cor = FUNDO; // hover sobre cartão branco: cinza leve
  const seletor = sel(`.${escapar(cls)}`);
  return decl(m[1], seletor, cor);
}

const regras = [];
for (const c of [...usados].sort()) { const r = regraPara(c); if (r) regras.push(r); }
for (const c of [...hexUsados].sort()) { const r = regraHex(c); if (r) regras.push(r); }

// ── Fundos escuros por estilo inline ──
// React serializa `background: '#12141f'` como `background: rgb(18, 20, 31)`;
// o seletor de atributo pega isso. !important porque inline ganha de classe.
for (const [hex, cor] of Object.entries(HEX)) {
  const rgb = rgbSerializado(hex);
  regras.push(`[style*="${rgb}"]{background:${cor} !important}`);
}

// ── Exceção: sobre fundo saturado (vinho, dourado, semáforo) o branco fica ──
// Um banner vinho com text-white continua precisando de texto branco no tema
// claro. Cada utilitário de fundo/gradiente saturado em uso vira um seletor
// de contexto dentro do qual text-white*, bg-white* e border-white* voltam ao
// valor original. Especificidade maior que a das regras acima.
const saturados = new Set(fonte.match(new RegExp(`(?:bg|from)-(?:wine(?:-[a-z]+)?|gold(?:-[a-z]+)?|danger|success|warning|info|(?:${CROMATICAS})-(?:[4-9]00))(?![\\w/-])`, 'g')) || []);
for (const h of hexUsados) {
  const m = h.match(/^(?:bg|from|via|to)-\[(#[0-9a-fA-F]+)\]$/);
  if (m && !HEX[m[1].toLowerCase()]) saturados.add(h); // hex que não é superfície escura: vinho, dourado
}
// .fundo-saturado marca à mão quem pinta vinho/dourado por estilo inline; os
// seletores de atributo pegam os gradientes inline com vinho/dourado sem marca.
const ctx = [
  '.fundo-saturado',
  '[style*="rgb(125, 31, 44)"]', '[style*="rgb(212, 175, 55)"]', '[style*="rgb(90, 21, 32)"]', '[style*="rgb(155, 37, 53)"]', '[style*="var(--wine)"]',
  '[style*="rgb(26, 42, 74)"]', // o banner azul-marinho do De Ville
  ...[...saturados].sort().map(c => '.' + escapar(c)),
].join(',');
const brancos = [...usados].filter(c => /^(text|bg|border|placeholder)-white(\/|$)/.test(c)).sort();
for (const c of brancos) {
  const prop = c.split('-')[0];
  const a = alfaDe(c);
  const cor = a >= 1 ? '#ffffff' : `rgba(255,255,255,${a})`;
  const d = prop === 'text' ? `color:${cor}` : prop === 'placeholder' ? null : prop === 'bg' ? `background-color:${cor}` : `border-color:${cor}`;
  if (!d) continue;
  const alvo = '.' + escapar(c);
  regras.push(`:is(${ctx}) ${alvo}{${d}}`);
  regras.push(`:is(${ctx})${alvo}{${d}}`);
}

const ESCOPO = '[data-theme="light"] .app-shell ';
const css = `/* GERADO por scripts/gerar-tema-claro.mjs — não edite à mão.
 * A pele clara do sistema: cada utilitário de tema escuro em uso no código
 * ganha aqui o equivalente claro, escopado ao shell dos módulos.
 * ${regras.length} regras. */
${regras.map(r => ESCOPO + r).join('\n')}
`;
writeFileSync(join(RAIZ, 'tema-claro.css'), css);
console.log(`src/tema-claro.css: ${regras.length} regras (${usados.size} utilitários, ${hexUsados.size} hex).`);
