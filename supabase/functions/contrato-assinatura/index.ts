import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

// Assinatura eletrônica própria dos contratos de eventos (no lugar do gov.br).
//
// Ações do bar (exigem login com fn_eventos_pode, conferido como o próprio usuário):
//   bar_assinar {evento_id, pdf (base64), assinatura (PNG data URL)}
//       guarda o PDF em assinaturas/<evento>/, calcula o SHA-256, registra o
//       assinante do bar e cria o link de 7 dias (cancela o link anterior).
//   novo_link {assinatura_id}  troca o token (o link antigo morre) e renova 7 dias.
//   previa {assinatura_id}     PDF com a página de certificado só com o bar (não guarda).
// Ações públicas (exigem o token do link):
//   ver {token}                dados mínimos para a página + URL do PDF (5 min).
//   assinar {token, nome, documento, aceite, assinatura}
//       confere o hash do PDF guardado, anexa o certificado, guarda o PDF final
//       (nunca sobrescreve), marca contrato e evento como assinados.
// No banco fica só o SHA-256 do token. A service role só existe aqui dentro.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

const BUCKET = 'eventos-contratos';
const VALIDADE_LINK_DIAS = 7;
const MAX_PDF = 5 * 1024 * 1024;
const MAX_ASSINATURA = 300 * 1024;
const MAX_CORPO = 8 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const falha = (error: string, status = 400, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function sha256(dados: Uint8Array | string) {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados;
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function novoToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PNG em data URL, até 300 KB. Devolve os bytes ou null. */
function pngValido(v: unknown) {
  const s = String(v ?? '');
  const prefixo = 'data:image/png;base64,';
  if (!s.startsWith(prefixo) || s.length > MAX_ASSINATURA * 1.4) return null;
  try {
    const b = deBase64(s.slice(prefixo.length));
    const assinaturaPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length > MAX_ASSINATURA || b.length < 100 || assinaturaPng.some((x, i) => b[i] !== x)) return null;
    return b;
  } catch { return null; }
}

function pdfValido(v: unknown) {
  const s = String(v ?? '');
  if (!s || s.length > MAX_PDF * 1.4) return null;
  try {
    const b = deBase64(s);
    if (b.length > MAX_PDF || new TextDecoder().decode(b.slice(0, 5)) !== '%PDF-') return null;
    return b;
  } catch { return null; }
}

const ipDe = (req: Request) =>
  (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim().slice(0, 100) || null;
const navegadorDe = (req: Request) => (req.headers.get('user-agent') || '').slice(0, 400) || null;

const mascarar = (doc: string) =>
  doc.length === 11 ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`
  : doc.length === 14 ? `**.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-**`
  : '***';

/** Cuiabá é UTC-4 o ano todo (sem horário de verão desde 2019). */
function horaCuiaba(iso: string) {
  const d = new Date(new Date(iso).getTime() - 4 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 19)} (horário de Cuiabá, UTC-4)`;
}
const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

// ── certificado (pdf-lib, fonte padrão WinAnsi) ──

interface Parte { papel: string; nome: string; em: string; ip: string | null; navegador: string | null; png: Uint8Array; extra?: string }

const winAnsi = (s: unknown) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•]/g, '?');

