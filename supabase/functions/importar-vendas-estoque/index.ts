import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similaridade(str1: string, str2: string): number {
  const s1 = normalizar(str1);
  const s2 = normalizar(str2);

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const palavras1 = s1.split(/\s+/).filter(p => p.length > 2);
  const palavras2 = s2.split(/\s+/).filter(p => p.length > 2);

  if (palavras1.length === 0 || palavras2.length === 0) return 0;

  let matches = 0;
  for (const p1 of palavras1) {
    for (const p2 of palavras2) {
      if (p1 === p2 || p1.includes(p2) || p2.includes(p1)) {
        matches++;
        break;
      }
    }
  }

  return matches / Math.max(palavras1.length, palavras2.length);
}

async function processarExcel(fileBuffer: ArrayBuffer) {
  console.log('[Excel] Processando arquivo Excel/XLS');

  const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  console.log('[Excel] Planilha: ' + sheetName);

  const dados = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: ''
  });

  if (dados.length === 0) {
    throw new Error('Planilha vazia');
  }

  const cabecalho = (dados[0] as string[]).map(c => String(c || '').trim().toLowerCase());
  console.log('[Excel] Cabeçalho:', cabecalho);

  const colSku = cabecalho.findIndex(c => c === 'sku' || c === 'codigo' || c === 'código');
  const colNome = cabecalho.findIndex(c =>
    c === 'nome' || c === 'produto' || c === 'item' || c.includes('descri')
  );
  const colQuantidade = cabecalho.findIndex(c =>
    c === 'quantidade' || c === 'qtd' || c === 'quant'
  );
  const colValorUnit = cabecalho.findIndex(c =>
    c === 'valor unitario' || c === 'valor unit' || c.includes('valor') || c.includes('preco')
  );
  const colCategoria = cabecalho.findIndex(c => c === 'categoria');
  const colOperacao = cabecalho.findIndex(c => c === 'operacao' || c === 'operação');

  if (colNome === -1 || colQuantidade === -1) {
    const colunasList = cabecalho.map((c, i) => '   ' + (i + 1) + '. "' + c + '"').join('\n');
    const erro = '❌ Colunas obrigatórias não encontradas!\n\n' +
      '📋 Colunas no arquivo (' + cabecalho.length + '):\n' + colunasList + '\n\n' +
      '✅ Colunas obrigatórias:\n' +
      '   - Nome: "nome", "produto", "item"\n' +
      '   - Quantidade: "quantidade", "qtd"\n\n' +
      '💡 Verifique se a primeira linha tem os nomes das colunas!';
    throw new Error(erro);
  }

  console.log('[Excel] Colunas: SKU=' + colSku + ', Nome=' + colNome + ', Qtd=' + colQuantidade + ', Valor=' + colValorUnit);

  const produtos = [];
  for (let i = 1; i < dados.length; i++) {
    const linha = dados[i] as string[];

    const sku = colSku >= 0 ? String(linha[colSku] || '').trim() : null;
    const nome = String(linha[colNome] || '').trim();
    const qtdText = String(linha[colQuantidade] || '0').trim();
    const valorText = colValorUnit >= 0 ? String(linha[colValorUnit] || '').trim() : '';

    const quantidade = parseFloat(qtdText.replace(',', '.')) || 0;
    const valorUnit = valorText ? parseFloat(valorText.replace(',', '.')) : null;

    const categoria = colCategoria >= 0 ? String(linha[colCategoria] || '').trim() : null;
    const operacao = colOperacao >= 0 ? String(linha[colOperacao] || '').trim() : 'Venda';

    if (nome && quantidade > 0) {
      produtos.push({
        linha: i + 1,
        sku,
        produto: nome,
        quantidade,
        valor_unitario: valorUnit,
        valor_total: valorUnit ? valorUnit * quantidade : null,
        categoria,
        operacao
      });
    }
  }

  console.log('[Excel] ' + produtos.length + ' produtos válidos extraídos');

  if (produtos.length === 0) {
    throw new Error('Nenhum produto válido encontrado. Verifique se as colunas "nome" e "quantidade" estão preenchidas.');
  }

  return produtos;
}

