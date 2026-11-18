import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Gift, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Badge, Button, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select, Textarea } from '../components/ui';

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
  obs: string | null; funcionario_cadastro: boolean; total: number; consumo: number; taxa: number; descontado: number; transacoes: number; noites: number;
  saldo: number | null; por_noite: Array<{ noite: string; v: number }> | null;
}
interface Resumo { mes: string; coleta: { de: string | null; ate: string | null; noites: number } | null; pessoas: Pessoa[] }
interface Transacao {
  id: number; noite: string; data: string | null; mesa: string | null; garcom: string | null; cartao: string | null;
  itens: Array<{ p: string; q: number; v: number }> | null; consumo: number; taxa: number; descontado_em: string | null; descontado_por: string | null;
}
interface Ficha {
  id: string; nome: string; tipo: Tipo; permuta_tipo: 'mensal' | 'total' | null; permuta_valor: number | null; permuta_inicio: string | null;
  obs: string | null; funcionario_cadastro: boolean; colaborador: string | null; mes: string;
  meses: Array<{ mes: string; total: number; descontado: number; transacoes: number }>; transacoes: Transacao[];
}

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
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const somaMes = (m: string, d: number) => { const dt = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + d, 1)); return dt.toISOString().slice(0, 7); };
const hora = (iso: string | null, noite: string) => {
  if (!iso) return dm(noite);
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Cuiaba', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
};

/** ‹ outubro de 2026 › */
const SetasMes: React.FC<{ mes: string; onMudar: (m: string) => void }> = ({ mes, onMudar }) => (
  <div className="flex items-center gap-1">
    <IconButton aria-label="Mês anterior" onClick={() => onMudar(somaMes(mes, -1))}><ChevronLeft size={16} /></IconButton>
    <span className="text-sm font-semibold text-center" style={{ minWidth: 124, color: 'var(--text-primary)' }}>{nomeMes(mes)}</span>
    <IconButton aria-label="Próximo mês" disabled={mes >= mesAtual()} onClick={() => onMudar(somaMes(mes, 1))}><ChevronRight size={16} /></IconButton>
  </div>
);

