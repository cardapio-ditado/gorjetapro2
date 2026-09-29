import React from 'react';
import { Loader2 } from 'lucide-react';

export type BotaoVariante = 'primario' | 'secundario' | 'discreto' | 'perigo';
export type BotaoTamanho = 'sm' | 'md' | 'toque';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primário = vinho, UM por tela. O padrão é secundário de propósito. */
  variante?: BotaoVariante;
  /** md = 36px (computador). toque = 56px (celular da operação). sm = 32px (linha de tabela). */
  tamanho?: BotaoTamanho;
  /** Mostra o giro e desabilita enquanto a ação roda. */
  carregando?: boolean;
  /** Ícone à esquerda do texto (16px). */
  icone?: React.ReactNode;
}

const CLASSE: Record<BotaoVariante, string> = {
  primario: 'btn-primary',
  secundario: 'btn-secondary',
  discreto: 'btn-ghost',
  perigo: 'btn-danger',
};

const TAMANHO: Record<BotaoTamanho, string> = { sm: 'btn-sm', md: '', toque: 'btn-touch' };

/**
 * O botão do sistema. Quatro variantes, três tamanhos, e nada fora disso.
 * As classes vivem em src/index.css (── Botões); aqui só a escolha.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variante = 'secundario', tamanho = 'md', carregando = false, icone, className = '', children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`${CLASSE[variante]} ${TAMANHO[tamanho]} ${className}`.trim()}
      {...rest}
    >
      {carregando ? <Loader2 size={tamanho === 'toque' ? 20 : 16} className="animate-spin" aria-hidden="true" /> : icone}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: sem texto, o leitor de tela não tem o que anunciar. */
  'aria-label': string;
  tom?: 'normal' | 'perigo';
}

/** Botão só de ícone, 32px, sempre com rótulo acessível. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tom = 'normal', className = '', type = 'button', children, ...rest }, ref) => (
    <button ref={ref} type={type} className={`btn-icon ${tom === 'perigo' ? 'btn-icon-danger' : ''} ${className}`.trim()} {...rest}>
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';

export default Button;
