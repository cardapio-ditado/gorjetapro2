import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Campo } from './Field';

export interface OpcaoCombo { id: string; nome: string; sub?: string }

interface ComboboxProps {
  /** Rótulo acima do campo. */
  rotulo?: string;
  /** Id escolhido ('' quando nada). */
  valor: string;
  opcoes: OpcaoCombo[];
  onEscolher: (id: string) => void;
  placeholder?: string;
  /** Id sugerido: aparece primeiro, com a etiqueta "sugestão". */
  sugestaoId?: string;
  /** Mostra "Criar 'texto'" no fim da lista; recebe o que foi digitado. */
  onCriar?: (texto: string) => void;
  /** Como chamar o que se cria ("fornecedor", "categoria"). */
  rotuloCriar?: string;
  dica?: string;
  erro?: string;
  disabled?: boolean;
  className?: string;
}

const LIMITE = 12;
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Campo de escolha com busca, para listas longas (fornecedores, categorias).
 * Digita e filtra por nome e pela linha de apoio (ex.: CNPJ), sem ligar para
 * acento; setas, Enter e Esc funcionam; a sugestão vem primeiro e, se nada
 * servir, dá para criar na hora.
 */
export const Combobox: React.FC<ComboboxProps> = ({
  rotulo, valor, opcoes, onEscolher, placeholder = 'Digite para buscar', sugestaoId, onCriar, rotuloCriar = 'novo',
  dica, erro, disabled, className = '',
}) => {
  const id = useId();
  const listaId = `${id}-lista`;
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const escolhido = opcoes.find(o => o.id === valor);
  const t = normal(texto.trim());

  const achados = useMemo(() => {
    const sug = sugestaoId ? opcoes.find(o => o.id === sugestaoId) : undefined;
    const base = t
      ? opcoes.filter(o => normal(o.nome).includes(t) || (o.sub && normal(o.sub).includes(t)))
          // quem começa com o texto vem antes
          .sort((a, b) => Number(!normal(a.nome).startsWith(t)) - Number(!normal(b.nome).startsWith(t)))
      : opcoes;
    const lista = sug && (!t || base.includes(sug)) ? [sug, ...base.filter(o => o.id !== sug.id)] : base;
    return lista.slice(0, LIMITE);
  }, [t, opcoes, sugestaoId]);

  const podeCriar = !!onCriar && texto.trim().length >= 2 && !opcoes.some(o => normal(o.nome) === t);
  const total = achados.length + (podeCriar ? 1 : 0);

  useEffect(() => { setAtivo(0); }, [t, aberto]);

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const escolher = (i: number) => {
    if (i < achados.length) onEscolher(achados[i].id);
    else if (podeCriar) onCriar!(texto.trim());
    setAberto(false);
    setTexto('');
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo(a => Math.min(total - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && aberto && total > 0) { e.preventDefault(); escolher(ativo); }
    else if (e.key === 'Escape') { setAberto(false); setTexto(''); }
  };

  return (
    <div ref={ref} className={`relative ${className}`.trim()}>
      <Campo id={id} rotulo={rotulo} dica={dica} erro={erro}>
        <input
          id={id}
          className="input-dark"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={aberto && total ? `${listaId}-${ativo}` : undefined}
          aria-invalid={erro ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={escolhido ? escolhido.nome : placeholder}
          value={aberto ? texto : (escolhido?.nome ?? '')}
          onFocus={() => { setAberto(true); setTexto(''); }}
          onChange={e => { setTexto(e.target.value); setAberto(true); }}
          onKeyDown={teclas}
        />
      </Campo>
      {aberto && (
        <ul id={listaId} role="listbox" className="absolute left-0 right-0 z-40 mt-1 overflow-auto"
          style={{ maxHeight: 280, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-control)', listStyle: 'none', margin: 0, padding: 4 }}>
          {achados.map((o, i) => (
            <li key={o.id} id={`${listaId}-${i}`} role="option" aria-selected={i === ativo}>
              <button type="button" onMouseDown={e => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(i)}
                className="w-full text-left px-3 py-2 rounded-md focus-ring"
                style={{ background: i === ativo ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
                <span className="flex items-center gap-2 t-body" style={{ color: 'var(--text-primary)' }}>
                  {o.nome}
                  {o.id === sugestaoId && <span className="badge-gold" style={{ fontSize: 10 }}>sugestão</span>}
                  {o.id === valor && <span className="t-caption">(escolhido)</span>}
                </span>
                {o.sub && <span className="block t-caption">{o.sub}</span>}
              </button>
            </li>
          ))}
          {achados.length === 0 && !podeCriar && (
            <li className="px-3 py-2 t-caption">{t ? 'Nada encontrado.' : 'Nenhuma opção.'}</li>
          )}
          {podeCriar && (
            <li id={`${listaId}-${achados.length}`} role="option" aria-selected={ativo === achados.length}>
              <button type="button" onMouseDown={e => e.preventDefault()} onMouseEnter={() => setAtivo(achados.length)} onClick={() => escolher(achados.length)}
                className="w-full text-left px-3 py-2 rounded-md focus-ring flex items-center gap-2 t-body"
                style={{ color: 'var(--gold)', background: ativo === achados.length ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
                <Plus size={14} /> Criar {rotuloCriar} "{texto.trim()}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
