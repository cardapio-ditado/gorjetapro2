import React, { useEffect, useState } from 'react';
import { Plus, Search, Wine } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button, SectionCard } from '../ui';
import { BadgeSituacao, cpfFmt, dataBR, MudarNivel, nomeGarrafa, NovaGarrafa, type Garrafa } from './shared';

/**
 * Clube do Whisky no Portal do Gerente: achar a garrafa do cliente (nome, CPF
 * ou etiqueta), marcar quanto restou depois de servir e cadastrar garrafa nova.
 */
const ClubeGerente: React.FC = () => {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Garrafa[] | null>(null);
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const buscar = async (t: string) => {
    const termo = t.trim();
    if (termo.length < 2) { setLista(null); return; }
    const digitos = termo.replace(/\D/g, '');
    const limpo = termo.replace(/[%,()]/g, ' ');
    const filtros = [`nome.ilike.%${limpo}%`, `etiqueta.ilike.%${limpo}%`, `garrafa_nome.ilike.%${limpo}%`];
    if (digitos.length >= 3) filtros.push(`cpf.like.%${digitos}%`);
    const { data, error } = await supabase.from('clube_whisky_garrafas').select('*').eq('status', 'ativa').or(filtros.join(',')).order('validade').limit(10);
    if (error) { setErro(error.message); return; }
    setErro(null); setLista((data || []) as Garrafa[]);
  };
  useEffect(() => { const t = setTimeout(() => void buscar(busca), 300); return () => clearTimeout(t); }, [busca]);

  const mudou = async (m: string) => { setAviso(m); await buscar(busca); };

  return (
    <SectionCard noPadding title="Clube do Whisky" descricao="Busque o cliente para servir da garrafa dele."
      action={<Button tamanho="sm" variante="primario" icone={<Plus size={14} />} onClick={() => setNova(true)}>Nova garrafa</Button>}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder="Nome, CPF ou etiqueta" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar no Clube do Whisky" />
        </div>
      </div>
      {erro && <div className="aviso aviso-perigo mx-5 my-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mx-5 my-3">{aviso}</div>}
      {lista === null ? <p className="t-caption px-5 py-3" style={{ margin: 0 }}>Digite pelo menos 2 letras.</p>
        : lista.length === 0 ? <p className="t-body px-5 py-3" style={{ color: 'var(--text-secondary)', margin: 0 }}>Nenhuma garrafa ativa com esse nome, CPF ou etiqueta.</p>
        : lista.map(g => (
          <div key={g.id} className="px-5 py-3 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex-1 min-w-[200px]">
              <p className="t-body" style={{ margin: 0, fontWeight: 500 }}><Wine size={13} className="inline mr-1.5" style={{ color: 'var(--gold)' }} />{nomeGarrafa(g.garrafa_nome)} · {g.nome}</p>
              <p className="t-caption" style={{ margin: 0 }}>{[g.etiqueta && `etiqueta ${g.etiqueta}`, g.cpf && cpfFmt(g.cpf), `vale até ${dataBR(g.validade)}`].filter(Boolean).join(' · ')}</p>
            </div>
            <BadgeSituacao g={g} />
            <MudarNivel g={g} onMudou={mudou} onErro={setErro} />
          </div>
        ))}
      {nova && <NovaGarrafa onFechar={() => setNova(false)} onFeito={async m => { setNova(false); setAviso(m); }} />}
    </SectionCard>
  );
};

export default ClubeGerente;
