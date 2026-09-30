// Gera src/components/estoque-beta2/pele-beta2.css: a pele do protótipo do
// Beta 2 no padrão do kit.
//
// As telas herdadas do protótipo (src/components/estoque-beta2/*) carregam CSS
// próprio, com uma paleta roxa de ~100 cores fixas e !important em quase tudo.
// Reescrever cada tela é o plano de longo prazo; enquanto elas existem, este
// script varre esse CSS, e para cada cor fixa emite a regra equivalente em
// token do kit, com especificidade maior (.b2-root.b2-embutido …), de modo que
// texto, fundo, borda e raio sigam o padrão nos dois temas.
//
// Rodar sempre que o CSS do protótipo mudar:  node scripts/gerar-pele-beta2.mjs
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const RAIZ = new URL('../src/', import.meta.url).pathname;
const PASTA = join(RAIZ, 'components/estoque-beta2');
const FONTES = [
  ...readdirSync(PASTA).filter(n => /\.(tsx?|css)$/.test(n) && n !== 'pele-beta2.css').map(n => join(PASTA, n)),
  join(RAIZ, 'pages/EstoqueBeta2.tsx'),
];
const texto = FONTES.map(f => readFileSync(f, 'utf8')).join('\n');

// ── Cor → HSL ────────────────────────────────────────────────────────────────
function hsl(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: hue * 60, s, l };
}
const HEX = /#[0-9a-fA-F]{3,6}\b/;
const primeiraCor = v => { const m = v.match(HEX); return m ? m[0] : /\bwhite\b/.test(v) ? '#ffffff' : null; };
const dica = sel => ({
  perigo: /red|error|bad|danger|warn(?!ing-off)/.test(sel),
  certo: /green|success|good|done|received|ok\b/.test(sel),
  atencao: /hint|tip|partial|warning/.test(sel),
  ativo: /aria-current|aria-pressed=true|\.active|\.selected|\.current|\.done/.test(sel),
  hover: /:hover/.test(sel),
  botao: /\.b2-btn(?![a-z-])/.test(sel) && !/\.alt|\.green|\.small/.test(sel),
  entrada: /\binput\b|\bselect\b|\btextarea\b|\.b2-search\b/.test(sel),
});

function corTexto(hex, d) {
  if (d.perigo) return 'var(--danger-text)';
  if (d.certo) return 'var(--ok-text)';
  if (d.atencao) return 'var(--warn-text)';
  const { h, s, l } = hsl(hex);
  if (s >= 0.45 && h >= 20 && h <= 55 && l < 0.93) return 'var(--gold)';
  if (s >= 0.3 && h >= 100 && h <= 180) return 'var(--ok-text)';
  if (s >= 0.5 && (h >= 340 || h <= 12) && l < 0.9) return 'var(--danger-text)';
  return l >= 0.87 ? 'var(--text-primary)' : 'var(--text-secondary)';
}
function corFundo(hex, d, sel) {
  if (d.botao) return 'var(--wine)';
  if (d.perigo) return 'var(--danger-bg)';
  if (d.certo) return 'var(--ok-bg)';
  if (d.atencao) return 'var(--warn-bg)';
  if (d.entrada) return 'var(--bg-base)';
  const { h, s, l } = hsl(hex);
  if (l >= 0.85) return 'var(--bg-card)';
  if (s >= 0.3 && h >= 100 && h <= 180) return l < 0.35 ? 'var(--ok-bg)' : 'var(--success)';
  if (s >= 0.3 && h >= 15 && h <= 60) return l < 0.35 ? 'var(--warn-bg)' : 'var(--warning)';
  if (s >= 0.3 && (h >= 335 || h <= 12) && l < 0.28) return 'var(--danger-bg)';
  if (s >= 0.28 && (h >= 300 || h <= 15) && l >= 0.28) return d.ativo ? 'var(--wine)' : 'var(--wine)';
  if (d.ativo) return 'var(--bg-active)';
  if (d.hover) return 'var(--bg-hover)';
  if (l < 0.10) return 'var(--bg-dark)';
  if (l < 0.125) return 'var(--bg-card)';
  if (l < 0.20) return /\.b2-card\b|\.b2-menu-section|\.b2-catalog-notice|\.b2-op-box|\.b2-ficha-section|\.b2-close-row|\.b2-history-row/.test(sel) ? 'var(--bg-card)' : 'var(--bg-elevated)';
  return 'var(--bg-active)';
}
function corBorda(d) {
  if (d.perigo) return 'var(--danger-border)';
  if (d.certo) return 'var(--ok-border)';
  if (d.atencao) return 'var(--warn-border)';
  if (d.botao) return 'var(--wine)';
  if (d.ativo) return 'var(--gold)';
  if (d.hover || d.entrada) return 'var(--border-strong)';
  return 'var(--border)';
}
function raio(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n >= 50) return null;
  return n >= 13 ? 'var(--r-card)' : n >= 9 ? 'var(--r-control)' : 'var(--r-badge)';
}

