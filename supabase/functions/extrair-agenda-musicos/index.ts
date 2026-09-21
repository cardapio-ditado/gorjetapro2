import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsIA as corsHeaders, extrairJson, normalizarAnexo } from "../_shared/ia.ts";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SCHEMA_AGENDA = {
  type: "object",
  properties: {
    mes_referencia: {
      type: ["string", "null"],
      description: 'Mês e ano da agenda no formato YYYY-MM, se o documento disser. Ex.: "2026-10"',
    },
    apresentacoes: {
      type: "array",
      description: "Uma entrada por apresentação, na ordem em que aparecem no documento",
      items: {
        type: "object",
        properties: {
          nome: {
            type: "string",
            description:
              "Nome do músico, banda ou atração exatamente como está escrito no documento",
          },
          nome_cadastrado: {
            type: "string",
            description:
              "Se este artista estiver na lista de ARTISTAS JÁ CADASTRADOS, repita aqui o nome EXATO daquela lista. Se não estiver, deixe vazio.",
          },
          data_evento: {
            type: "string",
            description: "Data da apresentação no formato YYYY-MM-DD",
          },
          horario_inicio: {
            type: ["string", "null"],
            description: 'Horário de início no formato HH:MM, 24 horas. Ex.: "20:30"',
          },
          horario_fim: {
            type: ["string", "null"],
            description: "Horário de término no formato HH:MM, se o documento disser",
          },
          valor: {
            type: ["number", "null"],
            description: "Cachê em reais, se o documento disser. Apenas o número.",
          },
          observacoes: {
            type: ["string", "null"],
            description:
              "Qualquer informação extra da linha: formato do show, sertanejo, samba, aniversário, etc.",
          },
          confianca: {
            type: "number",
            description: "De 0 a 1, o quanto você confia na leitura desta linha",
          },
        },
        required: ["nome", "nome_cadastrado", "data_evento", "confianca"],
      },
    },
    observacoes_gerais: {
      type: ["string", "null"],
      description: "Algo relevante do documento que não cabe em uma linha",
    },
  },
  required: ["apresentacoes"],
};

interface Apresentacao {
  nome: string;
  nome_cadastrado: string;
  data_evento: string;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  valor?: number | null;
  observacoes?: string | null;
  confianca: number;
}

