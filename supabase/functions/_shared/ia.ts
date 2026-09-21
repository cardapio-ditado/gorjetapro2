/**
 * Camada única de IA do sistema.
 *
 * Todas as funções de IA passam por aqui. Regras:
 *   - o provedor é a Anthropic (Claude), com uma exceção: a transcrição de
 *     áudio da entrevista continua na OpenAI (Whisper), porque o Claude não
 *     lê áudio;
 *   - a chave vive só em variável de ambiente (ANTHROPIC_API_KEY), nunca no
 *     banco e nunca no código;
 *   - o modelo é configurável sem mexer no código, por ANTHROPIC_MODEL ou
 *     pela chave `ia_modelo` em configuracoes_sistema.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";

export type Esforco = "low" | "medium" | "high" | "xhigh" | "max";

/** Modelo padrão. Trocar aqui (ou na env ANTHROPIC_MODEL) muda todo o sistema. */
export const MODELO_PADRAO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5";

/** Preço por milhão de tokens, para estimar o custo de cada chamada. */
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-opus-4-8": { entrada: 5, saida: 25 },
  "claude-sonnet-5": { entrada: 2, saida: 10 },
  "claude-haiku-4-5": { entrada: 1, saida: 5 },
  "claude-fable-5-1": { entrada: 10, saida: 50 },
};

/** Modelos que não aceitam tool_choice forçado; neles usamos "auto". */
function aceitaFerramentaForcada(modelo: string): boolean {
  return !/^claude-(fable|mythos)/.test(modelo);
}

const IMAGENS_SUPORTADAS = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export interface Anexo {
  /** Conteúdo em base64, sem o prefixo `data:...;base64,`. */
  base64: string;
  mimeType: string;
}

export interface PedidoIA {
  /** Instrução de sistema: quem a IA é e o que ela deve fazer. */
  system: string;
  /** Mensagem do usuário desta chamada. */
  prompt: string;
  /** Imagens e PDFs enviados junto com o prompt. */
  anexos?: Anexo[];
  /** Histórico de conversa, para os chats. */
  historico?: Anthropic.MessageParam[];
  maxTokens?: number;
  esforco?: Esforco;
  modelo?: string;
}

export interface Uso {
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total: number;
  custo_usd: number;
  tempo_ms: number;
}

export interface RespostaIA<T> {
  dados: T;
  uso: Uso;
}

export class ErroIA extends Error {
  constructor(message: string, readonly causa?: unknown) {
    super(message);
    this.name = "ErroIA";
  }
}

function cliente(): Anthropic {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new ErroIA(
      "A chave da Anthropic não está configurada. Defina o secret ANTHROPIC_API_KEY nas Edge Functions do Supabase.",
    );
  }
  return new Anthropic({ apiKey, maxRetries: 3 });
}

/** Aceita tanto base64 puro quanto data URL (`data:image/png;base64,...`). */
export function normalizarAnexo(conteudo: string, mimeType: string): Anexo {
  const m = conteudo.match(/^data:([^;]+);base64,(.*)$/s);
  if (m) return { base64: m[2], mimeType: m[1] };
  return { base64: conteudo, mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType };
}

function blocosDoAnexo(anexo: Anexo): Anthropic.ContentBlockParam {
  const tipo = anexo.mimeType === "image/jpg" ? "image/jpeg" : anexo.mimeType;

  if (tipo === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: anexo.base64 },
    };
  }

  if (!IMAGENS_SUPORTADAS.includes(tipo)) {
    throw new ErroIA(`Tipo de arquivo não suportado pela IA: ${tipo}`);
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: tipo as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: anexo.base64,
    },
  };
}

function montarMensagens(p: PedidoIA): Anthropic.MessageParam[] {
  const conteudo: Anthropic.ContentBlockParam[] = [];
  for (const anexo of p.anexos ?? []) conteudo.push(blocosDoAnexo(anexo));
  conteudo.push({ type: "text", text: p.prompt });
  return [...(p.historico ?? []), { role: "user", content: conteudo }];
}

