import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Loader,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import dayjs from 'dayjs';
import { supabase } from '../../lib/supabase';

interface ApresentacaoLida {
  nome: string;
  nome_lido: string;
  data_evento: string;
  horario_inicio: string | null;
  horario_fim: string | null;
  valor: number | null;
  valor_historico: number | null;
  contato: string | null;
  fornecedor_id: string | null;
  observacoes: string | null;
  confianca: number;
  ja_cadastrado: boolean;
  apresentacoes_anteriores: number;
  ja_lancado: boolean;
  musico_id_existente: string | null;
}

interface Linha extends ApresentacaoLida {
  chave: string;
  selecionada: boolean;
  valorFinal: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportado: (quantidade: number) => void;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const ImportarAgendaMusicosIA: React.FC<Props> = ({ isOpen, onClose, onImportado }) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [referencia, setReferencia] = useState('');
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [observacoesGerais, setObservacoesGerais] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const selecionadas = useMemo(
    () => (linhas || []).filter((l) => l.selecionada),
    [linhas],
  );

  const totalSelecionado = useMemo(
    () => selecionadas.reduce((soma, l) => soma + (l.valorFinal || 0), 0),
    [selecionadas],
  );

  const fechar = () => {
    if (lendo || salvando) return;
    setArquivo(null);
    setReferencia('');
    setLinhas(null);
    setErro(null);
    setFalhas([]);
    setObservacoesGerais(null);
    onClose();
  };

