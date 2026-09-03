// Gera src/tema-claro.css: a "pele clara" do sistema.
//
// O app foi escrito com utilitários fixos de tema escuro — text-white,
// bg-white/5, border-white/10, bg-[#12141f] — em milhares de lugares. Trocar
// tudo por token seria reescrever 35 telas. Em vez disso, este script varre o
// código, lista cada utilitário desses que está em uso e emite, para cada um,
// a regra equivalente em tema claro, escopada em [data-theme="light"] .app-shell.
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
const usados = new Set(fonte.match(/(?:hover:|focus:|group-hover:|disabled:|focus-within:)?(?:text|bg|border|divide|placeholder|ring)-(?:white|black|dark(?:-base|-card|-elevated|-surface)?|text-(?:primary|secondary|muted|disabled)|gray-[1-5]00|gold)(?:\/(?:\d+|\[[\d.]+\]))?(?![\w-])/g) || []);
const hexUsados = new Set(fonte.match(/(?:hover:)?(?:bg|border)-\[#[0-9a-fA-F]{3,8}\](?![\w-])/g) || []);

// ── Paleta clara ──
const INK = [31, 27, 26];          // #1f1b1a — texto
const SUP = '#ffffff';             // cartão
const FUNDO = '#f3f1ec';           // página (branco quente)
const FUNDO2 = '#faf9f6';          // lateral / topo

// Alfa de texto: mantém a hierarquia mas nunca cai abaixo do legível.
const alfaTexto = a => Math.min(1, 0.28 + a * 0.7).toFixed(2);
// Alfa de fundo: as superfícies sutis sobre branco precisam de MENOS opacidade.
const alfaFundo = a => Math.min(1, a * 0.85).toFixed(3);
// Alfa de borda: um pouco mais presente que no escuro, senão some no branco.
const alfaBorda = a => Math.min(1, 0.04 + a * 0.9).toFixed(3);

const rgba = (rgb, a) => `rgba(${rgb.join(',')},${a})`;

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

function regraPara(cls) {
  const { base, sel } = variante(cls);
  const seletor = sel(`.${escapar(cls)}`);
  const a = alfaDe(base);
  const prop = base.split('-')[0];
  const nome = base.replace(/^(text|bg|border|divide|placeholder|ring)-/, '').replace(/\/.*$/, '');

  let cor;
  if (nome === 'white') {
    if (prop === 'text' || prop === 'placeholder') cor = a >= 1 ? rgba(INK, 0.95) : rgba(INK, alfaTexto(a));
    else if (prop === 'bg') cor = a >= 1 ? SUP : rgba(INK, alfaFundo(a));
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
    // A escala gray do app é azulada e pensada para o escuro: como TEXTO,
    // 300/400 são claras demais sobre branco. Como fundo ou borda, ficam.
    if (prop !== 'text' || a < 1) return null;
    cor = { 'gray-100': '#2b2625', 'gray-200': '#3d3735', 'gray-300': '#4a4443', 'gray-400': '#5f5955', 'gray-500': '#6b645f' }[nome];
  } else if (nome === 'gold') {
    // Dourado sobre branco mede 2,1:1 — como texto, escurece.
    if (prop !== 'text') return null;
    cor = a >= 1 ? '#7a5f0f' : rgba([122, 95, 15], alfaTexto(a));
  }
  if (!cor) return null;

  switch (prop) {
    case 'text': return `${seletor}{color:${cor}}`;
    case 'placeholder': return `${seletor}::placeholder{color:${cor}}`;
    case 'bg': return `${seletor}{background-color:${cor}}`;
    case 'border': return `${seletor}{border-color:${cor}}`;
    case 'divide': return `${seletor}>:not([hidden])~:not([hidden]){border-color:${cor}}`;
    case 'ring': return `${seletor}{--tw-ring-color:${cor}}`;
    default: return null;
  }
}

const HEX = {
  '#12141f': SUP, '#0f1020': SUP, '#0e1019': SUP, '#101520': SUP,
  '#0d0f1a': FUNDO, '#1a1d2e': FUNDO, '#1a1c2e': FUNDO, '#0a0c14': FUNDO, '#0f0a0b': FUNDO,
  '#0c0e1a': FUNDO2, '#0c1018': FUNDO2, '#080c14': FUNDO,
};
function regraHex(cls) {
  const { base, sel } = variante(cls);
  const m = base.match(/^(bg|border)-\[(#[0-9a-fA-F]+)\]$/);
  if (!m) return null;
  let cor = HEX[m[2].toLowerCase()];
  if (!cor) return null;
  // hover sobre cartão branco: um cinza leve, não outro branco
  if (cls.startsWith('hover:') && cor === SUP) cor = FUNDO;
  const seletor = sel(`.${escapar(cls)}`);
  return m[1] === 'bg' ? `${seletor}{background-color:${cor}}` : `${seletor}{border-color:${cor}}`;
}

const regras = [];
for (const c of [...usados].sort()) { const r = regraPara(c); if (r) regras.push(r); }
for (const c of [...hexUsados].sort()) { const r = regraHex(c); if (r) regras.push(r); }

// ── Exceção: sobre fundo saturado (vinho, dourado, semáforo) o branco fica ──
// Um banner vinho com text-white continua precisando de texto branco no tema
// claro. Cada utilitário de fundo/gradiente saturado em uso vira um seletor
// de contexto dentro do qual text-white*, bg-white* e border-white* voltam ao
// valor original. Especificidade maior que a das regras acima.
const saturados = new Set(fonte.match(/(?:bg|from)-(?:wine(?:-[a-z]+)?|gold(?:-[a-z]+)?|danger|success|warning|info|(?:emerald|red|green|blue|amber|purple|sky|indigo|orange|rose|pink|teal|cyan|violet|yellow|lime)-(?:[4-9]00))(?![\w/-])/g) || []);
for (const h of hexUsados) {
  const m = h.match(/^bg-\[(#[0-9a-fA-F]+)\]$/);
  if (m && !HEX[m[1].toLowerCase()]) saturados.add(h); // hex que não é superfície escura: vinho, dourado
}
// .fundo-saturado marca, à mão, quem pinta vinho/dourado por estilo inline
// (o banner do PageLayout, por exemplo) e por isso não tem classe para pegar.
const ctx = ['.fundo-saturado', ...[...saturados].sort().map(c => '.' + escapar(c))].join(',');
const brancos = [...usados].filter(c => /^(text|bg|border|placeholder)-white(\/|$)/.test(c)).sort();
const excecoes = [];
for (const c of brancos) {
  const prop = c.split('-')[0];
  const a = alfaDe(c);
  const cor = a >= 1 ? '#ffffff' : `rgba(255,255,255,${a})`;
  const decl = prop === 'text' ? `color:${cor}` : prop === 'placeholder' ? null : prop === 'bg' ? `background-color:${cor}` : `border-color:${cor}`;
  if (!decl) continue;
  const alvo = '.' + escapar(c);
  excecoes.push(`:is(${ctx}) ${alvo}{${decl}}`);
  excecoes.push(`:is(${ctx})${alvo}{${decl}}`);
}
regras.push(...excecoes);

const ESCOPO = '[data-theme="light"] .app-shell ';
const css = `/* GERADO por scripts/gerar-tema-claro.mjs — não edite à mão.
 * A pele clara do sistema: cada utilitário de tema escuro em uso no código
 * ganha aqui o equivalente claro, escopado ao shell dos módulos.
 * ${regras.length} regras. */
${regras.map(r => ESCOPO + r).join('\n')}
`;
writeFileSync(join(RAIZ, 'tema-claro.css'), css);
console.log(`src/tema-claro.css: ${regras.length} regras (${usados.size} utilitários, ${hexUsados.size} hex).`);
