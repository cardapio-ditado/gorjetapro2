import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, ExternalLink, FileSignature, FileText, ImagePlus, Loader2, Search, Share2, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CONDICOES_PADRAO, montarContratoFeijoada, type Condicoes, type Contratante } from './contratoFeijoada';
import { gerarContratoPdf } from './contratoPdf';
import { brl, diaDaSemana, diaEMes, documentoValido, formatarCep, formatarDocumento, hora, soDigitos } from './extenso';
import { carregarFontesConvite, desenharConvite, LAYOUTS, type ConviteTexto } from './convite/desenharConvite';
import { prepararLogo } from './convite/prepararLogo';

/**
 * Contrato e convite de um evento fechado (por enquanto o modelo da feijoada).
 * - Contrato: preenche o contratante (busca CNPJ e CEP), ajusta as condições e
 *   gera o PDF, que as partes assinam no gov.br; o PDF assinado volta para cá.
 * - Convite: arte no formato stories, com a foto do layout, os logos e os dados.
 * Os dados ficam em eventos_contratos (só quem tem o módulo de eventos).
 */

export interface EventoBase {
  id: string;
  nome_evento: string;
  data_evento: string;
  horario_inicio?: string;
  horario_fim?: string;
  cliente_responsavel?: string;
  telefone_cliente?: string;
  contrato_assinado?: boolean;
}

interface ConviteSalvo {
  layout?: string; chamada?: string; titulo?: string; organizador?: string; horario?: string;
  destaques?: string; preco_venda?: number | null; contato?: string; endereco?: string; logo_cliente?: string | null;
}

interface Registro {
  contratante: Contratante;
  condicoes: Condicoes;
  convite: ConviteSalvo;
  gerado_em: string | null;
  assinado_arquivo: string | null;
  assinado_em: string | null;
}

const BUCKET_FOTOS = 'marketing-assets';
const fotoUrl = (nome: string, mini = false) => supabase.storage.from(BUCKET_FOTOS).getPublicUrl(`convites/feijoada/${mini ? 'mini/' : ''}${nome}.jpg`).data.publicUrl;
const ENDERECO_PADRAO = 'Rua Senador Vilas Boas, 89 · Popular · Cuiabá';

const inputCls = 'w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:border-wine';
const labelCls = 'block text-xs text-white/60 mb-1';
const botao = 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50';

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, m => m.toLowerCase());

function carregarImagem(src: string, cors = true) {
  return new Promise<HTMLImageElement>((ok, erro) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error(`Não consegui carregar ${src}`));
    img.src = src;
  });
}

const Campo: React.FC<{ rotulo: string; className?: string; children: React.ReactNode }> = ({ rotulo, className, children }) => (
  <label className={className}><span className={labelCls}>{rotulo}</span>{children}</label>
);

