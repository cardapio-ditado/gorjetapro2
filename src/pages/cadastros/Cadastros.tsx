import { FormEvent, useEffect, useState } from 'react';
import { CarFront, Pencil, Plus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Funcionario, Veiculo } from '../../types';
import Modal from '../../components/Modal';

type Aba = 'funcionarios' | 'veiculos';

export default function Cadastros() {
  const [aba, setAba] = useState<Aba>('funcionarios');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // modal funcionário
  const [modalFunc, setModalFunc] = useState(false);
  const [editFunc, setEditFunc] = useState<Funcionario | null>(null);
  const [fNome, setFNome] = useState('');
  const [fApelido, setFApelido] = useState('');
  const [fTelefone, setFTelefone] = useState('');
  const [fFuncao, setFFuncao] = useState('');
  const [fTipo, setFTipo] = useState<'fixo' | 'freelancer'>('freelancer');
  const [fPix, setFPix] = useState('');
  const [fAtivo, setFAtivo] = useState(true);

  // modal veículo
  const [modalVei, setModalVei] = useState(false);
  const [editVei, setEditVei] = useState<Veiculo | null>(null);
  const [vNome, setVNome] = useState('');
  const [vPlaca, setVPlaca] = useState('');
  const [vModelo, setVModelo] = useState('');
  const [vAtivo, setVAtivo] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const [f, v] = await Promise.all([
      supabase.from('rr_funcionarios').select('*').order('nome'),
      supabase.from('rr_veiculos').select('*').order('nome'),
    ]);
    if (f.error || v.error) setErro(f.error?.message ?? v.error?.message ?? 'Erro ao carregar');
    setFuncionarios((f.data as Funcionario[]) ?? []);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirFunc(f?: Funcionario) {
    setEditFunc(f ?? null);
    setFNome(f?.nome ?? '');
    setFApelido(f?.apelido ?? '');
    setFTelefone(f?.telefone ?? '');
    setFFuncao(f?.funcao ?? '');
    setFTipo(f?.tipo ?? 'freelancer');
    setFPix(f?.pix ?? '');
    setFAtivo(f?.ativo ?? true);
    setErroForm(null);
    setModalFunc(true);
  }

  function abrirVei(v?: Veiculo) {
    setEditVei(v ?? null);
    setVNome(v?.nome ?? '');
    setVPlaca(v?.placa ?? '');
    setVModelo(v?.modelo ?? '');
    setVAtivo(v?.ativo ?? true);
    setErroForm(null);
    setModalVei(true);
  }

  async function salvarFunc(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm(null);
    const registro = {
      nome: fNome.trim(),
      apelido: fApelido.trim() || null,
      telefone: fTelefone.trim() || null,
      funcao: fFuncao.trim() || null,
      tipo: fTipo,
      pix: fPix.trim() || null,
      ativo: fAtivo,
    };
    const { error } = editFunc
      ? await supabase.from('rr_funcionarios').update(registro).eq('id', editFunc.id)
      : await supabase.from('rr_funcionarios').insert(registro);
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModalFunc(false);
    await carregar();
  }

  async function salvarVei(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm(null);
    const registro = {
      nome: vNome.trim(),
      placa: vPlaca.trim().toUpperCase() || null,
      modelo: vModelo.trim() || null,
      ativo: vAtivo,
    };
    const { error } = editVei
      ? await supabase.from('rr_veiculos').update(registro).eq('id', editVei.id)
      : await supabase.from('rr_veiculos').insert(registro);
    setSalvando(false);
    if (error) return setErroForm(error.message);
    setModalVei(false);
    await carregar();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              ['funcionarios', 'Funcionários', Users],
              ['veiculos', 'Veículos', CarFront],
            ] as [Aba, string, React.ElementType][]
          ).map(([chave, rotulo, Icone]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                aba === chave
                  ? 'border border-gold-500/40 bg-gold-500/15 text-gold-300'
                  : 'border border-night-700 text-zinc-400 hover:text-white'
              }`}
            >
              <Icone className="h-4 w-4" /> {rotulo}
            </button>
          ))}
        </div>
        <button onClick={() => (aba === 'funcionarios' ? abrirFunc() : abrirVei())} className="btn-gold">
          <Plus className="h-4 w-4" /> {aba === 'funcionarios' ? 'Novo funcionário' : 'Novo veículo'}
        </button>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">{erro}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
        </div>
      ) : aba === 'funcionarios' ? (
        funcionarios.length === 0 ? (
          <div className="card px-6 py-16 text-center text-sm text-zinc-500">Nenhum funcionário cadastrado.</div>
        ) : (
          <div className="card divide-y divide-night-800 overflow-hidden">
            {funcionarios.map((f) => (
              <div key={f.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${f.ativo ? 'text-zinc-100' : 'text-zinc-500 line-through'}`}>
                      {f.nome}
                    </span>
                    {f.apelido && <span className="text-xs text-zinc-500">({f.apelido})</span>}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                        f.tipo === 'fixo' ? 'bg-sky-500/15 text-sky-300' : 'bg-purple-500/15 text-purple-300'
                      }`}
                    >
                      {f.tipo === 'fixo' ? 'Fixo' : 'Freelancer'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {[f.funcao, f.telefone, f.pix ? `PIX: ${f.pix}` : null].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button onClick={() => abrirFunc(f)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-night-800 hover:text-gold-300">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : veiculos.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-zinc-500">Nenhum veículo cadastrado.</div>
      ) : (
        <div className="card divide-y divide-night-800 overflow-hidden">
          {veiculos.map((v) => (
            <div key={v.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${v.ativo ? 'text-zinc-100' : 'text-zinc-500 line-through'}`}>{v.nome}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{[v.modelo, v.placa].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <button onClick={() => abrirVei(v)} className="rounded-lg p-2 text-zinc-500 transition hover:bg-night-800 hover:text-gold-300">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* modal funcionário */}
      <Modal aberto={modalFunc} titulo={editFunc ? 'Editar funcionário' : 'Novo funcionário'} onFechar={() => setModalFunc(false)}>
        <form onSubmit={salvarFunc} className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={fNome} onChange={(e) => setFNome(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Apelido</label>
              <input className="input" value={fApelido} onChange={(e) => setFApelido(e.target.value)} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={fTelefone} onChange={(e) => setFTelefone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Função</label>
              <input className="input" placeholder="Ex.: barman, motorista" value={fFuncao} onChange={(e) => setFFuncao(e.target.value)} />
            </div>
            <div>
              <label className="label">Vínculo</label>
              <select className="input" value={fTipo} onChange={(e) => setFTipo(e.target.value as 'fixo' | 'freelancer')}>
                <option value="freelancer">Freelancer</option>
                <option value="fixo">Fixo</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Chave PIX</label>
            <input className="input" value={fPix} onChange={(e) => setFPix(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={fAtivo} onChange={(e) => setFAtivo(e.target.checked)} className="h-4 w-4 accent-gold-500" />
            Ativo
          </label>
          {erroForm && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erroForm}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalFunc(false)} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-gold">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* modal veículo */}
      <Modal aberto={modalVei} titulo={editVei ? 'Editar veículo' : 'Novo veículo'} onFechar={() => setModalVei(false)}>
        <form onSubmit={salvarVei} className="space-y-4">
          <div>
            <label className="label">Nome / identificação *</label>
            <input className="input" placeholder="Ex.: Fiorino branca" value={vNome} onChange={(e) => setVNome(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Modelo</label>
              <input className="input" value={vModelo} onChange={(e) => setVModelo(e.target.value)} />
            </div>
            <div>
              <label className="label">Placa</label>
              <input className="input" value={vPlaca} onChange={(e) => setVPlaca(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={vAtivo} onChange={(e) => setVAtivo(e.target.checked)} className="h-4 w-4 accent-gold-500" />
            Ativo
          </label>
          {erroForm && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">{erroForm}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalVei(false)} className="btn-ghost">
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
