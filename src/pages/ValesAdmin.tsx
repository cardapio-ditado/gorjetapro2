import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, Plus, RefreshCw, ScanLine, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Badge, Button, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select, Textarea } from '../components/ui';
import { TEXTOS_PADRAO } from '../vale/textos';

/**
 * Admin do Vale Ditado (/vales), só gerente (admin/master): painel, pedidos (com reembolso), produtos
 * (preço, lote, itens do kit, foto) e campanha (fase, datas, regras, textos e regulamento).
 * Tudo por funções do banco (fn_vale_admin_*); o reembolso passa pela função vale/estornar (gateway).
 */

type Aba = 'painel' | 'pedidos' | 'produtos' | 'campanha' | 'acessos';
const reais = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quando = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba' }) : '');
/** timestamptz → valor do <input type="datetime-local"> no horário de Cuiabá */
const paraLocal = (iso?: string | null) => {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return p.replace(' ', 'T');
};
const deLocal = (v: string) => (v ? `${v}:00-04:00` : null);

export default function ValesAdmin() {
  const { isAdmin } = useAuth();
  const [aba, setAba] = useState<Aba>('painel');
  useEffect(() => { document.title = 'Vale Ditado · Admin'; }, []);

  if (!isAdmin()) return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Vale Ditado" subtitle="Resgate dos vales no bar" />
      <p className="aviso aviso-atencao m-0">O admin do Vale Ditado é só para gerente. Para dar baixa em um vale, use o resgate.</p>
      <Link to="/vales/resgate"><Button variante="primario" icone={<ScanLine size={16} />}>Abrir o resgate</Button></Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Vale Ditado" subtitle="Venda online de vales pré-pagos (ditado.org/vale)"
        actions={<div className="flex gap-2">
          <a href="/vale" target="_blank" rel="noopener noreferrer"><Button variante="secundario" icone={<ExternalLink size={16} />}>Ver a página</Button></a>
          <Link to="/vales/resgate"><Button variante="primario" icone={<ScanLine size={16} />}>Resgate</Button></Link>
        </div>} />
      <Segmented rotulo="Seção" valor={aba} onMudar={setAba} opcoes={[
        { valor: 'painel', rotulo: 'Painel' }, { valor: 'pedidos', rotulo: 'Pedidos' },
        { valor: 'produtos', rotulo: 'Produtos' }, { valor: 'campanha', rotulo: 'Campanha' }, { valor: 'acessos', rotulo: 'Acessos' },
      ]} />
      {aba === 'painel' && <Painel />}
      {aba === 'pedidos' && <Pedidos />}
      {aba === 'produtos' && <Produtos />}
      {aba === 'campanha' && <Campanha />}
      {aba === 'acessos' && <Acessos />}
    </div>
  );
}

// ───────────────────────── Painel ─────────────────────────

interface PainelDados {
  pedidos_pagos: number; receita: number; estornado: number; pendentes: number; pago_sem_lote: number; vales: number;
  por_produto: { nome: string; vendidos: number; reservados: number; lote: number; receita: number }[];
  resgate: { pct_resgatado: number | null; passivo: number };
  compradores: { total: number; novos: number; sumidos_60: number; ativos: number };
  por_dia: { dia: string; pedidos: number; receita: number }[];
  por_origem: { origem: string; pedidos: number; receita: number }[];
}

