import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select, Textarea } from '../components/ui';

/**
 * Bônus da ZIG por pessoa (Kadu, 18/11/2026). A ZIG manda cada transação paga em
 * bônus com o nome de quem usou (função zig-bonus, todo dia às 6h40). Aqui cada
 * pessoa é marcada como funcionário (desconta do salário, no RH da Central),
 * parceiro de permuta (abate do saldo), cortesia da casa (não desconta) ou fica
 * "a classificar". A taxa de serviço conta; funcionário paga o valor cheio.
 * O CPF fica só no banco: esta tela recebe nome e valores.
 */

type Tipo = 'nao_identificado' | 'parceiro' | 'funcionario' | 'cortesia';
interface Pessoa {
  id: string; nome: string; tipo: Tipo; permuta_tipo: 'mensal' | 'total' | null; permuta_valor: number | null; permuta_inicio: string | null;
  obs: string | null; funcionario_cadastro: boolean; total: number; consumo: number; taxa: number; transacoes: number; noites: number;
  saldo: number | null; por_noite: Array<{ noite: string; v: number }> | null;
}
interface Resumo { mes: string; coleta: { de: string | null; ate: string | null; noites: number } | null; pessoas: Pessoa[] }

const TIPOS: Record<Tipo, { nome: string; plural: string; ajuda: string }> = {
  nao_identificado: { nome: 'Cliente / outros', plural: 'Clientes e outros', ajuda: 'Bônus de cliente (consumação de ingresso, promoção, recarga com bônus): não desconta de ninguém. Se achar aqui um parceiro ou funcionário sem cadastro, toque em Marcar.' },
  parceiro: { nome: 'Parceiro de permuta', plural: 'Parceiros', ajuda: 'O bônus abate da permuta. Mensal: o saldo renova todo mês. Uma vez: vai acabando.' },
  funcionario: { nome: 'Funcionário', plural: 'Funcionários', ajuda: 'Desconta do salário, valor cheio com a taxa. O total do mês vai para o RH da Central.' },
  cortesia: { nome: 'Cortesia da casa', plural: 'Cortesia', ajuda: 'Bônus dado pela casa: não desconta de ninguém.' },
};
const brl = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const mesAtual = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 7);
const numBr = (s: string) => { const t = s.trim(); if (!t) return null; const v = Number(t.includes(',') ? t.replace(/[^\d,]/g, '').replace(',', '.') : t.replace(/[^\d.]/g, '')); return Number.isFinite(v) ? v : NaN; };

