import { CHAVE, URL_SUPA } from './api';

/**
 * Contador das páginas públicas (/links e /vale): abertura da página e clique em botão.
 * Sem dado pessoal: só a origem, o tipo de aparelho e um código aleatório da aba.
 * Usa fetch com keepalive para o registro chegar mesmo quando o clique troca de página.
 * Falha em silêncio: contar nunca atrapalha a página.
 */
type Pagina = 'links' | 'vale';

function sessao(): string {
  try {
    let s = sessionStorage.getItem('site_sessao');
    if (!s) {
      s = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
      sessionStorage.setItem('site_sessao', s);
    }
    return s;
  } catch {
    return `s${Date.now()}`;
  }
}

/** De onde a pessoa veio: utm_source do link, o app que abriu a página, ou o site de antes. */
export function origemVisita(): string {
  try {
    const salvo = sessionStorage.getItem('site_origem');
    if (salvo) return salvo;
    const q = new URLSearchParams(location.search);
    const ua = navigator.userAgent;
    let o = q.get('utm_source') || '';
    if (!o) {
      if (/Instagram/i.test(ua)) o = 'instagram';
      else if (/FBAN|FBAV|FB_IAB/i.test(ua)) o = 'facebook';
      else if (/WhatsApp/i.test(ua)) o = 'whatsapp';
      else if (document.referrer) {
        const host = new URL(document.referrer).hostname.replace(/^www\./, '');
        o = host === location.hostname.replace(/^www\./, '') ? 'links' : host.split('.')[0];
      } else o = 'direto';
    }
    o = o.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'direto';
    sessionStorage.setItem('site_origem', o);
    return o;
  } catch {
    return 'direto';
  }
}

export function registrar(pagina: Pagina, alvo: string | null = null) {
  try {
    const corpo = {
      p_pagina: pagina, p_alvo: alvo, p_origem: origemVisita(), p_sessao: sessao(),
      p_dispositivo: window.matchMedia('(pointer: fine)').matches && innerWidth >= 900 ? 'computador' : 'celular',
    };
    fetch(`${URL_SUPA}/rest/v1/rpc/fn_site_registrar`, {
      method: 'POST', keepalive: true,
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    }).catch(() => { /* contar nunca atrapalha */ });
  } catch { /* idem */ }
}
