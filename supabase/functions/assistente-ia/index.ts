import Anthropic from 'npm:@anthropic-ai/sdk@0.127.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Assistente de IA do sistema: o balão "Posso ajudar?" de todas as telas.
//
// - Por enquanto responde sobre o ESTOQUE (itens, saldos, compras, preços,
//   fornecedores, transferências, contagens, perdas, vendas baixadas da ZIG).
// - Só consulta: a IA escreve um SELECT e o banco roda em fn_ia_consulta, com o
//   papel ia_leitura (só as tabelas de estoque, transação só de leitura, tempo
//   limite). Nada é gravado, a não ser o registro da conversa em ia_conversas.
// - Acesso: login com o módulo "estoque" (ou master). Para testes, o token dos
//   agendamentos (x-agente-token = agente_config.token_teste) responde como "Teste".
// - Usa a mesma chave da Anthropic do agente do WhatsApp (ANTHROPIC_API_KEY) e
//   o modelo de agente_config.modelo.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agente-token',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const db = createClient(SUPABASE_URL, SERVICE_ROLE);

const MODELO_PADRAO = 'claude-sonnet-5-5';
const MAX_RODADAS = 10;
/** Resultado de consulta maior que isto vai cortado para a IA (as linhas excedentes não ajudam a responder). */
const MAX_RESULTADO = 40_000;
const MAX_HISTORICO = 12;

const TABELAS = [
  'itens_estoque', 'itens_estoque_niveis', 'estoques', 'saldos_estoque', 'movimentacoes_estoque',
  'entradas_compras', 'itens_entrada_compra', 'fornecedores',
  'contagens_estoque', 'contagens_estoque_itens', 'contagens_estoque_ajustes',
  'fichas_tecnicas', 'ficha_ingredientes', 'mapeamento_itens_vendas',
  'requisicoes_internas', 'requisicoes_internas_itens', 'listas_compra', 'listas_compra_itens',
  'emprestimos_vizinhos', 'vizinhos', 'setores', 'zig_vendas_sync_logs', 'kds_pratos', 'vw_ia_pessoas',
];

const CONTEXTO = `Você é o assistente do sistema do Ditado Popular, bar e restaurante em Cuiabá (MT).
Agora você responde sobre o ESTOQUE. Se perguntarem de outro módulo (RH, financeiro, reservas...), diga com gentileza que por enquanto só responde sobre estoque.

Como trabalhar:
- Para responder, consulte o banco com a ferramenta "consultar" (um SELECT por vez, só leitura). Faça quantas consultas precisar, mas não invente números: tudo que afirmar tem que ter vindo de uma consulta.
- Responda em português do Brasil, simples e direto, como para o dono do bar. Use tabela (markdown com |) quando listar mais de 2 coisas, e negrito no número principal. Datas em DD/MM/AAAA, dinheiro em R$ 1.234,56.
- Diga o período que considerou ("nos últimos 30 dias", "de 01/10 a 29/10").
- Não mostre o SQL nem nomes de tabelas, a não ser que peçam.
- Você não grava nada. Se pedirem para lançar, transferir, ajustar ou corrigir, explique que pelo assistente só dá para consultar e indique a tela do Estoque ou o agente do WhatsApp.
- Se a pergunta for ambígua (ex.: "chopp" pode ser o barril ou o copo vendido), escolha a leitura mais provável, responda e diga qual considerou.

O banco (PostgreSQL):
- estoques: os estoques. tipo = 'central' é o Estoque Central (depósito); os setores são Bar e Cozinha.
- itens_estoque: o cadastro de itens (nome, categoria, unidade_medida, custo_medio, status). Garrafas de destilado contam em unidade (1 = garrafa; 0,3 = 30% da garrafa). Chopp é em litros (CHOPP BRAHMA BARRIL).
- saldos_estoque: saldo atual por estoque e item (quantidade_atual, custo_medio).
- movimentacoes_estoque: tudo que entra e sai. tipo_movimentacao: entrada | saida | transferencia | ajuste. estoque_origem_id / estoque_destino_id. data_movimentacao (data em Cuiabá), criado_em (quando foi lançado), quantidade, custo_unitario, custo_total, motivo, observacoes, criado_por (veja vw_ia_pessoas). origem_tipo diz de onde veio:
  compra = entrada de nota; zig = venda baixada automaticamente da ZIG (o sistema de vendas); contagem = ajuste de contagem física; correcao = correção lançada depois; manual = transferência ou retirada lançada à mão ou pelo WhatsApp; requisicao = pedido de setor; perda = perda registrada; kit, producao, vizinho (empréstimo com vizinho), consumo_interno.
  "Saiu do Central para o Bar" = transferencia com origem no Central e destino no Bar.
- entradas_compras (notas; status = 'recebido' são as recebidas; data_compra, numero_documento, valor_total, fornecedor_id) e itens_entrada_compra (item_id, quantidade_recebida ou quantidade, custo_unitario_final ou custo_unitario, custo_total). Preço pago = coalesce(custo_unitario_final, custo_unitario).
- fornecedores: nome, grupo, tipo.
- contagens_estoque (status = 'processada' são as aprovadas; data_contagem, estoque_id) e contagens_estoque_itens (item_estoque_id, quantidade_sistema, quantidade_contada, diferenca, valor_diferenca).
- fichas_tecnicas e ficha_ingredientes: receitas dos drinks e pratos (o que cada venda baixa). mapeamento_itens_vendas: produto da ZIG -> item ou ficha.
- requisicoes_internas e requisicoes_internas_itens: pedidos dos setores ao Central.
- listas_compra / listas_compra_itens: listas de compras. emprestimos_vizinhos / vizinhos: empréstimos com casas vizinhas.
- zig_vendas_sync_logs: um registro por dia da baixa automática da ZIG (itens_processados em JSON).
- kds_pratos: pedidos da cozinha, bar e drinks no KDS (pedido_em, pronto_em = tempo de preparo).
- vw_ia_pessoas: id e nome de quem lançou.
- Fuso: America/Cuiaba (UTC-4). A noite do bar vai até a madrugada.
- Use ILIKE com % para achar itens e fornecedores pelo nome (os nomes estão em maiúsculas e às vezes com sufixo GF, LT, 600ML).`;