const BonusZig: React.FC = () => {
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<Tipo>('funcionario');
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [editando, setEditando] = useState<Pessoa | null>(null);
  const [coletando, setColetando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(50);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.rpc('fn_bonus_resumo', { p_mes: `${mes}-01` });
    if (error) setErro(error.message); else { setErro(null); setDados(data as Resumo); }
    setCarregando(false);
  }, [mes]);
  useEffect(() => { void carregar(); }, [carregar]);

  const pessoas = dados?.pessoas ?? [];
  const porTipo = useMemo(() => {
    const m: Record<Tipo, Pessoa[]> = { nao_identificado: [], parceiro: [], funcionario: [], cortesia: [] };
    for (const p of pessoas) m[p.tipo].push(p);
    return m;
  }, [pessoas]);
  const soma = (l: Pessoa[]) => l.reduce((t, p) => t + Number(p.total), 0);
  const totalMes = soma(pessoas);

  const coletarMes = async () => {
    setColetando(true); setMsg('Puxando da ZIG…');
    const ini = `${mes}-01`;
    const ultimo = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 4 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    const fim = ultimo < ontem ? ultimo : ontem;
    try {
      const { data, error } = await supabase.functions.invoke('zig-bonus', { body: { acao: 'coletar', dtinicio: ini, dtfim: fim } });
      if (error || !data) throw new Error(error?.message || 'sem resposta');
      setMsg(data.ok ? `Atualizado: ${data.noites.length} noite(s).` : `Atualizado com ${data.erros.length} erro(s): ${data.erros[0]?.erro ?? ''}`);
      await carregar();
    } catch (e) {
      setMsg(`Não deu para puxar da ZIG: ${e instanceof Error ? e.message : e}`);
    } finally { setColetando(false); }
  };

  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtrada = busca.trim() ? porTipo[aba].filter((p) => semAcento(p.nome).includes(semAcento(busca.trim()))) : porTipo[aba];
  const lista = filtrada.slice(0, limite);
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <PageHeader title="Bônus ZIG" subtitle="Quem consumiu com bônus: funcionário desconta do salário, parceiro abate da permuta, cortesia não desconta."
        actions={<div className="flex flex-wrap items-center gap-2">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" className="input-dark" style={{ width: 170 }} />
          <Button variante="secundario" tamanho="sm" icone={<RefreshCw size={14} />} carregando={coletando} onClick={coletarMes}>Puxar o mês da ZIG</Button>
        </div>} />

      {erro && <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{erro}</p>}
      {msg && <p className="text-sm" style={{ color: 'var(--text-secondary)' }} role="status">{msg}</p>}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <KPICard rotulo="Bônus no mês" valor={brl(totalMes)} detalhe={`${pessoas.filter((p) => p.total > 0).length} pessoa(s)`} tom="destaque" />
        <KPICard rotulo="Clientes e outros" valor={brl(soma(porTipo.nao_identificado))} detalhe={`${porTipo.nao_identificado.length} pessoa(s), não desconta`} onClick={() => setAba('nao_identificado')} />
        <KPICard rotulo="Funcionários (descontar)" valor={brl(soma(porTipo.funcionario))} detalhe={`${porTipo.funcionario.length} pessoa(s)`} onClick={() => setAba('funcionario')} />
        <KPICard rotulo="Parceiros (permuta)" valor={brl(soma(porTipo.parceiro))} detalhe={`${porTipo.parceiro.filter((p) => (p.saldo ?? 0) < 0).length} passaram da permuta`} tom={porTipo.parceiro.some((p) => (p.saldo ?? 0) < 0) ? 'alerta' : 'normal'} onClick={() => setAba('parceiro')} />
        <KPICard rotulo="Cortesia da casa" valor={brl(soma(porTipo.cortesia))} detalhe={`${porTipo.cortesia.length} pessoa(s)`} onClick={() => setAba('cortesia')} />
      </div>

      <div className="flex flex-wrap items-end gap-3" style={{ maxWidth: "100%" }}>
        <Segmented<Tipo> className="overflow-x-auto max-w-full" rotulo="Grupo" valor={aba} onMudar={(t) => { setAba(t); setLimite(50); }}
          opcoes={(['funcionario', 'parceiro', 'cortesia', 'nao_identificado'] as Tipo[]).map((t) => ({ valor: t, rotulo: `${TIPOS[t].plural} (${porTipo[t].length})` }))} />
        <input type="search" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(50); }} placeholder="Buscar nome" aria-label="Buscar nome" className="input-dark" style={{ width: 220, maxWidth: "100%" }} />
      </div>

      <SectionCard title={TIPOS[aba].plural} descricao={TIPOS[aba].ajuda}>
        {carregando && !dados ? <p className="text-sm">Carregando…</p> : lista.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ninguém neste grupo em {mes.slice(5, 7)}/{mes.slice(0, 4)}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead><tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                <th className="py-2 pr-3">Pessoa</th><th className="py-2 pr-3 text-right">No mês</th><th className="py-2 pr-3">Noites</th>
                {aba === 'parceiro' && <><th className="py-2 pr-3 text-right">Permuta</th><th className="py-2 pr-3 text-right">Saldo</th></>}
                <th className="py-2" />
              </tr></thead>
              <tbody>{lista.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2 pr-3"><b>{p.nome}</b>{p.obs && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.obs}</div>}</td>
                  <td className="py-2 pr-3 text-right tabular-nums"><b>{brl(p.total)}</b><div className="text-xs" style={{ color: 'var(--text-secondary)' }}>taxa {brl(p.taxa)}</div></td>
                  <td className="py-2 pr-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{(p.por_noite ?? []).map((n) => `${dm(n.noite)} ${brl(n.v)}`).join(' · ') || '—'}</td>
                  {aba === 'parceiro' && <>
                    <td className="py-2 pr-3 text-right tabular-nums">{brl(p.permuta_valor)}<div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.permuta_tipo === 'mensal' ? 'por mês' : `uma vez, desde ${dataBr(p.permuta_inicio)}`}</div></td>
                    <td className="py-2 pr-3 text-right tabular-nums"><b style={{ color: (p.saldo ?? 0) < 0 ? 'var(--danger-text)' : 'var(--success-text, inherit)' }}>{brl(p.saldo)}</b>
                      {(p.saldo ?? 0) < 0 && <div className="text-xs" style={{ color: 'var(--danger-text)' }}>passou da permuta</div>}</td>
                  </>}
                  <td className="py-2 text-right"><Button tamanho="sm" variante="discreto" onClick={() => setEditando(p)}>{aba === 'nao_identificado' ? 'Marcar' : 'Editar'}</Button></td>
                </tr>
              ))}</tbody>
            </table>
            {filtrada.length > lista.length && (
              <div className="pt-3"><Button tamanho="sm" variante="secundario" onClick={() => setLimite((l) => l + 100)}>Mostrar mais ({filtrada.length - lista.length})</Button></div>
            )}
          </div>
        )}
      </SectionCard>

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {dados?.coleta?.de ? `Histórico da ZIG de ${dataBr(dados.coleta.de)} a ${dataBr(dados.coleta.ate)} (${dados.coleta.noites} noites). A noite de ontem entra sozinha todo dia às 6h40.` : 'Nenhuma noite puxada ainda.'}
      </p>

      {editando && <Classificar pessoa={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); void carregar(); }} />}
    </div>
  );
};