// ── Varredura das regras ──────────────────────────────────────────────────────
const regras = new Map(); // seletor → {prop: valor}
function guarda(sel, prop, val) {
  if (!regras.has(sel)) regras.set(sel, {});
  regras.get(sel)[prop] = val;
}
const bloco = /([^{}@]*\.b2-[^{}@]*)\{([^{}]*)\}/g;
let m;
while ((m = bloco.exec(texto))) {
  const seletores = m[1].trim().split(',').map(s => s.trim()).filter(s => s.startsWith('.b2-root'));
  if (!seletores.length) continue;
  const decls = m[2].split(';').map(d => d.trim()).filter(Boolean);
  for (const selOriginal of seletores) {
    const sel = selOriginal === '.b2-root' ? '.b2-root.b2-embutido' : selOriginal.replace(/^\.b2-root/, '.b2-root.b2-embutido');
    const d = dica(selOriginal);
    for (const decl of decls) {
      const i = decl.indexOf(':'); if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).replace(/!important/g, '').trim();
      const cor = primeiraCor(val);
      if (prop === 'color' || prop === '-webkit-text-fill-color') { if (cor) guarda(sel, prop, corTexto(cor, d)); }
      else if (prop === 'background' || prop === 'background-color' || prop === 'background-image') {
        if (/gradient/.test(val) || cor) guarda(sel, 'background', cor ? corFundo(cor, d, selOriginal) : 'var(--bg-card)');
      }
      else if (prop === 'border' || /^border-(top|right|bottom|left)$/.test(prop)) {
        if (cor) guarda(sel, prop, val.replace(HEX, corBorda(d)).replace(/\bwhite\b/, corBorda(d)));
      }
      else if (prop === 'border-color' || prop === 'border-left-color' || prop === 'border-top-color') { if (cor) guarda(sel, prop, corBorda(d)); }
      else if (prop === 'outline') { if (cor) guarda(sel, prop, '2px solid var(--gold)'); }
      else if (prop === 'box-shadow') { if (val !== 'none') guarda(sel, prop, 'none'); }
      else if (prop === 'border-radius') { const r = raio(val); if (r) guarda(sel, prop, r); }
      else if (prop === 'font-weight') { const n = parseInt(val, 10); if (n >= 800) guarda(sel, prop, '700'); else if (n >= 700 && n < 800 && n !== 700) guarda(sel, prop, '600'); }
      else if (prop === 'accent-color') guarda(sel, prop, 'var(--wine)');
      else if (prop === 'scrollbar-color') guarda(sel, prop, 'auto');
      else if (prop === 'color-scheme') guarda(sel, prop, 'inherit');
      else if (prop === 'filter' && /brightness/.test(val)) guarda(sel, prop, 'none');
      else if (prop === 'font-family') guarda(sel, prop, 'inherit');
    }
  }
}

