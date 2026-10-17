/**
 * Leitor de notas: o Gemini transcreve a foto (ou PDF) e a leitura é conferida
 * aqui antes de ir para o agente. O agente passa a receber texto em vez da
 * imagem, o que corta o custo de cada rodada de ferramentas.
 *
 * Testado com as notas reais da casa: o gemini-3.8-flash acertou todas as
 * linhas, inclusive uma rasurada que os modelos menores erraram.
 *
 * Se o Gemini falhar (sem crédito, fora do ar, demora) ou a leitura não fechar
 * nas contas, devolve ok=false e a foto segue para o Claude como antes.
 */

export interface LinhaNota {
  descricao: string;
  quantidade: number;
  unidade?: string;
  valor_unitario: number;
  valor_total: number;
}

export interface NotaLida {
  tipo_documento?: string;
  fornecedor?: string;
  cnpj?: string;
  numero?: string;
  data?: string;
  linhas: LinhaNota[];
  desconto?: number;
  total?: number;
  legivel?: string;
  duvidas?: string;
}

export interface Leitura {
  leitor: string;
  ok: boolean;
  motivo?: string;
  nota?: NotaLida;
  uso?: { entrada?: number; saida?: number };
  ms: number;
}

const PROMPT = `Transcreva esta nota, cupom ou pedido de compra de um bar e restaurante.
Responda só com JSON, sem texto antes ou depois, neste formato:
{"tipo_documento": "", "fornecedor": "", "cnpj": "", "numero": "", "data": "AAAA-MM-DD",
 "linhas": [{"descricao": "", "quantidade": 0, "unidade": "", "valor_unitario": 0, "valor_total": 0}],
 "desconto": 0, "total": 0, "legivel": "sim|parcial|nao", "duvidas": ""}
Copie cada descrição como está escrita. Não invente: o que não der para ler fica vazio e vai em "duvidas".
Se a imagem não for um documento de compra, deixe "linhas" vazio e diga o que é em "tipo_documento".`;

const TEMPO_MAX = 45_000;

/** Confere a leitura. Devolve o problema encontrado, ou null se fechou. */
export function conferir(n: NotaLida | null | undefined): string | null {
  if (!n || !Array.isArray(n.linhas) || !n.linhas.length) return "sem linhas de compra";
  if (n.legivel === "nao") return "ilegível";
  let soma = 0;
  for (const l of n.linhas) {
    const q = Number(l.quantidade), vu = Number(l.valor_unitario), vt = Number(l.valor_total);
    if (!(q > 0) || !(vu > 0) || !(vt > 0)) return `linha incompleta: ${l.descricao}`;
    // Peso com 3 casas arredonda poucos centavos. Mais que isso é leitura errada.
    if (Math.abs(q * vu - vt) > 0.02 + 0.0006 * vu) return `linha não fecha: ${l.descricao}`;
    soma += vt;
  }
  const total = Number(n.total) || 0;
  const desconto = Number(n.desconto) || 0;
  // Total zerado: foto de uma página sem o rodapé. Confere só as linhas.
  if (total > 0 && Math.abs(soma - total) > 0.05 && Math.abs(soma - desconto - total) > 0.05) {
    return "soma das linhas não bate com o total";
  }
  return null;
}

function extrairJson(texto: string): NotaLida | null {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim < ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

export async function lerDocumento(modelo: string, mime: string, b64: string): Promise<Leitura> {
  const ini = Date.now();
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) return { leitor: modelo, ok: false, motivo: "GEMINI_API_KEY não configurada", ms: 0 };
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(TEMPO_MAX),
    });
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { leitor: modelo, ok: false, motivo: `Gemini ${resp.status}: ${JSON.stringify(corpo).slice(0, 200)}`, ms: Date.now() - ini };
    }
    const texto = (corpo.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const u = corpo.usageMetadata ?? {};
    const uso = { entrada: u.promptTokenCount, saida: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
    const nota = extrairJson(texto);
    const problema = conferir(nota);
    return { leitor: modelo, ok: !problema, motivo: problema ?? undefined, nota: nota ?? undefined, uso, ms: Date.now() - ini };
  } catch (e) {
    return { leitor: modelo, ok: false, motivo: e instanceof Error ? e.message : String(e), ms: Date.now() - ini };
  }
}

/**
 * Cabeçalho (número, data) não tem conta para conferir. No teste, o leitor
 * acertou todas as linhas mas errou o ano em duas fotos e um dígito do número
 * em outra. A data fora do esperado vira aviso para o agente confirmar.
 */
function avisosDoCabecalho(n: NotaLida): string[] {
  const avisos: string[] = [];
  const data = n.data ? new Date(`${n.data}T12:00:00`) : null;
  const dias = data && !isNaN(data.getTime()) ? (Date.now() - data.getTime()) / 86_400_000 : null;
  if (dias === null) avisos.push("data não lida: pergunte a data da compra");
  else if (dias > 60 || dias < -1) avisos.push(`data lida (${n.data}) parece errada: confirme com a pessoa`);
  if (!n.total) avisos.push("total não aparece nesta foto (pode ser uma das páginas da nota)");
  return avisos;
}

/** Texto que o agente recebe no lugar da imagem. */
export function textoDaLeitura(n: NotaLida): string {
  const avisos = avisosDoCabecalho(n);
  return `[Foto de nota transcrita automaticamente e conferida: as contas de cada linha e a soma batem com o total. ` +
    `Use como a leitura da foto. Número e data não têm conferência: mostre no resumo para a pessoa confirmar. ` +
    `Se precisar ver a imagem, use ver_foto_original.]` +
    (avisos.length ? `\n[Atenção: ${avisos.join(" · ")}]` : "") +
    `\n${JSON.stringify(n)}`;
}