  const escolherArquivo = (f: File | null) => {
    setErro(null);
    setLinhas(null);
    if (!f) {
      setArquivo(null);
      return;
    }

    const aceitos = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!aceitos.includes(f.type)) {
      setErro('Use uma foto (JPG, PNG) ou um PDF da agenda.');
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setErro('Arquivo muito grande. O limite é 20MB.');
      return;
    }
    setArquivo(f);
  };

  const lerAgenda = async () => {
    if (!arquivo) return;

    setLendo(true);
    setErro(null);
    setFalhas([]);

    try {
      const form = new FormData();
      form.append('file', arquivo);
      if (referencia) form.append('referencia', referencia);

      const url = import.meta.env.VITE_SUPABASE_URL;
      const resposta = await fetch(`${url}/functions/v1/extrair-agenda-musicos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: form,
      });

      const dados = await resposta.json();

      if (!resposta.ok || !dados.success) {
        throw new Error(dados.error || 'Não consegui ler a agenda.');
      }

      const lidas: ApresentacaoLida[] = dados.apresentacoes || [];

      if (lidas.length === 0) {
        throw new Error(
          'Nenhuma apresentação encontrada no arquivo. Confira se a imagem está legível.',
        );
      }

      setObservacoesGerais(dados.observacoes_gerais || null);
      setLinhas(
        lidas.map((a, i) => ({
          ...a,
          chave: `${a.data_evento}-${a.nome}-${i}`,
          selecionada: !a.ja_lancado,
          valorFinal: a.valor ?? a.valor_historico ?? 0,
        })),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao ler a agenda.');
    } finally {
      setLendo(false);
    }
  };

  const atualizar = (chave: string, mudanca: Partial<Linha>) => {
    setLinhas((atual) =>
      (atual || []).map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)),
    );
  };

  const remover = (chave: string) => {
    setLinhas((atual) => (atual || []).filter((l) => l.chave !== chave));
  };

  const marcarTodas = (valor: boolean) => {
    setLinhas((atual) =>
      (atual || []).map((l) => ({ ...l, selecionada: valor && !l.ja_lancado })),
    );
  };

  /** Reaproveita o fornecedor do artista; cria um se ainda não existir. */
  const garantirFornecedor = async (linha: Linha): Promise<string | null> => {
    if (linha.fornecedor_id) return linha.fornecedor_id;

    const { data: existente } = await supabase
      .from('fornecedores')
      .select('id')
      .eq('nome', linha.nome)
      .eq('tipo', 'musico')
      .maybeSingle();

    if (existente) return existente.id;

    const { data: novo, error } = await supabase
      .from('fornecedores')
      .insert([
        {
          nome: linha.nome,
          telefone: linha.contato || null,
          status: 'ativo',
          tipo: 'musico',
          observacoes: 'Cadastrado automaticamente ao importar a agenda de shows',
        },
      ])
      .select('id')
      .single();

    if (error) throw error;
    return novo.id;
  };

  const lancar = async () => {
    if (selecionadas.length === 0) return;

    setSalvando(true);
    setErro(null);
    const problemas: string[] = [];
    let gravadas = 0;

    for (const linha of selecionadas) {
      try {
        const fornecedorId = await garantirFornecedor(linha);

        const { error } = await supabase.from('musicos').insert([
          {
            nome: linha.nome,
            contato: linha.contato || null,
            valor: linha.valorFinal || 0,
            data_evento: linha.data_evento,
            horario_inicio: linha.horario_inicio,
            horario_fim: linha.horario_fim,
            observacoes: linha.observacoes || null,
            valor_consumo: 0,
            valor_adicional: 0,
            fornecedor_id: fornecedorId,
            valor_total_final: linha.valorFinal || 0,
            valor_pago: 0,
            saldo_restante: linha.valorFinal || 0,
            status_pagamento: 'pendente',
          },
        ]);

        if (error) throw error;
        gravadas += 1;
      } catch (e) {
        problemas.push(
          `${dayjs(linha.data_evento).format('DD/MM')} · ${linha.nome}: ${
            e instanceof Error ? e.message : 'erro ao gravar'
          }`,
        );
      }
    }

    setSalvando(false);

    if (problemas.length > 0) {
      setFalhas(problemas);
      setLinhas((atual) =>
        (atual || []).filter((l) => problemas.some((p) => p.includes(l.nome)) || !l.selecionada),
      );
      if (gravadas > 0) onImportado(gravadas);
      return;
    }

    onImportado(gravadas);
    fechar();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-white/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-wine/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-wine" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Importar agenda de shows</h2>
              <p className="text-xs text-white/50">
                A IA lê a foto ou o PDF, reconhece os artistas e sugere os lançamentos
              </p>
            </div>
          </div>
          <button
            onClick={fechar}
            disabled={lendo || salvando}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {erro && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{erro}</p>
            </div>
          )}

          {falhas.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-200 mb-2">
                {falhas.length} apresentação(ões) não foram gravadas:
              </p>
              <ul className="text-xs text-amber-100/80 space-y-1">
                {falhas.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}

          {!linhas && (
            <div className="space-y-4">
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  escolherArquivo(e.dataTransfer.files?.[0] || null);
                }}
                className="border-2 border-dashed border-white/20 rounded-lg p-10 text-center cursor-pointer hover:border-wine/60 transition-colors"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => escolherArquivo(e.target.files?.[0] || null)}
                />
                {arquivo ? (
                  <div className="flex items-center justify-center gap-3 text-white">
                    <FileText className="w-6 h-6 text-wine" />
                    <div className="text-left">
                      <p className="text-sm font-medium">{arquivo.name}</p>
                      <p className="text-xs text-white/50">
                        {(arquivo.size / 1024).toFixed(0)} KB · clique para trocar
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-white/30 mx-auto mb-3" />
                    <p className="text-sm text-white/80">
                      Arraste a agenda aqui ou clique para escolher
                    </p>
                    <p className="text-xs text-white/40 mt-1">
                      Foto do cartaz, print do grupo ou PDF. Até 20MB.
                    </p>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">
                    Mês da agenda (opcional)
                  </label>
                  <input
                    type="month"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    className="px-3 py-2 bg-[#12141f] border border-white/20 rounded-lg text-white text-sm"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Só é usado quando o documento não diz o mês
                  </p>
                </div>

                <button
                  onClick={lerAgenda}
                  disabled={!arquivo || lendo}
                  className="px-6 py-2.5 bg-wine text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {lendo ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Lendo a agenda...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Ler agenda
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {linhas && (
            <div className="space-y-4">
              {observacoesGerais && (
                <p className="text-xs text-white/50 bg-white/5 border border-white/10 rounded-lg p-3">
                  {observacoesGerais}
                </p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-white/70">
                  {linhas.length} apresentação(ões) lidas.{' '}
                  {linhas.filter((l) => l.ja_lancado).length > 0 && (
                    <span className="text-amber-300">
                      {linhas.filter((l) => l.ja_lancado).length} já estavam lançadas e vieram
                      desmarcadas.
                    </span>
                  )}
                </p>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => marcarTodas(true)}
                    className="px-3 py-1.5 rounded border border-white/20 text-white/70 hover:bg-white/10"
                  >
                    Marcar todas
                  </button>
                  <button
                    onClick={() => marcarTodas(false)}
                    className="px-3 py-1.5 rounded border border-white/20 text-white/70 hover:bg-white/10"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              <div className="border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-white/60 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 w-10"></th>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Artista</th>
                      <th className="px-3 py-2 text-left w-24">Início</th>
                      <th className="px-3 py-2 text-left w-24">Fim</th>
                      <th className="px-3 py-2 text-right w-32">Cachê</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr
                        key={l.chave}
                        className={`border-t border-white/5 ${
                          l.selecionada ? '' : 'opacity-50'
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={l.selecionada}
                            onChange={(e) =>
                              atualizar(l.chave, { selecionada: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-white/20"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={l.data_evento}
                            onChange={(e) =>
                              atualizar(l.chave, { data_evento: e.target.value })
                            }
                            className="bg-transparent border border-white/10 rounded px-2 py-1 text-white text-xs"
                          />
                          <div className="text-[11px] text-white/40 mt-0.5">
                            {DIAS[dayjs(l.data_evento).day()]}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={l.nome}
                            onChange={(e) => atualizar(l.chave, { nome: e.target.value })}
                            className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-white"
                          />
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {l.ja_cadastrado ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                já toca aqui · {l.apresentacoes_anteriores}x
                              </span>
                            ) : (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                                artista novo
                              </span>
                            )}
                            {l.ja_lancado && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                já lançado nesta data
                              </span>
                            )}
                            {l.confianca < 0.6 && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">
                                leitura incerta
                              </span>
                            )}
                            {l.nome_lido !== l.nome && (
                              <span className="text-[11px] text-white/40">
                                no documento: {l.nome_lido}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="time"
                            value={l.horario_inicio || ''}
                            onChange={(e) =>
                              atualizar(l.chave, { horario_inicio: e.target.value || null })
                            }
                            className="bg-transparent border border-white/10 rounded px-2 py-1 text-white text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="time"
                            value={l.horario_fim || ''}
                            onChange={(e) =>
                              atualizar(l.chave, { horario_fim: e.target.value || null })
                            }
                            className="bg-transparent border border-white/10 rounded px-2 py-1 text-white text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.valorFinal || ''}
                            onChange={(e) =>
                              atualizar(l.chave, { valorFinal: Number(e.target.value) || 0 })
                            }
                            className={`w-28 bg-transparent border rounded px-2 py-1 text-right text-white ${
                              l.valorFinal > 0 ? 'border-white/10' : 'border-amber-500/40'
                            }`}
                          />
                          {l.valor == null && l.valor_historico != null && (
                            <div className="text-[11px] text-white/40 mt-0.5">
                              último cachê pago
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => remover(l.chave)}
                            className="text-white/30 hover:text-red-400"
                            title="Descartar esta linha"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {linhas && (
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <div className="text-sm text-white/70">
              <span className="font-medium text-white">{selecionadas.length}</span> selecionada(s)
              <span className="mx-2 text-white/20">·</span>
              total{' '}
              <span className="font-medium text-white">
                {totalSelecionado.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
              {selecionadas.some((l) => l.valorFinal <= 0) && (
                <span className="ml-3 text-amber-300 text-xs">
                  há apresentação sem cachê preenchido
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setLinhas(null)}
                disabled={salvando}
                className="px-4 py-2 border border-white/20 text-white/70 rounded-lg hover:bg-white/10 disabled:opacity-40"
              >
                Trocar arquivo
              </button>
              <button
                onClick={lancar}
                disabled={selecionadas.length === 0 || salvando}
                className="px-6 py-2 bg-wine text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {salvando ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Lançando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Lançar {selecionadas.length} apresentação(ões)
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportarAgendaMusicosIA;
