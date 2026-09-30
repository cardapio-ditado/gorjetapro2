import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** Uma frase abaixo do título. */
  descricao?: string;
  children: React.ReactNode;
  /** Botões do rodapé, à direita. No máximo um primário. */
  rodape?: React.ReactNode;
  largura?: 'sm' | 'md' | 'lg';
  /** Quando true, clicar fora e Esc não fecham (ação em andamento). */
  travado?: boolean;
}

const LARGURA = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/**
 * A janela do sistema: título, conteúdo e rodapé com os botões. Fecha com
 * Esc, com o X e clicando fora. Fundo elevado, canto de modal, sem blur.
 */
export const Modal: React.FC<ModalProps> = ({ aberto, onFechar, titulo, descricao, children, rodape, largura = 'sm', travado = false }) => {
  const idTitulo = useId();

  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !travado) onFechar(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [aberto, travado, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => { if (!travado) onFechar(); }}
        className="absolute inset-0 w-full h-full cursor-default"
        style={{ background: 'rgba(0,0,0,0.6)' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`relative w-full ${LARGURA[largura]} flex flex-col max-h-[90vh]`}
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-modal)', boxShadow: 'var(--shadow-overlay)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="min-w-0">
            <h2 id={idTitulo} className="t-subsec" style={{ color: 'var(--text-primary)', margin: 0 }}>{titulo}</h2>
            {descricao && <p className="t-caption" style={{ margin: '2px 0 0' }}>{descricao}</p>}
          </div>
          <button type="button" onClick={onFechar} disabled={travado} className="btn-icon flex-shrink-0" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">{children}</div>
        {rodape && (
          <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
