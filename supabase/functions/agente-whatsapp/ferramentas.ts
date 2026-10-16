/**
 * Ferramentas do agente.
 *
 * Cada ferramenta só aparece para quem tem a ação correspondente. A trava de
 * verdade é no banco (fn_agente_executar confere papel e escopo), então mesmo
 * que o modelo chame algo que não devia, a escrita é recusada lá.
 */

import type Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Pessoa } from "./prompt.ts";

export const ESTOQUES: Record<string, string> = {
  central: "ea043464-d54e-4f42-8e40-4edddc5b4b51",
  bar: "10b3aacf-61b1-4add-91ac-0949d3e7f3a3",
  cozinha: "1da77d06-f428-49b4-afa7-9ffaa90b8557",
};

/** Mensagem que sai pelo WhatsApp para outra pessoa (ex.: aviso de pendência). */
export interface Aviso {
  equipeId: string;
  texto: string;
}

export interface Contexto {
  db: SupabaseClient;
  pessoa: Pessoa;
  avisos: Aviso[];
}

type Definicao = Anthropic.Tool & { acoes: string[] };

const DEFINICOES: Definicao[] = [
  {
    name: "buscar_itens",
    acoes: ["consultar", "lancar_nota", "transferir", "compras", "emprestimo", "perda"],
    description:
      "Procura itens do estoque pelo nome (palavras ou nome parecido). Devolve nome, unidade, custo médio, saldo em cada estoque que a pessoa pode ver e a última compra (data, fornecedor, quantidade, custo). Use para achar o item de cada linha da nota, de cada transferência e para consultar saldo.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Nome ou parte do nome, ex.: 'agua sem gas', 'corona 600', 'red bull tradicional'." },
        limite: { type: "integer", description: "Máximo de resultados (padrão 8)." },
      },
      required: ["texto"],
    },
  },
  {
    name: "buscar_fornecedor",
    acoes: ["lancar_nota"],
    description: "Procura fornecedor pelo nome ou pelo CNPJ (pode mandar com pontuação).",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
  },
  {
    name: "notas_recentes",
    acoes: ["lancar_nota", "consultar"],
    description: "Notas de compra lançadas nos últimos dias (fornecedor, número, data, valor). Use antes de lançar, para não duplicar.",
    input_schema: {
      type: "object",
      properties: { dias: { type: "integer", description: "Padrão 3, máximo 15." } },
    },
  },
  {
    name: "salvar_rascunho_nota",
    acoes: ["lancar_nota"],
    description:
      "Guarda a nota montada para a pessoa conferir. Não lança nada. Devolve o número do rascunho e a soma das linhas, que precisa bater com o total da nota.",
    input_schema: {
      type: "object",
      properties: {
        fornecedor_id: { type: "string" },
        numero_documento: { type: "string", description: "Número da nota. Vazio se não houver." },
        data_compra: { type: "string", description: "AAAA-MM-DD" },
        total_nota: { type: "number", description: "Valor total pago, já com descontos." },
        observacoes: { type: "string" },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string" },
              nome: { type: "string", description: "Nome do item no sistema." },
              quantidade: { type: "number", description: "Na unidade do sistema." },
              custo_unitario: { type: "number", description: "Já com o desconto rateado." },
            },
            required: ["item_id", "nome", "quantidade", "custo_unitario"],
          },
        },
        resumo: { type: "string", description: "Uma linha: fornecedor, número e total. Ex.: 'De Ville 97380 · R$ 839,00'." },
      },
      required: ["fornecedor_id", "data_compra", "total_nota", "itens", "resumo"],
    },
  },
  {
    name: "lancar_nota",
    acoes: ["lancar_nota"],
    description:
      "Lança no estoque Central a nota de um rascunho. Só use depois que a pessoa confirmou o resumo na mensagem mais recente. Conforme o papel, a nota pode ficar pendente de aprovação.",
    input_schema: {
      type: "object",
      properties: {
        rascunho_id: { type: "integer" },
        forcar: { type: "boolean", description: "Lança mesmo parecendo duplicada (mesmo fornecedor, data e valor). Só com confirmação explícita." },
      },
      required: ["rascunho_id"],
    },
  },
  {
    name: "transferir",
    acoes: ["transferir"],
    description: "Registra transferência entre estoques. Limita ao saldo da origem e avisa o que faltou.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", enum: ["central", "bar", "cozinha"] },
        para: { type: "string", enum: ["central", "bar", "cozinha"] },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string" },
              quantidade: { type: "number", description: "Na unidade do sistema (fardo de 12 = 12)." },
            },
            required: ["item_id", "quantidade"],
          },
        },
        data: { type: "string", description: "AAAA-MM-DD. Omitir para hoje. Até 3 dias para trás." },
        motivo: { type: "string" },
      },
      required: ["de", "para", "itens"],
    },
  },
  {
    name: "movimentos_item",
    acoes: ["consultar"],
    description: "Linha do tempo de um item: compras, transferências, vendas da Zig, contagens e ajustes.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        dias: { type: "integer", description: "Padrão 3, máximo 15." },
      },
      required: ["item_id"],
    },
  },
  {
    name: "vendas_zig",
    acoes: ["consultar"],
    description: "Vendas da Zig de um dia, por produto (as que já foram baixadas no estoque, normalmente até o dia anterior).",
    input_schema: {
      type: "object",
      properties: {
        data: { type: "string", description: "AAAA-MM-DD" },
        texto: { type: "string", description: "Filtra produtos pelo nome." },
      },
      required: ["data"],
    },
  },
  {
    name: "lista_compras",
    acoes: ["compras"],
    description: "Itens abaixo do ponto de pedido no Central, com quanto comprar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "buscar_vizinho",
    acoes: ["emprestimo"],
    description: "Procura vizinho (bar ou restaurante com quem trocamos mercadoria) pelo nome. Vazio lista todos.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" } },
    },
  },
  {
    name: "emprestimos_abertos",
    acoes: ["emprestimo"],
    description: "Empréstimos em aberto com vizinhos, dos dois lados: o que pegamos (devemos) e o que emprestamos (nos devem), com quanto falta devolver.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "registrar_emprestimo",
    acoes: ["emprestimo"],
    description:
      "Registra empréstimo com um vizinho. 'pegamos': a mercadoria entra no estoque e ficamos devendo. 'emprestamos': sai do estoque e o vizinho fica devendo. Conforme o papel, fica pendente de aprovação.",
    input_schema: {
      type: "object",
      properties: {
        vizinho_id: { type: "string" },
        sentido: { type: "string", enum: ["pegamos", "emprestamos"] },
        estoque: { type: "string", enum: ["central", "bar", "cozinha"], description: "De onde a mercadoria saiu ou para onde entrou." },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string" },
              quantidade: { type: "number", description: "Na unidade do sistema." },
            },
            required: ["item_id", "quantidade"],
          },
        },
        observacoes: { type: "string" },
        resumo: { type: "string", description: "Uma linha. Ex.: 'Pegamos 50 L de chopp com o Choppão'." },
      },
      required: ["vizinho_id", "sentido", "estoque", "itens", "resumo"],
    },
  },
  {
    name: "devolver_emprestimo",
    acoes: ["emprestimo"],
    description:
      "Dá baixa (total ou parcial) num empréstimo em aberto: quando nós devolvemos o que pegamos ou quando o vizinho devolve o que emprestamos. Pegue o emprestimo_id em emprestimos_abertos.",
    input_schema: {
      type: "object",
      properties: {
        emprestimo_id: { type: "string" },
        quantidade: { type: "number", description: "Omitir para devolver tudo o que falta." },
        estoque: { type: "string", enum: ["central", "bar", "cozinha"], description: "Só se a devolução sair ou entrar num estoque diferente do empréstimo." },
        resumo: { type: "string", description: "Uma linha. Ex.: 'Devolvemos 24 Original 600 ao Original'." },
      },
      required: ["emprestimo_id", "resumo"],
    },
  },
  {
    name: "registrar_perda",
    acoes: ["perda"],
    description:
      "Baixa mercadoria perdida: cerveja choca, produto vencido, garrafa quebrada, comida estragada, bebida derramada. Sai do estoque como perda, separada de venda e de ajuste de contagem. Grava na hora.",
    input_schema: {
      type: "object",
      properties: {
        estoque: { type: "string", enum: ["central", "bar", "cozinha"], description: "Onde a mercadoria estava." },
        motivo: { type: "string", enum: ["choca/vencida", "quebrou", "estragou", "derramou", "outro"] },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string" },
              quantidade: { type: "number", description: "Na unidade do sistema." },
            },
            required: ["item_id", "quantidade"],
          },
        },
        detalhe: { type: "string", description: "O que aconteceu, nas palavras da pessoa. Ex.: '2 garrafas chocas no fundo do freezer'." },
        data: { type: "string", description: "AAAA-MM-DD. Omitir para hoje. Até 3 dias para trás." },
      },
      required: ["estoque", "motivo", "itens"],
    },
  },
  {
    name: "perdas_periodo",
    acoes: ["perda", "consultar"],
    description: "Perdas registradas nos últimos dias: total em R$, total por motivo e cada lançamento.",
    input_schema: {
      type: "object",
      properties: { dias: { type: "integer", description: "Padrão 7, máximo 60." } },
    },
  },
  {
    name: "pendencias_abertas",
    acoes: ["aprovar"],
    description: "Pendências aguardando aprovação.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "decidir_pendencia",
    acoes: ["aprovar"],
    description: "Aprova ou recusa uma pendência. Quem pediu é avisado.",
    input_schema: {
      type: "object",
      properties: {
        pendencia_id: { type: "integer" },
        aprovar: { type: "boolean" },
        motivo: { type: "string" },
      },
      required: ["pendencia_id", "aprovar"],
    },
  },
];

