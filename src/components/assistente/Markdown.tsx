import React from 'react';

/**
 * O pouco de markdown que o assistente usa: parágrafos, títulos (#),
 * listas (- ou 1.), tabelas (| a | b |) e **negrito**. Sem HTML: o texto
 * vira elementos do React, então nada que venha na resposta é executado.
 */

function inline(texto: string): React.ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
}
const celulas = (linha: string) => linha.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const separador = (linha: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linha);
const numerica = (c: string) => /^[-+]?(R\$\s?)?[\d.,]+%?$/.test(c.replace(/\*\*/g, ''));

const Markdown: React.FC<{ texto: string }> = ({ texto }) => {
  const linhas = texto.replace(/\r/g, '').split('\n');
  const blocos: React.ReactNode[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }

    if (l.trim().startsWith('|') && i + 1 < linhas.length && separador(linhas[i + 1])) {
      const cab = celulas(l);
      const corpo: string[][] = [];
      i += 2;
      while (i < linhas.length && linhas[i].trim().startsWith('|')) { corpo.push(celulas(linhas[i])); i++; }
      blocos.push(
        <div key={blocos.length} className="overflow-x-auto my-1">
          <table style={{ fontSize: 12.5, borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{cab.map((c, k) => <th key={k} className="text-left px-2 py-1" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{inline(c)}</th>)}</tr></thead>
            <tbody>{corpo.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={`px-2 py-1 ${numerica(c) ? 'text-right num whitespace-nowrap' : ''}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(l);
    if (titulo) { blocos.push(<p key={blocos.length} style={{ margin: '6px 0 2px', fontWeight: 700 }}>{inline(titulo[2])}</p>); i++; continue; }

    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordenada = /^\s*\d+[.)]/.test(l);
      const itens: string[] = [];
      while (i < linhas.length && /^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')); i++; }
      const Lista = ordenada ? 'ol' : 'ul';
      blocos.push(<Lista key={blocos.length} style={{ margin: '2px 0', paddingLeft: 18, listStyle: ordenada ? 'decimal' : 'disc' }}>{itens.map((t, k) => <li key={k}>{inline(t)}</li>)}</Lista>);
      continue;
    }

    const par: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !linhas[i].trim().startsWith('|') && !/^(#{1,4})\s/.test(linhas[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) { par.push(linhas[i]); i++; }
    blocos.push(<p key={blocos.length} style={{ margin: '2px 0' }}>{par.map((t, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(t)}</React.Fragment>)}</p>);
  }
  return <div className="flex flex-col gap-1" style={{ lineHeight: 1.45 }}>{blocos}</div>;
};

export default Markdown;
