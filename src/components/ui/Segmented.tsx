export interface OpcaoSegmentada<T extends string> {
  valor: T;
  rotulo: string;
}

interface SegmentedProps<T extends string> {
  /** O que o grupo escolhe, para o leitor de tela: "Estoque", "Período". */
  rotulo: string;
  opcoes: Array<OpcaoSegmentada<T>>;
  valor: T;
  onMudar: (valor: T) => void;
  className?: string;
}

/** Uma escolha entre poucas opções, todas visíveis: Toda a casa | Central | Bar. */
export function Segmented<T extends string>({ rotulo, opcoes, valor, onMudar, className = '' }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={rotulo} className={`segmented ${className}`.trim()}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onMudar(o.valor)}
          className={`segmented-btn ${valor === o.valor ? 'segmented-on' : ''}`.trim()}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
