import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const fallback = (dominante: string, secundario: string) => ({
  resumo: `Perfil ${dominante}/${secundario} com características marcantes de ${dominante === 'D' ? 'liderança e foco em resultados' : dominante === 'I' ? 'entusiasmo e comunicação' : dominante === 'S' ? 'estabilidade e lealdade' : 'precisão e qualidade'}.`,
  pontos_fortes: [
    dominante === 'D' ? 'Tomada de decisão rápida' : dominante === 'I' ? 'Comunicação e persuasão' : dominante === 'S' ? 'Lealdade e consistência' : 'Atenção aos detalhes',
    'Comprometimento com a equipe',
    'Adaptabilidade às demandas do trabalho',
  ],
  pontos_fracos: [
    dominante === 'D' ? 'Pode ser impaciente com processos lentos' : dominante === 'I' ? 'Pode se dispersar com muitas tarefas' : dominante === 'S' ? 'Resistência a mudanças bruscas' : 'Dificuldade em delegar',
    'Em situações de alta pressão, pode demonstrar insegurança',
  ],
  areas_desenvolvimento: [
    'Gestão de conflitos interpessoais',
    'Comunicação assertiva em momentos de pressão',
  ],
  estilo_comunicacao: dominante === 'D' ? 'Prefere comunicação direta e objetiva, sem rodeios.' : dominante === 'I' ? 'Responde bem a elogios e conversas abertas.' : dominante === 'S' ? 'Valoriza escuta ativa e comunicação cuidadosa.' : 'Prefere informações precisas e bem estruturadas.',
  estilo_lideranca: dominante === 'D' ? 'Liderança diretiva, focada em metas e resultados.' : dominante === 'I' ? 'Liderança inspiradora, motiva pelo entusiasmo.' : dominante === 'S' ? 'Liderança colaborativa, cria ambientes seguros.' : 'Liderança estruturada, lidera pelo exemplo e precisão.',
  como_motivar: dominante === 'D' ? 'Desafios, autonomia e reconhecimento de conquistas.' : dominante === 'I' ? 'Elogios públicos, variedade e interação social.' : dominante === 'S' ? 'Estabilidade, reconhecimento discreto e equipe unida.' : 'Clareza de processos, qualidade reconhecida e padrões altos.',
  como_desafia: dominante === 'D' ? 'Ambiguidade, falta de controle ou resultados lentos.' : dominante === 'I' ? 'Isolamento, rotinas repetitivas e falta de reconhecimento.' : dominante === 'S' ? 'Mudanças abruptas, conflitos e ambientes instáveis.' : 'Erros, desorganização e falta de clareza nos processos.',
  visao_equipe: dominante === 'D' ? 'Prefere equipes eficientes focadas em resultados. Assume liderança naturalmente.' : dominante === 'I' ? 'Dinamiza o grupo, cria conexões e levanta o moral da equipe.' : dominante === 'S' ? 'É o pilar de suporte da equipe. Confiável, leal e conciliador.' : 'Garante a qualidade do trabalho da equipe. Preciso e criterioso.',
  visao_trabalho: dominante === 'D' ? 'Orientado a metas, trabalha rapidamente e quer ver resultados.' : dominante === 'I' ? 'Trabalha bem em ambientes dinâmicos com pessoas e criatividade.' : dominante === 'S' ? 'Executa com constância, confiabilidade e atenção às pessoas.' : 'Trabalha com método, analisa antes de agir e busca perfeição.',
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { nome, scoreD, scoreI, scoreS, scoreC, dominante, secundario } = await req.json();

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify(fallback(dominante, secundario)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: `Você é especialista em metodologia DISC aplicada a bares e restaurantes brasileiros.
Analise o perfil DISC e retorne APENAS JSON válido (sem markdown, sem explicações):
{
  "resumo": "2-3 frases descrevendo o perfil de forma positiva e específica",
  "pontos_fortes": ["força 1 específica para bar/restaurante", "força 2", "força 3", "força 4"],
  "pontos_fracos": ["ponto a desenvolver 1 (tom construtivo)", "ponto a desenvolver 2"],
  "areas_desenvolvimento": ["área 1 para crescimento profissional", "área 2"],
  "estilo_comunicacao": "como comunicar com esta pessoa (1-2 frases práticas)",
  "estilo_lideranca": "estilo de liderança desta pessoa (1-2 frases)",
  "como_motivar": "o que motiva e engaja esta pessoa no trabalho (1-2 frases)",
  "como_desafia": "o que gera estresse ou desconforto nesta pessoa (1-2 frases)",
  "visao_equipe": "como esta pessoa se comporta e contribui na equipe (2-3 frases)",
  "visao_trabalho": "como esta pessoa trabalha, seu ritmo e estilo (2-3 frases)"
}`,
        messages: [{
          role: "user",
          content: `Nome: ${nome}
Scores DISC: D=${scoreD}% I=${scoreI}% S=${scoreS}% C=${scoreC}%
Perfil dominante: ${dominante} / Secundário: ${secundario}
Contexto: colaborador de bar/restaurante (garçom, cozinheiro, atendente, barman, etc.)
Seja específico e prático para o contexto de hospitalidade e serviços.`,
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any)?.error?.message ?? `HTTP ${resp.status}`);
    }

    const iaData = await resp.json();
    const texto = iaData.content?.[0]?.text ?? "";

    let analise;
    try {
      // Remove possível markdown wrapper
      const clean = texto.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      analise = JSON.parse(clean);
    } catch {
      analise = fallback(dominante, secundario);
    }

    return new Response(JSON.stringify(analise), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Retorna fallback em vez de erro para não quebrar o fluxo
    const body = await req.clone().json().catch(() => ({ dominante: "D", secundario: "I" }));
    return new Response(JSON.stringify(fallback(body.dominante ?? "D", body.secundario ?? "I")), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
