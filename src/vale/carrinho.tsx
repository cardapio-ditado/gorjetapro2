import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { carregarVitrine, type Produto, type Vitrine } from './api';
import { criarTextos, type Textos } from './textos';
import { lerOrigem } from './util';

/** Estado da página: vitrine (campanha + produtos ao vivo) e carrinho (guardado no aparelho). */
interface Estado {
  vitrine: Vitrine | null;
  erroVitrine: boolean;
  recarregar: () => Promise<void>;
  t: Textos;
  produto: (slug: string) => Produto | undefined;
  itens: Record<string, number>;
  quantidade: (slug: string) => number;
  definir: (slug: string, qtd: number) => void;
  limpar: () => void;
  presente: boolean;
  setPresente: (v: boolean) => void;
  totais: { vales: number; total: number; cheio: number; economia: number; temAlcool: boolean };
  maximo: (p: Produto) => number;
  aviso: string | null;
  avisar: (s: string) => void;
}

const Ctx = createContext<Estado | null>(null);
const CHAVE = 'vale_carrinho_v1';

function lerSalvo(): { itens: Record<string, number>; presente: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s && typeof s.itens === 'object') return { itens: s.itens, presente: !!s.presente };
  } catch { /* aparelho sem armazenamento */ }
  return { itens: {}, presente: false };
}

export function ProvedorVale({ children }: { children: ReactNode }) {
  const [vitrine, setVitrine] = useState<Vitrine | null>(null);
  const [erroVitrine, setErroVitrine] = useState(false);
  const inicial = useMemo(lerSalvo, []);
  const [itens, setItens] = useState<Record<string, number>>(inicial.itens);
  const [presente, setPresente] = useState(inicial.presente || new URLSearchParams(location.search).get('presente') === '1');
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const v = await carregarVitrine();
      setVitrine(v);
      setErroVitrine(false);
    } catch {
      setErroVitrine(true);
    }
  }, []);

  useEffect(() => {
    lerOrigem();
    recarregar();
    // "Restam N" ao vivo: atualiza a cada 45 s e quando a pessoa volta para a aba
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') recarregar(); }, 45_000);
    const vis = () => { if (document.visibilityState === 'visible') recarregar(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [recarregar]);

  useEffect(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify({ itens, presente })); } catch { /* sem armazenamento */ }
  }, [itens, presente]);

  const produto = useCallback((slug: string) => vitrine?.produtos.find((p) => p.slug === slug), [vitrine]);

  // produto que saiu da venda ou esgotou some do carrinho; quantidade acima do lote é ajustada
  useEffect(() => {
    if (!vitrine) return;
    setItens((atual) => {
      let mudou = false;
      const novo: Record<string, number> = {};
      for (const [slug, q] of Object.entries(atual)) {
        const p = vitrine.produtos.find((x) => x.slug === slug);
        const max = p ? Math.min(p.limite_por_cpf, p.restam) : 0;
        const qq = Math.min(q, max);
        if (qq !== q) mudou = true;
        if (qq > 0) novo[slug] = qq;
      }
      return mudou ? novo : atual;
    });
  }, [vitrine]);

  const maximo = useCallback((p: Produto) => Math.max(0, Math.min(p.limite_por_cpf, p.restam)), []);

  const definir = useCallback((slug: string, qtd: number) => {
    setItens((atual) => {
      const novo = { ...atual };
      if (qtd <= 0) delete novo[slug]; else novo[slug] = qtd;
      return novo;
    });
  }, []);

  const avisar = useCallback((s: string) => {
    setAviso(s);
    window.setTimeout(() => setAviso((a) => (a === s ? null : a)), 2200);
  }, []);

  const totais = useMemo(() => {
    let vales = 0, total = 0, cheio = 0, temAlcool = false;
    for (const [slug, q] of Object.entries(itens)) {
      const p = vitrine?.produtos.find((x) => x.slug === slug);
      if (!p) continue;
      vales += q; total += p.preco_por * q; cheio += p.preco_de * q; temAlcool ||= p.tem_alcool;
    }
    return { vales, total, cheio, economia: cheio - total, temAlcool };
  }, [itens, vitrine]);

  const valor: Estado = {
    vitrine, erroVitrine, recarregar, t: criarTextos(vitrine?.campanha.textos), produto,
    itens, quantidade: (slug) => itens[slug] ?? 0, definir, limpar: () => setItens({}),
    presente, setPresente, totais, maximo, aviso, avisar,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useVale() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useVale fora do ProvedorVale');
  return c;
}
