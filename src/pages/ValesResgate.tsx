import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Keyboard, ScanLine, CheckCircle2, AlertTriangle, XCircle, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input } from '../components/ui';

/**
 * Resgate do Vale Ditado (tablet/celular do caixa ou da hostess). Tela cheia, como a Portaria.
 * Lê o QR do vale (ou digita o código), mostra titular, validade e saldo, e dá baixa no que o cliente
 * vai consumir. Regras conferidas no banco (fn_vale_resgatar): uso único (só naquela noite), trava do
 * happy hour nos produtos com chopp, documento com foto para bebida alcoólica, baixa dupla impossível.
 */

interface Saldo { id: string; descricao: string; total: number; usado: number; tem_alcool: boolean; brinde: boolean }
interface Resgate { id: string; descricao: string; quantidade: number | null; valor: number | null; taxa: number | null; quem: string | null; quando: string; comanda: string | null; desfeito: boolean }
interface Vale {
  encontrado: boolean; id: string; codigo: string; produto: string; tipo: 'kit' | 'credito'; titular: string; validade: string;
  status: 'ativo' | 'parcial' | 'resgatado' | 'vencido' | 'estornado'; preco_pago: number;
  credito_total: number | null; saldo_credito: number | null; trava_happy_hour: boolean; happy_hour_agora: boolean; happy_hour_fim: string;
  uso_unico: boolean; aberto_em: string | null; fechado: boolean; saldos: Saldo[]; resgates: Resgate[];
}

type Leitor = (c: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => Promise<string | null>;
async function criarLeitor(): Promise<Leitor> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const formatos: string[] = await BD.getSupportedFormats?.() ?? ['qr_code'];
      if (formatos.includes('qr_code')) {
        const det = new BD({ formats: ['qr_code'] });
        return async c => ((await det.detect(c))[0]?.rawValue as string) || null;
      }
    } catch { /* usa o jsQR */ }
  }
  const url = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(/* @vite-ignore */ url);
  const jsQR = mod.default ?? mod;
  return async (c, ctx) => {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
  };
}

const reais = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const hora = (ts?: string | null) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba' }) : '');
const quando = (ts: string) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba' });

function sinal(ok: boolean) {
  try { navigator.vibrate?.(ok ? 120 : [80, 60, 80, 60, 200]); } catch { /* sem vibração */ }
}

