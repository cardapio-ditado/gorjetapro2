import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Chip, SectionCard } from '../ui';
import { setoresApi, type Regras as RegrasDados } from './api';

const DIAS = [
  { n: 1, r: 'Seg' }, { n: 2, r: 'Ter' }, { n: 3, r: 'Qua' }, { n: 4, r: 'Qui' }, { n: 5, r: 'Sex' }, { n: 6, r: 'Sáb' }, { n: 7, r: 'Dom' },
];

/** As duas regras da casa: quando contar tudo, e quem aprova diferença. */
const Regras: React.FC = () => {
  const [dados, setDados] = useState<RegrasDados | null>(null);
  const [dias, setDias] = useState<number[]>([]);
  const [aprovadores, setAprovadores] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setoresApi.regras().then(r => { if (vivo) { setDados(r); setDias(r.auditoria_dias); setAprovadores(r.aprovadores.map(a => a.id)); } })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); });
    return () => { vivo = false; };
  }, []);

  const mudou = dados ? (dias.slice().sort().join(',') !== dados.auditoria_dias.slice().sort().join(',') || aprovadores.slice().sort().join(',') !== dados.aprovadores.map(a => a.id).sort().join(',')) : false;

  const salvar = async () => {
    setSalvando(true); setErro(null); setSalvo(false);
    try {
      const r = await setoresApi.regrasSalvar(dias, aprovadores);
      setDados(r); setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const alternar = (lista: number[], v: number) => (lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);

  return (
    <SectionCard title="Regras da casa" descricao="Valem para todos os setores." action={<Button variante="primario" tamanho="sm" icone={<Save size={14} />} onClick={salvar} disabled={!mudou || salvando} carregando={salvando}>{salvo ? 'Salvo' : 'Salvar'}</Button>}>
      {erro && <p className="t-body" style={{ margin: '0 0 12px', color: '#fca5a5' }}>{erro}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Contagem geral de todos os itens</span>
          <div className="flex flex-wrap gap-2">
            {DIAS.map(d => <Chip key={d.n} ligado={dias.includes(d.n)} onMudar={() => setDias(alternar(dias, d.n))} tom="ouro">{d.r}</Chip>)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Quem aprova diferença de contagem</span>
          <div className="flex flex-wrap gap-2">
            {dados?.usuarios.map(u => <Chip key={u.id} ligado={aprovadores.includes(u.id)} onMudar={() => setAprovadores(aprovadores.includes(u.id) ? aprovadores.filter(x => x !== u.id) : [...aprovadores, u.id])}>{u.nome}</Chip>)}
            {!dados && <span className="t-caption">Carregando…</span>}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

export default Regras;