export function ferramentasPara(p: Pessoa): Anthropic.Tool[] {
  const acoes = new Set(p.permissoes.map((x) => x.acao));
  return DEFINICOES
    .filter((d) => d.acoes.some((a) => acoes.has(a)))
    .map(({ acoes: _a, ...tool }) => tool);
}

async function rpc(db: SupabaseClient, nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}

const ROTULOS_PENDENCIA: Record<string, string> = {
  lancar_nota: "🧾 nota",
  transferir: "🔁 transferência",
  emprestimo: "🤝 empréstimo",
  perda: "🗑️ perda",
};

/** Se a ação virou pendência, avisa quem aprova. Vale para qualquer ação. */
async function sePendente(ctx: Contexto, acao: string, r: any) {
  if (r?.status !== "pendente") return r;
  const { data: pend } = await ctx.db.from("agente_pendencias").select("id, resumo").eq("id", r.pendencia_id).single();
  const [icone, nome] = (ROTULOS_PENDENCIA[acao] ?? `📌 ${acao}`).split(" ");
  await avisarAprovadores(ctx,
    `${icone} *Pendência ${pend?.id}*: ${nome} de ${ctx.pessoa.nome}\n${pend?.resumo ?? ""}\n\nResponda *aprovar ${pend?.id}* ou *recusar ${pend?.id} motivo*.`);
  return r;
}

