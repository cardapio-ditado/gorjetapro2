import { formatCurrency } from './currency';
import { getPeriodoSemana } from '../lib/dayjs';
import dayjs from '../lib/dayjs';

export interface DadosRecibo {
  colaborador: {
    nome_completo: string;
    funcao_nome: string;
  };
  periodo: {
    semana: number;
    ano: number;
  };
  totais: {
    total_vendas: number;
    percentual_aplicado: number;
    comissao_base: number;
    adicionais_total: number;
    descontos_total: number;
    adiantamentos_total: number;
    valor_liquido: number;
  };
  detalhamento: {
    vendas: Array<{
      data_venda: string;
      turno: string;
      valor_vendas: number;
      observacoes?: string;
    }>;
    adicionais: Array<{
      tipo: string;
      descricao: string;
      valor: number;
      data_referencia: string;
    }>;
    descontos: Array<{
      data_desconto: string;
      tipo_consumo: string;
      descricao: string;
      valor_desconto: number;
    }>;
    adiantamentos: Array<{
      data: string;
      valor: number;
      observacoes?: string;
    }>;
  };
  configuracao: {
    meta1_valor: number;
    meta2_valor: number;
    bonus_meta1_pct: number;
    bonus_meta2_pct: number;
    adiantamento_abate_saldo: boolean;
  };
}

