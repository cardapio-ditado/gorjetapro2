import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Camera,
  CheckCircle2,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import Logo from '../../components/Logo';
import { CATEGORIAS_DESPESA, LancamentoTipo } from '../../types';
import { formatarData, formatarMoeda, hojeISO } from '../../utils/format';

const FUNCAO_URL = 'https://uazjtiafdcrhhadaucbd.supabase.co/functions/v1/prestacao-publica';

interface LancamentoInfo {
  id: string;
  tipo: LancamentoTipo;
  categoria: string | null;
  descricao: string | null;
  valor: number;
  data_lancamento: string;
  comprovante_url: string | null;
}

interface OcorrenciaInfo {
  id: string;
  descricao: string;
  foto_url: string | null;
  criado_em: string;
}

interface InfoViagem {
  viagem: {
    id: string;
    data_partida: string;
    data_retorno_prevista: string | null;
    valor_alocado: number;
    status: string;
    funcionario: { nome: string; apelido: string | null } | null;
    evento: { nome: string; cidade: string | null } | null;
  };
  lancamentos: LancamentoInfo[];
  ocorrencias: OcorrenciaInfo[];
  ia_disponivel: boolean;
}

interface Analise {
  valor: number | null;
  data: string | null;
  categoria: string;
  estabelecimento: string | null;
  descricao: string;
  confianca: 'alta' | 'media' | 'baixa';
  perguntas: string[];
}

async function chamar(acao: string, token: string, extras: Record<string, unknown> = {}) {
  const resp = await fetch(FUNCAO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao, token, ...extras }),
  });
  const dados = await resp.json();
  if (!resp.ok) throw new Error(dados.erro ?? 'Erro de conexão');
  return dados;
}

function arquivoParaBase64(arquivo: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result);
      const base64 = resultado.split(',')[1];
      resolve({ base64, mediaType: arquivo.type || 'image/jpeg' });
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

type Etapa = 'inicio' | 'analisando' | 'conferir' | 'ocorrencia' | 'enviando' | 'sucesso';

