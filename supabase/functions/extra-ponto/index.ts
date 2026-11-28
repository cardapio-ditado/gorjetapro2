import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Ponto dos extras (Kadu, 28/11/2026): o extra abre o link pessoal da noite (/ponto/<token>) e marca chegada
 * (GPS + selfie) e saída (GPS). Público: o extra não tem login. Quem confere tudo é esta função, com service_role;
 * nenhuma tabela fica aberta para visitante.
 *   POST { acao: "abrir", token }
 *   POST { acao: "entrada" | "saida", token, lat, lng, precisao, dispositivo, selfie? (data URL jpeg, só na entrada) }
 * Regras: link vale do dia da diária às 6h até as 6h do dia seguinte (Cuiabá, UTC-4); GPS a até raio_m do Ditado e
 * com precisão até precisao_max_m (extras_ponto_config); o link fica preso ao primeiro celular (outro celular marca,
 * mas acende alerta para o gerente). Toda tentativa, aceita ou não, fica em extras_ponto_tentativas.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function distancia(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

/** Janela do link: de 06:00 do dia da diária até 06:00 do dia seguinte, horário de Cuiabá (UTC-4). */
function janela(data: string) {
  const ini = new Date(`${data}T06:00:00-04:00`).getTime();
  return { ini, fim: ini + 24 * 3600 * 1000 };
}

async function carregar(token: string) {
  if (!/^[0-9a-f]{20,64}$/.test(token || "")) return null;
  const { data: p } = await db.from("extras_ponto").select("*").eq("token", token).maybeSingle();
  if (!p) return null;
  const { data: d } = await db.from("extras_freelancers")
    .select("id, nome, funcao_temporaria, valor_diaria, data_trabalho, presenca, status_pagamento, pessoa:extras_pessoas(nome)")
    .eq("id", p.diaria_id).maybeSingle();
  if (!d) return null;
  return { p, d };
}

function resumo(p: any, d: any) {
  const { ini, fim } = janela(d.data_trabalho);
  const agora = Date.now();
  return {
    nome: (d.pessoa?.nome || d.nome || "").split(" ")[0],
    funcao: d.funcao_temporaria, data: d.data_trabalho, valor: Number(d.valor_diaria),
    entrada_em: p.entrada_em, saida_em: p.saida_em,
    confirmada: d.presenca === "confirmada", cancelada: d.presenca === "faltou" || d.status_pagamento === "cancelado",
    antes: agora < ini, vencido: agora >= fim,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, erro: "Pedido inválido." }, 400); }

  const r = await carregar(String(b.token || ""));
  if (!r) return json({ ok: false, erro: "Link inválido. Peça um novo ao gerente." }, 404);
  const { p, d } = r;
  if (b.acao === "abrir") return json({ ok: true, ...resumo(p, d) });

  const acao = b.acao === "entrada" ? "entrada" : b.acao === "saida" ? "saida" : null;
  if (!acao) return json({ ok: false, erro: "Ação inválida." }, 400);

  const lat = Number(b.lat), lng = Number(b.lng), prec = Number(b.precisao);
  const dispositivo = String(b.dispositivo || "").slice(0, 80) || null;
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);
  const { data: cfg } = await db.from("extras_ponto_config").select("*").eq("id", 1).single();
  const dist = Number.isFinite(lat) && Number.isFinite(lng) ? distancia(lat, lng, cfg.lat, cfg.lng) : null;

  const registrar = (aceito: boolean, recusa: string | null) => db.from("extras_ponto_tentativas").insert({
    diaria_id: d.id, acao, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
    precisao_m: Number.isFinite(prec) ? prec : null, dist_m: dist, dispositivo, aceito, recusa, user_agent: ua,
  });
  const recusar = async (msg: string) => { await registrar(false, msg); return json({ ok: false, erro: msg, ...resumo(p, d) }); };

  const s = resumo(p, d);
  if (s.cancelada) return recusar("Esta diária foi cancelada. Fale com o gerente.");
  if (s.confirmada) return recusar("Sua diária já foi confirmada pelo gerente.");
  if (s.antes) return recusar("Ainda não abriu: o link vale a partir das 6h do dia da diária.");
  if (s.vencido) return recusar("Este link venceu (vale até as 6h do dia seguinte). Fale com o gerente.");
  if (acao === "entrada" && p.entrada_em) return json({ ok: true, ja: true, ...s });
  if (acao === "saida" && !p.entrada_em) return recusar("Marque a chegada primeiro.");
  if (acao === "saida" && p.saida_em) return json({ ok: true, ja: true, ...s });
  if (dist === null) return recusar("Não recebemos sua localização. Ative a localização do celular e tente de novo.");
  if (!Number.isFinite(prec) || prec > cfg.precisao_max_m) {
    return recusar(`Localização imprecisa (${Number.isFinite(prec) ? Math.round(prec) + " m" : "sem precisão"}). Ative a localização precisa e tente de novo perto da entrada.`);
  }
  if (dist > cfg.raio_m) return recusar(`Você está a ${dist} m do Ditado. Só dá para marcar a até ${cfg.raio_m} m.`);

  const alerta = !!(p.dispositivo && dispositivo && p.dispositivo !== dispositivo);
  const agora = new Date().toISOString();
  const mudar: Record<string, unknown> = { dispositivo: p.dispositivo || dispositivo, dispositivo_alerta: p.dispositivo_alerta || alerta };

  if (acao === "entrada") {
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(String(b.selfie || ""));
    if (!m) return recusar("Falta a selfie. Tire a foto e tente de novo.");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bytes.length < 5000 || bytes.length > 3_000_000) return recusar("Foto inválida. Tire outra.");
    const caminho = `${d.id}/entrada-${Date.now()}.jpg`;
    const up = await db.storage.from("extras-selfies").upload(caminho, bytes, { contentType: "image/jpeg", upsert: false });
    if (up.error) return recusar("Não deu para salvar a foto. Tente de novo.");
    Object.assign(mudar, { entrada_em: agora, entrada_lat: lat, entrada_lng: lng, entrada_precisao_m: prec, entrada_dist_m: dist, entrada_selfie: caminho });
  } else {
    Object.assign(mudar, { saida_em: agora, saida_lat: lat, saida_lng: lng, saida_precisao_m: prec, saida_dist_m: dist });
  }
  const { error } = await db.from("extras_ponto").update(mudar).eq("diaria_id", d.id);
  if (error) return recusar("Não deu para registrar. Tente de novo.");
  await registrar(true, alerta ? "outro celular" : null);
  const novo = await carregar(p.token);
  return json({ ok: true, ...resumo(novo!.p, novo!.d) });
});
