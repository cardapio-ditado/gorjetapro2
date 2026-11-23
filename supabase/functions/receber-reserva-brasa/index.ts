import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Recebe do Brasa Food a reserva que o agente de WhatsApp aprovou e a grava
 * na lista de reservas (`reservas_normais`).
 *
 * A ponte mora AQUI, no Gorjeta, de propósito: o Brasa Food é um produto
 * generalista e só sabe publicar webhooks — ele não conhece o Ditado. Tudo
 * que é peculiar desta casa fica do lado que é da casa.
 *
 * POR QUE NÃO O MAPA DE MESAS. A primeira versão escrevia em
 * `reservas_mesas`, escolhendo a menor mesa livre que coubesse. Na prática
 * isso jogava as pessoas em lugares aleatórios: quem pedia "perto do palco"
 * caía onde sobrou, porque a escolha não olhava a seção. Atender a
 * preferência de verdade exigiria adjacência de mesas, junção de mesas para
 * grupos grandes e um modelo do salão que o agente não tem como conhecer.
 *
 * A lista resolve sem nada disso: `local_bar` guarda a ÁREA que o cliente
 * pediu, e quem recebe escolhe a mesa daquela área na hora — que é a decisão
 * que uma pessoa toma melhor que um algoritmo, olhando o salão.
 *
 * PRÉ-RESERVA DO LINK (23/11/2026). A pré-reserva feita em ditado.org/reserva vai
 * para a Brasa (fila reservas_brasa_envios) e volta aqui aprovada, com
 * `source_channel: "link"` e `external_id` = id da pré-reserva. Nesse caso a
 * pré-reserva existente é ATUALIZADA (confirmada) em vez de virar outra linha.
 * A etiqueta brasa:<id> na observação impede que o aviso "confirmada" volte
 * para a Brasa (trg_reserva_brasa_enfileirar).
 *
 * Contrato do webhook (src/webhooks.ts do Brasa):
 * - POST com corpo { event, created_at, data }
 * - Assinado: header `x-webhook-signature: t=<unix>,v1=<hmac-sha256>`,
 *   onde o HMAC cobre `${t}.${corpo}` com o segredo compartilhado.
 * - 2xx encerra; 4xx NÃO é retentado; 5xx é retentado 5x com backoff.
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
      area_preference?: string | null;
      occasion?: string | null;
      notes?: string | null;
      source_channel?: string | null;
      external_id?: string | null;
    };
    source_channel?: string | null;
    external_id?: string | null;
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
  // virar segunda reserva. A etiqueta brasa:<id> na observação é a memória de
  // que esta reserva já entrou.
  const etiqueta = `brasa:${d.reservation_id}`;

  // Pré-reserva que saiu do link: confirma a linha que já existe.
  const canal = d.source_channel ?? evento.source_channel ?? null;
  const externo = d.external_id ?? evento.external_id ?? null;
  if (canal === "link" && externo && /^[0-9a-f-]{36}$/i.test(externo)) {
    const { data: pre, error: erroPre } = await supabase
      .from("reservas_normais")
      .select("id, situacao, observacoes")
      .eq("id", externo)
      .eq("origem", "link")
      .maybeSingle();
    if (erroPre) {
      console.error(`[brasa] falha ao ler a pré-reserva ${externo}: ${erroPre.message}`);
      return json({ error: erroPre.message }, 500);
    }
    if (pre) {
      if ((pre.observacoes ?? "").includes(etiqueta)) {
        return json({ registrada: true, ja_existia: true, reserva: pre.id });
      }
      if (pre.situacao === "recusada") {
        // A equipe recusou no Ditado: a aprovação da Brasa não desfaz isso sozinha.
        console.error(`[brasa] reserva ${d.reservation_id} aprovada na Brasa, mas a pré-reserva ${pre.id} foi recusada no Ditado`);
        return json({ registrada: false, motivo: "recusada_no_ditado", reserva: pre.id });
      }
      const obs = [
        pre.observacoes,
        "Confirmada pela Brasa (WhatsApp)",
        d.occasion ? `Ocasião: ${d.occasion}` : null,
        d.notes ? `Obs: ${d.notes}` : null,
        etiqueta,
      ]
        .filter(Boolean)
        .join(" · ");
      const { error: erroUp } = await supabase
        .from("reservas_normais")
        .update({ situacao: "confirmada", observacoes: obs, atualizado_em: new Date().toISOString() })
        .eq("id", pre.id);
      if (erroUp) {
        console.error(`[brasa] falha ao confirmar a pré-reserva ${pre.id}: ${erroUp.message}`);
        return json({ error: erroUp.message }, 500);
      }
      return json({ registrada: true, atualizada: true, reserva: pre.id, situacao: "confirmada" });
    }
    // Não achou a pré-reserva: segue e cria a reserva, para não perder.
    console.error(`[brasa] external_id ${externo} sem pré-reserva no Ditado; criando como reserva da equipe`);
  }
  const { data: existente } = await supabase
    .from("reservas_normais")
    .select("id")
    .ilike("observacoes", `%${etiqueta}%`)
    .limit(1);
  if (existente && existente.length > 0) {
    return json({ registrada: true, ja_existia: true });
  }

  const local = areaDoBar(d.area_preference);

  const observacoes = [
    "Reserva pelo WhatsApp (Brasa Food)",
    d.occasion ? `Ocasião: ${d.occasion}` : null,
    d.notes ? `Obs: ${d.notes}` : null,
    etiqueta,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error } = await supabase.from("reservas_normais").insert({
    nome_cliente: d.customer_name,
    telefone_cliente: d.customer_phone ?? "",
    data_reserva: dataReserva,
    horario,
    numero_pessoas: d.party_size,
    local_bar: local,
    observacoes,
  });

  if (error) {
    console.error(`[brasa] falha ao inserir reserva ${d.reservation_id}: ${error.message}`);
    // 500: isto sim vale retentativa — pode ser instabilidade passageira.
    return json({ error: error.message }, 500);
  }

  return json({
    registrada: true,
    data: dataReserva,
    horario,
    local_bar: local,
  });
});

