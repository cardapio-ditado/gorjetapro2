/**
 * Clube do Whisky: avisa o cliente pelo WhatsApp que a garrafa guardada vai
 * vencer (com 30 e com 7 dias). Roda todo dia pelo cron.
 *
 * Usa o mesmo número da Cloud API do agente (secret META_WA_TOKEN e os IDs em
 * agente_config). Mensagem para cliente fora da janela de 24 h precisa de
 * modelo aprovado pela Meta; o nome dele fica em agente_config.clube_modelo
 * (padrão "clube_whisky_vencimento"), com as variáveis {{1}} primeiro nome,
 * {{2}} garrafa, {{3}} quanto falta ("7 dias") e {{4}} a data.
 *
 *   POST ?acao=enviar     (padrão) manda os avisos do dia
 *   POST ?acao=modelo     cria o modelo na Meta (uma vez)
 *   POST ?acao=situacao   status do modelo
 *
 * Chamada protegida pelo mesmo x-agente-token do agente-whatsapp.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const VERSAO = "v21.0";
const MODELO_PADRAO = "clube_whisky_vencimento";

type ErroMeta = { code?: number; message?: string; error_data?: { details?: string } };
type Resposta<T> = T & { error?: ErroMeta };
interface ConfigMeta { token: string; phoneId: string; wabaId: string; modelo: string }
interface Devido { garrafa_id: string; tipo: "30d" | "7d"; nome: string; telefone: string; garrafa: string; validade: string; dias: number }

async function graph<T>(caminho: string, token: string, metodo: "GET" | "POST" = "GET", corpo?: unknown): Promise<Resposta<T>> {
  const r = await fetch(`https://graph.facebook.com/${VERSAO}/${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  return ((await r.json().catch(() => ({}))) ?? {}) as Resposta<T>;
}

const textoDoErro = (e?: ErroMeta) => (e ? [e.code, e.message, e.error_data?.details].filter(Boolean).join(" · ") : "erro desconhecido da Meta");

async function config(db: SupabaseClient): Promise<ConfigMeta> {
  const { data } = await db.from("agente_config").select("chave, valor").in("chave", ["meta_phone_number_id", "meta_waba_id", "clube_modelo"]);
  const v = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]));
  const c = { token: Deno.env.get("META_WA_TOKEN") ?? "", phoneId: String(v.meta_phone_number_id ?? ""), wabaId: String(v.meta_waba_id ?? ""),
    modelo: typeof v.clube_modelo === "string" && v.clube_modelo.trim() ? v.clube_modelo.trim() : MODELO_PADRAO };
  if (!c.token || !c.phoneId || !c.wabaId) throw new Error("WhatsApp da Meta não configurado (token ou IDs).");
  return c;
}

async function autorizado(db: SupabaseClient, req: Request): Promise<boolean> {
  const recebido = req.headers.get("x-agente-token");
  if (!recebido) return false;
  const { data } = await db.from("agente_config").select("valor").eq("chave", "token_teste").maybeSingle();
  return typeof data?.valor === "string" && data.valor === recebido;
}

async function criarModelo(c: ConfigMeta) {
  const r = await graph<{ id?: string; status?: string; category?: string }>(`${c.wabaId}/message_templates`, c.token, "POST", {
    name: c.modelo, language: "pt_BR", category: "UTILITY",
    components: [{
      type: "BODY",
      text: "Olá, {{1}}! Sua garrafa de {{2}} guardada no Clube do Whisky do Ditado Popular vence em {{3}}, no dia {{4}}. " +
        "Depois dessa data a garrafa fica para a casa. Esperamos você! 🥃",
      example: { body_text: [["Carlos", "Old Parr", "7 dias", "30/10/2026"]] },
    }],
  });
  if (r.error) throw new Error(`Meta: ${textoDoErro(r.error)}`);
  return { id: r.id, status: r.status, categoria: r.category };
}

async function statusModelo(c: ConfigMeta): Promise<{ name: string; status: string; category: string; language?: string } | null> {
  const r = await graph<{ data?: { name: string; status: string; category: string; language?: string }[] }>(
    `${c.wabaId}/message_templates?fields=name,status,category,language&name=${c.modelo}`, c.token);
  if (r.error) throw new Error(`Meta: ${textoDoErro(r.error)}`);
  // Mais de um idioma com o mesmo nome: vale o aprovado.
  const lista = (r.data ?? []).filter((m) => m.name === c.modelo);
  return lista.find((m) => m.status === "APPROVED") ?? lista[0] ?? null;
}

const nomeGarrafa = (s: string) =>
  s.replace(/\s+GF\b/i, "").replace(/\s{2,}/g, " ").trim().toLowerCase().replace(/(^|\s|\()\S/g, (x) => x.toUpperCase());

async function enviar(db: SupabaseClient, c: ConfigMeta) {
  const modelo = await statusModelo(c);
  if (modelo?.status !== "APPROVED") return { enviados: 0, falhas: 0, aguardando_modelo: modelo?.status ?? "inexistente" };

  const { data, error } = await db.rpc("fn_clube_whisky_avisos_devidos");
  if (error) throw error;
  const placar = { enviados: 0, falhas: 0, ignorados: 0 };
  for (const d of (data ?? []) as Devido[]) {
    // Reserva antes de mandar: duas execuções juntas não avisam duas vezes.
    const { data: atual } = await db.from("clube_whisky_avisos").select("id, status, tentativas")
      .eq("garrafa_id", d.garrafa_id).eq("tipo", d.tipo).maybeSingle();
    let avisoId: number;
    if (atual) {
      const { data: reservado } = await db.from("clube_whisky_avisos")
        .update({ status: "enviando", tentativas: atual.tentativas + 1, telefone: d.telefone, atualizado_em: new Date().toISOString() })
        .eq("id", atual.id).eq("status", "falha").select("id").maybeSingle();
      if (!reservado) { placar.ignorados++; continue; }
      avisoId = reservado.id;
    } else {
      const { data: novo, error: e } = await db.from("clube_whisky_avisos")
        .insert({ garrafa_id: d.garrafa_id, tipo: d.tipo, telefone: d.telefone }).select("id").single();
      if (e || !novo) { placar.ignorados++; continue; }
      avisoId = novo.id;
    }

    const prazo = d.dias <= 0 ? "hoje" : d.dias === 1 ? "1 dia" : `${d.dias} dias`;
    const dia = d.validade.split("-").reverse().join("/");
    const r = await graph<{ messages?: { id: string }[] }>(`${c.phoneId}/messages`, c.token, "POST", {
      messaging_product: "whatsapp", to: d.telefone, type: "template",
      template: {
        name: c.modelo, language: { code: modelo.language ?? "pt_BR" },
        components: [{ type: "body", parameters: [d.nome || "cliente", nomeGarrafa(d.garrafa), prazo, dia].map((text) => ({ type: "text", text })) }],
      },
    });
    const ok = !r.error && Boolean(r.messages?.[0]?.id);
    await db.from("clube_whisky_avisos").update({
      status: ok ? "enviado" : "falha", wa_id: r.messages?.[0]?.id ?? null, erro: ok ? null : textoDoErro(r.error),
      atualizado_em: new Date().toISOString(),
    }).eq("id", avisoId);
    await db.from("clube_whisky_historico").insert({
      garrafa_id: d.garrafa_id, tipo: "aviso", por_nome: "WhatsApp automático",
      texto: ok ? `Aviso de ${d.tipo === "30d" ? "30" : "7"} dias enviado (vence em ${prazo})` : `Aviso de ${d.tipo === "30d" ? "30" : "7"} dias falhou: ${textoDoErro(r.error)}`,
    });
    if (ok) placar.enviados++; else placar.falhas++;
  }
  return placar;
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  try {
    if (!(await autorizado(db, req))) return json({ erro: "não autorizado" }, 401);
    const acao = new URL(req.url).searchParams.get("acao") ?? "enviar";
    const c = await config(db);
    if (acao === "modelo") return json(await criarModelo(c));
    if (acao === "situacao") return json({ modelo: await statusModelo(c) });
    return json(await enviar(db, c));
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