export default function PrestacaoPublica() {
  const { token } = useParams();
  const [info, setInfo] = useState<InfoViagem | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  // fluxo de lançamento
  const [etapa, setEtapa] = useState<Etapa>('inicio');
  const [tipo, setTipo] = useState<LancamentoTipo>('despesa');
  const [foto, setFoto] = useState<{ base64: string; mediaType: string; previewUrl: string } | null>(null);
  const [mensagemIA, setMensagemIA] = useState<string | null>(null);
  const [perguntas, setPerguntas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState('Lançamento salvo!');

  // campos confirmáveis
  const [fValor, setFValor] = useState('');
  const [fCategoria, setFCategoria] = useState(CATEGORIAS_DESPESA[0]);
  const [fData, setFData] = useState(hojeISO());
  const [fDescricao, setFDescricao] = useState('');

  // fluxo de ocorrência (problema com carro, etc.)
  const [ocorDescricao, setOcorDescricao] = useState('');
  const [ocorFoto, setOcorFoto] = useState<{ base64: string; mediaType: string; previewUrl: string } | null>(null);

  const inputFotoRef = useRef<HTMLInputElement>(null);
  const inputFotoOcorrenciaRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    if (!token) return;
    try {
      const dados = (await chamar('info', token)) as InfoViagem;
      setInfo(dados);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [token]);

  const resumo = useMemo(() => {
    if (!info) return { alocado: 0, gasto: 0, saldo: 0 };
    const soma = (t: LancamentoTipo) =>
      info.lancamentos.filter((l) => l.tipo === t).reduce((acc, l) => acc + Number(l.valor), 0);
    const alocado = Number(info.viagem.valor_alocado) + soma('aporte');
    const gasto = soma('despesa') + soma('devolucao');
    return { alocado, gasto, saldo: alocado - gasto };
  }, [info]);

  const aberta = info?.viagem.status === 'em_viagem' || info?.viagem.status === 'prestacao_pendente';

  function limparFormulario() {
    setErro(null);
    setMensagemIA(null);
    setPerguntas([]);
    setFoto(null);
    setFValor('');
    setFData(hojeISO());
    setEditandoId(null);
  }

  function iniciarFluxo(novoTipo: LancamentoTipo) {
    limparFormulario();
    setTipo(novoTipo);
    setFCategoria(novoTipo === 'despesa' ? CATEGORIAS_DESPESA[0] : 'Outros');
    setFDescricao(novoTipo === 'aporte' ? 'Dinheiro extra recebido' : novoTipo === 'devolucao' ? 'Devolução à empresa' : '');
    inputFotoRef.current?.click();
  }

  function lancarSemFoto() {
    limparFormulario();
    setTipo('despesa');
    setFDescricao('');
    setEtapa('conferir');
  }

  function iniciarEdicao(l: LancamentoInfo) {
    limparFormulario();
    setEditandoId(l.id);
    setTipo(l.tipo);
    setFValor(String(l.valor).replace('.', ','));
    setFCategoria(l.categoria ?? CATEGORIAS_DESPESA[0]);
    setFData(l.data_lancamento.slice(0, 10));
    setFDescricao(l.descricao ?? '');
    setEtapa('conferir');
  }

  async function excluirLancamento(id: string) {
    if (!token) return;
    if (!window.confirm('Excluir este lançamento? Não dá pra desfazer.')) return;
    try {
      await chamar('excluir_lancamento', token, { id });
      await carregar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  async function aoEscolherFoto(arquivo: File | null) {
    if (!arquivo || !token) {
      // sem foto: vai direto para conferência manual
      setEtapa('conferir');
      return;
    }
    setErro(null);
    const { base64, mediaType } = await arquivoParaBase64(arquivo);
    const previewUrl = URL.createObjectURL(arquivo);
    setFoto({ base64, mediaType, previewUrl });

    if (tipo !== 'despesa' || !info?.ia_disponivel || editandoId) {
      setEtapa('conferir');
      return;
    }

    setEtapa('analisando');
    try {
      const resp = await chamar('analisar', token, { imagem_base64: base64, media_type: mediaType });
      if (resp.analise) {
        const a = resp.analise as Analise;
        if (a.valor != null) setFValor(String(a.valor).replace('.', ','));
        if (a.data) setFData(a.data);
        if (a.categoria) setFCategoria(a.categoria);
        setFDescricao([a.estabelecimento, a.descricao].filter(Boolean).join(' — '));
        setPerguntas(a.perguntas ?? []);
        setMensagemIA(
          a.valor != null
            ? `Li o comprovante: ${formatarMoeda(a.valor)} em ${a.categoria.toLowerCase()}${a.estabelecimento ? ` (${a.estabelecimento})` : ''}. Confere?`
            : 'Não consegui ler tudo do comprovante. Me ajuda completando abaixo?'
        );
      } else if (resp.erro) {
        setMensagemIA(resp.erro);
      } else {
        setMensagemIA('Análise indisponível — preencha os dados abaixo.');
      }
    } catch {
      setMensagemIA('Não consegui analisar a foto agora — preencha os dados abaixo.');
    }
    setEtapa('conferir');
  }

  async function confirmar() {
    if (!token) return;
    const valor = parseFloat(fValor.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      setErro('Informe o valor.');
      return;
    }
    setEtapa('enviando');
    setErro(null);
    try {
      if (editandoId) {
        await chamar('editar_lancamento', token, {
          id: editandoId,
          valor,
          categoria: fCategoria,
          data_lancamento: fData,
          descricao: fDescricao.trim(),
          imagem_base64: foto?.base64 ?? '',
          media_type: foto?.mediaType ?? '',
        });
        setMensagemSucesso('Lançamento atualizado!');
      } else {
        await chamar('lancar', token, {
          tipo,
          valor,
          categoria: fCategoria,
          data_lancamento: fData,
          descricao: fDescricao.trim(),
          imagem_base64: foto?.base64 ?? '',
          media_type: foto?.mediaType ?? '',
        });
        setMensagemSucesso('Lançamento salvo!');
      }
      setEtapa('sucesso');
      await carregar();
      setTimeout(() => setEtapa('inicio'), 2200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      setEtapa('conferir');
    }
  }

  function iniciarOcorrencia() {
    setOcorDescricao('');
    setOcorFoto(null);
    setErro(null);
    setEtapa('ocorrencia');
  }

  async function aoEscolherFotoOcorrencia(arquivo: File | null) {
    if (!arquivo) return;
    const { base64, mediaType } = await arquivoParaBase64(arquivo);
    const previewUrl = URL.createObjectURL(arquivo);
    setOcorFoto({ base64, mediaType, previewUrl });
  }

  async function enviarOcorrencia() {
    if (!token) return;
    if (!ocorDescricao.trim()) {
      setErro('Descreva o que aconteceu.');
      return;
    }
    setErro(null);
    setEtapa('enviando');
    try {
      await chamar('ocorrencia', token, {
        descricao: ocorDescricao.trim(),
        imagem_base64: ocorFoto?.base64 ?? '',
        media_type: ocorFoto?.mediaType ?? '',
      });
      setMensagemSucesso('Ocorrência registrada!');
      setEtapa('sucesso');
      await carregar();
      setTimeout(() => setEtapa('inicio'), 2200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar');
      setEtapa('ocorrencia');
    }
  }

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  if (erroCarga || !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-night-950 px-6 text-center">
        <Logo size={72} />
        <p className="mt-6 text-sm text-zinc-400">{erroCarga ?? 'Link inválido.'}</p>
        <p className="mt-2 text-xs text-zinc-600">Confira o link com quem te enviou.</p>
      </div>
    );
  }

  const nome = info.viagem.funcionario?.apelido || info.viagem.funcionario?.nome || 'Colaborador';

  return (
    <div className="min-h-screen bg-night-950 pb-10">
      {/* topo */}
      <div className="relative overflow-hidden border-b border-night-800 bg-night-900 px-5 pb-6 pt-6">
        <div className="pointer-events-none absolute -top-20 right-0 h-48 w-48 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo size={44} showName={false} />
          <div>
            <div className="text-sm font-semibold text-white">Olá, {nome}!</div>
            <div className="text-xs text-zinc-500">
              {info.viagem.evento ? `Evento: ${info.viagem.evento.nome}` : 'Prestação de contas de viagem'}
            </div>
          </div>
        </div>
        <div className="relative mt-5 flex items-end justify-between">
          <div>
            <div className="text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">Dinheiro em mãos</div>
            <div className={`font-display text-3xl font-bold ${resumo.saldo >= 0 ? 'text-gold-400' : 'text-red-400'}`}>
              {formatarMoeda(resumo.saldo)}
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <div>Recebido: {formatarMoeda(resumo.alocado)}</div>
            <div>Gasto: {formatarMoeda(resumo.gasto)}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5">
        {/* input de foto (câmera) compartilhado */}
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            aoEscolherFoto(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
        <input
          ref={inputFotoOcorrenciaRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            aoEscolherFotoOcorrencia(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />

        {!aberta && (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Esta prestação de contas foi fechada. Obrigado!
          </div>
        )}

        {aberta && etapa === 'inicio' && (
          <div className="mt-6 space-y-3">
            <button
              onClick={() => iniciarFluxo('despesa')}
              className="flex w-full items-center gap-4 rounded-2xl border border-gold-600/40 bg-gradient-to-b from-gold-500/15 to-gold-600/5 p-5 text-left transition active:scale-[0.98]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gold-500/20 text-gold-300">
                <Camera className="h-7 w-7" />
              </div>
              <div>
                <div className="text-base font-semibold text-white">Lançar um gasto</div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  {info.ia_disponivel ? (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-gold-400" /> Tire a foto do comprovante — a IA lê pra você
                    </span>
                  ) : (
                    'Tire a foto do comprovante e informe o valor'
                  )}
                </div>
              </div>
            </button>
            <button onClick={lancarSemFoto} className="w-full text-center text-xs text-zinc-500 underline underline-offset-2">
              Sem comprovante ou a IA não está funcionando? Lançar digitando manualmente
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => iniciarFluxo('aporte')}
                className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-left transition active:scale-[0.98]"
              >
                <ArrowUpCircle className="h-6 w-6 text-sky-300" />
                <div className="mt-2 text-sm font-semibold text-white">Recebi mais dinheiro</div>
                <div className="mt-0.5 text-[0.7rem] text-zinc-500">Com foto do comprovante</div>
              </button>
              <button
                onClick={() => iniciarFluxo('devolucao')}
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left transition active:scale-[0.98]"
              >
                <Undo2 className="h-6 w-6 text-emerald-300" />
                <div className="mt-2 text-sm font-semibold text-white">Devolvi dinheiro</div>
                <div className="mt-0.5 text-[0.7rem] text-zinc-500">Com foto do comprovante</div>
              </button>
            </div>

            <button
              onClick={iniciarOcorrencia}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left transition active:scale-[0.98]"
            >
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-300" />
              <div>
                <div className="text-sm font-semibold text-white">Registrar ocorrência</div>
                <div className="mt-0.5 text-[0.7rem] text-zinc-500">Problema com o carro ou algo fora do combinado — com foto</div>
              </div>
            </button>
          </div>
        )}

        {etapa === 'analisando' && (
          <div className="mt-6 rounded-2xl border border-night-700 bg-night-850 p-6 text-center">
            {foto && <img src={foto.previewUrl} alt="Comprovante" className="mx-auto max-h-52 rounded-xl" />}
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-gold-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo o comprovante…
            </div>
          </div>
        )}

        {etapa === 'conferir' && (
          <div className="mt-6 space-y-4">
            {editandoId && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs text-sky-300">
                Editando lançamento existente
              </div>
            )}

            {foto && (
              <img src={foto.previewUrl} alt="Comprovante" className="mx-auto max-h-44 rounded-xl border border-night-700" />
            )}

            {mensagemIA && (
              <div className="flex gap-2.5 rounded-2xl rounded-tl-sm border border-gold-600/30 bg-gold-500/10 px-4 py-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <p className="text-sm leading-relaxed text-zinc-200">{mensagemIA}</p>
              </div>
            )}
            {perguntas.map((p) => (
              <div key={p} className="rounded-2xl rounded-tl-sm border border-night-700 bg-night-850 px-4 py-2.5 text-sm text-zinc-300">
                {p}
              </div>
            ))}

            <div className="card space-y-4 p-5">
              <div>
                <label className="label">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="input text-lg font-semibold"
                  placeholder="0,00"
                  value={fValor}
                  onChange={(e) => setFValor(e.target.value)}
                  autoFocus={!fValor}
                />
              </div>

              {tipo === 'despesa' && (
                <div>
                  <label className="label">Tipo de gasto</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_DESPESA.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFCategoria(c)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          fCategoria === c
                            ? 'border-gold-500/60 bg-gold-500/15 text-gold-300'
                            : 'border-night-700 text-zinc-400'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Data</label>
                  <input type="date" className="input" value={fData} onChange={(e) => setFData(e.target.value)} />
                </div>
                <div>
                  <label className="label">Descrição</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Opcional"
                    value={fDescricao}
                    onChange={(e) => setFDescricao(e.target.value)}
                  />
                </div>
              </div>

              {!foto && (
                <button type="button" onClick={() => inputFotoRef.current?.click()} className="btn-ghost w-full">
                  <Camera className="h-4 w-4" /> {editandoId ? 'Trocar foto do comprovante' : 'Adicionar foto do comprovante'}
                </button>
              )}

              {erro && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erro}</div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setEtapa('inicio')} className="btn-ghost flex-1">
                  Cancelar
                </button>
                <button type="button" onClick={confirmar} className="btn-gold flex-1">
                  <CheckCircle2 className="h-4 w-4" /> Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {etapa === 'ocorrencia' && (
          <div className="mt-6 space-y-4">
            <div className="card space-y-4 p-5">
              <div>
                <label className="label">O que aconteceu?</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Ex.: pneu furou na BR-163, troquei no borracheiro..."
                  value={ocorDescricao}
                  onChange={(e) => setOcorDescricao(e.target.value)}
                  autoFocus
                />
              </div>

              {ocorFoto ? (
                <img src={ocorFoto.previewUrl} alt="Ocorrência" className="mx-auto max-h-44 rounded-xl border border-night-700" />
              ) : (
                <button
                  type="button"
                  onClick={() => inputFotoOcorrenciaRef.current?.click()}
                  className="btn-ghost w-full"
                >
                  <Camera className="h-4 w-4" /> Adicionar foto (opcional)
                </button>
              )}

              {erro && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erro}</div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setEtapa('inicio')} className="btn-ghost flex-1">
                  Cancelar
                </button>
                <button type="button" onClick={enviarOcorrencia} className="btn-gold flex-1">
                  <CheckCircle2 className="h-4 w-4" /> Enviar
                </button>
              </div>
            </div>
          </div>
        )}

        {etapa === 'enviando' && (
          <div className="mt-10 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold-400" />
            <p className="mt-3 text-sm text-zinc-400">Salvando…</p>
          </div>
        )}

        {etapa === 'sucesso' && (
          <div className="mt-10 text-center animate-fadeUp">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <p className="mt-3 text-base font-semibold text-white">{mensagemSucesso}</p>
          </div>
        )}

        {/* histórico */}
        {info.lancamentos.length > 0 && etapa === 'inicio' && (
          <div className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Seus lançamentos</h2>
            <div className="card divide-y divide-night-800 overflow-hidden">
              {info.lancamentos.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  {l.tipo === 'despesa' ? (
                    <ArrowDownCircle className="h-5 w-5 shrink-0 text-red-300" />
                  ) : l.tipo === 'aporte' ? (
                    <ArrowUpCircle className="h-5 w-5 shrink-0 text-sky-300" />
                  ) : (
                    <Undo2 className="h-5 w-5 shrink-0 text-emerald-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-zinc-200">
                      {l.tipo === 'aporte' ? 'Dinheiro recebido' : l.tipo === 'devolucao' ? 'Devolução' : (l.categoria ?? 'Gasto')}
                      {l.descricao ? ` — ${l.descricao}` : ''}
                    </div>
                    <div className="text-[0.7rem] text-zinc-500">{formatarData(l.data_lancamento)}</div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      l.tipo === 'aporte' ? 'text-sky-300' : l.tipo === 'devolucao' ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {l.tipo === 'aporte' ? '+' : '−'} {formatarMoeda(l.valor)}
                  </div>
                  {aberta && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => iniciarEdicao(l)}
                        className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-night-800 hover:text-gold-300"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => excluirLancamento(l.id)}
                        className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-red-950/40 hover:text-red-300"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ocorrências */}
        {info.ocorrencias.length > 0 && etapa === 'inicio' && (
          <div className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Ocorrências registradas</h2>
            <div className="space-y-2">
              {info.ocorrencias.map((o) => (
                <div key={o.id} className="card flex items-start gap-3 p-3">
                  {o.foto_url && (
                    <img src={o.foto_url} alt="Ocorrência" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200">{o.descricao}</p>
                    <div className="mt-0.5 text-[0.7rem] text-zinc-500">{formatarData(o.criado_em)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="mt-10 text-center text-[0.7rem] text-zinc-700">
          RR Bares · Prestação de contas · Qualquer dúvida, fale com a central
        </footer>
      </div>
    </div>
  );
}
