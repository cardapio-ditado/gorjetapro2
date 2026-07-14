import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Target, ChevronLeft, Check, X, Loader2, AlertTriangle, Clock } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Fase =
  | 'carregando'
  | 'invalido'
  | 'expirado'
  | 'ja_respondido'
  | 'inicio'
  | 'respondendo'
  | 'calculando'
  | 'resultado';

interface Sessao {
  id: string;
  token: string;
  tipo: string;
  colaborador_id: string | null;
  candidato_id: string | null;
  nome_respondente: string | null;
  status: string;
  expira_em: string;
  score_d?: number;
  score_i?: number;
  score_s?: number;
  score_c?: number;
  perfil_dominante?: string;
  perfil_secundario?: string;
  resumo_ia?: string;
  pontos_fortes?: string[];
  areas_desenvolvimento?: string[];
  colaboradores?: { nome_completo: string } | null;
  rh_candidatos?: { nome: string } | null;
}

interface Pergunta {
  id: number;
  pergunta: string;
  instrucao: string | null;
  opcoes: Array<{ letra: string; texto: string; perfil: string }>;
  ordem: number;
}

interface ResultadoFinal {
  scoreD: number;
  scoreI: number;
  scoreS: number;
  scoreC: number;
  dominante: string;
  secundario: string;
  analise: {
    resumo: string;
    pontos_fortes: string[];
    areas_desenvolvimento: string[];
    estilo_comunicacao: string;
    como_motivar: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DISC_CONFIG = {
  D: { label: 'Dominância',   cor: 'text-red-400',     bg: 'bg-red-500',     fill: '#ef4444' },
  I: { label: 'Influência',   cor: 'text-yellow-400',  bg: 'bg-yellow-500',  fill: '#eab308' },
  S: { label: 'Estabilidade', cor: 'text-emerald-400', bg: 'bg-emerald-500', fill: '#10b981' },
  C: { label: 'Conformidade', cor: 'text-blue-400',    bg: 'bg-blue-500',    fill: '#3b82f6' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ atual, total }: { atual: number; total: number }) {
  const pct = Math.round((atual / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-white/40 text-xs">{atual} de {total}</span>
        <span className="text-white/40 text-xs">{pct}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#7D1F2C] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ScoreBar({ letra, score }: { letra: string; score: number }) {
  const cfg = DISC_CONFIG[letra as keyof typeof DISC_CONFIG];
  return (
    <div className="flex items-center gap-3">
      <span className={`w-7 h-7 ${cfg.bg} rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
        {letra}
      </span>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className={`text-xs font-medium ${cfg.cor}`}>{cfg.label}</span>
          <span className={`text-sm font-bold ${cfg.cor}`}>{score}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full ${cfg.bg} rounded-full transition-all duration-1000`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiscPublico() {
  const [fase, setFase] = useState<Fase>('carregando');
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [nomeRespondente, setNomeRespondente] = useState('');
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [blocoAtual, setBlocoAtual] = useState(0);
  const [maisSelecionado, setMaisSelecionado] = useState<string | null>(null);
  const [menosSelecionado, setMenosSelecionado] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<number, { mais: string; menos: string }>>({});
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal | null>(null);
  const [erroMsg, setErroMsg] = useState('');

  // Lê token da URL (?token=xxx)
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  // ─── Validação ──────────────────────────────────────────────────────────────

  const validarToken = useCallback(async () => {
    if (!token) { setFase('invalido'); return; }

    const { data: s, error } = await supabase
      .from('rh_disc_sessoes')
      .select(`
        *,
        colaboradores ( nome_completo ),
        rh_candidatos ( nome )
      `)
      .eq('token', token)
      .maybeSingle();

    if (error || !s) { setFase('invalido'); return; }

    if (s.status === 'concluido') {
      const nome =
        (s.colaboradores as any)?.nome_completo ||
        (s.rh_candidatos as any)?.nome ||
        s.nome_respondente ||
        'Participante';
      setSessao(s as Sessao);
      setNomeRespondente(nome);
      setPrimeiroNome(nome.split(' ')[0]);
      setFase('ja_respondido');
      return;
    }

    if (s.expira_em && new Date(s.expira_em) < new Date()) {
      setFase('expirado');
      return;
    }

    const nome =
      (s.colaboradores as any)?.nome_completo ||
      (s.rh_candidatos as any)?.nome ||
      s.nome_respondente ||
      'Participante';

    setSessao(s as Sessao);
    setNomeRespondente(nome);
    setPrimeiroNome(nome.split(' ')[0]);
    setFase('inicio');
  }, [token]);

  useEffect(() => { validarToken(); }, [validarToken]);

  // ─── Iniciar ─────────────────────────────────────────────────────────────────

  const iniciar = async () => {
    if (!sessao) return;

    await supabase
      .from('rh_disc_sessoes')
      .update({ status: 'em_andamento', iniciado_em: new Date().toISOString() })
      .eq('id', sessao.id);

    const { data: ps } = await supabase
      .from('rh_disc_perguntas')
      .select('*')
      .eq('ativo', true)
      .order('ordem');

    setPerguntas((ps ?? []) as Pergunta[]);
    setBlocoAtual(0);
    setFase('respondendo');
  };

  // ─── Salvar resposta e avançar ────────────────────────────────────────────────

  const avancar = async () => {
    if (!maisSelecionado || !menosSelecionado || !sessao) return;

    const pergunta = perguntas[blocoAtual];

    await supabase.from('rh_disc_respostas').upsert(
      {
        sessao_id: sessao.id,
        pergunta_id: pergunta.id,
        opcao_mais: maisSelecionado,
        opcao_menos: menosSelecionado,
        respondido_em: new Date().toISOString(),
      },
      { onConflict: 'sessao_id,pergunta_id' }
    );

    const novasRespostas = {
      ...respostas,
      [blocoAtual]: { mais: maisSelecionado, menos: menosSelecionado },
    };
    setRespostas(novasRespostas);
    setMaisSelecionado(null);
    setMenosSelecionado(null);

    if (blocoAtual < perguntas.length - 1) {
      setBlocoAtual(b => b + 1);
    } else {
      calcularEFinalizar(novasRespostas);
    }
  };

  const voltar = () => {
    if (blocoAtual === 0) return;
    const prev = blocoAtual - 1;
    setBlocoAtual(prev);
    const resp = respostas[prev];
    if (resp) {
      setMaisSelecionado(resp.mais);
      setMenosSelecionado(resp.menos);
    } else {
      setMaisSelecionado(null);
      setMenosSelecionado(null);
    }
  };

  // Ao navegar para um bloco com resposta já salva, pré-seleciona
  useEffect(() => {
    if (fase !== 'respondendo') return;
    const resp = respostas[blocoAtual];
    if (resp) {
      setMaisSelecionado(resp.mais);
      setMenosSelecionado(resp.menos);
    }
  }, [blocoAtual, fase]);

  // ─── Calcular e finalizar ────────────────────────────────────────────────────

  const calcularEFinalizar = async (todasRespostasLocais: Record<number, { mais: string; menos: string }>) => {
    if (!sessao) return;
    setFase('calculando');

    try {
      // Buscar respostas do banco com opções das perguntas
      const { data: dbRespostas } = await supabase
        .from('rh_disc_respostas')
        .select('opcao_mais, opcao_menos, rh_disc_perguntas(opcoes)')
        .eq('sessao_id', sessao.id);

      // Calcular scores
      const scores = { D: 0, I: 0, S: 0, C: 0 };

      (dbRespostas ?? []).forEach((r: any) => {
        const opcoes: Array<{ letra: string; perfil: string }> = r.rh_disc_perguntas?.opcoes ?? [];
        const mais = opcoes.find(o => o.letra === r.opcao_mais);
        const menos = opcoes.find(o => o.letra === r.opcao_menos);
        if (mais) {
          const k = mais.perfil?.[0] as keyof typeof scores;
          if (k in scores) scores[k] += 2;
        }
        if (menos) {
          const k = menos.perfil?.[0] as keyof typeof scores;
          if (k in scores) scores[k] -= 1;
        }
      });

      // Normalizar para 0-100
      const pos = {
        D: Math.max(0, scores.D),
        I: Math.max(0, scores.I),
        S: Math.max(0, scores.S),
        C: Math.max(0, scores.C),
      };
      const total = Object.values(pos).reduce((a, b) => a + b, 0) || 1;
      const scoreD = Math.round((pos.D / total) * 100);
      const scoreI = Math.round((pos.I / total) * 100);
      const scoreS = Math.round((pos.S / total) * 100);
      const scoreC = Math.round((pos.C / total) * 100);

      // Ranking
      const ranking = [
        { p: 'D', v: scoreD },
        { p: 'I', v: scoreI },
        { p: 'S', v: scoreS },
        { p: 'C', v: scoreC },
      ].sort((a, b) => b.v - a.v);

      const dominante = ranking[0].p;
      const secundario = ranking[1].p;

      // Análise via edge function
      let analise = {
        resumo: `Perfil ${dominante} com influência de ${secundario} identificado.`,
        pontos_fortes: ['Dedicado ao trabalho', 'Comprometido com a equipe', 'Confiável'],
        areas_desenvolvimento: ['Comunicação interpessoal', 'Gestão do tempo'],
        estilo_comunicacao: 'Prefira comunicação clara e objetiva.',
        como_motivar: 'Reconhecimento pelo trabalho bem feito.',
      };

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-disc-ia`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              nome: nomeRespondente,
              scoreD, scoreI, scoreS, scoreC,
              dominante, secundario,
            }),
          }
        );
        if (res.ok) {
          const iaData = await res.json();
          if (iaData.resumo) analise = iaData;
        }
      } catch {
        // usa fallback
      }

      // Salvar sessão — trigger do banco cuida do rh_disc_colaborador/rh_disc_resultados
      await supabase.from('rh_disc_sessoes').update({
        status: 'concluido',
        concluido_em: new Date().toISOString(),
        score_d: scoreD,
        score_i: scoreI,
        score_s: scoreS,
        score_c: scoreC,
        perfil_dominante: dominante,
        perfil_secundario: secundario,
        resumo_ia: analise.resumo,
        pontos_fortes: analise.pontos_fortes,
        areas_desenvolvimento: analise.areas_desenvolvimento,
        estilo_comunicacao: analise.estilo_comunicacao,
        como_motivar: analise.como_motivar,
        analise_ia: analise,
      }).eq('id', sessao.id);

      setResultadoFinal({ scoreD, scoreI, scoreS, scoreC, dominante, secundario, analise });
      setFase('resultado');
    } catch (e: any) {
      setErroMsg(e.message ?? 'Erro ao calcular resultado.');
    }
  };

  // ─── Seleção de opção ─────────────────────────────────────────────────────────

  const selecionarOpcao = (letra: string, tipo: 'mais' | 'menos') => {
    if (tipo === 'mais') {
      if (letra === menosSelecionado) setMenosSelecionado(null);
      setMaisSelecionado(prev => prev === letra ? null : letra);
    } else {
      if (letra === maisSelecionado) setMaisSelecionado(null);
      setMenosSelecionado(prev => prev === letra ? null : letra);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#0d0f1a] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
            style={{ background: 'linear-gradient(135deg,#7D1F2C,#D4AF37)' }}>
            <Target className="w-6 h-6 text-white" />
          </div>
          <p className="text-[#D4AF37] font-bold text-sm tracking-wide">Ditado Popular</p>
        </div>
        {children}
      </div>
    </div>
  );

  // Carregando
  if (fase === 'carregando') {
    return (
      <Shell>
        <div className="bg-[#12141f] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
          <p className="text-white/50 text-sm">Verificando link...</p>
        </div>
      </Shell>
    );
  }

  // Inválido
  if (fase === 'invalido') {
    return (
      <Shell>
        <div className="bg-[#12141f] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <X className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg mb-1">Link inválido</p>
            <p className="text-white/50 text-sm">Este link não existe ou já foi removido. Solicite um novo link ao seu gestor.</p>
          </div>
        </div>
      </Shell>
    );
  }

  // Expirado
  if (fase === 'expirado') {
    return (
      <Shell>
        <div className="bg-[#12141f] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center">
            <Clock className="w-7 h-7 text-yellow-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg mb-1">Link expirado</p>
            <p className="text-white/50 text-sm">O prazo para responder esta avaliação encerrou. Peça ao seu gestor um novo link.</p>
          </div>
        </div>
      </Shell>
    );
  }

  // Já respondido
  if (fase === 'ja_respondido') {
    return (
      <Shell>
        <div className="bg-[#12141f] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Check className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg mb-1">Avaliação já realizada!</p>
            <p className="text-white/50 text-sm">
              Obrigado, <span className="text-white font-medium">{primeiroNome}</span>! Sua avaliação DISC já foi registrada.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // Início
  if (fase === 'inicio') {
    return (
      <Shell>
        <div className="bg-[#12141f] border border-white/10 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <p className="text-white/50 text-sm mb-1">Olá,</p>
            <p className="text-white text-2xl font-bold">{primeiroNome}!</p>
          </div>

          <div className="h-px bg-white/10" />

          <div>
            <p className="text-white font-medium text-center mb-4 leading-relaxed">
              Você foi convidado para realizar o<br />
              <span className="text-[#D4AF37] font-bold">Mapeamento de Perfil DISC</span>
            </p>
            <div className="space-y-2.5">
              {[
                { icon: '📋', text: '28 grupos de 4 palavras' },
                { icon: '✅', text: 'Em cada grupo: escolha MAIS e MENOS' },
                { icon: '⏱️', text: 'Tempo estimado: ~10 minutos' },
                { icon: '💡', text: 'Não há respostas certas ou erradas' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-white/70 text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={iniciar}
            className="w-full bg-[#7D1F2C] hover:bg-[#9b2535] text-white font-semibold py-4 rounded-xl text-base transition-colors active:scale-95"
          >
            Iniciar Avaliação
          </button>

          <p className="text-center text-white/25 text-xs">
            Seja sincero — as respostas refletem seu comportamento natural
          </p>
        </div>
      </Shell>
    );
  }

  // Calculando
  if (fase === 'calculando') {
    return (
      <Shell>
        <div className="bg-[#12141f] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-[#7D1F2C]/20 border-t-[#7D1F2C] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Target className="w-6 h-6 text-[#D4AF37]" />
            </div>
          </div>
          <div>
            <p className="text-white font-semibold text-lg mb-1">Calculando seu perfil...</p>
            <p className="text-white/40 text-sm">Analisando suas respostas com IA</p>
          </div>
        </div>
      </Shell>
    );
  }

  // Respondendo
  if (fase === 'respondendo' && perguntas.length > 0) {
    const pergunta = perguntas[blocoAtual];
    const opcoes = pergunta.opcoes ?? [];
    const podeAvancar = maisSelecionado !== null && menosSelecionado !== null;

    return (
      <div className="min-h-screen bg-[#0d0f1a] flex flex-col px-4 py-6">
        <div className="w-full max-w-sm mx-auto flex flex-col flex-1">

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={voltar}
              disabled={blocoAtual === 0}
              className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1">
              <ProgressBar atual={blocoAtual + 1} total={perguntas.length} />
            </div>
          </div>

          {/* Card da pergunta */}
          <div className="bg-[#12141f] border border-white/10 rounded-2xl p-5 flex-1 flex flex-col">

            <div className="mb-5">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1.5">Grupo {blocoAtual + 1}</p>
              <p className="text-white text-sm leading-relaxed">
                {pergunta.instrucao || 'Escolha a palavra que MAIS e a que MENOS descreve você:'}
              </p>
            </div>

            {/* Legenda */}
            <div className="flex gap-2 mb-4">
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                <Check size={12} className="text-emerald-400" />
                <span className="text-emerald-400 text-xs font-medium">MAIS me descreve</span>
              </div>
              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                <X size={12} className="text-red-400" />
                <span className="text-red-400 text-xs font-medium">MENOS me descreve</span>
              </div>
            </div>

            {/* Opções */}
            <div className="space-y-2.5 flex-1">
              {opcoes.map(opcao => {
                const ehMais = maisSelecionado === opcao.letra;
                const ehMenos = menosSelecionado === opcao.letra;
                return (
                  <div
                    key={opcao.letra}
                    className={`
                      relative rounded-xl border transition-all overflow-hidden
                      ${ehMais ? 'border-emerald-500/50 bg-emerald-500/10' :
                        ehMenos ? 'border-red-500/50 bg-red-500/10' :
                        'border-white/10 bg-white/3 hover:border-white/25 hover:bg-white/5'}
                    `}
                  >
                    <div className="flex items-center px-4 py-3 gap-3">
                      <span className="text-white/30 text-xs font-bold w-4">{opcao.letra}</span>
                      <span className={`flex-1 font-medium text-sm ${ehMais ? 'text-emerald-300' : ehMenos ? 'text-red-300' : 'text-white/80'}`}>
                        {opcao.texto}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => selecionarOpcao(opcao.letra, 'mais')}
                          className={`
                            w-8 h-8 rounded-lg border flex items-center justify-center transition-all active:scale-90
                            ${ehMais
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-white/15 text-white/30 hover:border-emerald-500/50 hover:text-emerald-400'}
                          `}
                          title="Mais me descreve"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => selecionarOpcao(opcao.letra, 'menos')}
                          className={`
                            w-8 h-8 rounded-lg border flex items-center justify-center transition-all active:scale-90
                            ${ehMenos
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'border-white/15 text-white/30 hover:border-red-500/50 hover:text-red-400'}
                          `}
                          title="Menos me descreve"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Instrução de validação */}
            {(!maisSelecionado || !menosSelecionado) && (
              <p className="text-white/30 text-xs text-center mt-4">
                {!maisSelecionado && !menosSelecionado
                  ? 'Selecione MAIS e MENOS para continuar'
                  : !maisSelecionado
                  ? 'Selecione qual palavra MAIS te descreve'
                  : 'Selecione qual palavra MENOS te descreve'}
              </p>
            )}

            {/* Botão avançar */}
            <button
              onClick={avancar}
              disabled={!podeAvancar}
              className="w-full mt-4 bg-[#7D1F2C] hover:bg-[#9b2535] disabled:bg-white/5 disabled:text-white/20 text-white font-semibold py-3.5 rounded-xl text-sm transition-all active:scale-95 disabled:cursor-not-allowed"
            >
              {blocoAtual === perguntas.length - 1 ? 'Concluir Avaliação' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Resultado
  if (fase === 'resultado' && resultadoFinal) {
    const { scoreD, scoreI, scoreS, scoreC, dominante, secundario, analise } = resultadoFinal;
    const dcfg = DISC_CONFIG[dominante as keyof typeof DISC_CONFIG];
    const scfg = DISC_CONFIG[secundario as keyof typeof DISC_CONFIG];

    return (
      <div className="min-h-screen bg-[#0d0f1a] flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm space-y-4">

          {/* Header resultado */}
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'linear-gradient(135deg,#7D1F2C,#D4AF37)' }}>
              <Target className="w-6 h-6 text-white" />
            </div>
            <p className="text-[#D4AF37] text-xs font-semibold tracking-widest uppercase mb-2">Ditado Popular</p>
            <h1 className="text-white text-xl font-bold mb-1">Avaliação concluída!</h1>
            <p className="text-white/50 text-sm">Obrigado, <span className="text-white font-medium">{primeiroNome}</span>!</p>
          </div>

          {/* Perfil */}
          <div className="bg-[#12141f] border border-white/10 rounded-2xl p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Seu perfil DISC</p>
            <div className="flex items-center gap-3 mb-4">
              <span className={`${dcfg.bg} text-white font-bold text-2xl w-14 h-14 rounded-2xl flex items-center justify-center`}>
                {dominante}
              </span>
              <div>
                <p className={`text-lg font-bold ${dcfg.cor}`}>{dcfg.label}</p>
                <p className="text-white/50 text-sm">com influência de <span className={scfg.cor}>{scfg.label}</span></p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { l: 'D', s: scoreD },
                { l: 'I', s: scoreI },
                { l: 'S', s: scoreS },
                { l: 'C', s: scoreC },
              ].map(({ l, s }) => (
                <ScoreBar key={l} letra={l} score={s} />
              ))}
            </div>
          </div>

          {/* Resumo IA */}
          {analise.resumo && (
            <div className="bg-[#12141f] border border-[#D4AF37]/20 rounded-2xl p-5">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Seu perfil</p>
              <p className="text-white/80 text-sm leading-relaxed italic">"{analise.resumo}"</p>
            </div>
          )}

          {/* Pontos fortes */}
          {analise.pontos_fortes?.length > 0 && (
            <div className="bg-[#12141f] border border-white/10 rounded-2xl p-5">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Seus pontos fortes</p>
              <div className="space-y-2">
                {analise.pontos_fortes.map((p, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={10} className="text-emerald-400" />
                    </div>
                    <p className="text-white/70 text-sm">{p}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-4 text-center">
            <p className="text-emerald-400 text-sm font-medium">
              Seu resultado já foi enviado ao seu gestor.
            </p>
            <p className="text-white/40 text-xs mt-1">Obrigado por participar!</p>
          </div>

          {erroMsg && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2 items-center">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-red-300 text-xs">{erroMsg}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
