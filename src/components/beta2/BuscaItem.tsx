import React, { useMemo, useState } from 'react';
import { Input } from '../ui';
import { semAcento } from './cadastros/api';

export interface OpcaoBusca { id: string; nome: string; sub?: string }

interface Props {
  rotulo?: string;
  valor: string;
  opcoes: OpcaoBusca[];
  onEscolher: (id: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Digita duas letras, aparecem até dez; toca e escolhe. Para listas longas (itens, fornecedores). */
const BuscaItem: React.FC<Props> = ({ rotulo, valor, opcoes, onEscolher, placeholder = 'Digite para buscar', autoFocus }) => {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const t = semAcento(texto.trim());
  const achados = useMemo(() => (t.length < 2 ? [] : opcoes.filter(o => semAcento(o.nome).includes(t)).slice(0, 10)), [t, opcoes]);
  return (
    <div className="relative">
      <Input rotulo={rotulo} aria-label={rotulo || 'Buscar'} placeholder={valor || placeholder} value={aberto ? texto : valor} autoFocus={autoFocus}
        onFocus={() => { setAberto(true); setTexto(''); }} onBlur={() => setTimeout(() => setAberto(false), 150)} onChange={e => setTexto(e.target.value)} />
      {aberto && achados.length > 0 && (
        <ul className="absolute left-0 right-0 z-40 mt-1 overflow-auto" style={{ maxHeight: 260, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-control)', boxShadow: 'var(--shadow-raised)', listStyle: 'none', margin: 0, padding: 4 }}>
          {achados.map(o => (
            <li key={o.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onEscolher(o.id); setAberto(false); }} className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.06] focus-ring">
                <span className="block t-body" style={{ color: 'var(--text-primary)' }}>{o.nome}</span>
                {o.sub && <span className="block t-caption">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BuscaItem;
