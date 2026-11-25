import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
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
    ? ['s1', 's3', 's7', 's4', 's5', 's6', 's8']
    : ['s1', 's3', 's4', 's5', 's6', 's7', 's8'];

  const render: Record<string, JSX.Element> = {
    s1: <Hero key="s1" abrir={setAberto} />,
    s3: natal ? <span key="s3" /> : <FaixaBrinde key="s3" />,
    s4: tudoEsgotado ? <TudoEsgotado key="s4" /> : <Grade key="s4" kits={kits} abrir={setAberto} desabilitado={!vendaAberta} />,
    s5: tudoEsgotado ? <span key="s5" /> : <Credito key="s5" creditos={creditos} desabilitado={!vendaAberta} />,
    s6: <ComoFunciona key="s6" />,
    s7: <Presente key="s7" compacto={!natal} />,
    s8: <AntesDeComprar key="s8" />,
  };

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
      <div className="v-fundo">
        <FaixaTeste />
        {!gaveta && <Urgencia />}
        {natal && <div className="v-faixa-topo">{t('natal_faixa_topo')}</div>}
        {new URLSearchParams(location.search).get('seg') === 'premio' && (
          <div className="v-faixa-musgo">Você tem um presente esperando no Ditado. Ele vale sem compra.</div>
        )}
        {!vendaAberta && <Antes />}
        {secoes.map((s) => render[s])}
        <Fecho />
        {totais.vales > 0 && !gaveta && <BarraCarrinho abrir={() => setGaveta(true)} />}
        <AnimatePresence>
          {gaveta && <Gaveta key="gaveta" fechar={() => setGaveta(false)} />}
          {aberto && <FolhaProduto key="folha" p={aberto} fechar={() => setAberto(null)} desabilitado={!vendaAberta} />}
        </AnimatePresence>
        <Toast />
      </div>
      </MotionConfig>
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

/** O topo diz o que se vende e mostra o produto: um vale de verdade, "na mão". */
function Hero({ abrir }: { abrir: (p: Produto) => void }) {
  const { vitrine, t } = useVale();
  const c = vitrine!.campanha;
  const natal = c.fase === 'natal';
  const abertos = vitrine!.produtos.filter((p) => p.restam > 0);
  const menor = Math.min(...(abertos.length ? abertos : vitrine!.produtos).map((p) => p.preco_por));
  const maiorPct = Math.max(0, ...vitrine!.produtos.filter((p) => p.tipo === 'kit').map((p) => pctDesconto(p.preco_de, p.preco_por)));
  const f = natal ? 'natal' : 'black';
  const ordem = (p: Produto) => (natal ? p.destaque_natal : p.destaque_black) ?? 99;
  const vitrineVale = [...abertos].sort((a, b) => ordem(a) - ordem(b))[0];
  return (
    <header className="v-hero">
      <div className="v-largo v-hero-topo">
        <img src="/marca/ditado-brasa-bar.svg" alt="Ditado Brasa & Bar" className="v-hero-logo" width={84} height={50} />
        <Link to="/vale/consultar" className="v-hero-link">Já comprei</Link>
      </div>
      <div className="v-largo v-hero-grade">
        <m.div className="v-hero-texto" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <p className="v-aviso">{t(`${f}_faixa`)}</p>
          <h1 className="v-display">{t(`${f}_titulo`)}</h1>
          <p className="v-hero-sub">{t(`${f}_subtitulo`, { pct: maiorPct })}</p>
          <a href="#escolha" className="v-cta v-hero-cta">{t(`${f}_cta`)}</a>
          <p className="v-hero-rodape v-num">{Number.isFinite(menor) ? `A partir de ${rs(menor)}. ` : ''}{t(`${f}_apoio`)}</p>
        </m.div>
        {c.hero_foto_url ? (
          <div className="v-hero-visual">
            <img className="v-hero-foto" src={c.hero_foto_url} alt="Chopp gelado no Ditado" fetchPriority="high" width={800} height={1000} />
            {vitrineVale && <Bilhete p={vitrineVale} abrir={() => abrir(vitrineVale)} />}
          </div>
        ) : vitrineVale && <Bilhete p={vitrineVale} abrir={() => abrir(vitrineVale)} />}
      </div>
    </header>
  );
}