const ContratoConvite: React.FC<{ evento: EventoBase; onClose: () => void; onAtualizado?: () => void }> = ({ evento, onClose, onAtualizado }) => {
  const { usuario } = useAuth();
  const [aba, setAba] = useState<'contrato' | 'convite'>('contrato');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [buscando, setBuscando] = useState<'cnpj' | 'cep' | null>(null);
  const [reg, setReg] = useState<Registro>({
    contratante: { nome: evento.cliente_responsavel || '', telefone: evento.telefone_cliente || '', cidade: 'Cuiabá', uf: 'MT' },
    condicoes: {},
    convite: {},
    gerado_em: null, assinado_arquivo: null, assinado_em: null,
  });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from('eventos_contratos').select('contratante, condicoes, convite, gerado_em, assinado_arquivo, assinado_em').eq('evento_id', evento.id).maybeSingle();
      if (!vivo) return;
      if (error) setAviso({ tipo: 'erro', texto: `Não consegui ler o contrato: ${error.message}` });
      if (data) setReg(r => ({ ...r, ...data, contratante: { ...r.contratante, ...(data.contratante as Contratante) } }));
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [evento.id]);

  const cond = useMemo(() => ({ ...CONDICOES_PADRAO, ...Object.fromEntries(Object.entries(reg.condicoes).filter(([, v]) => v !== '' && v !== null && v !== undefined)) }) as typeof CONDICOES_PADRAO, [reg.condicoes]);
  const setContratante = (p: Partial<Contratante>) => setReg(r => ({ ...r, contratante: { ...r.contratante, ...p } }));
  const setCondicao = (p: Partial<Condicoes>) => setReg(r => ({ ...r, condicoes: { ...r.condicoes, ...p } }));
  const setConvite = (p: Partial<ConviteSalvo>) => setReg(r => ({ ...r, convite: { ...r.convite, ...p } }));

  const salvar = async (extra: Partial<Registro> & { gerado_por?: string } = {}) => {
    setSalvando(true);
    const linha = { evento_id: evento.id, contratante: reg.contratante, condicoes: reg.condicoes, convite: reg.convite, atualizado_em: new Date().toISOString(), ...extra };
    const { error } = await supabase.from('eventos_contratos').upsert(linha, { onConflict: 'evento_id' });
    setSalvando(false);
    if (error) { setAviso({ tipo: 'erro', texto: `Não salvou: ${error.message}` }); return false; }
    setReg(r => ({ ...r, ...extra }));
    return true;
  };

  // ── contratante: busca de CNPJ e CEP (BrasilAPI, consulta pública) ──
  const doc = soDigitos(reg.contratante.documento || '');
  const docOk = doc.length === 11 || doc.length === 14 ? documentoValido(doc) : null;

  const buscarCnpj = async () => {
    if (doc.length !== 14) return;
    setBuscando('cnpj'); setAviso(null);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || 'CNPJ não encontrado');
      setContratante({
        nome: j.razao_social || reg.contratante.nome,
        logradouro: titulo([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ')),
        numero: j.numero || '', complemento: j.complemento ? titulo(j.complemento) : '',
        bairro: titulo(j.bairro || ''), cep: j.cep || '', cidade: titulo(j.municipio || ''), uf: j.uf || '',
      });
      if (j.descricao_situacao_cadastral && j.descricao_situacao_cadastral !== 'ATIVA') setAviso({ tipo: 'erro', texto: `Atenção: CNPJ com situação "${j.descricao_situacao_cadastral}" na Receita.` });
      else setAviso({ tipo: 'ok', texto: `Dados da Receita preenchidos${j.nome_fantasia ? ` (${j.nome_fantasia})` : ''}. Confira o representante.` });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não consegui buscar o CNPJ' });
    } finally { setBuscando(null); }
  };

  const buscarCep = async () => {
    const cep = soDigitos(reg.contratante.cep || '');
    if (cep.length !== 8) return;
    setBuscando('cep');
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
      const j = await r.json();
      if (!r.ok) throw new Error('CEP não encontrado');
      setContratante({ logradouro: j.street || reg.contratante.logradouro, bairro: j.neighborhood || reg.contratante.bairro, cidade: j.city || reg.contratante.cidade, uf: j.state || reg.contratante.uf });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não consegui buscar o CEP' });
    } finally { setBuscando(null); }
  };

  // ── contrato em PDF ──
  const montarPdf = () => {
    const blocos = montarContratoFeijoada({ dataEvento: evento.data_evento, dataAssinatura: new Date().toISOString().slice(0, 10), contratante: reg.contratante, condicoes: reg.condicoes });
    const [a, m, d] = evento.data_evento.slice(0, 10).split('-');
    return gerarContratoPdf(blocos, `Contrato · ${evento.nome_evento} · ${d}/${m}/${a}`);
  };
  const nomeArquivo = `Contrato ${evento.nome_evento} ${evento.data_evento.slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, '-');

  const faltando = [
    !reg.contratante.nome?.trim() && 'nome do contratante',
    !doc && 'CPF/CNPJ',
    docOk === false && 'CPF/CNPJ válido',
    !reg.contratante.logradouro?.trim() && 'endereço',
  ].filter(Boolean) as string[];

  const gerarContrato = async (modo: 'ver' | 'baixar') => {
    const janela = modo === 'ver' ? window.open('', '_blank') : null;
    const pdf = montarPdf();
    await salvar({ gerado_em: new Date().toISOString(), gerado_por: usuario?.nome_completo || undefined });
    if (modo === 'baixar') { pdf.save(nomeArquivo); return; }
    const url = URL.createObjectURL(pdf.output('blob'));
    if (janela) janela.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // ── contrato assinado (gov.br) ──
  const enviarAssinado = async (arquivo: File) => {
    if (arquivo.type !== 'application/pdf') { setAviso({ tipo: 'erro', texto: 'Envie o PDF assinado (o arquivo que o gov.br devolve).' }); return; }
    setSalvando(true); setAviso(null);
    const caminho = `${evento.id}/contrato-assinado-${Date.now()}.pdf`;
    const { error } = await supabase.storage.from('eventos-contratos').upload(caminho, arquivo, { contentType: 'application/pdf' });
    if (error) { setSalvando(false); setAviso({ tipo: 'erro', texto: `Não consegui enviar: ${error.message}` }); return; }
    const agora = new Date().toISOString();
    const ok = await salvar({ assinado_arquivo: caminho, assinado_em: agora });
    if (ok) {
      await supabase.from('eventos_fechados').update({ contrato_assinado: true }).eq('id', evento.id);
      setAviso({ tipo: 'ok', texto: 'Contrato assinado guardado e evento marcado como "contrato assinado".' });
      onAtualizado?.();
    }
  };
  const abrirAssinado = async () => {
    if (!reg.assinado_arquivo) return;
    const { data, error } = await supabase.storage.from('eventos-contratos').createSignedUrl(reg.assinado_arquivo, 300);
    if (error || !data) { setAviso({ tipo: 'erro', texto: 'Não consegui abrir o arquivo.' }); return; }
    window.open(data.signedUrl, '_blank');
  };

  // ── convite ──
  const layout = LAYOUTS.find(l => l.id === reg.convite.layout) ?? LAYOUTS[0];
  const textoConvite: ConviteTexto = {
    chamada: reg.convite.chamada ?? '',
    titulo: reg.convite.titulo ?? 'Feijoada',
    organizador: reg.convite.organizador ?? '',
    diaSemana: diaDaSemana(evento.data_evento),
    data: diaEMes(evento.data_evento),
    horario: reg.convite.horario ?? `das ${hora(cond.buffet_inicio)} às ${hora(cond.buffet_fim)}`,
    destaques: reg.convite.destaques ?? 'Banda ao vivo · Buffet completo · Sobremesa',
    // o preço do convite é o que o cliente cobra na venda, não o valor do contrato (custo dele)
    preco: reg.convite.preco_venda ? `Convite ${brl(reg.convite.preco_venda).replace(',00', '')}` : '',
    contato: reg.convite.contato ?? '',
    endereco: reg.convite.endereco ?? ENDERECO_PADRAO,
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  const cache = useRef(new Map<string, Promise<HTMLImageElement>>());
  const imagem = useCallback((src: string, cors = true) => {
    if (!cache.current.has(src)) cache.current.set(src, carregarImagem(src, cors));
    return cache.current.get(src)!;
  }, []);

  const chaveDesenho = JSON.stringify([layout.id, textoConvite, reg.convite.logo_cliente]);
  useEffect(() => {
    if (aba !== 'convite' || carregando) return;
    let vivo = true;
    setDesenhando(true);
    (async () => {
      try {
        await carregarFontesConvite();
        const [foto, logoBar, logoCliente] = await Promise.all([
          imagem(fotoUrl(layout.foto)),
          imagem('/marca/ditado-brasa-bar.svg', false),
          reg.convite.logo_cliente ? imagem(reg.convite.logo_cliente) : Promise.resolve(null),
        ]);
        if (vivo && canvasRef.current) { desenharConvite(canvasRef.current, layout, textoConvite, { foto, logoBar, logoCliente }); setErroConvite(null); }
      } catch (e) {
        if (vivo) setErroConvite(e instanceof Error ? e.message : 'Erro ao desenhar o convite');
      } finally { if (vivo) setDesenhando(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, carregando, chaveDesenho]);

  // logo do cliente: qualquer imagem vira PNG recortado, sem o fundo liso
  const logoOriginal = useRef<File | null>(null);
  const [logoInfo, setLogoInfo] = useState<{ removeu: boolean; aviso?: string } | null>(null);
  const [preparandoLogo, setPreparandoLogo] = useState(false);
  const enviarLogo = async (arquivo: File, removerFundo = true) => {
    if (!arquivo.type.startsWith('image/')) { setAviso({ tipo: 'erro', texto: 'Envie uma imagem (PNG, JPG, WEBP ou SVG).' }); return; }
    logoOriginal.current = arquivo;
    setPreparandoLogo(true); setAviso(null);
    try {
      const r = await prepararLogo(arquivo, removerFundo);
      const caminho = `convites/clientes/${evento.id}/logo-${Date.now()}.png`;
      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, r.blob, { contentType: 'image/png' });
      if (error) throw new Error(`Não consegui enviar o logo: ${error.message}`);
      setLogoInfo({ removeu: r.removeuFundo, aviso: r.aviso });
      setConvite({ logo_cliente: supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho).data.publicUrl });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não consegui preparar o logo' });
    } finally { setPreparandoLogo(false); }
  };
  // colar o logo (Ctrl+V) com a aba do convite aberta
  useEffect(() => {
    if (aba !== 'convite') return;
    const aoColar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); void enviarLogo(new File([f], 'logo-colado.png', { type: f.type })); }
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  const comoArquivo = () => new Promise<File>((ok, erro) => {
    canvasRef.current?.toBlob(b => (b ? ok(new File([b], `Convite ${evento.nome_evento}.png`.replace(/[\\/:*?"<>|]/g, '-'), { type: 'image/png' })) : erro(new Error('Não gerou a imagem'))), 'image/png');
  });
  const baixarConvite = async () => {
    try {
      const f = await comoArquivo();
      const url = URL.createObjectURL(f);
      const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      void salvar();
    } catch (e) { setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro' }); }
  };
  const podeCompartilhar = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const compartilhar = async () => {
    try {
      const f = await comoArquivo();
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: evento.nome_evento });
      else await baixarConvite();
      void salvar();
    } catch (e) { if ((e as Error)?.name !== 'AbortError') setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro' }); }
  };

  const total = cond.valor_pessoa * cond.minimo;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <FileSignature className="w-5 h-5 text-white/60" />
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold truncate">{evento.nome_evento}</h3>
            <p className="text-xs text-white/50">{diaDaSemana(evento.data_evento)}, {diaEMes(evento.data_evento)} · contrato e convite (modelo feijoada)</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {([['contrato', 'Contrato', FileText], ['convite', 'Convite (stories)', ImagePlus]] as const).map(([id, nome, Icone]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm ${aba === id ? 'bg-wine text-white' : 'text-white/60 hover:bg-white/5'}`}>
              <Icone className="w-4 h-4" /> {nome}
            </button>
          ))}
        </div>

        {aviso && (
          <div className={`mx-5 mt-3 p-3 rounded-lg text-sm ${aviso.tipo === 'ok' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>{aviso.texto}</div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {carregando ? (
            <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
          ) : aba === 'contrato' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-3">
                <h4 className="text-white font-medium">Contratante</h4>
                <div className="flex gap-2 items-end">
                  <Campo rotulo="CPF ou CNPJ" className="flex-1">
                    <input className={inputCls} value={reg.contratante.documento || ''} inputMode="numeric"
                      onChange={e => setContratante({ documento: e.target.value })}
                      onBlur={() => doc && setContratante({ documento: formatarDocumento(doc) })} placeholder="só números" />
                  </Campo>
                  <button type="button" onClick={buscarCnpj} disabled={doc.length !== 14 || buscando !== null} title="Buscar os dados na Receita (CNPJ)"
                    className={`${botao} border border-white/20 text-white/80 hover:bg-white/5`}>
                    {buscando === 'cnpj' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar CNPJ
                  </button>
                </div>
                {docOk === false && <p className="text-xs text-red-300">Esse {doc.length === 14 ? 'CNPJ' : 'CPF'} não confere (dígito verificador). Confira.</p>}
                <Campo rotulo={doc.length === 14 ? 'Razão social' : 'Nome completo'}>
                  <input className={inputCls} value={reg.contratante.nome || ''} onChange={e => setContratante({ nome: e.target.value })} />
                </Campo>
                {doc.length === 14 && (
                  <Campo rotulo="Representante (quem assina pela empresa)">
                    <input className={inputCls} value={reg.contratante.representante || ''} onChange={e => setContratante({ representante: e.target.value })} />
                  </Campo>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Campo rotulo="CEP">
                    <input className={inputCls} value={reg.contratante.cep || ''} inputMode="numeric"
                      onChange={e => setContratante({ cep: e.target.value })}
                      onBlur={() => { if (soDigitos(reg.contratante.cep || '').length === 8) { setContratante({ cep: formatarCep(reg.contratante.cep || '') }); void buscarCep(); } }} />
                  </Campo>
                  <Campo rotulo="Rua / avenida" className="col-span-2">
                    <input className={inputCls} value={reg.contratante.logradouro || ''} onChange={e => setContratante({ logradouro: e.target.value })} />
                  </Campo>
                  <Campo rotulo="Número"><input className={inputCls} value={reg.contratante.numero || ''} onChange={e => setContratante({ numero: e.target.value })} /></Campo>
                  <Campo rotulo="Complemento" className="col-span-2"><input className={inputCls} value={reg.contratante.complemento || ''} onChange={e => setContratante({ complemento: e.target.value })} /></Campo>
                  <Campo rotulo="Bairro"><input className={inputCls} value={reg.contratante.bairro || ''} onChange={e => setContratante({ bairro: e.target.value })} /></Campo>
                  <Campo rotulo="Cidade"><input className={inputCls} value={reg.contratante.cidade || ''} onChange={e => setContratante({ cidade: e.target.value })} /></Campo>
                  <Campo rotulo="UF"><input className={inputCls} maxLength={2} value={reg.contratante.uf || ''} onChange={e => setContratante({ uf: e.target.value.toUpperCase() })} /></Campo>
                </div>
                {buscando === 'cep' && <p className="text-xs text-white/50">Buscando o CEP…</p>}
              </section>

              <section className="space-y-3">
                <h4 className="text-white font-medium">Condições</h4>
                <div className="grid grid-cols-3 gap-2">
                  <Campo rotulo="Valor por pessoa (R$)"><input type="number" min={0} step="0.5" className={inputCls} value={cond.valor_pessoa} onChange={e => setCondicao({ valor_pessoa: Number(e.target.value) })} /></Campo>
                  <Campo rotulo="Mínimo de convites"><input type="number" min={0} className={inputCls} value={cond.minimo} onChange={e => setCondicao({ minimo: Number(e.target.value) })} /></Campo>
                  <Campo rotulo="Máximo de convites"><input type="number" min={0} className={inputCls} value={cond.maximo} onChange={e => setCondicao({ maximo: Number(e.target.value) })} /></Campo>
                  <Campo rotulo="Buffet: início"><input type="time" className={inputCls} value={cond.buffet_inicio} onChange={e => setCondicao({ buffet_inicio: e.target.value })} /></Campo>
                  <Campo rotulo="Buffet: fim"><input type="time" className={inputCls} value={cond.buffet_fim} onChange={e => setCondicao({ buffet_fim: e.target.value })} /></Campo>
                  <Campo rotulo="Pagar até (dias antes)"><input type="number" min={0} className={inputCls} value={cond.prazo_pagamento_dias} onChange={e => setCondicao({ prazo_pagamento_dias: Number(e.target.value) })} /></Campo>
                  <Campo rotulo="Banda: início"><input type="time" className={inputCls} value={cond.banda_inicio} onChange={e => setCondicao({ banda_inicio: e.target.value })} /></Campo>
                  <Campo rotulo="Banda: fim"><input type="time" className={inputCls} value={cond.banda_fim} onChange={e => setCondicao({ banda_fim: e.target.value })} /></Campo>
                  <Campo rotulo="Multa (cancelar &lt; 30 dias) %"><input type="number" min={0} max={100} className={inputCls} value={cond.multa_pct} onChange={e => setCondicao({ multa_pct: Number(e.target.value) })} /></Campo>
                </div>
                <p className="text-sm text-white/70">Valor mínimo do contrato: <strong className="text-white">{brl(total)}</strong> ({cond.minimo} × {brl(cond.valor_pessoa)})</p>
                <Campo rotulo="Condições especiais deste cliente (opcional, vira uma cláusula)">
                  <textarea className={inputCls} rows={3} value={reg.condicoes.clausula_extra || ''} onChange={e => setCondicao({ clausula_extra: e.target.value })}
                    placeholder="Ex.: A CONTRATADA reservará 10 mesas próximas ao palco para a diretoria." />
                </Campo>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={() => void gerarContrato('ver')} disabled={salvando} className={`${botao} bg-wine text-white hover:bg-[#6a1a25]`}><FileText className="w-4 h-4" /> Ver contrato</button>
                  <button onClick={() => void gerarContrato('baixar')} disabled={salvando} className={`${botao} border border-white/20 text-white/80 hover:bg-white/5`}><Download className="w-4 h-4" /> Baixar PDF</button>
                  <button onClick={async () => { if (await salvar()) setAviso({ tipo: 'ok', texto: 'Salvo.' }); }} disabled={salvando} className={`${botao} text-white/60 hover:bg-white/5`}>{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar</button>
                </div>
                {faltando.length > 0 && <p className="text-xs text-amber-300">Falta preencher: {faltando.join(', ')}. O PDF sai com espaço em branco nesses pontos.</p>}
                {reg.gerado_em && <p className="text-xs text-white/40">Último PDF gerado em {new Date(reg.gerado_em).toLocaleString('pt-BR')}.</p>}

                <div className="mt-4 rounded-xl border border-white/10 p-4 space-y-2">
                  <h4 className="text-white font-medium flex items-center gap-2"><FileSignature className="w-4 h-4" /> Assinatura pelo gov.br</h4>
                  <ol className="text-sm text-white/70 list-decimal pl-5 space-y-1">
                    <li>Baixe o PDF acima.</li>
                    <li>Assine em <a href="https://assinador.iti.br" target="_blank" rel="noreferrer" className="text-blue-300 underline inline-flex items-center gap-1">assinador.iti.br <ExternalLink className="w-3 h-3" /></a> (entra com a conta gov.br, nível prata ou ouro).</li>
                    <li>Mande o PDF assinado ao cliente para ele assinar também, no mesmo site.</li>
                    <li>Quando voltar com as duas assinaturas, envie aqui. Para conferir, use <a href="https://validar.iti.gov.br" target="_blank" rel="noreferrer" className="text-blue-300 underline">validar.iti.gov.br</a>.</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label className={`${botao} border border-white/20 text-white/80 hover:bg-white/5 cursor-pointer`}>
                      <Upload className="w-4 h-4" /> Enviar PDF assinado
                      <input type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void enviarAssinado(f); e.target.value = ''; }} />
                    </label>
                    {reg.assinado_arquivo && (
                      <button onClick={abrirAssinado} className={`${botao} text-green-300 hover:bg-white/5`}><Check className="w-4 h-4" /> Assinado em {reg.assinado_em ? new Date(reg.assinado_em).toLocaleDateString('pt-BR') : '—'} · abrir</button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <section className="space-y-4 order-2 lg:order-1">
                <div>
                  <span className={labelCls}>Layout</span>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {LAYOUTS.map(l => (
                      <button key={l.id} type="button" onClick={() => setConvite({ layout: l.id })} title={l.nome}
                        className={`relative rounded-lg overflow-hidden border-2 ${layout.id === l.id ? 'border-wine' : 'border-transparent hover:border-white/30'}`}>
                        <img src={fotoUrl(l.foto, true)} alt={l.nome} loading="lazy" className="w-full aspect-[9/16] object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] text-white py-0.5 text-center">{l.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Campo rotulo="Linha acima do título (opcional)"><input className={inputCls} value={textoConvite.chamada} onChange={e => setConvite({ chamada: e.target.value })} placeholder="Ex.: Convites à venda" /></Campo>
                  <Campo rotulo="Título"><input className={inputCls} value={textoConvite.titulo} onChange={e => setConvite({ titulo: e.target.value })} /></Campo>
                  <Campo rotulo="De quem é a feijoada" className="sm:col-span-2">
                    <input className={inputCls} value={textoConvite.organizador} onChange={e => setConvite({ organizador: e.target.value })} placeholder="Ex.: do Rotary Club Cuiabá · da Turma de 2006" />
                  </Campo>
                  <Campo rotulo="Horário"><input className={inputCls} value={textoConvite.horario} onChange={e => setConvite({ horario: e.target.value })} /></Campo>
                  <Campo rotulo="Destaques"><input className={inputCls} value={textoConvite.destaques} onChange={e => setConvite({ destaques: e.target.value })} /></Campo>
                  <Campo rotulo="Onde comprar (opcional)" className="sm:col-span-2">
                    <input className={inputCls} value={textoConvite.contato} onChange={e => setConvite({ contato: e.target.value })} placeholder="Ex.: Garanta o seu: (65) 9 9999-9999" />
                  </Campo>
                  <Campo rotulo="Endereço (rodapé)" className="sm:col-span-2"><input className={inputCls} value={textoConvite.endereco} onChange={e => setConvite({ endereco: e.target.value })} /></Campo>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Campo rotulo="Preço de venda do convite (R$)" className="w-48">
                    <input type="number" min={0} step="1" className={inputCls} value={reg.convite.preco_venda ?? ''}
                      onChange={e => setConvite({ preco_venda: e.target.value === '' ? null : Number(e.target.value) })} placeholder="ex.: 60" />
                  </Campo>
                  <p className="text-xs text-white/50 pb-2 flex-1 min-w-[200px]">O valor que o cliente cobra de quem compra. Não é o valor do contrato ({brl(cond.valor_pessoa)}, custo dele). Em branco, o convite sai sem preço.</p>
                </div>
                <div className="rounded-xl border border-white/10 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {reg.convite.logo_cliente && (
                      <div className="h-16 w-36 rounded-md flex items-center justify-center p-1" style={{ background: 'repeating-conic-gradient(#d9d4cc 0 25%, #f4eee4 0 50%) 0 0/14px 14px' }}>
                        <img src={reg.convite.logo_cliente} alt="Logo do cliente" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                    <label className={`${botao} border border-white/20 text-white/80 hover:bg-white/5 cursor-pointer`}>
                      {preparandoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {reg.convite.logo_cliente ? 'Trocar logo do cliente' : 'Logo do cliente'}
                      <input type="file" accept="image/*" className="hidden" disabled={preparandoLogo} onChange={e => { const f = e.target.files?.[0]; if (f) void enviarLogo(f); e.target.value = ''; }} />
                    </label>
                    {reg.convite.logo_cliente && (
                      <button onClick={() => { setConvite({ logo_cliente: null }); setLogoInfo(null); }} className={`${botao} text-white/60 hover:bg-white/5`}><Trash2 className="w-4 h-4" /> Tirar logo</button>
                    )}
                  </div>
                  <p className="text-xs text-white/50">Pode ser a imagem que o cliente mandou no WhatsApp (JPG, print, PNG ou SVG), ou cole com Ctrl+V. O sistema transforma em PNG, recorta e tira o fundo branco ou de cor lisa.</p>
                  {logoInfo?.aviso && <p className="text-xs text-amber-300">{logoInfo.aviso}</p>}
                  {logoInfo?.removeu && logoOriginal.current && (
                    <button onClick={() => logoOriginal.current && void enviarLogo(logoOriginal.current, false)} disabled={preparandoLogo} className="text-xs text-blue-300 underline">O fundo saiu errado? Usar com o fundo original</button>
                  )}
                </div>
                <p className="text-xs text-white/40">Data: {diaDaSemana(evento.data_evento)}, {diaEMes(evento.data_evento)} (vem do evento). Fotos geradas por IA, sem nada que identifique o lugar.</p>
              </section>

              <section className="order-1 lg:order-2 flex flex-col items-center gap-3">
                <div className="relative w-[240px] sm:w-[270px] aspect-[9/16] rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  <canvas ref={canvasRef} className="w-full h-full" />
                  {desenhando && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}
                </div>
                {erroConvite && <p className="text-xs text-red-300 text-center">{erroConvite}</p>}
                <div className="flex gap-2">
                  <button onClick={() => void baixarConvite()} disabled={desenhando || !!erroConvite} className={`${botao} bg-wine text-white hover:bg-[#6a1a25]`}><Download className="w-4 h-4" /> Baixar</button>
                  {podeCompartilhar && <button onClick={() => void compartilhar()} disabled={desenhando || !!erroConvite} className={`${botao} border border-white/20 text-white/80 hover:bg-white/5`}><Share2 className="w-4 h-4" /> Compartilhar</button>}
                </div>
                <p className="text-[11px] text-white/40 text-center max-w-[270px]">1080 × 1920, pronto para stories e status do WhatsApp.</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContratoConvite;
