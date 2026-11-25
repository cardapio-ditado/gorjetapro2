import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Produto, ValeCodigo } from './api';
import { useVale } from './carrinho';
import { dataBR, linkWhats, partesTempo, reais } from './util';

export function Logo({ largura = 110 }: { largura?: number }) {
  return <img src="/marca/ditado-brasa-bar.svg" alt="Ditado Brasa & Bar" className="v-logo" style={{ width: largura }} width={largura} height={Math.round(largura * 0.6)} />;
}

export function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Seletor [− 1 +] que trava no máximo (limite por CPF ou o que resta do lote). */
export function Seletor({ p, claro = false }: { p: Produto; claro?: boolean }) {
  const { quantidade, definir, maximo, avisar } = useVale();
  const q = quantidade(p.slug);
  const max = maximo(p);
  return (
    <span className={`v-seletor${claro ? ' v-claro' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`Tirar um ${p.nome}`} onClick={() => definir(p.slug, q - 1)}>−</button>
      <span aria-live="polite">{q}</span>
      <button type="button" aria-label={`Mais um ${p.nome}`} disabled={q >= max}
        onClick={() => { if (q < max) definir(p.slug, q + 1); else avisar(`Máximo de ${p.limite_por_cpf} por CPF`); }}>+</button>
    </span>
  );
}

/** Botão do card: "+" (ou "Quero este") que vira seletor depois do primeiro toque. */
export function BotaoAdicionar({ p, texto, desabilitado }: { p: Produto; texto?: string; desabilitado?: boolean }) {
  const { quantidade, definir, maximo, avisar } = useVale();
  const q = quantidade(p.slug);
  if (p.restam <= 0) return <button type="button" className="v-btn" disabled>Esgotou</button>;
  if (q > 0) return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Seletor p={p} />
      {q >= maximo(p) && <span className="v-legenda">{q >= p.limite_por_cpf ? `Máximo de ${p.limite_por_cpf} por CPF` : `Só restam ${p.restam}`}</span>}
    </span>
  );
  const add = (e: React.MouseEvent) => { e.stopPropagation(); definir(p.slug, 1); avisar('Adicionado'); };
  if (texto) return <button type="button" className="v-cta" disabled={desabilitado} onClick={add}>{texto}</button>;
  return <button type="button" className="v-mais" aria-label={`Adicionar ${p.nome}`} disabled={desabilitado} onClick={add}>+</button>;
}

export function Restam({ p }: { p: Produto }) {
  if (p.restam <= 0) return null;
  const pouco = p.restam < p.lote_total * 0.2;
  return <span className={`v-restam${pouco ? ' v-pouco' : ''}`}>{pouco ? `Últimos ${p.restam}` : `Restam ${p.restam} de ${p.lote_total}`}</span>;
}

export function Toast() {
  const { aviso } = useVale();
  if (!aviso) return null;
  return <div className="v-toast" role="status">{aviso}</div>;
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="v-carregando" role="status">{texto}</div>;
}

/** Relógio que conta até um instante, corrigido pela hora do servidor. */
export function useRelogio(alvo: string | null | undefined, desvioMs = 0) {
  const [agora, setAgora] = useState(() => Date.now() + desvioMs);
  useEffect(() => {
    if (!alvo) return;
    const id = window.setInterval(() => setAgora(Date.now() + desvioMs), 1000);
    return () => window.clearInterval(id);
  }, [alvo, desvioMs]);
  const resta = alvo ? new Date(alvo).getTime() - agora : 0;
  return { resta, ...partesTempo(resta), agora };
}

const STATUS: Record<ValeCodigo['status'], [string, string]> = {
  ativo: ['Ativo', ''], parcial: ['Em uso', ''], resgatado: ['Usado', 'v-usado'], vencido: ['Vencido', 'v-vencido'], estornado: ['Cancelado', 'v-cancelado'],
};

/** Card de um vale (comprovante e consulta): código, QR, saldo por item, validade, titular, status. */
export function CardVale({ v, qr }: { v: ValeCodigo; qr?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  const [rot, cls] = STATUS[v.status] ?? STATUS.ativo;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(v.codigo); setCopiado(true); window.setTimeout(() => setCopiado(false), 2000); } catch { /* sem área de transferência */ }
  };
  return (
    <article className="v-card v-pilha" aria-label={`Vale ${v.produto}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h3 className="v-nome">{v.produto}</h3>
        <span className={`v-status ${cls}`}>{rot}</span>
      </div>
      {v.status === 'vencido' && <p className="v-msg-erro" style={{ margin: 0 }}>Este vale venceu em {dataBR(v.validade)}.</p>}
      {v.status === 'estornado' && <p className="v-msg-erro" style={{ margin: 0 }}>Este vale foi cancelado e o valor devolvido.</p>}
      <div className="v-centro">
        <div className="v-codigo">{v.codigo}</div>
        <button type="button" className="v-link" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar código'}</button>
      </div>
      {qr}
      {v.tipo === 'credito' && v.credito_total != null && (
        <p style={{ margin: 0, fontWeight: 700 }}>Saldo: R$ {reais(v.saldo_credito ?? 0)} de R$ {reais(v.credito_total)}</p>
      )}
      {v.saldos.length > 0 && (
        <ul className="v-saldos">
          {v.saldos.map((s, i) => (
            <li key={i}><span>{s.descricao}</span><span className="v-num">{s.usado} de {s.total} usados</span></li>
          ))}
        </ul>
      )}
      <p className="v-legenda" style={{ margin: 0 }}>Titular: {v.titular} · Válido até <b>{dataBR(v.validade)}</b></p>
      <p className="v-legenda" style={{ margin: 0 }}>Para usar: mostre este código ao garçom ou no caixa, com documento com foto.</p>
    </article>
  );
}

export function RodapeLegal() {
  const { t } = useVale();
  return (
    <footer className="v-rodape">
      <Logo largura={64} />
      <p style={{ margin: '0 0 4px' }}>Ditado Brasa & Bar · <i>Onde há fumaça, há fogo.</i></p>
      <p style={{ margin: 0 }}>K M POPULAR BAR LTDA · CNPJ 12.061.357/0001-69</p>
      <p style={{ margin: 0 }}>{t('endereco') ? `${t('endereco')} · ` : ''}Cuiabá-MT</p>
      <p style={{ margin: 0 }}>
        Atendimento: <a href={linkWhats(t('whatsapp'))} target="_blank" rel="noopener noreferrer">WhatsApp (65) 4141-3655</a>
        {t('email') ? ` · ${t('email')}` : ''}{t('horario') ? ` · ${t('horario')}` : ''}
      </p>
      <nav className="v-rodape-links" aria-label="Links">
        <Link to="/vale/regulamento">Regulamento</Link>
        <Link to="/vale/regulamento#privacidade">Privacidade</Link>
        <Link to="/vale/consultar">Consultar meu vale</Link>
        <a href="https://www.ditado.org/reserva">Reservar mesa</a>
      </nav>
      <p className="v-legal">Beba com moderação. Proibido para menores de 18 anos.</p>
    </footer>
  );
}

export function FaixaTeste() {
  const { vitrine } = useVale();
  if (!vitrine?.campanha.modo_teste) return null;
  return <div className="v-faixa-teste">MODO TESTE · PÁGINA AINDA NÃO DIVULGADA</div>;
}
