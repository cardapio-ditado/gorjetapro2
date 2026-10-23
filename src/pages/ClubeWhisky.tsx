import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Archive, Check, Clock, MessageCircle, Plus, RefreshCw, Search, Wine, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Badge, Button, Chip, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Toolbar } from '../components/ui';
import {
  BadgeSituacao, cpfFmt, dataBR, diasPara, MudarNivel, nomeGarrafa, NovaGarrafa, rotuloNivel, situacao, temTelefone, urlZap,
  type Garrafa, type Situacao,
} from '../components/clube/shared';

/**
 * Clube do Whisky: as garrafas que os clientes compraram e deixaram guardadas.
 * Vale 6 meses; o cliente é avisado no WhatsApp com 30 e 7 dias (automático,
 * função clube-whisky-avisos). Vencida, a garrafa fica para a casa.
 */

type Filtro = 'ativas' | 'vence_30' | 'vence_7' | 'vencida' | 'encerradas' | 'todas';
interface Aviso { garrafa_id: string; tipo: '30d' | '7d'; status: 'enviando' | 'enviado' | 'falha'; erro: string | null; atualizado_em: string }
interface Historico { id: number; tipo: string; nivel_antes: string | null; nivel_depois: string | null; texto: string | null; por_nome: string | null; criado_em: string }

const noFiltro = (s: Situacao, f: Filtro) =>
  f === 'todas' ? true
    : f === 'ativas' ? ['ativa', 'vence_30', 'vence_7'].includes(s)
    : f === 'encerradas' ? s === 'finalizada' || s === 'cancelada'
    : s === f;