const FERRAMENTA: Anthropic.Tool = {
  name: 'consultar',
  description: 'Roda um SELECT (ou WITH ... SELECT) de leitura no banco do estoque e devolve as linhas em JSON (até 200). Uma consulta por chamada, sem ponto e vírgula. Funções do sistema (fn_*, pg_*) não são aceitas.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'A consulta SELECT.' },
      objetivo: { type: 'string', description: 'Em poucas palavras, o que esta consulta busca.' },
    },
    required: ['sql'],
  },
};

let esquema: string | null = null;
/** As colunas das tabelas liberadas, para a IA escrever as consultas certas (lido uma vez por instância). */
async function lerEsquema(): Promise<string> {
  if (esquema) return esquema;
  const lista = TABELAS.map((t) => `'${t}'`).join(',');
  const { data, error } = await db.rpc('fn_ia_consulta', {
    p_sql: `select table_name t, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) c from information_schema.columns where table_schema = 'public' and table_name in (${lista}) group by table_name order by table_name`,
    p_limite: 100,
  });
  if (error) throw new Error(error.message);
  esquema = (data as Array<{ t: string; c: string }>).map((r) => `${r.t}: ${r.c}`).join('\n');
  return esquema;
}

/** As regras da casa que o agente do WhatsApp também segue (apelidos, embalagens, padrões dos freezers). */
async function regrasDaCasa(): Promise<string> {
  const { data } = await db.from('agente_config').select('valor').eq('chave', 'regras_extra').maybeSingle();
  return typeof data?.valor === 'string' ? data.valor : '';
}

async function estoques(): Promise<string> {
  const { data } = await db.from('estoques').select('id, nome, tipo').order('nome');
  return (data ?? []).map((e) => `${e.nome} (${e.tipo ?? 'setor'}): ${e.id}`).join('\n');
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Teste: o mesmo token dos agendamentos (agente_config.token_teste). */
async function ehTeste(req: Request) {
  const token = req.headers.get('x-agente-token') ?? '';
  if (!token) return false;
  const { data } = await db.from('agente_config').select('valor').eq('chave', 'token_teste').maybeSingle();
  return typeof data?.valor === 'string' && !!data.valor && iguais(token, data.valor);
}

/** Quem pergunta: precisa estar logado e ter o módulo de estoque (ou ser master). */
async function quemPergunta(auth: string) {
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: uid } = await caller.rpc('fn_usuario_sistema_id');
  if (!uid) return null;
  const { data: u } = await db.from('usuarios_sistema').select('id, nome_completo, nivel, ativo').eq('id', uid).maybeSingle();
  if (!u?.ativo) return null;
  if (u.nivel !== 'master') {
    const { data: m } = await db.from('modulos_sistema').select('id').eq('slug', 'estoque').maybeSingle();
    const { data: p } = await db.from('permissoes_usuario').select('id').eq('usuario_id', u.id).eq('modulo_id', m?.id ?? '').is('aba_id', null).eq('pode_visualizar', true).limit(1);
    if (!p?.length) return null;
  }
  return { id: u.id as string, nome: (u.nome_completo as string) || 'Usuário' };
}

interface Entrada { role: 'user' | 'assistant'; texto: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const auth = req.headers.get('Authorization');

