import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { carregarPedido, ErroRede, verificarPagamento, type PedidoPublico } from './api';
import { useVale } from './carrinho';
import { Carregando, CardVale, FaixaTeste, Logo, RodapeLegal, useRelogio } from './comum';
import { dataBR, linkWhats, linkWhatsLivre, reais } from './util';

const QR = lazy(() => import('qrcode.react').then((x) => ({ default: x.QRCodeSVG })));

/** C2 (Pix pendente) e C3 (vales pagos) no mesmo link: /vale/c/:token. O link é permanente e mostra o saldo atualizado. */
export default function Comprovante() {
  const { token = '' } = useParams();
  const [pedido, setPedido] = useState<PedidoPublico | null | undefined>(undefined);
  const [semRede, setSemRede] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const ultimoStatus = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const p = await carregarPedido(token);
      setPedido(p ?? null);
      setSemRede(false);
    } catch (e) {
      if (e instanceof ErroRede) setSemRede(true); else setPedido((x) => (x === undefined ? null : x));
    }
  }, [token]);

  const verificar = useCallback(async () => {
    setVerificando(true);
    try {
      const r = await verificarPagamento(token);
      if (r?.pedido) setPedido(r.pedido);
    } catch { /* fica com o que tem */ }
    setVerificando(false);
  }, [token]);

  useEffect(() => { document.title = 'Vale Ditado · Seu vale'; carregar(); }, [carregar]);

  // enquanto o Pix não cai: consulta o banco a cada 4 s; ao voltar do app do banco, pergunta ao gateway na hora
  const pendente = pedido?.status === 'pendente';
  useEffect(() => {
    if (!pendente) return;
    const id = window.setInterval(carregar, 4000);
    const vis = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [pendente, carregar, verificar]);

  const [transicao, setTransicao] = useState(false);
  useEffect(() => {
    if (!pedido) return;
    const antes = ultimoStatus.current;
    ultimoStatus.current = pedido.status;
    if (antes === 'pendente' && pedido.status === 'pago') {
      setTransicao(true);
      const id = window.setTimeout(() => setTransicao(false), 1400);
      return () => window.clearTimeout(id);
    }
  }, [pedido]);

  if (pedido === undefined) return semRede ? <SemRede /> : <Carregando />;
  if (pedido === null) return (
    <Moldura>
      <h1 className="v-h2">Não achamos esse vale.</h1>
      <p className="v-apoio">Confira o link ou chame no WhatsApp.</p>
      <a className="v-cta" href={linkWhats('556541413655')} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
    </Moldura>
  );
  if (transicao) return <Moldura><div className="v-carregando"><b>Pix recebido! Gerando seus vales…</b></div></Moldura>;

  switch (pedido.status) {
    case 'pendente': return <Pagar pedido={pedido} verificar={verificar} verificando={verificando} />;
    case 'pago': return <Pago pedido={pedido} token={token} />;
    case 'expirado': case 'cancelado': return <Expirado pedido={pedido} />;
    case 'pago_sem_lote': return (
      <Moldura>
        <h1 className="v-h2">Seu pagamento chegou, mas o lote acabou antes.</h1>
        <p className="v-apoio">Vamos devolver o valor integral de R$ {reais(pedido.valor_total)}. Se quiser falar com a gente, chame no WhatsApp.</p>
        <a className="v-cta" href={linkWhats('556541413655', `Oi! Meu pedido do Vale Ditado: ${location.href}`)} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
      </Moldura>
    );
    case 'estornado': return (
      <Moldura>
        <h1 className="v-h2">Este vale foi cancelado e o valor devolvido.</h1>
        <Link className="v-btn" to="/vale">Ver os vales</Link>
      </Moldura>
    );
  }
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="v-fundo">
      <FaixaTeste />
      <div className="v-col" style={{ paddingTop: 24 }}>
        <Logo largura={84} />
        <div className="v-pilha">{children}</div>
        <RodapeLegal />
      </div>
    </div>
  );
}

function SemRede() {
  return (
    <Moldura>
      <h1 className="v-h2">Sem internet.</h1>
      <p className="v-apoio">Se você já pagou, seu vale está garantido. Abra este link de novo quando a conexão voltar.</p>
      <button className="v-btn" onClick={() => location.reload()}>Tentar de novo</button>
    </Moldura>
  );
}

// ───────────────────────── C2 · Pix ─────────────────────────

