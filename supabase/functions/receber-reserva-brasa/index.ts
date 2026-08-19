import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Recebe do Brasa Food a reserva que o agente de WhatsApp aprovou e a coloca
 * no mapa de mesas (`reservas_mesas`).
 *
 * A ponte mora AQUI, no Gorjeta, de propósito: o Brasa Food é um produto
 * generalista e só sabe publicar webhooks — ele não conhece o Ditado. Tudo que
 * é peculiar desta casa (mapa de mesas, regra de bloqueio por dia, escolha de
 * mesa) fica do lado que é da casa. Se um dia a ponte mudar, o produto não
 * sofre.
 *
 * Contrato do webhook (src/webhooks.ts do Brasa):
 * - POST com corpo { event, created_at, data }
 * - Assinado: header `x-webhook-signature: t=<unix>,v1=<hmac-sha256>`,
 *   onde o HMAC cobre `${t}.${corpo}` com o segredo compartilhado.
 * - 2xx encerra; 4xx NÃO é retentado; 5xx é retentado 5x com backoff.
 *   Por isso este handler devolve 200 mesmo quando decide não registrar
 *   (mesa nenhuma livre): repetir a entrega não libera mesa.
 *
 * Regra de conflito copiada de MapaMesasPublico.tsx: "sem giro de mesas —
 * qualquer reserva no dia bloqueia a mesa". A escolha respeita isso.
 */

