import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatRequest {
  mensagem: string;
  contexto?: Array<{ role: string; content: string }>;
  usuario_id?: string;
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Configuração do Supabase não encontrada');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { mensagem, contexto = [], usuario_id }: ChatRequest = body;

    console.log('='.repeat(60));
    console.log('📩 MENSAGEM:', mensagem);
    console.log('='.repeat(60));

    if (!mensagem) {
      throw new Error('Mensagem não fornecida');
    }

    const usuarioIdValido = usuario_id && isValidUUID(usuario_id) ? usuario_id : null;
    
    if (usuario_id && !usuarioIdValido) {
      console.log('⚠️ Usuario ID inválido, usando NULL');
    }

    const { data: configs } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['openai_api_key', 'openai_model', 'ia_habilitada']);

    const configMap = new Map(configs?.map(c => [c.chave, c.valor]) || []);
    const openaiKey = configMap.get('openai_api_key');
    const model = configMap.get('openai_model') || 'gpt-4o-mini';
    const iaHabilitada = configMap.get('ia_habilitada') === 'true';

    console.log('🤖 IA:', iaHabilitada ? 'ATIVA' : 'INATIVA');

    let resultado;

    if (iaHabilitada && openaiKey) {
      resultado = await processarComGPT(mensagem, contexto, supabase, openaiKey, model, usuarioIdValido);
    } else {
      resultado = { resposta: '🤖 IA desabilitada. Configure em Configurações > IA', tokens: 0 };
    }

    await supabase.from('chat_ia_financeiro').insert({
      usuario_id: usuarioIdValido,
      mensagem,
      resposta_ia: resultado.resposta,
      acao_executada: resultado.acao || {},
      contexto: contexto.slice(-5),
      tokens_usados: resultado.tokens || 0
    });

    console.log('✅ CONCLUÍDO\n');

    return new Response(
      JSON.stringify({
        sucesso: true,
        resposta: resultado.resposta,
        acao: resultado.acao,
        sugestoes: resultado.sugestoes || []
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('❌ ERRO:', error);
    return new Response(
      JSON.stringify({
        sucesso: false,
        erro: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processarComGPT(
  mensagem: string,
  contexto: Array<{ role: string; content: string }>,
  supabase: any,
  openaiKey: string,
  model: string,
  usuario_id: string | null
) {
  console.log('🔍 Detectando intenção...');
  const intencao = detectarIntencao(mensagem);
  console.log('🎯 Intenção:', intencao);

  if (intencao === 'conversa') {
    return respostaConversacional(mensagem, openaiKey, model, contexto);
  }

  console.log('🚀 Executando:', intencao);
  
  let dadosBanco;
  let parametros = {};

  try {
    switch (intencao) {
      case 'lancar_conta_pagar':
        const contasExtraidas = await extrairMultiplasContas(mensagem, openaiKey, model);
        console.log('  📋 Contas detectadas:', contasExtraidas.length);
        parametros = { total_contas: contasExtraidas.length };
        dadosBanco = await executarLancamentoMultiplo(supabase, contasExtraidas, usuario_id);
        break;
      
      case 'consultar_compras':
        parametros = { periodo: extrairPeriodo(mensagem) };
        dadosBanco = await executarConsultaCompras(supabase, parametros);
        break;
      
      case 'consultar_estoque':
        parametros = { tipo_consulta: mensagem.toLowerCase().includes('baixo') ? 'itens_baixos' : 'todos_itens' };
        dadosBanco = await executarConsultaEstoque(supabase, parametros);
        break;
      
      case 'consultar_contas':
        parametros = { periodo: extrairPeriodo(mensagem) };
        dadosBanco = await executarConsultaContasPagar(supabase, parametros);
        break;
      
      case 'resumo_geral':
        parametros = { periodo: extrairPeriodo(mensagem) };
        dadosBanco = await executarResumoGeral(supabase, parametros);
        break;
      
      default:
        return respostaConversacional(mensagem, openaiKey, model, contexto);
    }

    console.log('✅ Ação concluída');

  } catch (error) {
    console.error('❌ Erro:', error);
    return {
      resposta: `Erro: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      tokens: 0
    };
  }

  console.log('📝 Formatando resposta...');

  const promptFormatacao = `Usuário: "${mensagem}"

Resultado:
${JSON.stringify(dadosBanco, null, 2)}

Formate uma resposta clara, objetiva e humanizada. Se foram lançadas várias contas, liste todas com seus fornecedores, valores e vencimentos.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Assistente financeiro prestativo.' },
          ...contexto.slice(-3),
          { role: 'user', content: promptFormatacao }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI: ${response.status}`);
    }

    const gptData = await response.json();
    const respostaFormatada = gptData.choices[0].message.content;
    const tokens = gptData.usage?.total_tokens || 0;

    return {
      resposta: respostaFormatada,
      tokens,
      acao: { tipo: intencao, parametros, dados: dadosBanco },
      sugestoes: gerarSugestoes(intencao)
    };

  } catch (error) {
    console.error('❌ GPT erro:', error);
    return {
      resposta: formatarRespostaManual(intencao, dadosBanco),
      tokens: 0,
      acao: { tipo: intencao, parametros, dados: dadosBanco }
    };
  }
}

function detectarIntencao(mensagem: string): string {
  const msg = mensagem.toLowerCase();

  // Aceita: "lançar 500", "criar conta 300", "500 de luz", etc
  if (
    (msg.includes('lanç') && (msg.includes('conta') || /\d+/.test(msg))) ||
    (msg.includes('lanc') && (msg.includes('conta') || /\d+/.test(msg))) ||
    (msg.includes('criar') && (msg.includes('conta') || /\d+/.test(msg))) ||
    (msg.includes('adicionar') && (msg.includes('conta') || /\d+/.test(msg))) ||
    (msg.includes('incluir') && (msg.includes('conta') || /\d+/.test(msg))) ||
    msg.match(/r\$\s*\d/) || 
    msg.match(/reais?\s*\d/) ||
    msg.match(/\d+[.,]?\d*\s*(de|luz|agua|água|aluguel|telefone|internet|energia)/)
  ) {
    return 'lancar_conta_pagar';
  }

  if (
    msg.includes('compra') ||
    msg.includes('gastei') ||
    msg.includes('fornecedor')
  ) {
    return 'consultar_compras';
  }

  if (
    msg.includes('estoque') ||
    msg.includes('falta') ||
    msg.includes('baixo')
  ) {
    return 'consultar_estoque';
  }

  if (
    msg.includes('conta') ||
    msg.includes('pagar') ||
    msg.includes('vencimento')
  ) {
    return 'consultar_contas';
  }

  if (
    msg.includes('resumo') ||
    msg.includes('geral')
  ) {
    return 'resumo_geral';
  }

  return 'conversa';
}

async function extrairMultiplasContas(mensagem: string, openaiKey: string, model: string): Promise<any[]> {
  console.log('  🤖 Usando IA para extrair contas...');

  const prompt = `Extraia informações de contas a pagar desta mensagem:

"${mensagem}"

Retorne JSON array com:
[
  {
    "descricao": "descrição curta (ex: Aluguel, Energia, Telefone, Água)",
    "valor": 123.45,
    "vencimento_relativo": "hoje" | "amanha" | "proxima_semana" | "proximo_mes" | "padrao",
    "fornecedor_sugerido": "nome aproximado do fornecedor se mencionado na mensagem, senão null"
  }
]

REGRAS IMPORTANTES:
- Descrição: APENAS o tipo de despesa (Aluguel, Energia, Água, Telefone, Internet, Salários, etc)
- NÃO inclua nome de fornecedor na descrição
- Valores são números (sem R$, sem "reais")
- Se mencionar "e", vírgulas entre itens = várias contas
- fornecedor_sugerido: se usuário mencionar fornecedor específico (ex: "ENERGISA", "AGUAS CUIABA"), senão null`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Você extrai dados estruturados de texto. Retorne APENAS o JSON, sem explicações.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI: ${response.status}`);
    }

    const gptData = await response.json();
    const respostaTexto = gptData.choices[0].message.content;
    
    const jsonMatch = respostaTexto.match(/\[.*\]/s);
    if (!jsonMatch) {
      throw new Error('IA não retornou JSON válido');
    }

    const contas = JSON.parse(jsonMatch[0]);
    console.log('  ✅ IA extraiu:', JSON.stringify(contas, null, 2));

    return contas.map((conta: any) => {
      if (!conta.valor || conta.valor <= 0) {
        throw new Error(`Valor inválido para "${conta.descricao}": ${conta.valor}`);
      }

      const dataVencimento = calcularVencimento(conta.vencimento_relativo || 'padrao');

      return {
        descricao: conta.descricao || 'Despesa',
        valor: parseFloat(conta.valor),
        dataVencimento,
        fornecedorSugerido: conta.fornecedor_sugerido || null
      };
    });

  } catch (error) {
    console.error('  ❌ Erro ao extrair com IA:', error);
    return extrairContasManual(mensagem);
  }
}

function extrairContasManual(mensagem: string): any[] {
  console.log('  🔧 Usando extração manual...');
  
  const msg = mensagem.toLowerCase();
  // Aceita: R$ 300, 300 reais, 300 de luz, apenas 300
  const valores = msg.match(/r\$\s*(\d+[.,]?\d*)|([\d]+[.,]?\d*)\s*(?:reais?|de)/g) || 
                  msg.match(/\d+[.,]?\d*/g) || [];
  
  if (valores.length === 0) {
    throw new Error('Nenhum valor encontrado. Ex: "Lançar 100 de luz" ou "Lançar conta de 100"');
  }

  return valores.map((valorTexto: string) => {
    const valor = parseFloat(valorTexto.replace(/r\$|reais?|de/gi, '').replace(',', '.').trim());
    if (valor <= 0) {
      throw new Error('Valor deve ser maior que zero');
    }
    return {
      descricao: 'Despesa',
      valor,
      dataVencimento: calcularVencimento('padrao'),
      fornecedorSugerido: null
    };
  });
}

function calcularVencimento(relativo: string): Date {
  const data = new Date();
  
  switch (relativo) {
    case 'hoje':
      return data;
    case 'amanha':
      data.setDate(data.getDate() + 1);
      return data;
    case 'proxima_semana':
      data.setDate(data.getDate() + 7);
      return data;
    case 'proximo_mes':
      data.setMonth(data.getMonth() + 1);
      return data;
    default:
      data.setDate(data.getDate() + 7);
      return data;
  }
}

async function executarLancamentoMultiplo(supabase: any, contas: any[], usuario_id: string | null) {
  console.log(`  💳 Lançando ${contas.length} conta(s)...`);

  // Buscar TODOS os fornecedores ativos com categorias
  const { data: fornecedores, error: fornecedoresError } = await supabase
    .from('fornecedores')
    .select(`
      id, 
      nome, 
      categoria_padrao_id,
      categorias_financeiras:categoria_padrao_id (
        id,
        nome,
        tipo
      )
    `)
    .eq('status', 'ativo');

  if (fornecedoresError || !fornecedores || fornecedores.length === 0) {
    throw new Error('Nenhum fornecedor ativo cadastrado.');
  }

  console.log(`  🏢 ${fornecedores.length} fornecedores disponíveis`);

  // Processar cada conta individualmente
  const contasInseridas = [];

  for (const conta of contas) {
    console.log(`\n  📝 Processando: "${conta.descricao}"`);
    
    // Buscar fornecedor por similaridade
    const fornecedor = buscarFornecedorPorSimilaridade(
      conta.descricao, 
      conta.fornecedorSugerido,
      fornecedores
    );

    console.log(`    🏢 Fornecedor escolhido: ${fornecedor.nome}`);
    console.log(`    🏷️ Categoria: ${fornecedor.categorias_financeiras?.nome || 'Sem categoria'}`);

    const contaParaInserir = {
      fornecedor_id: fornecedor.id,
      categoria_id: fornecedor.categoria_padrao_id || null,
      descricao: conta.descricao,
      valor_total: conta.valor,
      data_vencimento: conta.dataVencimento.toISOString().split('T')[0],
      status: 'em_aberto',
      criado_por: usuario_id
    };

    const { data: contaInserida, error } = await supabase
      .from('contas_pagar')
      .insert(contaParaInserir)
      .select(`
        id, 
        descricao, 
        valor_total, 
        data_vencimento,
        fornecedores(nome),
        categorias_financeiras(nome)
      `)
      .single();

    if (error) {
      console.error('    ❌ Erro ao inserir:', error);
      throw new Error(`Erro ao lançar "${conta.descricao}": ${error.message}`);
    }

    console.log(`    ✅ Conta lançada: ID ${contaInserida.id}`);

    contasInseridas.push({
      id: contaInserida.id,
      descricao: contaInserida.descricao,
      valor: parseFloat(contaInserida.valor_total),
      vencimento: contaInserida.data_vencimento,
      fornecedor: contaInserida.fornecedores?.nome || 'Sem fornecedor',
      categoria: contaInserida.categorias_financeiras?.nome || 'Sem categoria'
    });
  }

  console.log(`\n  ✅ Total: ${contasInseridas.length} conta(s) lançada(s)`);

  return {
    sucesso: true,
    total_contas: contasInseridas.length,
    contas: contasInseridas
  };
}

function buscarFornecedorPorSimilaridade(
  descricao: string, 
  fornecedorSugerido: string | null,
  fornecedores: any[]
): any {
  const descLower = descricao.toLowerCase();
  
  // Se fornecedor foi sugerido pela IA, tentar encontrá-lo primeiro
  if (fornecedorSugerido) {
    const sugeridoLower = fornecedorSugerido.toLowerCase();
    const fornecedorEncontrado = fornecedores.find(f => 
      f.nome.toLowerCase().includes(sugeridoLower) ||
      sugeridoLower.includes(f.nome.toLowerCase())
    );
    if (fornecedorEncontrado) {
      console.log(`    🎯 Fornecedor sugerido encontrado: ${fornecedorEncontrado.nome}`);
      return fornecedorEncontrado;
    }
  }

  // Mapeamento de palavras-chave para buscar fornecedor
  const mapeamento: Record<string, string[]> = {
    'energia': ['energia', 'eletric', 'light', 'luz', 'energisa'],
    'agua': ['água', 'agua', 'saneamento', 'aguas'],
    'telefone': ['telefone', 'celular', 'vivo', 'claro', 'tim', 'oi'],
    'internet': ['internet', 'banda larga', 'fibra'],
    'gas': ['gás', 'gas', 'gaz'],
    'aluguel': ['aluguel', 'locação', 'locacao', 'imóvel', 'imovel'],
    'carne': ['carne', 'açougue', 'acougue', 'boi', 'frango'],
    'peixe': ['peixe', 'fruto', 'mar'],
    'bebida': ['bebida', 'cerveja', 'chopp', 'ambev', 'refrigerante'],
    'alimento': ['alimento', 'comida', 'supermercado', 'atacadão', 'assai'],
    'musico': ['músico', 'musico', 'cachê', 'cache', 'banda'],
    'advogado': ['advogado', 'jurídico', 'juridico'],
    'seguro': ['seguro', 'allianz'],
  };

  // Tentar encontrar por palavra-chave
  for (const [chave, palavras] of Object.entries(mapeamento)) {
    if (palavras.some(p => descLower.includes(p))) {
      const fornecedor = fornecedores.find(f => 
        palavras.some(p => f.nome.toLowerCase().includes(p)) ||
        (f.categorias_financeiras?.nome?.toLowerCase() || '').includes(chave)
      );
      if (fornecedor) {
        console.log(`    🔍 Encontrado por palavra-chave "${chave}": ${fornecedor.nome}`);
        return fornecedor;
      }
    }
  }

  // Fallback: primeiro fornecedor com categoria
  const fornecedorComCategoria = fornecedores.find(f => f.categoria_padrao_id);
  if (fornecedorComCategoria) {
    console.log(`    🤷 Usando fornecedor padrão: ${fornecedorComCategoria.nome}`);
    return fornecedorComCategoria;
  }

  // Último recurso: primeiro fornecedor da lista
  console.log(`    ⚠️ Usando primeiro fornecedor: ${fornecedores[0].nome}`);
  return fornecedores[0];
}

function extrairPeriodo(mensagem: string): string {
  const msg = mensagem.toLowerCase();
  if (msg.includes('hoje')) return 'hoje';
  if (msg.includes('ontem')) return 'ontem';
  if (msg.includes('semana')) return 'esta_semana';
  if (msg.includes('mês')) return 'este_mes';
  if (msg.includes('vencida')) return 'vencidas';
  return 'esta_semana';
}

async function respostaConversacional(
  mensagem: string,
  openaiKey: string,
  model: string,
  contexto: Array<{ role: string; content: string }>
) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Assistente financeiro amigável.' },
        ...contexto.slice(-5),
        { role: 'user', content: mensagem }
      ],
      temperature: 0.8,
      max_tokens: 500
    })
  });

  const data = await response.json();
  return {
    resposta: data.choices[0].message.content,
    tokens: data.usage?.total_tokens || 0
  };
}

