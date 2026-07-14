import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

function escaparTexto(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .trim();
}

function similaridade(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const removeAcentos = (str: string) => {
    return str.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  };

  const s1Norm = removeAcentos(s1);
  const s2Norm = removeAcentos(s2);

  if (s1Norm === s2Norm) return 0.95;
  if (s1Norm.includes(s2Norm) || s2Norm.includes(s1Norm)) return 0.85;

  const palavras1 = s1Norm.split(/\\s+/).filter(p => p.length > 2);
  const palavras2 = s2Norm.split(/\\s+/).filter(p => p.length > 2);

  if (palavras1.length === 0 || palavras2.length === 0) return 0;

  let matches = 0;
  let matchesParciais = 0;

  for (const p1 of palavras1) {
    for (const p2 of palavras2) {
      if (p1 === p2) {
        matches++;
        break;
      } else if (p1.includes(p2) || p2.includes(p1)) {
        matchesParciais += 0.5;
        break;
      }
    }
  }

  return (matches + matchesParciais) / Math.max(palavras1.length, palavras2.length);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      throw new Error("Method not allowed");
    }

    const { mensagem } = await req.json();

    if (!mensagem || mensagem.trim() === "") {
      throw new Error("Mensagem nao fornecida");
    }

    console.log(`[Lancamento] Mensagem recebida`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('[DB] Buscando dados...');

    const { data: fornecedores } = await supabase
      .from('fornecedores')
      .select('id, nome')
      .eq('status', 'ativo');

    const { data: colaboradores } = await supabase
      .from('colaboradores')
      .select('id, nome_completo, funcao_id')
      .eq('status', 'ativo');

    const { data: categorias } = await supabase
      .from('categorias_financeiras')
      .select('id, nome, tipo')
      .eq('tipo', 'despesa');

    console.log(`[DB] ${fornecedores?.length || 0} fornecedores, ${colaboradores?.length || 0} colaboradores, ${categorias?.length || 0} categorias`);

    const fornecedoresSimples = (fornecedores || []).map(f => ({
      id: f.id,
      nome: escaparTexto(f.nome)
    }));
    const colaboradoresSimples = (colaboradores || []).map(c => ({
      id: c.id,
      nome: escaparTexto(c.nome_completo)
    }));
    const categoriasSimples = (categorias || []).map(cat => ({
      id: cat.id,
      nome: escaparTexto(cat.nome)
    }));

    let contextoPessoas = "FORNECEDORES CADASTRADOS:\\n";
    for (const f of fornecedoresSimples) {
      contextoPessoas += `- ${f.nome} (ID: ${f.id})\\n`;
    }

    contextoPessoas += "\\nCOLABORADORES (RH) CADASTRADOS:\\n";
    for (const c of colaboradoresSimples) {
      contextoPessoas += `- ${c.nome} (ID: ${c.id})\\n`;
    }

    contextoPessoas += "\\nCATEGORIAS DISPONIVEIS:\\n";
    for (const cat of categoriasSimples) {
      contextoPessoas += `- ${cat.nome} (ID: ${cat.id})\\n`;
    }

    const extractionPrompt = `Voce e um assistente financeiro especializado em lancamento de contas a pagar.

${contextoPessoas}

TAREFA: Extrair todos os lancamentos da mensagem do usuario e estruturar cada um.

REGRAS CRITICAS:

1. IDENTIFICACAO DE PESSOAS:
   - Extraia APENAS o nome da pessoa de cada linha (ex: "kadu", "augusto", "cristiano")
   - NAO inclua palavras como "salario", "ferias", "atrasado" no nome
   - O nome e geralmente a primeira ou segunda palavra

2. MATCHING DE FORNECEDOR/COLABORADOR:
   - Busque o nome extraido TANTO em FORNECEDORES quanto em COLABORADORES
   - Priorize FORNECEDORES pois sao mais especificos
   - Use busca fuzzy: "kadu" pode ser "KADU MENDES", "Carlos Eduardo", etc
   - Compare o nome extraido com TODOS os fornecedores primeiro
   - Se nao encontrar, busque em colaboradores
   - Se nao encontrar em lugar nenhum, retorne encontrado: false

3. CATEGORIZACAO:
   - Salario/Salario atrasado -> categoria que contenha "Salario" ou "Folha"
   - Ferias -> categoria que contenha "Ferias" ou "Encargos"
   - 13 salario -> categoria "13 Salario" ou "Encargos"
   - Freelancer/Extra -> categoria "Servicos" ou "Terceiros"

4. DESCRICAO:
   - Formato: "[Tipo] - [Nome da Pessoa]"
   - Exemplos:
     * "Salario Novembro/2025 - Carlos Eduardo"
     * "Pagamento de Ferias - Cristiano"
     * "Salario Atrasado Outubro - Carlos Eduardo"
   - NUNCA inclua nome de fornecedor aleatorio
   - Sempre use o nome real da pessoa

5. DATA DE VENCIMENTO:
   - Extraia a data mencionada na mensagem
   - Formato: YYYY-MM-DD
   - Se mencionar "03/11" use o ano 2025
   - Se a data ja passou, use 2025

6. VALOR:
   - Extraia apenas numeros
   - Formato decimal: use ponto (1000.00, 1750.00)

Retorne APENAS JSON valido no formato:
{
  "data_vencimento_geral": "YYYY-MM-DD",
  "contexto": "descricao do contexto",
  "lancamentos": [
    {
      "nome_pessoa": "nome extraido (ex: kadu, augusto, cristiano)",
      "descricao": "Salario Novembro/2025 - [Nome Real]",
      "valor": 1000.00,
      "data_vencimento": "YYYY-MM-DD",
      "fornecedor_match": {
        "encontrado": true/false,
        "tipo": "colaborador" ou "fornecedor",
        "id": "uuid ou null",
        "nome_cadastrado": "nome exato do banco",
        "confianca": 0.0 a 1.0
      },
      "categoria_sugerida": {
        "id": "uuid",
        "nome": "nome da categoria"
      },
      "tipo_conta": "salario|ferias|freelancer|vale|outros",
      "observacoes": "observacoes"
    }
  ]
}`;

    console.log('[IA] Extraindo e estruturando lancamentos...');

    const extractionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: extractionPrompt,
          },
          {
            role: "user",
            content: mensagem,
          },
        ],
        response_format: {
          type: "json_object",
        },
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error(`OpenAI API error: ${extractionResponse.status} - ${errorText}`);
      throw new Error("Erro ao processar lancamentos com IA");
    }

    const extractionData = await extractionResponse.json();
    const estruturado = JSON.parse(extractionData.choices[0].message.content);

    console.log('[IA] Estrutura extraida');

    const lancamentosProcessados = [];
    const erros = [];
    const pendentesRevisao = [];

    for (const [index, lanc] of estruturado.lancamentos.entries()) {
      try {
        let fornecedorId = null;
        let nomeCompleto = '';
        const nomePessoa = lanc.nome_pessoa?.toLowerCase().trim() || '';

        console.log(`[${index + 1}] Processando: ${lanc.descricao}`);

        if (lanc.fornecedor_match?.encontrado && lanc.fornecedor_match?.id) {
          if (lanc.fornecedor_match.tipo === 'colaborador') {
            nomeCompleto = lanc.fornecedor_match.nome_cadastrado;

            const { data: fornExistente } = await supabase
              .from('fornecedores')
              .select('id')
              .eq('nome', nomeCompleto)
              .maybeSingle();

            if (fornExistente) {
              fornecedorId = fornExistente.id;
            } else {
              const { data: novoForn, error: errNovoForn } = await supabase
                .from('fornecedores')
                .insert([{ nome: nomeCompleto, status: 'ativo' }])
                .select()
                .maybeSingle();

              if (errNovoForn || !novoForn) {
                throw new Error(`Erro ao criar fornecedor para ${nomeCompleto}`);
              }

              fornecedorId = novoForn.id;
            }
          } else {
            fornecedorId = lanc.fornecedor_match.id;
            nomeCompleto = lanc.fornecedor_match.nome_cadastrado;
          }
        }
        else if (nomePessoa) {
          let melhorMatch = null;
          let melhorScore = 0;

          for (const forn of fornecedores || []) {
            const score = similaridade(nomePessoa, forn.nome);
            if (score > melhorScore) {
              melhorScore = score;
              melhorMatch = { ...forn, tipo: 'fornecedor' };
            }
          }

          if (melhorScore < 0.8) {
            for (const colab of colaboradores || []) {
              const score = similaridade(nomePessoa, colab.nome_completo);
              if (score > melhorScore) {
                melhorScore = score;
                melhorMatch = { ...colab, nome: colab.nome_completo, tipo: 'colaborador' };
              }
            }
          }

          if (melhorMatch && melhorScore >= 0.3) {
            nomeCompleto = melhorMatch.nome;

            if (melhorMatch.tipo === 'colaborador') {
              const { data: fornExistente } = await supabase
                .from('fornecedores')
                .select('id')
                .eq('nome', nomeCompleto)
                .maybeSingle();

              if (fornExistente) {
                fornecedorId = fornExistente.id;
              } else {
                const { data: novoForn } = await supabase
                  .from('fornecedores')
                  .insert([{ nome: nomeCompleto, status: 'ativo' }])
                  .select()
                  .maybeSingle();

                fornecedorId = novoForn?.id || null;
              }
            } else {
              fornecedorId = melhorMatch.id;
            }
          } else {
            const sugestoes = [];
            for (const forn of fornecedores || []) {
              sugestoes.push({ ...forn, score: similaridade(nomePessoa, forn.nome) });
            }
            for (const colab of colaboradores || []) {
              sugestoes.push({
                id: colab.id,
                nome: colab.nome_completo,
                tipo: 'colaborador',
                score: similaridade(nomePessoa, colab.nome_completo)
              });
            }

            sugestoes.sort((a, b) => b.score - a.score);

            pendentesRevisao.push({
              index: index,
              lancamento: lanc,
              nome_buscado: nomePessoa,
              sugestoes: sugestoes.slice(0, 5)
            });

            continue;
          }
        } else {
          pendentesRevisao.push({
            index: index,
            lancamento: lanc,
            nome_buscado: '',
            sugestoes: fornecedores?.slice(0, 5).map(f => ({ ...f, score: 0 })) || []
          });

          continue;
        }

        if (!fornecedorId) {
          pendentesRevisao.push({
            index: index,
            lancamento: lanc,
            nome_buscado: nomePessoa,
            sugestoes: fornecedores?.slice(0, 5).map(f => ({ ...f, score: 0 })) || [],
            erro: 'Fornecedor nao identificado'
          });
          continue;
        }

        const contaData = {
          fornecedor_id: fornecedorId,
          categoria_id: lanc.categoria_sugerida?.id || null,
          descricao: lanc.descricao,
          valor_original: lanc.valor,
          valor_total: lanc.valor,
          data_vencimento: lanc.data_vencimento,
          status: 'em_aberto',
          eh_recorrente: false,
          eh_parcelado: false,
          observacoes: lanc.observacoes || `Lancado via IA - ${estruturado.contexto}`
        };

        const { data: novaConta, error: contaError } = await supabase
          .from('contas_pagar')
          .insert([contaData])
          .select()
          .single();

        if (contaError) {
          console.error(`[Erro] ${index + 1}:`, contaError);
          erros.push({
            lancamento: lanc.descricao,
            erro: contaError.message
          });
        } else {
          lancamentosProcessados.push({
            ...lanc,
            conta_id: novaConta.id,
            fornecedor_id: fornecedorId,
            fornecedor_nome: nomeCompleto,
            sucesso: true
          });
          console.log(`[${index + 1}] Criada`);
        }
      } catch (err) {
        console.error(`[Erro] ${index + 1}:`, err);
        erros.push({
          lancamento: lanc.descricao,
          erro: err instanceof Error ? err.message : 'Erro desconhecido'
        });
      }
    }

    console.log(`[Resultado] ${lancamentosProcessados.length} criados, ${pendentesRevisao.length} pendentes, ${erros.length} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        resumo: {
          total_processado: estruturado.lancamentos.length,
          total_sucesso: lancamentosProcessados.length,
          total_pendente: pendentesRevisao.length,
          total_erros: erros.length,
          contexto: estruturado.contexto,
          data_vencimento_geral: estruturado.data_vencimento_geral
        },
        lancamentos_criados: lancamentosProcessados,
        pendentes_revisao: pendentesRevisao.length > 0 ? pendentesRevisao : null,
        erros: erros.length > 0 ? erros : null,
        estrutura_extraida: estruturado
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});