function quebrar(texto: string, fonte: PDFFont, tam: number, largura: number) {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of winAnsi(texto).split(/\s+/)) {
    let p = palavra;
    // palavra maior que a linha (navegador, hash): corta no meio
    while (fonte.widthOfTextAtSize(p, tam) > largura) {
      let n = p.length;
      while (n > 1 && fonte.widthOfTextAtSize(p.slice(0, n), tam) > largura) n--;
      if (atual) { linhas.push(atual); atual = ''; }
      linhas.push(p.slice(0, n));
      p = p.slice(n);
    }
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tam) > largura && atual) { linhas.push(atual); atual = p; } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function anexarCertificado(original: Uint8Array, info: {
  documentoId: string; titulo: string; hashOriginal: string; partes: Parte[]; pendente?: string;
}) {
  const pdf = await PDFDocument.load(original);
  const paginasOriginais = pdf.getPageCount();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 50, L = 595.28 - 2 * M;
  let page: PDFPage = pdf.addPage([595.28, 841.89]);
  let y = 841.89 - 60;
  const cinza = rgb(0.4, 0.4, 0.4), preto = rgb(0.1, 0.1, 0.1);

  const novaPagina = () => { page = pdf.addPage([595.28, 841.89]); y = 841.89 - 60; };
  const texto = (t: string, o: { tam?: number; fonte?: PDFFont; cor?: ReturnType<typeof rgb>; x?: number; largura?: number } = {}) => {
    const tam = o.tam ?? 10, fonte = o.fonte ?? normal, x = o.x ?? M;
    for (const linha of quebrar(t, fonte, tam, o.largura ?? L - (x - M))) {
      if (y < 70) novaPagina();
      page.drawText(linha, { x, y, size: tam, font: fonte, color: o.cor ?? preto });
      y -= tam * 1.4;
    }
  };

  texto('Certificado de assinaturas', { tam: 18, fonte: negrito });
  y -= 4;
  texto(info.titulo, { tam: 11 });
  y -= 6;
  texto(`ID do documento: ${info.documentoId}`, { tam: 9, cor: cinza });
  texto(`SHA-256 do PDF original (${paginasOriginais} página${paginasOriginais > 1 ? 's' : ''}, antes deste certificado):`, { tam: 9, cor: cinza });
  texto(info.hashOriginal, { tam: 9, fonte: negrito });
  y -= 10;

  for (const p of info.partes) {
    if (y < 260) novaPagina();
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + L, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 12;
    texto(p.papel.toUpperCase(), { tam: 9, fonte: negrito, cor: cinza });
    texto(p.nome, { tam: 12, fonte: negrito });
    const img = await pdf.embedPng(p.png);
    const esc = Math.min(220 / img.width, 70 / img.height, 1);
    const w = img.width * esc, h = img.height * esc;
    page.drawImage(img, { x: M, y: y - h, width: w, height: h });
    y -= h + 8;
    texto(`Assinou em: ${horaCuiaba(p.em)}`, { tam: 9 });
    if (p.extra) texto(p.extra, { tam: 9 });
    texto(`IP: ${p.ip || 'não informado'}`, { tam: 9 });
    texto(`Navegador: ${p.navegador || 'não informado'}`, { tam: 8, cor: cinza });
    y -= 10;
  }
  if (info.pendente) { texto(info.pendente, { tam: 10, fonte: negrito, cor: rgb(0.6, 0.35, 0) }); y -= 10; }

  y -= 6;
  texto('Validade', { tam: 10, fonte: negrito });
  texto('Documento assinado com assinatura eletrônica simples, em plataforma própria do Ditado Popular, com aceite das partes, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. Cada assinante foi registrado com nome, data e hora, IP e navegador. A contratante confirmou o nome, o CPF/CNPJ do contrato e declarou ter lido e aceito o documento.', { tam: 9 });
  texto('Qualquer alteração nas páginas anteriores muda o SHA-256 do PDF original informado acima.', { tam: 9, cor: cinza });

  return { bytes: await pdf.save(), paginasOriginais };
}

// ── acesso ──

async function barLogado(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: pode, error } = await caller.rpc('fn_eventos_pode');
  if (error || pode !== true) return null;
  const { data: uid } = await caller.rpc('fn_usuario_sistema_id');
  if (!uid) return null;
  const { data: u } = await db.from('usuarios_sistema').select('id, nome_completo').eq('id', uid).maybeSingle();
  return u ? { id: u.id as string, nome: String(u.nome_completo || '').trim() || 'Usuário do sistema' } : null;
}

async function porToken(token: unknown) {
  if (!TOKEN.test(String(token ?? ''))) return null;
  const { data } = await db.from('eventos_assinaturas').select('*').eq('token_hash', await sha256(String(token))).maybeSingle();
  return data;
}

/** Situação do link: só 'aguardando' dentro do prazo serve. */
function estadoLink(a: any) {
  if (!a || a.status === 'cancelado') return 'invalido';
  if (a.status === 'assinado') return 'assinado';
  if (new Date(a.expira_em).getTime() < Date.now()) return 'expirado';
  return 'ok';
}
const MSG_LINK: Record<string, [string, number]> = {
  invalido: ['Link inválido ou cancelado. Peça um link novo ao Ditado Popular.', 404],
  assinado: ['Este contrato já foi assinado.', 409],
  expirado: ['Este link expirou. Peça um link novo ao Ditado Popular.', 410],
};

async function evento(eventoId: string) {
  const [{ data: ev }, { data: ct }] = await Promise.all([
    db.from('eventos_fechados').select('nome_evento, data_evento').eq('id', eventoId).maybeSingle(),
    db.from('eventos_contratos').select('contratante, assinado_em').eq('evento_id', eventoId).maybeSingle(),
  ]);
  return { ev, ct, titulo: ev ? `Contrato · ${ev.nome_evento} · ${dataBr(String(ev.data_evento))}` : 'Contrato de evento' };
}

async function baixarOriginal(a: any) {
  const { data, error } = await db.storage.from(BUCKET).download(a.pdf_original);
  if (error || !data) throw new Error('Não encontrei o PDF do contrato.');
  const bytes = new Uint8Array(await data.arrayBuffer());
  if ((await sha256(bytes)) !== a.pdf_original_sha256) throw new Error('O PDF guardado não confere com o que o bar assinou. Peça um link novo.');
  return bytes;
}