/** O vale de papel: corpo com o que vem, picote e canhoto com o preço. Abre o produto. */
function Bilhete({ p, abrir }: { p: Produto; abrir: () => void }) {
  const credito = p.tipo === 'credito';
  return (
    <m.button type="button" className="v-bilhete" onClick={abrir}
      initial={{ opacity: 0, y: 48, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: -3 }}
      transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <span className="v-bilhete-papel">
        <span className="v-bilhete-corpo">
          <span className="v-bilhete-marca">Vale Ditado</span>
          <span className="v-bilhete-nome">{p.nome}</span>
          <span className="v-bilhete-comp">{p.composicao}</span>
        </span>
        <span className="v-bilhete-canhoto v-num">
          <span className="v-bilhete-pct">{credito ? `+${pctBonus(p)}%` : `-${pctDesconto(p.preco_de, p.preco_por)}%`}</span>
          <span className="v-bilhete-de">R$ {reais(p.preco_de)}</span>
          <span className="v-bilhete-por">R$ {reais(p.preco_por)}</span>
        </span>
      </span>
    </m.button>
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

/** Faixa da marca (âmbar): o brinde explicado uma vez, para a página toda. */
function FaixaBrinde() {
  const { vitrine, t } = useVale();
  const c = vitrine!.campanha;
  if (!c.brinde_descricao || !c.brinde_ate || new Date(c.brinde_ate).getTime() < new Date(vitrine!.agora).getTime()) return null;
  return (
    <section className="v-faixa-marca" aria-label="Brinde">
      <div className="v-largo v-faixa-marca-in">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
          <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
        </svg>
        <div>
          <p className="v-faixa-marca-titulo">{t('black_brinde_linha')}</p>
          <p className="v-faixa-marca-texto">Todo vale pago até {diaCuiaba(c.brinde_ate)} às {horaCuiaba(c.brinde_ate)} ganha {c.brinde_descricao}. Um por vale, resgatado junto com ele, dentro da validade.</p>
        </div>
      </div>
    </section>
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

// ───────────────────────── S4 · cardápio de vales ─────────────────────────

const BLOCOS: { cat: Produto['categoria']; titulo: 'bloco_chopp' | 'bloco_kits' | 'bloco_drinks' | 'bloco_familia' }[] = [
  { cat: 'chopp', titulo: 'bloco_chopp' },
  { cat: 'kits', titulo: 'bloco_kits' },
  { cat: 'drinks', titulo: 'bloco_drinks' },
  { cat: 'familia', titulo: 'bloco_familia' },
];

/** Os vales como um cardápio: linhas com nome, o que vem e o preço, sem caixas. */
function Grade({ kits, abrir, desabilitado }: { kits: Produto[]; abrir: (p: Produto) => void; desabilitado: boolean }) {
  const { vitrine, t } = useVale();
  const blocos = BLOCOS.filter((b) => kits.some((p) => p.categoria === b.cat));
  const vendidos = vitrine!.vendidos_total;
  return (
    <section id="escolha" className="v-largo v-secao v-cardapio-secao">
      <div className="v-cabeca">
        <h2 className="v-h2-grande">{t('grade_titulo')}</h2>
        <p className="v-apoio">{t('grade_subtitulo')}{vendidos >= vitrine!.campanha.mostrar_vendidos_a_partir ? ` ${vendidos} vales já vendidos.` : ''}</p>
      </div>
      <div className="v-cardapio">
        {blocos.map((b) => (
          <div key={b.cat} id={`bloco-${b.cat}`} className={`v-grupo v-grupo-${b.cat}`}>
            <h3 className="v-grupo-titulo">{t(b.titulo)}</h3>
            <ul className="v-menu">
              {kits.filter((p) => p.categoria === b.cat).map((p) => <LinhaMenu key={p.slug} p={p} abrir={abrir} desabilitado={desabilitado} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinhaMenu({ p, abrir, desabilitado }: { p: Produto; abrir: (p: Produto) => void; desabilitado: boolean }) {
  const { t } = useVale();
  const esgotado = p.restam <= 0;
  return (
    <li className={`v-linha-menu${esgotado ? ' v-esgotada' : ''}${p.foto_url ? ' v-lm-com-foto' : ''}`}>
      <button type="button" className="v-lm-abrir" onClick={() => abrir(p)}>
        {p.foto_url && <span className="v-lm-foto-moldura"><img className="v-lm-foto" src={p.foto_url} alt="" loading="lazy" width={104} height={104} /></span>}
        <span className="v-lm-texto">
          <span className="v-lm-nome">{p.nome}</span>
          <span className="v-lm-comp">{p.composicao}</span>
          <span className="v-lm-meta">
            <span className="v-lm-pct">-{pctDesconto(p.preco_de, p.preco_por)}%</span>
            {p.tem_alcool ? <span>+18</span> : p.selo ? <span>{p.selo}</span> : null}
            <Restam p={p} />
          </span>
        </span>
        <span className="v-lm-preco v-num">
          <span className="v-lm-de">R$ {reais(p.preco_de)}</span>
          <span className="v-lm-por">R$ {reais(p.preco_por)}</span>
        </span>
      </button>
      <span className="v-lm-acao">
        {esgotado
          ? <a className="v-link v-lm-aviso" href={linkWhats(t('whatsapp'), `Oi! Quero ser avisado quando abrir um novo lote do ${p.nome}.`)} target="_blank" rel="noopener noreferrer">Avisar</a>
          : <BotaoAdicionar p={p} desabilitado={desabilitado} />}
      </span>
    </li>
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
    <section id="credito" className="v-largo v-secao v-credito-secao">
      <div className="v-cabeca">
        <h2 className="v-h2-grande">{t('credito_titulo')}</h2>
        <p className="v-apoio">{t('credito_texto')}</p>
      </div>
      <div className="v-creditos">
        {creditos.map((p) => (
          <div key={p.slug} className={`v-credito-item${p.restam <= 0 ? ' v-esgotado' : ''}`}>
            <span className="v-paga v-num">Você paga R$ {reais(p.preco_por).replace(',00', '')} e usa</span>
            <span className="v-usa v-num">R$ {reais(p.credito_valor ?? 0).replace(',00', '')}</span>
            <span className="v-bonus v-num">+R$ {reais((p.credito_valor ?? 0) - p.preco_por).replace(',00', '')} de bônus</span>
            <Restam p={p} />
            {p.restam <= 0 ? <span className="v-selo v-selo-esgotado">Esgotado</span> : <BotaoAdicionar p={p} texto={`Quero o de R$ ${reais(p.preco_por).replace(',00', '')}`} desabilitado={desabilitado} />}
          </div>
        ))}
      </div>
      <p className="v-credito-pequeno">{t('credito_pequeno')}</p>
    </section>
  );
}

// ───────────────────────── S6 · como funciona ─────────────────────────

function ComoFunciona() {
  const { t, vitrine } = useVale();
  const passos: [string, string][] = [
    ['Compra aqui.', 'Escolhe, paga no Pix e pronto.'],
    ['Recebe o código.', 'Chega na hora, com QR code. Salva no WhatsApp.'],
    ['Mostra no bar.', `O garçom lê o código e dá baixa. Vale numa visita, qualquer dia em até ${vitrine!.campanha.validade_meses} meses.`],
  ];
  return (
    <section className="v-largo v-secao">
      <div className="v-cabeca"><h2 className="v-h2-grande">{t('como_titulo')}</h2></div>
      <ol className="v-passos3">
        {passos.map(([titulo, texto], i) => (
          <li key={i}><span className="v-passo-n" aria-hidden="true">{i + 1}</span><span className="v-passo-t">{titulo}</span><span className="v-passo-x">{texto}</span></li>
        ))}
      </ol>
      <p style={{ margin: '20px 0 0' }}><Link to="/vale/consultar" className="v-link">Já comprei: consultar meu vale</Link></p>
    </section>
  );
}

// ───────────────────────── S7 · presente ─────────────────────────

function Presente({ compacto }: { compacto: boolean }) {
  const { t, vitrine, setPresente, produto, definir, quantidade, avisar } = useVale();
  const montar = () => { setPresente(true); avisar('Presente ligado: o vale sai no nome de quem vai ganhar'); document.getElementById('escolha')?.scrollIntoView({ behavior: 'smooth' }); };
  if (compacto) return (
    <section id="presente" className="v-largo v-secao">
      <div className="v-presente">
        <div>
          <h2 className="v-h2-grande">{t('presente_titulo_black')}</h2>
          <p>Na compra, marque "é presente" e o vale sai no nome de quem vai ganhar.</p>
        </div>
        <button type="button" className="v-btn" onClick={montar}>{t('presente_cta')}</button>
      </div>
    </section>
  );
  const vitrinePresente = ['vale-200', 'cartela-10', 'kit-boteco'].map((s) => produto(s)).filter((p): p is Produto => !!p && p.restam > 0);
  return (
    <section id="presente" className="v-col v-secao">
      <h2 className="v-h2-grande">{t('presente_titulo_natal')}</h2>
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

function AntesDeComprar() {
  return (
    <section className="v-largo v-secao">
      <div className="v-antes">
        <Regras />
        <Faq />
      </div>
    </section>
  );
}

function Regras() {
  const { vitrine } = useVale();
  const c = vitrine!.campanha;
  return (
    <div>
      <h2 className="v-h2-grande">O combinado</h2>
      <ul className="v-regras v-linhas">
        <li><span>Vale <b>{c.validade_meses} meses</b> a partir da compra, <b>qualquer dia</b> que o bar abrir. A data exata vem no seu vale.</span></li>
        <li><span>Vale <b>numa visita só</b>: o que não for usado naquela noite não fica para outro dia.</span></li>
        <li><span><b>10% de serviço</b> sobre o valor que você pagou, não sobre o preço cheio. <b>Couvert artístico à parte</b>, nos dias de música.</span></li>
        <li><span><b>Não junta</b> com outras promoções. Os vales 100 e 200 não pagam itens de outras promoções.</span></li>
        <li><span>Até <b>2 de cada produto por CPF</b>.</span></li>
        <li><span>Bebida alcoólica só para <b>maiores de 18</b>, com documento com foto na hora.</span></li>
        <li><span>Mudou de ideia? <b>7 dias</b> para cancelar, com devolução integral.</span></li>
      </ul>
      <Link to="/vale/regulamento" className="v-link">Ler o regulamento completo</Link>
    </div>
  );
}

// ───────────────────────── S9 · FAQ ─────────────────────────

function Faq() {
  const { t, vitrine } = useVale();
  const [aberta, setAberta] = useState<number | null>(null);
  const itens: [string, string][] = [
    ['Posso dar de presente?', 'Pode. Marque "é presente" e coloque nome e CPF de quem vai ganhar. Se preferir, transfere depois pelo WhatsApp, sem custo.'],
    ['Preciso usar tudo de uma vez?', `Sim. O vale é usado numa visita só, na mesma noite, qualquer dia dentro dos ${vitrine!.campanha.validade_meses} meses. O que sobrar não fica guardado para outro dia.`],
    ['Vale no fim de semana?', 'Vale. Qualquer dia que a casa abrir.'],
    ['O Vale Ditado 100 paga qualquer coisa?', 'Qualquer item do cardápio, menos o que já estiver em outra promoção.'],
    ['Paga 10%?', 'Paga, mas sobre o valor que você pagou, não sobre o preço cheio. O couvert é à parte.'],
    ['Junta com outra promoção?', 'Não. O vale já é a promoção.'],
    ['Perdi o código. E agora?', 'Abra o link do comprovante que você salvou. Se perdeu também, chame no WhatsApp com seu CPF que a gente reenvia.'],
    ['E a nota fiscal?', t('faq_nota')],
  ];
  return (
    <div>
      <h2 className="v-h2-grande">Pergunta de mesa</h2>
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
    </div>
  );
}

// ───────────────────────── fechamento ─────────────────────────

function Fecho() {
  const { t, vitrine } = useVale();
  const natal = vitrine!.campanha.fase === 'natal';
  return (
    <div className="v-fecho">
      <div className="v-largo v-fecho-in">
        <h2 className="v-h2-grande">{natal ? t('natal_titulo') : t('ditado_secao')}</h2>
        <a href="#escolha" className="v-cta">{t(natal ? 'natal_cta' : 'black_cta')}</a>
      </div>
      <div className="v-largo"><RodapeLegal /></div>
    </div>
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
            {p.tipo === 'credito' && <li>Não paga itens de outras promoções. Não dá troco.</li>}
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
