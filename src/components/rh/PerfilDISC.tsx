import React, { useState, useEffect, useCallback } from 'react';
import {
  Target, Save, Send, Copy, ExternalLink, RefreshCw,
  CheckCircle, Clock, AlertCircle, MessageSquare, Plus,
  ChevronLeft, Check, X, Loader2, Play, ClipboardList,
  SlidersHorizontal, Users, Briefcase, Zap, TrendingUp,
  TrendingDown, Heart, Shield, Star, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscColaborador {
  colaborador_id: string;
  nome_completo: string;
  funcao_nome: string;
  score_d: number | null;
  score_i: number | null;
  score_s: number | null;
  score_c: number | null;
  perfil_dominante: string | null;
  perfil_secundario: string | null;
  data_aplicacao: string | null;
}

interface DiscDetalhe {
  colaborador_id: string;
  score_d: number;
  score_i: number;
  score_s: number;
  score_c: number;
  perfil_dominante: string;
  perfil_secundario: string;
  resumo: string | null;
  pontos_fortes: string[] | null;
  pontos_fracos: string[] | null;
  areas_desenvolvimento: string[] | null;
  estilo_comunicacao: string | null;
  estilo_lideranca: string | null;
  como_motivar: string | null;
  como_desafia: string | null;
  visao_equipe: string | null;
  visao_trabalho: string | null;
  data_aplicacao: string | null;
  analise_completa: Record<string, any> | null;
}

interface Colaborador { id: string; nome_completo: string }
interface Candidato   { id: string; nome: string }

interface Pergunta {
  id: number;
  instrucao: string | null;
  opcoes: Array<{ letra: string; texto: string; perfil: string }>;
  ordem: number;
}

interface Sessao {
  id: string; token: string; tipo: string; status: string;
  criado_em: string; expira_em: string; concluido_em: string | null;
  nome_respondente: string | null;
  colaboradores: { nome_completo: string } | null;
  rh_candidatos: { nome: string } | null;
  nome: string; statusExibicao: string;
}

interface AnaliseCompleta {
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

interface ResultadoInline {
  scoreD: number; scoreI: number; scoreS: number; scoreC: number;
  dominante: string; secundario: string;
  analise: AnaliseCompleta;
  nomeColaborador: string;
}

type ModoEnvio  = 'colaborador' | 'candidato' | 'externo';
type Aba        = 'mapa' | 'aplicar' | 'resultados' | 'whatsapp';
type ModoAplicar = 'escolha' | 'sliders' | 'questionario_select' | 'questionario' | 'resultado';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISC_CONFIG = {
  D: { label: 'Dominância',   cor: 'text-red-400',     bg: 'bg-red-500',     bgLight: 'bg-red-500/15',     border: 'border-red-500/30',     hex: '#ef4444', desc: 'Direto, orientado a resultados, competitivo' },
  I: { label: 'Influência',   cor: 'text-yellow-400',  bg: 'bg-yellow-500',  bgLight: 'bg-yellow-500/15',  border: 'border-yellow-500/30',  hex: '#eab308', desc: 'Entusiasta, comunicativo, otimista' },
  S: { label: 'Estabilidade', cor: 'text-emerald-400', bg: 'bg-emerald-500', bgLight: 'bg-emerald-500/15', border: 'border-emerald-500/30', hex: '#10b981', desc: 'Paciente, confiável, bom ouvinte' },
  C: { label: 'Conformidade', cor: 'text-blue-400',    bg: 'bg-blue-500',    bgLight: 'bg-blue-500/15',    border: 'border-blue-500/30',    hex: '#3b82f6', desc: 'Analítico, preciso, sistemático' },
};

const DIAS_VALIDADE = [{ valor: 3, label: '3 dias' }, { valor: 7, label: '7 dias' }, { valor: 15, label: '15 dias' }];

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60';
const sel = inp + ' appearance-none';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const calcPerfis = (d: number, i: number, s: number, c: number) => {
  const s4 = [{ key: 'D', val: d }, { key: 'I', val: i }, { key: 'S', val: s }, { key: 'C', val: c }].sort((a, b) => b.val - a.val);
  return { dominante: s4[0].key, secundario: s4[1].key };
};

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
}

// ─── ScoreBar ────────────────────────────────────────────────────────────────

function ScoreBar({ letra, score, size = 'md' }: { letra: string; score: number; size?: 'sm' | 'md' }) {
  const cfg = DISC_CONFIG[letra as keyof typeof DISC_CONFIG];
  return (
    <div className="flex items-center gap-3">
      <span className={`${cfg.bg} rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 ${size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'}`}>
        {letra}
      </span>
      <div className="flex-1">
        <div className={`flex justify-between mb-1 ${size === 'sm' ? 'text-xs' : 'text-xs'}`}>
          <span className={`font-medium ${cfg.cor}`}>{cfg.label}</span>
          <span className={`font-bold ${cfg.cor}`}>{score}%</span>
        </div>
        <div className={`bg-white/10 rounded-full overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}>
          <div className={`h-full ${cfg.bg} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── PerfilDetalhadoModal ─────────────────────────────────────────────────────

function PerfilDetalhadoModal({
  nome, detalhe, onClose,
}: { nome: string; detalhe: DiscDetalhe; onClose: () => void }) {
  const [secao, setSecao] = useState<'visao_geral' | 'trabalho' | 'equipe' | 'gestao'>('visao_geral');
  const dcfg = DISC_CONFIG[detalhe.perfil_dominante as keyof typeof DISC_CONFIG];
  const scfg = DISC_CONFIG[detalhe.perfil_secundario as keyof typeof DISC_CONFIG];

  const initials = nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const secoes = [
    { key: 'visao_geral', label: 'Visão Geral',  icon: Star },
    { key: 'trabalho',    label: 'Trabalho',      icon: Briefcase },
    { key: 'equipe',      label: 'Equipe',        icon: Users },
    { key: 'gestao',      label: 'Gestão',        icon: Shield },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75" onClick={onClose}>
      <div
        className="relative bg-[#0f1020] border border-white/10 rounded-2xl flex flex-col w-full max-w-2xl max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-white/10 flex-shrink-0">
          <div className={`w-12 h-12 rounded-xl ${dcfg.bg} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-lg truncate">{nome}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`${dcfg.bg} text-white text-xs font-bold px-2.5 py-0.5 rounded-lg`}>{detalhe.perfil_dominante}</span>
              <span className="text-white/30 text-xs">/</span>
              <span className={`${scfg.bgLight} ${scfg.cor} ${scfg.border} border text-xs font-medium px-2.5 py-0.5 rounded-lg`}>{detalhe.perfil_secundario}</span>
              <span className="text-white/40 text-xs">{dcfg.label} · {scfg.label}</span>
            </div>
          </div>
          {detalhe.data_aplicacao && (
            <span className="text-white/30 text-xs flex-shrink-0">{dayjs(detalhe.data_aplicacao).format('DD/MM/YYYY')}</span>
          )}
          <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Scores */}
        <div className="px-6 py-4 border-b border-white/8 flex-shrink-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {(['D', 'I', 'S', 'C'] as const).map(k => (
              <ScoreBar key={k} letra={k} score={detalhe[`score_${k.toLowerCase()}` as 'score_d'] ?? 0} size="sm" />
            ))}
          </div>
        </div>

        {/* Tabs de seção */}
        <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
          {secoes.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => setSecao(s.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  secao === s.key ? 'bg-[#7D1F2C]/30 text-white border border-[#7D1F2C]/40' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}>
                <Icon size={12} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo por seção */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {secao === 'visao_geral' && (
            <>
              {detalhe.resumo && (
                <div className={`${dcfg.bgLight} border ${dcfg.border} rounded-xl p-4`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${dcfg.cor} mb-2`}>Perfil</p>
                  <p className="text-white/80 text-sm leading-relaxed">{detalhe.resumo}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Pontos fortes */}
                <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-emerald-400" />
                    <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Pontos Fortes</p>
                  </div>
                  <div className="space-y-2">
                    {(detalhe.pontos_fortes ?? []).map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <p className="text-white/70 text-xs leading-relaxed">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pontos a desenvolver */}
                <div className="bg-orange-500/8 border border-orange-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown size={14} className="text-orange-400" />
                    <p className="text-orange-400 text-xs font-semibold uppercase tracking-wider">A Desenvolver</p>
                  </div>
                  <div className="space-y-2">
                    {(detalhe.pontos_fracos ?? detalhe.areas_desenvolvimento ?? []).map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight size={11} className="text-orange-400 mt-0.5 flex-shrink-0" />
                        <p className="text-white/70 text-xs leading-relaxed">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {secao === 'trabalho' && (
            <>
              {detalhe.visao_trabalho && (
                <InfoCard
                  icon={Briefcase} cor="text-blue-400" borda="border-blue-500/20" bg="bg-blue-500/8"
                  titulo="Estilo de Trabalho"
                  texto={detalhe.visao_trabalho}
                />
              )}
              {detalhe.estilo_comunicacao && (
                <InfoCard
                  icon={MessageSquare} cor="text-yellow-400" borda="border-yellow-500/20" bg="bg-yellow-500/8"
                  titulo="Estilo de Comunicação"
                  texto={detalhe.estilo_comunicacao}
                />
              )}
              {detalhe.como_motivar && (
                <InfoCard
                  icon={Zap} cor="text-emerald-400" borda="border-emerald-500/20" bg="bg-emerald-500/8"
                  titulo="Como Motivar"
                  texto={detalhe.como_motivar}
                />
              )}
              {detalhe.como_desafia && (
                <InfoCard
                  icon={AlertCircle} cor="text-orange-400" borda="border-orange-500/20" bg="bg-orange-500/8"
                  titulo="O que Gera Estresse"
                  texto={detalhe.como_desafia}
                />
              )}
            </>
          )}

          {secao === 'equipe' && (
            <>
              {detalhe.visao_equipe && (
                <InfoCard
                  icon={Users} cor="text-emerald-400" borda="border-emerald-500/20" bg="bg-emerald-500/8"
                  titulo="Comportamento na Equipe"
                  texto={detalhe.visao_equipe}
                />
              )}
              {detalhe.areas_desenvolvimento && detalhe.areas_desenvolvimento.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-white/50" />
                    <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Áreas de Crescimento</p>
                  </div>
                  <div className="space-y-2">
                    {detalhe.areas_desenvolvimento.map((a, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1.5 flex-shrink-0" />
                        <p className="text-white/60 text-xs leading-relaxed">{a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {secao === 'gestao' && (
            <>
              {detalhe.estilo_lideranca && (
                <InfoCard
                  icon={Shield} cor="text-[#D4AF37]" borda="border-[#D4AF37]/20" bg="bg-[#D4AF37]/8"
                  titulo="Estilo de Liderança"
                  texto={detalhe.estilo_lideranca}
                />
              )}
              {detalhe.como_motivar && (
                <InfoCard
                  icon={Heart} cor="text-pink-400" borda="border-pink-500/20" bg="bg-pink-500/8"
                  titulo="Como Engajar"
                  texto={detalhe.como_motivar}
                />
              )}

              {/* Dicas rápidas de gestão */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Dicas para o Gestor</p>
                <div className="space-y-2.5">
                  {[
                    { label: 'Perfil', valor: `${detalhe.perfil_dominante}/${detalhe.perfil_secundario} — ${DISC_CONFIG[detalhe.perfil_dominante as keyof typeof DISC_CONFIG]?.label} com ${DISC_CONFIG[detalhe.perfil_secundario as keyof typeof DISC_CONFIG]?.label}` },
                    { label: 'Comunique-se', valor: detalhe.estilo_comunicacao ?? '—' },
                    { label: 'Motive com', valor: detalhe.como_motivar ?? '—' },
                    { label: 'Evite', valor: detalhe.como_desafia ?? '—' },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-white/30 text-xs w-24 flex-shrink-0 pt-0.5">{item.label}</span>
                      <span className="text-white/70 text-xs leading-relaxed">{item.valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, cor, borda, bg, titulo, texto }: {
  icon: any; cor: string; borda: string; bg: string; titulo: string; texto: string;
}) {
  return (
    <div className={`${bg} border ${borda} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={cor} />
        <p className={`text-xs font-semibold uppercase tracking-wider ${cor}`}>{titulo}</p>
      </div>
      <p className="text-white/70 text-sm leading-relaxed">{texto}</p>
    </div>
  );
}

// ─── ResultadoInlineCard ──────────────────────────────────────────────────────

function ResultadoInlineCard({ resultado, onNova }: { resultado: ResultadoInline; onNova: () => void }) {
  const { scoreD, scoreI, scoreS, scoreC, dominante, secundario, analise, nomeColaborador } = resultado;
  const dcfg = DISC_CONFIG[dominante as keyof typeof DISC_CONFIG];
  const scfg = DISC_CONFIG[secundario as keyof typeof DISC_CONFIG];
  const [secao, setSecao] = useState<'geral' | 'trabalho' | 'equipe'>('geral');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
        <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
        <div>
          <p className="text-emerald-300 font-semibold text-sm">Avaliação concluída!</p>
          <p className="text-white/40 text-xs">Perfil de <span className="text-white">{nomeColaborador}</span> salvo automaticamente</p>
        </div>
      </div>

      {/* Perfil + Scores */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className={`${dcfg.bg} text-white font-bold text-xl w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0`}>{dominante}</span>
          <div>
            <p className={`font-bold text-base ${dcfg.cor}`}>{dcfg.label}</p>
            <p className="text-white/40 text-sm">com influência de <span className={scfg.cor}>{scfg.label}</span></p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {[{ l: 'D', s: scoreD }, { l: 'I', s: scoreI }, { l: 'S', s: scoreS }, { l: 'C', s: scoreC }].map(({ l, s }) => (
            <ScoreBar key={l} letra={l} score={s} size="sm" />
          ))}
        </div>
      </div>

      {/* Tabs de conteúdo */}
      <div className="flex gap-1">
        {[
          { key: 'geral',    label: 'Visão Geral' },
          { key: 'trabalho', label: 'Trabalho' },
          { key: 'equipe',   label: 'Equipe' },
        ].map(t => (
          <button key={t.key} onClick={() => setSecao(t.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              secao === t.key ? 'bg-[#7D1F2C]/30 text-white border border-[#7D1F2C]/40' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {secao === 'geral' && (
        <div className="space-y-3">
          {analise.resumo && (
            <div className={`${dcfg.bgLight} border ${dcfg.border} rounded-xl p-4`}>
              <p className="text-white/70 text-sm leading-relaxed italic">"{analise.resumo}"</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3">
            {analise.pontos_fortes?.length > 0 && (
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingUp size={13} className="text-emerald-400" />
                  <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Pontos Fortes</p>
                </div>
                <div className="space-y-1.5">
                  {analise.pontos_fortes.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Check size={10} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      <p className="text-white/65 text-xs">{p}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analise.pontos_fracos?.length > 0 && (
              <div className="bg-orange-500/8 border border-orange-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <TrendingDown size={13} className="text-orange-400" />
                  <p className="text-orange-400 text-xs font-semibold uppercase tracking-wider">A Desenvolver</p>
                </div>
                <div className="space-y-1.5">
                  {analise.pontos_fracos.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <ChevronRight size={10} className="text-orange-400 mt-0.5 flex-shrink-0" />
                      <p className="text-white/65 text-xs">{p}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {secao === 'trabalho' && (
        <div className="space-y-3">
          {analise.visao_trabalho && <InfoCard icon={Briefcase} cor="text-blue-400" borda="border-blue-500/20" bg="bg-blue-500/8" titulo="Estilo de Trabalho" texto={analise.visao_trabalho} />}
          {analise.estilo_comunicacao && <InfoCard icon={MessageSquare} cor="text-yellow-400" borda="border-yellow-500/20" bg="bg-yellow-500/8" titulo="Comunicação" texto={analise.estilo_comunicacao} />}
          {analise.como_motivar && <InfoCard icon={Zap} cor="text-emerald-400" borda="border-emerald-500/20" bg="bg-emerald-500/8" titulo="Como Motivar" texto={analise.como_motivar} />}
          {analise.como_desafia && <InfoCard icon={AlertCircle} cor="text-orange-400" borda="border-orange-500/20" bg="bg-orange-500/8" titulo="O que Gera Estresse" texto={analise.como_desafia} />}
        </div>
      )}

      {secao === 'equipe' && (
        <div className="space-y-3">
          {analise.visao_equipe && <InfoCard icon={Users} cor="text-emerald-400" borda="border-emerald-500/20" bg="bg-emerald-500/8" titulo="Na Equipe" texto={analise.visao_equipe} />}
          {analise.estilo_lideranca && <InfoCard icon={Shield} cor="text-[#D4AF37]" borda="border-[#D4AF37]/20" bg="bg-[#D4AF37]/8" titulo="Liderança" texto={analise.estilo_lideranca} />}
        </div>
      )}

      <button onClick={onNova}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
        <Plus size={14} /> Nova avaliação
      </button>
    </div>
  );
}

// ─── QuestionarioInline ───────────────────────────────────────────────────────

function QuestionarioInline({ colaboradorId, nomeColaborador, onConcluido, onCancelar }: {
  colaboradorId: string; nomeColaborador: string;
  onConcluido: (r: ResultadoInline) => void; onCancelar: () => void;
}) {
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [blocoAtual, setBlocoAtual] = useState(0);
  const [mais, setMais] = useState<string | null>(null);
  const [menos, setMenos] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<number, { mais: string; menos: string }>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sessaoId, setSessaoId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: sessao } = await supabase
        .from('rh_disc_sessoes')
        .insert({ tipo: 'colaborador', colaborador_id: colaboradorId, status: 'em_andamento', iniciado_em: new Date().toISOString(), expira_em: new Date(Date.now() + 2 * 3600000).toISOString() })
        .select('id').single();
      if (sessao) setSessaoId(sessao.id);

      const { data: ps } = await supabase.from('rh_disc_perguntas').select('*').eq('ativo', true).order('ordem');
      setPerguntas((ps ?? []) as Pergunta[]);
      setCarregando(false);
    };
    init();
  }, [colaboradorId]);

  useEffect(() => {
    const r = respostas[blocoAtual];
    if (r) { setMais(r.mais); setMenos(r.menos); } else { setMais(null); setMenos(null); }
  }, [blocoAtual]);

  const selecionarOpcao = (letra: string, tipo: 'mais' | 'menos') => {
    if (tipo === 'mais') { if (letra === menos) setMenos(null); setMais(p => p === letra ? null : letra); }
    else { if (letra === mais) setMais(null); setMenos(p => p === letra ? null : letra); }
  };

  const avancar = async () => {
    if (!mais || !menos || !sessaoId) return;
    const pergunta = perguntas[blocoAtual];
    await supabase.from('rh_disc_respostas').upsert(
      { sessao_id: sessaoId, pergunta_id: pergunta.id, opcao_mais: mais, opcao_menos: menos, respondido_em: new Date().toISOString() },
      { onConflict: 'sessao_id,pergunta_id' }
    );
    const novas = { ...respostas, [blocoAtual]: { mais, menos } };
    setRespostas(novas);
    setMais(null); setMenos(null);
    if (blocoAtual < perguntas.length - 1) setBlocoAtual(b => b + 1);
    else finalizar(sessaoId);
  };

  const finalizar = async (sid: string) => {
    setSalvando(true);
    const { data: dbR } = await supabase
      .from('rh_disc_respostas')
      .select('opcao_mais, opcao_menos, rh_disc_perguntas(opcoes)')
      .eq('sessao_id', sid);

    const scores = { D: 0, I: 0, S: 0, C: 0 };
    (dbR ?? []).forEach((r: any) => {
      const opcoes: Array<{ letra: string; perfil: string }> = r.rh_disc_perguntas?.opcoes ?? [];
      const maisOp = opcoes.find(o => o.letra === r.opcao_mais);
      const menosOp = opcoes.find(o => o.letra === r.opcao_menos);
      if (maisOp) { const k = maisOp.perfil[0] as keyof typeof scores; if (k in scores) scores[k] += 2; }
      if (menosOp) { const k = menosOp.perfil[0] as keyof typeof scores; if (k in scores) scores[k] -= 1; }
    });

    const pos = { D: Math.max(0, scores.D), I: Math.max(0, scores.I), S: Math.max(0, scores.S), C: Math.max(0, scores.C) };
    const total = Object.values(pos).reduce((a, b) => a + b, 0) || 1;
    const sD = Math.round((pos.D / total) * 100);
    const sI = Math.round((pos.I / total) * 100);
    const sS = Math.round((pos.S / total) * 100);
    const sC = Math.round((pos.C / total) * 100);
    const ranking = [{ p: 'D', v: sD }, { p: 'I', v: sI }, { p: 'S', v: sS }, { p: 'C', v: sC }].sort((a, b) => b.v - a.v);
    const dominante = ranking[0].p; const secundario = ranking[1].p;

    let analise: AnaliseCompleta = {
      resumo: `Perfil ${dominante}/${secundario} identificado.`,
      pontos_fortes: ['Dedicado', 'Comprometido', 'Confiável'],
      pontos_fracos: ['Em desenvolvimento'],
      areas_desenvolvimento: ['Comunicação interpessoal'],
      estilo_comunicacao: 'Comunicação direta e objetiva.',
      estilo_lideranca: 'Liderança pelo exemplo.',
      como_motivar: 'Reconhecimento pelo bom trabalho.',
      como_desafia: 'Alta pressão constante.',
      visao_equipe: 'Colaborativo e presente.',
      visao_trabalho: 'Dedicado e comprometido.',
    };

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-disc-ia`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ nome: nomeColaborador, scoreD: sD, scoreI: sI, scoreS: sS, scoreC: sC, dominante, secundario }) }
      );
      if (res.ok) { const d = await res.json(); if (d.resumo) analise = d; }
    } catch { /* usa fallback */ }

    await supabase.from('rh_disc_sessoes').update({
      status: 'concluido', concluido_em: new Date().toISOString(),
      score_d: sD, score_i: sI, score_s: sS, score_c: sC,
      perfil_dominante: dominante, perfil_secundario: secundario,
      resumo_ia: analise.resumo,
      pontos_fortes: analise.pontos_fortes,
      areas_desenvolvimento: analise.areas_desenvolvimento,
      estilo_comunicacao: analise.estilo_comunicacao,
      como_motivar: analise.como_motivar,
      analise_ia: analise,
    }).eq('id', sid);

    onConcluido({ scoreD: sD, scoreI: sI, scoreS: sS, scoreC: sC, dominante, secundario, analise, nomeColaborador });
  };

  if (carregando) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
      <p className="text-white/40 text-sm">Carregando questionário...</p>
    </div>
  );

  if (salvando) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-14 h-14">
        <div className="w-14 h-14 rounded-full border-4 border-[#7D1F2C]/20 border-t-[#7D1F2C] animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center"><Target className="w-6 h-6 text-[#D4AF37]" /></div>
      </div>
      <p className="text-white/60 text-sm">Calculando perfil e gerando análise com IA...</p>
    </div>
  );

  const pergunta = perguntas[blocoAtual];
  if (!pergunta) return null;
  const opcoes = pergunta.opcoes ?? [];
  const pct = Math.round(((blocoAtual + 1) / perguntas.length) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => blocoAtual > 0 ? setBlocoAtual(b => b - 1) : onCancelar()}
          className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white transition-colors flex-shrink-0">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>Bloco {blocoAtual + 1} de {perguntas.length}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#7D1F2C] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button onClick={onCancelar} className="p-2 rounded-xl bg-white/5 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 bg-[#D4AF37]/8 border border-[#D4AF37]/20 rounded-xl px-4 py-2.5">
        <Target size={13} className="text-[#D4AF37]" />
        <p className="text-[#D4AF37]/80 text-xs">Respondendo por: <span className="font-semibold text-[#D4AF37]">{nomeColaborador}</span></p>
      </div>

      <p className="text-white/40 text-xs bg-white/3 rounded-xl px-4 py-3">
        {pergunta.instrucao || 'Escolha a palavra que MAIS e a que MENOS descreve esta pessoa:'}
      </p>

      <div className="flex gap-2">
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
          <Check size={11} className="text-emerald-400" /><span className="text-emerald-400 text-xs font-medium">MAIS descreve</span>
        </div>
        <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
          <X size={11} className="text-red-400" /><span className="text-red-400 text-xs font-medium">MENOS descreve</span>
        </div>
      </div>

      <div className="space-y-2">
        {opcoes.map(opcao => {
          const ehMais = mais === opcao.letra; const ehMenos = menos === opcao.letra;
          return (
            <div key={opcao.letra} className={`rounded-xl border transition-all ${ehMais ? 'border-emerald-500/50 bg-emerald-500/8' : ehMenos ? 'border-red-500/50 bg-red-500/8' : 'border-white/10 bg-white/3 hover:border-white/20'}`}>
              <div className="flex items-center px-4 py-3 gap-3">
                <span className="text-white/25 text-xs font-bold w-4">{opcao.letra}</span>
                <span className={`flex-1 text-sm font-medium ${ehMais ? 'text-emerald-300' : ehMenos ? 'text-red-300' : 'text-white/80'}`}>{opcao.texto}</span>
                <div className="flex gap-2">
                  <button onClick={() => selecionarOpcao(opcao.letra, 'mais')} title="Mais descreve"
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${ehMais ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/15 text-white/30 hover:border-emerald-500/50 hover:text-emerald-400'}`}>
                    <Check size={13} />
                  </button>
                  <button onClick={() => selecionarOpcao(opcao.letra, 'menos')} title="Menos descreve"
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${ehMenos ? 'bg-red-500 border-red-500 text-white' : 'border-white/15 text-white/30 hover:border-red-500/50 hover:text-red-400'}`}>
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(!mais || !menos) && (
        <p className="text-white/25 text-xs text-center">{!mais && !menos ? 'Selecione MAIS e MENOS para continuar' : !mais ? 'Selecione MAIS' : 'Selecione MENOS'}</p>
      )}

      <button onClick={avancar} disabled={!mais || !menos}
        className="w-full py-3 bg-[#7D1F2C] hover:bg-[#9b2535] disabled:bg-white/5 disabled:text-white/20 text-white font-semibold rounded-xl text-sm transition-all disabled:cursor-not-allowed">
        {blocoAtual === perguntas.length - 1 ? 'Concluir e Calcular Perfil' : 'Próxima palavra'}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PerfilDISC() {
  const [aba, setAba] = useState<Aba>('mapa');
  const [time, setTime] = useState<DiscColaborador[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCol, setFiltroCol] = useState('');

  // Sliders
  const [form, setForm] = useState<Record<string, any>>({ colaborador_id: '', d: 50, i: 50, s: 50, c: 50, aplicado_por: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);

  // Questionário inline
  const [modoAplicar, setModoAplicar] = useState<ModoAplicar>('escolha');
  const [qColaboradorId, setQColaboradorId] = useState('');
  const [qNomeColaborador, setQNomeColaborador] = useState('');
  const [resultadoInline, setResultadoInline] = useState<ResultadoInline | null>(null);

  // Modal perfil detalhado
  const [modalDetalhe, setModalDetalhe] = useState<{ nome: string; detalhe: DiscDetalhe } | null>(null);

  // WhatsApp
  const [modo, setModo] = useState<ModoEnvio>('colaborador');
  const [wpColaboradorId, setWpColaboradorId] = useState('');
  const [wpCandidatoId, setWpCandidatoId] = useState('');
  const [wpNomeExterno, setWpNomeExterno] = useState('');
  const [wpGerente, setWpGerente] = useState('');
  const [wpDias, setWpDias] = useState(7);
  const [wpGerandoLink, setWpGerandoLink] = useState(false);
  const [wpLinkGerado, setWpLinkGerado] = useState('');
  const [wpMensagem, setWpMensagem] = useState('');
  const [wpNomeGerado, setWpNomeGerado] = useState('');
  const [wpCopiado, setWpCopiado] = useState<'link' | 'msg' | null>(null);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loadingSessoes, setLoadingSessoes] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (aba !== 'whatsapp') return;
    fetchSessoes();
    const iv = setInterval(fetchSessoes, 30000);
    return () => clearInterval(iv);
  }, [aba]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: t }, { data: c }, { data: cands }] = await Promise.all([
      supabase.from('vw_disc_time').select('*'),
      supabase.from('colaboradores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo'),
      supabase.from('rh_candidatos').select('id, nome').order('nome'),
    ]);
    setTime((t ?? []) as DiscColaborador[]);
    setColaboradores((c ?? []) as Colaborador[]);
    setCandidatos((cands ?? []) as Candidato[]);
    setLoading(false);
  };

  const fetchSessoes = useCallback(async () => {
    setLoadingSessoes(true);
    const { data } = await supabase
      .from('rh_disc_sessoes')
      .select('id, token, tipo, status, criado_em, expira_em, concluido_em, nome_respondente, colaboradores ( nome_completo ), rh_candidatos ( nome )')
      .order('criado_em', { ascending: false }).limit(20);
    const agora = new Date();
    setSessoes((data ?? []).map((s: any) => ({
      ...s,
      nome: s.colaboradores?.nome_completo || s.rh_candidatos?.nome || s.nome_respondente || '—',
      statusExibicao: s.status === 'concluido' ? 'concluido' : s.status === 'em_andamento' ? 'andamento' : new Date(s.expira_em) < agora ? 'expirado' : 'pendente',
    })));
    setLoadingSessoes(false);
  }, []);

  const abrirDetalhe = async (colId: string, nome: string) => {
    const { data } = await supabase
      .from('rh_disc_colaborador')
      .select('*')
      .eq('colaborador_id', colId)
      .maybeSingle();
    if (data) setModalDetalhe({ nome, detalhe: data as DiscDetalhe });
  };

  const carregarDisc = async (colaboradorId: string) => {
    const { data } = await supabase.from('rh_disc_colaborador').select('*').eq('colaborador_id', colaboradorId).maybeSingle();
    if (data) setForm({ colaborador_id: colaboradorId, d: data.score_d, i: data.score_i, s: data.score_s, c: data.score_c, aplicado_por: data.aplicado_por, observacoes: data.observacoes || '' });
    else setForm(f => ({ ...f, colaborador_id: colaboradorId, d: 50, i: 50, s: 50, c: 50 }));
  };

  const salvarSliders = async () => {
    if (!form.colaborador_id) return;
    setSalvando(true);
    const { dominante, secundario } = calcPerfis(form.d, form.i, form.s, form.c);
    await supabase.from('rh_disc_colaborador').upsert({
      colaborador_id: form.colaborador_id, score_d: form.d, score_i: form.i, score_s: form.s, score_c: form.c,
      perfil_dominante: dominante, perfil_secundario: secundario,
      aplicado_por: form.aplicado_por || '', observacoes: form.observacoes || '',
      data_aplicacao: dayjs().format('YYYY-MM-DD'),
    }, { onConflict: 'colaborador_id' });
    setSalvando(false); fetchAll(); setAba('mapa');
  };

  const iniciarQuestionario = () => {
    if (!qColaboradorId) return;
    setQNomeColaborador(colaboradores.find(c => c.id === qColaboradorId)?.nome_completo ?? '');
    setModoAplicar('questionario');
  };

  const handleConcluido = (resultado: ResultadoInline) => {
    setResultadoInline(resultado); setModoAplicar('resultado'); fetchAll();
  };

  const resetAplicar = () => {
    setModoAplicar('escolha'); setQColaboradorId(''); setQNomeColaborador(''); setResultadoInline(null);
    setForm({ colaborador_id: '', d: 50, i: 50, s: 50, c: 50, aplicado_por: '', observacoes: '' });
  };

  const gerarLink = async () => {
    const valido = (modo === 'colaborador' && wpColaboradorId) || (modo === 'candidato' && wpCandidatoId) || (modo === 'externo' && wpNomeExterno.trim());
    if (!valido) return;
    setWpGerandoLink(true);
    try {
      const payload: any = { criado_por: wpGerente || null, status: 'pendente', expira_em: new Date(Date.now() + wpDias * 86400000).toISOString() };
      if (modo === 'colaborador') { payload.tipo = 'colaborador'; payload.colaborador_id = wpColaboradorId; }
      else if (modo === 'candidato') { payload.tipo = 'candidato'; payload.candidato_id = wpCandidatoId; }
      else { payload.tipo = 'colaborador'; payload.nome_respondente = wpNomeExterno.trim(); }

      const { data: sessao, error } = await supabase.from('rh_disc_sessoes').insert(payload).select('*, colaboradores ( nome_completo ), rh_candidatos ( nome )').single();
      if (error) throw error;

      const nome = (sessao.colaboradores as any)?.nome_completo || (sessao.rh_candidatos as any)?.nome || sessao.nome_respondente || 'Participante';
      const link = `${window.location.origin}/disc?token=${sessao.token}`;
      const validade = new Date(sessao.expira_em).toLocaleDateString('pt-BR');
      const mensagem = `Olá ${nome.split(' ')[0]}! 👋\n\nO Ditado Popular está fazendo o mapeamento de perfil comportamental da equipe.\n\nPedimos que responda uma avaliação rápida (cerca de 10 minutos) no link abaixo:\n\n👉 ${link}\n\nNão há respostas certas ou erradas — seja sincero! ✅\n\nVálido até: ${validade}`;
      setWpLinkGerado(link); setWpMensagem(mensagem); setWpNomeGerado(nome); fetchSessoes();
    } catch (e: any) { alert('Erro ao gerar link: ' + e.message); }
    finally { setWpGerandoLink(false); }
  };

  const copiar = (tipo: 'link' | 'msg') => {
    copyText(tipo === 'link' ? wpLinkGerado : wpMensagem);
    setWpCopiado(tipo); setTimeout(() => setWpCopiado(null), 2000);
  };

  const novoLink = () => { setWpLinkGerado(''); setWpMensagem(''); setWpNomeGerado(''); setWpColaboradorId(''); setWpCandidatoId(''); setWpNomeExterno(''); };

  const comDisc = time.filter(t => t.score_d !== null);
  const semDisc = time.filter(t => t.score_d === null);
  const porPerfil: Record<string, DiscColaborador[]> = { D: [], I: [], S: [], C: [] };
  comDisc.forEach(c => { if (c.perfil_dominante) porPerfil[c.perfil_dominante]?.push(c); });
  const resultadosFiltrados = comDisc.filter(c => c.nome_completo.toLowerCase().includes(filtroCol.toLowerCase()));

  const ABAS = [
    { key: 'mapa'      as Aba, label: 'Mapa do Time' },
    { key: 'aplicar'   as Aba, label: 'Aplicar DISC' },
    { key: 'resultados'as Aba, label: 'Resultados' },
    { key: 'whatsapp'  as Aba, label: 'Enviar por WhatsApp' },
  ];

  return (
    <div className="space-y-6">
      {/* Modal de perfil detalhado */}
      {modalDetalhe && (
        <PerfilDetalhadoModal nome={modalDetalhe.nome} detalhe={modalDetalhe.detalhe} onClose={() => setModalDetalhe(null)} />
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {ABAS.map(t => (
            <button key={t.key} onClick={() => { setAba(t.key); if (t.key === 'aplicar') resetAplicar(); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${aba === t.key ? 'bg-[#7D1F2C] text-white' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}>
              {t.key === 'whatsapp' && <MessageSquare size={13} className="inline mr-1.5 mb-0.5" />}
              {t.label}
            </button>
          ))}
        </div>
        {(aba === 'mapa' || aba === 'resultados') && (
          <div className="flex items-center gap-3 text-white/40 text-sm">
            <span>{comDisc.length} com DISC</span><span>·</span>
            <span className="text-yellow-400">{semDisc.length} sem avaliação</span>
          </div>
        )}
      </div>

      {loading && (aba === 'mapa' || aba === 'resultados') ? (
        <div className="text-center py-12 text-white/40">Carregando...</div>
      ) : aba === 'mapa' ? (
        /* ── MAPA ──────────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['D', 'I', 'S', 'C'] as const).map(k => {
            const cfg = DISC_CONFIG[k]; const lista = porPerfil[k] ?? [];
            return (
              <div key={k} className={`${cfg.bgLight} border ${cfg.border} rounded-xl p-5`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 ${cfg.bg} rounded-xl flex items-center justify-center text-white font-bold text-lg`}>{k}</div>
                  <div><p className={`font-semibold ${cfg.cor}`}>{cfg.label}</p><p className="text-white/40 text-xs">{cfg.desc}</p></div>
                </div>
                {lista.length === 0 ? <p className="text-white/30 text-sm text-center py-4">Nenhum colaborador</p> : (
                  <div className="space-y-2">
                    {lista.map(c => (
                      <div key={c.colaborador_id} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-white text-sm">{c.nome_completo}</p>
                          <p className="text-white/40 text-xs">{c.funcao_nome}</p>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          {(['D', 'I', 'S', 'C'] as const).map(dk => {
                            const val = c[`score_${dk.toLowerCase()}` as keyof DiscColaborador] as number ?? 0;
                            const dc = DISC_CONFIG[dk];
                            return (
                              <div key={dk} className="text-center">
                                <div className="w-8 h-8 flex items-end justify-center bg-black/30 rounded overflow-hidden">
                                  <div className={`${dc.bg} w-full`} style={{ height: `${val}%` }} />
                                </div>
                                <p className={`text-[10px] ${dc.cor} mt-0.5`}>{val}%</p>
                              </div>
                            );
                          })}
                          <button onClick={() => abrirDetalhe(c.colaborador_id, c.nome_completo)}
                            className="ml-1 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/40 hover:text-white transition-all" title="Ver perfil completo">
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : aba === 'aplicar' ? (
        /* ── APLICAR ─────────────────────────────────────────────────────── */
        <div>
          {modoAplicar === 'escolha' && (
            <div className="max-w-xl mx-auto space-y-4">
              <p className="text-white/50 text-sm text-center">Como deseja aplicar o DISC?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => setModoAplicar('questionario_select')}
                  className="flex flex-col items-start gap-3 p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-[#7D1F2C]/40 hover:bg-[#7D1F2C]/8 transition-all text-left">
                  <div className="w-10 h-10 rounded-xl bg-[#7D1F2C]/20 border border-[#7D1F2C]/30 flex items-center justify-center"><ClipboardList size={18} className="text-[#D4AF37]" /></div>
                  <div><p className="text-white font-semibold text-sm mb-1">Questionário completo</p><p className="text-white/40 text-xs leading-relaxed">28 blocos de palavras — aplica direto no sistema, presencialmente</p></div>
                  <span className="text-xs font-medium px-2.5 py-1 bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] rounded-lg">Recomendado</span>
                </button>
                <button onClick={() => setModoAplicar('sliders')}
                  className="flex flex-col items-start gap-3 p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-white/25 hover:bg-white/8 transition-all text-left">
                  <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/15 flex items-center justify-center"><SlidersHorizontal size={18} className="text-white/60" /></div>
                  <div><p className="text-white font-semibold text-sm mb-1">Inserção manual</p><p className="text-white/40 text-xs leading-relaxed">Ajuste direto dos scores D/I/S/C — para importar resultado externo</p></div>
                  <span className="text-xs font-medium px-2.5 py-1 bg-white/5 border border-white/10 text-white/40 rounded-lg">Avançado</span>
                </button>
              </div>
            </div>
          )}

          {modoAplicar === 'questionario_select' && (
            <div className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <button onClick={() => setModoAplicar('escolha')} className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-white transition-colors"><ChevronLeft size={16} /></button>
                  <div><p className="text-white font-semibold">Questionário Completo</p><p className="text-white/40 text-xs">Selecione o colaborador</p></div>
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Colaborador *</label>
                  <select className={sel} value={qColaboradorId} onChange={e => setQColaboradorId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                  </select>
                </div>
                {qColaboradorId && (
                  <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/20 rounded-xl px-4 py-3">
                    <p className="text-white/40 text-xs">Respondendo por</p>
                    <p className="text-[#D4AF37] font-semibold">{colaboradores.find(c => c.id === qColaboradorId)?.nome_completo}</p>
                  </div>
                )}
                <button onClick={iniciarQuestionario} disabled={!qColaboradorId}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#7D1F2C] hover:bg-[#9b2535] disabled:bg-white/5 disabled:text-white/20 text-white font-semibold rounded-xl text-sm transition-all disabled:cursor-not-allowed">
                  <Play size={15} /> Iniciar Questionário
                </button>
              </div>
            </div>
          )}

          {modoAplicar === 'questionario' && (
            <div className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <QuestionarioInline colaboradorId={qColaboradorId} nomeColaborador={qNomeColaborador} onConcluido={handleConcluido} onCancelar={() => setModoAplicar('questionario_select')} />
              </div>
            </div>
          )}

          {modoAplicar === 'resultado' && resultadoInline && (
            <div className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <ResultadoInlineCard resultado={resultadoInline} onNova={resetAplicar} />
              </div>
            </div>
          )}

          {modoAplicar === 'sliders' && (
            <div className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <button onClick={() => setModoAplicar('escolha')} className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-white transition-colors"><ChevronLeft size={16} /></button>
                  <div><p className="text-white font-semibold">Inserção Manual</p><p className="text-white/40 text-xs">Ajuste os scores via sliders</p></div>
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Colaborador</label>
                  <select value={form.colaborador_id || ''} onChange={e => { setForm(f => ({ ...f, colaborador_id: e.target.value })); carregarDisc(e.target.value); }} className={sel}>
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  {(['D', 'I', 'S', 'C'] as const).map(k => {
                    const cfg = DISC_CONFIG[k]; const val = form[k.toLowerCase()] ?? 50;
                    return (
                      <div key={k}>
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 ${cfg.bg} rounded-lg flex items-center justify-center text-white font-bold text-sm`}>{k}</span>
                            <span className={`text-sm font-medium ${cfg.cor}`}>{cfg.label}</span>
                          </div>
                          <span className={`text-lg font-bold ${cfg.cor}`}>{val}%</span>
                        </div>
                        <input type="range" min={0} max={100} value={val}
                          onChange={e => setForm(f => ({ ...f, [k.toLowerCase()]: parseInt(e.target.value) }))}
                          className="w-full h-2 rounded-full appearance-none cursor-pointer"
                          style={{ accentColor: cfg.hex }} />
                      </div>
                    );
                  })}
                </div>
                {form.colaborador_id && (() => {
                  const { dominante, secundario } = calcPerfis(form.d, form.i, form.s, form.c);
                  const dc = DISC_CONFIG[dominante as keyof typeof DISC_CONFIG]; const sc = DISC_CONFIG[secundario as keyof typeof DISC_CONFIG];
                  return (
                    <div className="p-4 bg-white/5 rounded-xl flex items-center gap-3">
                      <span className={`${dc.bg} text-white font-bold px-3 py-1 rounded-lg`}>{dominante}</span>
                      <span className="text-white/40">/</span>
                      <span className={`${sc.bgLight} border ${sc.border} ${sc.cor} font-medium px-3 py-1 rounded-lg`}>{secundario}</span>
                      <span className="text-white/40 text-sm">{dc.label} · {sc.label}</span>
                    </div>
                  );
                })()}
                <div><label className="text-white/60 text-xs mb-1.5 block">Aplicado por</label><input value={form.aplicado_por || ''} onChange={e => setForm(f => ({ ...f, aplicado_por: e.target.value }))} className={inp} /></div>
                <div className="flex gap-2">
                  <button onClick={() => setModoAplicar('escolha')} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white hover:bg-white/5 text-sm transition-all">Voltar</button>
                  <button onClick={salvarSliders} disabled={salvando || !form.colaborador_id}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                    <Save size={14} />{salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      ) : aba === 'resultados' ? (
        /* ── RESULTADOS ─────────────────────────────────────────────────── */
        <div className="space-y-4">
          <input value={filtroCol} onChange={e => setFiltroCol(e.target.value)} placeholder="Buscar colaborador..."
            className="bg-white/5 border border-white/15 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none w-64" />
          {resultadosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-white/30 text-sm">{filtroCol ? 'Nenhum resultado encontrado.' : 'Nenhum colaborador com avaliação DISC ainda.'}</div>
          ) : (
            <div className="space-y-2">
              {resultadosFiltrados.map(c => {
                const dcfg = DISC_CONFIG[(c.perfil_dominante as keyof typeof DISC_CONFIG) ?? 'D'];
                const scfg = DISC_CONFIG[(c.perfil_secundario as keyof typeof DISC_CONFIG) ?? 'I'];
                return (
                  <div key={c.colaborador_id}
                    className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.08] transition-all cursor-pointer"
                    onClick={() => abrirDetalhe(c.colaborador_id, c.nome_completo)}>
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-full ${dcfg.bg} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                        {c.nome_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{c.nome_completo}</p>
                        <p className="text-white/50 text-xs">{c.funcao_nome}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {/* Scores com percentual */}
                      <div className="hidden sm:flex gap-3">
                        {(['D', 'I', 'S', 'C'] as const).map(k => {
                          const val = c[`score_${k.toLowerCase()}` as keyof DiscColaborador] as number ?? 0;
                          const kc = DISC_CONFIG[k];
                          return (
                            <div key={k} className="text-center w-10">
                              <div className="w-10 h-10 flex items-end justify-center bg-white/5 rounded-lg overflow-hidden">
                                <div className={`${kc.bg} w-full`} style={{ height: `${val}%` }} />
                              </div>
                              <p className={`text-[10px] ${kc.cor} mt-0.5 font-semibold`}>{val}%</p>
                            </div>
                          );
                        })}
                      </div>
                      {/* Badge perfil */}
                      <div className="flex items-center gap-1.5">
                        <span className={`${dcfg.bg} text-white text-xs font-bold px-2.5 py-1 rounded-lg`}>{c.perfil_dominante}</span>
                        <span className={`${scfg.bgLight} ${scfg.cor} text-xs font-medium px-2.5 py-1 rounded-lg border ${scfg.border}`}>{c.perfil_secundario}</span>
                      </div>
                      {c.data_aplicacao && <span className="text-white/25 text-xs hidden md:block">{dayjs(c.data_aplicacao).format('DD/MM/YY')}</span>}
                      <ChevronRight size={14} className="text-white/30" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (
        /* ── WHATSAPP ─────────────────────────────────────────────────────── */
        <div className="space-y-6">
          {!wpLinkGerado ? (
            <div className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center"><MessageSquare size={18} className="text-emerald-400" /></div>
                  <div><p className="text-white font-semibold">Enviar Avaliação DISC por WhatsApp</p><p className="text-white/40 text-xs">Gera link único — colaborador responde no celular</p></div>
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-2 block">Para quem é a avaliação?</label>
                  <div className="space-y-2">
                    {([
                      { value: 'colaborador', label: 'Colaborador da equipe', desc: 'Membro ativo do time' },
                      { value: 'candidato',   label: 'Candidato em seleção',  desc: 'Processo seletivo ativo' },
                      { value: 'externo',     label: 'Pessoa externa',        desc: 'Sem cadastro no sistema' },
                    ] as { value: ModoEnvio; label: string; desc: string }[]).map(opt => (
                      <button key={opt.value} onClick={() => setModo(opt.value)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${modo === opt.value ? 'border-[#7D1F2C]/60 bg-[#7D1F2C]/15' : 'border-white/10 bg-white/3 hover:border-white/20'}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${modo === opt.value ? 'border-[#D4AF37]' : 'border-white/30'}`}>
                          {modo === opt.value && <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />}
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${modo === opt.value ? 'text-white' : 'text-white/60'}`}>{opt.label}</p>
                          <p className="text-white/30 text-xs">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {modo === 'colaborador' && <div><label className="text-white/60 text-xs mb-1.5 block">Colaborador *</label><select className={sel} value={wpColaboradorId} onChange={e => setWpColaboradorId(e.target.value)}><option value="">Selecione...</option>{colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}</select></div>}
                {modo === 'candidato' && <div><label className="text-white/60 text-xs mb-1.5 block">Candidato *</label><select className={sel} value={wpCandidatoId} onChange={e => setWpCandidatoId(e.target.value)}><option value="">Selecione...</option>{candidatos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>}
                {modo === 'externo' && <div><label className="text-white/60 text-xs mb-1.5 block">Nome completo *</label><input className={inp} placeholder="Ex: Maria dos Santos" value={wpNomeExterno} onChange={e => setWpNomeExterno(e.target.value)} /></div>}
                <div><label className="text-white/60 text-xs mb-1.5 block">Enviado por</label><input className={inp} placeholder="Seu nome (opcional)" value={wpGerente} onChange={e => setWpGerente(e.target.value)} /></div>
                <div>
                  <label className="text-white/60 text-xs mb-2 block">Validade do link</label>
                  <div className="flex gap-2">
                    {DIAS_VALIDADE.map(d => (
                      <button key={d.valor} onClick={() => setWpDias(d.valor)}
                        className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${wpDias === d.valor ? 'bg-[#7D1F2C]/30 border-[#7D1F2C]/60 text-white' : 'border-white/10 text-white/40 hover:border-white/25'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={gerarLink}
                  disabled={wpGerandoLink || (modo === 'colaborador' && !wpColaboradorId) || (modo === 'candidato' && !wpCandidatoId) || (modo === 'externo' && !wpNomeExterno.trim())}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Send size={16} />{wpGerandoLink ? 'Gerando...' : 'Gerar Link'}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-lg mx-auto">
              <div className="bg-white/5 border border-emerald-500/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center"><CheckCircle size={18} className="text-emerald-400" /></div>
                  <div><p className="text-white font-semibold">Link gerado para {wpNomeGerado}</p><p className="text-white/40 text-xs">Válido até {new Date(Date.now() + wpDias * 86400000).toLocaleDateString('pt-BR')}</p></div>
                </div>
                <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3">
                  <p className="text-white/40 text-xs mb-1">Link da avaliação</p>
                  <p className="text-white/80 text-xs break-all font-mono">{wpLinkGerado}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => copiar('link')} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${wpCopiado === 'link' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/15 text-white/70 hover:bg-white/5'}`}>
                    {wpCopiado === 'link' ? <CheckCircle size={14} /> : <Copy size={14} />}{wpCopiado === 'link' ? 'Copiado!' : 'Copiar link'}
                  </button>
                  <button onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(wpMensagem)}`, '_blank', 'noopener,noreferrer')}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-sm font-medium transition-all">
                    <ExternalLink size={14} /> Abrir WhatsApp
                  </button>
                </div>
                <button onClick={() => copiar('msg')} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${wpCopiado === 'msg' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                  {wpCopiado === 'msg' ? <CheckCircle size={14} /> : <Copy size={14} />}{wpCopiado === 'msg' ? 'Mensagem copiada!' : 'Copiar mensagem completa'}
                </button>
                <div className="flex items-center gap-2 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3">
                  <Clock size={14} className="text-yellow-400 flex-shrink-0" />
                  <p className="text-yellow-300 text-sm">Aguardando {wpNomeGerado.split(' ')[0]}...</p>
                </div>
                <button onClick={novoLink} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-sm font-medium transition-all">
                  <Plus size={14} /> Gerar novo link
                </button>
              </div>
            </div>
          )}

          {/* Lista sessões */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/60 text-sm font-medium">Últimas avaliações enviadas</p>
              <button onClick={fetchSessoes} className="p-1.5 text-white/30 hover:text-white/60 transition-colors rounded-lg hover:bg-white/5"><RefreshCw size={14} className={loadingSessoes ? 'animate-spin' : ''} /></button>
            </div>
            {sessoes.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-xl px-5 py-6 text-center"><p className="text-white/30 text-sm">Nenhuma avaliação enviada ainda.</p></div>
            ) : (
              <div className="space-y-2">
                {sessoes.map(s => {
                  const SI = s.statusExibicao === 'concluido' ? CheckCircle : s.statusExibicao === 'andamento' ? RefreshCw : s.statusExibicao === 'expirado' ? AlertCircle : Clock;
                  const sc = s.statusExibicao === 'concluido' ? 'text-emerald-400' : s.statusExibicao === 'andamento' ? 'text-blue-400' : s.statusExibicao === 'expirado' ? 'text-white/30' : 'text-yellow-400';
                  const sl = s.statusExibicao === 'concluido' ? 'Concluído' : s.statusExibicao === 'andamento' ? 'Em andamento' : s.statusExibicao === 'expirado' ? 'Expirado' : 'Aguardando';
                  return (
                    <div key={s.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-all">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{s.nome}</p>
                        <p className="text-white/30 text-xs">{s.tipo === 'candidato' ? 'Candidato' : s.nome_respondente ? 'Externo' : 'Equipe'} · {dayjs(s.criado_em).format('DD/MM HH:mm')}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 ${sc}`}>
                        <SI size={13} className={s.statusExibicao === 'andamento' ? 'animate-spin' : ''} />
                        <span className="text-xs font-medium whitespace-nowrap">{sl}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
