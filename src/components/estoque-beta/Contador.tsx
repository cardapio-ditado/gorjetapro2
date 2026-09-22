import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface Props {
  rotulo: string;
  valor: number;
  incremento: number;
  destaque: boolean;
  onMudar: (v: number) => void;
}

/** Contador grande de mais e menos, com o número no meio. */
const Contador: React.FC<Props> = ({ rotulo, valor, incremento, destaque, onMudar }) => {
  const ajustar = (delta: number) => onMudar(Math.max(0, Math.round((valor + delta) * 100) / 100));

  return (
    <div className={`rounded-3xl p-4 ${destaque ? 'bg-white/10 border-2 border-[#D4AF37]' : 'bg-white/5 border border-white/10'}`}>
      <div className="text-center text-sm font-bold uppercase tracking-widest text-white/60 mb-2">{rotulo}</div>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => ajustar(-incremento)}
          className="w-20 h-20 rounded-2xl bg-white/10 active:bg-white/20 flex items-center justify-center text-white"
          aria-label="menos"
        >
          <Minus className="w-10 h-10" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          step={incremento}
          min={0}
          value={valor}
          onChange={(e) => onMudar(Math.max(0, Number(e.target.value) || 0))}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 text-center bg-transparent text-white font-black text-6xl outline-none"
        />
        <button
          onClick={() => ajustar(incremento)}
          className="w-20 h-20 rounded-2xl bg-[#D4AF37] active:bg-[#C5A028] flex items-center justify-center text-black"
          aria-label="mais"
        >
          <Plus className="w-10 h-10" />
        </button>
      </div>
    </div>
  );
};

export default Contador;
