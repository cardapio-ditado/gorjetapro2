import React, { useId } from 'react';

interface CampoBase {
  /** Rótulo acima do campo. */
  rotulo?: string;
  /** Uma frase de ajuda abaixo do campo. */
  dica?: string;
  /** Mensagem de erro: pinta a borda e troca a dica. */
  erro?: string;
  className?: string;
}

interface CampoProps extends CampoBase {
  id: string;
  children: React.ReactNode;
}

/** A moldura de todo campo: rótulo, o controle, e dica ou erro embaixo. */
export const Campo: React.FC<CampoProps> = ({ id, rotulo, dica, erro, className = '', children }) => (
  <div className={`flex flex-col gap-1 ${className}`.trim()}>
    {rotulo && (
      <label htmlFor={id} className="t-label" style={{ color: erro ? 'var(--danger-text)' : 'var(--text-secondary)' }}>
        {rotulo}
      </label>
    )}
    {children}
    {(erro || dica) && (
      <p id={`${id}-ajuda`} className="t-caption" style={{ color: erro ? 'var(--danger-text)' : 'var(--text-secondary)', margin: 0 }}>
        {erro || dica}
      </p>
    )}
  </div>
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, CampoBase {}

/** Campo de texto, número, data. 36px, fundo da página, canto de controle. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ rotulo, dica, erro, className = '', id, ...rest }, ref) => {
    const gerado = useId();
    const idFinal = id || gerado;
    return (
      <Campo id={idFinal} rotulo={rotulo} dica={dica} erro={erro} className={className}>
        <input
          ref={ref}
          id={idFinal}
          className="input-dark"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || dica ? `${idFinal}-ajuda` : undefined}
          {...rest}
        />
      </Campo>
    );
  },
);
Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, CampoBase {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ rotulo, dica, erro, className = '', id, children, ...rest }, ref) => {
    const gerado = useId();
    const idFinal = id || gerado;
    return (
      <Campo id={idFinal} rotulo={rotulo} dica={dica} erro={erro} className={className}>
        <select
          ref={ref}
          id={idFinal}
          className="input-dark"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || dica ? `${idFinal}-ajuda` : undefined}
          {...rest}
        >
          {children}
        </select>
      </Campo>
    );
  },
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, CampoBase {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ rotulo, dica, erro, className = '', id, ...rest }, ref) => {
    const gerado = useId();
    const idFinal = id || gerado;
    return (
      <Campo id={idFinal} rotulo={rotulo} dica={dica} erro={erro} className={className}>
        <textarea
          ref={ref}
          id={idFinal}
          className="input-dark"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || dica ? `${idFinal}-ajuda` : undefined}
          {...rest}
        />
      </Campo>
    );
  },
);
Textarea.displayName = 'Textarea';