async function executarConsultaCompras(supabase: any, args: any) {
  console.log('  🛍 Consultando compras...');
  const periodo = extrairPeriodoSQL(args.periodo);

  const { data, error } = await supabase
    .from('entradas_compras')
    .select('id, numero_documento, data_compra, valor_total, fornecedores(nome)')
    .gte('data_compra', periodo.inicio)
    .lte('data_compra', periodo.fim)
    .order('data_compra', { ascending: false })
    .limit(20);

  if (error) throw error;

  const total = data?.reduce((s, c) => s + parseFloat(c.valor_total || 0), 0) || 0;
  console.log(`  ✅ ${data?.length || 0} compras`);

  return {
    total_compras: data?.length || 0,
    valor_total: total,
    periodo: args.periodo,
    compras: data?.map((c: any) => ({
      fornecedor: c.fornecedores?.nome || 'Sem fornecedor',
      data: c.data_compra,
      valor: parseFloat(c.valor_total || 0)
    })) || []
  };
}

async function executarConsultaEstoque(supabase: any, args: any) {
  console.log('  📦 Consultando estoque...');

  if (args.tipo_consulta === 'itens_baixos') {
    const { data, error } = await supabase
      .from('saldos_estoque')
      .select('quantidade, itens_estoque(nome, estoque_minimo, unidade_medida), estoques(nome)');

    if (error) throw error;

    const itensBaixos = data?.filter((i: any) =>
      i.itens_estoque?.estoque_minimo &&
      parseFloat(i.quantidade) < i.itens_estoque.estoque_minimo
    ) || [];

    console.log(`  ✅ ${itensBaixos.length} itens baixos`);

    return {
      total_itens_baixos: itensBaixos.length,
      itens: itensBaixos.slice(0, 15).map((i: any) => ({
        nome: i.itens_estoque.nome,
        quantidade: parseFloat(i.quantidade),
        minimo: i.itens_estoque.estoque_minimo,
        unidade: i.itens_estoque.unidade_medida
      }))
    };
  }

  return { mensagem: 'Tipo não implementado' };
}

