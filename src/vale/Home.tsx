import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import type { Produto } from './api';
import { useVale } from './carrinho';
import { BotaoAdicionar, Carregando, Chevron, FaixaTeste, IconeFechar, Logo, Restam, RodapeLegal, Seletor, Toast, useRelogio } from './comum';
import { diaCuiaba, horaCuiaba, linkWhats, pctBonus, pctDesconto, reais, rs } from './util';

/** Página /vale — seções S1 a S10 de docs/layout-pagina.md, textos de docs/copy-pagina.md. */
export default function Home() {
  const { vitrine, erroVitrine, recarregar, t, totais } = useVale();
  const [aberto, setAberto] = useState<Produto | null>(null);
  const [gaveta, setGaveta] = useState(false);

  useEffect(() => { document.title = 'Vale Ditado · Mais vale um Ditado na mão'; }, []);

  if (!vitrine) {
    if (erroVitrine) return (
      <div className="v-col v-carregando" style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        <p>Parece que a internet caiu. Confira e tente de novo.</p>
        <button className="v-btn" onClick={recarregar}>Tentar de novo</button>
      </div>
    );
    return <Carregando />;
  }

  const { campanha, situacao } = vitrine;
  const natal = campanha.fase === 'natal';
  const kits = vitrine.produtos.filter((p) => p.tipo === 'kit');
  const creditos = vitrine.produtos.filter((p) => p.tipo === 'credito');
  const tudoEsgotado = vitrine.produtos.length > 0 && vitrine.produtos.every((p) => p.restam <= 0);
  const vendaAberta = situacao === 'aberta';

  if (situacao === 'encerrada') return (
    <div className="v-fundo">
      <FaixaTeste />
      <div className="v-col" style={{ paddingTop: 48, textAlign: 'center' }}>
        <Logo />
        <h1 className="v-h1">A venda do Vale Ditado acabou.</h1>
        <p className="v-apoio">Quem comprou usa até a data do vale. Já tem o seu?</p>
        <div className="v-pilha" style={{ marginTop: 24 }}>
          <Link to="/vale/consultar" className="v-cta">Consultar meu vale</Link>
          <a href="https://www.ditado.org/reserva" className="v-btn">Reservar mesa</a>
        </div>
        <RodapeLegal />
      </div>
    </div>
  );

  const secoes = natal
    ? ['s1', 's3', 's7', 's4', 's5', 's6', 's8', 's9']
    : ['s1', 's3', 's4', 's5', 's6', 's7', 's8', 's9'];

  const render: Record<string, JSX.Element> = {
    s1: <Hero key="s1" />,
    s3: <Destaques key="s3" abrir={setAberto} desabilitado={!vendaAberta} />,
    s4: tudoEsgotado ? <TudoEsgotado key="s4" /> : <Grade key="s4" kits={kits} abrir={setAberto} desabilitado={!vendaAberta} />,
    s5: tudoEsgotado ? <span key="s5" /> : <Credito key="s5" creditos={creditos} desabilitado={!vendaAberta} />,
    s6: <ComoFunciona key="s6" />,
    s7: <Presente key="s7" compacto={!natal} />,
    s8: <Regras key="s8" />,
    s9: <Faq key="s9" />,
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="v-fundo">
        <FaixaTeste />
        {!gaveta && <Urgencia />}
        {natal && <div className="v-faixa-topo">{t('natal_faixa_topo')}</div>}
        {new URLSearchParams(location.search).get('seg') === 'premio' && (
          <div className="v-faixa-musgo">Você tem um presente esperando no Ditado. Ele vale sem compra.</div>
        )}
        {!vendaAberta && <Antes />}
        {secoes.map((s) => render[s])}
        <div className="v-col"><RodapeLegal /></div>
        {totais.vales > 0 && !gaveta && <BarraCarrinho abrir={() => setGaveta(true)} />}
        <AnimatePresence>
          {gaveta && <Gaveta key="gaveta" fechar={() => setGaveta(false)} />}
          {aberto && <FolhaProduto key="folha" p={aberto} fechar={() => setAberto(null)} desabilitado={!vendaAberta} />}
        </AnimatePresence>
        <Toast />
      </div>
    </LazyMotion>
  );
}

// ───────────────────────── S2 · barra de urgência ─────────────────────────