const Classificar: React.FC<{ pessoa: Pessoa; onFechar: () => void; onSalvo: () => void }> = ({ pessoa, onFechar, onSalvo }) => {
  const [tipo, setTipo] = useState<Tipo>(pessoa.tipo);
  const [nome, setNome] = useState(pessoa.nome);
  const [ptipo, setPtipo] = useState<'mensal' | 'total'>(pessoa.permuta_tipo ?? 'mensal');
  const [valor, setValor] = useState(pessoa.permuta_valor ? String(pessoa.permuta_valor).replace('.', ',') : '');
  const [inicio, setInicio] = useState(pessoa.permuta_inicio ?? new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10));
  const [obs, setObs] = useState(pessoa.obs ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const v = numBr(valor);
    if (tipo === 'parceiro' && !(v && v > 0)) { setErro('Digite o valor da permuta, por exemplo 1.000,00.'); return; }
    setSalvando(true); setErro(null);
    const { error } = await supabase.rpc('fn_bonus_classificar', {
      p_id: pessoa.id, p_tipo: tipo, p_permuta_tipo: tipo === 'parceiro' ? ptipo : null, p_permuta_valor: tipo === 'parceiro' ? v : null,
      p_permuta_inicio: tipo === 'parceiro' ? inicio : null, p_obs: obs.trim(), p_nome: nome.trim(),
    });
    setSalvando(false);
    if (error) setErro(error.message); else onSalvo();
  };

  return (
    <Modal aberto onFechar={onFechar} titulo={pessoa.nome} descricao={`Bônus no mês: ${brl(pessoa.total)} em ${pessoa.transacoes} transação(ões).`} largura="md"
      rodape={<div className="flex gap-2 justify-end"><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button carregando={salvando} onClick={salvar} icone={<Gift size={14} />}>Salvar</Button></div>}>
      <div className="space-y-3">
        <Input id="bz-nome" rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} dica="Para cartão anônimo, escreva quem usa (ex.: Alan Brindes)." />
        <Select id="bz-tipo" rotulo="Quem é" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
          {(Object.keys(TIPOS) as Tipo[]).map((t) => <option key={t} value={t}>{TIPOS[t].nome}</option>)}
        </Select>
        {tipo === 'funcionario' && !pessoa.funcionario_cadastro && (
          <p className="text-xs" style={{ color: 'var(--warn-text)' }}>O documento desta pessoa não bate com nenhum colaborador do cadastro. Confira antes de mandar para o RH.</p>
        )}
        {tipo === 'parceiro' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select id="bz-ptipo" rotulo="Permuta" value={ptipo} onChange={(e) => setPtipo(e.target.value as 'mensal' | 'total')}>
              <option value="mensal">Por mês (renova)</option><option value="total">Uma vez só</option>
            </Select>
            <Input id="bz-valor" rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.000,00" />
            <Input id="bz-inicio" rotulo={ptipo === 'total' ? 'Conta a partir de' : 'Desde'} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
        )}
        <Textarea id="bz-obs" rotulo="Observação" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
        {erro && <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{erro}</p>}
      </div>
    </Modal>
  );
};

export default BonusZig;
