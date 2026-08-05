import { useState, useEffect } from 'react';
import {
  Upload, RefreshCw, CheckCircle2, AlertTriangle,
  ArrowLeft, Ban, Sparkles, FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

// ─── Tipos ────────────────────────────────────────────────────────────────
interface Banco { id: string; banco: string; tipo_conta: string; }
interface Forma { id: string; nome: string; }
interface Categoria { id: string; nome: string; }
interface Fornecedor { id: string; nome: string; categoria_padrao_id: string | null; }

interface SugFornecedor { id: string; nome: string; categoria_padrao_id: string | null; categoria_padrao_nome: string | null; score: number; }
interface SugConta { id: string; descricao: string; fornecedor_id: string; fornecedor_nome: string; valor_total: number; saldo_restante: number; data_vencimento: string; categoria_id: string | null; }
interface SugJa { fluxo_id: string; data: string; valor: number; descricao: string; }
interface Sugestao { fornecedores: SugFornecedor[]; contas_abertas: SugConta[]; ja_conciliado: SugJa[]; }

type Acao = 'nova' | 'baixa' | 'ja' | 'ignorar';

interface Linha {
  fitid: string;
  data: string;          // YYYY-MM-DD
  valor: number;         // positivo
  descricao: string;
  acao: Acao;
  contaPagarId: string;  // quando acao='baixa'
  fornecedorId: string;  // quando acao='nova'
  categoriaId: string;
  formaPagamentoId: string;
  sug: Sugestao;
  status: 'pendente' | 'conciliada' | 'ignorada';
  jaImportada: boolean;  // veio de importação anterior
  salvando: boolean;
  erro: string | null;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ─── Parser OFX (SGML 1.x e XML 2.x) ────────────────────────────────────────
function parseExtrato(raw: string): { acct: string; bankId: string; transacoes: { fitid: string; data: string; valor: number; tipo: 'debito' | 'credito'; descricao: string }[] } {
  const text = raw.replace(/\r/g, '');
  const tag = (block: string, t: string) => {
    const m = block.match(new RegExp('<' + t + '>([^<\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  };
  const acct = (text.match(/<ACCTID>([^<\n]*)/i) || [])[1]?.trim() || '';
  const bankId = (text.match(/<BANKID>([^<\n]*)/i) || [])[1]?.trim() || '';
  const blocks = text.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
  const transacoes = blocks.map(b => {
    const dtRaw = tag(b, 'DTPOSTED').slice(0, 8);
    const amt = parseFloat(tag(b, 'TRNAMT').replace(',', '.'));
    const memo = tag(b, 'MEMO') || tag(b, 'NAME');
    const fitid = tag(b, 'FITID');
    const trntype = tag(b, 'TRNTYPE').toUpperCase();
    const data = dtRaw.length === 8 ? `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}` : '';
    const tipo: 'debito' | 'credito' = (amt < 0 || trntype === 'DEBIT') ? 'debito' : 'credito';
    return { fitid, data, valor: Math.abs(amt), tipo, descricao: memo, _raw: amt };
  }).filter(t => t.data && !isNaN(t._raw));
  return { acct, bankId, transacoes: transacoes.map(({ _raw, ...t }) => t) };
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function ConciliacaoBancaria() {
  const [etapa, setEtapa] = useState<'upload' | 'revisao'>('upload');
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [formas, setFormas] = useState<Forma[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const [bancoContaId, setBancoContaId] = useState('');
  const [formaPadraoId, setFormaPadraoId] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<{ total: number; debitos: number; periodo: string } | null>(null);

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseExtrato> | null>(null);

  useEffect(() => { carregarCadastros(); }, []);

  const carregarCadastros = async () => {
    const [b, f, c, forn] = await Promise.all([
      supabase.from('bancos_contas').select('id, banco, tipo_conta').eq('status', 'ativo').order('banco'),
      supabase.from('formas_pagamento').select('id, nome').eq('status', 'ativo').order('nome'),
      supabase.from('categorias_financeiras').select('id, nome').eq('status', 'ativo').eq('tipo', 'despesa').order('nome'),
      supabase.from('fornecedores').select('id, nome, categoria_padrao_id').eq('status', 'ativo').order('nome'),
    ]);
    setBancos(b.data || []);
    setFormas(f.data || []);
    setCategorias((c.data && c.data.length ? c.data : []) as Categoria[]);
    setFornecedores(forn.data || []);
    if (f.data && f.data.length) setFormaPadraoId(f.data[0].id);
  };

  const onSelecionarArquivo = async (file: File | null) => {
    setArquivo(file); setPrevia(null); setParsed(null); setErro(null);
    if (!file) return;
    try {
      const texto = await file.text();
      const p = parseExtrato(texto);
      if (p.transacoes.length === 0) {
        setErro('Não encontrei transações no arquivo. Se for um XML próprio do banco (não OFX), me mande um exemplo pra ajustar o leitor.');
        return;
      }
      const debitos = p.transacoes.filter(t => t.tipo === 'debito');
      const datas = p.transacoes.map(t => t.data).sort();
      setParsed(p);
      setPrevia({
        total: p.transacoes.length,
        debitos: debitos.length,
        periodo: `${dayjs(datas[0]).format('DD/MM/YY')} a ${dayjs(datas[datas.length - 1]).format('DD/MM/YY')}`,
      });
    } catch {
      setErro('Não consegui ler o arquivo.');
    }
  };

  const processar = async () => {
    if (!bancoContaId) { setErro('Selecione a conta bancária do extrato.'); return; }
    if (!parsed || !arquivo) { setErro('Selecione um arquivo válido.'); return; }
    setCarregando(true); setErro(null);
    try {
      const debitos = parsed.transacoes.filter(t => t.tipo === 'debito');
      const datas = debitos.map(t => t.data).sort();

      // Registro da importação
      const { data: userData } = await supabase.auth.getUser();
      const { data: imp, error: impErr } = await supabase.from('conciliacao_importacoes').insert({
        banco_conta_id: bancoContaId,
        nome_arquivo: arquivo.name,
        formato: arquivo.name.toLowerCase().endsWith('.xml') ? 'xml' : 'ofx',
        periodo_inicio: datas[0] || null,
        periodo_fim: datas[datas.length - 1] || null,
        qtd_transacoes: debitos.length,
        criado_por: userData?.user?.id || null,
      }).select().single();
      if (impErr) throw impErr;
      setImportacaoId(imp.id);

      // Transações já lançadas antes (dedupe por fitid nesta conta)
      const fitids = debitos.map(d => d.fitid).filter(Boolean);
      const { data: jaImport } = await supabase.from('conciliacao_transacoes')
        .select('fitid, status').eq('banco_conta_id', bancoContaId).in('fitid', fitids.length ? fitids : ['__none__']);
      const mapaJa = new Map((jaImport || []).map((r: any) => [r.fitid, r.status]));

      // Sugestões (em paralelo)
      const linhasMontadas: Linha[] = await Promise.all(debitos.map(async (t) => {
        const { data: sugData } = await supabase.rpc('fn_conciliacao_sugerir', {
          p_descricao: t.descricao, p_valor: t.valor, p_data: t.data, p_banco_conta_id: bancoContaId,
        });
        const sug: Sugestao = sugData || { fornecedores: [], contas_abertas: [], ja_conciliado: [] };
        const jaImportada = mapaJa.get(t.fitid) === 'conciliada';

        let acao: Acao = 'nova';
        if (jaImportada || sug.ja_conciliado.length > 0) acao = 'ja';
        else if (sug.contas_abertas.length > 0) acao = 'baixa';

        const topForn = sug.fornecedores[0];
        return {
          fitid: t.fitid,
          data: t.data,
          valor: t.valor,
          descricao: t.descricao,
          acao,
          contaPagarId: sug.contas_abertas[0]?.id || '',
          fornecedorId: topForn?.id || '',
          categoriaId: topForn?.categoria_padrao_id || sug.contas_abertas[0]?.categoria_id || '',
          formaPagamentoId: formaPadraoId,
          sug,
          status: jaImportada ? 'conciliada' : 'pendente',
          jaImportada,
          salvando: false,
          erro: null,
        } as Linha;
      }));

      setLinhas(linhasMontadas);
      setEtapa('revisao');
    } catch (e: any) {
      setErro(e.message || 'Erro ao processar.');
    } finally {
      setCarregando(false);
    }
  };

  const atualizarLinha = (idx: number, patch: Partial<Linha>) => {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const aprovar = async (idx: number) => {
    const l = linhas[idx];
    if (l.status === 'conciliada') return;
    // validações
    if (l.acao === 'baixa' && !l.contaPagarId) { atualizarLinha(idx, { erro: 'Escolha a conta a pagar.' }); return; }
    if (l.acao === 'nova' && !l.fornecedorId) { atualizarLinha(idx, { erro: 'Escolha o fornecedor.' }); return; }
    if ((l.acao === 'baixa' || l.acao === 'nova') && (!l.formaPagamentoId || !bancoContaId)) { atualizarLinha(idx, { erro: 'Escolha a forma de pagamento.' }); return; }

    atualizarLinha(idx, { salvando: true, erro: null });
    try {
      const { data: userData } = await supabase.auth.getUser();
      const usuario = userData?.user?.id || null;
      let contaPagarId: string | null = null;

      if (l.acao === 'nova') {
        // 1. cria a conta a pagar
        const { data: nova, error: cErr } = await supabase.from('contas_pagar').insert([{
          fornecedor_id: l.fornecedorId,
          descricao: l.descricao || 'Conciliação bancária',
          categoria_id: l.categoriaId || null,
          forma_pagamento_id: l.formaPagamentoId || null,
          valor_original: l.valor, valor_total: l.valor, valor_final: l.valor,
          data_emissao: l.data, data_vencimento: l.data,
          numero_documento: l.fitid || null,
          observacoes: 'Criado via conciliação bancária',
        }]).select().single();
        if (cErr) throw cErr;
        contaPagarId = nova.id;
      } else if (l.acao === 'baixa') {
        contaPagarId = l.contaPagarId;
      }

      // 2. baixa (exceto 'ja', que já está no fluxo)
      if (l.acao === 'nova' || l.acao === 'baixa') {
        const { error: bErr } = await supabase.rpc('api_fin_dar_baixa_conta', {
          p_conta_pagar_id: contaPagarId,
          p_valor_pagamento: l.valor,
          p_data_pagamento: l.data,
          p_forma_pagamento_id: l.formaPagamentoId,
          p_conta_bancaria_id: bancoContaId,
          p_numero_comprovante: l.fitid || null,
          p_observacoes: 'Conciliação bancária',
          p_usuario: usuario,
        });
        if (bErr) throw bErr;
      }

      // 3. registra a transação como conciliada
      await supabase.from('conciliacao_transacoes').insert({
        importacao_id: importacaoId,
        banco_conta_id: bancoContaId,
        fitid: l.fitid || null,
        data: l.data,
        valor: l.valor,
        tipo: 'debito',
        descricao: l.descricao,
        status: 'conciliada',
        conta_pagar_id: contaPagarId,
      });

      atualizarLinha(idx, { status: 'conciliada', salvando: false });
    } catch (e: any) {
      atualizarLinha(idx, { salvando: false, erro: e.message || 'Erro ao lançar.' });
    }
  };

  const ignorar = async (idx: number) => {
    const l = linhas[idx];
    if (l.status !== 'pendente') return;
    atualizarLinha(idx, { salvando: true, erro: null });
    try {
      await supabase.from('conciliacao_transacoes').insert({
        importacao_id: importacaoId, banco_conta_id: bancoContaId, fitid: l.fitid || null,
        data: l.data, valor: l.valor, tipo: 'debito', descricao: l.descricao, status: 'ignorada',
      });
      atualizarLinha(idx, { status: 'ignorada', salvando: false });
    } catch (e: any) {
      atualizarLinha(idx, { salvando: false, erro: e.message });
    }
  };

  const resetar = () => {
    setEtapa('upload'); setLinhas([]); setArquivo(null); setPrevia(null); setParsed(null); setImportacaoId(null); setErro(null);
  };

  const inputCls = 'w-full text-xs border border-white/15 rounded-md px-2 py-1.5 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/40';
  const totalPend = linhas.filter(l => l.status === 'pendente').length;
  const totalConc = linhas.filter(l => l.status === 'conciliada').length;

  // ─── UPLOAD ────────────────────────────────────────────────────────────────
  if (etapa === 'upload') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-[#12141f] rounded-2xl border border-white/10 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-[#7D1F2C]" />
            <h2 className="font-semibold text-white/90">Importar extrato (OFX / XML)</h2>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5 block">Conta bancária do extrato *</label>
            <select value={bancoContaId} onChange={e => setBancoContaId(e.target.value)} className={inputCls}>
              <option value="">Selecione a conta...</option>
              {bancos.map(b => <option key={b.id} value={b.id}>{b.banco} — {b.tipo_conta}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5 block">Forma de pagamento padrão</label>
            <select value={formaPadraoId} onChange={e => setFormaPadraoId(e.target.value)} className={inputCls}>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <p className="text-[11px] text-white/30 mt-1">Aplicada por padrão em cada lançamento; dá pra mudar linha a linha.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5 block">Arquivo</label>
            <input type="file" accept=".ofx,.xml,.OFX,.XML" onChange={e => onSelecionarArquivo(e.target.files?.[0] || null)}
              className="block w-full text-xs text-white/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#7D1F2C] file:text-white file:text-xs file:cursor-pointer" />
          </div>

          {previa && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70 flex items-center gap-4">
              <FileText size={14} className="text-white/40" />
              <span>{previa.total} transações</span>
              <span className="text-[#7D1F2C] font-semibold">{previa.debitos} saídas</span>
              <span className="text-white/40">{previa.periodo}</span>
            </div>
          )}

          {erro && (
            <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-start gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {erro}
            </div>
          )}

          <button onClick={processar} disabled={carregando || !previa || !bancoContaId}
            className="w-full flex items-center justify-center gap-2 bg-[#7D1F2C] hover:bg-[#6a1a25] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
            {carregando ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {carregando ? 'Conciliando...' : 'Carregar e conciliar'}
          </button>
        </div>
      </div>
    );
  }

  // ─── REVISÃO ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={resetar} className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
          <ArrowLeft size={15} /> Novo extrato
        </button>
        <div className="text-xs text-white/50">
          <span className="text-green-400 font-semibold">{totalConc} conciliadas</span> · {totalPend} pendentes de {linhas.length}
        </div>
      </div>

      <div className="space-y-2">
        {linhas.map((l, idx) => {
          const conciliada = l.status === 'conciliada';
          const ignorada = l.status === 'ignorada';
          return (
            <div key={idx} className={`bg-[#12141f] rounded-xl border p-3 transition-colors ${conciliada ? 'border-green-500/30' : ignorada ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
              {/* Cabeçalho da transação */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{fmt(l.valor)}</span>
                    <span className="text-xs text-white/40">{dayjs(l.data).format('DD/MM/YY')}</span>
                    {l.acao === 'ja' && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/30">já no fluxo</span>}
                    {l.acao === 'baixa' && l.status === 'pendente' && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">baixa sugerida</span>}
                    {l.acao === 'nova' && l.status === 'pendente' && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">nova</span>}
                    {conciliada && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/15 text-green-400 border-green-500/30 flex items-center gap-1"><CheckCircle2 size={10} /> conciliada</span>}
                    {ignorada && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-white/5 text-white/40 border-white/10">ignorada</span>}
                  </div>
                  <p className="text-xs text-white/50 truncate max-w-[420px]">{l.descricao || '(sem descrição)'}</p>
                </div>

                {l.status === 'pendente' && (
                  <div className="flex items-center gap-1.5">
                    {/* seletor de ação */}
                    <select value={l.acao} onChange={e => atualizarLinha(idx, { acao: e.target.value as Acao, erro: null })}
                      className="text-xs border border-white/15 rounded-md px-2 py-1 bg-white/5 text-white">
                      <option value="nova">Criar nova</option>
                      <option value="baixa" disabled={l.sug.contas_abertas.length === 0}>Baixar conta aberta</option>
                      <option value="ja">Já lançada (só marcar)</option>
                    </select>
                    <button onClick={() => aprovar(idx)} disabled={l.salvando}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
                      {l.salvando ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Aprovar
                    </button>
                    <button onClick={() => ignorar(idx)} disabled={l.salvando} title="Ignorar"
                      className="p-1.5 rounded-md border border-white/10 text-white/40 hover:text-red-400 hover:border-red-400/30">
                      <Ban size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Campos por ação (só quando pendente) */}
              {l.status === 'pendente' && l.acao === 'nova' && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-white/40 mb-1">Fornecedor {l.sug.fornecedores[0] && <span className="text-white/25">(sugestão: {l.sug.fornecedores[0].nome})</span>}</label>
                    <select value={l.fornecedorId} onChange={e => {
                      const f = fornecedores.find(x => x.id === e.target.value);
                      atualizarLinha(idx, { fornecedorId: e.target.value, categoriaId: f?.categoria_padrao_id || l.categoriaId });
                    }} className={inputCls}>
                      <option value="">Selecione...</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">Categoria</label>
                    <select value={l.categoriaId} onChange={e => atualizarLinha(idx, { categoriaId: e.target.value })} className={inputCls}>
                      <option value="">—</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">Forma pgto</label>
                    <select value={l.formaPagamentoId} onChange={e => atualizarLinha(idx, { formaPagamentoId: e.target.value })} className={inputCls}>
                      {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {l.status === 'pendente' && l.acao === 'baixa' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">Conta a pagar (em aberto)</label>
                    <select value={l.contaPagarId} onChange={e => atualizarLinha(idx, { contaPagarId: e.target.value })} className={inputCls}>
                      <option value="">Selecione...</option>
                      {l.sug.contas_abertas.map(c => (
                        <option key={c.id} value={c.id}>{c.fornecedor_nome} · {c.descricao} · vc {dayjs(c.data_vencimento).format('DD/MM')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">Forma pgto</label>
                    <select value={l.formaPagamentoId} onChange={e => atualizarLinha(idx, { formaPagamentoId: e.target.value })} className={inputCls}>
                      {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {l.erro && <p className="text-[11px] text-red-400 mt-2">{l.erro}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