function Urgencia() {
  const { vitrine } = useVale();
  const c = vitrine!.campanha;
  const desvio = useMemo(() => new Date(vitrine!.agora).getTime() - Date.now(), [vitrine]);
  const natal = c.fase === 'natal';
  const alvo = natal ? c.venda_fim : (c.brinde_ate ?? (c.contador_fim && new Date(c.contador_fim).getTime() > Date.now() + desvio ? c.contador_fim : null));
  const { resta, d, h, m: min, agora } = useRelogio(alvo, desvio);

  let texto: string;
  if (!natal) {
    if (!alvo || resta <= 0 || !c.mostrar_contador) texto = 'Black Brasa · lote limitado';
    else if (resta < 86_400_000) texto = `Último dia${c.brinde_ate ? ' do brinde' : ' da Black Brasa'}: acaba às ${horaCuiaba(alvo)} de hoje`;
    else texto = c.brinde_ate ? `O bolinho de brinde acaba em ${d}d ${h}h ${min}min` : `A Black Brasa acaba em ${d}d ${h}h ${min}min`;
  } else {
    const hoje = diaCuiaba(new Date(agora).toISOString());
    if (resta <= 0) texto = 'Vale de Natal';
    else if (hoje === diaCuiaba(c.venda_fim)) texto = 'Presente de última hora: o vale sai na hora, é só mandar no WhatsApp';
    else if (resta <= 72 * 3_600_000 && c.mostrar_contador) texto = `O Vale de Natal acaba em ${d}d ${h}h ${min}min`;
    else texto = 'Vale de Natal · vendas até 24/12';
  }
  return (
    <a href="#escolha" className="v-urgencia v-num">
      {texto}
      <small className="v-so-largo"> · Lote limitado · até 2 de cada produto por CPF</small>
    </a>
  );
}

function Antes() {
  const { vitrine, t } = useVale();
  const c = vitrine!.campanha;
  const hora = t('hora_abertura');
  const nomeFase = c.fase === 'natal' ? 'O Vale de Natal' : 'A Black Brasa';
  return (
    <div className="v-col"><div className="v-info" style={{ marginTop: 16 }}>
      <b>{nomeFase} começa em {diaCuiaba(c.venda_inicio)}{hora ? ` às ${hora}` : ''}. Volta aqui.</b>
      <div><a className="v-link" href={linkWhats(t('whatsapp'), 'Oi! Quero ser avisado quando abrir o Vale Ditado.')} target="_blank" rel="noopener noreferrer">Me avise no WhatsApp</a></div>
    </div></div>
  );
}

// ───────────────────────── S1 · hero ─────────────────────────

function Hero() {
  const { vitrine, t } = useVale();
  const c = vitrine!.campanha;
  const natal = c.fase === 'natal';
  const abertos = vitrine!.produtos.filter((p) => p.restam > 0);
  const menor = Math.min(...(abertos.length ? abertos : vitrine!.produtos).map((p) => p.preco_por));
  const maiorPct = Math.max(0, ...vitrine!.produtos.filter((p) => p.tipo === 'kit').map((p) => pctDesconto(p.preco_de, p.preco_por)));
  const f = natal ? 'natal' : 'black';
  return (
    <header className="v-hero">
      {c.hero_foto_url
        ? <><img className="v-hero-foto" src={c.hero_foto_url} alt="" fetchPriority="high" /><div className="v-hero-pelicula" /></>
        : <div className="v-hero-sem-foto" />}
      <div className="v-hero-conteudo v-col">
        <Logo />
        <span className="v-selo v-selo-desc" style={{ marginBottom: 12 }}>{t(`${f}_faixa`)}</span>
        <h1 className="v-h1">{t(`${f}_titulo`)}</h1>
        <p className="v-hero-sub">{t(`${f}_subtitulo`, { pct: maiorPct })}</p>
        {Number.isFinite(menor) && <p className="v-ancora v-num">a partir de {rs(menor)}</p>}
        <a href="#destaques" className="v-cta">{t(`${f}_cta`)}</a>
        <p className="v-hero-rodape">{t(`${f}_apoio`)}<br />{t('linha_confianca')}</p>
      </div>
    </header>
  );
}

// ───────────────────────── S3 · destaques ─────────────────────────

