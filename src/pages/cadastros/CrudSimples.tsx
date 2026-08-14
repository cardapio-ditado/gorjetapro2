import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/Modal';
import { parseValorBR } from '../../utils/format';

export interface CampoCrud {
  chave: string;
  rotulo: string;
  tipo?: 'texto' | 'numero' | 'select';
  opcoes?: [string, string][];
  placeholder?: string;
  obrigatorio?: boolean;
  metade?: boolean;
}

export type RegistroCrud = { id: string; ativo: boolean } & Record<string, unknown>;

interface Props {
  tabela: string;
  novoRotulo: string;
  tituloNovo: string;
  tituloEditar: string;
  vazio: string;
  campos: CampoCrud[];
  linhaTitulo: (r: RegistroCrud) => string;
  linhaDetalhe: (r: RegistroCrud) => string;
  badge?: (r: RegistroCrud) => { texto: string; classe: string } | null;
  dicaExclusao: string;
}

// CRUD genérico para cadastros simples (fornecedores, produtos, categorias, contas).
export default function CrudSimples({
  tabela,
  novoRotulo,
  tituloNovo,
  tituloEditar,
  vazio,
  campos,
  linhaTitulo,
  linhaDetalhe,
  badge,
  dicaExclusao,
}: Props) {
  const [registros, setRegistros] = useState<RegistroCrud[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<RegistroCrud | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase.from(tabela).select('*').order('nome');
    if (error) setErro(error.message);
    setRegistros((data as RegistroCrud[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [tabela]);

  function abrir(r?: RegistroCrud) {
    setEdit(r ?? null);
    const f: Record<string, string> = {};
    campos.forEach((c) => {
      const v = r?.[c.chave];
      f[c.chave] = v == null ? (c.tipo === 'select' ? (c.opcoes?.[0]?.[0] ?? '') : '') : String(v);
    });
    setForm(f);
    setAtivo(r?.ativo ?? true);
    setErroForm(null);
    setModal(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ativo };
    for (const c of campos) {
      const bruto = (form[c.chave] ?? '').trim();
      if (c.tipo === 'numero') {
        const n = bruto ? parseValorBR(bruto) : 0;
        if (isNaN(n)) return setErroForm(`Valor inválido em "${c.rotulo}".`);
        payload[c.chave] = n;
      } else if (c.obrigatorio && !bruto) {
        return setErroForm(`Preencha "${c.rotulo}".`);
      } else if (c.tipo === 'select') {
        payload[c.chave] = bruto;
      } else {
        payload[c.chave] = bruto || null;
      }
    }
    setSalvando(true);
    setErroForm(null);
    const { error } = edit
      ? await supabase.from(tabela).update(payload).eq('id', edit.id)
      : await supabase.from(tabela).insert(payload);
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModal(false);
    await carregar();
  }

  async function excluir(r: RegistroCrud) {
    if (!window.confirm(`Excluir "${linhaTitulo(r)}"? Não dá pra desfazer.`)) return;
    const { error } = await supabase.from(tabela).delete().eq('id', r.id);
    if (error) {
      return alert(error.message.toLowerCase().includes('foreign key') ? dicaExclusao : error.message);
    }
    await carregar();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={() => abrir()} className="btn-gold">
          <Plus className="h-4 w-4" /> {novoRotulo}
        </button>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">{erro}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
        </div>
      ) : registros.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-zinc-500">{vazio}</div>
      ) : (
        <div className="card divide-y divide-night-800 overflow-hidden">
          {registros.map((r) => {
            const b = badge?.(r);
            return (
              <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${r.ativo ? 'text-zinc-100' : 'text-zinc-500 line-through'}`}>
                      {linhaTitulo(r)}
                    </span>
                    {b && (
                      <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${b.classe}`}>{b.texto}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">{linhaDetalhe(r) || '—'}</div>
                </div>
                <button
                  onClick={() => abrir(r)}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-night-800 hover:text-gold-300"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => excluir(r)}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-red-950/40 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal aberto={modal} titulo={edit ? tituloEditar : tituloNovo} onFechar={() => setModal(false)}>
        <form onSubmit={salvar} className="grid grid-cols-2 gap-4">
          {campos.map((c) => (
            <div key={c.chave} className={c.metade ? '' : 'col-span-2'}>
              <label className="label">{c.rotulo}</label>
              {c.tipo === 'select' ? (
                <select
                  className="input"
                  value={form[c.chave] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [c.chave]: e.target.value }))}
                >
                  {(c.opcoes ?? []).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                  placeholder={c.placeholder}
                  value={form[c.chave] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [c.chave]: e.target.value }))}
                  required={c.obrigatorio}
                />
              )}
            </div>
          ))}
          <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 accent-gold-500"
            />
            Ativo
          </label>
          {erroForm && (
            <div className="col-span-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">
              {erroForm}
            </div>
          )}
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