const FUSO = "America/Cuiaba";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Somente POST." }, 405);
  }

  const segredo = Deno.env.get("BRASA_WEBHOOK_SECRET");
  if (!segredo) {
    // 500 (retentável): configuração pode ser corrigida entre as tentativas.
    return json({ error: "BRASA_WEBHOOK_SECRET não configurado." }, 500);
  }

  const corpo = await req.text();

  // Sem assinatura válida, nada entra: a tabela de reservas alimenta a
  // operação do salão, e este endpoint é público na internet.
  const veredicto = await conferirAssinatura(
    req.headers.get("x-webhook-signature"),
    corpo,
    segredo,
  );
  if (veredicto !== "ok") {
    return json({ error: veredicto }, 401);
  }

  let evento: {
    event?: string;
    data?: {
      reservation_id?: string;
      customer_name?: string;
      customer_phone?: string;
      party_size?: number;
      reserved_for?: string;
      occasion?: string | null;
      notes?: string | null;
    };
  };
  try {
    evento = JSON.parse(corpo);
  } catch {
    return json({ error: "Corpo não é JSON." }, 400);
  }

  // O webhook pode estar inscrito em mais eventos no futuro; os que não são
  // aprovação saem com 200 para o Brasa não ficar retentando algo ignorado.
  if (evento.event !== "reservation.approved") {
    return json({ registrada: false, motivo: "evento_ignorado" });
  }

  const d = evento.data ?? {};
  if (!d.reservation_id || !d.customer_name || !d.reserved_for || !d.party_size) {
    return json({ error: "Payload sem os campos da reserva." }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // A data e a hora no relógio da casa. `reserved_for` vem em UTC, e depois
  // das 20h de Cuiabá já é o dia seguinte em UTC — sem a conversão, toda
  // reserva do fim da noite cairia no mapa do dia errado.
  const quando = new Date(d.reserved_for);
  const dataReserva = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(quando);
  const horario = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(quando);

  // Idempotência: o Brasa retenta entregas, e a segunda tentativa não pode
  // virar segunda mesa reservada. A etiqueta brasa:<id> na observação é a
  // memória de que esta reserva já entrou.
  const etiqueta = `brasa:${d.reservation_id}`;
  const { data: existente } = await supabase
    .from("reservas_mesas")
    .select("id, mesa_id")
    .ilike("observacoes", `%${etiqueta}%`)
    .neq("status", "cancelada")
    .limit(1);
  if (existente && existente.length > 0) {
    return json({ registrada: true, ja_existia: true });
  }

  const [{ data: mesas }, { data: reservasDoDia }] = await Promise.all([
    supabase.from("mesas").select("id, numero, nome, capacidade").eq("ativo", true),
    supabase
      .from("reservas_mesas")
      .select("mesa_id")
      .eq("data_reserva", dataReserva)
      .neq("status", "cancelada"),
  ]);

  const ocupadas = new Set((reservasDoDia ?? []).map((r) => r.mesa_id));
  const livres = (mesas ?? []).filter((m) => !ocupadas.has(m.id));

  if (livres.length === 0) {
    // 200 de propósito: retentar não libera mesa. O registro fica no log da
    // função, e a divergência aparece na conferência (reserva no Brasa sem
    // mesa no mapa).
    console.error(
      `[brasa] sem mesa livre em ${dataReserva} para ${d.customer_name} (${d.party_size}p) — reserva ${d.reservation_id} NÃO entrou no mapa`,
    );
    return json({ registrada: false, motivo: "sem_mesa_livre" });
  }

  // A menor mesa que comporta o grupo — reserva de 2 não gasta a mesa de 8.
  // Se nenhuma comporta, vai para a maior livre com aviso: mesa apertada com
  // nota é resolvível na hora; reserva invisível no mapa não é.
  const porCapacidade = [...livres].sort((a, b) => a.capacidade - b.capacidade);
  const mesa =
    porCapacidade.find((m) => m.capacidade >= (d.party_size ?? 0)) ??
    porCapacidade[porCapacidade.length - 1];
  const apertada = mesa.capacidade < (d.party_size ?? 0);

  const observacoes = [
    "Reserva pelo WhatsApp (Brasa Food)",
    d.occasion ? `Ocasião: ${d.occasion}` : null,
    d.notes ? `Obs: ${d.notes}` : null,
    apertada ? `⚠ Grupo de ${d.party_size} numa mesa de ${mesa.capacidade} — juntar mesas` : null,
    etiqueta,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error } = await supabase.from("reservas_mesas").insert({
    mesa_id: mesa.id,
    nome_cliente: d.customer_name,
    telefone: d.customer_phone ?? null,
    data_reserva: dataReserva,
    horario,
    numero_pessoas: d.party_size,
    status: "confirmada",
    observacoes,
  });

  if (error) {
    console.error(`[brasa] falha ao inserir reserva ${d.reservation_id}: ${error.message}`);
    // 500: isto sim vale retentativa — pode ser instabilidade passageira.
    return json({ error: error.message }, 500);
  }

  return json({
    registrada: true,
    mesa: mesa.nome || mesa.numero,
    data: dataReserva,
    horario,
    aviso: apertada ? "grupo maior que a mesa" : null,
  });
});

/**
 * Confere a assinatura HMAC do Brasa.
 *
 * O timestamp entra no conteúdo assinado e tem validade de 5 minutos: uma
 * entrega capturada não pode ser reenviada amanhã para encher o mapa de
 * reservas falsas.
 */
async function conferirAssinatura(
  cabecalho: string | null,
  corpo: string,
  segredo: string,
): Promise<"ok" | string> {
  if (!cabecalho) return "Sem assinatura.";

  const partes = Object.fromEntries(
    cabecalho.split(",").map((p) => p.split("=") as [string, string]),
  );
  const t = parseInt(partes.t ?? "", 10);
  const recebida = partes.v1 ?? "";
  if (!Number.isFinite(t) || !recebida) return "Assinatura malformada.";

  if (Math.abs(Date.now() / 1000 - t) > 300) return "Assinatura expirada.";

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${t}.${corpo}`));
  const esperada = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Comparação de tamanho constante: igualdade de string vaza, pelo tempo de
  // resposta, quantos caracteres do palpite estavam certos.
  if (recebida.length !== esperada.length) return "Assinatura inválida.";
  let diferente = 0;
  for (let i = 0; i < esperada.length; i++) {
    diferente |= recebida.charCodeAt(i) ^ esperada.charCodeAt(i);
  }
  return diferente === 0 ? "ok" : "Assinatura inválida.";
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