// ── Emissão ──────────────────────────────────────────────────────────────────
const linhas = [
  '/* GERADO por scripts/gerar-pele-beta2.mjs — não editar à mão.',
  '   Pele das telas herdadas do protótipo do Beta 2, no padrão do kit. */',
  '',
  '',
  '/* Cor a cor, derivado do CSS do protótipo */',
];
const contagem = { regras: 0, decls: 0 };
const SOLIDAS = new Set(['var(--wine)', 'var(--success)', 'var(--warning)']);
for (const [sel, props] of regras) {
  if (SOLIDAS.has(props.background) || dica(sel).botao) { props.color = '#fff'; props['-webkit-text-fill-color'] = '#fff'; }
  const decls = Object.entries(props).map(([p, v]) => `${p}:${v}!important`);
  if (!decls.length) continue;
  contagem.regras++; contagem.decls += decls.length;
  linhas.push(`${sel}{${decls.join(';')}}`);
}
linhas.push(
  '',
  '/* Regras à mão: valem por cima das derivadas */',
  '/* Tipografia do kit por cima da do protótipo */',
  ".b2-root.b2-embutido h1{font-family:'Playfair Display',Georgia,serif!important;font-size:var(--fs-title)!important;font-weight:700!important;letter-spacing:var(--tracking-display)!important;line-height:var(--lh-tight)!important;margin:0 0 4px!important}",
  ".b2-root.b2-embutido h2{font-family:'Playfair Display',Georgia,serif!important;font-size:var(--fs-section)!important;font-weight:700!important;line-height:var(--lh-tight)!important}",
  '.b2-root.b2-embutido h3,.b2-root.b2-embutido h4{font-size:var(--fs-subsec)!important;font-weight:600!important}',
  '.b2-root.b2-embutido .b2-eyebrow{font-size:var(--fs-label)!important;font-weight:700!important;letter-spacing:var(--tracking-caps)!important;color:var(--text-secondary)!important}',
  '.b2-root.b2-embutido .b2-lead{font-size:var(--fs-body)!important;color:var(--text-secondary)!important;margin-bottom:var(--sp-5,20px)!important}',
  '.b2-root.b2-embutido .b2-stat{font-size:1.75rem!important;font-weight:700!important;letter-spacing:-0.01em!important;color:var(--text-primary)!important}',
  '.b2-root.b2-embutido .b2-btn{color:#fff!important;-webkit-text-fill-color:#fff!important;min-height:36px!important;padding:0 14px!important;font-size:var(--fs-body)!important;font-weight:600!important;border-radius:var(--r-control)!important;transition:background var(--dur-fast) var(--ease-standard)!important}',
  '.b2-root.b2-embutido .b2-btn:hover{background:var(--wine-light)!important;border-color:var(--wine-light)!important}',
  '.b2-root.b2-embutido .b2-btn.alt{background:transparent!important;color:var(--text-primary)!important;-webkit-text-fill-color:var(--text-primary)!important;border:1px solid var(--border-strong)!important}',
  '.b2-root.b2-embutido .b2-btn.alt:hover{background:var(--bg-hover)!important}',
  '.b2-root.b2-embutido .b2-btn.green{background:var(--success)!important;color:#fff!important;border-color:var(--success)!important}',
  '.b2-root.b2-embutido .b2-btn.small{min-height:28px!important;padding:0 10px!important;font-size:var(--fs-label)!important}',
  '.b2-root.b2-embutido .b2-pill{height:24px!important;padding:0 10px!important;display:inline-flex!important;align-items:center!important;font-size:12px!important;font-weight:600!important;border-radius:var(--r-pill)!important;background:var(--bg-hover)!important;color:var(--text-secondary)!important;border:1px solid var(--border)!important}',
  '.b2-root.b2-embutido .b2-pill.green{background:var(--ok-bg)!important;color:var(--ok-text)!important;border-color:var(--ok-border)!important}',
  '.b2-root.b2-embutido .b2-pill.red{background:var(--danger-bg)!important;color:var(--danger-text)!important;border-color:var(--danger-border)!important}',
  '.b2-root.b2-embutido .b2-hint{background:var(--warn-bg)!important;color:var(--warn-text)!important;border:1px solid var(--warn-border)!important;border-radius:var(--r-card)!important}',
  '.b2-root.b2-embutido .b2-success{background:var(--ok-bg)!important;color:var(--ok-text)!important;border:1px solid var(--ok-border)!important;border-radius:var(--r-card)!important}',
  '.b2-root.b2-embutido .b2-error{background:var(--danger-bg)!important;color:var(--danger-text)!important;border:1px solid var(--danger-border)!important;border-radius:var(--r-card)!important}',
  '.b2-root.b2-embutido .b2-card{background:var(--bg-card)!important;border:1px solid var(--border)!important;border-radius:var(--r-card)!important;padding:16px!important}',
  '.b2-root.b2-embutido .b2-action{background:var(--bg-card)!important;border:1px solid var(--border)!important;border-radius:var(--r-card)!important}',
  '.b2-root.b2-embutido .b2-action:hover{background:var(--bg-hover)!important;border-color:var(--border-strong)!important}',
  '.b2-root.b2-embutido .b2-row{border-bottom:1px solid var(--border-subtle)!important}',
  '.b2-root.b2-embutido .b2-field{color:var(--text-secondary)!important;font-size:var(--fs-label)!important;font-weight:600!important}',
  '.b2-root.b2-embutido input:not([type=checkbox]):not([type=radio]),.b2-root.b2-embutido select,.b2-root.b2-embutido textarea{background:var(--bg-base)!important;color:var(--text-primary)!important;-webkit-text-fill-color:var(--text-primary)!important;border:1px solid var(--border-strong)!important;border-radius:var(--r-control)!important;min-height:36px!important;padding:7px 12px!important;font-size:14px!important;color-scheme:inherit!important}',
  '.b2-root.b2-embutido input::placeholder,.b2-root.b2-embutido textarea::placeholder{color:var(--text-secondary)!important;-webkit-text-fill-color:var(--text-secondary)!important}',
  '.b2-root.b2-embutido select option{background:var(--bg-card)!important;color:var(--text-primary)!important}',
  '.b2-root.b2-embutido input:focus-visible,.b2-root.b2-embutido select:focus-visible,.b2-root.b2-embutido textarea:focus-visible,.b2-root.b2-embutido .b2-btn:focus-visible,.b2-root.b2-embutido .b2-nav:focus-visible{outline:none!important;box-shadow:var(--shadow-focus)!important;border-color:var(--gold)!important}',
  '.b2-root.b2-embutido th{color:var(--text-secondary)!important;font-size:var(--fs-caption)!important;font-weight:600!important;letter-spacing:var(--tracking-caps)!important;border-bottom:1px solid var(--border)!important}',
  '.b2-root.b2-embutido td{color:var(--text-primary)!important;border-bottom:1px solid var(--border-subtle)!important;font-size:var(--fs-body)!important}',
  '.b2-root.b2-embutido .b2-chip{background:transparent!important;color:var(--text-secondary)!important;border:1px solid var(--border-strong)!important;border-radius:var(--r-pill)!important;font-weight:500!important}',
  '.b2-root.b2-embutido .b2-chip[aria-pressed=true]{background:var(--gold-muted)!important;color:var(--gold)!important;-webkit-text-fill-color:var(--gold)!important;border-color:var(--gold)!important}',
  '.b2-root.b2-embutido .b2-op-tab[aria-pressed=true],.b2-root.b2-embutido .b2-nav[aria-current=page]{background:var(--wine)!important;color:#fff!important;-webkit-text-fill-color:#fff!important;border-color:var(--wine)!important}',
  '.b2-root.b2-embutido .b2-tag{background:var(--gold-muted)!important;color:var(--gold)!important;border:1px solid var(--gold)!important;border-radius:var(--r-pill)!important;font-weight:600!important;letter-spacing:0.02em!important}',
  '.b2-root.b2-embutido .b2-check{color:var(--text-primary)!important;border:1px solid var(--border)!important;border-radius:var(--r-control)!important}',
  '.b2-root.b2-embutido .b2-catalog-notice{background:var(--bg-elevated)!important;border:1px solid var(--border)!important;color:var(--text-secondary)!important;border-radius:var(--r-card)!important}',
  '.b2-root.b2-embutido .b2-catalog-notice svg{color:var(--gold)!important}',
  '.b2-root.b2-embutido .b2-catalog-notice strong{color:var(--text-primary)!important}',
  '.b2-root.b2-embutido .b2-catalog-notice p{color:var(--text-secondary)!important}',
  '',
  '/* Ajustes finais: a ilha não tem fundo próprio, herda o tema da página */',
  '.b2-root.b2-embutido{background:transparent!important;color:var(--text-primary)!important;color-scheme:inherit!important;min-height:0!important;font-family:inherit!important}',
  '.b2-root.b2-embutido .b2-main{padding:0!important;min-width:0!important}',
  '.b2-root.b2-embutido .b2-muted,.b2-root.b2-embutido small{color:var(--text-secondary)!important}',
);
const destino = join(PASTA, 'pele-beta2.css');
writeFileSync(destino, linhas.join('\n') + '\n');
console.log(`${destino.replace(RAIZ, 'src/')}: ${contagem.regras} regras, ${contagem.decls} declarações.`);