function Pagar({ pedido, verificar, verificando }: { pedido: PedidoPublico; verificar: () => void; verificando: boolean }) {
  const { t } = useVale();
  const desvio = useMemo(() => new Date(pedido.agora).getTime() - Date.now(), [pedido.agora]);
  const { resta, s } = useRelogio(pedido.reserva_expira_em, desvio);
  const [copiado, setCopiado] = useState(false);
  const [qrAberto, setQrAberto] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  const minTot = Math.floor(resta / 60000);

  const copiar = async () => {
    if (!pedido.pix_copia_cola) return;
    try { await navigator.clipboard.writeText(pedido.pix_copia_cola); } catch {
      const ta = document.createElement('textarea'); ta.value = pedido.pix_copia_cola; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* sem cópia */ } ta.remove();
    }
    setCopiado(true);
  };

  if (pedido.forma_pagamento === 'cartao') return (
    <Moldura>
      <h1 className="v-h2">Pague com cartão.</h1>
      <ResumoPedido pedido={pedido} />
      <div className="v-valor-grande v-num">R$ {reais(pedido.valor_total)}</div>
      {pedido.gateway_url && <a className="v-cta" href={pedido.gateway_url}>Abrir pagamento com cartão</a>}
      <p className="v-relogio">Seus vales ficam reservados por <b>{String(minTot).padStart(2, '0')}:{String(s).padStart(2, '0')}</b>.</p>
      <p className="v-apoio v-centro">Confirmando com o banco… Esta tela atualiza sozinha.</p>
      <button type="button" className="v-btn" onClick={verificar} disabled={verificando}>{verificando ? 'Verificando…' : 'Já paguei e não atualizou'}</button>
    </Moldura>
  );

  return (
    <Moldura>
      <h1 className="v-h2">Paga no Pix e pronto.</h1>
      <ResumoPedido pedido={pedido} />
      <div className="v-valor-grande v-num">R$ {reais(pedido.valor_total)}</div>
      <button type="button" className="v-cta" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar código Pix'}</button>
      {copiado && <p className="v-centro" style={{ margin: 0 }}>Código copiado. Agora é só colar no app do banco.</p>}
      <ol className="v-passos">
        <li><span className="v-passo-num">1</span><span>Abra o app do seu banco e escolha Pix copia e cola.</span></li>
        <li><span className="v-passo-num">2</span><span>Cole o código. {t('recebedor_nome') ? <>O recebedor aparece como <b>{t('recebedor_nome')}</b>, a empresa que recebe os pagamentos do Ditado.</> : null}</span></li>
        <li><span className="v-passo-num">3</span><span>Pague. Esta tela atualiza sozinha.</span></li>
      </ol>
      <button type="button" className="v-link" onClick={() => setQrAberto(!qrAberto)}>{qrAberto ? 'Esconder QR code' : 'Pagar com outro celular / computador'}</button>
      {qrAberto && pedido.pix_copia_cola && (
        <div className="v-qr"><Suspense fallback={<div style={{ width: 200, height: 200 }} />}><QR value={pedido.pix_copia_cola} size={200} marginSize={1} /></Suspense></div>
      )}
      <p className="v-relogio">Seus vales ficam reservados por <b>{String(minTot).padStart(2, '0')}:{String(s).padStart(2, '0')}</b>.</p>
      <div className="v-card v-centro">
        <b>Esperando o Pix cair…</b>
        <p className="v-legenda" style={{ margin: '6px 0 0' }}>Pode deixar esta tela aberta. Assim que o banco confirmar, seus códigos aparecem aqui.</p>
        <button type="button" className="v-link" onClick={verificar} disabled={verificando}>{verificando ? 'Verificando…' : 'Já paguei e não atualizou: verificar de novo'}</button>
      </div>
      <p className="v-legenda v-centro">Problema? <a className="v-link" href={linkWhats(t('whatsapp'), `Oi! Problema no Pix do Vale Ditado: ${location.href}`)} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
    </Moldura>
  );
}

/** O que está sendo pago, acima do valor (para a pessoa conferir antes de abrir o banco). */
function ResumoPedido({ pedido }: { pedido: PedidoPublico }) {
  if (!pedido.itens.length) return null;
  return (
    <ul className="v-resumo-pix" aria-label="Seu pedido">
      {pedido.itens.map((i) => (
        <li key={i.slug}><span>{i.quantidade}x {i.produto}</span><span className="v-num">R$ {reais(i.preco * i.quantidade)}</span></li>
      ))}
      {pedido.presente && pedido.presenteado && <li className="v-legenda"><span>Presente para {pedido.presenteado}</span></li>}
    </ul>
  );
}

function Expirado({ pedido }: { pedido: PedidoPublico }) {
  const { definir, t } = useVale();
  const navegar = useNavigate();
  const novoPix = () => {
    pedido.itens.forEach((i) => definir(i.slug, Math.min(i.quantidade, Math.max(i.restam, 0))));
    navegar('/vale/checkout');
  };
  const algumRestando = pedido.itens.some((i) => i.restam > 0);
  return (
    <Moldura>
      <h1 className="v-h2">O tempo do Pix acabou.</h1>
      <p className="v-apoio">Os vales voltaram para o lote.{algumRestando ? ' Se ainda tiver, dá para gerar um Pix novo.' : ' Esse lote acabou.'}</p>
      {algumRestando && <button type="button" className="v-cta" onClick={novoPix}>Gerar novo Pix</button>}
      <p className="v-legenda">Pagou e caiu aqui? Chame no WhatsApp (65) 4141-3655 com o comprovante.{' '}
        <a className="v-link" href={linkWhats(t('whatsapp'), `Oi! Paguei o Vale Ditado e a tela expirou: ${location.href}`)} target="_blank" rel="noopener noreferrer">Chamar</a></p>
    </Moldura>
  );
}

