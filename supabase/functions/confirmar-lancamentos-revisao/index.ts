import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { lancamentos_revisados } = await req.json();

    if (!lancamentos_revisados || !Array.isArray(lancamentos_revisados)) {
      throw new Error("lancamentos_revisados não fornecido");
    }

    console.log(`[Confirmação] Processando ${lancamentos_revisados.length} lançamentos`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const lancamentosProcessados = [];
    const erros = [];

    for (const [index, item] of lancamentos_revisados.entries()) {
      try {
        const { lancamento, fornecedor_id, criar_novo_fornecedor, novo_fornecedor_nome } = item;

        let fornecedorFinal = fornecedor_id;

        // Se deve criar novo fornecedor
        if (criar_novo_fornecedor && novo_fornecedor_nome) {
          console.log(`[${index + 1}] Criando novo fornecedor: ${novo_fornecedor_nome}`);

          const { data: novoFornecedor, error: fornecedorError } = await supabase
            .from('fornecedores')
            .insert([{
              nome: novo_fornecedor_nome,
              tipo: 'pessoa_fisica',
              status: 'ativo'
            }])
            .select()
            .single();

          if (fornecedorError) {
            console.error(`[${index + 1}] Erro ao criar fornecedor:`, fornecedorError);
            throw new Error(`Erro ao criar fornecedor: ${fornecedorError.message}`);
          }

          fornecedorFinal = novoFornecedor.id;
          console.log(`[${index + 1}] Fornecedor criado: ${novoFornecedor.nome} (${novoFornecedor.id})`);
        }

        if (!fornecedorFinal) {
          throw new Error('Fornecedor não selecionado');
        }

        // Criar conta a pagar
        const contaData = {
          fornecedor_id: fornecedorFinal,
          categoria_id: lancamento.categoria_sugerida?.id || null,
          descricao: lancamento.descricao,
          valor_original: lancamento.valor,
          valor_total: lancamento.valor,
          data_vencimento: lancamento.data_vencimento,
          status: 'pendente',
          eh_recorrente: false,
          eh_parcelado: false,
          observacoes: lancamento.observacoes || 'Lançado via IA - Revisado'
        };

        console.log(`[${index + 1}] Inserindo conta:`, contaData);

        const { data: novaConta, error: contaError } = await supabase
          .from('contas_pagar')
          .insert([contaData])
          .select()
          .single();

        if (contaError) {
          console.error(`[${index + 1}] Erro ao criar conta:`, contaError);
          erros.push({
            lancamento: lancamento.descricao,
            erro: contaError.message
          });
        } else {
          lancamentosProcessados.push({
            conta_id: novaConta.id,
            descricao: lancamento.descricao,
            valor: lancamento.valor,
            fornecedor_id: fornecedorFinal,
            sucesso: true
          });
          console.log(`[${index + 1}] ✓ Conta criada com sucesso`);
        }
      } catch (err) {
        console.error(`[${index + 1}] Erro:`, err);
        erros.push({
          lancamento: item.lancamento?.descricao || 'Desconhecido',
          erro: err instanceof Error ? err.message : 'Erro desconhecido'
        });
      }
    }

    console.log(`[Resultado] ${lancamentosProcessados.length} criados, ${erros.length} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        resumo: {
          total_processado: lancamentos_revisados.length,
          total_sucesso: lancamentosProcessados.length,
          total_erros: erros.length
        },
        lancamentos_criados: lancamentosProcessados,
        erros: erros.length > 0 ? erros : null
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