  let pessoa: { id: string; nome: string } | null = null;
  let pergunta = '';
  const consultas: Array<{ sql: string; objetivo?: string; linhas?: number; erro?: string }> = [];
  const uso = { entrada: 0, saida: 0, cache_leitura: 0, cache_escrita: 0, rodadas: 0 };
  let tela: string | null = null;

  try {
    pessoa = (await ehTeste(req)) ? { id: '', nome: 'Teste' } : auth ? await quemPergunta(auth) : null;
    if (!pessoa) return json({ ok: false, error: 'Por enquanto o assistente é só para quem tem acesso ao Estoque.' }, 403);

    const body = await req.json().catch(() => ({}));
    tela = typeof body?.tela === 'string' ? body.tela.slice(0, 200) : null;
    const historico = (Array.isArray(body?.mensagens) ? body.mensagens : [])
      .filter((m: Entrada) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.texto === 'string' && m.texto.trim())
      .slice(-MAX_HISTORICO) as Entrada[];
    if (!historico.length || historico[historico.length - 1].role !== 'user') return json({ ok: false, error: 'Mande uma pergunta.' }, 400);
    pergunta = historico[historico.length - 1].texto.slice(0, 2000);
    // A conversa começa sempre por uma pergunta.
    while (historico.length && historico[0].role !== 'user') historico.shift();

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada.');
    const cliente = new Anthropic({ apiKey, maxRetries: 2 });
    const { data: cfgModelo } = await db.from('agente_config').select('valor').eq('chave', 'modelo').maybeSingle();
    const modelo = typeof cfgModelo?.valor === 'string' && cfgModelo.valor ? cfgModelo.valor : MODELO_PADRAO;

    const hoje = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: `${CONTEXTO}\n\nRegras da casa (valem para entender os lançamentos):\n${await regrasDaCasa()}\n\nColunas das tabelas:\n${await lerEsquema()}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Estoques (nome, tipo, id):\n${await estoques()}\n\nHoje em Cuiabá: ${hoje}. Quem pergunta: ${pessoa.nome}.${tela ? ` Tela aberta: ${tela}.` : ''}` },
    ];
    const messages: Anthropic.MessageParam[] = historico.map((m) => ({ role: m.role, content: m.texto }));

    let resposta: Anthropic.Message | null = null;
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      resposta = await cliente.messages.create({ model: modelo, max_tokens: 8000, system, tools: [FERRAMENTA], messages });
      uso.rodadas++;
      uso.entrada += resposta.usage.input_tokens ?? 0;
      uso.saida += resposta.usage.output_tokens ?? 0;
      uso.cache_leitura += resposta.usage.cache_read_input_tokens ?? 0;
      uso.cache_escrita += resposta.usage.cache_creation_input_tokens ?? 0;
      messages.push({ role: 'assistant', content: resposta.content });
      if (resposta.stop_reason !== 'tool_use') break;

      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const c of resposta.content) {
        if (c.type !== 'tool_use') continue;
        const input = (c.input ?? {}) as { sql?: string; objetivo?: string };
        const sql = String(input.sql ?? '');
        const { data, error } = await db.rpc('fn_ia_consulta', { p_sql: sql, p_limite: 200 });
        if (error) {
          consultas.push({ sql, objetivo: input.objetivo, erro: error.message });
          resultados.push({ type: 'tool_result', tool_use_id: c.id, content: `Erro: ${error.message}`, is_error: true });
        } else {
          const linhas = Array.isArray(data) ? data : [];
          consultas.push({ sql, objetivo: input.objetivo, linhas: linhas.length });
          let texto = JSON.stringify(linhas);
          if (texto.length > MAX_RESULTADO) texto = `${texto.slice(0, MAX_RESULTADO)}… (cortado: ${linhas.length} linhas no total; agregue ou filtre mais)`;
          resultados.push({ type: 'tool_result', tool_use_id: c.id, content: texto });
        }
      }
      messages.push({ role: 'user', content: resultados });
    }

    const texto = (resposta?.content ?? []).filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
      || 'Não consegui chegar a uma resposta agora. Tente perguntar de outro jeito.';
    await db.from('ia_conversas').insert({ usuario_id: pessoa.id || null, usuario_nome: pessoa.nome, modulo: 'estoque', tela, pergunta, resposta: texto, consultas, uso: { ...uso, modelo } });
    return json({ ok: true, resposta: texto, consultas: consultas.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[assistente-ia]', msg);
    if (pessoa) await db.from('ia_conversas').insert({ usuario_id: pessoa.id || null, usuario_nome: pessoa.nome, modulo: 'estoque', tela, pergunta: pergunta || '(sem pergunta)', consultas, uso, erro: msg });
    const credito = /credit balance/i.test(msg);
    return json({ ok: false, error: credito ? 'O assistente está sem crédito na Anthropic. Avise o Kadu para recarregar.' : 'Não consegui responder agora. Tente de novo em instantes.' }, 500);
  }
});