function Destaques({ abrir, desabilitado }: { abrir: (p: Produto) => void; desabilitado: boolean }) {
  const { vitrine, t } = useVale();
  const c = vitrine!.campanha;
  const natal = c.fase === 'natal';
  const lista = vitrine!.produtos
    .filter((p) => (natal ? p.destaque_natal : p.destaque_black) != null)
    .sort((a, b) => ((natal ? a.destaque_natal : a.destaque_black) ?? 9) - ((natal ? b.destaque_natal : b.destaque_black) ?? 9));
  // "MAIS PEDIDO" só a partir do 2º dia de venda e só no mais vendido de verdade
  const segundoDia = new Date(vitrine!.agora).getTime() - new Date(c.venda_inicio).getTime() > 86_400_000;
  const topo = segundoDia ? [...lista].sort((a, b) => b.vendidos - a.vendidos)[0] : undefined;
  const maiorPct = Math.max(0, ...vitrine!.produtos.filter((p) => p.tipo === 'kit').map((p) => pctDesconto(p.preco_de, p.preco_por)));
  return (
    <section id="destaques" className="v-col v-secao" aria-labelledby="destaques-titulo">
      <h2 className="v-sr" id="destaques-titulo">Destaques</h2>
      <div className="v-vantagens">
        {[1, 2, 3].map((i) => (
          <div className="v-vantagem" key={i}>
            <span className="v-ponto" />
            <span><b>{t(`destaque_${i}_titulo` as 'destaque_1_titulo', { pct: maiorPct })}</b>{t(`destaque_${i}_texto` as 'destaque_1_texto')}</span>
          </div>
        ))}
      </div>
      {!natal && <FaixaBrinde />}
      {lista.length > 0 && (
        <div className="v-carrossel" style={{ marginTop: 16 }}>
          {lista.map((p, i) => (
            <m.article key={p.slug} className={`v-card v-card-destaque${p.restam <= 0 ? ' v-esgotado' : ''}`}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => abrir(p)}>
              <Foto p={p} formato="43" />
              <div className="v-selos">
                <SeloPreco p={p} />
                {topo && topo.slug === p.slug && p.vendidos > 0 && <span className="v-selo v-selo-ambar">Mais pedido</span>}
              </div>
              <h3 className="v-nome">{p.nome}</h3>
              <p className="v-comp">{p.composicao}</p>
              <div className="v-num">
                <span className="v-de">de R$ {reais(p.preco_de)}</span>
                <div className="v-por">R$ {reais(p.preco_por)}</div>
              </div>
              <Restam p={p} />
              <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                {p.restam <= 0
                  ? <><span className="v-selo v-selo-esgotado">Esgotado</span><p className="v-legenda" style={{ margin: '6px 0 0' }}>Esse lote acabou. Quem chegou, chegou.</p></>
                  : <BotaoAdicionar p={p} texto="Quero este" desabilitado={desabilitado} />}
              </div>
            </m.article>
          ))}
        </div>
      )}
      {!natal && <p className="v-legenda v-serifa" style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 15 }}>{t('ditado_secao')}</p>}
    </section>
  );
}

/** Nome curto de um item do kit: "Chopp Brahma 300 ml" × 6 → "chopps". */
function rotulo(desc: string, q: number) {
  const base = desc.replace(/\s*\(.*?\)/g, '').replace(/\s+\d+\s*(ml|g)$/i, '').trim().toLowerCase();
  if (base.startsWith('chopp')) return q > 1 ? 'chopps' : 'chopp';
  return q > 1 && !base.endsWith('s') ? `${base}s` : base;
}

/** O que o kit tem, para o bloco que ocupa o lugar da foto enquanto ela não chega. */
function composicaoKit(p: Produto) {
  if (p.tipo === 'credito') return { num: `R$ ${reais(p.credito_valor ?? 0).replace(',00', '')}`, rot: 'para consumir', mais: '' };
  if (p.itens.length === 0) return null;
  const chefe = p.itens.reduce((a, b) => (b.quantidade > a.quantidade ? b : a));
  const resto = p.itens.filter((x) => x !== chefe).map((x) => x.descricao.replace(/\s*\(.*?\)/g, ''));
  if (chefe.quantidade <= 1) return { num: String(p.itens.length), rot: 'itens', mais: p.itens.map((x) => x.descricao).join(' · ') };
  return { num: String(chefe.quantidade), rot: rotulo(chefe.descricao, chefe.quantidade), mais: resto.length ? `+ ${resto.join(' · ')}` : '' };
}