function medirUso(modelo: string, usage: Anthropic.Usage, inicio: number): Uso {
  const entrada = (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
  const saida = usage.output_tokens ?? 0;
  const preco = PRECOS[modelo];
  const custo = preco ? (entrada / 1e6) * preco.entrada + (saida / 1e6) * preco.saida : 0;
  return {
    modelo,
    tokens_entrada: entrada,
    tokens_saida: saida,
    tokens_total: entrada + saida,
    custo_usd: Number(custo.toFixed(6)),
    tempo_ms: Date.now() - inicio,
  };
}

function conferirParada(msg: Anthropic.Message) {
  if (msg.stop_reason === "refusal") {
    throw new ErroIA(
      "A IA recusou a solicitação por política de segurança. Revise o conteúdo enviado.",
    );
  }
  if (msg.stop_reason === "max_tokens") {
    throw new ErroIA(
      "A resposta da IA foi cortada por tamanho. Envie um documento menor ou divida a tarefa.",
    );
  }
}

/**
 * Resposta em texto livre (chats, análises redigidas).
 */
export async function responderTexto(p: PedidoIA): Promise<RespostaIA<string>> {
  const inicio = Date.now();
  const modelo = p.modelo ?? MODELO_PADRAO;

  let msg: Anthropic.Message;
  try {
    const stream = cliente().messages.stream({
      model: modelo,
      max_tokens: p.maxTokens ?? 8000,
      system: p.system,
      thinking: { type: "adaptive" },
      output_config: { effort: p.esforco ?? "medium" },
      messages: montarMensagens(p),
    });
    msg = await stream.finalMessage();
  } catch (erro) {
    throw traduzirErro(erro);
  }

  conferirParada(msg);

  const texto = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!texto) throw new ErroIA("A IA não devolveu texto.");

  return { dados: texto, uso: medirUso(modelo, msg.usage, inicio) };
}

export interface PedidoJson extends PedidoIA {
  /** Nome curto da extração, em snake_case. Ex.: "registrar_nota". */
  nome: string;
  /** O que a IA deve devolver, em uma frase. */
  descricao: string;
  /** JSON Schema do objeto de resposta. */
  schema: Record<string, unknown>;
}

/**
 * Resposta em JSON, com o formato garantido por uma ferramenta.
 *
 * A IA é obrigada a responder chamando a ferramenta, então o retorno é sempre
 * um objeto JSON válido no formato do schema — nunca texto solto para dar
 * `JSON.parse` e torcer.
 */
export async function extrairJson<T>(p: PedidoJson): Promise<RespostaIA<T>> {
  const inicio = Date.now();
  const modelo = p.modelo ?? MODELO_PADRAO;

  const ferramenta: Anthropic.Tool = {
    name: p.nome,
    description: p.descricao,
    input_schema: p.schema as Anthropic.Tool.InputSchema,
  };

  let msg: Anthropic.Message;
  try {
    const stream = cliente().messages.stream({
      model: modelo,
      max_tokens: p.maxTokens ?? 16000,
      system: `${p.system}\n\nResponda sempre chamando a ferramenta "${p.nome}". Não escreva texto fora dela.`,
      thinking: { type: "adaptive" },
      output_config: { effort: p.esforco ?? "medium" },
      tools: [ferramenta],
      tool_choice: aceitaFerramentaForcada(modelo)
        ? { type: "tool", name: p.nome }
        : { type: "auto" },
      messages: montarMensagens(p),
    });
    msg = await stream.finalMessage();
  } catch (erro) {
    throw traduzirErro(erro);
  }

  conferirParada(msg);

  const bloco = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === p.nome,
  );

  if (!bloco) {
    throw new ErroIA("A IA não devolveu os dados no formato esperado.");
  }

  return { dados: bloco.input as T, uso: medirUso(modelo, msg.usage, inicio) };
}

function traduzirErro(erro: unknown): ErroIA {
  if (erro instanceof ErroIA) return erro;

  if (erro instanceof Anthropic.AuthenticationError) {
    return new ErroIA("A chave da Anthropic é inválida ou expirou.", erro);
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return new ErroIA("Muitas chamadas de IA ao mesmo tempo. Tente de novo em alguns segundos.", erro);
  }
  if (erro instanceof Anthropic.BadRequestError) {
    return new ErroIA(`A IA recusou o pedido: ${erro.message}`, erro);
  }
  if (erro instanceof Anthropic.APIError) {
    return new ErroIA(`Erro da IA (${erro.status ?? "sem status"}): ${erro.message}`, erro);
  }

  return new ErroIA(erro instanceof Error ? erro.message : "Erro desconhecido na IA.", erro);
}

/**
 * Modelo definido em configuracoes_sistema (chave `ia_modelo`), se houver.
 * Serve para o gestor trocar o modelo pela tela de configurações, sem deploy.
 */
export async function modeloConfigurado(
  supabase: { from: (t: string) => any },
): Promise<string> {
  try {
    const { data } = await supabase
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", "ia_modelo")
      .maybeSingle();
    const valor = (data?.valor ?? "").trim();
    return valor || MODELO_PADRAO;
  } catch {
    return MODELO_PADRAO;
  }
}

/** Cabeçalhos CORS usados por todas as funções de IA. */
export const corsIA = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
