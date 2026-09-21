import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsIA as corsHeaders, extrairJson } from "../_shared/ia.ts";

interface AnaliseDISC {
  resumo: string;
  pontos_fortes: string[];
  pontos_fracos: string[];
  areas_desenvolvimento: string[];
  estilo_comunicacao: string;
  estilo_lideranca: string;
  como_motivar: string;
  como_desafia: string;
  visao_equipe: string;
  visao_trabalho: string;
}

const SCHEMA_DISC = {
  type: "object",
  properties: {
    resumo: {
      type: "string",
      description: "2-3 frases descrevendo o perfil de forma positiva e específica",
    },
    pontos_fortes: {
      type: "array",
      items: { type: "string" },
      description: "4 forças específicas para o contexto de bar/restaurante",
      minItems: 4,
      maxItems: 4,
    },
    pontos_fracos: {
      type: "array",
      items: { type: "string" },
      description: "2 pontos a desenvolver, em tom construtivo",
      minItems: 2,
      maxItems: 2,
    },
    areas_desenvolvimento: {
      type: "array",
      items: { type: "string" },
      description: "2 áreas para crescimento profissional",
      minItems: 2,
      maxItems: 2,
    },
    estilo_comunicacao: {
      type: "string",
      description: "Como comunicar com esta pessoa (1-2 frases práticas)",
    },
    estilo_lideranca: {
      type: "string",
      description: "Estilo de liderança desta pessoa (1-2 frases)",
    },
    como_motivar: {
      type: "string",
      description: "O que motiva e engaja esta pessoa no trabalho (1-2 frases)",
    },
    como_desafia: {
      type: "string",
      description: "O que gera estresse ou desconforto nesta pessoa (1-2 frases)",
    },
    visao_equipe: {
      type: "string",
      description: "Como esta pessoa se comporta e contribui na equipe (2-3 frases)",
    },
    visao_trabalho: {
      type: "string",
      description: "Como esta pessoa trabalha, seu ritmo e estilo (2-3 frases)",
    },
  },
  required: [
    "resumo",
    "pontos_fortes",
    "pontos_fracos",
    "areas_desenvolvimento",
    "estilo_comunicacao",
    "estilo_lideranca",
    "como_motivar",
    "como_desafia",
    "visao_equipe",
    "visao_trabalho",
  ],
} as const;

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

  // Guardados fora do try para que o fallback funcione mesmo se a IA falhar.
  let dominante = "D";
  let secundario = "I";

  try {
    const corpo = await req.json();
    const { nome, scoreD, scoreI, scoreS, scoreC } = corpo;
    dominante = corpo.dominante ?? "D";
    secundario = corpo.secundario ?? "I";

    const { dados: analise } = await extrairJson<AnaliseDISC>({
      nome: "registrar_analise_disc",
      descricao: "Registra a análise do perfil DISC do colaborador para bar/restaurante.",
      schema: SCHEMA_DISC,
      system:
        `Você é especialista em metodologia DISC aplicada a bares e restaurantes brasileiros.
Analise o perfil DISC do colaborador.`,
      prompt: `Nome: ${nome}
Scores DISC: D=${scoreD}% I=${scoreI}% S=${scoreS}% C=${scoreC}%
Perfil dominante: ${dominante} / Secundário: ${secundario}
Contexto: colaborador de bar/restaurante (garçom, cozinheiro, atendente, barman, etc.)
Seja específico e prático para o contexto de hospitalidade e serviços.`,
    });

    return new Response(JSON.stringify(analise), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Retorna fallback em vez de erro para não quebrar o fluxo
    console.error("Erro na análise DISC:", err);
    return new Response(JSON.stringify(fallback(dominante, secundario)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