const BonusZig: React.FC = () => {
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<Tipo>('funcionario');
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [editando, setEditando] = useState<Pessoa | null>(null);
  const [aberto, setAberto] = useState<Pessoa | null>(null);
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
          <SetasMes mes={mes} onMudar={setMes} />
          <Button variante="secundario" tamanho="sm" icone={<RefreshCw size={14} />} carregando={coletando} onClick={coletarMes}>Puxar o mês da ZIG</Button>
        </div>} />

      {erro && <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{erro}</p>}
      {msg && <p className="text-sm" style={{ color: 'var(--text-secondary)' }} role="status">{msg}</p>}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <KPICard rotulo="Bônus no mês" valor={brl(totalMes)} detalhe={`${pessoas.filter((p) => p.total > 0).length} pessoa(s)`} tom="destaque" />
        <KPICard rotulo="Clientes e outros" valor={brl(soma(porTipo.nao_identificado))} detalhe={`${porTipo.nao_identificado.length} pessoa(s), não desconta`} onClick={() => setAba('nao_identificado')} />
        <KPICard rotulo="Funcionários: falta descontar" valor={brl(soma(porTipo.funcionario) - porTipo.funcionario.reduce((t, p) => t + Number(p.descontado || 0), 0))}
          detalhe={`de ${brl(soma(porTipo.funcionario))}, ${porTipo.funcionario.length} pessoa(s)`} onClick={() => setAba('funcionario')} />
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
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ninguém neste grupo em {nomeMes(mes)}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead><tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                <th className="py-2 pr-3">Pessoa</th><th className="py-2 pr-3 text-right">No mês</th>
                {aba === 'funcionario' && <th className="py-2 pr-3 text-right">Falta descontar</th>}
                <th className="py-2 pr-3">Noites</th>
                {aba === 'parceiro' && <><th className="py-2 pr-3 text-right">Permuta</th><th className="py-2 pr-3 text-right">Saldo</th></>}
                <th className="py-2" />
              </tr></thead>
              <tbody>{lista.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setAberto(p)}>
                  <td className="py-2 pr-3">
                    <button type="button" className="text-left font-bold underline-offset-2 hover:underline" style={{ color: 'var(--text-primary)' }}
                      onClick={(e) => { e.stopPropagation(); setAberto(p); }}>{p.nome}</button>
                    {p.obs && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.obs}</div>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums"><b>{brl(p.total)}</b><div className="text-xs" style={{ color: 'var(--text-secondary)' }}>taxa {brl(p.taxa)}</div></td>
                  {aba === 'funcionario' && (() => { const falta = Number(p.total) - Number(p.descontado || 0); return (
                    <td className="py-2 pr-3 text-right tabular-nums">{falta > 0.004
                      ? <b style={{ color: 'var(--warn-text)' }}>{brl(falta)}</b>
                      : <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--success-text, inherit)' }}><CheckCircle2 size={14} /> descontado</span>}</td>
                  ); })()}
                  <td className="py-2 pr-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{(p.por_noite ?? []).map((n) => `${dm(n.noite)} ${brl(n.v)}`).join(' · ') || '—'}</td>
                  {aba === 'parceiro' && <>
                    <td className="py-2 pr-3 text-right tabular-nums">{brl(p.permuta_valor)}<div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.permuta_tipo === 'mensal' ? 'por mês' : `uma vez, desde ${dataBr(p.permuta_inicio)}`}</div></td>
                    <td className="py-2 pr-3 text-right tabular-nums"><b style={{ color: (p.saldo ?? 0) < 0 ? 'var(--danger-text)' : 'var(--success-text, inherit)' }}>{brl(p.saldo)}</b>
                      {(p.saldo ?? 0) < 0 && <div className="text-xs" style={{ color: 'var(--danger-text)' }}>passou da permuta</div>}</td>
                  </>}
                  <td className="py-2 text-right"><Button tamanho="sm" variante="discreto" onClick={(e) => { e.stopPropagation(); setEditando(p); }}>{aba === 'nao_identificado' ? 'Marcar' : 'Editar'}</Button></td>
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

      {aberto && !editando && <Cartao pessoa={aberto} mesInicial={mes} onFechar={() => setAberto(null)} onMudou={() => void carregar()}
        onEditar={() => setEditando(aberto)} />}
      {editando && <Classificar pessoa={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); setAberto(null); void carregar(); }} />}
    </div>
  );
};

