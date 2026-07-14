/**
 * Utilitário para impressão térmica de documentos
 * Formato otimizado para impressoras térmicas de 80mm
 */

interface RequisiçãoInterna {
  numero_requisicao: string;
  data_requisicao: string;
  funcionario_nome: string;
  setor: string;
  estoque_origem?: { nome: string };
  estoque_destino?: { nome: string };
  observacoes?: string;
  itens: Array<{
    itens_estoque: { nome: string; unidade_medida: string };
    quantidade_solicitada: number;
  }>;
}

/**
 * Formata data no padrão brasileiro
 */
function formatarData(dataISO: string): string {
  const data = new Date(dataISO);
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formata hora no padrão brasileiro
 */
function formatarHora(dataISO: string): string {
  const data = new Date(dataISO);
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formata quantidade para exibição
 */
function formatarQuantidade(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

/**
 * Gera HTML otimizado para impressão térmica (80mm)
 */
export function gerarImpressaoTermicaRequisicao(requisicao: RequisiçãoInterna): void {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Requisição ${requisicao.numero_requisicao}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: 80mm auto;
      margin: 0;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.4;
      color: #000;
      background: #fff;
      width: 80mm;
      max-width: 80mm;
      margin: 0;
      padding: 10px;
    }

    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .empresa {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .titulo {
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .numero {
      font-size: 11px;
      font-weight: bold;
    }

    .linha {
      display: table;
      width: 100%;
      margin: 5px 0;
    }

    .linha-col {
      display: table-cell;
      padding: 2px 0;
    }

    .linha-col.esquerda {
      text-align: left;
      width: 35%;
      font-weight: bold;
    }

    .linha-col.direita {
      text-align: right;
      width: 65%;
    }

    .divisor {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }

    .secao {
      margin: 8px 0;
    }

    .label {
      font-weight: bold;
      display: inline-block;
      min-width: 70px;
    }

    .itens-header {
      display: table;
      width: 100%;
      font-weight: bold;
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
      margin: 8px 0 5px 0;
    }

    .itens-header-col {
      display: table-cell;
    }

    .itens-header-col.item-nome {
      width: 60%;
    }

    .itens-header-col.item-qtd {
      width: 40%;
      text-align: right;
    }

    .item {
      display: table;
      width: 100%;
      margin: 4px 0;
    }

    .item-col {
      display: table-cell;
      padding: 2px 0;
    }

    .item-col.nome {
      width: 60%;
    }

    .item-col.qtd {
      width: 40%;
      text-align: right;
      font-weight: bold;
    }

    .obs {
      margin: 10px 0;
      padding: 5px;
      border: 1px solid #000;
      font-size: 9px;
    }

    .assinatura {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 2px dashed #000;
      text-align: center;
    }

    .assinatura-linha {
      margin-top: 30px;
      padding-top: 2px;
      border-top: 1px solid #000;
      font-size: 9px;
    }

    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 2px dashed #000;
      text-align: center;
      font-size: 8px;
    }

    @media print {
      body {
        padding: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="empresa">DITADO POPULAR</div>
    <div class="titulo">REQUISIÇÃO INTERNA</div>
    <div class="numero">${requisicao.numero_requisicao}</div>
  </div>

  <div class="linha">
    <div class="linha-col esquerda">Data:</div>
    <div class="linha-col direita">${formatarData(requisicao.data_requisicao)}</div>
  </div>

  <div class="linha">
    <div class="linha-col esquerda">Hora:</div>
    <div class="linha-col direita">${formatarHora(requisicao.data_requisicao)}</div>
  </div>

  <div class="divisor"></div>

  <div class="secao">
    <div class="linha">
      <div class="linha-col esquerda">Funcionário:</div>
      <div class="linha-col direita">${requisicao.funcionario_nome}</div>
    </div>
    <div class="linha">
      <div class="linha-col esquerda">Setor:</div>
      <div class="linha-col direita">${requisicao.setor}</div>
    </div>
  </div>

  <div class="divisor"></div>

  <div class="secao">
    <div class="linha">
      <div class="linha-col esquerda">De:</div>
      <div class="linha-col direita">${requisicao.estoque_origem?.nome || '-'}</div>
    </div>
    <div class="linha">
      <div class="linha-col esquerda">Para:</div>
      <div class="linha-col direita">${requisicao.estoque_destino?.nome || '-'}</div>
    </div>
  </div>

  <div class="divisor"></div>

  <div class="itens-header">
    <div class="itens-header-col item-nome">ITEM</div>
    <div class="itens-header-col item-qtd">QUANTIDADE</div>
  </div>

  ${requisicao.itens.map((item, index) => `
  <div class="item">
    <div class="item-col nome">${index + 1}. ${item.itens_estoque.nome}</div>
    <div class="item-col qtd">${formatarQuantidade(item.quantidade_solicitada)} ${item.itens_estoque.unidade_medida}</div>
  </div>
  `).join('')}

  ${requisicao.observacoes ? `
  <div class="divisor"></div>
  <div class="obs">
    <strong>Observações:</strong><br>
    ${requisicao.observacoes}
  </div>
  ` : ''}

  <div class="assinatura">
    <div style="font-weight: bold; margin-bottom: 5px;">ASSINATURA DO SOLICITANTE</div>
    <div class="assinatura-linha">${requisicao.funcionario_nome}</div>
  </div>

  <div class="footer">
    <div>Impresso em: ${formatarData(new Date().toISOString())} ${formatarHora(new Date().toISOString())}</div>
  </div>

  <script>
    console.log('Documento carregado, preparando impressão...');

    function imprimir() {
      console.log('Disparando impressão...');
      window.print();
    }

    function fechar() {
      console.log('Fechando janela...');
      setTimeout(() => window.close(), 500);
    }

    if (document.readyState === 'complete') {
      setTimeout(imprimir, 300);
    } else {
      window.addEventListener('load', () => {
        setTimeout(imprimir, 300);
      });
    }

    window.addEventListener('afterprint', fechar);
  </script>
</body>
</html>
  `;

  // Criar blob do HTML
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // Abrir em nova janela
  const printWindow = window.open(url, '_blank', 'width=320,height=600');

  if (!printWindow) {
    alert('Pop-up bloqueado! Permita pop-ups para imprimir.');
    URL.revokeObjectURL(url);
    return;
  }

  // Limpar URL após uso
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 5000);
}
