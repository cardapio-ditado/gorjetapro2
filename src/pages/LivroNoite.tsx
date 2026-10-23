import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { BookOpen, Camera, Check, ChevronLeft, ChevronRight, FileDown, Lock, Plus, RefreshCw, Search, Trash2, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import {
  Badge, Button, Chip, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select, Textarea,
} from '../components/ui';
import {
  Adendo, brl, CaixaMov, Carga, comprimirFoto, dataCurta, dataLonga, Fotos, FORMAS, Gravidade, GRAVIDADES, hora, MOVIMENTOS, Noite,
  noiteAgora, nomeSetor, nomeTipo, num, numTexto, OcorrenciaL, pdfDaNoite, Pendencia, refReserva, rotuloForma, rotuloMovimento, Setor, SETORES, Tipo, TIPOS,
} from '../components/livro/shared';

/**
 * Livro da Noite. O gerente do turno abre, preenche durante a noite e fecha
 * no fim; fechado, só entra adendo. Caixa e pagamentos aqui são informativos:
 * nada vai para o Financeiro.
 */

type Aba = 'livro' | 'historico';
const gravVariante = (g: Gravidade) => GRAVIDADES.find(x => x.id === g)?.variante || 'neutral';
const gravNome = (g: Gravidade) => GRAVIDADES.find(x => x.id === g)?.nome || g;

const LivroNoite: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [aba, setAba] = useState<Aba>('livro');
  const [data, setData] = useState(() => params.get('data') || noiteAgora());
  const [carga, setCarga] = useState<Carga | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = async (criar = false) => {
    setCarregando(true);
    const { data: r, error } = await supabase.rpc('fn_livro_carregar', { p_data: data, p_criar: criar });
    if (error) setErro(error.message); else { setErro(null); setCarga(r as Carga); }
    setCarregando(false);
  };
  useEffect(() => { void carregar(); }, [data]);
  useEffect(() => { setParams(p => { const n = new URLSearchParams(p); n.set('data', data); return n; }, { replace: true }); }, [data]);

  /** Roda uma gravação, mostra o erro do banco e recarrega o livro. */
  const gravar = async (fn: () => PromiseLike<{ error: { message: string } | null }>, msg?: string): Promise<boolean> => {
    setErro(null);
    const { error } = await fn();
    if (error) { setErro(error.message); return false; }
    if (msg) setAviso(msg); else setAviso(null);
    await carregar();
    return true;
  };

  const noite = carga?.noite || null;
  const editavel = noite?.status === 'aberto';
  const atual = carga?.noite_atual || noiteAgora();
  const podeAbrir = !noite && data <= atual && data >= dayjs(atual).subtract(7, 'day').format('YYYY-MM-DD');

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader caminho={['Operação', 'Livro da Noite']} title="Livro da Noite"
        subtitle="O que aconteceu na noite, setor por setor, o caixa e os pagamentos. Caixa e pagamentos são só informativos: não vão para o Financeiro."
        actions={<div className="flex items-center gap-2">
          {aba === 'livro' && noite && <Button tamanho="sm" icone={<FileDown size={14} />} onClick={() => carga && pdfDaNoite(carga)}>PDF</Button>}
          <IconButton aria-label="Atualizar" onClick={() => carregar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Segmented<Aba> rotulo="Visão" valor={aba} onMudar={setAba} opcoes={[{ valor: 'livro', rotulo: 'Livro' }, { valor: 'historico', rotulo: 'Histórico' }]} />
        {aba === 'livro' && (
          <div className="flex items-center gap-2 ml-auto">
            <IconButton aria-label="Noite anterior" onClick={() => setData(dayjs(data).subtract(1, 'day').format('YYYY-MM-DD'))}><ChevronLeft size={16} /></IconButton>
            <span className="t-subsec" style={{ minWidth: 190, textAlign: 'center' }}>{dataLonga(data)}</span>
            <IconButton aria-label="Próxima noite" onClick={() => setData(dayjs(data).add(1, 'day').format('YYYY-MM-DD'))} disabled={data >= atual}><ChevronRight size={16} /></IconButton>
            {data !== atual && <Button tamanho="sm" variante="discreto" onClick={() => setData(atual)}>Esta noite</Button>}
          </div>
        )}
      </div>

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      {aba === 'historico' && <Historico onAbrir={d => { setData(d); setAba('livro'); }} />}

      {aba === 'livro' && (
        carga === null ? <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando o livro…</p>
          : !noite ? (
            <SectionCard>
              <EmptyState icon={BookOpen} title={podeAbrir ? 'O livro desta noite ainda não foi aberto' : 'Não há livro desta noite'}
                description={podeAbrir ? 'Abra para começar a registrar. Quem abre fica como gerente do turno.' : 'Só dá para abrir o livro das últimas 7 noites.'}
                action={podeAbrir ? { label: 'Abrir o livro', onClick: () => carregar(true) } : undefined} />
              {carga.pendencias.length > 0 && <div className="mt-4"><Pendencias lista={carga.pendencias} onResolver={async (id, texto) => gravar(() => supabase.from('livro_ocorrencias').update({ status_pendencia: 'resolvida', resolucao: texto }).eq('id', id), 'Pendência resolvida.')} /></div>}
            </SectionCard>
          ) : <Livro carga={carga} noite={noite} editavel={!!editavel} gravar={gravar} setErro={setErro} setAviso={setAviso} />
      )}
    </div>
  );
};

// ── O livro de uma noite ───────────────────────────────────────────────────
interface LivroProps {
  carga: Carga; noite: Noite; editavel: boolean;
  gravar: (fn: () => PromiseLike<{ error: { message: string } | null }>, msg?: string) => Promise<boolean>;
  setErro: (m: string | null) => void; setAviso: (m: string | null) => void;
}

const Livro: React.FC<LivroProps> = ({ carga, noite, editavel, gravar, setErro, setAviso }) => {
  const [formOcorrencia, setFormOcorrencia] = useState<{ setor: Setor; editar?: OcorrenciaL } | null>(null);
  const respondidos = SETORES.filter(s => carga.ocorrencias.some(o => o.setor === s.id) || carga.setores.some(x => x.setor === s.id)).length;
  const graves = carga.ocorrencias.filter(o => o.gravidade === 'grave').length;
  const caixaOk = noite.fundo_troco !== null && noite.dinheiro_entrada !== null && noite.dinheiro_contado !== null;
  const atualizarNoite = (campos: Partial<Noite>, msg?: string) => gravar(() => supabase.from('livro_noites').update(campos).eq('id', noite.id), msg);

  const resolver = (id: string, texto: string) => gravar(() => supabase.from('livro_ocorrencias').update({ status_pendencia: 'resolvida', resolucao: texto }).eq('id', id), 'Pendência resolvida.');

  return (
    <div className="flex flex-col gap-4">
      {/* Situação do livro */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard rotulo="gerente do turno" valor={(noite.gerente_nome || '—').split(' ')[0]} detalhe={noite.status === 'fechado' ? `fechou ${dayjs(noite.fechado_em).format('DD/MM HH:mm')}` : 'livro aberto'} tom={noite.status === 'fechado' ? 'certo' : 'normal'} />
        <KPICard rotulo="setores respondidos" valor={`${respondidos}/${SETORES.length}`} detalhe={respondidos === SETORES.length ? 'todos' : 'faltam responder'} tom={respondidos === SETORES.length ? 'certo' : 'atencao'} />
        <KPICard rotulo="ocorrências" valor={carga.ocorrencias.length} detalhe={graves ? `${graves} grave${graves === 1 ? '' : 's'}` : 'nenhuma grave'} tom={graves ? 'alerta' : 'normal'} />
        <KPICard rotulo="movimento" valor={rotuloMovimento(noite.movimento)} detalhe={carga.zig_total ? `Zig: ${brl(carga.zig_total)}` : 'Zig chega na manhã seguinte'} tom="destaque" />
      </div>

      {carga.pendencias.length > 0 && <Pendencias lista={carga.pendencias} onResolver={resolver} />}

      <Cabecalho carga={carga} noite={noite} editavel={editavel} atualizar={atualizarNoite} gravar={gravar} />

      <SectionCard noPadding title="Setor por setor" descricao="Cada setor: sem ocorrências (um toque) ou o que aconteceu.">
        {SETORES.map(s => {
          const ocs = carga.ocorrencias.filter(o => o.setor === s.id);
          const ok = carga.setores.find(x => x.setor === s.id);
          return (
            <div key={s.id} className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="t-body flex-1" style={{ fontWeight: 600, minWidth: 140 }}>{s.nome}</span>
                {ocs.length > 0 ? <Badge variant="warning">{ocs.length} ocorrência{ocs.length === 1 ? '' : 's'}</Badge>
                  : ok ? <Badge variant="success">Sem ocorrências</Badge> : <Badge variant="neutral">Sem resposta</Badge>}
                {editavel && <>
                  {!ocs.length && !ok && <Button tamanho="sm" icone={<Check size={14} />} onClick={() => gravar(() => supabase.from('livro_setores').insert({ noite_id: noite.id, setor: s.id }))}>Sem ocorrências</Button>}
                  {ok && !ocs.length && <Button tamanho="sm" variante="discreto" onClick={() => gravar(() => supabase.from('livro_setores').delete().eq('id', ok.id))}>Desfazer</Button>}
                  <Button tamanho="sm" variante="primario" icone={<Plus size={14} />} onClick={() => setFormOcorrencia({ setor: s.id })}>Ocorrência</Button>
                </>}
              </div>
              {ocs.map(o => (
                <div key={o.id} className="mt-2 p-3" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={gravVariante(o.gravidade)}>{gravNome(o.gravidade)}</Badge>
                    <Badge variant="neutral">{nomeTipo(o.tipo)}</Badge>
                    {o.precisa_providencia && <Badge variant={o.status_pendencia === 'resolvida' ? 'success' : 'wine'}>{o.status_pendencia === 'resolvida' ? 'Providência feita' : 'Precisa de providência'}</Badge>}
                    <span className="t-caption ml-auto">{dayjs(o.criado_em).format('HH:mm')} · {o.criado_por_nome || ''}</span>
                    {editavel && <>
                      <Button tamanho="sm" variante="discreto" onClick={() => setFormOcorrencia({ setor: o.setor, editar: o })}>Editar</Button>
                      <IconButton aria-label="Apagar ocorrência" tom="perigo" onClick={() => { if (window.confirm('Apagar esta ocorrência?')) void gravar(() => supabase.from('livro_ocorrencias').delete().eq('id', o.id)); }}><Trash2 size={14} /></IconButton>
                    </>}
                  </div>
                  <p className="t-body" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{o.texto}</p>
                  {o.envolvidos && <p className="t-caption" style={{ margin: '4px 0 0' }}>Envolvidos: {o.envolvidos}</p>}
                  {o.precisa_providencia && <p className="t-caption" style={{ margin: '4px 0 0' }}>Responsável: {o.responsavel || '—'}{o.prazo ? ` · prazo ${dataCurta(o.prazo)}` : ''}{o.status_pendencia === 'resolvida' ? ` · resolvida por ${o.resolvida_por_nome || '—'}: ${o.resolucao || ''}` : ''}</p>}
                  <Fotos caminhos={o.fotos} />
                </div>
              ))}
            </div>
          );
        })}
      </SectionCard>

      <Caixa carga={carga} noite={noite} editavel={editavel} atualizar={atualizarNoite} gravar={gravar} />
      <Pagamentos carga={carga} noite={noite} editavel={editavel} gravar={gravar} />

      <SectionCard title="Recado para o próximo turno" descricao="O que quem abre a casa amanhã precisa saber.">
        <RecadoCampo valor={noite.recado || ''} disabled={!editavel} onSalvar={t => atualizarNoite({ recado: t.trim() || null })} />
      </SectionCard>

      <Fechamento carga={carga} noite={noite} respondidos={respondidos} caixaOk={caixaOk} gravar={gravar} setErro={setErro} setAviso={setAviso} />

      {formOcorrencia && <FormOcorrencia noite={noite} inicial={formOcorrencia} onFechar={() => setFormOcorrencia(null)}
        onFeito={async m => { setFormOcorrencia(null); await gravar(async () => ({ error: null }), m); }} />}
    </div>
  );
};

// ── Cabeçalho: atração, equipe, reservas ───────────────────────────────────
const Cabecalho: React.FC<{ carga: Carga; noite: Noite; editavel: boolean; atualizar: (c: Partial<Noite>) => Promise<boolean>; gravar: LivroProps['gravar'] }> = ({ carga, noite, editavel, atualizar, gravar }) => {
  const escala = carga.portal.escala.filter(e => !e.folga);
  const reservas = carga.portal.reservas;
  const marca = (nome: string, situacao: 'faltou' | 'atrasou' | 'saiu_cedo') => {
    const atual = carga.presenca.find(p => p.nome === nome);
    if (atual?.situacao === situacao) return gravar(() => supabase.from('livro_presenca').delete().eq('id', atual.id));
    if (atual) return gravar(() => supabase.from('livro_presenca').update({ situacao }).eq('id', atual.id));
    return gravar(() => supabase.from('livro_presenca').insert({ noite_id: noite.id, nome, situacao }));
  };
  const reserva = (ref: string, situacao: 'veio' | 'nao_veio') => {
    const atual = carga.reservas_status.find(r => r.referencia === ref);
    if (atual?.situacao === situacao) return gravar(() => supabase.from('livro_reservas').delete().eq('id', atual.id));
    if (atual) return gravar(() => supabase.from('livro_reservas').update({ situacao }).eq('id', atual.id));
    return gravar(() => supabase.from('livro_reservas').insert({ noite_id: noite.id, referencia: ref, situacao }));
  };
  const rotuloSit = { faltou: 'Faltou', atrasou: 'Atrasou', saiu_cedo: 'Saiu cedo' } as const;
  return (
    <SectionCard title="A noite" descricao={[...carga['portal']['cachê_noite'].map(m => `${m.nome}${m.inicio ? ` ${hora(m.inicio)}` : ''}`), ...carga.eventos.map(e => `Evento: ${e.nome}`)].join(' · ') || 'Sem atração ou evento lançado'}>
      <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>Movimento da casa</p>
      <div style={{ opacity: editavel ? 1 : 0.7, pointerEvents: editavel ? undefined : 'none' }}>
        <Segmented<string> rotulo="Movimento" valor={noite.movimento || ''} onMudar={v => atualizar({ movimento: v as Noite['movimento'] })}
          opcoes={MOVIMENTOS.map(m => ({ valor: m.valor as string, rotulo: m.rotulo }))} />
      </div>

      <p className="t-label mt-5 mb-2" style={{ color: 'var(--text-secondary)' }}>Equipe da escala ({escala.length}): marque quem faltou, atrasou ou saiu cedo</p>
      {escala.length === 0 ? <p className="t-caption">Escala não lançada para esta noite.</p> : (
        <div className="flex flex-col" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          {escala.map(e => {
            const p = carga.presenca.find(x => x.nome === e.nome);
            return (
              <div key={`${e.nome}-${e.setor}`} className="px-3 py-1.5 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="t-body flex-1" style={{ minWidth: 150 }}>{e.nome} <span className="t-caption">{e.funcao || e.setor}{e.horario ? ` · ${e.horario}` : ''}</span></span>
                {(['faltou', 'atrasou', 'saiu_cedo'] as const).map(s => (
                  <Chip key={s} ligado={p?.situacao === s} onMudar={() => editavel && marca(e.nome, s)} tom={s === 'faltou' ? 'perigo' : 'atencao'}>{rotuloSit[s]}</Chip>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {carga.extras.length > 0 && <p className="t-caption mt-2">Extras da noite: {carga.extras.map(x => `${x.nome} (${x.funcao}${x.presenca === 'faltou' ? ', faltou' : x.presenca === 'confirmada' ? ', chegou' : ''})`).join(' · ')}</p>}

      <p className="t-label mt-5 mb-2" style={{ color: 'var(--text-secondary)' }}>Reservas ({reservas.length})</p>
      {reservas.length === 0 ? <p className="t-caption">Nenhuma reserva para esta noite.</p> : (
        <div className="flex flex-col" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          {reservas.map(r => {
            const ref = refReserva(r);
            const st = carga.reservas_status.find(x => x.referencia === ref);
            return (
              <div key={ref} className="px-3 py-1.5 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="t-body flex-1" style={{ minWidth: 180 }}>{r.nome} <span className="t-caption">{hora(r.horario)} · {r.pessoas || '?'} pessoas{r.local ? ` · ${r.local}` : ''}</span></span>
                <Chip ligado={st?.situacao === 'veio'} onMudar={() => editavel && reserva(ref, 'veio')} tom="certo">Veio</Chip>
                <Chip ligado={st?.situacao === 'nao_veio'} onMudar={() => editavel && reserva(ref, 'nao_veio')} tom="perigo">Não veio</Chip>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

// ── Pendências de noites anteriores ────────────────────────────────────────
const Pendencias: React.FC<{ lista: Pendencia[]; onResolver: (id: string, texto: string) => Promise<boolean> }> = ({ lista, onResolver }) => {
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  return (
    <SectionCard noPadding title="Pendências de noites anteriores" descricao="Ficam aqui até alguém resolver.">
      {lista.map(p => (
        <div key={p.id} className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={gravVariante(p.gravidade)}>{gravNome(p.gravidade)}</Badge>
            <span className="t-body" style={{ fontWeight: 600 }}>{nomeSetor(p.setor)}</span>
            <span className="t-caption">de {dataCurta(p.data)} · {nomeTipo(p.tipo)}{p.criado_por_nome ? ` · ${p.criado_por_nome}` : ''}</span>
            <span className="t-caption ml-auto">{p.responsavel ? `Responsável: ${p.responsavel}` : ''}{p.prazo ? ` · prazo ${dataCurta(p.prazo)}` : ''}</span>
          </div>
          <p className="t-body" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{p.texto}</p>
          <Fotos caminhos={p.fotos} />
          {abrindo === p.id ? (
            <div className="flex flex-wrap items-end gap-2 mt-2">
              <Input rotulo="O que foi feito" value={texto} onChange={e => setTexto(e.target.value)} className="flex-1 min-w-[220px]" autoFocus />
              <Button tamanho="sm" onClick={() => setAbrindo(null)}>Voltar</Button>
              <Button tamanho="sm" variante="primario" icone={<Check size={14} />} disabled={!texto.trim()} onClick={async () => { if (await onResolver(p.id, texto.trim())) { setAbrindo(null); setTexto(''); } }}>Resolvida</Button>
            </div>
          ) : <div className="mt-2"><Button tamanho="sm" icone={<Check size={14} />} onClick={() => { setAbrindo(p.id); setTexto(''); }}>Marcar como resolvida</Button></div>}
        </div>
      ))}
    </SectionCard>
  );
};

// ── Formulário de ocorrência (com fotos) ───────────────────────────────────
const FormOcorrencia: React.FC<{ noite: Noite; inicial: { setor: Setor; editar?: OcorrenciaL }; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ noite, inicial, onFechar, onFeito }) => {
  const o = inicial.editar;
  const [setor, setSetor] = useState<Setor>(inicial.setor);
  const [tipo, setTipo] = useState<Tipo>(o?.tipo || 'outro');
  const [gravidade, setGravidade] = useState<Gravidade>(o?.gravidade || 'info');
  const [texto, setTexto] = useState(o?.texto || '');
  const [envolvidos, setEnvolvidos] = useState(o?.envolvidos || '');
  const [providencia, setProvidencia] = useState(o?.precisa_providencia || false);
  const [responsavel, setResponsavel] = useState(o?.responsavel || '');
  const [prazo, setPrazo] = useState(o?.prazo || '');
  const [fotos, setFotos] = useState<string[]>(o?.fotos || []);
  const [novas, setNovas] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const salvar = async () => {
    if (!texto.trim()) { setErro('Conte o que aconteceu.'); return; }
    if (providencia && !responsavel.trim()) { setErro('Quem vai resolver? Preencha o responsável.'); return; }
    setOcupado(true); setErro(null);
    try {
      const caminhos = [...fotos];
      for (const f of novas) {
        const blob = await comprimirFoto(f);
        const caminho = `${noite.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from('livro').upload(caminho, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        caminhos.push(caminho);
      }
      const linha = {
        setor, tipo, gravidade, texto: texto.trim(), envolvidos: envolvidos.trim() || null, fotos: caminhos,
        precisa_providencia: providencia, responsavel: providencia ? responsavel.trim() : null, prazo: providencia && prazo ? prazo : null,
      };
      const { error } = o ? await supabase.from('livro_ocorrencias').update(linha).eq('id', o.id) : await supabase.from('livro_ocorrencias').insert({ ...linha, noite_id: noite.id });
      if (error) throw error;
      await onFeito(o ? 'Ocorrência atualizada.' : `Ocorrência registrada em ${nomeSetor(setor)}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      setOcupado(false);
    }
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" travado={ocupado} titulo={o ? 'Editar ocorrência' : 'Nova ocorrência'} descricao={nomeSetor(setor)}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Salvar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="flex flex-col gap-4">
        <Select rotulo="Setor" value={setor} onChange={e => setSetor(e.target.value as Setor)}>{SETORES.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</Select>
        <div>
          <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>O que foi</p>
          <div className="flex flex-wrap gap-2">{TIPOS.map(t => <Chip key={t.id} ligado={tipo === t.id} onMudar={() => setTipo(t.id)}>{t.nome}</Chip>)}</div>
        </div>
        <div>
          <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>Gravidade</p>
          <Segmented<Gravidade> rotulo="Gravidade" valor={gravidade} onMudar={setGravidade} opcoes={GRAVIDADES.map(g => ({ valor: g.id, rotulo: g.nome }))} />
        </div>
        <Textarea rotulo="O que aconteceu" value={texto} onChange={e => setTexto(e.target.value)} rows={4} autoFocus dica="Escreva ou dite pelo teclado do celular." />
        <Input rotulo="Quem esteve envolvido" value={envolvidos} onChange={e => setEnvolvidos(e.target.value)} placeholder="Colaborador, cliente…" />
        <div>
          <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>Fotos</p>
          <Fotos caminhos={fotos} onRemover={c => setFotos(f => f.filter(x => x !== c))} />
          {novas.length > 0 && <p className="t-caption mt-1">{novas.length} foto{novas.length === 1 ? '' : 's'} para subir ao salvar.</p>}
          <label className="btn-secondary btn-sm mt-2 inline-flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <Camera size={14} /> Tirar ou escolher foto
            <input type="file" accept="image/*" multiple hidden onChange={e => { setNovas(n => [...n, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
          </label>
        </div>
        <label className="flex items-start gap-2 t-body"><input type="checkbox" checked={providencia} onChange={e => setProvidencia(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Precisa de providência (fica como pendência até alguém resolver)</span></label>
        {providencia && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input rotulo="Responsável" value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Quem vai resolver" />
            <Input rotulo="Prazo" type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
};

// ── Caixa ──────────────────────────────────────────────────────────────────
const CampoValor: React.FC<{ rotulo: string; valor: number | null; disabled: boolean; dica?: string; onSalvar: (v: number | null) => void }> = ({ rotulo, valor, disabled, dica, onSalvar }) => {
  const [t, setT] = useState(numTexto(valor));
  useEffect(() => { setT(numTexto(valor)); }, [valor]);
  return <Input rotulo={rotulo} inputMode="decimal" value={t} disabled={disabled} dica={dica} placeholder="0,00" onChange={e => setT(e.target.value)}
    onBlur={() => { const novo = t.trim() === '' ? null : num(t); if (novo !== valor) onSalvar(novo); }} />;
};

const Caixa: React.FC<{ carga: Carga; noite: Noite; editavel: boolean; atualizar: (c: Partial<Noite>) => Promise<boolean>; gravar: LivroProps['gravar'] }> = ({ carga, noite, editavel, atualizar, gravar }) => {
  const [tipo, setTipo] = useState<'sangria' | 'suprimento'>('sangria');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const cx = carga.caixa;
  const dif = cx?.diferenca ?? null;
  const add = async () => {
    const v = num(valor);
    if (v <= 0) return;
    if (await gravar(() => supabase.from('livro_caixa_movs').insert({ noite_id: noite.id, tipo, valor: v, motivo: motivo.trim() || null }))) { setValor(''); setMotivo(''); }
  };
  return (
    <SectionCard title="Fechamento do caixa (dinheiro)" descricao="Só o dinheiro físico. Informativo: não vai para o Financeiro.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CampoValor rotulo="Fundo de troco (início)" valor={noite.fundo_troco} disabled={!editavel} onSalvar={v => atualizar({ fundo_troco: v })} />
        <CampoValor rotulo="Dinheiro que entrou na noite" valor={noite.dinheiro_entrada} disabled={!editavel} onSalvar={v => atualizar({ dinheiro_entrada: v })} />
        <CampoValor rotulo="Dinheiro contado no fim" valor={noite.dinheiro_contado} disabled={!editavel} onSalvar={v => atualizar({ dinheiro_contado: v })} dica="O que tem na gaveta ao fechar." />
      </div>

      <p className="t-label mt-5 mb-2" style={{ color: 'var(--text-secondary)' }}>Sangrias e suprimentos</p>
      {carga.caixa_movs.length > 0 && (
        <div className="flex flex-col mb-3" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          {carga.caixa_movs.map((m: CaixaMov) => (
            <div key={m.id} className="px-3 py-1.5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <Badge variant={m.tipo === 'sangria' ? 'warning' : 'info'}>{m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'}</Badge>
              <span className="t-body flex-1">{m.motivo || '—'} <span className="t-caption">{dayjs(m.criado_em).format('HH:mm')} · {m.por_nome}</span></span>
              <span className="t-body num" style={{ fontWeight: 600 }}>{m.tipo === 'sangria' ? '−' : '+'}{brl(m.valor)}</span>
              {editavel && <IconButton aria-label="Apagar" tom="perigo" onClick={() => gravar(() => supabase.from('livro_caixa_movs').delete().eq('id', m.id))}><Trash2 size={14} /></IconButton>}
            </div>
          ))}
        </div>
      )}
      {editavel && (
        <div className="flex flex-wrap items-end gap-2">
          <Select rotulo="Tipo" value={tipo} onChange={e => setTipo(e.target.value as 'sangria' | 'suprimento')}><option value="sangria">Sangria (tirou do caixa)</option><option value="suprimento">Suprimento (pôs no caixa)</option></Select>
          <Input rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} style={{ maxWidth: 140 }} />
          <Input rotulo="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} className="flex-1 min-w-[160px]" placeholder="Ex.: depósito no cofre" />
          <Button icone={<Plus size={14} />} onClick={add} disabled={num(valor) <= 0}>Lançar</Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
        <Resumo r="Fundo + entrou" v={brl((noite.fundo_troco || 0) + (noite.dinheiro_entrada || 0))} />
        <Resumo r="Suprimentos − sangrias" v={brl((cx?.suprimentos || 0) - (cx?.sangrias || 0))} />
        <Resumo r="Pagamentos em dinheiro" v={brl(-(cx?.pagamentos_dinheiro || 0))} />
        <Resumo r="Esperado na gaveta" v={cx?.esperado === null || cx?.esperado === undefined ? '—' : brl(cx.esperado)} destaque />
      </div>
      {dif !== null && (
        <div className={`aviso mt-3 ${Math.abs(dif) < 0.005 ? 'aviso-certo' : 'aviso-atencao'}`}>
          {Math.abs(dif) < 0.005 ? 'Caixa conferido: o dinheiro contado bate com o esperado.' : dif > 0 ? `Sobrou ${brl(dif)} em relação ao esperado.` : `Faltou ${brl(-dif)} em relação ao esperado.`}
        </div>
      )}
      <div className="mt-3"><RecadoCampo rotulo="Observação do caixa" valor={noite.caixa_obs || ''} disabled={!editavel} onSalvar={t => atualizar({ caixa_obs: t.trim() || null })} linhas={2} /></div>
    </SectionCard>
  );
};

const Resumo: React.FC<{ r: string; v: string; destaque?: boolean }> = ({ r, v, destaque }) => (
  <div className="rounded px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
    <p className="t-caption" style={{ margin: 0 }}>{r}</p>
    <p className="t-body num" style={{ margin: 0, fontWeight: 700, textAlign: 'left', color: destaque ? 'var(--gold)' : undefined }}>{v}</p>
  </div>
);

const RecadoCampo: React.FC<{ valor: string; disabled: boolean; onSalvar: (t: string) => void; rotulo?: string; linhas?: number }> = ({ valor, disabled, onSalvar, rotulo, linhas = 3 }) => {
  const [t, setT] = useState(valor);
  useEffect(() => { setT(valor); }, [valor]);
  return <Textarea rotulo={rotulo} value={t} rows={linhas} disabled={disabled} onChange={e => setT(e.target.value)} onBlur={() => { if (t !== valor) onSalvar(t); }} placeholder={disabled ? '' : 'Escreva aqui. Salva ao sair do campo.'} />;
};

// ── Pagamentos (informativo) ───────────────────────────────────────────────
const Pagamentos: React.FC<{ carga: Carga; noite: Noite; editavel: boolean; gravar: LivroProps['gravar'] }> = ({ carga, noite, editavel, gravar }) => {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState<'dinheiro_caixa' | 'pix' | 'outro'>('dinheiro_caixa');
  const [autorizou, setAutorizou] = useState('');
  const add = async () => {
    if (!descricao.trim() || num(valor) <= 0) return;
    if (await gravar(() => supabase.from('livro_pagamentos').insert({ noite_id: noite.id, descricao: descricao.trim(), valor: num(valor), forma, autorizado_por: autorizou.trim() || null }))) { setDescricao(''); setValor(''); setAutorizou(''); }
  };
  const total = carga.pagamentos.reduce((a, p) => a + Number(p.valor), 0);
  return (
    <SectionCard title="Pagamentos feitos na noite" descricao={carga.pagamentos.length ? `${carga.pagamentos.length} pagamento${carga.pagamentos.length === 1 ? '' : 's'} · ${brl(total)}` : 'Nenhum pagamento lançado'}>
      <div className="aviso aviso-atencao mb-3">Só informativo: estes pagamentos <strong>não vão para o Financeiro</strong>. Os feitos em dinheiro do caixa entram na conta do caixa acima.</div>
      {carga.pagamentos.length > 0 && (
        <div className="flex flex-col mb-3" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          {carga.pagamentos.map(p => (
            <div key={p.id} className="px-3 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex-1" style={{ minWidth: 180 }}>
                <p className="t-body" style={{ margin: 0 }}>{p.descricao}</p>
                <p className="t-caption" style={{ margin: 0 }}>{rotuloForma(p.forma)}{p.autorizado_por ? ` · autorizou ${p.autorizado_por}` : ''} · {dayjs(p.criado_em).format('HH:mm')} · {p.por_nome}</p>
              </div>
              <span className="t-body num" style={{ fontWeight: 600 }}>{brl(p.valor)}</span>
              {editavel && <IconButton aria-label="Apagar pagamento" tom="perigo" onClick={() => gravar(() => supabase.from('livro_pagamentos').delete().eq('id', p.id))}><Trash2 size={14} /></IconButton>}
            </div>
          ))}
        </div>
      )}
      {editavel && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <Input rotulo="A quem / motivo" value={descricao} onChange={e => setDescricao(e.target.value)} className="md:col-span-2" placeholder="Ex.: gelo avulso" />
          <Input rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} />
          <Select rotulo="Forma" value={forma} onChange={e => setForma(e.target.value as typeof forma)}>{FORMAS.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}</Select>
          <Input rotulo="Quem autorizou" value={autorizou} onChange={e => setAutorizou(e.target.value)} />
          <div className="md:col-span-5 flex justify-end"><Button icone={<Plus size={14} />} onClick={add} disabled={!descricao.trim() || num(valor) <= 0}>Lançar pagamento</Button></div>
        </div>
      )}
    </SectionCard>
  );
};

// ── Fechamento e adendos ───────────────────────────────────────────────────
const Fechamento: React.FC<{ carga: Carga; noite: Noite; respondidos: number; caixaOk: boolean; gravar: LivroProps['gravar']; setErro: (m: string | null) => void; setAviso: (m: string | null) => void }> = ({ carga, noite, respondidos, caixaOk, gravar }) => {
  const [adendo, setAdendo] = useState('');
  const fechado = noite.status === 'fechado';
  const itens = [
    { ok: respondidos === SETORES.length, texto: `Setores respondidos: ${respondidos} de ${SETORES.length}` },
    { ok: !!noite.movimento, texto: 'Movimento da casa informado' },
    { ok: caixaOk, texto: 'Caixa: fundo de troco, dinheiro que entrou e dinheiro contado' },
  ];
  const pronto = itens.every(i => i.ok);
  const pendenciasAbertas = carga.ocorrencias.filter(o => o.precisa_providencia && o.status_pendencia === 'aberta').length;
  return (
    <SectionCard title={fechado ? 'Livro fechado' : 'Fechar o livro'}
      descricao={fechado ? `Fechado por ${noite.fechado_por_nome || '—'} em ${dayjs(noite.fechado_em).format('DD/MM HH:mm')}.${noite.reaberto_por_nome ? ` Já foi reaberto por ${noite.reaberto_por_nome}.` : ''}` : 'Depois de fechado, só entra adendo.'}>
      {!fechado && (
        <>
          <div className="flex flex-col gap-1 mb-3">
            {itens.map(i => <p key={i.texto} className={`t-body ${i.ok ? 'texto-certo' : 'texto-atencao'}`} style={{ margin: 0 }}>{i.ok ? '✓' : '○'} {i.texto}</p>)}
            {pendenciasAbertas > 0 && <p className="t-caption" style={{ margin: 0 }}>{pendenciasAbertas} pendência{pendenciasAbertas === 1 ? '' : 's'} desta noite continuam aparecendo nas próximas até alguém resolver.</p>}
          </div>
          <Button variante="primario" icone={<Lock size={16} />} disabled={!pronto}
            onClick={() => { if (window.confirm('Fechar o livro desta noite? Depois só dá para acrescentar adendos.')) void gravar(() => supabase.from('livro_noites').update({ status: 'fechado' }).eq('id', noite.id), 'Livro fechado.'); }}>Fechar o livro</Button>
        </>
      )}
      {fechado && carga.gestor && (
        <Button icone={<Unlock size={16} />} onClick={() => { if (window.confirm('Reabrir este livro para edição?')) void gravar(() => supabase.from('livro_noites').update({ status: 'aberto' }).eq('id', noite.id), 'Livro reaberto.'); }}>Reabrir (gestor)</Button>
      )}
      {fechado && (
        <div className="mt-4">
          <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>Adendos</p>
          {carga.adendos.map((a: Adendo) => <p key={a.id} className="t-body" style={{ margin: '0 0 6px' }}><span className="t-caption">{dayjs(a.criado_em).format('DD/MM HH:mm')} · {a.por_nome}: </span>{a.texto}</p>)}
          <div className="flex flex-wrap items-end gap-2">
            <Input rotulo="Novo adendo" value={adendo} onChange={e => setAdendo(e.target.value)} className="flex-1 min-w-[220px]" placeholder="Algo que faltou registrar ou uma correção" />
            <Button icone={<Plus size={14} />} disabled={!adendo.trim()} onClick={async () => { if (await gravar(() => supabase.from('livro_adendos').insert({ noite_id: noite.id, texto: adendo.trim() }), 'Adendo registrado.')) setAdendo(''); }}>Registrar adendo</Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

// ── Histórico ──────────────────────────────────────────────────────────────
interface LinhaHist {
  data: string; status: 'aberto' | 'fechado'; gerente_nome: string | null; movimento: string | null; ocorrencias: number; graves: number;
  pendencias_abertas: number; dinheiro_entrada: number | null; diferenca: number | null; pagamentos_total: number | null;
}

const Historico: React.FC<{ onAbrir: (d: string) => void }> = ({ onAbrir }) => {
  const [de, setDe] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [ate, setAte] = useState(dayjs().format('YYYY-MM-DD'));
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [lista, setLista] = useState<LinhaHist[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setLista(null);
    supabase.rpc('fn_livro_lista', { p_de: de, p_ate: ate, p_busca: buscaAplicada || null }).then(({ data, error }) => {
      if (error) setErro(error.message); else { setErro(null); setLista((data || []) as LinhaHist[]); }
    });
  }, [de, ate, buscaAplicada]);

  const tot = useMemo(() => ({
    noites: lista?.length || 0, graves: (lista || []).reduce((a, l) => a + l.graves, 0), pend: (lista || []).reduce((a, l) => a + l.pendencias_abertas, 0),
    abertos: (lista || []).filter(l => l.status === 'aberto').length,
  }), [lista]);

  return (
    <>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <Input rotulo="De" type="date" value={de} onChange={e => setDe(e.target.value)} />
        <Input rotulo="Até" type="date" value={ate} onChange={e => setAte(e.target.value)} />
        <form className="flex items-end gap-2 flex-1 min-w-[220px]" onSubmit={e => { e.preventDefault(); setBuscaAplicada(busca.trim()); }}>
          <Input rotulo="Buscar nas ocorrências, pagamentos e recados" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1" placeholder="Ex.: briga, gelo, setor" />
          <Button type="submit" icone={<Search size={14} />}>Buscar</Button>
        </form>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard rotulo="noites" valor={tot.noites} detalhe={buscaAplicada ? `com "${buscaAplicada}"` : 'no período'} />
        <KPICard rotulo="ocorrências graves" valor={tot.graves} tom={tot.graves ? 'alerta' : 'normal'} />
        <KPICard rotulo="pendências abertas" valor={tot.pend} tom={tot.pend ? 'atencao' : 'normal'} />
        <KPICard rotulo="livros sem fechar" valor={tot.abertos} tom={tot.abertos ? 'atencao' : 'normal'} />
      </div>
      <SectionCard noPadding>
        {lista === null ? <p className="t-body px-5 py-8" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
          : lista.length === 0 ? <EmptyState icon={BookOpen} compact title="Nenhum livro no período" description="Troque as datas ou a busca." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="px-4 py-2.5 text-left">Noite</th><th className="px-4 py-2.5 text-left">Gerente</th><th className="px-4 py-2.5 text-left">Movimento</th>
                  <th className="px-4 py-2.5 text-left">Ocorrências</th><th className="px-4 py-2.5 text-right">Dinheiro</th><th className="px-4 py-2.5 text-right">Dif. caixa</th><th className="px-4 py-2.5 text-left">Situação</th>
                </tr></thead>
                <tbody>
                  {lista.map(l => (
                    <tr key={l.data} className="cursor-pointer hover:bg-white/[0.04]" style={{ borderBottom: '1px solid var(--border-subtle)' }} onClick={() => onAbrir(l.data)}>
                      <td className="px-4 py-3"><p className="t-body" style={{ margin: 0, fontWeight: 600 }}>{dayjs(l.data).format('DD/MM ddd')}</p></td>
                      <td className="px-4 py-3 t-body">{(l.gerente_nome || '—').split(' ')[0]}</td>
                      <td className="px-4 py-3 t-body">{rotuloMovimento(l.movimento)}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">
                        <span className="t-body">{l.ocorrencias}</span>
                        {l.graves > 0 && <Badge variant="danger">{l.graves} grave{l.graves === 1 ? '' : 's'}</Badge>}
                        {l.pendencias_abertas > 0 && <Badge variant="wine">{l.pendencias_abertas} pendente{l.pendencias_abertas === 1 ? '' : 's'}</Badge>}
                      </div></td>
                      <td className="px-4 py-3 text-right num">{l.dinheiro_entrada === null ? '—' : brl(l.dinheiro_entrada)}</td>
                      <td className={`px-4 py-3 text-right num ${l.diferenca !== null && Math.abs(l.diferenca) >= 0.005 ? 'texto-atencao' : ''}`}>{l.diferenca === null ? '—' : brl(l.diferenca)}</td>
                      <td className="px-4 py-3"><Badge variant={l.status === 'fechado' ? 'success' : 'warning'}>{l.status === 'fechado' ? 'Fechado' : 'Aberto'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>
    </>
  );
};

export default LivroNoite;