// ───────────────────────── C3 · comprovante ─────────────────────────

function Pago({ pedido, token }: { pedido: PedidoPublico; token: string }) {
  const { vitrine } = useVale();
  const area = useRef<HTMLDivElement>(null);
  const [baixando, setBaixando] = useState(false);
  const link = `${location.origin}/vale/c/${token}`;
  const produtos = [...new Set(pedido.vales.map((v) => v.produto))].join(', ');
  const validade = dataBR(pedido.vales[0]?.validade);
  const hh = vitrine?.campanha.happy_hour_fim.replace(':00', 'h') ?? '21h';
  const temTravaHH = pedido.vales.some((v) => v.trava_happy_hour);

  const textoWhats = pedido.presente
    ? `Você ganhou um Ditado de presente!\n${produtos}, no seu nome.\nVálido até ${validade}. É só mostrar o código no bar.\nVer o vale: ${link}\nDitado Brasa & Bar · Onde há fumaça, há fogo.`
    : `Meu Vale Ditado está garantido!\n${produtos}\nVálido até ${validade}.\nPara ver os códigos e o saldo: ${link}\nDitado Brasa & Bar · Onde há fumaça, há fogo.`;

  const baixar = async () => {
    if (!area.current) return;
    setBaixando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(area.current, { backgroundColor: '#f5efe6', scale: 2 });
      const a = document.createElement('a');
      a.download = `vale-ditado-${pedido.vales[0]?.codigo ?? 'comprovante'}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch { /* aparelho sem suporte */ }
    setBaixando(false);
  };

  return (
    <LazyMotion features={domAnimation}>
      <Confete />
      <Moldura>
        <h1 className="v-h1">Tá na mão!</h1>
        <p style={{ margin: 0 }}><b>Mais vale um Ditado na mão.</b> Agora é só marcar o dia.</p>
        <p className="v-apoio" style={{ margin: 0 }}>Seus vales estão abaixo. Guarde este link: ele mostra o código e o que já foi usado.</p>
        <a className="v-cta" href={linkWhatsLivre(textoWhats)} target="_blank" rel="noopener noreferrer">Salvar no WhatsApp</a>
        <p className="v-legenda v-centro" style={{ margin: 0 }}>Dica: mande para você mesmo ou para quem vai ganhar.</p>
        {pedido.presente && <a className="v-btn" href={linkWhatsLivre(textoWhats)} target="_blank" rel="noopener noreferrer">Enviar para quem vai ganhar</a>}
        <div ref={area} className="v-pilha" style={{ padding: 4 }}>
          {pedido.vales.map((v) => (
            <CardVale key={v.codigo} v={v} qr={
              <div className="v-qr"><Suspense fallback={<div style={{ width: 180, height: 180 }} />}><QR value={v.codigo} size={180} marginSize={1} /></Suspense></div>
            } />
          ))}
        </div>
        <button type="button" className="v-btn" onClick={baixar} disabled={baixando}>{baixando ? 'Gerando imagem…' : 'Baixar imagem'}</button>
        <a className="v-btn" href="https://www.ditado.org/reserva">Reservar mesa</a>
        <div className="v-card">
          <h2 className="v-h3" style={{ marginTop: 0 }}>Como usar</h2>
          <ul className="v-regras" style={{ margin: 0 }}>
            <li>Mostre o código ao garçom ou no caixa, com documento com foto.</li>
            {temTravaHH && <li>Produtos com chopp só depois das {hh} (não valem no happy hour).</li>}
            <li>Vale numa visita só: o que sobrar naquela noite não fica para outro dia.</li>
            <li>10% sobre o valor pago · couvert à parte · não junta com outras promoções.</li>
          </ul>
        </div>
        <p className="v-legenda v-centro"><b>Guarde este link.</b> É nele que está o seu código.</p>
        <Link className="v-link" to="/vale/regulamento">Ver regulamento</Link>
      </Moldura>
    </LazyMotion>
  );
}

/** Confete leve, uma vez só por comprovante. */
function Confete() {
  const [mostrar] = useState(() => {
    try {
      const k = `vale_confete_${location.pathname}`;
      if (sessionStorage.getItem(k)) return false;
      sessionStorage.setItem(k, '1');
    } catch { /* sem armazenamento */ }
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const pecas = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: Math.random() * 100, d: 1.6 + Math.random() * 1.2, r: Math.random() * 360, c: ['#d99736', '#b65b43', '#f5efe6', '#46513a'][i % 4], atraso: Math.random() * 0.3,
  })), []);
  if (!mostrar) return null;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 70, overflow: 'hidden' }}>
      {pecas.map((p, i) => (
        <m.span key={i} style={{ position: 'absolute', left: `${p.x}%`, top: -12, width: 8, height: 12, background: p.c, borderRadius: 2 }}
          initial={{ y: -20, rotate: 0, opacity: 1 }} animate={{ y: '105vh', rotate: p.r + 360, opacity: [1, 1, 0] }}
          transition={{ duration: p.d, delay: p.atraso, ease: 'easeIn' }} />
      ))}
    </div>
  );
}