/** Avisa quem pode aprovar (menos quem pediu). */
async function avisarAprovadores(ctx: Contexto, texto: string) {
  const { data: perms } = await ctx.db.from("agente_permissoes").select("papel").eq("acao", "aprovar");
  const papeis = (perms ?? []).map((p) => p.papel);
  if (!papeis.length) return;
  const { data: gente } = await ctx.db
    .from("agente_equipe").select("id")
    .in("papel", papeis).eq("ativo", true).not("telefone", "is", null);
  for (const g of gente ?? []) {
    if (g.id !== ctx.pessoa.id) ctx.avisos.push({ equipeId: g.id, texto });
  }
}

export async function executarFerramenta(
  nome: string,
  entrada: Record<string, any>,
  ctx: Contexto,
): Promise<unknown> {
  const { db, pessoa } = ctx;
  const permitidas = new Set(ferramentasPara(pessoa).map((t) => t.name));
  if (!permitidas.has(nome)) return { status: "negado", motivo: "Ferramenta fora do papel desta pessoa." };

  switch (nome) {
    case "buscar_itens":
      return rpc(db, "fn_agente_buscar_itens", { p_equipe: pessoa.id, p_texto: String(entrada.texto ?? ""), p_limite: entrada.limite ?? 8 });

    case "buscar_fornecedor":
      return rpc(db, "fn_agente_buscar_fornecedor", { p_texto: String(entrada.texto ?? "") });

    case "notas_recentes":
      return rpc(db, "fn_agente_notas_recentes", { p_dias: entrada.dias ?? 3 });

    case "salvar_rascunho_nota": {
      const itens = Array.isArray(entrada.itens) ? entrada.itens : [];
      if (!itens.length) return { status: "erro", motivo: "Nota sem itens." };
      const soma = itens.reduce((s: number, i: any) => s + Number(i.quantidade) * Number(i.custo_unitario), 0);
      const args = {
        fornecedor_id: entrada.fornecedor_id,
        numero_documento: entrada.numero_documento ?? "",
        data_compra: entrada.data_compra,
        observacoes: entrada.observacoes ?? "",
        itens: itens.map((i: any) => ({ item_id: i.item_id, nome: i.nome, quantidade: Number(i.quantidade), custo_unitario: Number(i.custo_unitario) })),
      };
      const id = await rpc(db, "fn_agente_rascunho_salvar", {
        p_equipe: pessoa.id, p_acao: "lancar_nota", p_args: args, p_resumo: String(entrada.resumo ?? ""),
      });
      const total = Number(entrada.total_nota ?? 0);
      return {
        rascunho_id: id,
        soma_das_linhas: Number(soma.toFixed(2)),
        total_nota: total,
        diferenca: Number((soma - total).toFixed(2)),
        confere: Math.abs(soma - total) < 0.05,
      };
    }

    case "lancar_nota": {
      const r = await rpc(db, "fn_agente_executar", {
        p_pessoa: pessoa.id, p_acao: "lancar_nota",
        p_args: { rascunho_id: entrada.rascunho_id, ...(entrada.forcar ? { forcar: true } : {}) },
      });
      return sePendente(ctx, "lancar_nota", r);
    }

    case "transferir": {
      const de = ESTOQUES[String(entrada.de)];
      const para = ESTOQUES[String(entrada.para)];
      if (!de || !para || de === para) return { status: "erro", motivo: "Origem ou destino inválido." };
      const r = await rpc(db, "fn_agente_executar", {
        p_pessoa: pessoa.id, p_acao: "transferir",
        p_args: {
          de, para, itens: entrada.itens ?? [],
          ...(entrada.data ? { data: entrada.data } : {}),
          ...(entrada.motivo ? { motivo: entrada.motivo } : {}),
        },
      });
      return sePendente(ctx, "transferir", r);
    }

    case "buscar_vizinho":
      return rpc(db, "fn_agente_buscar_vizinho", { p_texto: String(entrada.texto ?? "") });

    case "emprestimos_abertos":
      return rpc(db, "fn_agente_emprestimos_abertos", {});

    case "registrar_emprestimo": {
      const r = await rpc(db, "fn_agente_executar", {
        p_pessoa: pessoa.id, p_acao: "emprestimo",
        p_args: {
          operacao: "registrar", vizinho_id: entrada.vizinho_id, sentido: entrada.sentido,
          estoque_id: ESTOQUES[String(entrada.estoque ?? "central")] ?? ESTOQUES.central,
          itens: entrada.itens ?? [], observacoes: entrada.observacoes ?? "", resumo: entrada.resumo ?? "",
        },
      });
      return sePendente(ctx, "emprestimo", r);
    }

    case "devolver_emprestimo": {
      const r = await rpc(db, "fn_agente_executar", {
        p_pessoa: pessoa.id, p_acao: "emprestimo",
        p_args: {
          operacao: "devolver", emprestimo_id: entrada.emprestimo_id,
          ...(entrada.quantidade != null ? { quantidade: entrada.quantidade } : {}),
          ...(ESTOQUES[String(entrada.estoque)] ? { estoque_id: ESTOQUES[String(entrada.estoque)] } : {}),
          resumo: entrada.resumo ?? "",
        },
      });
      return sePendente(ctx, "emprestimo", r);
    }

    case "registrar_perda": {
      const estoque = ESTOQUES[String(entrada.estoque)];
      if (!estoque) return { status: "erro", motivo: "Estoque inválido." };
      const r = await rpc(db, "fn_agente_executar", {
        p_pessoa: pessoa.id, p_acao: "perda",
        p_args: {
          estoque_id: estoque, motivo: entrada.motivo ?? "outro", itens: entrada.itens ?? [],
          ...(entrada.detalhe ? { detalhe: entrada.detalhe } : {}),
          ...(entrada.data ? { data: entrada.data } : {}),
        },
      });
      return sePendente(ctx, "perda", r);
    }

    case "perdas_periodo":
      return rpc(db, "fn_agente_perdas", { p_equipe: pessoa.id, p_dias: entrada.dias ?? 7 });

    case "movimentos_item":
      return rpc(db, "fn_agente_movimentos", { p_equipe: pessoa.id, p_item: entrada.item_id, p_dias: entrada.dias ?? 3 });

    case "vendas_zig":
      return rpc(db, "fn_agente_vendas_zig", { p_data: entrada.data, p_texto: entrada.texto ?? null });

    case "lista_compras": {
      const lista = await rpc(db, "fn_agente_lista_compras", {}) as unknown[];
      return { total: lista.length, itens: lista.slice(0, 60) };
    }

    case "pendencias_abertas":
      return rpc(db, "fn_agente_pendencias_abertas", {});

    case "decidir_pendencia": {
      const r = await rpc(db, "fn_agente_decidir", {
        p_pessoa: pessoa.id, p_pendencia: entrada.pendencia_id,
        p_aprovar: Boolean(entrada.aprovar), p_motivo: entrada.motivo ?? null,
      }) as any;
      if (r?.solicitante_id && r.solicitante_id !== pessoa.id) {
        const msg = r.status === "aprovada"
          ? `✅ A pendência ${entrada.pendencia_id} foi *aprovada* por ${pessoa.nome} e já está registrada no sistema.`
          : r.status === "recusada"
          ? `❌ A pendência ${entrada.pendencia_id} foi *recusada* por ${pessoa.nome}${entrada.motivo ? `: ${entrada.motivo}` : "."}`
          : r.status === "duplicada"
          ? `ℹ️ A pendência ${entrada.pendencia_id} não foi lançada porque a nota já estava no sistema.`
          : null;
        if (msg) ctx.avisos.push({ equipeId: r.solicitante_id, texto: msg });
      }
      return r;
    }
  }
  return { status: "erro", motivo: `Ferramenta desconhecida: ${nome}` };
}
