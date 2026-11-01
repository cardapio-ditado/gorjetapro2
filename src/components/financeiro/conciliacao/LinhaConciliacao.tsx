import type { ReactNode } from 'react';
import { RefreshCw, CheckCircle2, Ban } from 'lucide-react';
import dayjs from 'dayjs';
import { fmt, inputCls, type Linha, type Acao, type Fornecedor, type Categoria, type Forma } from './lancar';

interface Props {
  linha: Linha;
  fornecedores: Fornecedor[];
  categorias: Categoria[];
  formas: Forma[];
  onChange: (patch: Partial<Linha>) => void;
  onAprovar: () => void;
  onIgnorar: () => void;
  /** Linha extra abaixo da descrição (ex.: quem recebeu o Pix). */
  detalhe?: ReactNode;
  /** Controles extras no rodapé, só enquanto pendente (ex.: lembrar a regra). */
  rodape?: ReactNode;
}

/** Cartão de uma saída do extrato: ação, campos da ação e aprovar/ignorar. */
export default function LinhaConciliacao({ linha: l, fornecedores, categorias, formas, onChange, onAprovar, onIgnorar, detalhe, rodape }: Props) {
  const conciliada = l.status === 'conciliada';
  const ignorada = l.status === 'ignorada';
  return (
    <div className={`bg-[#12141f] rounded-xl border p-3 transition-colors ${conciliada ? 'border-green-500/30' : ignorada ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
      {/* Cabeçalho da transação */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{fmt(l.valor)}</span>
            <span className="text-xs text-white/60">{dayjs(l.data).format('DD/MM/YY')}</span>
            {l.acao === 'ja' && l.status === 'pendente' && <span className="text-caption px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/30">já no fluxo</span>}
            {l.acao === 'baixa' && l.status === 'pendente' && <span className="text-caption px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/30">baixa sugerida</span>}
            {l.acao === 'nova' && l.status === 'pendente' && <span className="text-caption px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">nova</span>}
            {conciliada && <span className="text-caption px-1.5 py-0.5 rounded border bg-green-500/15 text-green-400 border-green-500/30 flex items-center gap-1"><CheckCircle2 size={10} /> conciliada</span>}
            {ignorada && <span className="text-caption px-1.5 py-0.5 rounded border bg-white/5 text-white/60 border-white/10">ignorada</span>}
          </div>
          <p className="text-xs text-white/50 truncate max-w-[420px]">{l.descricao || '(sem descrição)'}</p>
          {detalhe}
        </div>

        {l.status === 'pendente' && (
          <div className="flex items-center gap-1.5">
            <select value={l.acao} onChange={e => onChange({ acao: e.target.value as Acao, erro: null })}
              className="text-xs border border-white/15 rounded-md px-2 py-1 bg-white/5 text-white">
              <option value="nova">Criar nova</option>
              <option value="baixa" disabled={l.sug.contas_abertas.length === 0}>Baixar conta aberta</option>
              <option value="ja">Já lançada (só marcar)</option>
            </select>
            <button onClick={onAprovar} disabled={l.salvando}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
              {l.salvando ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Aprovar
            </button>
            <button onClick={onIgnorar} disabled={l.salvando} title="Ignorar"
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
            <label className="block text-caption text-white/60 mb-1">Fornecedor {l.sug.fornecedores[0] && <span className="text-white/60">(sugestão: {l.sug.fornecedores[0].nome})</span>}</label>
            <select value={l.fornecedorId} onChange={e => {
              const f = fornecedores.find(x => x.id === e.target.value);
              onChange({ fornecedorId: e.target.value, categoriaId: f?.categoria_padrao_id || l.categoriaId });
            }} className={inputCls}>
              <option value="">Selecione...</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-caption text-white/60 mb-1">Categoria</label>
            <select value={l.categoriaId} onChange={e => onChange({ categoriaId: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-caption text-white/60 mb-1">Forma pgto</label>
            <select value={l.formaPagamentoId} onChange={e => onChange({ formaPagamentoId: e.target.value })} className={inputCls}>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
        </div>
      )}

      {l.status === 'pendente' && l.acao === 'baixa' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <div>
            <label className="block text-caption text-white/60 mb-1">Conta a pagar (em aberto)</label>
            <select value={l.contaPagarId} onChange={e => onChange({ contaPagarId: e.target.value })} className={inputCls}>
              <option value="">Selecione...</option>
              {l.sug.contas_abertas.map(c => (
                <option key={c.id} value={c.id}>{c.fornecedor_nome} · {c.descricao} · vc {dayjs(c.data_vencimento).format('DD/MM')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-caption text-white/60 mb-1">Forma pgto</label>
            <select value={l.formaPagamentoId} onChange={e => onChange({ formaPagamentoId: e.target.value })} className={inputCls}>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
        </div>
      )}

      {l.status === 'pendente' && rodape}
      {l.erro && <p className="text-caption text-red-400 mt-2">{l.erro}</p>}
    </div>
  );
}