function Foto({ p, formato }: { p: Produto; formato: '43' | 'quadrada' }) {
  if (p.foto_url) return formato === '43'
    ? <img className="v-foto-43" src={p.foto_url} alt={p.nome} loading="lazy" width={600} height={450} />
    : <img className="v-item-foto" src={p.foto_url} alt="" loading="lazy" width={88} height={88} />;
  const k = composicaoKit(p);
  if (!k) return null;
  return (
    <div className={`v-kit${formato === 'quadrada' ? ' v-kit-quad' : ''}`} aria-hidden="true">
      <span className={`v-kit-num v-num${k.num.length > 3 ? ' v-kit-longo' : ''}`}>{k.num}</span>
      <span className="v-kit-rot">{k.rot}</span>
      {formato === '43' && k.mais && <span className="v-kit-mais">{k.mais}</span>}
    </div>
  );
}

/** Faixa única do brinde (no lugar do selo repetido em todo card). */
function FaixaBrinde() {
  const { vitrine, t } = useVale();
  const c = vitrine!.campanha;
  if (!c.brinde_descricao || !c.brinde_ate || new Date(c.brinde_ate).getTime() < new Date(vitrine!.agora).getTime()) return null;
  return (
    <div className="v-brinde">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
        <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
      </svg>
      <div>
        <b>{t('black_brinde_linha')}</b>
        <span>Todo vale pago até {diaCuiaba(c.brinde_ate)} às {horaCuiaba(c.brinde_ate)} ganha {c.brinde_descricao}. Um por vale, resgatado junto com ele, dentro da validade.</span>
      </div>
    </div>
  );
}

/** Linha curta do brinde nos cards (a explicação completa está na faixa). */
function brindeCurto(c: { brinde_descricao: string | null; brinde_ate: string | null }, agora: string) {
  if (!c.brinde_descricao || !c.brinde_ate || new Date(c.brinde_ate).getTime() < new Date(agora).getTime()) return null;
  return `+ brinde até ${diaCuiaba(c.brinde_ate)}`;
}

function SeloPreco({ p }: { p: Produto }) {
  if (p.tipo === 'credito') return <span className="v-selo v-selo-desc">+{pctBonus(p)}% de crédito</span>;
  return <span className="v-selo v-selo-desc">-{pctDesconto(p.preco_de, p.preco_por)}%</span>;
}

// ───────────────────────── S4 · grade ─────────────────────────

const BLOCOS: { cat: Produto['categoria']; chip: string; titulo: 'bloco_chopp' | 'bloco_kits' | 'bloco_drinks' | 'bloco_familia' }[] = [
  { cat: 'chopp', chip: 'Chopp', titulo: 'bloco_chopp' },
  { cat: 'kits', chip: 'Petisco + Chopp', titulo: 'bloco_kits' },
  { cat: 'drinks', chip: 'Drinks', titulo: 'bloco_drinks' },
  { cat: 'familia', chip: 'Família', titulo: 'bloco_familia' },
];