async function executarConsultaContasPagar(supabase: any, args: any) {
  console.log('  💳 Consultando contas...');
  const periodo = extrairPeriodoSQL(args.periodo);

  const { data, error } = await supabase
    .from('contas_pagar')
    .select('descricao, valor_total, valor_pago, data_vencimento, status, fornecedores(nome)')
    .gte('data_vencimento', periodo.inicio)
    .lte('data_vencimento', periodo.fim)
    .order('data_vencimento')
    .limit(20);

  if (error) throw error;

  const total = data?.reduce((s, c) => s + parseFloat(c.valor_total || 0), 0) || 0;
  const pago = data?.reduce((s, c) => s + parseFloat(c.valor_pago || 0), 0) || 0;

  console.log(`  ✅ ${data?.length || 0} contas`);

  return {
    total_contas: data?.length || 0,
    valor_total: total,
    valor_pago: pago,
    valor_pendente: total - pago,
    periodo: args.periodo,
    contas: data?.slice(0, 10).map((c: any) => ({
      fornecedor: c.fornecedores?.nome || 'Sem fornecedor',
      descricao: c.descricao,
      valor: parseFloat(c.valor_total || 0),
      vencimento: c.data_vencimento,
      status: c.status
    })) || []
  };
}

async function executarResumoGeral(supabase: any, args: any) {
  console.log('  📊 Gerando resumo...');
  const periodo = extrairPeriodoSQL(args.periodo);

  const { data: compras } = await supabase
    .from('entradas_compras')
    .select('valor_total')
    .gte('data_compra', periodo.inicio)
    .lte('data_compra', periodo.fim);

  const { data: contas } = await supabase
    .from('contas_pagar')
    .select('valor_total, valor_pago')
    .gte('data_vencimento', periodo.inicio)
    .lte('data_vencimento', periodo.fim);

  const totalCompras = compras?.reduce((s, c) => s + parseFloat(c.valor_total || 0), 0) || 0;
  const totalContas = contas?.reduce((s, c) => s + parseFloat(c.valor_total || 0), 0) || 0;
  const totalPago = contas?.reduce((s, c) => s + parseFloat(c.valor_pago || 0), 0) || 0;

  return {
    periodo: args.periodo,
    compras: { quantidade: compras?.length || 0, total: totalCompras },
    contas_pagar: { quantidade: contas?.length || 0, total: totalContas, pago: totalPago, pendente: totalContas - totalPago }
  };
}

