import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { carregarRegulamento, consultarVale, ErroRede, type ValeCodigo } from './api';
import { CardVale, FaixaTeste, Logo, RodapeLegal } from './comum';

/** /vale/consultar — código + 3 primeiros dígitos do CPF do titular → saldo e validade, sem dado pessoal. */
export function Consultar() {
  const [codigo, setCodigo] = useState('');
  const [cpf3, setCpf3] = useState('');
  const [vale, setVale] = useState<ValeCodigo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => { document.title = 'Vale Ditado · Consultar meu vale'; }, []);

  const normalizar = (s: string) => {
    const x = s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DIT/, '').slice(0, 8);
    return x.length > 4 ? `DIT-${x.slice(0, 4)}-${x.slice(4)}` : x ? `DIT-${x}` : '';
  };

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setVale(null); setBuscando(true);
    try {
      const v = await consultarVale(codigo, cpf3);
      if (v) setVale(v); else setErro('Código ou CPF não conferem. Confira e tente de novo.');
    } catch (x) {
      setErro(x instanceof ErroRede ? 'Parece que a internet caiu. Confira e tente de novo.' : 'Deu ruim do nosso lado. Tente de novo em instantes.');
    }
    setBuscando(false);
  }

  return (
    <div className="v-fundo">
      <FaixaTeste />
      <div className="v-col" style={{ paddingTop: 24 }}>
        <Link to="/vale" className="v-link">← Voltar aos vales</Link>
        <Logo largura={84} />
        <h1 className="v-h2">Consultar meu vale</h1>
        <form onSubmit={buscar} noValidate>
          <div className="v-campo">
            <label htmlFor="q-cod">Código do vale</label>
            <input id="q-cod" value={codigo} onChange={(e) => setCodigo(normalizar(e.target.value))} placeholder="DIT-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" />
          </div>
          <div className="v-campo">
            <label htmlFor="q-cpf">3 primeiros números do CPF do titular</label>
            <input id="q-cpf" value={cpf3} onChange={(e) => setCpf3(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="000" inputMode="numeric" autoComplete="off" />
          </div>
          <button type="submit" className="v-cta" disabled={buscando || codigo.length < 13 || cpf3.length < 3}>{buscando ? 'Consultando...' : 'Consultar'}</button>
        </form>
        {erro && <div className="v-alerta" role="alert">{erro}</div>}
        {vale && <div style={{ marginTop: 16 }}><CardVale v={vale} /></div>}
        <RodapeLegal />
      </div>
    </div>
  );
}

/** /vale/regulamento — texto do admin; enquanto não houver, a minuta de docs/textos.md. */
export function Regulamento() {
  const [md, setMd] = useState<string | null>(null);
  const loc = useLocation();
  useEffect(() => {
    document.title = 'Vale Ditado · Regulamento';
    (async () => {
      let texto: string | null = null;
      try { texto = await carregarRegulamento(); } catch { /* usa a minuta */ }
      if (!texto) {
        const bruto = (await import('../../docs/textos.md?raw')).default.replace(/\r\n/g, '\n');
        const ini = bruto.indexOf('### REGULAMENTO DA CAMPANHA');
        const fim = bruto.indexOf('*Beba com moderação', ini);
        texto = ini >= 0 ? bruto.slice(ini, fim > ini ? fim : undefined) : bruto;
      }
      setMd(texto);
    })();
  }, []);
  useEffect(() => {
    if (md && loc.hash) window.setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView(), 50);
  }, [md, loc.hash]);

  return (
    <div className="v-fundo">
      <div className="v-col" style={{ paddingTop: 24 }}>
        <Link to="/vale" className="v-link">← Voltar aos vales</Link>
        <div className="v-doc">{md ? <Markdown texto={md} /> : <p className="v-apoio">Carregando…</p>}</div>
        <p className="v-legal" style={{ marginTop: 24 }}>Beba com moderação. Proibido para menores de 18 anos.</p>
        <RodapeLegal />
      </div>
    </div>
  );
}

/** Markdown mínimo do regulamento: títulos, negrito, listas e tabelas. */
function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split('\n');
  const blocos: JSX.Element[] = [];
  const inline = (s: string) => {
    const partes = s.replace(/`/g, '').split(/(\*\*[^*]+\*\*)/g);
    return partes.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p.replace(/\*([^*]+)\*/g, '$1')}</span>));
  };
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l) continue;
    if (l.startsWith('|')) {
      const tab: string[][] = [];
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        const cel = linhas[i].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!cel.every((c) => /^-+$/.test(c))) tab.push(cel);
        i++;
      }
      i--;
      blocos.push(
        <table key={i}><tbody>{tab.map((r, k) => <tr key={k}>{r.map((c, j) => (k === 0 ? <th key={j}>{inline(c)}</th> : <td key={j}>{inline(c)}</td>))}</tr>)}</tbody></table>,
      );
    } else if (l.startsWith('### ')) {
      blocos.push(<h3 key={i}>{inline(l.slice(4))}</h3>);
    } else if (/^\*\*\d+\.\s/.test(l)) {
      const id = /privacidade/i.test(l) ? 'privacidade' : undefined;
      blocos.push(<h4 key={i} id={id}>{inline(l.replace(/\*\*/g, ''))}</h4>);
    } else if (l.startsWith('- ')) {
      const itens: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith('- ')) { itens.push(linhas[i].trim().slice(2)); i++; }
      i--;
      blocos.push(<ul key={i}>{itens.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else if (!l.startsWith('>') && l !== '---') {
      blocos.push(<p key={i}>{inline(l)}</p>);
    }
  }
  return <>{blocos}</>;
}

export function NaoAchou() {
  return (
    <div className="v-fundo"><div className="v-col" style={{ paddingTop: 48, textAlign: 'center' }}>
      <h1 className="v-h2">Página não encontrada.</h1>
      <Link to="/vale" className="v-cta">Ver os vales</Link>
    </div></div>
  );
}