function Painel() {
  const [d, setD] = useState<PainelDados | null>(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_vale_admin_painel');
    if (error) setErro(error.message); else setD(data as PainelDados);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  if (erro) return <p className="aviso aviso-perigo">{erro}</p>;
  if (!d) return <p className="t-body">Carregando…</p>;
  const c = d.compradores;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Button variante="discreto" icone={<RefreshCw size={14} />} onClick={carregar}>Atualizar</Button></div>
      {d.pago_sem_lote > 0 && <p className="aviso aviso-perigo m-0"><strong>{d.pago_sem_lote} pedido(s) pagos depois que o lote acabou.</strong> Reembolse em Pedidos (filtro "Pago sem lote").</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard rotulo="Receita" valor={`R$ ${reais(d.receita)}`} detalhe={`${d.pedidos_pagos} pedidos pagos`} tom="destaque" />
        <KPICard rotulo="Vales emitidos" valor={d.vales} detalhe={`${d.pendentes} pedido(s) aguardando Pix`} />
        <KPICard rotulo="A entregar (passivo)" valor={`R$ ${reais(d.resgate.passivo)}`} detalhe={d.resgate.pct_resgatado != null ? `${d.resgate.pct_resgatado}% dos vales em aberto já consumido` : 'Nenhum vale em aberto'} tom="atencao" />
        <KPICard rotulo="Estornado" valor={`R$ ${reais(d.estornado)}`} />
      </div>
      <SectionCard title="Compradores" descricao="Cruzando o CPF com a fidelidade (última visita antes da compra)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 t-body">
          <div><strong className="t-section">{c.total}</strong><br />compradores</div>
          <div><strong className="t-section">{c.sumidos_60}</strong><br />sumidos há 60+ dias {c.total ? `(${Math.round((100 * c.sumidos_60) / c.total)}%)` : ''}</div>
          <div><strong className="t-section">{c.ativos}</strong><br />vinham ao bar</div>
          <div><strong className="t-section">{c.novos}</strong><br />novos (fora da fidelidade)</div>
        </div>
      </SectionCard>
      <SectionCard title="Por produto" noPadding>
        <table className="w-full t-body">
          <thead><tr className="text-left"><th className="p-2">Produto</th><th className="p-2 text-right">Vendidos</th><th className="p-2 text-right">Reservados</th><th className="p-2 text-right">Lote</th><th className="p-2 text-right">Receita</th></tr></thead>
          <tbody>{d.por_produto.map(p => (
            <tr key={p.nome} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="p-2">{p.nome}</td><td className="p-2 text-right tabular-nums">{p.vendidos}</td><td className="p-2 text-right tabular-nums">{p.reservados}</td>
              <td className="p-2 text-right tabular-nums">{p.lote - p.vendidos - p.reservados} / {p.lote}</td><td className="p-2 text-right tabular-nums">R$ {reais(p.receita)}</td>
            </tr>))}</tbody>
        </table>
      </SectionCard>
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Por dia">
          {d.por_dia.length === 0 ? <p className="t-body m-0">Sem vendas ainda.</p> : d.por_dia.map(x => (
            <div key={x.dia} className="flex justify-between t-body py-1"><span>{x.dia.split('-').reverse().join('/')}</span><span className="tabular-nums">{x.pedidos} · R$ {reais(x.receita)}</span></div>))}
        </SectionCard>
        <SectionCard title="Por origem (utm / seg)">
          {d.por_origem.length === 0 ? <p className="t-body m-0">Sem vendas ainda.</p> : d.por_origem.map(x => (
            <div key={x.origem} className="flex justify-between t-body py-1"><span>{x.origem}</span><span className="tabular-nums">{x.pedidos} · R$ {reais(x.receita)}</span></div>))}
        </SectionCard>
      </div>
    </div>
  );
}

// ───────────────────────── Acessos (links da bio e /vale) ─────────────────────────

interface AcessosDados {
  links_pessoas: number; links_cliques: { alvo: string; cliques: number; pessoas: number }[];
  vale_pessoas: number; vale_checkout: number; vale_pix: number; pedidos_pagos: number;
  vale_origem: { origem: string; pessoas: number }[];
  por_dia: { dia: string; links: number; clique_vale: number; vale: number; checkout: number }[];
  celular_pct: number | null;
}

const NOME_BOTAO: Record<string, string> = {
  vale: 'Vale Ditado', reservar: 'Reservar mesa', cardapio: 'Cardápio', whatsapp: 'WhatsApp',
  'como-chegar': 'Como chegar', instagram: 'Instagram', site: 'Site', votacao: 'Vote no Ditado',
};

/** Contador das páginas públicas: quantas pessoas abriram os links da bio e o /vale, e até onde foram. */
function Acessos() {
  const [dias, setDias] = useState<'1' | '7' | '0'>('7');
  const [d, setD] = useState<AcessosDados | null>(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    setD(null);
    const { data, error } = await supabase.rpc('fn_site_acessos', { p_dias: Number(dias) });
    if (error) setErro(error.message); else { setErro(''); setD(data as AcessosDados); }
  }, [dias]);
  useEffect(() => { carregar(); }, [carregar]);
  const pct = (a: number, b: number) => (b > 0 ? ` (${Math.round((100 * a) / b)}%)` : '');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented rotulo="Período" valor={dias} onMudar={setDias} opcoes={[
          { valor: '1', rotulo: 'Hoje' }, { valor: '7', rotulo: '7 dias' }, { valor: '0', rotulo: 'Tudo' },
        ]} />
        <Button variante="discreto" icone={<RefreshCw size={14} />} onClick={carregar}>Atualizar</Button>
      </div>
      {erro && <p className="aviso aviso-perigo m-0">{erro}</p>}
      {!d && !erro && <p className="t-body">Carregando…</p>}
      {d && <>
        <p className="t-caption m-0">Conta pessoas (cada aba do navegador uma vez a cada 30 minutos), sem guardar dado pessoal. Começou em 25/11/2026.</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard rotulo="Abriram os links da bio" valor={d.links_pessoas} />
          <KPICard rotulo="Clicaram em Vale Ditado" valor={d.links_cliques.find(x => x.alvo === 'vale')?.pessoas ?? 0}
            detalhe={pct(d.links_cliques.find(x => x.alvo === 'vale')?.pessoas ?? 0, d.links_pessoas).trim() || undefined} />
          <KPICard rotulo="Abriram o /vale" valor={d.vale_pessoas} detalhe={d.celular_pct != null ? `${d.celular_pct}% no celular` : undefined} tom="destaque" />
          <KPICard rotulo="Foram ao pagamento" valor={d.vale_checkout} detalhe={`${d.vale_pix} geraram o Pix${pct(d.vale_checkout, d.vale_pessoas)}`} />
          <KPICard rotulo="Pedidos pagos" valor={d.pedidos_pagos} detalhe={d.vale_pessoas > 0 ? `${Math.round((100 * d.pedidos_pagos) / d.vale_pessoas)}% de quem abriu o /vale` : undefined} />
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <SectionCard title="Cliques nos links da bio">
            {d.links_cliques.length === 0 ? <p className="t-body m-0">Nenhum clique ainda.</p> : d.links_cliques.map(x => (
              <div key={x.alvo} className="flex justify-between t-body py-1">
                <span>{NOME_BOTAO[x.alvo] ?? x.alvo}</span><span className="tabular-nums">{x.pessoas} {x.pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
              </div>))}
          </SectionCard>
          <SectionCard title="De onde veio quem abriu o /vale">
            {d.vale_origem.length === 0 ? <p className="t-body m-0">Ninguém ainda.</p> : d.vale_origem.map(x => (
              <div key={x.origem} className="flex justify-between t-body py-1"><span>{x.origem}</span><span className="tabular-nums">{x.pessoas}</span></div>))}
          </SectionCard>
        </div>
        <SectionCard title="Por dia" noPadding>
          <table className="w-full t-body">
            <thead><tr className="text-left"><th className="p-2">Dia</th><th className="p-2 text-right">Links da bio</th><th className="p-2 text-right">Clicou no Vale</th><th className="p-2 text-right">Abriu o /vale</th><th className="p-2 text-right">Foi ao pagamento</th></tr></thead>
            <tbody>{d.por_dia.length === 0
              ? <tr><td className="p-2" colSpan={5}>Sem acessos no período.</td></tr>
              : d.por_dia.map(x => (
                <tr key={x.dia} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="p-2">{x.dia.split('-').reverse().join('/')}</td>
                  <td className="p-2 text-right tabular-nums">{x.links}</td><td className="p-2 text-right tabular-nums">{x.clique_vale}</td>
                  <td className="p-2 text-right tabular-nums">{x.vale}</td><td className="p-2 text-right tabular-nums">{x.checkout}</td>
                </tr>))}</tbody>
          </table>
        </SectionCard>
      </>}
    </div>
  );
}