function formatarRespostaManual(intencao: string, dados: any): string {
  switch (intencao) {
    case 'lancar_conta_pagar':
      if (dados.sucesso) {
        if (dados.total_contas === 1) {
          const conta = dados.contas[0];
          return `✅ **Conta lançada!**\n\nFornecedor: ${conta.fornecedor}\nCategoria: ${conta.categoria}\nDescrição: ${conta.descricao}\nValor: R$ ${conta.valor.toFixed(2)}\nVencimento: ${conta.vencimento}`;
        } else {
          let resposta = `✅ **${dados.total_contas} contas lançadas!**\n\n`;
          dados.contas.forEach((c: any, i: number) => {
            resposta += `${i + 1}. ${c.descricao} - R$ ${c.valor.toFixed(2)}\n   Fornecedor: ${c.fornecedor}\n   Categoria: ${c.categoria}\n   Vencimento: ${c.vencimento}\n\n`;
          });
          return resposta;
        }
      }
      return '❌ Erro ao lançar conta.';
    
    case 'consultar_compras':
      if (dados.total_compras === 0) return `Nenhuma compra em "${dados.periodo}".`;
      return `🛍 Compras: ${dados.total_compras} (R$ ${dados.valor_total.toFixed(2)})`;
    
    case 'consultar_estoque':
      if (dados.total_itens_baixos === 0) return '✅ Estoque OK!';
      return `⚠️ ${dados.total_itens_baixos} itens com estoque baixo`;
    
    case 'consultar_contas':
      if (dados.total_contas === 0) return `Nenhuma conta em "${dados.periodo}".`;
      return `💳 Contas: ${dados.total_contas} (R$ ${dados.valor_total.toFixed(2)})`;
    
    case 'resumo_geral':
      return `📊 Resumo: ${dados.compras.quantidade} compras (R$ ${dados.compras.total.toFixed(2)}), ${dados.contas_pagar.quantidade} contas`;
    
    default:
      return 'Dados não disponíveis.';
  }
}

