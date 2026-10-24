import React from 'react';

/**
 * Isola um bloco da tela: se ele quebrar, só ele vira um aviso e o resto da
 * página continua de pé (sem isso, um erro em qualquer bloco deixa a tela
 * inteira preta).
 */
interface Props { nome: string; children: React.ReactNode }
interface Estado { erro: boolean }

export class BlocoSeguro extends React.Component<Props, Estado> {
  state: Estado = { erro: false };

  static getDerivedStateFromError(): Estado {
    return { erro: true };
  }

  componentDidCatch(erro: unknown) {
    console.error(`Bloco "${this.props.nome}" quebrou:`, erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="aviso aviso-perigo" role="alert">
        Não deu para mostrar “{this.props.nome}” agora. O resto da tela segue normal; recarregue a página para tentar de novo.
      </div>
    );
  }
}
