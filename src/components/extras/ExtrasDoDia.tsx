import React, { useEffect, useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, Button, SectionCard } from '../ui';
import { brl, hora, LancarExtras, nomeDe, SELECT_DIARIA, type Diaria } from './shared';

/**
 * Extras do dia, para o Portal do Gerente: quem vem, marcar presença e
 * lançar mais gente. Aparece tudo o que foi lançado para a data, por quem
 * quer que tenha lançado (gerente ou gestor). Pagamento fica na tela Extras.
 */
const ExtrasDoDia: React.FC<{ data: string; quem: string | null }> = ({ data, quem }) => {
  const [lista, setLista] = useState<Diaria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lancando, setLancando] = useState(false);

  const carregar = async () => {
    const { data: d, error } = await supabase.from('extras_freelancers').select(SELECT_DIARIA).eq('data_trabalho', data).order('setor').order('nome');
    if (error) setErro(error.message); else { setErro(null); setLista((d || []) as Diaria[]); }
  };
  useEffect(() => { setLista(null); setAviso(null); void carregar(); }, [data]);

  const presenca = async (d: Diaria, p: Diaria['presenca']) => {
    const { error } = await supabase.from('extras_freelancers').update({ presenca: d.presenca === p ? 'prevista' : p }).eq('id', d.id);
    if (error) { setErro(error.message); return; }
    await carregar();
  };

  const validos = (lista || []).filter(d => d.presenca !== 'faltou');
  const custo = validos.reduce((a, d) => a + d.valor_diaria, 0);
  const vieram = (lista || []).filter(d => d.presenca === 'confirmada').length;

  return (
    <SectionCard noPadding title="Extras do dia"
      descricao={lista && lista.length ? `${validos.length} extra${validos.length === 1 ? '' : 's'} · ${brl(custo)} · ${vieram} chegou${vieram === 1 ? '' : 'aram'}` : 'Diaristas lançados para esta data.'}
      action={<Button tamanho="sm" variante="primario" icone={<UserPlus size={14} />} onClick={() => setLancando(true)}>Lançar extra</Button>}>
      {erro && <div className="aviso aviso-perigo mx-5 my-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mx-5 my-3">{aviso}</div>}
      {lista === null ? <p className="t-caption px-5 py-4">Carregando…</p>
        : lista.length === 0 ? <p className="t-body px-5 py-4" style={{ color: 'var(--text-secondary)' }}>Nenhum extra lançado para hoje.</p>
        : lista.map(d => (
          <div key={d.id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: d.presenca === 'faltou' ? 0.55 : 1 }}>
            <div className="flex-1 min-w-[170px]">
              <p className="t-body" style={{ margin: 0, fontWeight: 500, textDecoration: d.presenca === 'faltou' ? 'line-through' : undefined }}>{nomeDe(d)}</p>
              <p className="t-caption" style={{ margin: 0 }}>
                {d.funcao_temporaria} · {d.setor}{d.horario_inicio && ` · ${hora(d.horario_inicio)}`} · {brl(d.valor_diaria)}
                {d.lancado_por_nome && ` · lançou ${d.lancado_por_nome.split(' ')[0]}`}
              </p>
            </div>
            {d.presenca === 'faltou' ? <>
              <Badge variant="danger">faltou</Badge>
              <Button tamanho="sm" variante="discreto" onClick={() => presenca(d, 'faltou')}>Desfazer</Button>
            </> : <>
              <Button tamanho="sm" variante={d.presenca === 'confirmada' ? 'primario' : undefined} icone={<Check size={14} />}
                aria-pressed={d.presenca === 'confirmada'} onClick={() => presenca(d, 'confirmada')}>Chegou</Button>
              {d.presenca !== 'confirmada' && <Button tamanho="sm" variante="discreto" icone={<X size={14} />} onClick={() => presenca(d, 'faltou')}>Faltou</Button>}
            </>}
          </div>
        ))}
      {lancando && <LancarExtras dataInicial={data} quem={quem} onFechar={() => setLancando(false)}
        onFeito={async m => { setLancando(false); setAviso(m); await carregar(); }} />}
    </SectionCard>
  );
};

export default ExtrasDoDia;
