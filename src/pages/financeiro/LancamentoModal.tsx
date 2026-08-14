import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/Modal';
import { Evento, FinCategoria, FinLancamento, FinLancamentoTipo, Fornecedor } from '../../types';
import { hojeISO, parseValorBR } from '../../utils/format';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  edit?: FinLancamento | null;
  tipoInicial?: FinLancamentoTipo;
  eventoFixo?: string | null; // quando aberto de dentro de um evento
  categorias: FinCategoria[];
  fornecedores: Fornecedor[];
  eventos: Evento[];
}

export default function LancamentoModal({
  aberto,
  onFechar,
  onSalvo,
  edit,
  tipoInicial,
  eventoFixo,
  categorias,
  fornecedores,
  eventos,
}: Props) {
  const [tipo, setTipo] = useState<FinLancamentoTipo>('pagar');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(hojeISO());
  const [categoria, setCategoria] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [evento, setEvento] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTipo(edit?.tipo ?? tipoInicial ?? 'pagar');
    setDescricao(edit?.descricao ?? '');
    setValor(edit ? String(edit.valor).replace('.', ',') : '');
    setVencimento(edit?.data_vencimento?.slice(0, 10) ?? hojeISO());
    setCategoria(edit?.categoria_id ?? '');
    setFornecedor(edit?.fornecedor_id ?? '');
    setEvento(edit?.evento_id ?? '');
    setObs(edit?.obs ?? '');
    setErro(null);
  }, [aberto, edit, tipoInicial]);

  const categoriasDoTipo = categorias.filter((c) => c.tipo === (tipo === 'pagar' ? 'despesa' : 'receita'));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = parseValorBR(valor);
    if (!descricao.trim()) return setErro('Informe a descrição.');
    if (isNaN(v) || v <= 0) return setErro('Informe um valor válido.');
    setSalvando(true);
    setErro(null);
    const payload = {
      tipo,
      descricao: descricao.trim(),
      valor: v,
      data_vencimento: vencimento,
      categoria_id: categoria || null,
      fornecedor_id: fornecedor || null,
      evento_id: eventoFixo ?? (evento || null),
      obs: obs.trim() || null,
    };
    const { error } = edit
      ? await supabase.from('rr_fin_lancamentos').update(payload).eq('id', edit.id)
      : await supabase.from('rr_fin_lancamentos').insert(payload);
    setSalvando(false);
    if (error) return setErro(error.message);
    onFechar();
    onSalvo();
  }

  return (
    <Modal aberto={aberto} titulo={edit ? 'Editar lançamento' : 'Novo lançamento'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['pagar', 'Despesa (a pagar)'],
              ['receber', 'Receita (a receber)'],
            ] as [FinLancamentoTipo, string][]
          ).map(([t, rotulo]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                tipo === t ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-night-700 text-zinc-400 hover:text-white'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Descrição *</label>
          <input
            className="input"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            required
            placeholder="Ex.: compra de gelo, cachê da banda…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Valor (R$) *</label>
            <input
              className="input"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="label">Vencimento *</label>
            <input type="date" className="input" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Sem categoria</option>
              {categoriasDoTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fornecedor</label>
            <select className="input" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!eventoFixo && (
          <div>
            <label className="label">Evento</label>
            <select className="input" value={evento} onChange={(e) => setEvento(e.target.value)}>
              <option value="">Sem evento (despesa/receita da central)</option>
              {eventos.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Observações</label>
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>

        {erro && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erro}</div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onFechar} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn-gold">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