/** Cartão da pessoa: tudo o que ela consumiu com bônus, mês a mês, e o "já descontado". */
const Cartao: React.FC<{ pessoa: Pessoa; mesInicial: string; onFechar: () => void; onMudou: () => void; onEditar: () => void }> = ({ pessoa, mesInicial, onFechar, onMudou, onEditar }) => {
  const [mes, setMes] = useState(mesInicial);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_bonus_pessoa', { p_id: pessoa.id, p_mes: `${mes}-01` });
    if (error) setErro(error.message); else { setErro(null); setFicha(data as Ficha); }
  }, [pessoa.id, mes]);
  useEffect(() => { void carregar(); }, [carregar]);

  const trs = ficha?.transacoes ?? [];
  const total = trs.reduce((t, x) => t + Number(x.consumo) + Number(x.taxa), 0);
  const desc = trs.filter((x) => x.descontado_em).reduce((t, x) => t + Number(x.consumo) + Number(x.taxa), 0);
  const falta = total - desc;
  const podeDescontar = (ficha?.tipo ?? pessoa.tipo) === 'funcionario';

  const marcar = async (ids: number[], valor: boolean) => {
    if (!ids.length) return;
    setSalvando(true);
    const { error } = await supabase.rpc('fn_bonus_descontar', { p_ids: ids, p_descontado: valor });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    await carregar(); onMudou();
  };

  const tipo = ficha?.tipo ?? pessoa.tipo;
  return (
    <Modal aberto onFechar={onFechar} titulo={ficha?.nome ?? pessoa.nome} largura="lg"
      descricao={`${TIPOS[tipo].nome}${ficha?.colaborador ? ` · cadastro: ${ficha.colaborador}` : ''}${tipo === 'parceiro' && ficha?.permuta_valor ? ` · permuta ${brl(ficha.permuta_valor)} ${ficha.permuta_tipo === 'mensal' ? 'por mês' : `uma vez, desde ${dataBr(ficha.permuta_inicio)}`}` : ''}`}
      rodape={<div className="flex flex-wrap gap-2 justify-between w-full">
        <Button variante="discreto" onClick={onEditar}>{tipo === 'nao_identificado' ? 'Marcar quem é' : 'Editar cadastro'}</Button>
        <Button variante="secundario" onClick={onFechar}>Fechar</Button>
      </div>}>
      <div className="space-y-4">
        {ficha?.obs && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{ficha.obs}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SetasMes mes={mes} onMudar={setMes} />
          {podeDescontar && trs.length > 0 && (falta > 0.004
            ? <Button tamanho="sm" icone={<CheckCircle2 size={14} />} carregando={salvando} onClick={() => marcar(trs.filter((x) => !x.descontado_em).map((x) => x.id), true)}>Marcar o mês todo como descontado</Button>
            : <Button tamanho="sm" variante="discreto" carregando={salvando} onClick={() => marcar(trs.map((x) => x.id), false)}>Desfazer o descontado do mês</Button>)}
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <KPICard rotulo="Bônus no mês" valor={brl(total)} detalhe={`${trs.length} consumo(s)`} tom="destaque" />
          {podeDescontar && <KPICard rotulo="Já descontado" valor={brl(desc)} />}
          {podeDescontar && <KPICard rotulo="Falta descontar" valor={brl(falta)} tom={falta > 0.004 ? 'alerta' : 'normal'} />}
        </div>

        {erro && <p className="text-sm" style={{ color: 'var(--danger-text)' }}>{erro}</p>}
        {!ficha && !erro ? <p className="text-sm">Carregando…</p> : trs.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum bônus em {nomeMes(mes)}.</p>
        ) : (
          <ul className="space-y-2">{trs.map((t) => (
            <li key={t.id} className="rounded-lg p-3" style={{ border: '1px solid var(--border)', opacity: t.descontado_em ? 0.7 : 1 }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <b>{hora(t.data, t.noite)}</b>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t.mesa ? ` · Mesa ${t.mesa}` : ''}{t.garcom ? ` · ${t.garcom}` : ''}{t.cartao && t.cartao.toLowerCase() !== (ficha?.nome ?? '').toLowerCase() ? ` · cartão: ${t.cartao}` : ''}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  <b>{brl(Number(t.consumo) + Number(t.taxa))}</b>
                  {Number(t.taxa) > 0 && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>com taxa {brl(t.taxa)}</div>}
                </div>
              </div>
              {t.itens?.length ? (
                <ul className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {t.itens.map((i, k) => <li key={k} className="flex justify-between gap-2"><span>{i.q > 1 ? `${i.q}× ` : ''}{i.p}</span><span className="tabular-nums">{brl(i.v)}</span></li>)}
                </ul>
              ) : <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Produtos não vieram da ZIG.</p>}
              {podeDescontar && (
                <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!t.descontado_em} disabled={salvando} onChange={(e) => marcar([t.id], e.target.checked)} />
                  {t.descontado_em ? <span>Já descontado{t.descontado_por ? ` (${t.descontado_por.split(' ')[0]}, ${dataBr(t.descontado_em)})` : ''}</span> : <span>Já descontado</span>}
                </label>
              )}
            </li>
          ))}</ul>
        )}

        {(ficha?.meses?.length ?? 0) > 1 && (
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Outros meses</p>
            <div className="flex flex-wrap gap-2">{ficha!.meses.map((m) => {
              const mm = m.mes.slice(0, 7); const f = Number(m.total) - Number(m.descontado);
              return (
                <button key={mm} type="button" onClick={() => setMes(mm)} className="rounded-lg px-2 py-1 text-xs text-left"
                  style={{ border: `1px solid ${mm === mes ? 'var(--accent, var(--border))' : 'var(--border)'}`, color: 'var(--text-primary)' }}>
                  <b>{MESES[Number(mm.slice(5, 7)) - 1].slice(0, 3)}/{mm.slice(2, 4)}</b> {brl(m.total)}
                  {podeDescontar && (f > 0.004 ? <Badge variant="warning" className="ml-1">falta {brl(f)}</Badge> : <Badge variant="success" className="ml-1">ok</Badge>)}
                </button>
              );
            })}</div>
          </div>
        )}
      </div>
    </Modal>
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
