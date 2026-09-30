// Gera src/pele.css: a pele padrão do sistema, aplicada a TODAS as telas.
//
// As telas foram escritas com cor, sombra e degradê cravados no código
// (bg-[#12141f] 450 vezes, text-white/60 1.350 vezes, 85 degradês, 82 blurs).
// Trocar tudo à mão seria reescrever 180 telas. Em vez disso, este script varre
// o código e emite, para cada utilitário cravado em uso, a regra que o leva ao
// padrão do kit (src/index.css): três superfícies, uma borda, texto secundário
// legível, sem sombra, sem brilho, sem degradê. Escopado em .app-shell: Login
// e Saguão são arte sobre foto e ficam fora.
//
// Rodar sempre que novos utilitários aparecerem:  node scripts/gerar-pele.mjs
// (o tema claro, src/tema-claro.css, vem depois e sobrepõe o que precisar).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = new URL('../src/', import.meta.url).pathname;

function arquivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'estoque-beta2' ? [] : arquivos(p);
    return /\.(tsx|ts|jsx|js)$/.test(n) ? [p] : [];
  });
}
const fonte = arquivos(RAIZ).map(f => readFileSync(f, 'utf8')).join('\n');

// ── Superfícies cravadas → token ──
const CARTAO = ['#12141f', '#0f1020', '#0e1019', '#101520', '#151d2e', '#1f2937', '#1a1d2b'];
const FUNDO = ['#0d0f1a', '#1a1d2e', '#1a1c2e', '#0a0c14', '#0f0a0b', '#1a1020', '#12172a', '#1a1f35', '#0d1020', '#080c14', '#1a2235'];
const LATERAL = ['#0c0e1a', '#0c1018', '#141a28'];
const VINHO = { '#6a1a25': 'var(--wine-deep)', '#5a1720': 'var(--wine-deep)', '#5a1520': 'var(--wine-deep)', '#601c28': 'var(--wine-deep)', '#9d2f3c': 'var(--wine-light)', '#8b2332': 'var(--wine-light)', '#a0292e': 'var(--wine)', '#c94454': 'var(--wine-light)', '#7d1f2c': 'var(--wine)' };
const OURO = { '#d4af37': 'var(--gold)', '#c9a32e': 'var(--gold)', '#c5a028': 'var(--gold)', '#e5c158': 'var(--gold-light)' };

function tokenDeHex(hex) {
  const h = hex.toLowerCase();
  if (CARTAO.includes(h)) return 'var(--bg-card)';
  if (FUNDO.includes(h)) return 'var(--bg-base)';
  if (LATERAL.includes(h)) return 'var(--bg-dark)';
  return VINHO[h] || OURO[h] || null;
}