const ClubeWhisky: React.FC = () => {
  const [garrafas, setGarrafas] = useState<Garrafa[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('ativas');
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);
  const [ficha, setFicha] = useState<Garrafa | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    const [g, a] = await Promise.all([
      supabase.from('clube_whisky_garrafas').select('*').order('validade'),
      supabase.from('clube_whisky_avisos').select('garrafa_id, tipo, status, erro, atualizado_em'),
    ]);
    if (g.error) setErro(g.error.message);
    else { setGarrafas((g.data || []) as Garrafa[]); setAvisos((a.data || []) as Aviso[]); }
    setCarregando(false);
  };
  useEffect(() => { void carregar(); }, []);
  useEffect(() => { if (ficha) setFicha(garrafas.find(x => x.id === ficha.id) || null); }, [garrafas]);

  const conta = useMemo(() => {
    const c: Record<Filtro, number> = { ativas: 0, vence_30: 0, vence_7: 0, vencida: 0, encerradas: 0, todas: garrafas.length };
    for (const g of garrafas) {
      const s = situacao(g);
      (['ativas', 'vence_30', 'vence_7', 'vencida', 'encerradas'] as Filtro[]).forEach(f => { if (noFiltro(s, f)) c[f]++; });
    }
    return c;
  }, [garrafas]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const td = t.replace(/\D/g, '');
    return garrafas.filter(g => noFiltro(situacao(g), filtro) && (!t ||
      `${g.nome} ${g.garrafa_nome} ${g.etiqueta || ''}`.toLowerCase().includes(t) || (td.length >= 3 && (g.cpf || '').includes(td))));
  }, [garrafas, filtro, busca]);

  const avisosDe = (id: string) => avisos.filter(a => a.garrafa_id === id);
  const onMudou = async (m: string) => { setAviso(m); await carregar(); };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader caminho={['Clientes e Parceiros', 'Clube do Whisky']} title="Clube do Whisky"
        subtitle="Garrafas guardadas dos clientes. Valem 6 meses; o cliente recebe aviso no WhatsApp com 30 e 7 dias. Vencida, fica para a casa."
        actions={<div className="flex items-center gap-2">
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
          <Button variante="primario" icone={<Plus size={16} />} onClick={() => setNova(true)}>Nova garrafa</Button>
        </div>} />

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard rotulo="garrafas guardadas" valor={conta.ativas} detalhe="ativas no clube" onClick={() => setFiltro('ativas')} />
        <KPICard rotulo="vencem em 30 dias" valor={conta.vence_30} detalhe="aviso de 30 dias" tom={conta.vence_30 ? 'atencao' : 'normal'} onClick={() => setFiltro('vence_30')} />
        <KPICard rotulo="vencem em 7 dias" valor={conta.vence_7} detalhe="aviso de 7 dias" tom={conta.vence_7 ? 'alerta' : 'normal'} onClick={() => setFiltro('vence_7')} />
        <KPICard rotulo="vencidas" valor={conta.vencida} detalhe="ficam para a casa: encerrar" tom={conta.vencida ? 'atencao' : 'normal'} onClick={() => setFiltro('vencida')} />
      </div>

      <Toolbar className="mb-3">
        <div className="flex flex-wrap gap-2">
          <Chip ligado={filtro === 'ativas'} onMudar={() => setFiltro('ativas')}>Ativas {conta.ativas}</Chip>
          <Chip ligado={filtro === 'vence_30'} onMudar={() => setFiltro('vence_30')} tom="atencao">30 dias {conta.vence_30}</Chip>
          <Chip ligado={filtro === 'vence_7'} onMudar={() => setFiltro('vence_7')} tom="perigo">7 dias {conta.vence_7}</Chip>
          <Chip ligado={filtro === 'vencida'} onMudar={() => setFiltro('vencida')}>Vencidas {conta.vencida}</Chip>
          <Chip ligado={filtro === 'encerradas'} onMudar={() => setFiltro('encerradas')}>Acabaram ou encerradas {conta.encerradas}</Chip>
          <Chip ligado={filtro === 'todas'} onMudar={() => setFiltro('todas')}>Todas {conta.todas}</Chip>
        </div>
        <Toolbar.Espaco />
        <div className="relative" style={{ minWidth: 240 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder="Nome, CPF, garrafa ou etiqueta" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </Toolbar>

      <SectionCard noPadding>
        {carregando && !garrafas.length ? <p className="t-body px-5 py-8" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
          : visiveis.length === 0 ? (
            <EmptyState icon={Wine} compact variant={garrafas.length ? 'filtered' : 'empty'}
              title={garrafas.length ? 'Nenhuma garrafa com esse filtro' : 'Nenhuma garrafa no clube ainda'}
              description={garrafas.length ? 'Troque o filtro ou a busca.' : 'Cadastre a primeira pelo botão Nova garrafa.'}
              action={garrafas.length ? { label: 'Ver todas', onClick: () => { setFiltro('todas'); setBusca(''); } } : { label: 'Nova garrafa', onClick: () => setNova(true) }} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-4 py-2.5 text-left">Cliente</th>
                    <th className="px-4 py-2.5 text-left">Garrafa</th>
                    <th className="px-4 py-2.5 text-left">Resta</th>
                    <th className="px-4 py-2.5 text-left">Vale até</th>
                    <th className="px-4 py-2.5 text-left">Situação</th>
                    <th className="px-4 py-2.5 text-left">Avisos</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(g => {
                    const dias = diasPara(g.validade);
                    const av = avisosDe(g.id);
                    return (
                      <tr key={g.id} className="cursor-pointer transition-colors hover:bg-white/[0.04]" style={{ borderBottom: '1px solid var(--border-subtle)' }} onClick={() => setFicha(g)}>
                        <td className="px-4 py-3">
                          <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{g.nome}</p>
                          <p className="t-caption" style={{ margin: 0 }}>{[g.cpf && cpfFmt(g.cpf), g.telefone].filter(Boolean).join(' · ') || 'sem CPF e telefone'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="t-body" style={{ margin: 0 }}>{nomeGarrafa(g.garrafa_nome)}</p>
                          <p className="t-caption" style={{ margin: 0 }}>{g.etiqueta ? `etiqueta ${g.etiqueta} · ` : ''}comprada {dataBR(g.data_compra)}</p>
                        </td>
                        <td className="px-4 py-3 t-body">{rotuloNivel(g.nivel)}</td>
                        <td className="px-4 py-3">
                          <p className="t-body num" style={{ margin: 0, textAlign: 'left' }}>{dataBR(g.validade)}</p>
                          {g.status === 'ativa' && <p className={`t-caption ${dias < 0 ? '' : dias <= 7 ? 'texto-perigo' : dias <= 30 ? 'texto-atencao' : ''}`} style={{ margin: 0 }}>
                            {dias < 0 ? `venceu há ${-dias} dia${dias === -1 ? '' : 's'}` : dias === 0 ? 'vence hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`}
                          </p>}
                        </td>
                        <td className="px-4 py-3"><BadgeSituacao g={g} /></td>
                        <td className="px-4 py-3">
                          {!g.aceita_whatsapp ? <span className="t-caption">não aceita</span>
                            : !av.length ? <span className="t-caption">—</span>
                            : <div className="flex gap-1">{av.map(a => (
                              <Badge key={a.tipo} variant={a.status === 'enviado' ? 'success' : a.status === 'falha' ? 'danger' : 'neutral'}>{a.tipo === '30d' ? '30 dias' : '7 dias'}{a.status === 'falha' ? ' falhou' : ''}</Badge>
                            ))}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      {nova && <NovaGarrafa onFechar={() => setNova(false)} onFeito={async m => { setNova(false); await onMudou(m); }} />}
      {ficha && <Ficha g={ficha} avisos={avisosDe(ficha.id)} onFechar={() => setFicha(null)} onMudou={onMudou} onErro={setErro} />}
    </div>
  );
};

const Ficha: React.FC<{ g: Garrafa; avisos: Aviso[]; onFechar: () => void; onMudou: (m: string) => Promise<void>; onErro: (m: string) => void }> = ({ g, avisos, onFechar, onMudou, onErro }) => {
  const [hist, setHist] = useState<Historico[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [validade, setValidade] = useState(g.validade);
  const [telefone, setTelefone] = useState(g.telefone || '');
  const [etiqueta, setEtiqueta] = useState(g.etiqueta || '');
  const [aceita, setAceita] = useState(g.aceita_whatsapp);
  const [ocupado, setOcupado] = useState(false);
  const s = situacao(g);

  useEffect(() => {
    supabase.from('clube_whisky_historico').select('*').eq('garrafa_id', g.id).order('criado_em', { ascending: false })
      .then(({ data }) => setHist((data || []) as Historico[]));
  }, [g.id, g.nivel, g.status, g.validade]);

  const salvar = async (mudanca: Partial<Garrafa>, msg: string) => {
    setOcupado(true);
    const { error } = await supabase.from('clube_whisky_garrafas').update(mudanca).eq('id', g.id);
    setOcupado(false);
    if (error) { onErro(error.message); return false; }
    await onMudou(msg);
    return true;
  };

  const encerrar = async () => {
    if (!window.confirm(`Encerrar a garrafa de ${nomeGarrafa(g.garrafa_nome)} de ${g.nome}? ${s === 'vencida' ? 'Ela venceu e fica para a casa.' : 'Ela sai do clube.'}`)) return;
    await salvar({ status: 'cancelada' }, `Garrafa de ${g.nome} encerrada${s === 'vencida' ? ': ficou para a casa' : ''}.`);
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" titulo={`${nomeGarrafa(g.garrafa_nome)} · ${g.nome}`}
      descricao={[g.cpf && `CPF ${cpfFmt(g.cpf)}`, g.telefone, g.etiqueta && `etiqueta ${g.etiqueta}`, `comprada ${dataBR(g.data_compra)}`, `cadastrada por ${g.criado_por_nome || '—'}`].filter(Boolean).join(' · ')}
      rodape={<>
        {temTelefone(g.telefone) && <Button icone={<MessageCircle size={14} />} onClick={() => window.open(urlZap(g), '_blank', 'noopener')}>Mandar WhatsApp</Button>}
        {(g.status === 'ativa') && <Button variante="discreto" icone={<Archive size={14} />} onClick={encerrar} disabled={ocupado}>{s === 'vencida' ? 'Encerrar: ficou para a casa' : 'Encerrar'}</Button>}
      </>}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <BadgeSituacao g={g} />
        <span className="t-body">Vale até <strong>{dataBR(g.validade)}</strong></span>
        {g.status === 'ativa' && <span className="t-caption">{(() => { const d = diasPara(g.validade); return d < 0 ? `venceu há ${-d} dias` : d === 0 ? 'vence hoje' : `faltam ${d} dias`; })()}</span>}
      </div>

      {g.status !== 'cancelada' && (
        <div className="mb-4">
          <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>Quanto resta na garrafa</p>
          <MudarNivel g={g} onMudou={onMudou} onErro={onErro} />
        </div>
      )}

      {!editando ? (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="t-body"><MessageCircle size={14} className="inline mr-1" />{g.aceita_whatsapp ? 'Recebe aviso no WhatsApp (30 e 7 dias).' : 'Não recebe aviso no WhatsApp.'}</span>
          <Button tamanho="sm" variante="discreto" onClick={() => setEditando(true)}>Editar dados</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 p-3" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          <Input rotulo="WhatsApp" value={telefone} onChange={e => setTelefone(e.target.value)} />
          <Input rotulo="Etiqueta" value={etiqueta} onChange={e => setEtiqueta(e.target.value)} />
          <Input rotulo="Vale até" type="date" value={validade} onChange={e => setValidade(e.target.value)} />
          <label className="md:col-span-3 flex items-center gap-2 t-body"><input type="checkbox" checked={aceita} onChange={e => setAceita(e.target.checked)} /> Aceita aviso no WhatsApp</label>
          <div className="md:col-span-3 flex justify-end gap-2">
            <Button tamanho="sm" icone={<X size={14} />} onClick={() => setEditando(false)}>Voltar</Button>
            <Button tamanho="sm" variante="primario" icone={<Check size={14} />} carregando={ocupado} onClick={async () => {
              if (aceita && !temTelefone(telefone)) { onErro('Para avisar no WhatsApp precisa do telefone com DDD.'); return; }
              if (await salvar({ telefone: telefone.trim() || null, etiqueta: etiqueta.trim() || null, validade, aceita_whatsapp: aceita }, `Dados de ${g.nome} atualizados.`)) setEditando(false);
            }}>Salvar</Button>
          </div>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {avisos.map(a => (
            <Badge key={a.tipo} variant={a.status === 'enviado' ? 'success' : a.status === 'falha' ? 'danger' : 'neutral'}>
              Aviso {a.tipo === '30d' ? '30' : '7'} dias: {a.status === 'enviado' ? `enviado ${dayjs(a.atualizado_em).format('DD/MM')}` : a.status === 'falha' ? 'falhou' : 'enviando'}
            </Badge>
          ))}
        </div>
      )}

      <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}><Clock size={13} className="inline mr-1" />Histórico</p>
      {hist === null ? <p className="t-caption">Carregando…</p> : (
        <div className="flex flex-col" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          {hist.map(h => (
            <div key={h.id} className="px-3 py-2 flex flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="t-caption num" style={{ minWidth: 92, textAlign: 'left' }}>{dayjs(h.criado_em).format('DD/MM/YY HH:mm')}</span>
              <span className="t-body flex-1" style={{ margin: 0 }}>
                {h.tipo === 'nivel' ? `Resta: ${rotuloNivel(h.nivel_antes as Garrafa['nivel'])} → ${rotuloNivel(h.nivel_depois as Garrafa['nivel'])}`
                  : h.tipo === 'status' ? `Situação: ${(h.texto || '').replace('cancelada', 'encerrada').replace('finalizada', 'acabou')}`
                  : h.tipo === 'validade' ? `Validade: ${h.texto}` : (h.texto || '').replace('vale ate', 'vale até')}
              </span>
              <span className="t-caption">{h.por_nome}</span>
            </div>
          ))}
        </div>
      )}
      {g.observacoes && <p className="t-caption mt-3" style={{ margin: 0 }}><strong>Observações:</strong> {g.observacoes}</p>}
    </Modal>
  );
};

export default ClubeWhisky;
