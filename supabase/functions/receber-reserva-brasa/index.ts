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
  // virar segunda reserva. A etiqueta brasa:<id> na observação é a memória de
  // que esta reserva já entrou.
  const etiqueta = `brasa:${d.reservation_id}`;
  const { data: existente } = await supabase
    .from("reservas_normais")
    .select("id")
    .ilike("observacoes", `%${etiqueta}%`)
    .limit(1);
  if (existente && existente.length > 0) {
    return json({ registrada: true, ja_existia: true });
  }

  const local = areaDoBar(d.notes);

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
 * A área do bar que o cliente pediu, a partir do que ele disse.
 *
 * O agente já pergunta a preferência no atendimento, e a resposta chega em
 * texto livre nas observações.
 *
 * `local_bar` é texto livre, e a lista mostra o valor cru — as cinco opções
 * do formulário são conveniência de quem digita, não uma restrição. Então o
 * pedido que não é nenhuma delas vale mais ESCRITO do que reduzido a
 * "outros": "perto do palco" diz ao anfitrião exatamente o que fazer;
 * "outros" o obriga a ir ler as observações.
 *
 * Quando o pedido É uma das opções conhecidas, usa o valor canônico — assim
 * o filtro e o formulário continuam batendo com o que já existe na casa.
 */
function areaDoBar(notas?: string | null): string {
  const original = (notas ?? "").trim();
  const texto = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!texto) return "interna";

  // 1. As áreas que a casa já tem cadastradas. Ordem importa: "área interna"
  //    contém "interna", e mezanino é o termo mais específico.
  if (/\bmezanino\b/.test(texto)) return "mezanino";
  if (/\bvaranda\b/.test(texto)) return "varanda";
  if (/\bdeck\b/.test(texto)) return "deck";
  if (/\binterna?\b|\bdentro\b|\bsalao\b/.test(texto)) return "interna";

  // 2. Um lugar que a casa não tem como opção: vai escrito, do jeito que a
  //    pessoa pediu. Recorta só o trecho do lugar — a observação inteira
  //    ("aniversário da esposa, quer perto do palco") encheria a coluna e
  //    esconderia o que importa.
  const pedido = original.match(
    /\b(perto|pr[óo]ximo|pertinho|de frente|ao lado|longe|em frente)\b[^.,;!?\n]{0,32}/i,
  );
  if (pedido) {
    return pedido[0].trim().replace(/\s+/g, " ").toLowerCase();
  }

  // 3. Falou de outra coisa (ocasião, aniversário) e não pediu lugar: o
  //    padrão do formulário. Chutar uma área aqui mandaria alguém para a
  //    varanda por causa de uma palavra solta.
  return "interna";
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