function escapar(cls) { return cls.replace(/[/:\[\]#.]/g, c => '\\' + c); }

function variante(cls) {
  const m = cls.match(/^(hover|focus|group-hover|disabled|focus-within):(.*)$/);
  if (!m) return { base: cls, sel: s => s };
  const [, v, base] = m;
  if (v === 'group-hover') return { base, sel: s => `.group:hover ${s}` };
  const sufixo = { hover: ':hover', focus: ':focus', disabled: ':disabled', 'focus-within': ':focus-within' }[v];
  return { base, sel: s => `${s}${sufixo}` };
}

const regras = [];

// 1) bg/border/from/via/to com hex cravado, sem alfa
const hexUsados = new Set(fonte.match(/(?:hover:|focus:|group-hover:)?(?:bg|border|from|via|to)-\[#[0-9a-fA-F]{6}\](?![\w/-])/g) || []);
for (const cls of [...hexUsados].sort()) {
  const { base, sel } = variante(cls);
  const m = base.match(/^(bg|border|from|via|to)-\[(#[0-9a-fA-F]+)\]$/);
  const token = tokenDeHex(m[2]);
  if (!token) continue;
  const seletor = sel(`.${escapar(cls)}`);
  const superficie = token.startsWith('var(--bg');
  if (m[1] === 'bg') regras.push(`${seletor}{background-color:${token}}`);
  else if (m[1] === 'border') regras.push(`${seletor}{border-color:${superficie ? 'var(--border)' : token}}`);
  else if (m[1] === 'from') regras.push(`${seletor}{background-image:none;background-color:${token}}`);
  // via/to: o degradê já foi desligado abaixo; a cor de fundo vem do from
}

// 2) Fundo cravado por estilo inline (React serializa '#12141f' como rgb(18, 20, 31))
const rgbDe = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
for (const h of CARTAO) regras.push(`[style*="${rgbDe(h)}"]{background:var(--bg-card) !important}`);
for (const h of FUNDO) regras.push(`[style*="${rgbDe(h)}"]{background:var(--bg-base) !important}`);
for (const h of LATERAL) regras.push(`[style*="${rgbDe(h)}"]{background:var(--bg-dark) !important}`);

// 3) Degradês viram superfície chapada. O from-* diz a cor.
regras.push(`[class*="bg-gradient-to"]{background-image:none}`);
const froms = new Set(fonte.match(/(?:hover:)?from-(?:wine(?:-[a-z]+)?|gold(?:-[a-z]+)?|[a-z]+-[1-9]00)(?:\/\d+)?(?![\w/-])/g) || []);
const TW = { emerald: '16,185,129', green: '34,197,94', red: '239,68,68', amber: '245,158,11', yellow: '234,179,8', orange: '249,115,22', blue: '59,130,246', sky: '14,165,233', indigo: '99,102,241', purple: '168,85,247', violet: '139,92,246', pink: '236,72,153', rose: '244,63,94', teal: '20,184,166', cyan: '6,182,212', slate: '100,116,139', gray: '107,125,152', zinc: '113,113,122' };
for (const cls of [...froms].sort()) {
  const { base, sel } = variante(cls);
  const seletor = sel(`.${escapar(cls)}`);
  const nome = base.replace(/^from-/, '').replace(/\/\d+$/, '');
  const alfa = base.match(/\/(\d+)$/) ? parseInt(base.match(/\/(\d+)$/)[1]) / 100 : 1;
  let cor = null;
  // Com alfa, o degradê era só uma tinta leve: vira tinta chapada da mesma cor.
  if (nome === 'wine') cor = alfa < 1 ? `rgba(125,31,44,${alfa.toFixed(2)})` : 'var(--wine)';
  else if (nome.startsWith('wine-')) cor = alfa < 1 ? `rgba(92,21,32,${alfa.toFixed(2)})` : 'var(--wine-deep)';
  else if (nome.startsWith('gold')) cor = alfa < 1 ? `rgba(212,175,55,${alfa.toFixed(2)})` : 'var(--gold)';
  else {
    const c = nome.match(/^([a-z]+)-([1-9]00)$/);
    if (c && TW[c[1]]) {
      const tom = parseInt(c[2]);
      // fundo escuro tingido (700-950) vira tinta leve; 500/600 fica opaco chapado
      cor = tom >= 700 ? `rgba(${TW[c[1]]},${(alfa < 1 ? Math.min(0.22, alfa * 0.4) : 0.12).toFixed(3)})` : `rgba(${TW[c[1]]},${alfa.toFixed(2)})`;
    }
  }
  if (cor) regras.push(`${seletor}{background-image:none;background-color:${cor}}`);
}

// 4) Sem sombra, sem brilho, sem vidro
regras.push(`[class*="shadow-"]{box-shadow:none}`);
regras.push(`[class*="backdrop-blur"]{backdrop-filter:none;-webkit-backdrop-filter:none}`);
regras.push(`.glass,.glass-card,.glass-soft,.glass-modal{background:var(--bg-card);border:1px solid var(--border);box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}`);
regras.push(`.glass-card:hover{border-color:var(--border-strong);box-shadow:none}`);
regras.push(`.ambient-glow{background:var(--bg-base)}`);

// 5) Texto de apoio legível: todo branco com alfa até 65% vira o cinza do kit.
const brancos = new Set(fonte.match(/(?:hover:|group-hover:|focus:)?(?:text|placeholder)-white\/\d+(?![\w/-])/g) || []);
for (const cls of [...brancos].sort()) {
  const { base, sel } = variante(cls);
  const a = parseInt(base.split('/')[1]);
  const seletor = sel(`.${escapar(cls)}`);
  const prop = base.startsWith('placeholder') ? '::placeholder' : '';
  if (a <= 65) regras.push(`${seletor}${prop}{color:var(--text-secondary)}`);
  else if (a < 100) regras.push(`${seletor}${prop}{color:var(--text-primary)}`);
}

// 6) Uma borda só. Alfa baixo é a borda comum; 15%+ é a borda de campo.
const bordas = new Set(fonte.match(/(?:hover:|focus:|focus-within:)?(?:border|divide)-white\/\d+(?![\w/-])/g) || []);
for (const cls of [...bordas].sort()) {
  const { base, sel } = variante(cls);
  const a = parseInt(base.split('/')[1]);
  const seletor = sel(`.${escapar(cls)}`);
  const cor = a <= 12 ? 'var(--border)' : 'var(--border-strong)';
  if (base.startsWith('divide')) regras.push(`${seletor}>:not([hidden])~:not([hidden]){border-color:${cor}}`);
  else regras.push(`${seletor}{border-color:${cor}}`);
}

const ESCOPO = '.app-shell ';
const css = `/* GERADO por scripts/gerar-pele.mjs — não edite à mão.
 * A pele padrão: cada cor, sombra, degradê e vidro cravados no código das
 * telas ganham aqui o equivalente do kit, escopado ao shell dos módulos.
 * ${regras.length} regras. */
${regras.map(r => ESCOPO + r).join('\n')}
`;
writeFileSync(join(RAIZ, 'pele.css'), css);
console.log(`src/pele.css: ${regras.length} regras (${hexUsados.size} hex, ${brancos.size} textos, ${bordas.size} bordas, ${froms.size} degradês).`);
