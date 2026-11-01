import { useState, useEffect } from 'react';
import { Upload, RefreshCw, AlertTriangle, ArrowLeft, Sparkles, FileText, Landmark } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import ExtratoAutomatico from './conciliacao/ExtratoAutomatico';
import LinhaConciliacao from './conciliacao/LinhaConciliacao';
import {
  inputCls, sugerir, acaoInicial, validar, lancar, registrarIgnorada,
  type Banco, type Forma, type Categoria, type Fornecedor, type Linha,
} from './conciliacao/lancar';

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
  const [modo, setModo] = useState<'automatico' | 'arquivo'>('automatico');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
        {([
          ['automatico', 'Conta Stone (automático)', Landmark],
          ['arquivo', 'Importar arquivo (OFX/XML)', Upload],
        ] as const).map(([m, rotulo, Icone]) => (
          <button key={m} onClick={() => setModo(m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${modo === m ? 'bg-wine text-white' : 'text-white/60 hover:text-white'}`}>
            <Icone size={13} /> {rotulo}
          </button>
        ))}
      </div>
      {modo === 'automatico' ? <ExtratoAutomatico /> : <ImportarArquivo />}
    </div>
  );
}

function ImportarArquivo() {
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
        const sug = await sugerir(t.descricao, t.valor, t.data, bancoContaId);
        const jaImportada = mapaJa.get(t.fitid) === 'conciliada';
        const topForn = sug.fornecedores[0];
        return {
          fitid: t.fitid,
          data: t.data,
          valor: t.valor,
          descricao: t.descricao,
          acao: acaoInicial(sug, jaImportada),
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
    const msg = validar(l, bancoContaId);
    if (msg) { atualizarLinha(idx, { erro: msg }); return; }
    atualizarLinha(idx, { salvando: true, erro: null });
    try {
      await lancar(l, bancoContaId, importacaoId);
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
      await registrarIgnorada(l, bancoContaId, importacaoId);
      atualizarLinha(idx, { status: 'ignorada', salvando: false });
    } catch (e: any) {
      atualizarLinha(idx, { salvando: false, erro: e.message });
    }
  };

  const resetar = () => {
    setEtapa('upload'); setLinhas([]); setArquivo(null); setPrevia(null); setParsed(null); setImportacaoId(null); setErro(null);
  };

  const totalPend = linhas.filter(l => l.status === 'pendente').length;
  const totalConc = linhas.filter(l => l.status === 'conciliada').length;

  // ─── UPLOAD ────────────────────────────────────────────────────────────────
  if (etapa === 'upload') {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-[#12141f] rounded-2xl border border-white/10 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-wine" />
            <h2 className="font-semibold text-white/90">Importar extrato (OFX / XML)</h2>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5 block">Conta bancária do extrato *</label>
            <select value={bancoContaId} onChange={e => setBancoContaId(e.target.value)} className={inputCls}>
              <option value="">Selecione a conta...</option>
              {bancos.map(b => <option key={b.id} value={b.id}>{b.banco} — {b.tipo_conta}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5 block">Forma de pagamento padrão</label>
            <select value={formaPadraoId} onChange={e => setFormaPadraoId(e.target.value)} className={inputCls}>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <p className="text-caption text-white/60 mt-1">Aplicada por padrão em cada lançamento; dá pra mudar linha a linha.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5 block">Arquivo</label>
            <input type="file" accept=".ofx,.xml,.OFX,.XML" onChange={e => onSelecionarArquivo(e.target.files?.[0] || null)}
              className="block w-full text-xs text-white/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-wine file:text-white file:text-xs file:cursor-pointer" />
          </div>

          {previa && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70 flex items-center gap-4">
              <FileText size={14} className="text-white/40" />
              <span>{previa.total} transações</span>
              <span className="text-wine font-semibold">{previa.debitos} saídas</span>
              <span className="text-white/60">{previa.periodo}</span>
            </div>
          )}

          {erro && (
            <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-start gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {erro}
            </div>
          )}

          <button onClick={processar} disabled={carregando || !previa || !bancoContaId}
            className="w-full flex items-center justify-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
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
        {linhas.map((l, idx) => (
          <LinhaConciliacao key={idx} linha={l} fornecedores={fornecedores} categorias={categorias} formas={formas}
            onChange={patch => atualizarLinha(idx, patch)} onAprovar={() => aprovar(idx)} onIgnorar={() => ignorar(idx)} />
        ))}
      </div>
    </div>
  );
}