export default function ValesResgate() {
  const { isAdmin } = useAuth();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lendo = useRef(false);
  const leitor = useRef<Leitor | null>(null);
  const [camera, setCamera] = useState<'desligada' | 'ligando' | 'ligada' | 'erro'>('desligada');
  const [erroCamera, setErroCamera] = useState('');
  const [vale, setVale] = useState<Vale | null>(null);
  const [naoAchou, setNaoAchou] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [digitado, setDigitado] = useState('');
  const [erro, setErro] = useState('');
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [valor, setValor] = useState('');
  const [creditoAlcool, setCreditoAlcool] = useState(false);
  const [documento, setDocumento] = useState(false);
  const [comanda, setComanda] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [feito, setFeito] = useState<{ linhas: string[]; taxa: number } | null>(null);

  useEffect(() => { document.title = 'Resgate · Vale Ditado'; }, []);

  const limparFormulario = () => { setQtd({}); setValor(''); setCreditoAlcool(false); setDocumento(false); setComanda(''); setErro(''); setFeito(null); };

  const abrir = useCallback(async (texto: string) => {
    const codigo = texto.trim().replace(/^.*\//, '').toUpperCase();
    if (!codigo) return;
    lendo.current = false;
    setBuscando(true); setErro(''); setNaoAchou(null);
    const { data, error } = await supabase.rpc('fn_vale_resgate_ler', { p_codigo: codigo });
    setBuscando(false);
    if (error) { setErro(error.message); return; }
    const v = data as Vale;
    if (!v?.encontrado) { setNaoAchou(codigo); sinal(false); return; }
    limparFormulario();
    setVale(v);
    sinal(true);
  }, []);

  const pararCamera = () => {
    const s = video.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
    if (video.current) video.current.srcObject = null;
    lendo.current = false;
  };
  useEffect(() => pararCamera, []);

  const ler = () => {
    const passo = async () => {
      if (!lendo.current) return;
      const v = video.current, c = canvas.current;
      if (v && c && leitor.current && v.readyState >= 2 && v.videoWidth) {
        const escala = Math.min(1, 720 / v.videoWidth);
        c.width = Math.round(v.videoWidth * escala); c.height = Math.round(v.videoHeight * escala);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const lido = await leitor.current(c, ctx).catch(() => null);
        if (lido && lendo.current) { abrir(lido); return; }
      }
      setTimeout(() => requestAnimationFrame(passo), 120);
    };
    requestAnimationFrame(passo);
  };

  const ligarCamera = async () => {
    setCamera('ligando'); setErroCamera('');
    try {
      if (!leitor.current) {
        try { leitor.current = await criarLeitor(); } catch {
          setCamera('erro'); setErroCamera('Não consegui carregar o leitor de QR (sem internet?). Digite o código.'); return;
        }
      }
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      const v = video.current!;
      v.srcObject = s; await v.play();
      setCamera('ligada');
      lendo.current = true;
      ler();
    } catch (e: unknown) {
      setCamera('erro');
      setErroCamera((e as { name?: string })?.name === 'NotAllowedError'
        ? 'A câmera foi bloqueada. Libere o acesso à câmera para este site nas configurações do navegador.'
        : 'Não consegui abrir a câmera. Digite o código.');
    }
  };

  const proximo = () => {
    setVale(null); setNaoAchou(null); limparFormulario();
    if (camera === 'ligada') { lendo.current = true; ler(); }
  };

  // o que foi escolhido
  const itensEscolhidos = vale?.saldos.filter(s => (qtd[s.id] ?? 0) > 0) ?? [];
  const temAlcool = vale?.tipo === 'credito' ? creditoAlcool : itensEscolhidos.some(s => s.tem_alcool);
  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.')) || 0;
  const bloqueado = !vale || ['resgatado', 'vencido', 'estornado'].includes(vale.status) || vale.fechado || (vale.trava_happy_hour && vale.happy_hour_agora);
  const nadaEscolhido = vale?.tipo === 'credito' ? valorNum <= 0 : itensEscolhidos.length === 0;

  async function darBaixa() {
    if (!vale || bloqueado || nadaEscolhido) return;
    if (temAlcool && !documento) { setErro('Confira o documento com foto do titular antes de baixar bebida alcoólica.'); return; }
    setBaixando(true); setErro('');
    const { data, error } = await supabase.rpc('fn_vale_resgatar', {
      p_codigo: vale.codigo,
      p_itens: vale.tipo === 'kit' ? itensEscolhidos.map(s => ({ saldo_id: s.id, quantidade: qtd[s.id] })) : null,
      p_valor: vale.tipo === 'credito' ? valorNum : null,
      p_comanda: comanda || null,
      p_documento: documento,
      p_credito_alcool: creditoAlcool,
    });
    setBaixando(false);
    if (error) { setErro(error.message); sinal(false); return; }
    const novo = data as Vale;
    const novas = novo.resgates.filter(r => !vale.resgates.some(a => a.id === r.id));
    setFeito({
      linhas: vale.tipo === 'credito' ? [`Crédito · R$ ${reais(valorNum)}`] : itensEscolhidos.map(s => `${s.descricao} × ${qtd[s.id]}`),
      taxa: novas.reduce((t, r) => t + (Number(r.taxa) || 0), 0),
    });
    setVale(novo); setQtd({}); setValor(''); setDocumento(false); setCreditoAlcool(false);
    sinal(true);
  }

  async function desfazer(id: string) {
    if (!confirm('Desfazer esta baixa? O item volta para o saldo do vale.')) return;
    const { data, error } = await supabase.rpc('fn_vale_resgate_desfazer', { p_resgate: id });
    if (error) { setErro(error.message); return; }
    setVale(data as Vale); setFeito(null);
  }

  const aviso = (() => {
    if (!vale) return null;
    if (vale.status === 'estornado') return { tom: 'perigo', icone: XCircle, texto: 'Este vale foi cancelado e o valor devolvido. Não dar baixa.' };
    if (vale.status === 'vencido') return { tom: 'perigo', icone: XCircle, texto: `Este vale venceu em ${dataBr(vale.validade)}.` };
    if (vale.fechado) return { tom: 'perigo', icone: XCircle, texto: `Vale já usado na noite de ${dataBr(vale.aberto_em)}. O que sobrou não vale mais (uso numa visita só).` };
    if (vale.status === 'resgatado') return { tom: 'perigo', icone: XCircle, texto: 'Este vale já foi todo usado.' };
    if (vale.trava_happy_hour && vale.happy_hour_agora) return { tom: 'atencao', icone: AlertTriangle, texto: `Produto com chopp não vale no happy hour. Libera às ${vale.happy_hour_fim}.` };
    if (vale.aberto_em) return { tom: 'certo', icone: CheckCircle2, texto: `Vale aberto hoje às ${hora(vale.aberto_em)}. Pode lançar o resto até o fim da noite.` };
    return { tom: 'certo', icone: CheckCircle2, texto: vale.uso_unico ? 'Vale pronto para usar. Atenção: é numa visita só. O que não for usado hoje se perde.' : 'Vale pronto para usar.' };
  })();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base, #0b0e14)', color: 'var(--text-primary, #fff)' }}>
      <header className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
        <Ticket size={20} />
        <h1 className="t-subsec m-0 flex-1">Resgate · Vale Ditado</h1>
        {isAdmin() && <Link to="/vales" className="t-body underline">Admin</Link>}
      </header>

      <main className="flex-1 flex flex-col gap-4 p-4 w-full max-w-md mx-auto">
        {!vale && (
          <>
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden" style={{ background: '#000' }}>
              <video ref={video} playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvas} className="hidden" />
              {camera === 'ligada' && (
                <div className="absolute inset-[18%] rounded-xl pointer-events-none" style={{ border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
              )}
              {camera !== 'ligada' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <Camera size={40} style={{ color: 'rgba(255,255,255,0.6)' }} />
                  {camera === 'erro' && <p className="t-body m-0" style={{ color: '#fbbf24' }}>{erroCamera}</p>}
                  <Button variante="primario" tamanho="toque" carregando={camera === 'ligando'} onClick={ligarCamera} icone={<ScanLine size={16} />}>Ler QR do vale</Button>
                </div>
              )}
              {buscando && <div className="absolute inset-0 flex items-center justify-center t-body" style={{ background: 'rgba(0,0,0,0.6)' }}>Buscando…</div>}
            </div>
            <form className="w-full flex gap-2 items-end" onSubmit={e => { e.preventDefault(); abrir(digitado); }}>
              <Input className="flex-1" rotulo="Ou digite o código" autoCapitalize="characters" value={digitado}
                onChange={e => setDigitado(e.target.value.toUpperCase())} placeholder="DIT-XXXX-XXXX" />
              <Button type="submit" variante="secundario" icone={<Keyboard size={16} />} carregando={buscando}>Buscar</Button>
            </form>
            {naoAchou && <p className="aviso aviso-perigo m-0" role="alert">Nenhum vale com o código <strong>{naoAchou}</strong>.</p>}
          </>
        )}

        {vale && (
          <>
            <section className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'var(--bg-elevated, rgba(255,255,255,0.04))', border: '1px solid var(--border, rgba(255,255,255,0.1))' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="m-0" style={{ fontSize: 22, fontWeight: 800 }}>{vale.produto}</p>
                  <p className="m-0 t-body tabular-nums" style={{ fontFamily: 'DM Mono, monospace' }}>{vale.codigo}</p>
                </div>
              </div>
              <p className="m-0 t-body">Titular: <strong>{vale.titular}</strong> · Válido até <strong>{dataBr(vale.validade)}</strong></p>
              <p className="m-0 t-body" style={{ opacity: 0.75 }}>Confira o documento com foto: o nome tem que bater com o titular.</p>
            </section>

            {aviso && (
              <p className={`aviso aviso-${aviso.tom} m-0 flex gap-2 items-start`} role="status">
                <aviso.icone size={18} className="flex-shrink-0 mt-0.5" /> <span>{aviso.texto}</span>
              </p>
            )}

            {feito && (
              <div className="aviso aviso-certo" role="status">
                <strong>Baixa feita.</strong> Lance na ZIG no botão <strong>VALE PRÉ-PAGO</strong> e feche com <strong>Voucher pré-pago</strong>:
                <ul className="mt-1 mb-1 pl-5">{feito.linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>
                {feito.taxa > 0 && <>10% de serviço desta baixa (sobre o valor pago): <strong>R$ {reais(feito.taxa)}</strong></>}
              </div>
            )}

            {!bloqueado && vale.tipo === 'kit' && (
              <section className="flex flex-col gap-2">
                <p className="t-subsec m-0">O que o cliente vai consumir agora</p>
                {vale.saldos.map(s => {
                  const resta = s.total - s.usado;
                  const q = qtd[s.id] ?? 0;
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl p-3" style={{ border: '1px solid var(--border, rgba(255,255,255,0.1))', opacity: resta ? 1 : 0.45 }}>
                      <div className="flex-1">
                        <p className="m-0 t-body" style={{ fontWeight: 700 }}>{s.descricao}{s.tem_alcool ? ' · +18' : ''}</p>
                        <p className="m-0 t-caption tabular-nums">{resta} de {s.total} disponível{resta === 1 ? '' : 'is'}</p>
                      </div>
                      {resta > 0 && (
                        <div className="flex items-center gap-1">
                          <Button variante="secundario" tamanho="toque" onClick={() => setQtd({ ...qtd, [s.id]: Math.max(0, q - 1) })} aria-label={`Menos ${s.descricao}`}>−</Button>
                          <span className="tabular-nums" style={{ minWidth: 28, textAlign: 'center', fontWeight: 800, fontSize: 20 }}>{q}</span>
                          <Button variante="secundario" tamanho="toque" disabled={q >= resta} onClick={() => setQtd({ ...qtd, [s.id]: Math.min(resta, q + 1) })} aria-label={`Mais ${s.descricao}`}>+</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button variante="discreto" onClick={() => setQtd(Object.fromEntries(vale.saldos.map(s => [s.id, s.total - s.usado])))}>Marcar tudo o que falta</Button>
              </section>
            )}

            {!bloqueado && vale.tipo === 'credito' && (
              <section className="flex flex-col gap-2">
                <p className="t-subsec m-0 tabular-nums">Saldo: R$ {reais(vale.saldo_credito)} de R$ {reais(vale.credito_total)}</p>
                <Input rotulo="Valor da conta a abater (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" />
                {valorNum > (vale.saldo_credito ?? 0) && <p className="aviso aviso-atencao m-0">Passou do saldo: abata R$ {reais(vale.saldo_credito)} e cobre a diferença na hora.</p>}
                <label className="flex items-center gap-2 t-body" style={{ minHeight: 44 }}>
                  <input type="checkbox" checked={creditoAlcool} onChange={e => setCreditoAlcool(e.target.checked)} style={{ width: 22, height: 22 }} />
                  Tem bebida alcoólica nesta conta
                </label>
                {vale.uso_unico && <p className="t-caption m-0">Uso numa visita só: o que sobrar do crédito depois desta noite se perde.</p>}
              </section>
            )}

            {!bloqueado && (
              <section className="flex flex-col gap-2">
                <label className="flex items-center gap-2 t-body rounded-xl p-3" style={{ minHeight: 52, border: `2px solid ${temAlcool && !documento ? '#f59e0b' : 'var(--border, rgba(255,255,255,0.1))'}` }}>
                  <input type="checkbox" checked={documento} onChange={e => setDocumento(e.target.checked)} style={{ width: 24, height: 24 }} />
                  <span>Conferi o documento com foto do titular{temAlcool ? ' (obrigatório: tem bebida alcoólica)' : ''}</span>
                </label>
                <Input rotulo="Mesa / comanda ZIG" value={comanda} onChange={e => setComanda(e.target.value)} placeholder="ex.: mesa 12" />
                {erro && <p className="aviso aviso-perigo m-0" role="alert">{erro}</p>}
                <Button variante="primario" tamanho="toque" carregando={baixando} disabled={nadaEscolhido} onClick={darBaixa}>Dar baixa</Button>
              </section>
            )}

            {vale.resgates.length > 0 && (
              <section className="flex flex-col gap-1">
                <p className="t-subsec m-0">Baixas deste vale</p>
                {vale.resgates.map(r => (
                  <div key={r.id} className="flex items-center gap-2 t-body py-1" style={{ opacity: r.desfeito ? 0.5 : 1, borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
                    <span className="flex-1">
                      {r.valor != null ? `Crédito R$ ${reais(r.valor)}` : `${r.descricao} × ${r.quantidade}`}
                      <span className="t-caption block">{quando(r.quando)}{r.quem ? ` · ${r.quem}` : ''}{r.comanda ? ` · ${r.comanda}` : ''}{r.desfeito ? ' · desfeita' : ''}</span>
                    </span>
                    {isAdmin() && !r.desfeito && <Button variante="discreto" tamanho="sm" onClick={() => desfazer(r.id)}>Desfazer</Button>}
                  </div>
                ))}
              </section>
            )}

            <Button variante="secundario" tamanho="toque" onClick={proximo}>Ler próximo vale</Button>
          </>
        )}
      </main>
    </div>
  );
}
