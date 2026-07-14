import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { importacao_id, itens_revisados, salvar_mapeamentos } = await req.json();

    if (!importacao_id) {
      throw new Error("ID da importação é obrigatório");
    }

    console.log(`[Confirmar] Importação: ${importacao_id}`);

    const { data: importacao } = await supabase
      .from('importacoes_vendas')
      .select('*, estoques(id, nome)')
      .eq('id', importacao_id)
      .single();

    if (!importacao) {
      throw new Error("Importação não encontrada");
    }

    if (itens_revisados && itens_revisados.length > 0) {
      for (const item of itens_revisados) {
        const updateData: any = {
          status: 'mapeado',
          confianca_mapeamento: 1.0
        };

        if (item.ficha_tecnica_id) {
          updateData.ficha_tecnica_id = item.ficha_tecnica_id;
          updateData.tipo_mapeamento = 'ficha_tecnica';
          updateData.item_estoque_id = null;
        } else {
          updateData.item_estoque_id = item.item_estoque_id;
          updateData.item_estoque_nome = item.item_estoque_nome;
          updateData.tipo_mapeamento = 'item';
          updateData.ficha_tecnica_id = null;
        }

        await supabase
          .from('itens_importacao_vendas')
          .update(updateData)
          .eq('id', item.id);
      }

      console.log(`[Update] ${itens_revisados.length} itens atualizados`);
    }

    const { data: itens } = await supabase
      .from('itens_importacao_vendas')
      .select('*')
      .eq('importacao_id', importacao_id)
      .eq('status', 'mapeado');

    if (!itens || itens.length === 0) {
      throw new Error("Nenhum item mapeado para processar");
    }

    console.log(`[Process] ${itens.length} itens para processar`);

    let sucessos = 0;
    let erros = 0;

    for (const item of itens) {
      try {
        if (!item.estoque_id) {
          throw new Error(`Item ${item.nome_produto_externo} não tem estoque definido`);
        }

        if (item.tipo_mapeamento === 'ficha_tecnica' && item.ficha_tecnica_id) {
          console.log(`[Ficha] Processando ficha técnica: ${item.ficha_tecnica_id}`);

          const { data: ingredientes, error: errIngredientes } = await supabase
            .from('ficha_ingredientes')
            .select('item_estoque_id, quantidade')
            .eq('ficha_id', item.ficha_tecnica_id);

          if (errIngredientes) throw errIngredientes;

          if (!ingredientes || ingredientes.length === 0) {
            throw new Error(`Ficha técnica ${item.ficha_tecnica_id} sem ingredientes`);
          }

          const { data: movComposta, error: errComposta } = await supabase
            .from('movimentacoes_compostas')
            .insert([{
              tipo: 'venda',
              referencia_tipo: 'importacao_vendas',
              referencia_id: importacao_id,
              descricao: `Venda importada: ${item.nome_produto_externo} (${item.quantidade}x)`
            }])
            .select()
            .single();

          if (errComposta) throw errComposta;

          const movimentacoes = ingredientes.map(ing => ({
            estoque_origem_id: item.estoque_id,
            estoque_destino_id: null,
            item_id: ing.item_estoque_id,
            tipo_movimentacao: 'saida',
            quantidade: ing.quantidade * item.quantidade,
            custo_unitario: 0,
            custo_total: 0,
            data_movimentacao: new Date().toISOString().split('T')[0],
            motivo: 'Venda importada - Ficha técnica',
            observacoes: `Importação: ${item.nome_produto_externo}`,
            origem: 'importacao_vendas_ficha',
            referencia_id: importacao_id,
            criado_por: importacao.criado_por
          }));

          const { data: movsInsert, error: errMovs } = await supabase
            .from('movimentacoes_estoque')
            .insert(movimentacoes)
            .select();

          if (errMovs) throw errMovs;

          const itensComposta = (movsInsert || []).map(mov => ({
            composta_id: movComposta.id,
            movimentacao_id: mov.id,
            tipo_item: 'insumo'
          }));

          const { error: errItens } = await supabase
            .from('movimentacoes_compostas_itens')
            .insert(itensComposta);

          if (errItens) throw errItens;

          await supabase
            .from('itens_importacao_vendas')
            .update({
              status: 'processado',
              movimentacao_id: movComposta.id,
              processado_em: new Date().toISOString()
            })
            .eq('id', item.id);

        } else {
          const { data: movimentacao, error: errMov } = await supabase
            .from('movimentacoes_estoque')
            .insert([{
              estoque_origem_id: item.estoque_id,
              item_id: item.item_estoque_id,
              tipo_movimentacao: 'saida',
              quantidade: item.quantidade,
              custo_unitario: 0,
              custo_total: 0,
              data_movimentacao: new Date().toISOString().split('T')[0],
              origem: 'importacao_vendas',
              referencia_id: importacao_id,
              observacoes: `Venda importada: ${item.nome_produto_externo}`,
              criado_por: importacao.criado_por
            }])
            .select()
            .single();

          if (errMov) throw errMov;

          await supabase
            .from('itens_importacao_vendas')
            .update({
              status: 'processado',
              movimentacao_id: movimentacao.id,
              processado_em: new Date().toISOString()
            })
            .eq('id', item.id);
        }

        // Registrar uso de mapeamento Excel se existir
        const { data: mapeamentoExcel } = await supabase
          .from('mapeamentos_itens_excel')
          .select('id')
          .eq('nome_normalizado', item.nome_produto_externo
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim())
          .eq('estoque_id', item.item_estoque_id)
          .eq('tipo_origem', 'vendas')
          .eq('ativo', true)
          .maybeSingle();

        if (mapeamentoExcel) {
          await supabase.rpc('registrar_uso_mapeamento', {
            p_mapeamento_id: mapeamentoExcel.id,
            p_tipo_operacao: 'importacao_vendas',
            p_referencia: importacao_id,
            p_usuario_id: importacao.criado_por
          });
          console.log(`[Mapeamento] Uso registrado para item ${item.nome_produto_externo}`);
        }

        if (salvar_mapeamentos) {
          const nomeNormalizado = item.nome_produto_externo
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const checkConditions: any = {
            nome_externo: item.nome_produto_externo,
            estoque_id: item.estoque_id
          };

          if (item.tipo_mapeamento === 'ficha_tecnica') {
            checkConditions.ficha_tecnica_id = item.ficha_tecnica_id;
          } else {
            checkConditions.item_estoque_id = item.item_estoque_id;
          }

          // Salvar na tabela antiga (retrocompatibilidade)
          const { data: mapExistente } = await supabase
            .from('mapeamento_itens_vendas')
            .select('id')
            .match(checkConditions)
            .maybeSingle();

          if (!mapExistente) {
            const mapeamentoData: any = {
              nome_externo: item.nome_produto_externo,
              nome_normalizado: nomeNormalizado,
              estoque_id: item.estoque_id,
              tipo_mapeamento: item.tipo_mapeamento || 'item',
              origem: itens_revisados?.some((r: any) => r.id === item.id) ? 'manual' : 'ia',
              confianca: item.confianca_mapeamento,
              usado_vezes: 1,
              ultima_utilizacao: new Date().toISOString(),
              criado_por: importacao.criado_por
            };

            if (item.tipo_mapeamento === 'ficha_tecnica') {
              mapeamentoData.ficha_tecnica_id = item.ficha_tecnica_id;
              mapeamentoData.item_estoque_id = null;
            } else {
              mapeamentoData.item_estoque_id = item.item_estoque_id;
              mapeamentoData.ficha_tecnica_id = null;
            }

            await supabase
              .from('mapeamento_itens_vendas')
              .insert([mapeamentoData]);
          }

          // Salvar também na nova tabela Excel se for mapeamento de item (não ficha técnica)
          if (item.tipo_mapeamento !== 'ficha_tecnica' && !mapeamentoExcel) {
            const { data: mapExcelExistente } = await supabase
              .from('mapeamentos_itens_excel')
              .select('id')
              .eq('nome_normalizado', nomeNormalizado)
              .eq('estoque_id', item.item_estoque_id)
              .eq('tipo_origem', 'vendas')
              .eq('ativo', true)
              .maybeSingle();

            if (!mapExcelExistente) {
              const confiancaFinal = itens_revisados?.some((r: any) => r.id === item.id) ? 100 : Math.round((item.confianca_mapeamento || 0.5) * 100);

              await supabase
                .from('mapeamentos_itens_excel')
                .insert([{
                  nome_item_externo: item.nome_produto_externo,
                  estoque_id: item.item_estoque_id,
                  tipo_origem: 'vendas',
                  confianca: confiancaFinal,
                  criado_por: importacao.criado_por,
                  metadata: {
                    origem: 'importacao_vendas_automatica',
                    importacao_id: importacao_id
                  }
                }]);

              console.log(`[Novo Mapeamento] Criado para ${item.nome_produto_externo}`);
            }
          }
        }

        sucessos++;
        console.log(`[OK] Item ${item.id} processado`);

      } catch (err) {
        erros++;
        console.error(`[Erro] Item ${item.id}:`, err);

        await supabase
          .from('itens_importacao_vendas')
          .update({
            status: 'erro',
            erro_mensagem: err instanceof Error ? err.message : 'Erro desconhecido'
          })
          .eq('id', item.id);
      }
    }

    await supabase
      .from('importacoes_vendas')
      .update({
        status: 'concluido',
        total_sucesso: sucessos,
        total_erro: erros,
        processado_em: new Date().toISOString()
      })
      .eq('id', importacao_id);

    console.log(`[Concluído] ${sucessos} sucessos, ${erros} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        total_processado: itens.length,
        total_sucesso: sucessos,
        total_erro: erros,
        message: `Importação concluída: ${sucessos} itens processados com sucesso`
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