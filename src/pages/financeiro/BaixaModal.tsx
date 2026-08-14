import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/Modal';
import { FinConta, FinLancamento } from '../../types';
import { formatarMoeda, hojeISO } from '../../utils/format';

interface Props {
  lancamento: FinLancamento | null;
  contas: FinConta[];
  onFechar: () => void;
  onSalvo: () => void;
}

// Registrar pagamento (contas a pagar) ou recebimento (contas a receber).
export default function BaixaModal({ lancamento, contas, onFechar, onSalvo }: Props) {
  const [conta, setConta] = useState('');
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!lancamento) return;
    setConta(lancamento.conta_id ?? contas[0]?.id ?? '');
    setData(hojeISO());
    setErro(null);
  }, [lancamento, contas]);

  if (!lancamento) return null;
  const recebimento = lancamento.tipo === 'receber';

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!conta) return setErro('Selecione a conta ou caixa.');
    setSalvando(true);
    setErro(null);
    const { error } = await supabase
      .from('rr_fin_lancamentos')
      .update({ status: 'pago', data_pagamento: data, conta_id: conta })
      .eq('id', lancamento!.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    onFechar();
    onSalvo();
  }

  return (
    <Modal aberto titulo={recebimento ? 'Registrar recebimento' : 'Registrar pagamento'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-zinc-300">
          {lancamento.descricao} —{' '}
          <span className="font-semibold text-gold-300">{formatarMoeda(lancamento.valor)}</span>
        </p>
        <div>
          <label className="label">Conta / caixa *</label>
          <select className="input" value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          {contas.length === 0 && (
            <p className="mt-1 text-xs text-amber-400">Nenhuma conta cadastrada — crie em Cadastros → Contas &amp; Caixas.</p>
          )}
        </div>
        <div>
          <label className="label">Data</label>
          <input type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        {erro && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erro}</div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onFechar} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn-gold">
            {salvando ? 'Salvando…' : recebimento ? 'Confirmar recebimento' : 'Confirmar pagamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
