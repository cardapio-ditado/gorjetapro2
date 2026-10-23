import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Badge, Button, SectionCard } from '../ui';
import { noiteAgora, rotuloMovimento } from './shared';

/**
 * Livro da Noite no Portal do Gerente: mostra como está o livro desta noite e
 * leva a ele. Quem não tem acesso ao livro não vê o bloco.
 */
interface Resumo { status: 'aberto' | 'fechado'; movimento: string | null; ocorrencias: number; setores: number }

const LivroGerente: React.FC = () => {
  const navigate = useNavigate();
  const [r, setR] = useState<Resumo | null | undefined>(undefined);
  const noite = noiteAgora();

  useEffect(() => {
    (async () => {
      const { data: n } = await supabase.from('livro_noites').select('id, status, movimento').eq('data', noite).maybeSingle();
      if (!n) { setR(null); return; }
      const [oc, st] = await Promise.all([
        supabase.from('livro_ocorrencias').select('id', { count: 'exact', head: true }).eq('noite_id', n.id),
        supabase.from('livro_setores').select('id', { count: 'exact', head: true }).eq('noite_id', n.id),
      ]);
      setR({ status: n.status, movimento: n.movimento, ocorrencias: oc.count || 0, setores: st.count || 0 });
    })().catch(() => setR(null));
  }, [noite]);

  return (
    <SectionCard title="Livro da Noite" descricao="O que aconteceu na noite, setor por setor, o caixa e os pagamentos."
      action={<Button tamanho="sm" variante="primario" icone={<BookOpen size={14} />} onClick={() => navigate('/livro')}>{r === null ? 'Abrir o livro' : r?.status === 'fechado' ? 'Ver o livro' : 'Continuar o livro'}</Button>}>
      {r === undefined ? <p className="t-caption" style={{ margin: 0 }}>Carregando…</p>
        : r === null ? <p className="t-body" style={{ margin: 0, color: 'var(--text-secondary)' }}>O livro desta noite ainda não foi aberto.</p>
        : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={r.status === 'fechado' ? 'success' : 'warning'}>{r.status === 'fechado' ? 'Fechado' : 'Aberto'}</Badge>
            <span className="t-body">Movimento: {rotuloMovimento(r.movimento)}</span>
            <span className="t-caption">· {r.ocorrencias} ocorrência{r.ocorrencias === 1 ? '' : 's'}</span>
          </div>
        )}
    </SectionCard>
  );
};

export default LivroGerente;