/**
 * A área do bar que o cliente pediu.
 *
 * Vem PRONTA do Brasa: a ferramenta de reserva do agente tem um campo `area`
 * dedicado ("varanda, salão, área externa, mesa perto do palco"), que viaja
 * no webhook como `area_preference`. A primeira versão desta função vasculhava
 * as observações com expressão regular procurando "perto de..." — adivinhação
 * desnecessária, com a informação chegando estruturada ao lado.
 *
 * `local_bar` é texto livre e a lista mostra o valor cru, então o pedido vai
 * ESCRITO do jeito que a pessoa falou. Só há uma normalização: quando o
 * pedido é uma das áreas que a casa já usa no formulário, vale o valor
 * canônico — assim o que veio do WhatsApp e o que foi digitado à mão
 * aparecem iguais na lista, em vez de "Varanda" e "varanda" convivendo.
 */
function areaDoBar(area?: string | null): string {
  const pedido = (area ?? "").trim().replace(/\s+/g, " ");
  // Sem preferência: o padrão do formulário. Inventar uma área aqui mandaria
  // alguém para a varanda sem ninguém ter pedido.
  if (!pedido) return "interna";

  const texto = pedido
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Ordem importa: "área interna" contém "interna", e mezanino é o termo
  // mais específico da casa.
  if (/\bmezanino\b/.test(texto)) return "mezanino";
  if (/\bvaranda\b/.test(texto)) return "varanda";
  if (/\bdeck\b/.test(texto)) return "deck";
  if (/\binterna?\b|\bdentro\b|\bsalao\b/.test(texto)) return "interna";

  // Qualquer outro lugar — "perto do palco", "longe da caixa de som" — vai
  // como veio. É o que diz ao anfitrião o que fazer.
  return pedido.toLowerCase();
}

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
