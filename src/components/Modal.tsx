import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  largura?: string;
}

export default function Modal({ aberto, titulo, onFechar, children, largura = 'max-w-lg' }: ModalProps) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div
        className={`card w-full ${largura} max-h-[90vh] overflow-y-auto p-6 animate-fadeUp`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{titulo}</h3>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-night-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