function extrairPeriodoSQL(periodo: string): { inicio: string; fim: string } {
  const agora = new Date();
  let inicio: Date;
  let fim: Date = agora;

  switch (periodo) {
    case 'hoje':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
      break;
    case 'ontem':
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 1);
      inicio.setHours(0, 0, 0, 0);
      fim = new Date(inicio);
      fim.setHours(23, 59, 59);
      break;
    case 'esta_semana':
      inicio = new Date(agora);
      inicio.setDate(agora.getDate() - agora.getDay());
      inicio.setHours(0, 0, 0, 0);
      break;
    case 'este_mes':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      break;
    case 'vencidas':
      inicio = new Date(2020, 0, 1);
      fim = new Date(agora);
      fim.setDate(fim.getDate() - 1);
      break;
    default:
      inicio = new Date(agora);
      inicio.setDate(inicio.getDate() - 7);
      inicio.setHours(0, 0, 0, 0);
  }

  return {
    inicio: inicio.toISOString().split('T')[0],
    fim: fim.toISOString().split('T')[0]
  };
}

function gerarSugestoes(intencao: string): string[] {
  const sugestoes: Record<string, string[]> = {
    lancar_conta_pagar: ["Consultar contas pendentes", "Resumo do mês", "Lançar outra conta"],
    consultar_compras: ["Compras de ontem", "Total do mês", "Resumo geral"],
    consultar_estoque: ["Gerar lista de compras", "Movimentações", "Resumo geral"],
    consultar_contas: ["Contas vencidas", "Vencimentos da semana", "Lançar nova conta"],
    resumo_geral: ["Detalhes das compras", "Status do estoque", "Contas pendentes"]
  };
  return sugestoes[intencao] || ["Resumo geral", "Estoque baixo", "Contas a pagar"];
}