function normalizar(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface Conhecido {
  nome: string;
  contato: string | null;
  valor: number | null;
  fornecedor_id: string | null;
  ultima_data: string | null;
  apresentacoes: number;
}

/** Artistas que já tocaram na casa, com o último cachê pago. */
async function carregarConhecidos(supabase: any): Promise<Conhecido[]> {
  const { data, error } = await supabase
    .from("musicos")
    .select("nome, contato, valor, fornecedor_id, data_evento")
    .not("nome", "is", null)
    .order("data_evento", { ascending: false })
    .limit(600);

  if (error) {
    console.error("Erro ao buscar músicos:", error);
    return [];
  }

  const porNome = new Map<string, Conhecido>();

  for (const linha of data || []) {
    const chave = normalizar(linha.nome);
    if (!chave) continue;

    const atual = porNome.get(chave);
    if (atual) {
      atual.apresentacoes += 1;
      if (!atual.contato && linha.contato) atual.contato = linha.contato;
      if (!atual.fornecedor_id && linha.fornecedor_id) atual.fornecedor_id = linha.fornecedor_id;
      continue;
    }

    porNome.set(chave, {
      nome: linha.nome,
      contato: linha.contato ?? null,
      valor: linha.valor != null ? Number(linha.valor) : null,
      fornecedor_id: linha.fornecedor_id ?? null,
      ultima_data: linha.data_evento ?? null,
      apresentacoes: 1,
    });
  }

  return Array.from(porNome.values());
}

function acharConhecido(nome: string, conhecidos: Conhecido[]): Conhecido | null {
  const alvo = normalizar(nome);
  if (!alvo) return null;

  const exato = conhecidos.find((c) => normalizar(c.nome) === alvo);
  if (exato) return exato;

  const contido = conhecidos.find((c) => {
    const n = normalizar(c.nome);
    return n.length >= 4 && (n.includes(alvo) || alvo.includes(n));
  });

  return contido ?? null;
}

function horaValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function dataValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${valor}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : valor;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new Error("Método não permitido");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const referencia = (formData.get("referencia") as string | null)?.trim() || "";

    if (!file) {
      throw new Error("Nenhum arquivo enviado");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const tiposAceitos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!tiposAceitos.includes(file.type)) {
      throw new Error(`Formato não suportado: ${file.type}. Use foto (JPG, PNG) ou PDF.`);
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const CHUNK = 0x8000;
    let binario = "";
    for (let i = 0; i < buffer.length; i += CHUNK) {
      binario += String.fromCharCode.apply(
        null,
        Array.from(buffer.subarray(i, Math.min(i + CHUNK, buffer.length))),
      );
    }
    const base64 = btoa(binario);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const conhecidos = await carregarConhecidos(supabase);
    console.log(`${conhecidos.length} artistas já cadastrados`);

    const listaConhecidos = conhecidos
      .slice(0, 150)
      .map((c) => c.nome)
      .join("\n");

    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Cuiaba" });

    const { dados, uso } = await extrairJson<{
      mes_referencia?: string | null;
      apresentacoes: Apresentacao[];
      observacoes_gerais?: string | null;
    }>({
      nome: "registrar_agenda_musicos",
      descricao: "Registra as apresentações musicais lidas na agenda.",
      schema: SCHEMA_AGENDA,
      esforco: "high",
      anexos: [normalizarAnexo(base64, file.type)],
      system: `Você lê agendas de shows de um bar e restaurante e transforma em lançamentos.

COMO LER:
- Cada apresentação vira UMA entrada, mesmo que o mesmo artista toque em vários dias.
- Se um dia tem duas atrações, são duas entradas na mesma data.
- Leia TODAS as linhas do documento, inclusive as que estão em rodapé ou lateral.
- Nomes de artista costumam vir em destaque. Não confunda o nome do bar, o nome do mês
  ou o dia da semana com nome de artista.

DATAS:
- Hoje é ${hoje}. Devolva sempre a data completa no formato YYYY-MM-DD.
- Se o documento mostrar só o dia e o dia da semana, use o mês e o ano do título do
  documento.${referencia ? `\n- Se o documento não disser o mês, use ${referencia}.` : ""}
- Confira o dia da semana: se o documento diz "SEX 10", a data que você devolver
  precisa mesmo cair numa sexta-feira. Se não bater, prefira o dia da semana escrito.
- Nunca invente uma data com mais de 12 meses de distância de hoje.

HORÁRIOS E VALORES:
- Horário no formato 24 horas, HH:MM. "21h" vira "21:00" e "19h30" vira "19:30".
- Valor é o cachê em reais, apenas o número. "R$ 1.200,00" vira 1200. Se o documento
  não trouxer valor, deixe null, não chute.

ARTISTAS JÁ CADASTRADOS NA CASA:
Se o artista da agenda for um destes, copie o nome EXATO da lista no campo
nome_cadastrado. Considere abreviações e apelidos (ex.: "Cia do Samba" e
"Companhia do Samba" são o mesmo). Na dúvida, deixe nome_cadastrado vazio.

${listaConhecidos || "(nenhum artista cadastrado ainda)"}`,
      prompt: `Leia esta agenda de shows e devolva todas as apresentações que encontrar.

Não pule nenhuma linha e não repita nenhuma. Se alguma informação estiver ilegível,
baixe a confiança daquela linha em vez de inventar.`,
    });

    const brutas = Array.isArray(dados.apresentacoes) ? dados.apresentacoes : [];

    // Datas que a IA devolveu, para conferir o que já está lançado
    const datas = Array.from(
      new Set(brutas.map((a) => dataValida(a.data_evento)).filter((d): d is string => !!d)),
    );

    let jaLancados: Array<{ id: string; nome: string; data_evento: string }> = [];
    if (datas.length > 0) {
      const inicio = datas.slice().sort()[0];
      const fim = datas.slice().sort()[datas.length - 1];
      const { data } = await supabase
        .from("musicos")
        .select("id, nome, data_evento")
        .gte("data_evento", inicio)
        .lte("data_evento", `${fim} 23:59:59`);
      jaLancados = data || [];
    }

    const apresentacoes = brutas
      .map((a) => {
        const data = dataValida(a.data_evento);
        if (!data || !a.nome) return null;

        const conhecido =
          (a.nome_cadastrado && acharConhecido(a.nome_cadastrado, conhecidos)) ||
          acharConhecido(a.nome, conhecidos);

        const duplicado = jaLancados.find(
          (m) =>
            String(m.data_evento).slice(0, 10) === data &&
            normalizar(m.nome) === normalizar(conhecido?.nome ?? a.nome),
        );

        return {
          nome: conhecido?.nome ?? a.nome.trim(),
          nome_lido: a.nome.trim(),
          data_evento: data,
          horario_inicio: horaValida(a.horario_inicio),
          horario_fim: horaValida(a.horario_fim),
          valor: typeof a.valor === "number" && a.valor > 0 ? a.valor : null,
          valor_historico: conhecido?.valor ?? null,
          contato: conhecido?.contato ?? null,
          fornecedor_id: conhecido?.fornecedor_id ?? null,
          observacoes: a.observacoes ?? null,
          confianca: typeof a.confianca === "number" ? a.confianca : 0.5,
          ja_cadastrado: !!conhecido,
          apresentacoes_anteriores: conhecido?.apresentacoes ?? 0,
          ja_lancado: !!duplicado,
          musico_id_existente: duplicado?.id ?? null,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => a.data_evento.localeCompare(b.data_evento));

    console.log(
      `${apresentacoes.length} apresentações lidas, ${apresentacoes.filter((a) => a.ja_lancado).length} já lançadas`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        mes_referencia: dados.mes_referencia ?? null,
        observacoes_gerais: dados.observacoes_gerais ?? null,
        apresentacoes,
        arquivo: { nome: file.name, tamanho: file.size, tipo: file.type },
        meta: {
          modelo: uso.modelo,
          tokens: uso.tokens_total,
          custo_usd: uso.custo_usd,
          tempo_ms: uso.tempo_ms,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Erro ao ler agenda de músicos:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