async function processarPDF(fileBuffer: ArrayBuffer) {
  console.log('[PDF] Processando arquivo PDF com IA');

  const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

  const prompt = `Analise este PDF de vendas e extraia os produtos vendidos.

Para cada produto, retorne:
- sku (código/SKU se tiver)
- nome (nome do produto)
- quantidade (quantidade vendida)
- valor_unitario (valor unitário se tiver)

Retorne JSON:
{
  "produtos": [
    {
      "sku": "código ou null",
      "nome": "nome do produto",
      "quantidade": número,
      "valor_unitario": número ou null
    }
  ]
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    throw new Error("Erro ao processar PDF com IA: " + response.statusText);
  }

  const data = await response.json();
  const resultado = JSON.parse(data.choices[0].message.content);

  return resultado.produtos.map((p: any, i: number) => ({
    linha: i + 1,
    sku: p.sku,
    produto: p.nome,
    quantidade: p.quantidade,
    valor_unitario: p.valor_unitario,
    valor_total: p.valor_unitario ? p.valor_unitario * p.quantidade : null,
    categoria: null,
    operacao: 'Venda'
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("user_id") as string;

    if (!file) {
      throw new Error("Arquivo é obrigatório");
    }

    // Converter string vazia em null para UUID
    const userIdFinal = userId && userId.trim() !== '' ? userId : null;

    const fileName = file.name.toLowerCase();
    console.log('[Import] Arquivo: ' + file.name + ', Tamanho: ' + file.size + ', Tipo: ' + file.type);

    const fileBuffer = await file.arrayBuffer();
    let dadosVendas = [];

    if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx') ||
        file.type.includes('spreadsheet') || file.type.includes('excel')) {
      dadosVendas = await processarExcel(fileBuffer);
    } else if (fileName.endsWith('.pdf') || file.type.includes('pdf')) {
      if (!OPENAI_API_KEY) {
        throw new Error("PDF requer OpenAI API Key configurada. Use arquivos Excel (.xls ou .xlsx).");
      }
      dadosVendas = await processarPDF(fileBuffer);
    } else {
      throw new Error("Formato não suportado. Use arquivos XLS ou XLSX de vendas.");
    }

    if (dadosVendas.length === 0) {
      throw new Error("Nenhum produto encontrado no arquivo. Verifique se é um arquivo de vendas válido.");
    }

    console.log('[Parse] ' + dadosVendas.length + ' produtos extraídos');

    const { data: todosEstoques } = await supabase
      .from('estoques')
      .select('*')
      .eq('status', true)
      .order('nome');

    console.log('[DB] ' + (todosEstoques?.length || 0) + ' estoques disponíveis');

    const { data: todosItensEstoque } = await supabase
      .from('itens_estoque')
      .select('id, nome, codigo')
      .eq('status', 'ativo');

    console.log('[DB] ' + (todosItensEstoque?.length || 0) + ' itens cadastrados');

    const { data: saldosEstoque } = await supabase
      .from('saldos_estoque')
      .select('item_id, estoque_id, estoques(id, nome)')
      .gt('quantidade_atual', 0);

    console.log('[DB] ' + (saldosEstoque?.length || 0) + ' saldos com estoque');

    // Buscar mapeamentos da nova tabela (sistema Excel)
    const { data: mapeamentosExcel } = await supabase
      .from('mapeamentos_itens_excel')
      .select(`
        id,
        nome_item_externo,
        nome_normalizado,
        estoque_id,
        confianca,
        total_usos,
        itens_estoque!inner(id, nome, codigo)
      `)
      .eq('tipo_origem', 'vendas')
      .eq('ativo', true);

    console.log('[DB] ' + (mapeamentosExcel?.length || 0) + ' mapeamentos Excel cadastrados');

    // Buscar mapeamentos antigos (retrocompatibilidade)
    const { data: mapeamentos } = await supabase
      .from('mapeamento_itens_vendas')
      .select('*');

    console.log('[DB] ' + (mapeamentos?.length || 0) + ' mapeamentos históricos');

    const itemEstoqueMapa: Record<string, any[]> = {};
    for (const saldo of saldosEstoque || []) {
      if (!itemEstoqueMapa[saldo.item_id]) {
        itemEstoqueMapa[saldo.item_id] = [];
      }
      itemEstoqueMapa[saldo.item_id].push({
        estoque_id: saldo.estoque_id,
        estoque_nome: saldo.estoques?.nome
      });
    }

    const { data: importacao, error: errImport } = await supabase
      .from('importacoes_vendas')
      .insert([{
        arquivo_nome: file.name,
        arquivo_tamanho: file.size,
        total_linhas: dadosVendas.length,
        estoque_id: null,
        status: 'processando',
        dados_brutos: dadosVendas,
        criado_por: userIdFinal
      }])
      .select()
      .single();

    if (errImport || !importacao) {
      throw new Error("Erro ao criar importação: " + errImport?.message);
    }

    console.log('[DB] Importação criada: ' + importacao.id);

    const produtosUnicos = [...new Map(dadosVendas.map(d => [d.produto, d])).values()];

    console.log('[Match] Processando ' + produtosUnicos.length + ' produtos...');
    console.log('[Match] Itens cadastrados: ' + (todosItensEstoque?.length || 0));

    const mapDict: Record<string, any> = {};
    let totalMapeados = 0;

    for (const produto of produtosUnicos) {
      const normProd = normalizar(produto.produto);

      let melhorMatch = null;
      let melhorScore = 0;
      let metodoBusca = 'Sem match';
      let estoqueIdMapeado = null;

      // 1. PRIORIDADE: Verificar mapeamento Excel cadastrado
      const mapeamentoExcel = mapeamentosExcel?.find(
        m => normalizar(m.nome_item_externo) === normProd
      );

      if (mapeamentoExcel && mapeamentoExcel.itens_estoque) {
        melhorMatch = {
          id: mapeamentoExcel.itens_estoque.id,
          nome: mapeamentoExcel.itens_estoque.nome,
          codigo: mapeamentoExcel.itens_estoque.codigo
        };
        melhorScore = mapeamentoExcel.confianca / 100;
        estoqueIdMapeado = mapeamentoExcel.estoque_id;
        metodoBusca = 'Mapeamento Excel (confiança: ' + mapeamentoExcel.confianca + '%, usos: ' + mapeamentoExcel.total_usos + ')';

        console.log('[Map Excel] ' + produto.produto + ' → ' + melhorMatch.nome + ' (estoque: ' + estoqueIdMapeado + ')');
      }
      // 2. Tentar match por SKU/Código
      else if (produto.sku) {
        for (const item of todosItensEstoque || []) {
          if (item.codigo && normalizar(item.codigo) === normalizar(produto.sku)) {
            melhorMatch = item;
            melhorScore = 1.0;
            metodoBusca = 'Match por SKU: ' + produto.sku;
            break;
          }
        }
      }

      // 3. Fallback: Match fuzzy tradicional
      if (!melhorMatch) {
        for (const item of todosItensEstoque || []) {
          const score = similaridade(produto.produto, item.nome);
          if (score > melhorScore) {
            melhorScore = score;
            melhorMatch = item;
            metodoBusca = 'Match fuzzy: ' + melhorScore.toFixed(2);
          }
        }
      }

      if (melhorMatch && melhorScore >= 0.4) {
        totalMapeados++;

        // Definir estoque: priorizar mapeamento Excel, depois histórico, depois primeiro disponível
        let estoqueIdFinal = estoqueIdMapeado;
        let confiancaEstoque = 1.0;
        let estoqueNomeFinal = null;

        if (!estoqueIdFinal) {
          const mapHistorico = mapeamentos?.find(
            m => m.item_estoque_id === melhorMatch.id && m.nome_externo === produto.produto
          );

          const estoquesDoItem = itemEstoqueMapa[melhorMatch.id] || [];
          const estoqueHistorico = mapHistorico?.estoque_id;
          const estoqueSugerido = estoqueHistorico
            ? estoquesDoItem.find(e => e.estoque_id === estoqueHistorico)
            : estoquesDoItem[0];

          estoqueIdFinal = estoqueSugerido?.estoque_id || null;
          estoqueNomeFinal = estoqueSugerido?.estoque_nome || null;
          confiancaEstoque = mapHistorico ? 0.9 : (estoqueSugerido ? 0.5 : 0.3);
        } else {
          // Buscar nome do estoque mapeado
          const estoqueInfo = todosEstoques?.find(e => e.id === estoqueIdFinal);
          estoqueNomeFinal = estoqueInfo?.nome || null;
        }

        mapDict[normProd] = {
          produto_externo: produto.produto,
          item_estoque_id: melhorMatch.id,
          item_estoque_nome: melhorMatch.nome,
          estoque_id: estoqueIdFinal,
          estoque_nome: estoqueNomeFinal,
          confianca_item: melhorScore,
          confianca_estoque: confiancaEstoque,
          razao: metodoBusca
        };
      }
    }

    console.log('[Match] ' + totalMapeados + ' de ' + produtosUnicos.length + ' mapeados');

    // Criar set de IDs de estoques válidos para validação
    const estoquesValidosIds = new Set((todosEstoques || []).map(e => e.id));
    console.log('[Validação] Estoques válidos:', Array.from(estoquesValidosIds));

    const itensImportacao = [];
    for (const venda of dadosVendas) {
      const map = mapDict[normalizar(venda.produto)];

      // Validar estoque_id: deve ser null ou um UUID válido que existe na tabela estoques
      let estoqueIdValidado = null;
      if (map?.estoque_id) {
        if (estoquesValidosIds.has(map.estoque_id)) {
          estoqueIdValidado = map.estoque_id;
        } else {
          console.warn('[Validação] Estoque ID inválido ignorado:', map.estoque_id, 'para produto:', venda.produto);
        }
      }

      itensImportacao.push({
        importacao_id: importacao.id,
        linha_numero: venda.linha,
        nome_produto_externo: venda.produto,
        quantidade: venda.quantidade,
        valor_unitario: venda.valor_unitario,
        valor_total: venda.valor_total,
        item_estoque_id: map?.item_estoque_id || null,
        item_estoque_nome: map?.item_estoque_nome || null,
        estoque_id: estoqueIdValidado,
        status: (map?.item_estoque_id && estoqueIdValidado) ? 'mapeado' : 'pendente',
        confianca_mapeamento: map?.confianca_item || 0,
        confianca_estoque: map?.confianca_estoque || 0,
        dados_originais: venda
      });
    }

    console.log('[DB] Criando ' + itensImportacao.length + ' itens de importação...');

    const { error: errItens } = await supabase
      .from('itens_importacao_vendas')
      .insert(itensImportacao);

    if (errItens) {
      console.error('[DB] Erro ao criar itens:', errItens);
      throw new Error("Erro ao criar itens: " + errItens.message);
    }

    console.log('[DB] Itens criados com sucesso!');

    await supabase
      .from('importacoes_vendas')
      .update({
        status: 'revisao',
        resultado: {
          formato: fileName.endsWith('.pdf') ? 'PDF' : 'Excel',
          total_mapeados: itensImportacao.filter(i => i.status === 'mapeado').length,
          total_pendentes: itensImportacao.filter(i => i.status === 'pendente').length
        }
      })
      .eq('id', importacao.id);

    console.log('[Concluído] Importação pronta para revisão');

    return new Response(
      JSON.stringify({
        success: true,
        importacao_id: importacao.id,
        total_itens: dadosVendas.length,
        mapeados: itensImportacao.filter(i => i.status === 'mapeado').length,
        pendentes: itensImportacao.filter(i => i.status === 'pendente').length,
        formato: fileName.endsWith('.pdf') ? 'PDF' : 'Excel',
        message: "Arquivo processado com sucesso. Revise os mapeamentos e estoques antes de confirmar."
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
