import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FinCategoria, FinConta, FinLancamento, Fornecedor } from '../../types';
import { formatarData, formatarMoeda, hojeISO } from '../../utils/format';
import LancamentoModal from '../financeiro/LancamentoModal';
import BaixaModal from '../financeiro/BaixaModal';

// Financeiro do evento: despesas e receitas vinculadas a este evento.
export default function FinanceiroEvento({ eventoId }: { eventoId: string }) {
  const [lancamentos, setLancamentos] = useState<FinLancamento[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [contas, setContas] = useState<FinConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<FinLancamento | null>(null);
  const [baixa, setBaixa] = useState<FinLancamento | null>(null);

  async function carregar() {
    const { data } = await supabase
      .from('rr_fin_lancamentos')
      .select('*, categoria:rr_fin_categorias(*), fornecedor:rr_fornecedores(*), conta:rr_fin_contas(*)')
      .eq('evento_id', eventoId)
      .order('data_vencimento');
    setLancamentos((data as unknown as FinLancamento[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [eventoId]);

  useEffect(() => {
    (async () => {
      const [c, f, co] = await Promise.all([
        supabase.from('rr_fin_categorias').select('*').eq('ativo', true).order('nome'),
        supabase.from('rr_fornecedores').select('*').eq('ativo', true).order('nome'),
        supabase.from('rr_fin_contas').select('*').eq('ativo', true).order('nome'),
      ]);
      setCategorias((c.data as FinCategoria[]) ?? []);
      setFornecedores((f.data as Fornecedor[]) ?? []);
      setContas((co.data as FinConta[]) ?? []);
    })();
  }, []);

  const resumo = useMemo(() => {
    const soma = (tipo: string, status: string) =>
      lancamentos.filter((l) => l.tipo === tipo && l.status === status).reduce((a, l) => a + Number(l.valor), 0);
    const pagarAberto = soma('pagar', 'aberto');
    const pago = soma('pagar', 'pago');
    const receberAberto = soma('receber', 'aberto');
    const recebido = soma('receber', 'pago');
    return { pagarAberto, pago, receberAberto, recebido, resultado: recebido - pago };
  }, [lancamentos]);

  async function excluir(l: FinLancamento) {
    if (!window.confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('rr_fin_lancamentos').delete().eq('id', l.id);
    if (error) return alert(error.message);
    await carregar();
  }

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  const hoje = hojeISO();

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { rotulo: 'A pagar (aberto)', valor: resumo.pagarAberto, cor: 'text-amber-300' },
          { rotulo: 'Pago', valor: resumo.pago, cor: 'text-red-300' },
          { rotulo: 'A receber (aberto)', valor: resumo.receberAberto, cor: 'text-sky-300' },
          { rotulo: 'Recebido', valor: resumo.recebido, cor: 'text-emerald-300' },
          {
            rotulo: 'Resultado realizado',
            valor: resumo.resultado,
            cor: resumo.resultado >= 0 ? 'text-gold-300' : 'text-red-400',
          },
        ].map((c) => (
          <div key={c.rotulo} className="card px-4 py-3">
            <div className="text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">{c.rotulo}</div>
            <div className={`mt-1 font-display text-lg font-bold ${c.cor}`}>{formatarMoeda(c.valor)}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex justify-end">
        <button
          onClick={() => {
            setEdit(null);
            setModal(true);
          }}
          className="btn-gold"
        >
          <Plus className="h-4 w-4" /> Novo lançamento
        </button>
      </div>

      {lancamentos.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-zinc-500">
          Nenhum lançamento financeiro neste evento ainda.
        </div>
      ) : (
        <div className="card divide-y divide-night-800 overflow-hidden">
          {lancamentos.map((l) => {
            const vencido = l.status === 'aberto' && l.data_vencimento < hoje;
            return (
              <div key={l.id} className="flex items-center gap-3 px-5 py-3.5">
                {l.tipo === 'pagar' ? (
                  <ArrowDownCircle className="h-5 w-5 shrink-0 text-red-300" />
                ) : (
                  <ArrowUpCircle className="h-5 w-5 shrink-0 text-sky-300" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {l.descricao}
                    {l.categoria && <span className="ml-2 text-xs font-normal text-zinc-500">{l.categoria.nome}</span>}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {[
                      `Venc. ${formatarData(l.data_vencimento)}`,
                      l.fornecedor?.nome,
                      l.status === 'pago' && l.data_pagamento
                        ? `${l.tipo === 'receber' ? 'Recebido' : 'Pago'} em ${formatarData(l.data_pagamento)}${l.conta ? ` (${l.conta.nome})` : ''}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium ${
                    l.status === 'pago'
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                      : vencido
                        ? 'border-red-500/30 bg-red-500/15 text-red-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {l.status === 'pago' ? (l.tipo === 'receber' ? 'Recebido' : 'Pago') : vencido ? 'Vencido' : 'Em aberto'}
                </span>
                <div className={`w-24 shrink-0 text-right text-sm font-semibold ${l.tipo === 'pagar' ? 'text-red-300' : 'text-sky-300'}`}>
                  {l.tipo === 'pagar' ? '−' : '+'} {formatarMoeda(l.valor)}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {l.status === 'aberto' && (
                    <button
                      onClick={() => setBaixa(l)}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-emerald-950/40 hover:text-emerald-300"
                      title={l.tipo === 'receber' ? 'Registrar recebimento' : 'Registrar pagamento'}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEdit(l);
                      setModal(true);
                    }}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-night-800 hover:text-gold-300"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => excluir(l)}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-950/40 hover:text-red-300"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LancamentoModal
        aberto={modal}
        onFechar={() => setModal(false)}
        onSalvo={carregar}
        edit={edit}
        eventoFixo={eventoId}
        categorias={categorias}
        fornecedores={fornecedores}
        eventos={[]}
      />
      <BaixaModal lancamento={baixa} contas={contas} onFechar={() => setBaixa(null)} onSalvo={carregar} />
    </div>
  );
}