function Grade({ kits, abrir, desabilitado }: { kits: Produto[]; abrir: (p: Produto) => void; desabilitado: boolean }) {
  const { vitrine, t } = useVale();
  const natal = vitrine!.campanha.fase === 'natal';
  const [ativo, setAtivo] = useState('chopp');
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const blocos = BLOCOS.filter((b) => kits.some((p) => p.categoria === b.cat));

  // destaca o chip da categoria que está na tela (âncoras, não filtros)
  useEffect(() => {
    const obs = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setAtivo((vis.target as HTMLElement).dataset.cat ?? 'chopp');
    }, { rootMargin: '-120px 0px -55% 0px' });
    Object.values(refs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [kits.length]);

  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const vendidos = vitrine!.vendidos_total;

  return (
    <section id="escolha" className="v-col v-secao">
      <h2 className="v-h2">{t('grade_titulo')}</h2>
      <p className="v-apoio" style={{ margin: 0 }}>{t('grade_subtitulo')}</p>
      {vendidos >= vitrine!.campanha.mostrar_vendidos_a_partir && <p className="v-legenda">{vendidos} vales já vendidos</p>}
      <nav className="v-chips" aria-label="Categorias" style={{ marginTop: 12 }}>
        {natal && <button type="button" className="v-chip" onClick={() => ir('presente')}>Presente</button>}
        {blocos.map((b) => (
          <button key={b.cat} type="button" className={`v-chip${ativo === b.cat ? ' v-ativo' : ''}`} onClick={() => ir(`bloco-${b.cat}`)}>{b.chip}</button>
        ))}
        <button type="button" className={`v-chip${ativo === 'credito' ? ' v-ativo' : ''}`} onClick={() => ir('credito')}>Crédito</button>
      </nav>
      {blocos.map((b) => (
        <div key={b.cat} id={`bloco-${b.cat}`} data-cat={b.cat} ref={(el) => { refs.current[b.cat] = el; }} style={{ scrollMarginTop: 96 }}>
          <h3 className="v-h3">{t(b.titulo)}</h3>
          <div className="v-lista">
            {kits.filter((p) => p.categoria === b.cat).map((p, i) => <CardLista key={p.slug} p={p} i={i} abrir={abrir} desabilitado={desabilitado} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

function CardLista({ p, i, abrir, desabilitado }: { p: Produto; i: number; abrir: (p: Produto) => void; desabilitado: boolean }) {
  const { vitrine, t } = useVale();
  const esgotado = p.restam <= 0;
  const brinde = vitrine!.campanha.fase === 'black' ? brindeCurto(vitrine!.campanha, vitrine!.agora) : null;
  return (
    <m.article className="v-card v-item" onClick={() => abrir(p)}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 4) * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      <div className={esgotado ? 'v-esgotado' : ''}><Foto p={p} formato="quadrada" /></div>
      <div className="v-item-corpo">
        <div className={esgotado ? 'v-esgotado' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h4 className="v-nome">{p.nome}</h4>
          <p className="v-comp">{p.composicao}</p>
          <div className="v-selos">
            <SeloPreco p={p} />
            {p.tem_alcool ? <span className="v-selo v-selo-18">+18</span> : p.selo && <span className="v-selo v-selo-info">{p.selo}</span>}
          </div>
        </div>
        <div className="v-item-preco">
          <div className={`v-num${esgotado ? ' v-esgotado' : ''}`}>
            <div className="v-de">de R$ {reais(p.preco_de)}</div>
            <div className="v-por-lista">R$ {reais(p.preco_por)}</div>
            <Restam p={p} />
            {!esgotado && brinde && <span className="v-brinde-linha">{brinde}</span>}
          </div>
          {esgotado ? <span className="v-selo v-selo-esgotado">Esgotado</span> : <BotaoAdicionar p={p} desabilitado={desabilitado} />}
        </div>
        {esgotado && (
          <div onClick={(e) => e.stopPropagation()}>
            <p className="v-legenda" style={{ margin: 0 }}>Esse lote acabou. Quem chegou, chegou.</p>
            <a className="v-link" href={linkWhats(t('whatsapp'), `Oi! Quero ser avisado quando abrir um novo lote do ${p.nome}.`)} target="_blank" rel="noopener noreferrer">Avisar no próximo lote</a>
          </div>
        )}
      </div>
    </m.article>
  );
}

function TudoEsgotado() {
  return (
    <section id="escolha" className="v-col v-secao v-centro">
      <h2 className="v-h2">Acabou o lote.</h2>
      <p className="v-apoio">Obrigado a quem garantiu o seu. A brasa continua acesa: a gente se vê no bar.</p>
      <a href="https://www.ditado.org/reserva" className="v-cta">Reservar mesa</a>
    </section>
  );
}

// ───────────────────────── S5 · crédito ─────────────────────────

function Credito({ creditos, desabilitado }: { creditos: Produto[]; desabilitado: boolean }) {
  const { t } = useVale();
  if (creditos.length === 0) return null;
  return (
    <section id="credito" className="v-col v-secao">
      <div className="v-credito">
        <h2 className="v-h2">{t('credito_titulo')}</h2>
        <p style={{ margin: 0 }}>{t('credito_texto')}</p>
        <div className="v-credito-cards">
          {creditos.map((p) => (
            <div key={p.slug} className={`v-credito-card${p.restam <= 0 ? ' v-esgotado' : ''}`}>
              <span className="v-paga v-num">Paga R$ {reais(p.preco_por).replace(',00', '')}, usa</span>
              <span className="v-usa v-num">R$ {reais(p.credito_valor ?? 0).replace(',00', '')}</span>
              <span className="v-selo v-selo-musgo">+R$ {reais((p.credito_valor ?? 0) - p.preco_por).replace(',00', '')} de bônus</span>
              <Restam p={p} />
              {p.restam <= 0 ? <span className="v-selo v-selo-esgotado">Esgotado</span> : <BotaoAdicionar p={p} texto="Quero este" curto desabilitado={desabilitado} />}
            </div>
          ))}
        </div>
        <p className="v-legenda" style={{ margin: 0 }}>{t('credito_pequeno')}</p>
      </div>
    </section>
  );
}

// ───────────────────────── S6 · como funciona ─────────────────────────

function ComoFunciona() {
  const { t, vitrine } = useVale();
  return (
    <section className="v-col v-secao">
      <h2 className="v-h2">{t('como_titulo')}</h2>
      <ol className="v-passos">
        <li><span className="v-passo-num">1</span><span><b>Compra aqui.</b> Escolhe, paga no Pix e pronto.</span></li>
        <li><span className="v-passo-num">2</span><span><b>Recebe o código.</b> Chega na hora, com QR code. Salva no WhatsApp.</span></li>
        <li><span className="v-passo-num">3</span><span><b>Mostra no bar.</b> O garçom lê o código e dá baixa. Vale numa visita, qualquer dia em até {vitrine!.campanha.validade_meses} meses.</span></li>
      </ol>
      <Link to="/vale/consultar" className="v-link">Já comprei: consultar meu vale</Link>
    </section>
  );
}

// ───────────────────────── S7 · presente ─────────────────────────

function Presente({ compacto }: { compacto: boolean }) {
  const { t, vitrine, setPresente, produto, definir, quantidade, avisar } = useVale();
  const montar = () => { setPresente(true); avisar('Presente ligado: o vale sai no nome de quem vai ganhar'); document.getElementById('escolha')?.scrollIntoView({ behavior: 'smooth' }); };
  if (compacto) return (
    <section id="presente" className="v-col v-secao">
      <div className="v-card">
        <h2 className="v-h2">{t('presente_titulo_black')}</h2>
        <p style={{ margin: '0 0 12px' }}>Na compra, marque "é presente" e o vale sai no nome de quem vai ganhar.</p>
        <button type="button" className="v-btn" onClick={montar}>{t('presente_cta')}</button>
      </div>
    </section>
  );
  const vitrinePresente = ['vale-200', 'cartela-10', 'kit-boteco'].map((s) => produto(s)).filter((p): p is Produto => !!p && p.restam > 0);
  return (
    <section id="presente" className="v-col v-secao">
      <h2 className="v-h2">{t('presente_titulo_natal')}</h2>
      <p>{t('presente_texto')}</p>
      <ul className="v-regras">
        <li>Fica no nome de quem ganha</li><li>Sai na hora, é só mandar no WhatsApp</li><li>Vale {vitrine!.campanha.validade_meses} meses</li>
      </ul>
      <div className="v-pilha">
        {vitrinePresente.map((p) => (
          <div key={p.slug} className="v-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span><b>{p.nome}</b><br /><span className="v-num">R$ {reais(p.preco_por)}</span></span>
            {quantidade(p.slug) > 0 ? <Seletor p={p} /> : <button type="button" className="v-mais" aria-label={`Adicionar ${p.nome}`} onClick={() => { definir(p.slug, 1); setPresente(true); avisar('Adicionado'); }}>+</button>}
          </div>
        ))}
      </div>
      <div className="v-espaco" />
      <button type="button" className="v-cta" onClick={montar}>{t('presente_cta')}</button>
    </section>
  );
}

// ───────────────────────── S8 · regras ─────────────────────────

function Regras() {
  const { vitrine } = useVale();
  const c = vitrine!.campanha;
  const hh = c.happy_hour_fim.replace(':00', 'h');
  return (
    <section className="v-col v-secao">
      <h2 className="v-h2">O combinado</h2>
      <ul className="v-regras">
        <li><span>Vale <b>{c.validade_meses} meses</b> a partir da compra, <b>qualquer dia</b> que o bar abrir. A data exata vem no seu vale.</span></li>
        <li><span>Produtos com chopp <b>não valem no happy hour (até {hh})</b>. Depois das {hh}, tudo certo.</span></li>
        <li><span>Vale <b>numa visita só</b>: o que não for usado naquela noite não fica para outro dia.</span></li>
        <li><span><b>10% de serviço</b> sobre o valor que você pagou, não sobre o preço cheio. <b>Couvert artístico à parte</b>, nos dias de música.</span></li>
        <li><span><b>Não junta</b> com outras promoções. Os vales 100 e 200 não pagam garrafas nem outras promoções.</span></li>
        <li><span>Até <b>2 de cada produto por CPF</b>.</span></li>
        <li><span>Bebida alcoólica só para <b>maiores de 18</b>, com documento com foto na hora.</span></li>
        <li><span>Mudou de ideia? <b>7 dias</b> para cancelar, com devolução integral.</span></li>
      </ul>
      <Link to="/vale/regulamento" className="v-link">Ler o regulamento completo</Link>
    </section>
  );
}

// ───────────────────────── S9 · FAQ ─────────────────────────

function Faq() {
  const { t, vitrine } = useVale();
  const [aberta, setAberta] = useState<number | null>(null);
  const hh = vitrine!.campanha.happy_hour_fim.replace(':00', 'h');
  const itens: [string, string][] = [
    ['Posso dar de presente?', 'Pode. Marque "é presente" e coloque nome e CPF de quem vai ganhar. Se preferir, transfere depois pelo WhatsApp, sem custo.'],
    ['Preciso usar tudo de uma vez?', `Sim. O vale é usado numa visita só, na mesma noite, qualquer dia dentro dos ${vitrine!.campanha.validade_meses} meses. O que sobrar não fica guardado para outro dia.`],
    ['Vale no fim de semana?', `Vale. Qualquer dia que a casa abrir. Só os produtos com chopp ficam fora do happy hour, até as ${hh}.`],
    ['O Vale Ditado 100 paga qualquer coisa?', 'Qualquer item do cardápio, menos garrafas e o que já estiver em outra promoção.'],
    ['Paga 10%?', 'Paga, mas sobre o valor que você pagou, não sobre o preço cheio. O couvert é à parte.'],
    ['Junta com outra promoção?', 'Não. O vale já é a promoção.'],
    ['Perdi o código. E agora?', 'Abra o link do comprovante que você salvou. Se perdeu também, chame no WhatsApp com seu CPF que a gente reenvia.'],
    ['E a nota fiscal?', t('faq_nota')],
  ];
  return (
    <section className="v-col v-secao">
      <h2 className="v-h2">Pergunta de mesa</h2>
      <div className="v-faq">
        {itens.map(([q, r], i) => (
          <div className="v-faq-item" key={i}>
            <button type="button" className="v-faq-q" aria-expanded={aberta === i} aria-controls={`faq-${i}`} onClick={() => setAberta(aberta === i ? null : i)}>
              <span>{q}</span><Chevron />
            </button>
            {aberta === i && <div className="v-faq-r" id={`faq-${i}`}>{r}</div>}
          </div>
        ))}
      </div>
      <p style={{ marginTop: 16 }}>Ficou dúvida? <a className="v-link" href={linkWhats(t('whatsapp'))} target="_blank" rel="noopener noreferrer">Chama no WhatsApp (65) 4141-3655</a></p>
    </section>
  );
}

// ───────────────────────── carrinho ─────────────────────────

function BarraCarrinho({ abrir }: { abrir: () => void }) {
  const { totais } = useVale();
  return (
    <m.div className="v-barra-carrinho" initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34 }}>
      <div className="v-col">
        <div className="v-num">
          <div style={{ fontWeight: 800 }}>{totais.vales} {totais.vales === 1 ? 'vale' : 'vales'} · R$ {reais(totais.total)}</div>
          {totais.economia > 0 && <div className="v-economia">você economiza R$ {reais(totais.economia)}</div>}
        </div>
        <button type="button" className="v-barra-btn" onClick={abrir}>CONTINUAR</button>
      </div>
    </m.div>
  );
}

function Gaveta({ fechar }: { fechar: () => void }) {
  const { itens, produto, definir, totais } = useVale();
  const navegar = useNavigate();
  useEsc(fechar);
  const linhas = Object.entries(itens).map(([slug, q]) => ({ p: produto(slug), q })).filter((x) => x.p);
  return (
    <>
      <m.div className="v-veu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar} />
      <m.div className="v-gaveta v-lateral" role="dialog" aria-modal="true" aria-label="Seu pedido"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
        <div className="v-alca" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="v-h2" style={{ margin: 0 }}>Seu pedido</h2>
          <button type="button" className="v-fechar" onClick={fechar} aria-label="Fechar"><IconeFechar /></button>
        </div>
        {linhas.length === 0 && <p className="v-apoio">Carrinho vazio. A mesa está posta, falta escolher.</p>}
        {linhas.map(({ p, q }) => (
          <div className="v-linha" key={p!.slug}>
            <div>
              <div style={{ fontWeight: 700 }}>{p!.nome}</div>
              <div className="v-legenda v-num">{q}x · R$ {reais(p!.preco_por * q)}</div>
              <button type="button" className="v-link" style={{ fontSize: 13 }} onClick={() => definir(p!.slug, 0)}>Tirar</button>
            </div>
            <Seletor p={p!} claro />
          </div>
        ))}
        <div className="v-total v-num"><span>Total</span><span>R$ {reais(totais.total)}</span></div>
        {totais.economia > 0 && <p className="v-economia-escura" style={{ margin: '0 0 12px', fontSize: 14 }}>Você economiza R$ {reais(totais.economia)}</p>}
        <button type="button" className="v-cta" disabled={totais.vales === 0} onClick={() => navegar('/vale/checkout')}>Ir para o pagamento</button>
      </m.div>
    </>
  );
}

function FolhaProduto({ p, fechar, desabilitado }: { p: Produto; fechar: () => void; desabilitado: boolean }) {
  const { vitrine, quantidade, definir, maximo, avisar } = useVale();
  const c = vitrine!.campanha;
  const brinde = c.fase === 'black' && brindeCurto(c, vitrine!.agora);
  useEsc(fechar);
  const q = quantidade(p.slug);
  const adicionar = () => {
    if (q >= maximo(p)) { avisar(`Máximo de ${p.limite_por_cpf} por CPF`); return; }
    definir(p.slug, q + 1); avisar('Adicionado'); fechar();
  };
  return (
    <>
      <m.div className="v-veu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar} />
      <m.div className="v-gaveta" role="dialog" aria-modal="true" aria-label={p.nome}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
        <div className="v-alca" />
        <div className="v-pilha">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div className="v-pilha" style={{ gap: 8 }}>
              <div className="v-selos"><SeloPreco p={p} />{p.tem_alcool && <span className="v-selo v-selo-18">+18</span>}</div>
              <h2 className="v-h2" style={{ margin: 0 }}>{p.nome}</h2>
            </div>
            <button type="button" className="v-fechar" onClick={fechar} aria-label="Fechar"><IconeFechar /></button>
          </div>
          <Foto p={p} formato="43" />
          {p.tipo === 'kit' ? (
            <ul className="v-saldos">
              {p.itens.map((it, i) => <li key={i}><span>{it.descricao}</span><span className="v-num">{it.quantidade}x</span></li>)}
              {brinde && <li><span>{c.brinde_descricao} (brinde, pagando até {diaCuiaba(c.brinde_ate!)})</span><span>1x</span></li>}
            </ul>
          ) : (
            <p style={{ margin: 0 }}>Paga R$ {reais(p.preco_por)} e consome R$ {reais(p.credito_valor ?? 0)} no cardápio, numa visita.</p>
          )}
          <ul className="v-regras" style={{ margin: 0 }}>
            <li>Vale {c.validade_meses} meses a partir da compra.</li>
            {p.trava_happy_hour && <li>Não vale no happy hour (até {c.happy_hour_fim.replace(':00', 'h')}).</li>}
            {p.tem_alcool && <li>Bebida alcoólica só para maiores de 18, com documento com foto.</li>}
            {p.tipo === 'credito' && <li>Não paga garrafas nem outras promoções. Não dá troco.</li>}
            <li>Vale numa visita só (na mesma noite).</li>
          </ul>
          <div className="v-num"><span className="v-de">de R$ {reais(p.preco_de)}</span> <span className="v-por">R$ {reais(p.preco_por)}</span></div>
          <Restam p={p} />
          {p.restam <= 0
            ? <span className="v-selo v-selo-esgotado">Esgotado</span>
            : <button type="button" className="v-cta" disabled={desabilitado} onClick={adicionar}>Adicionar · R$ {reais(p.preco_por)}</button>}
        </div>
      </m.div>
    </>
  );
}

function useEsc(fechar: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', k);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = antes; };
  }, [fechar]);
}
