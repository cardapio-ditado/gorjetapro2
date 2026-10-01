import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { EmptyState } from '../../ui';

export interface Linha {
  id: string;
  titulo: string;
  sub?: string;
  etiquetas?: React.ReactNode;
  inativo?: boolean;
}
export interface Grupo {
  chave: string;
  titulo: string;
  linhas: Linha[];
}

interface Props {
  grupos: Grupo[];
  onAbrir: (id: string) => void;
  vazio: string;
  filtrado?: boolean;
}

/**
 * A lista de todo cadastro: grupos recolhíveis (categoria, grupo, tipo),
 * cada linha com nome, uma informação secundária e etiquetas. Tocar na
 * linha abre a edição. Mesma leitura da lista de Configurar setores.
 */
const ListaAgrupada: React.FC<Props> = ({ grupos, onAbrir, vazio, filtrado = false }) => {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const alternar = (chave: string) => setFechados(prev => { const n = new Set(prev); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  if (grupos.length === 0) return <EmptyState icon={Search} title={filtrado ? 'Nada com esse nome' : vazio} variant={filtrado ? 'filtered' : 'empty'} compact />;

  return (
    <div className="flex flex-col gap-3">
      {grupos.map(g => {
        const fechado = fechados.has(g.chave);
        return (
          <section key={g.chave} className="card">
            <button
              type="button"
              onClick={() => alternar(g.chave)}
              aria-expanded={!fechado}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left focus-ring"
              style={{ borderBottom: fechado ? 'none' : '1px solid var(--border)' }}
            >
              <span className="flex items-center gap-2 min-w-0">
                {fechado ? <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />}
                <h2 className="t-subsec truncate" style={{ margin: 0 }}>{g.titulo}</h2>
              </span>
              <span className="t-caption flex-shrink-0">{g.linhas.length}</span>
            </button>
            {!fechado && g.linhas.map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => onAbrir(l.id)}
                className="w-full flex items-center gap-3 px-4 min-h-[52px] py-2 text-left hover:bg-white/[0.04] focus-ring"
                style={{ borderBottom: '1px solid var(--border-subtle)', opacity: l.inativo ? 0.6 : 1 }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block t-body truncate" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{l.titulo}</span>
                  {l.sub && <span className="block t-caption truncate">{l.sub}</span>}
                </span>
                {l.etiquetas && <span className="flex items-center gap-1 flex-shrink-0">{l.etiquetas}</span>}
                <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
};

export default ListaAgrupada;

/** Agrupa linhas por uma chave de texto, em ordem alfabética, com "Sem …" por último. */
export function agrupar<T>(itens: T[], chaveDe: (x: T) => string | null | undefined, linhaDe: (x: T) => Linha, semGrupo = 'Sem grupo'): Grupo[] {
  const mapa = new Map<string, Linha[]>();
  for (const x of itens) {
    const k = (chaveDe(x) || '').trim() || semGrupo;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(linhaDe(x));
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] === semGrupo ? 1 : b[0] === semGrupo ? -1 : a[0].localeCompare(b[0], 'pt-BR')))
    .map(([k, linhas]) => ({ chave: k, titulo: k, linhas }));
}