const parteBar = (a: any): Parte => ({
  papel: 'Contratada · Ditado Popular', nome: a.bar_nome, em: a.bar_em, ip: a.bar_ip, navegador: a.bar_navegador,
  png: pngValido(a.bar_assinatura)!,
});

// ── ações ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return falha('Use POST.', 405);

  try {
    const bruto = await req.text();
    if (bruto.length > MAX_CORPO) return falha('Envio grande demais.', 413);
    let corpo: Record<string, unknown>;
    try { corpo = JSON.parse(bruto); } catch { return falha('Corpo inválido.'); }
    const acao = String(corpo.acao ?? '');

    // ---------- públicas ----------
    if (acao === 'ver' || acao === 'assinar') {
      const a = await porToken(corpo.token);
      const estado = estadoLink(a);
      if (estado !== 'ok') return falha(MSG_LINK[estado][0], MSG_LINK[estado][1], { estado });
      const { ev, ct, titulo } = await evento(a.evento_id);
      const doc = digitos((ct?.contratante as any)?.documento);
      if (!ct || ct.assinado_em || (doc.length !== 11 && doc.length !== 14)) return falha(MSG_LINK.invalido[0], 404, { estado: 'invalido' });

      if (acao === 'ver') {
        const { data: url } = await db.storage.from(BUCKET).createSignedUrl(a.pdf_original, 300);
        return json({
          ok: true, estado: 'ok', documento_id: a.id, titulo,
          evento: ev?.nome_evento ?? null, data_evento: ev?.data_evento ?? null,
          contratante: String((ct.contratante as any)?.nome ?? ''),
          representante: String((ct.contratante as any)?.representante ?? '') || null,
          documento_mascarado: mascarar(doc), tipo_documento: doc.length === 11 ? 'CPF' : 'CNPJ',
          bar_nome: a.bar_nome, bar_em: a.bar_em, expira_em: a.expira_em,
          pdf_url: url?.signedUrl ?? null,
        });
      }

      // assinar
      const nome = String(corpo.nome ?? '').trim().replace(/\s+/g, ' ');
      if (nome.length < 5 || nome.length > 120 || nome.split(' ').length < 2 || !/^[A-Za-zÀ-ÖØ-öø-ÿ'. -]+$/.test(nome))
        return falha('Escreva o nome completo (nome e sobrenome, só letras).');
      if (digitos(corpo.documento) !== doc) return falha(`O ${doc.length === 11 ? 'CPF' : 'CNPJ'} não confere com o do contrato.`);
      if (corpo.aceite !== true) return falha('Marque que leu e aceita o contrato.');
      const png = pngValido(corpo.assinatura);
      if (!png) return falha('Assinatura inválida (imagem PNG de até 300 KB).');

      const original = await baixarOriginal(a);
      const agora = new Date().toISOString();
      const ip = ipDe(req), navegador = navegadorDe(req);
      const { bytes } = await anexarCertificado(original, {
        documentoId: a.id, titulo, hashOriginal: a.pdf_original_sha256,
        partes: [parteBar(a), {
          papel: 'Contratante', nome, em: agora, ip, navegador, png,
          extra: `${doc.length === 11 ? 'CPF' : 'CNPJ'} conferido com o contrato: ${mascarar(doc)}`,
        }],
      });
      const caminho = `assinaturas/${a.evento_id}/${a.id}-assinado.pdf`;
      // upsert false: o arquivo assinado nunca é sobrescrito (e trava a corrida de duas assinaturas)
      const up = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: 'application/pdf', upsert: false });
      if (up.error) return falha('Não consegui guardar o contrato assinado. Ele pode já ter sido assinado; recarregue a página.', 409);
      const hashFinal = await sha256(bytes);

      const { data: marcado, error: errMarca } = await db.from('eventos_assinaturas').update({
        status: 'assinado', cliente_nome: nome, cliente_em: agora, cliente_ip: ip, cliente_navegador: navegador,
        cliente_assinatura: String(corpo.assinatura), pdf_assinado: caminho, pdf_assinado_sha256: hashFinal,
      }).eq('id', a.id).eq('status', 'aguardando').gt('expira_em', agora).select('id');
      if (errMarca || !marcado?.length) return falha('O link mudou enquanto você assinava. Peça um link novo.', 409);

      const r1 = await db.from('eventos_contratos').update({ assinado_arquivo: caminho, assinado_em: agora }).eq('evento_id', a.evento_id);
      const r2 = await db.from('eventos_fechados').update({ contrato_assinado: true }).eq('id', a.evento_id);
      if (r1.error || r2.error) console.error('assinatura gravada, mas falhou marcar contrato/evento', a.id, r1.error?.message, r2.error?.message);

      const { data: url } = await db.storage.from(BUCKET).createSignedUrl(caminho, 600, { download: `Contrato assinado - ${ev?.nome_evento ?? 'evento'}.pdf`.replace(/[\\/:*?"<>|]/g, '-') });
      return json({ ok: true, estado: 'assinado', documento_id: a.id, sha256: hashFinal, pdf_url: url?.signedUrl ?? null });
    }

    // ---------- do bar ----------
    const bar = await barLogado(req);
    if (!bar) return falha('Sem acesso (entre com um usuário do módulo de eventos).', 403);

    if (acao === 'bar_assinar') {
      const eventoId = String(corpo.evento_id ?? '');
      if (!UUID.test(eventoId)) return falha('Evento inválido.');
      const { ct } = await evento(eventoId);
      if (!ct) return falha('Salve o contrato antes de assinar.');
      if (ct.assinado_em) return falha('Este contrato já está assinado. Para mudar, faça um contrato novo.', 409);
      const doc = digitos((ct.contratante as any)?.documento);
      if (!String((ct.contratante as any)?.nome ?? '').trim() || (doc.length !== 11 && doc.length !== 14))
        return falha('Preencha o nome e o CPF/CNPJ do contratante (e salve) antes de assinar.');
      const { data: jaAssinado } = await db.from('eventos_assinaturas').select('id').eq('evento_id', eventoId).eq('status', 'assinado').maybeSingle();
      if (jaAssinado) return falha('Este contrato já está assinado.', 409);
      const pdf = pdfValido(corpo.pdf);
      if (!pdf) return falha('PDF inválido (até 5 MB).');
      if (!pngValido(corpo.assinatura)) return falha('Assinatura inválida (imagem PNG de até 300 KB).');

      const id = crypto.randomUUID();
      const caminho = `assinaturas/${eventoId}/${id}-original.pdf`;
      const up = await db.storage.from(BUCKET).upload(caminho, pdf, { contentType: 'application/pdf', upsert: false });
      if (up.error) return falha(`Não consegui guardar o PDF: ${up.error.message}`, 500);

      const token = novoToken();
      const expira = new Date(Date.now() + VALIDADE_LINK_DIAS * 86400_000).toISOString();
      await db.from('eventos_assinaturas').update({ status: 'cancelado' }).eq('evento_id', eventoId).eq('status', 'aguardando');
      const { error } = await db.from('eventos_assinaturas').insert({
        id, evento_id: eventoId, token_hash: await sha256(token), expira_em: expira,
        pdf_original: caminho, pdf_original_sha256: await sha256(pdf),
        bar_usuario_id: bar.id, bar_nome: bar.nome, bar_ip: ipDe(req), bar_navegador: navegadorDe(req),
        bar_assinatura: String(corpo.assinatura),
      });
      if (error) { await db.storage.from(BUCKET).remove([caminho]); return falha(`Não consegui registrar: ${error.message}`, 500); }
      return json({ ok: true, assinatura_id: id, token, expira_em: expira });
    }

    if (acao === 'novo_link' || acao === 'previa') {
      const id = String(corpo.assinatura_id ?? '');
      if (!UUID.test(id)) return falha('Assinatura inválida.');
      const { data: a } = await db.from('eventos_assinaturas').select('*').eq('id', id).maybeSingle();
      if (!a || a.status !== 'aguardando') return falha('Este link não está mais aguardando o cliente.', 409);

      if (acao === 'novo_link') {
        const token = novoToken();
        const expira = new Date(Date.now() + VALIDADE_LINK_DIAS * 86400_000).toISOString();
        const { error } = await db.from('eventos_assinaturas').update({ token_hash: await sha256(token), expira_em: expira }).eq('id', id).eq('status', 'aguardando');
        if (error) return falha(error.message, 500);
        return json({ ok: true, assinatura_id: id, token, expira_em: expira });
      }

      const { titulo } = await evento(a.evento_id);
      const { bytes } = await anexarCertificado(await baixarOriginal(a), {
        documentoId: a.id, titulo, hashOriginal: a.pdf_original_sha256, partes: [parteBar(a)],
        pendente: 'Aguardando a assinatura do contratante. Esta via ainda não está concluída.',
      });
      // octet-stream: é o tipo que o supabase.functions.invoke devolve como Blob
      return new Response(bytes, { headers: { ...CORS, 'Content-Type': 'application/octet-stream' } });
    }

    return falha('Ação desconhecida.');
  } catch (e) {
    console.error('contrato-assinatura', e instanceof Error ? e.message : e);
    return falha(e instanceof Error ? e.message : 'Erro inesperado.', 500);
  }
});