// ───────────────────────── Pedidos ─────────────────────────

interface Pedido {
  id: string; token: string; nome: string; cpf: string; telefone: string; email: string | null; presente: boolean; presente_nome: string | null;
  status: string; forma: string; valor_total: number; valor_cheio: number; pago_em: string | null; criado_em: string; aceita_whatsapp: boolean;
  origem: Record<string, string>; itens: { produto: string; quantidade: number; preco: number }[] | null;
  vales: { id: string; codigo: string; produto: string; status: string; validade: string; usado: boolean }[] | null;
  estornos: { valor: number; status: string; quando: string; quem: string }[] | null;
}

const STATUS_PEDIDO: Record<string, { rotulo: string; v: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  pago: { rotulo: 'Pago', v: 'success' }, pendente: { rotulo: 'Aguardando Pix', v: 'warning' }, expirado: { rotulo: 'Expirado', v: 'neutral' },
  cancelado: { rotulo: 'Cancelado', v: 'neutral' }, estornado: { rotulo: 'Estornado', v: 'info' }, pago_sem_lote: { rotulo: 'Pago sem lote', v: 'danger' },
};

function Pedidos() {
  const [lista, setLista] = useState<Pedido[]>([]);
  const [status, setStatus] = useState('pago');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [estornar, setEstornar] = useState<Pedido | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.rpc('fn_vale_admin_pedidos', { p_status: status || null, p_busca: busca || null, p_limite: 500 });
    setCarregando(false);
    if (error) setErro(error.message); else { setErro(''); setLista((data as Pedido[]) ?? []); }
  }, [status, busca]);
  useEffect(() => { carregar(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const csv = () => {
    const linhas = [['data', 'nome', 'telefone', 'email', 'whatsapp_ok', 'itens', 'valor', 'status', 'origem', 'codigos']];
    for (const p of lista) linhas.push([
      quando(p.pago_em ?? p.criado_em), p.nome, p.telefone, p.email ?? '', p.aceita_whatsapp ? 'sim' : 'não',
      (p.itens ?? []).map(i => `${i.quantidade}x ${i.produto}`).join(' + '), reais(p.valor_total), STATUS_PEDIDO[p.status]?.rotulo ?? p.status,
      p.origem?.utm_source ?? p.origem?.seg ?? '', (p.vales ?? []).map(v => v.codigo).join(' '),
    ]);
    const texto = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
    a.download = `vale-ditado-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-end">
        <Select rotulo="Situação" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(STATUS_PEDIDO).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}
        </Select>
        <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); carregar(); }}>
          <Input rotulo="Buscar (nome, telefone, CPF ou código)" value={busca} onChange={e => setBusca(e.target.value)} />
          <Button type="submit" variante="secundario" carregando={carregando}>Buscar</Button>
        </form>
        <Button variante="discreto" icone={<Download size={14} />} onClick={csv} disabled={!lista.length}>CSV (sem CPF)</Button>
      </div>
      {erro && <p className="aviso aviso-perigo m-0">{erro}</p>}
      <p className="t-caption m-0">{lista.length} pedido(s) · R$ {reais(lista.reduce((t, p) => t + Number(p.valor_total), 0))}</p>
      {lista.map(p => (
        <div key={p.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <button type="button" className="flex flex-wrap gap-x-3 gap-y-1 items-center text-left w-full" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
            <Badge variant={STATUS_PEDIDO[p.status]?.v ?? 'neutral'}>{STATUS_PEDIDO[p.status]?.rotulo ?? p.status}</Badge>
            <strong className="t-body">{p.nome}</strong>
            <span className="t-caption">{p.cpf} · {p.telefone}</span>
            <span className="t-body flex-1">{(p.itens ?? []).map(i => `${i.quantidade}x ${i.produto}`).join(' + ')}</span>
            <strong className="tabular-nums">R$ {reais(p.valor_total)}</strong>
            <span className="t-caption">{quando(p.pago_em ?? p.criado_em)}</span>
          </button>
          {aberto === p.id && (
            <div className="flex flex-col gap-2 t-body">
              {p.presente && <span>Presente para <strong>{p.presente_nome}</strong></span>}
              <span>{p.forma === 'pix' ? 'Pix' : 'Cartão'} · e-mail: {p.email ?? '—'} · WhatsApp ofertas: {p.aceita_whatsapp ? 'sim' : 'não'}{p.origem?.utm_source ? ` · origem: ${p.origem.utm_source}` : ''}</span>
              {(p.vales ?? []).map(v => (
                <span key={v.id} className="tabular-nums">{v.codigo} · {v.produto} · {v.status}{v.usado ? ' (com baixa)' : ''} · até {v.validade.split('-').reverse().join('/')}</span>
              ))}
              {(p.estornos ?? []).map((e, i) => <span key={i}>Estorno R$ {reais(e.valor)} · {e.status} · {quando(e.quando)} · {e.quem}</span>)}
              <div className="flex gap-2 flex-wrap">
                <a href={`/vale/c/${p.token}`} target="_blank" rel="noopener noreferrer"><Button variante="secundario" tamanho="sm" icone={<ExternalLink size={14} />}>Comprovante do cliente</Button></a>
                {['pago', 'pago_sem_lote'].includes(p.status) && <Button variante="perigo" tamanho="sm" onClick={() => setEstornar(p)}>Reembolsar</Button>}
              </div>
            </div>
          )}
        </div>
      ))}
      {estornar && <ModalEstorno pedido={estornar} fechar={() => setEstornar(null)} feito={() => { setEstornar(null); carregar(); }} />}
    </div>
  );
}

function ModalEstorno({ pedido, fechar, feito }: { pedido: Pedido; fechar: () => void; feito: () => void }) {
  const [motivo, setMotivo] = useState('Arrependimento (7 dias)');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const confirmar = async () => {
    setEnviando(true); setErro('');
    const { data, error } = await supabase.functions.invoke('vale/estornar', { body: { pedido_id: pedido.id, motivo } });
    setEnviando(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    if (error || !r?.ok) {
      let msg = r?.erro ?? error?.message ?? 'Não foi possível estornar.';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { const corpo = await (error as any)?.context?.json?.(); if (corpo?.erro) msg = corpo.erro; } catch { /* sem corpo */ }
      setErro(msg); return;
    }
    alert(`Estorno de R$ ${reais(r.valor)} feito no gateway. Os vales foram cancelados.`);
    feito();
  };
  return (
    <Modal aberto onFechar={fechar} titulo="Reembolsar pedido" travado={enviando}
      descricao={`${pedido.nome} · R$ ${reais(pedido.valor_total)}`}
      rodape={<><Button variante="secundario" onClick={fechar} disabled={enviando}>Voltar</Button><Button variante="perigo" carregando={enviando} onClick={confirmar}>Reembolsar</Button></>}>
      <div className="flex flex-col gap-3 t-body">
        <p className="m-0">Vale sem uso devolve o valor integral. Vale já aberto (uso numa visita só) não tem sobra para devolver. O dinheiro volta pelo mesmo meio de pagamento, e os vales são cancelados.</p>
        <Input rotulo="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
        {erro && <p className="aviso aviso-perigo m-0">{erro}</p>}
      </div>
    </Modal>
  );
}

// ───────────────────────── Produtos ─────────────────────────

interface Item { id?: string; descricao: string; quantidade: number; tem_alcool: boolean; valor_cardapio: number | null; ordem: number }
interface ProdutoAdm {
  id?: string; slug: string; nome: string; composicao_texto: string; selo_tematico: string | null; preco_de: number; preco_por: number;
  tipo: 'kit' | 'credito'; credito_valor: number | null; tem_alcool: boolean; trava_happy_hour: boolean; lote_total: number;
  lote_vendido?: number; lote_reservado?: number; limite_por_cpf: number; foto_url: string | null; ordem: number;
  categoria: string; destaque_black: number | null; destaque_natal: number | null; ativo: boolean; itens: Item[];
}

/** Foto → WebP 600 px (rápido no 4G) e envio para o bucket vale-fotos. */
async function enviarFoto(arquivo: File, nome: string): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((ok, falha) => c.toBlob(b => (b ? ok(b) : falha(new Error('imagem inválida'))), 'image/webp', 0.82));
  const caminho = `${nome}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from('vale-fotos').upload(caminho, blob, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
  return supabase.storage.from('vale-fotos').getPublicUrl(caminho).data.publicUrl;
}

function Produtos() {
  const [lista, setLista] = useState<ProdutoAdm[]>([]);
  const [editando, setEditando] = useState<ProdutoAdm | null>(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_vale_admin_dados');
    if (error) setErro(error.message); else setLista(((data as { produtos: ProdutoAdm[] }).produtos) ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const novo: ProdutoAdm = { slug: '', nome: '', composicao_texto: '', selo_tematico: null, preco_de: 0, preco_por: 0, tipo: 'kit', credito_valor: null,
    tem_alcool: false, trava_happy_hour: false, lote_total: 0, limite_por_cpf: 2, foto_url: null, ordem: 99, categoria: 'kits',
    destaque_black: null, destaque_natal: null, ativo: true, itens: [] };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <p className="t-caption m-0">Mudar itens de um kit vale só para os vales vendidos depois; os já vendidos guardam o próprio saldo.</p>
        <Button variante="primario" icone={<Plus size={16} />} onClick={() => setEditando(novo)}>Novo produto</Button>
      </div>
      {erro && <p className="aviso aviso-perigo m-0">{erro}</p>}
      {lista.map(p => (
        <button key={p.id} type="button" onClick={() => setEditando(p)} className="rounded-xl p-3 flex gap-3 items-center text-left w-full"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', opacity: p.ativo ? 1 : 0.5 }}>
          {p.foto_url ? <img src={p.foto_url} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg flex items-center justify-center t-caption" style={{ background: 'var(--bg-base)' }}>sem foto</div>}
          <div className="flex-1">
            <strong className="t-body">{p.nome}</strong>{!p.ativo && <Badge variant="neutral" className="ml-2">fora da venda</Badge>}
            <div className="t-caption">de R$ {reais(p.preco_de)} por R$ {reais(p.preco_por)} · lote {(p.lote_total - (p.lote_vendido ?? 0) - (p.lote_reservado ?? 0))}/{p.lote_total} · até {p.limite_por_cpf} por CPF{p.trava_happy_hour ? ' · trava happy hour' : ''}</div>
          </div>
        </button>
      ))}
      {editando && <ModalProduto p={editando} fechar={() => setEditando(null)} salvo={() => { setEditando(null); carregar(); }} />}
    </div>
  );
}

function ModalProduto({ p: inicial, fechar, salvo }: { p: ProdutoAdm; fechar: () => void; salvo: () => void }) {
  const [p, setP] = useState<ProdutoAdm>({ ...inicial, itens: inicial.itens.map(i => ({ ...i })) });
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erro, setErro] = useState('');
  const set = <K extends keyof ProdutoAdm>(k: K, v: ProdutoAdm[K]) => setP(x => ({ ...x, [k]: v }));
  const setItem = (i: number, campo: keyof Item, v: unknown) => setP(x => ({ ...x, itens: x.itens.map((it, j) => (j === i ? { ...it, [campo]: v } : it)) }));
  const num = (s: string) => (s === '' ? 0 : Number(s.replace(',', '.')));

  const foto = async (f?: File) => {
    if (!f) return;
    setEnviandoFoto(true); setErro('');
    try { set('foto_url', await enviarFoto(f, p.slug || 'produto')); } catch (e) { setErro(`Foto: ${(e as Error).message}`); }
    setEnviandoFoto(false);
  };

  const salvar = async () => {
    if (!p.nome || !/^[a-z0-9-]+$/.test(p.slug)) { setErro('Preencha o nome e o slug (só letras minúsculas, números e hífen).'); return; }
    if (p.preco_por <= 0 || p.preco_de <= 0) { setErro('Preencha os preços.'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.rpc('fn_vale_admin_produto_salvar', { p: {
      ...p, destaque_black: p.destaque_black ?? '', destaque_natal: p.destaque_natal ?? '', credito_valor: p.credito_valor ?? '',
      itens: p.tipo === 'kit' ? p.itens.map((it, i) => ({ ...it, ordem: i + 1, valor_cardapio: it.valor_cardapio ?? '' })) : [],
    } });
    setSalvando(false);
    if (error) setErro(error.message); else salvo();
  };

  return (
    <Modal aberto onFechar={fechar} titulo={inicial.id ? `Editar ${inicial.nome}` : 'Novo produto'} largura="lg" travado={salvando}
      rodape={<><Button variante="secundario" onClick={fechar}>Cancelar</Button><Button variante="primario" carregando={salvando} onClick={salvar}>Salvar</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input rotulo="Nome" value={p.nome} onChange={e => set('nome', e.target.value)} />
        <Input rotulo="Slug (link)" value={p.slug} onChange={e => set('slug', e.target.value.toLowerCase())} disabled={!!inicial.id} />
        <div className="col-span-2"><Textarea rotulo="Composição (texto do card)" rows={2} value={p.composicao_texto} onChange={e => set('composicao_texto', e.target.value)} /></div>
        <Input rotulo="Selo temático" value={p.selo_tematico ?? ''} onChange={e => set('selo_tematico', e.target.value || null)} />
        <Select rotulo="Categoria" value={p.categoria} onChange={e => set('categoria', e.target.value)}>
          <option value="chopp">Chopp</option><option value="kits">Petisco + chopp</option><option value="drinks">Drinks</option>
          <option value="familia">Família</option><option value="credito">Crédito</option>
        </Select>
        <Input rotulo="Preço de (cardápio)" inputMode="decimal" value={String(p.preco_de)} onChange={e => set('preco_de', num(e.target.value))} />
        <Input rotulo="Preço por (vale)" inputMode="decimal" value={String(p.preco_por)} onChange={e => set('preco_por', num(e.target.value))} />
        <Select rotulo="Tipo" value={p.tipo} onChange={e => set('tipo', e.target.value as 'kit' | 'credito')}>
          <option value="kit">Kit (itens com quantidade)</option><option value="credito">Crédito em R$</option>
        </Select>
        {p.tipo === 'credito' && <Input rotulo="Crédito (R$ que consome)" inputMode="decimal" value={String(p.credito_valor ?? '')} onChange={e => set('credito_valor', num(e.target.value))} />}
        <Input rotulo="Lote total" inputMode="numeric" value={String(p.lote_total)} onChange={e => set('lote_total', Math.max(0, parseInt(e.target.value || '0', 10)))}
          dica={inicial.id ? `${inicial.lote_vendido ?? 0} vendidos e ${inicial.lote_reservado ?? 0} reservados: não pode ficar abaixo disso` : undefined} />
        <Input rotulo="Limite por CPF" inputMode="numeric" value={String(p.limite_por_cpf)} onChange={e => set('limite_por_cpf', Math.max(1, parseInt(e.target.value || '1', 10)))} />
        <Input rotulo="Ordem na página" inputMode="numeric" value={String(p.ordem)} onChange={e => set('ordem', parseInt(e.target.value || '0', 10))} />
        <div className="flex gap-2">
          <Select rotulo="Destaque Black" value={String(p.destaque_black ?? '')} onChange={e => set('destaque_black', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option><option value="1">1º</option><option value="2">2º</option><option value="3">3º</option>
          </Select>
          <Select rotulo="Destaque Natal" value={String(p.destaque_natal ?? '')} onChange={e => set('destaque_natal', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option><option value="1">1º</option><option value="2">2º</option><option value="3">3º</option>
          </Select>
        </div>
        <div className="col-span-2 flex flex-wrap gap-4 t-body">
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.tem_alcool} onChange={e => set('tem_alcool', e.target.checked)} /> Tem bebida alcoólica (menor não compra)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.trava_happy_hour} onChange={e => set('trava_happy_hour', e.target.checked)} /> Não vale no happy hour</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.ativo} onChange={e => set('ativo', e.target.checked)} /> À venda</label>
        </div>
        <div className="col-span-2 flex items-center gap-3">
          {p.foto_url && <img src={p.foto_url} alt="" className="w-20 h-20 rounded-lg object-cover" />}
          <label className="inline-flex">
            <input type="file" accept="image/*" className="hidden" onChange={e => foto(e.target.files?.[0])} />
            <span className="btn btn-secundario inline-flex items-center gap-2 cursor-pointer t-body rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
              <Upload size={14} /> {enviandoFoto ? 'Enviando…' : p.foto_url ? 'Trocar foto' : 'Enviar foto real'}
            </span>
          </label>
          {p.foto_url && <Button variante="discreto" tamanho="sm" onClick={() => set('foto_url', null)}>Tirar foto</Button>}
          <span className="t-caption">Só foto real do prato (nunca gerada por IA).</span>
        </div>
        {p.tipo === 'kit' && (
          <div className="col-span-2 flex flex-col gap-2">
            <p className="t-subsec m-0">Itens do kit</p>
            {p.itens.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5"><Input rotulo={i === 0 ? 'Item' : undefined} value={it.descricao} onChange={e => setItem(i, 'descricao', e.target.value)} /></div>
                <div className="col-span-2"><Input rotulo={i === 0 ? 'Qtd' : undefined} inputMode="numeric" value={String(it.quantidade)} onChange={e => setItem(i, 'quantidade', Math.max(1, parseInt(e.target.value || '1', 10)))} /></div>
                <div className="col-span-2"><Input rotulo={i === 0 ? 'R$ cardápio' : undefined} inputMode="decimal" value={String(it.valor_cardapio ?? '')} onChange={e => setItem(i, 'valor_cardapio', e.target.value === '' ? null : num(e.target.value))} /></div>
                <label className="col-span-2 flex items-center gap-1 t-caption pb-2"><input type="checkbox" checked={it.tem_alcool} onChange={e => setItem(i, 'tem_alcool', e.target.checked)} /> álcool</label>
                <div className="col-span-1 pb-1"><Button variante="discreto" tamanho="sm" onClick={() => setP(x => ({ ...x, itens: x.itens.filter((_, j) => j !== i) }))}>✕</Button></div>
              </div>
            ))}
            <Button variante="discreto" icone={<Plus size={14} />} onClick={() => setP(x => ({ ...x, itens: [...x.itens, { descricao: '', quantidade: 1, tem_alcool: false, valor_cardapio: null, ordem: x.itens.length + 1 }] }))}>Adicionar item</Button>
            <p className="t-caption m-0">O "R$ cardápio" de cada item é a base dos 10% sugeridos no resgate.</p>
          </div>
        )}
        {erro && <p className="col-span-2 aviso aviso-perigo m-0">{erro}</p>}
      </div>
    </Modal>
  );
}

// ───────────────────────── Campanha ─────────────────────────

interface CampanhaAdm {
  fase: 'black' | 'natal'; ativo: boolean; modo_teste: boolean; venda_inicio: string; venda_fim: string; validade_meses: number;
  happy_hour_inicio: string; happy_hour_fim: string; happy_hour_dias: number[]; brinde_descricao: string | null; brinde_ate: string | null;
  brinde_valor_cardapio: number | null; mostrar_contador: boolean; contador_fim: string | null; mostrar_vendidos_a_partir: number;
  hero_foto_url: string | null; textos: Record<string, string>; regulamento_md: string | null; uso_unico: boolean; fim_noite: string;
}

const ROTULOS_TEXTOS: Partial<Record<keyof typeof TEXTOS_PADRAO, string>> = {
  endereco: 'Endereço completo (rodapé) [CONFIRMAR]', email: 'E-mail de atendimento [CONFIRMAR]', horario: 'Dias e horário de atendimento [CONFIRMAR]',
  hora_abertura: 'Hora da abertura (ex.: 00h)', recebedor_nome: 'Nome do recebedor do Pix', gateway_nome: 'Nome do gateway (texto de segurança)',
  faq_nota: 'Resposta "E a nota fiscal?"', natal_faixa_topo: 'Faixa do Natal (adendo 2)', whatsapp: 'WhatsApp do bar (só números, com 55)',
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function Campanha() {
  const [c, setC] = useState<CampanhaAdm | null>(null);
  const [situacao, setSituacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'certo' | 'perigo'; texto: string } | null>(null);
  const [mostrarTextos, setMostrarTextos] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_vale_admin_dados');
    if (error) { setMsg({ tom: 'perigo', texto: error.message }); return; }
    const d = data as { campanha: CampanhaAdm; situacao: string };
    setC({ ...d.campanha, happy_hour_inicio: d.campanha.happy_hour_inicio.slice(0, 5), happy_hour_fim: d.campanha.happy_hour_fim.slice(0, 5), fim_noite: (d.campanha.fim_noite ?? '06:00').slice(0, 5) });
    setSituacao(d.situacao);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const chaves = useMemo(() => Object.keys(TEXTOS_PADRAO) as (keyof typeof TEXTOS_PADRAO)[], []);
  if (!c) return msg ? <p className="aviso aviso-perigo">{msg.texto}</p> : <p className="t-body">Carregando…</p>;
  const set = <K extends keyof CampanhaAdm>(k: K, v: CampanhaAdm[K]) => setC(x => (x ? { ...x, [k]: v } : x));

  const salvar = async () => {
    setSalvando(true); setMsg(null);
    const textos = Object.fromEntries(Object.entries(c.textos).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));
    const { error } = await supabase.rpc('fn_vale_admin_campanha_salvar', { p: {
      ...c, textos, brinde_ate: c.brinde_ate, contador_fim: c.contador_fim,
      brinde_valor_cardapio: c.brinde_valor_cardapio ?? null, regulamento_md: c.regulamento_md?.trim() ? c.regulamento_md : null,
    } });
    setSalvando(false);
    if (error) setMsg({ tom: 'perigo', texto: error.message });
    else { setMsg({ tom: 'certo', texto: 'Salvo. A página já mostra a mudança (sem publicar nada).' }); carregar(); }
  };

  const heroFoto = async (f?: File) => {
    if (!f) return;
    try { set('hero_foto_url', await enviarFoto(f, 'hero')); } catch (e) { setMsg({ tom: 'perigo', texto: `Foto: ${(e as Error).message}` }); }
  };

  const SITUACAO: Record<string, string> = { aberta: 'Venda aberta', antes: 'Ainda não abriu', encerrada: 'Encerrada', fechada: 'Fechada (desligada)' };

  return (
    <div className="flex flex-col gap-4">
      <p className={`aviso ${c.modo_teste ? 'aviso-atencao' : 'aviso-certo'} m-0`}>
        Situação agora: <strong>{SITUACAO[situacao] ?? situacao}</strong>{c.modo_teste ? ' · MODO TESTE ligado (aceita compra fora das datas e mostra a faixa de teste)' : ''}
      </p>
      <SectionCard title="Venda">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Select rotulo="Fase" value={c.fase} onChange={e => set('fase', e.target.value as 'black' | 'natal')}>
            <option value="black">Black Brasa</option><option value="natal">Vale de Natal</option>
          </Select>
          <label className="flex items-center gap-2 t-body pt-6"><input type="checkbox" checked={c.ativo} onChange={e => set('ativo', e.target.checked)} /> Venda ligada</label>
          <label className="flex items-center gap-2 t-body pt-6"><input type="checkbox" checked={c.modo_teste} onChange={e => set('modo_teste', e.target.checked)} /> Modo teste</label>
          <Input rotulo="Validade (meses)" inputMode="numeric" value={String(c.validade_meses)} onChange={e => set('validade_meses', Math.max(1, parseInt(e.target.value || '1', 10)))} />
          <Input type="datetime-local" rotulo="Início da venda (Cuiabá)" value={paraLocal(c.venda_inicio)} onChange={e => set('venda_inicio', deLocal(e.target.value) ?? c.venda_inicio)} />
          <Input type="datetime-local" rotulo="Fim da venda (Cuiabá)" value={paraLocal(c.venda_fim)} onChange={e => set('venda_fim', deLocal(e.target.value) ?? c.venda_fim)} />
          <Input type="datetime-local" rotulo="Fim do contador" value={paraLocal(c.contador_fim)} onChange={e => set('contador_fim', deLocal(e.target.value))} />
          <label className="flex items-center gap-2 t-body pt-6"><input type="checkbox" checked={c.mostrar_contador} onChange={e => set('mostrar_contador', e.target.checked)} /> Mostrar contador</label>
          <Input rotulo='Mostrar "N vales vendidos" a partir de' inputMode="numeric" value={String(c.mostrar_vendidos_a_partir)} onChange={e => set('mostrar_vendidos_a_partir', parseInt(e.target.value || '0', 10))} />
        </div>
      </SectionCard>
      <SectionCard title="Regras de uso">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex items-center gap-2 t-body pt-6"><input type="checkbox" checked={c.uso_unico} onChange={e => set('uso_unico', e.target.checked)} /> Uso numa visita só</label>
          <Input type="time" rotulo="A noite fecha às" value={c.fim_noite} onChange={e => set('fim_noite', e.target.value)} />
          <Input type="time" rotulo="Happy hour: de" value={c.happy_hour_inicio} onChange={e => set('happy_hour_inicio', e.target.value)} />
          <Input type="time" rotulo="Happy hour: até" value={c.happy_hour_fim} onChange={e => set('happy_hour_fim', e.target.value)} />
          <div className="col-span-2 lg:col-span-4 flex flex-wrap gap-3 t-body">
            <span>Dias de happy hour:</span>
            {DIAS.map((d, i) => (
              <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={c.happy_hour_dias.includes(i)}
                onChange={e => set('happy_hour_dias', e.target.checked ? [...c.happy_hour_dias, i].sort() : c.happy_hour_dias.filter(x => x !== i))} /> {d}</label>
            ))}
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Brinde da Black">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Input rotulo="Brinde (vazio = sem brinde)" value={c.brinde_descricao ?? ''} onChange={e => set('brinde_descricao', e.target.value || null)} />
          <Input type="datetime-local" rotulo="Pago até (Cuiabá)" value={paraLocal(c.brinde_ate)} onChange={e => set('brinde_ate', deLocal(e.target.value))} />
          <Input rotulo="R$ de cardápio do brinde" inputMode="decimal" value={String(c.brinde_valor_cardapio ?? '')} onChange={e => set('brinde_valor_cardapio', e.target.value ? Number(e.target.value.replace(',', '.')) : null)} />
        </div>
      </SectionCard>
      <SectionCard title="Foto do topo" descricao="Foto real (chopp e brasa). Sem foto, o topo fica só com a cor.">
        <div className="flex items-center gap-3">
          {c.hero_foto_url && <img src={c.hero_foto_url} alt="" className="h-20 rounded-lg" />}
          <label className="inline-flex cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={e => heroFoto(e.target.files?.[0])} />
            <span className="inline-flex items-center gap-2 t-body rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}><Upload size={14} /> {c.hero_foto_url ? 'Trocar foto' : 'Enviar foto'}</span>
          </label>
          {c.hero_foto_url && <Button variante="discreto" tamanho="sm" onClick={() => set('hero_foto_url', null)}>Tirar</Button>}
        </div>
      </SectionCard>
      <SectionCard title="Textos e dados pendentes" descricao="Vazio = usa o texto da copy. Os [CONFIRMAR] vazios não aparecem na página."
        action={<Button variante="discreto" onClick={() => setMostrarTextos(!mostrarTextos)}>{mostrarTextos ? 'Mostrar só os pendentes' : 'Mostrar todos os textos'}</Button>}>
        <div className="grid lg:grid-cols-2 gap-3">
          {chaves.filter(k => mostrarTextos || ROTULOS_TEXTOS[k]).map(k => (
            <Textarea key={k} rotulo={ROTULOS_TEXTOS[k] ?? k} rows={2} placeholder={TEXTOS_PADRAO[k]} value={c.textos[k] ?? ''}
              onChange={e => set('textos', { ...c.textos, [k]: e.target.value })} />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Regulamento" descricao="Cole aqui o texto revisado pelo advogado (markdown). Vazio = a página mostra a minuta do textos.md.">
        <Textarea rows={12} value={c.regulamento_md ?? ''} onChange={e => set('regulamento_md', e.target.value)} placeholder="### REGULAMENTO DA CAMPANHA ..." />
      </SectionCard>
      {msg && <p className={`aviso aviso-${msg.tom} m-0`}>{msg.texto}</p>}
      <div className="flex justify-end"><Button variante="primario" carregando={salvando} onClick={salvar}>Salvar campanha</Button></div>
    </div>
  );
}
