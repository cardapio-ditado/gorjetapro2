import { formatCurrency } from './currency';
import dayjs from '../lib/dayjs';

export interface DadosReciboVale {
  colaborador: {
    nome_completo: string;
    cpf?: string;
    funcao_nome?: string;
  };
  vale: {
    data_ocorrencia: string;
    valor_vale: number;
    descricao: string;
    numero_recibo: string;
  };
  empresa: {
    nome: string;
    endereco: string;
  };
}

const gerarReciboValeHTML = (dados: DadosReciboVale): string => {
  const { colaborador, vale, empresa } = dados;
  const dataEmissao = dayjs().format('DD/MM/YYYY [às] HH:mm');
  const valorPorExtenso = converterValorParaExtenso(vale.valor_vale);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo de Vale - ${colaborador.nome_completo}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #000;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    
    .company-name {
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 2px;
      margin-bottom: 5px;
    }
    
    .document-title {
      font-size: 18px;
      font-weight: bold;
      margin-top: 10px;
      text-decoration: underline;
    }
    
    .receipt-number {
      font-size: 14px;
      margin-top: 5px;
      font-weight: bold;
    }
    
    .content {
      margin: 30px 0;
      line-height: 2;
    }
    
    .valor-principal {
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      border: 2px solid #000;
      padding: 15px;
      margin: 20px 0;
      background: #f9f9f9;
    }
    
    .valor-extenso {
      text-align: center;
      font-style: italic;
      margin: 10px 0;
      font-size: 14px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 30px 0;
    }
    
    .info-item {
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }
    
    .info-label {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .assinatura-area {
      margin-top: 50px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 50px;
    }
    
    .assinatura-box {
      text-align: center;
      padding-top: 40px;
      border-top: 1px solid #000;
    }
    
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10px;
      color: #666;
      border-top: 1px solid #ccc;
      padding-top: 15px;
    }
    
    .observacoes {
      margin: 20px 0;
      padding: 15px;
      border: 1px solid #ddd;
      background: #f9f9f9;
    }
    
    @media print {
      .header {
        border-bottom: 3px solid #000 !important;
      }
      .valor-principal {
        border: 2px solid #000 !important;
      }
      .assinatura-box {
        border-top: 1px solid #000 !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${empresa.nome}</div>
    <div>${empresa.endereco}</div>
    <div class="document-title">RECIBO DE VALE</div>
    <div class="receipt-number">Nº ${vale.numero_recibo}</div>
  </div>

  <div class="content">
    <p>Eu, <strong>${colaborador.nome_completo}</strong>, portador${colaborador.cpf ? ` do CPF ${colaborador.cpf}` : ''}, 
    ${colaborador.funcao_nome ? `exercendo a função de ${colaborador.funcao_nome}` : 'funcionário desta empresa'}, 
    declaro ter recebido desta empresa a quantia abaixo especificada, a título de vale/adiantamento.</p>
    
    <div class="valor-principal">
      VALOR: ${formatCurrency(vale.valor_vale)}
    </div>
    
    <div class="valor-extenso">
      (${valorPorExtenso})
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Data do Vale:</div>
        <div>${dayjs(vale.data_ocorrencia).format('DD/MM/YYYY')}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Data de Emissão:</div>
        <div>${dataEmissao}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Funcionário:</div>
        <div>${colaborador.nome_completo}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Função:</div>
        <div>${colaborador.funcao_nome || 'Não informada'}</div>
      </div>
    </div>

    ${vale.descricao ? `
    <div class="observacoes">
      <div class="info-label">Finalidade do Vale:</div>
      <div>${vale.descricao}</div>
    </div>
    ` : ''}

    <p>Declaro ainda que este valor será descontado de meus pagamentos futuros conforme acordo estabelecido.</p>
  </div>

  <div class="assinatura-area">
    <div class="assinatura-box">
      <div>Assinatura do Funcionário</div>
      <div style="margin-top: 10px; font-size: 10px;">${colaborador.nome_completo}</div>
    </div>
    <div class="assinatura-box">
      <div>Assinatura da Empresa</div>
      <div style="margin-top: 10px; font-size: 10px;">Autorizado por</div>
    </div>
  </div>

  <div class="footer">
    <div>Este recibo foi gerado eletronicamente em ${dataEmissao}</div>
    <div>Sistema de Gestão - ${empresa.nome}</div>
    <div>Recibo Nº ${vale.numero_recibo} - ${colaborador.nome_completo}</div>
  </div>
</body>
</html>
  `.trim();
};

// Função para converter valor em extenso (simplificada)
const converterValorParaExtenso = (valor: number): string => {
  if (valor === 0) return 'zero reais';
  
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const especiais = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  const parteInteira = Math.floor(valor);
  const centavos = Math.round((valor - parteInteira) * 100);

  if (parteInteira === 0) {
    if (centavos === 1) return 'um centavo';
    if (centavos > 1) return `${converterNumero(centavos)} centavos`;
    return 'zero reais';
  }

  let resultado = converterNumero(parteInteira);
  resultado += parteInteira === 1 ? ' real' : ' reais';

  if (centavos > 0) {
    resultado += ' e ';
    resultado += centavos === 1 ? 'um centavo' : `${converterNumero(centavos)} centavos`;
  }

  return resultado;

  function converterNumero(num: number): string {
    if (num === 0) return 'zero';
    if (num === 100) return 'cem';
    
    if (num < 10) return unidades[num];
    if (num < 20) return especiais[num - 10];
    if (num < 100) {
      const dez = Math.floor(num / 10);
      const un = num % 10;
      return dezenas[dez] + (un > 0 ? ` e ${unidades[un]}` : '');
    }
    if (num < 1000) {
      const cen = Math.floor(num / 100);
      const resto = num % 100;
      let resultado = centenas[cen];
      if (resto > 0) {
        resultado += ' e ' + converterNumero(resto);
      }
      return resultado;
    }
    
    // Para valores maiores, usar aproximação
    if (num < 1000000) {
      const mil = Math.floor(num / 1000);
      const resto = num % 1000;
      let resultado = converterNumero(mil) + (mil === 1 ? ' mil' : ' mil');
      if (resto > 0) {
        resultado += ' e ' + converterNumero(resto);
      }
      return resultado;
    }
    
    return `${num.toLocaleString('pt-BR')}`;
  }
};

// Função para imprimir recibo de vale
export const imprimirReciboVale = (dados: DadosReciboVale) => {
  // Validar dados mínimos necessários
  if (!dados || !dados.colaborador || !dados.vale || !dados.empresa || dados.vale.valor_vale <= 0) {
    alert('Dados insuficientes para gerar o recibo. Verifique se o colaborador, valor do vale, empresa e descrição estão definidos.');
    return;
  }

  const html = gerarReciboValeHTML(dados);
  
  // Verificar se o HTML foi gerado corretamente
  if (!html || html.trim().length === 0) {
    alert('Erro ao gerar o HTML do recibo. Tente novamente.');
    return;
  }

  try {
    // Criar blob com o HTML
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Abrir em nova aba
    const janela = window.open(url, '_blank', 'width=800,height=1000,scrollbars=yes,resizable=yes');
    
    if (janela) {
      // Aguardar carregamento e imprimir
      janela.onload = () => {
        setTimeout(() => {
          if (janela && !janela.closed) {
            janela.focus();
            janela.print();
            
            // Limpar URL após impressão
            janela.onafterprint = () => {
              URL.revokeObjectURL(url);
            };
          }
        }, 500);
      };
      
      // Fallback se onload não funcionar
      setTimeout(() => {
        if (janela && !janela.closed) {
          janela.focus();
          janela.print();
        }
      }, 1500);
    } else {
      alert('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desabilitado.');
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Erro ao abrir recibo:', error);
    alert('Erro ao abrir o recibo para impressão. Tente novamente.');
  }
};