const gerarReciboHTML = (dados: DadosRecibo): string => {
  const { colaborador, periodo, totais, detalhamento, configuracao } = dados;
  const { inicio, fim } = getPeriodoSemana(dados.periodo.semana, dados.periodo.ano);
  const dataEmissao = dayjs().format('DD/MM/YYYY [às] HH:mm');

  // Calcular bônus de meta
  let bonusMeta1 = 0;
  let bonusMeta2 = 0;

  if (dados.totais.total_vendas >= dados.configuracao.meta2_valor) {
    bonusMeta2 = dados.totais.total_vendas * dados.configuracao.bonus_meta2_pct;
  } else if (dados.totais.total_vendas >= dados.configuracao.meta1_valor) {
    bonusMeta1 = dados.totais.total_vendas * dados.configuracao.bonus_meta1_pct;
  }

  // Limitar detalhamento para caber em 1 página
  const maxItens = 8;
  const vendasLimitadas = dados.detalhamento.vendas.slice(0, maxItens);
  const adicionaisLimitadas = dados.detalhamento.adicionais.slice(0, maxItens);
  const descontosLimitados = dados.detalhamento.descontos.slice(0, maxItens);
  const adiantamentosLimitados = dados.detalhamento.adiantamentos.slice(0, maxItens);

  const vendasExtras = dados.detalhamento.vendas.length - vendasLimitadas.length;
  const adicionaisExtras = dados.detalhamento.adicionais.length - adicionaisLimitadas.length;
  const descontosExtras = dados.detalhamento.descontos.length - descontosLimitados.length;
  const adiantamentosExtras = dados.detalhamento.adiantamentos.length - adiantamentosLimitados.length;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo de Gorjeta - ${dados.colaborador.nome_completo}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    
    .header {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    
    .company-name {
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    
    .document-title {
      font-size: 14px;
      font-weight: bold;
      margin-top: 5px;
    }
    
    .period-info {
      font-size: 12px;
      margin-top: 3px;
    }
    
    .employee-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
      padding: 8px;
      border: 1px solid #ccc;
      background: #f9f9f9;
    }
    
    .section {
      margin-bottom: 12px;
    }
    
    .section-title {
      font-size: 12px;
      font-weight: bold;
      border-bottom: 1px solid #ccc;
      padding-bottom: 2px;
      margin-bottom: 5px;
    }
    
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    
    .table th,
    .table td {
      border: 1px solid #ccc;
      padding: 4px 6px;
      text-align: left;
    }
    
    .table th {
      background: #f0f0f0;
      font-weight: bold;
      font-size: 10px;
    }
    
    .table td {
      font-size: 10px;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    .summary-table {
      margin-top: 15px;
    }
    
    .summary-table td {
      padding: 6px;
      font-size: 11px;
    }
    
    .total-row {
      font-weight: bold;
      background: #f0f0f0;
    }
    
    .liquido-row {
      font-weight: bold;
      font-size: 13px;
      background: #e0e0e0;
    }
    
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 10px;
      color: #666;
      border-top: 1px solid #ccc;
      padding-top: 10px;
    }
    
    .extras {
      font-style: italic;
      color: #666;
      font-size: 9px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">DITADO POPULAR</div>
    <div class="document-title">RECIBO DE GORJETA</div>
    <div class="period-info">Semana ${dados.periodo.semana}/${dados.periodo.ano} – ${inicio} a ${fim}</div>
  </div>

  <div class="employee-info">
    <div>
      <strong>Funcionário:</strong> ${dados.colaborador.nome_completo}<br>
      <strong>Função:</strong> ${dados.colaborador.funcao_nome}
    </div>
    <div>
      <strong>Período:</strong> ${inicio} a ${fim}<br>
      <strong>Data Emissão:</strong> ${dataEmissao}
    </div>
  </div>

  <div class="section">
    <div class="section-title">PROVENTOS</div>
    <table class="table">
      <thead>
        <tr>
          <th>Descrição</th>
          <th class="text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Gorjeta Base (${dados.totais.percentual_aplicado.toFixed(4)}% sobre vendas)</td>
          <td class="text-right">${formatCurrency(dados.totais.comissao_base)}</td>
        </tr>
        ${bonusMeta1 > 0 ? `
        <tr>
          <td>Bônus Meta 1 (${dados.configuracao.bonus_meta1_pct.toFixed(4)}% - ${formatCurrency(dados.configuracao.meta1_valor)})</td>
          <td class="text-right">${formatCurrency(bonusMeta1)}</td>
        </tr>
        ` : ''}
        ${bonusMeta2 > 0 ? `
        <tr>
          <td>Bônus Meta 2 (${dados.configuracao.bonus_meta2_pct.toFixed(4)}% - ${formatCurrency(dados.configuracao.meta2_valor)})</td>
          <td class="text-right">${formatCurrency(bonusMeta2)}</td>
        </tr>
        ` : ''}
        ${dados.totais.adicionais_total > 0 ? `
        <tr>
          <td>Gorjetas Adicionais</td>
          <td class="text-right">${formatCurrency(dados.totais.adicionais_total)}</td>
        </tr>
        ` : ''}
        <tr class="total-row">
          <td><strong>TOTAL PROVENTOS</strong></td>
          <td class="text-right"><strong>${formatCurrency(dados.totais.comissao_base + bonusMeta1 + bonusMeta2 + dados.totais.adicionais_total)}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>

  ${dados.totais.descontos_total > 0 || dados.totais.adiantamentos_total > 0 ? `
  <div class="section">
    <div class="section-title">DESCONTOS</div>
    <table class="table">
      <thead>
        <tr>
          <th>Descrição</th>
          <th class="text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${dados.totais.descontos_total > 0 ? `
        <tr>
          <td>Descontos de Consumo</td>
          <td class="text-right">${formatCurrency(dados.totais.descontos_total)}</td>
        </tr>
        ` : ''}
        ${dados.totais.adiantamentos_total > 0 && dados.configuracao.adiantamento_abate_saldo ? `
        <tr>
          <td>Adiantamentos (Vales)</td>
          <td class="text-right">${formatCurrency(dados.totais.adiantamentos_total)}</td>
        </tr>
        ` : ''}
        <tr class="total-row">
          <td><strong>TOTAL DESCONTOS</strong></td>
          <td class="text-right"><strong>${formatCurrency(dados.totais.descontos_total + (dados.configuracao.adiantamento_abate_saldo ? dados.totais.adiantamentos_total : 0))}</strong></td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  <table class="summary-table table">
    <tr class="liquido-row">
      <td><strong>VALOR LÍQUIDO A RECEBER</strong></td>
      <td class="text-right"><strong>${formatCurrency(dados.totais.valor_liquido)}</strong></td>
    </tr>
  </table>

  ${vendasLimitadas.length > 0 ? `
  <div class="section">
    <div class="section-title">DETALHAMENTO DE VENDAS</div>
    <table class="table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Turno</th>
          <th class="text-right">Valor</th>
          <th>Observações</th>
        </tr>
      </thead>
      <tbody>
        ${vendasLimitadas.map(venda => `
        <tr>
          <td>${dayjs(venda.data_venda).format('DD/MM')}</td>
          <td>${venda.turno}</td>
          <td class="text-right">${formatCurrency(venda.valor_vendas)}</td>
          <td>${venda.observacoes || '-'}</td>
        </tr>
        `).join('')}
        ${vendasExtras > 0 ? `
        <tr class="extras">
          <td colspan="4">+ ${vendasExtras} vendas adicionais</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${adicionaisLimitadas.length > 0 ? `
  <div class="section">
    <div class="section-title">GORJETAS ADICIONAIS</div>
    <table class="table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Descrição</th>
          <th class="text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${adicionaisLimitadas.map(adicional => `
        <tr>
          <td>${dayjs(adicional.data_referencia).format('DD/MM')}</td>
          <td>${adicional.tipo}</td>
          <td>${adicional.descricao}</td>
          <td class="text-right">${formatCurrency(adicional.valor)}</td>
        </tr>
        `).join('')}
        ${adicionaisExtras > 0 ? `
        <tr class="extras">
          <td colspan="4">+ ${adicionaisExtras} itens adicionais</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${descontosLimitados.length > 0 ? `
  <div class="section">
    <div class="section-title">DESCONTOS DE CONSUMO</div>
    <table class="table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Descrição</th>
          <th class="text-right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${descontosLimitados.map(desconto => `
        <tr>
          <td>${dayjs(desconto.data_desconto).format('DD/MM')}</td>
          <td>${desconto.tipo_consumo}</td>
          <td>${desconto.descricao}</td>
          <td class="text-right">${formatCurrency(desconto.valor_desconto)}</td>
        </tr>
        `).join('')}
        ${descontosExtras > 0 ? `
        <tr class="extras">
          <td colspan="4">+ ${descontosExtras} descontos adicionais</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    Documento gerado em ${dataEmissao}<br>
    Sistema Gorjeta Pro - Ditado Popular<br>
    ${dados.colaborador.nome_completo} - Semana ${dados.periodo.semana}/${dados.periodo.ano}
  </div>
</body>
</html>
  `.trim();
};

// Função para baixar recibo como HTML
const baixarReciboHTML = (dados: DadosRecibo) => {
  const html = gerarReciboHTML(dados);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `recibo-gorjeta-${dados.colaborador.nome_completo.replace(/\s+/g, '-')}-semana-${dados.periodo.semana}-${dados.periodo.ano}.html`;
  link.click();
  
  URL.revokeObjectURL(url);
};

// Função para imprimir recibo
export const imprimirRecibo = (dados: DadosRecibo) => {
  // Validar dados mínimos necessários
  if (!dados || !dados.colaborador || !dados.periodo) {
    alert('Dados insuficientes para gerar o recibo. Verifique se o colaborador e período estão definidos.');
    return;
  }

  const html = gerarReciboHTML(dados);
  
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
        }, 1000);
      };
      
      // Fallback se onload não funcionar
      setTimeout(() => {
        if (janela && !janela.closed) {
          janela.focus();
          janela.print();
        }
      }, 2000);
    } else {
      alert('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está desabilitado.');
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Erro ao abrir recibo:', error);
    alert('Erro ao abrir o recibo para impressão. Tente novamente.');
  }
};