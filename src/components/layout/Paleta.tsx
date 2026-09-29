import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Package, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ROTAS_BUSCA } from '../../lib/rotasBusca';

interface Props {
  aberta: boolean;
  onFechar: () => void;
}

interface Resultado {
  grupo: 'Telas' | 'Itens de estoque';
  chave: string;
  titulo: string;
  detalhe?: string;
  path: string;
  icon?: LucideIcon;
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * A paleta: Ctrl K abre, digita, Enter vai. Acha telas de cara e, com dois
 * caracteres ou mais, itens de estoque no banco (abre o extrato do item).
 */
const Paleta: React.FC<Props> = ({ aberta, onFechar }) => {
  const navigate = useNavigate();
  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState<Resultado[]>([]);
  const [indice, setIndice] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberta) {
      setTermo('');
      setItens([]);
      setIndice(0);
      setTimeout(() => campo.current?.focus(), 0);
    }
  }, [aberta]);

  // Itens de estoque: busca no banco com atraso de 200ms
  useEffect(() => {
    const t = termo.trim();
    if (!aberta || t.length < 2) { setItens([]); return; }
    let vivo = true;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('itens_estoque')
        .select('id, nome, categoria')
        .eq('status', 'ativo')
        .ilike('nome', `%${t}%`)
        .order('nome')
        .limit(6);
      if (!vivo) return;
      setItens(((data || []) as Array<{ id: string; nome: string; categoria: string | null }>).map(i => ({
        grupo: 'Itens de estoque',
        chave: `item-${i.id}`,
        titulo: i.nome.trim(),
        detalhe: i.categoria || undefined,
        path: `/advanced-inventory?area=analise&tela=kardex&item=${i.id}`,
        icon: Package,
      })));
    }, 200);
    return () => { vivo = false; clearTimeout(timer); };
  }, [termo, aberta]);

  const telas = useMemo<Resultado[]>(() => {
    const t = normalizar(termo.trim());
    const lista = t
      ? ROTAS_BUSCA.filter(r => normalizar(`${r.label} ${r.apelidos ?? ''}`).includes(t))
      : ROTAS_BUSCA.slice(0, 8);
    return lista.slice(0, 8).map(r => {
      const [principal, sub] = r.label.split(' — ');
      return { grupo: 'Telas', chave: `tela-${r.path}`, titulo: sub ?? principal, detalhe: sub ? principal : undefined, path: r.path, icon: r.icon };
    });
  }, [termo]);

  const resultados = useMemo(() => [...telas, ...itens], [telas, itens]);

  useEffect(() => { setIndice(0); }, [resultados.length, termo]);

  const ir = (r: Resultado) => {
    onFechar();
    navigate(r.path);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndice(i => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndice(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = resultados[indice]; if (r) ir(r); }
    else if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
  };

  if (!aberta) return null;

  let grupoAnterior: Resultado['grupo'] | null = null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <button type="button" aria-label="Fechar busca" onClick={onFechar} className="absolute inset-0 w-full h-full cursor-default" style={{ background: 'rgba(0,0,0,0.6)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar no sistema"
        className="relative w-full max-w-xl rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-overlay)' }}
      >
        <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
          <input
            ref={campo}
            value={termo}
            onChange={e => setTermo(e.target.value)}
            onKeyDown={teclas}
            placeholder="Ir para uma tela ou abrir um item"
            aria-label="Buscar"
            className="flex-1 bg-transparent outline-none text-base"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="t-caption px-1.5 py-0.5 rounded" style={{ border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}>Esc</kbd>
        </div>

        <ul role="listbox" aria-label="Resultados" className="max-h-[52vh] overflow-y-auto py-2">
          {resultados.length === 0 && (
            <li className="px-4 py-6 text-center t-body" style={{ color: 'var(--text-secondary)' }}>Nada com esse nome.</li>
          )}
          {resultados.map((r, i) => {
            const cabecalho = r.grupo !== grupoAnterior;
            grupoAnterior = r.grupo;
            const Icone = r.icon;
            const selecionado = i === indice;
            return (
              <React.Fragment key={r.chave}>
                {cabecalho && (
                  <li aria-hidden="true" className="t-caps px-4 pt-2 pb-1" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{r.grupo}</li>
                )}
                <li
                  role="option"
                  aria-selected={selecionado}
                  onMouseEnter={() => setIndice(i)}
                  onMouseDown={e => { e.preventDefault(); ir(r); }}
                  className="mx-2 px-3 h-11 rounded-lg flex items-center gap-3 cursor-pointer"
                  style={{ background: selecionado ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                >
                  {Icone && <Icone size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />}
                  <span className="flex-1 min-w-0 truncate t-body" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {r.titulo}
                    {r.detalhe && <span className="ml-2 t-label" style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{r.detalhe}</span>}
                  </span>
                  {selecionado && <CornerDownLeft size={14} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default Paleta;
