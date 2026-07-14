import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowLeftRight, Search, AlertTriangle,
  Check, X, ChevronRight, User, Loader2,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface Estoque { id: string; nome: string; }
interface Item { id: string; nome: string; unidade_medida: string; codigo?: string; }
interface Funcionario { id: string; nome_completo: string; cargo?: string; }

interface LinhaTransferencia {
  item: Item;
  quantidade: string;
  saldoOrigem: number | null;
}

interface Props { onVoltar: () => void; }

export default function TransferirEstoque({ onVoltar }: Props) {
  const { usuario } = useAuth();
  const [passo, setPasso] = useState(1);

  // Passo 1 — Solicitante
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [buscaFunc, setBuscaFunc] = useState('');
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<Funcionario | null>(null);
  const [setor, setSetor] = useState('');

  // Passo 2 — Estoques
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [origem, setOrigem] = useState<Estoque | null>(null);
  const [destino, setDestino] = useState<Estoque | null>(null);

  // Passo 3 — Itens
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Item[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaTransferencia[]>([]);

  // Passo 4 — Confirmar
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [requisicaoCriada, setRequisicaoCriada] = useState<{ id: string; numero: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [estRes, funcRes] = await Promise.all([
        supabase.from('estoques').select('id, nome').eq('status', true).order('nome'),
        supabase.from('funcionarios').select('id, nome_completo, cargo').eq('ativo', true).order('nome_completo').limit(200),
      ]);
      setEstoques(estRes.data || []);
      setFuncionarios(funcRes.data || []);
    };
    load();
  }, []);

  const funcsFiltrados = funcionarios.filter(f =>
    f.nome_completo.toLowerCase().includes(buscaFunc.toLowerCase())
  );

  const buscarItems = useCallback(async (termo: string) => {
    if (termo.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const { data } = await supabase
      .from('itens_estoque')
      .select('id, nome, unidade_medida, codigo')
      .ilike('nome', `%${termo}%`)
      .eq('ativo', true)
      .order('nome')
      .limit(20);
    setResultados(data || []);
    setBuscando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarItems(busca), 350);
    return () => clearTimeout(t);
  }, [busca, buscarItems]);

  const buscarSaldo = async (itemId: string, estoqueId: string): Promise<number> => {
    const { data } = await supabase
      .from('saldos_estoque')
      .select('quantidade_atual')
      .eq('item_id', itemId)
      .eq('estoque_id', estoqueId)
      .maybeSingle();
    return data?.quantidade_atual ?? 0;
  };

  const adicionarItem = async (item: Item) => {
    if (linhas.some(l => l.item.id === item.id)) return;
    const saldo = origem ? await buscarSaldo(item.id, origem.id) : null;
    setLinhas(prev => [...prev, { item, quantidade: '', saldoOrigem: saldo }]);
    setBusca('');
    setResultados([]);
  };

  const removerLinha = (itemId: string) => setLinhas(prev => prev.filter(l => l.item.id !== itemId));
  const atualizarQtd = (itemId: string, valor: string) =>
    setLinhas(prev => prev.map(l => l.item.id === itemId ? { ...l, quantidade: valor } : l));

  const linhasValidas = linhas.filter(l => l.quantidade && Number(l.quantidade) > 0);

  const criarRequisicaoEEntregar = async (entregar: boolean) => {
    if (!origem || !destino || !funcionarioSelecionado || !setor || linhasValidas.length === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      const { data: req, error: reqErr } = await supabase
        .from('requisicoes_internas')
        .insert({
          numero_requisicao: '',
          funcionario_nome: funcionarioSelecionado.nome_completo,
          setor,
          estoque_origem_id: origem.id,
          estoque_destino_id: destino.id,
          status: entregar ? 'concluido' : 'pendente',
          concluido_por: entregar
            ? (usuario?.id || null)
            : null,
          data_conclusao: entregar ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (reqErr) throw reqErr;

      const { error: itensErr } = await supabase
        .from('requisicoes_internas_itens')
        .insert(linhasValidas.map(l => ({
          requisicao_id: req.id,
          item_id: l.item.id,
          quantidade_solicitada: Number(l.quantidade),
          quantidade_entregue: entregar ? Number(l.quantidade) : null,
        })));

      if (itensErr) throw itensErr;

      if (entregar) {
        const hoje = new Date().toISOString().split('T')[0];
        const obs = `Req #${req.numero_requisicao || req.id.slice(0, 8)} — solicitado por ${funcionarioSelecionado.nome_completo} (${setor})`;
        const movs = linhasValidas.map(l => ({
          item_id: l.item.id,
          tipo_movimentacao: 'transferencia',
          quantidade: Number(l.quantidade),
          estoque_origem_id: origem.id,
          estoque_destino_id: destino.id,
          custo_unitario: 0,
          custo_total: 0,
          data_movimentacao: hoje,
          motivo: 'Requisição interna',
          origem_tipo: 'requisicao',
          origem_id: req.id,
          observacoes: obs,
          criado_por: usuario?.id || null,
          idempotency_key: `req_${req.id}_item_${l.item.id}`,
        }));
        const { error: movErr } = await supabase.from('movimentacoes_estoque').insert(movs);
        if (movErr) throw movErr;
      }

      setRequisicaoCriada({ id: req.id, numero: req.numero_requisicao || req.id.slice(0, 8) });
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  // ── Tela de sucesso ─────────────────────────────────────────────────────────
  if (requisicaoCriada) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 max-w-md mx-auto text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check className="w-10 h-10 text-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Requisição criada!</h2>
          <p className="text-white/40 text-sm">
            Req #{requisicaoCriada.numero} · {origem?.nome} → {destino?.nome}
          </p>
          <p className="text-white/30 text-xs mt-1">
            Solicitante: {funcionarioSelecionado?.nome_completo} ({setor})
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setFuncionarioSelecionado(null); setBuscaFunc(''); setSetor('');
              setOrigem(null); setDestino(null); setLinhas([]);
              setPasso(1); setRequisicaoCriada(null);
            }}
            className="px-5 py-2.5 bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] rounded-xl text-sm font-semibold hover:bg-[#D4AF37]/30"
          >
            Nova requisição
          </button>
          <button
            onClick={onVoltar}
            className="px-5 py-2.5 bg-white/5 border border-white/10 text-white/60 rounded-xl text-sm font-semibold hover:bg-white/10"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ── Indicador de passos ─────────────────────────────────────────────────────
  const PASSOS = ['Solicitante', 'Estoques', 'Itens', 'Confirmar'];
  const PassoIndicador = () => (
    <div className="flex items-center gap-2 mb-6">
      {PASSOS.map((label, i) => {
        const n = i + 1;
        return (
          <React.Fragment key={n}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                ${passo === n ? 'bg-[#D4AF37] text-black' : passo > n ? 'bg-green-500/30 text-green-400 border border-green-500/40' : 'bg-white/5 text-white/30 border border-white/10'}`}>
                {passo > n ? <Check className="w-4 h-4" /> : n}
              </div>
              <span className={`text-[9px] font-semibold uppercase tracking-wide hidden sm:block ${passo === n ? 'text-white/60' : 'text-white/20'}`}>{label}</span>
            </div>
            {n < 4 && <div className={`flex-1 h-px mb-4 ${passo > n ? 'bg-green-500/40' : 'bg-white/10'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={passo > 1 ? () => setPasso(p => p - 1) : onVoltar}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Requisição de transferência</h2>
        </div>
      </div>

      <PassoIndicador />

      {/* ── PASSO 1 — Solicitante ──────────────────────────────────────────── */}
      {passo === 1 && (
        <div className="space-y-4">
          <div className="bg-[#12141f] border border-white/[0.07] rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">
                Solicitante
              </label>
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                  <Search className="w-4 h-4 text-white/30 shrink-0" />
                  <input
                    type="text"
                    value={buscaFunc}
                    onChange={e => { setBuscaFunc(e.target.value); setFuncionarioSelecionado(null); }}
                    placeholder="Buscar funcionário..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none"
                  />
                  {funcionarioSelecionado && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                </div>
                {buscaFunc.length >= 2 && !funcionarioSelecionado && funcsFiltrados.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-[#1a1c2e] border border-white/10 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-xl">
                    {funcsFiltrados.slice(0, 10).map(f => (
                      <button
                        key={f.id}
                        onMouseDown={() => { setFuncionarioSelecionado(f); setBuscaFunc(f.nome_completo); }}
                        className="flex flex-col items-start w-full px-4 py-3 text-left hover:bg-white/5 transition-colors"
                      >
                        <span className="text-sm text-white/80 font-medium">{f.nome_completo}</span>
                        {f.cargo && <span className="text-xs text-white/30">{f.cargo}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {funcionarioSelecionado && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <User className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-green-300 text-sm font-medium">{funcionarioSelecionado.nome_completo}</span>
                  <button onClick={() => { setFuncionarioSelecionado(null); setBuscaFunc(''); }} className="ml-auto text-white/20 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">
                Setor
              </label>
              <input
                type="text"
                value={setor}
                onChange={e => setSetor(e.target.value)}
                placeholder="Ex: Cozinha, Bar, Salão..."
                className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-[#D4AF37]/40"
              />
            </div>
          </div>

          <button
            disabled={!funcionarioSelecionado || !setor.trim()}
            onClick={() => setPasso(2)}
            className="flex items-center justify-center gap-2 w-full px-5 py-4 bg-[#D4AF37] text-black rounded-xl font-bold text-sm hover:bg-[#c9a32e] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Próximo: estoques
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── PASSO 2 — Estoques ────────────────────────────────────────────── */}
      {passo === 2 && (
        <div className="space-y-4">
          <div className="bg-[#12141f] border border-white/[0.07] rounded-2xl p-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">
                Estoque de origem
              </label>
              <div className="grid grid-cols-1 gap-2">
                {estoques.map(e => (
                  <button
                    key={e.id}
                    onClick={() => { setOrigem(e); if (destino?.id === e.id) setDestino(null); }}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all
                      ${origem?.id === e.id
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-white/[0.03] border-white/[0.07] text-white/60 hover:text-white hover:border-white/20'}`}
                  >
                    {e.nome}
                    {origem?.id === e.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wide mb-2">
                Estoque de destino
              </label>
              <div className="grid grid-cols-1 gap-2">
                {estoques.filter(e => e.id !== origem?.id).map(e => (
                  <button
                    key={e.id}
                    onClick={() => setDestino(e)}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-medium transition-all
                      ${destino?.id === e.id
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-white/[0.03] border-white/[0.07] text-white/60 hover:text-white hover:border-white/20'}`}
                  >
                    {e.nome}
                    {destino?.id === e.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            disabled={!origem || !destino}
            onClick={() => setPasso(3)}
            className="flex items-center justify-center gap-2 w-full px-5 py-4 bg-[#D4AF37] text-black rounded-xl font-bold text-sm hover:bg-[#c9a32e] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Próximo: escolher itens
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── PASSO 3 — Itens ───────────────────────────────────────────────── */}
      {passo === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <span className="text-blue-300 text-sm font-semibold">{origem?.nome}</span>
            <ArrowRight className="w-4 h-4 text-blue-400/50" />
            <span className="text-blue-300 text-sm font-semibold">{destino?.nome}</span>
          </div>

          <div className="relative bg-[#12141f] border border-white/[0.07] rounded-xl">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <Search className="w-4 h-4 text-white/30 shrink-0" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar item por nome..."
                className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none"
              />
              {buscando && <div className="w-4 h-4 rounded-full border border-white/20 border-t-white/60 animate-spin shrink-0" />}
            </div>
            {resultados.length > 0 && (
              <div className="border-t border-white/[0.07] max-h-56 overflow-y-auto">
                {resultados.map(item => (
                  <button
                    key={item.id}
                    onClick={() => adicionarItem(item)}
                    className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-white/5 transition-colors text-left"
                  >
                    <div>
                      <p className="text-white/80 font-medium">{item.nome}</p>
                      {item.codigo && <p className="text-white/30 text-xs">{item.codigo}</p>}
                    </div>
                    <span className="text-white/30 text-xs shrink-0 ml-2">{item.unidade_medida}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {linhas.length > 0 && (
            <div className="bg-[#12141f] border border-white/[0.07] rounded-2xl overflow-hidden">
              <div className="divide-y divide-white/[0.05]">
                {linhas.map(l => {
                  const qtd = Number(l.quantidade);
                  const excede = l.saldoOrigem !== null && qtd > l.saldoOrigem;
                  return (
                    <div key={l.item.id} className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80 font-medium truncate">{l.item.nome}</p>
                          <p className="text-xs text-white/30 mt-0.5">
                            Saldo: {l.saldoOrigem !== null ? Number(l.saldoOrigem).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'} {l.item.unidade_medida}
                          </p>
                        </div>
                        <button onClick={() => removerLinha(l.item.id)} className="p-1 text-white/20 hover:text-red-400 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.quantidade}
                          onChange={e => atualizarQtd(l.item.id, e.target.value)}
                          placeholder="Qtd"
                          className={`w-32 bg-white/5 border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]/60 ${excede ? 'border-amber-500/50' : 'border-white/10'}`}
                        />
                        <span className="text-white/30 text-sm">{l.item.unidade_medida}</span>
                        {excede && (
                          <div className="flex items-center gap-1 text-amber-400 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            saldo insuficiente
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            disabled={linhasValidas.length === 0}
            onClick={() => setPasso(4)}
            className="flex items-center justify-center gap-2 w-full px-5 py-4 bg-[#D4AF37] text-black rounded-xl font-bold text-sm hover:bg-[#c9a32e] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Próximo: confirmar
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── PASSO 4 — Confirmar ───────────────────────────────────────────── */}
      {passo === 4 && (
        <div className="space-y-4">
          {/* Resumo solicitante */}
          <div className="bg-[#12141f] border border-white/[0.07] rounded-2xl p-5 space-y-3">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wide">Solicitante</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{funcionarioSelecionado?.nome_completo}</p>
                <p className="text-white/40 text-xs">{setor}</p>
              </div>
            </div>
          </div>

          {/* Resumo rota + itens */}
          <div className="bg-[#12141f] border border-white/[0.07] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-blue-500/10 border-b border-blue-500/20">
              <span className="text-blue-300 font-semibold text-sm">{origem?.nome}</span>
              <ArrowRight className="w-4 h-4 text-blue-400" />
              <span className="text-blue-300 font-semibold text-sm">{destino?.nome}</span>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {linhasValidas.map(l => (
                <div key={l.item.id} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm text-white/70">{l.item.nome}</p>
                  <span className="text-sm font-semibold text-white">
                    {Number(l.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {l.item.unidade_medida}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {erro && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">{erro}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => criarRequisicaoEEntregar(false)}
              disabled={salvando}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-xl font-bold text-sm hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Deixar pendente
            </button>

            <button
              onClick={() => criarRequisicaoEEntregar(true)}
              disabled={salvando}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {salvando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Entregar agora
            </button>
          </div>
        </div>
      )}
    </div>
  );
}