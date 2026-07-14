import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LinhaConsumo {
  funcionario: string;
  data: string;
  valor: number;
}

interface ResultadoProcessamento {
  success: boolean;
  total_linhas: number;
  processadas: number;
  erros: number;
  detalhes: any[];
  erros_lista: any[];
  nao_encontrados: any[];
  historico_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { linhas, arquivo_nome, mapeamentos_manuais } = await req.json();

    if (!linhas || !Array.isArray(linhas)) {
      throw new Error("Dados inválidos. Esperado array de linhas.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resultado: ResultadoProcessamento = {
      success: true,
      total_linhas: linhas.length,
      processadas: 0,
      erros: 0,
      detalhes: [],
      erros_lista: [],
      nao_encontrados: [],
    };

    for (const linha of linhas) {
      try {
        const { funcionario, data, valor } = linha;

        if (!funcionario || !data || valor === undefined) {
          throw new Error("Linha incompleta: faltam campos obrigatórios");
        }

        let dataFormatada = data;
        console.log(`[DATA DEBUG] Original: "${data}" (tipo: ${typeof data})`);

        if (typeof data === 'string') {
          const dataTrimmed = data.trim();

          // Formato: "2025 20:51-11-06" → extrair ano do início e mês-dia do final
          const matchTimestamp = dataTrimmed.match(/^(\d{4})\s+\d{2}:\d{2}-(\d{2})-(\d{2})$/);
          if (matchTimestamp) {
            const [fullMatch, ano, mes, dia] = matchTimestamp;
            dataFormatada = `${ano}-${mes}-${dia}`;
            console.log(`[DATA DEBUG] Timestamp detectado: ${fullMatch} → ano=${ano} mes=${mes} dia=${dia} → ${dataFormatada}`);
          }
          // Se não deu match no timestamp, verificar se já está no formato YYYY-MM-DD
          else if (dataTrimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
            dataFormatada = dataTrimmed;
            console.log(`[DATA DEBUG] Já está no formato correto: ${dataFormatada}`);
          }
          // Formato DD/MM/YYYY
          else if (dataTrimmed.match(/^\d{2}\/\d{2}\/\d{4}/)) {
            const [dia, mes, ano] = dataTrimmed.split('/');
            dataFormatada = `${ano}-${mes}-${dia}`;
            console.log(`[DATA DEBUG] DD/MM/YYYY: ${dataTrimmed} → ${dataFormatada}`);
          }
          // Formato DD-MM-YYYY
          else if (dataTrimmed.match(/^\d{2}-\d{2}-\d{4}/)) {
            const parts = dataTrimmed.split('-');
            dataFormatada = `${parts[2]}-${parts[1]}-${parts[0]}`;
            console.log(`[DATA DEBUG] DD-MM-YYYY: ${dataTrimmed} → ${dataFormatada}`);
          }
          // Último recurso: pegar só a primeira parte se tiver espaço
          else if (dataTrimmed.includes(' ')) {
            const primeiraParte = dataTrimmed.split(' ')[0];
            console.log(`[DATA DEBUG] Contém espaço, tentando primeira parte: ${primeiraParte}`);
            // Verificar se a primeira parte está no formato correto
            if (primeiraParte.match(/^\d{4}-\d{2}-\d{2}$/)) {
              dataFormatada = primeiraParte;
            }
          }
        }

        console.log(`[DATA DEBUG] Resultado final: ${dataFormatada}`);

        if (!dataFormatada.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const msgErro = `Formato de data inválido. Original: "${data}", Processado: "${dataFormatada}"`;
          console.error(`[DATA DEBUG] ${msgErro}`);
          throw new Error(msgErro);
        }

        let colaboradorId: string;
        let nomeOficial: string;
        let similaridade: number;
        let origem: string;
        let metodoMatch: string;

        if (mapeamentos_manuais && mapeamentos_manuais[funcionario]) {
          colaboradorId = mapeamentos_manuais[funcionario];

          const colabResponse = await fetch(
            `${supabaseUrl}/rest/v1/colaboradores?id=eq.${colaboradorId}&select=nome_completo`,
            {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
              },
            }
          );

          const colabData = await colabResponse.json();
          nomeOficial = colabData[0]?.nome_completo || funcionario;
          similaridade = 100;
          origem = "manual";
          metodoMatch = "manual";

          await fetch(`${supabaseUrl}/rest/v1/mapeamento_nomes_consumo`, {
            method: "POST",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify({
              colaborador_id: colaboradorId,
              nome_oficial: nomeOficial,
              nome_variacao: funcionario,
              tipo_colaborador: "funcionario",
              similaridade_score: 100,
              quantidade_usos: 1,
            }),
          });
        } else {
          const buscaResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/buscar_colaborador_por_nome_avancado`,
            {
              method: "POST",
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                p_nome: funcionario,
                p_tipo: "funcionario",
                p_limite_similaridade: 60,
              }),
            }
          );

          if (!buscaResponse.ok) {
            throw new Error(`Erro ao buscar colaborador: ${buscaResponse.statusText}`);
          }

          const colaboradoresEncontrados = await buscaResponse.json();

          if (!colaboradoresEncontrados || colaboradoresEncontrados.length === 0) {
            resultado.nao_encontrados.push(linha);
            continue;
          }

          const colaborador = colaboradoresEncontrados[0];
          colaboradorId = colaborador.colaborador_id;
          nomeOficial = colaborador.nome_oficial;
          similaridade = colaborador.similaridade;
          origem = colaborador.origem;
          metodoMatch = colaborador.metodo_match || 'fuzzy';
        }

        if (origem === "direto" || funcionario.toLowerCase() !== nomeOficial.toLowerCase()) {
          const mapeamentoResponse = await fetch(
            `${supabaseUrl}/rest/v1/mapeamento_nomes_consumo`,
            {
              method: "POST",
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates",
              },
              body: JSON.stringify({
                colaborador_id: colaboradorId,
                nome_oficial: nomeOficial,
                nome_variacao: funcionario,
                tipo_colaborador: "funcionario",
                similaridade_score: similaridade,
                quantidade_usos: 1,
              }),
            }
          );

          if (!mapeamentoResponse.ok) {
            const existenteResponse = await fetch(
              `${supabaseUrl}/rest/v1/mapeamento_nomes_consumo?nome_variacao=eq.${encodeURIComponent(funcionario)}&tipo_colaborador=eq.funcionario&select=quantidade_usos`,
              {
                headers: {
                  apikey: supabaseKey,
                  Authorization: `Bearer ${supabaseKey}`,
                },
              }
            );

            const existenteData = await existenteResponse.json();
            const quantidadeAtual = existenteData[0]?.quantidade_usos || 0;

            await fetch(
              `${supabaseUrl}/rest/v1/mapeamento_nomes_consumo?nome_variacao=eq.${encodeURIComponent(funcionario)}&tipo_colaborador=eq.funcionario`,
              {
                method: "PATCH",
                headers: {
                  apikey: supabaseKey,
                  Authorization: `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  quantidade_usos: quantidadeAtual + 1,
                }),
              }
            );
          }
        }

        const funcaoResponse = await fetch(
          `${supabaseUrl}/rest/v1/colaboradores?id=eq.${colaboradorId}&select=funcao_personalizada`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          }
        );

        const funcaoData = await funcaoResponse.json();
        const funcao = funcaoData[0]?.funcao_personalizada?.toLowerCase() || "";
        const isGarcom = funcao.includes("garcom") || funcao.includes("garcon") || funcao.includes("garçom");

        console.log(`Colaborador: ${nomeOficial}, Função: ${funcao}, É garçom: ${isGarcom}`);

        if (isGarcom) {
          const descontoResponse = await fetch(`${supabaseUrl}/rest/v1/descontos_consumo`, {
            method: "POST",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              colaborador_id: colaboradorId,
              data_desconto: dataFormatada,
              valor_desconto: Math.abs(valor),
              tipo_consumo: "refeicao",
              descricao: `Consumo - ${arquivo_nome} (${funcionario})`,
            }),
          });

          if (!descontoResponse.ok) {
            const errorText = await descontoResponse.text();
            console.error('Erro ao inserir desconto:', errorText);
            throw new Error(`Erro ao inserir desconto: ${errorText}`);
          }
        } else {
          const ocorrenciaResponse = await fetch(`${supabaseUrl}/rest/v1/ocorrencias_colaborador`, {
            method: "POST",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              colaborador_id: colaboradorId,
              data_ocorrencia: dataFormatada,
              tipo_ocorrencia: "consumo",
              descricao: `Consumo - ${arquivo_nome} (${funcionario})`,
              valor_vale: Math.abs(valor),
              status: "aprovado",
              impacta_folha: true,
            }),
          });

          if (!ocorrenciaResponse.ok) {
            const errorText = await ocorrenciaResponse.text();
            console.error('Erro ao inserir ocorrência:', errorText);
            throw new Error(`Erro ao inserir ocorrência: ${errorText}`);
          }
        }

        resultado.processadas++;
        resultado.detalhes.push({
          nome_planilha: funcionario,
          nome_oficial: nomeOficial,
          similaridade: similaridade,
          metodo_match: metodoMatch,
          tipo: isGarcom ? "garcom" : "funcionario",
          valor: valor,
          data: data,
          status: "processado",
        });
      } catch (error) {
        resultado.erros++;
        resultado.erros_lista.push({
          linha: linha,
          erro: error.message,
        });
      }
    }

    if (!mapeamentos_manuais || Object.keys(mapeamentos_manuais).length === 0) {
      const historicoResponse = await fetch(
        `${supabaseUrl}/rest/v1/historico_processamento_consumo`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            arquivo_nome: arquivo_nome,
            total_linhas: resultado.total_linhas,
            linhas_processadas: resultado.processadas,
            linhas_erro: resultado.erros,
            total_valor: resultado.detalhes.reduce((sum, d) => sum + d.valor, 0),
            detalhes: resultado.detalhes,
            erros: resultado.erros_lista,
          }),
        }
      );

      if (historicoResponse.ok) {
        const historico = await historicoResponse.json();
        resultado.historico_id = historico[0]?.id;
      }
    }

    return new Response(JSON.stringify(resultado), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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