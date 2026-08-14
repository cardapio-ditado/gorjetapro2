interface LogoProps {
  size?: number;
  showName?: boolean;
  className?: string;
}

export default function Logo({ size = 96, showName = true, className = '' }: LogoProps) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
        <defs>
          <linearGradient id="rr-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fcd980" />
            <stop offset="45%" stopColor="#e8a921" />
            <stop offset="100%" stopColor="#b0790e" />
          </linearGradient>
          <radialGradient id="rr-bg" cx="50%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#232334" />
            <stop offset="100%" stopColor="#0d0d15" />
          </radialGradient>
        </defs>
        {/* anel externo duplo */}
        <circle cx="60" cy="60" r="57" stroke="url(#rr-gold)" strokeWidth="2" />
        <circle cx="60" cy="60" r="51" fill="url(#rr-bg)" stroke="url(#rr-gold)" strokeWidth="1" strokeOpacity="0.6" />
        {/* estrelas laterais */}
        <path d="M22 60l2.6-2.6L27.2 60l-2.6 2.6L22 60z" fill="#e8a921" />
        <path d="M92.8 60l2.6-2.6L98 60l-2.6 2.6-2.6-2.6z" fill="#e8a921" />
        {/* monograma RR */}
        <text
          x="60"
          y="72"
          textAnchor="middle"
          fontFamily="'Playfair Display', Georgia, serif"
          fontSize="42"
          fontWeight="800"
          fill="url(#rr-gold)"
          letterSpacing="1"
        >
          RR
        </text>
        {/* filete inferior */}
        <path d="M38 84h44" stroke="url(#rr-gold)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M46 89h28" stroke="url(#rr-gold)" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.6" />
      </svg>
      {showName && (
        <div className="mt-3 text-center">
          <div
            className="font-display text-2xl font-bold tracking-[0.28em] text-transparent bg-clip-text bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600"
            style={{ marginRight: '-0.28em' }}
          >
            RR BARES
          </div>
          <div className="mt-1 text-[0.65rem] font-medium uppercase tracking-[0.5em] text-zinc-500" style={{ marginRight: '-0.5em' }}>
            Gestão de Eventos
          </div>
        </div>
      )}
    </div>
  );
}
