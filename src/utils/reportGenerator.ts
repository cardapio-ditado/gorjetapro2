import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ReportConfig {
  title: string;
  subtitle?: string;
  filename: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
}

export class ReportGenerator {
  public pdf: jsPDF;

  constructor(config?: ReportConfig) {
    this.pdf = new jsPDF({
      orientation: config?.orientation || 'portrait',
      unit: 'mm',
      format: config?.format || 'a4'
    });
  }

  // Adicionar cabeçalho padrão
  addHeader(title: string, subtitle?: string | string[]) {
    const pageWidth = this.pdf.internal.pageSize.getWidth();
    const margin = 15;

    // Logo/Título principal
    this.pdf.setFontSize(18);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(125, 31, 44);
    this.pdf.text('DITADO POPULAR - SISTEMA DE GESTÃO', pageWidth / 2, 15, { align: 'center' });

    // Título do relatório
    this.pdf.setFontSize(14);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text(title, pageWidth / 2, 25, { align: 'center' });

    let currentY = 32;

    // Subtítulo(s)
    if (subtitle) {
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(80, 80, 80);

      if (Array.isArray(subtitle)) {
        subtitle.forEach((line, index) => {
          this.pdf.text(line, pageWidth / 2, currentY + (index * 5), { align: 'center' });
        });
        currentY += (subtitle.length * 5);
      } else {
        this.pdf.text(subtitle, pageWidth / 2, currentY, { align: 'center' });
        currentY += 5;
      }
    }

    // Linha separadora
    this.pdf.setLineWidth(0.5);
    this.pdf.setDrawColor(125, 31, 44);
    this.pdf.line(margin, currentY + 3, pageWidth - margin, currentY + 3);

    // Resetar cores
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.setDrawColor(0, 0, 0);

    return currentY + 10; // Retorna a posição Y após o cabeçalho
  }

  // Adicionar rodapé
  addFooter() {
    const pageWidth = this.pdf.internal.pageSize.getWidth();
    const pageHeight = this.pdf.internal.pageSize.getHeight();
    
    // Posição fixa do rodapé com mais espaço
    const footerY = pageHeight - 15;
    
    // Linha separadora
    this.pdf.setLineWidth(0.3);
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.line(20, footerY - 6, pageWidth - 20, footerY - 6);
    
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(100, 100, 100);
    
    // Textos do rodapé
    this.pdf.text('Ditado Popular - Relatório Confidencial', pageWidth / 2, footerY - 2, { align: 'center' });
    
    // Número da página
    const pageNumber = this.pdf.internal.getCurrentPageInfo().pageNumber;
    this.pdf.text(`Página ${pageNumber}`, pageWidth - 20, footerY - 2, { align: 'right' });
    
    // Data de geração
    const dataGeracao = new Date().toLocaleDateString('pt-BR');
    this.pdf.text(`Gerado em: ${dataGeracao}`, 20, footerY - 2, { align: 'left' });
    
    // Resetar cor do texto
    this.pdf.setTextColor(0, 0, 0);
  }

  // Adicionar tabela
  addTable(headers: string[], data: any[][], startY: number = 70) {
    const pageWidth = this.pdf.internal.pageSize.getWidth();
    const pageHeight = this.pdf.internal.pageSize.getHeight();
    const margin = 20;
    const tableWidth = pageWidth - (margin * 2);
    
    // Para paisagem, usar larguras fixas mais equilibradas
    const isLandscape = pageWidth > pageHeight;
    const colWidths = isLandscape ? 
      this.calculateFixedColumnWidths(headers, tableWidth) : 
      this.calculateColumnWidths(headers, data, tableWidth);
    
    let currentY = startY;

    // Altura das linhas ajustada para paisagem
    const estimatedRowHeight = isLandscape ? 6 : 8;
    const headerHeight = 7;

    // Cabeçalho da tabela
    this.pdf.setFillColor(125, 31, 44); // Cor do tema
    this.pdf.rect(margin, currentY, tableWidth, headerHeight, 'F');
    
    this.pdf.setTextColor(255, 255, 255);
    this.pdf.setFontSize(isLandscape ? 9 : 8);
    this.pdf.setFont('helvetica', 'bold');
    
    let xPos = margin + 2;
    headers.forEach((header, index) => {
      this.pdf.text(header, xPos, currentY + 5);
      xPos += colWidths[index];
    });
    
    currentY += headerHeight;
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setFontSize(isLandscape ? 8 : 7);

    // Dados da tabela
    data.forEach((row, rowIndex) => {
      // Nova página se necessário
      if (currentY + estimatedRowHeight > pageHeight - margin) {
        this.pdf.addPage();
        currentY = margin;
        // Repetir cabeçalho na nova página
        this.pdf.setFillColor(125, 31, 44);
        this.pdf.rect(margin, currentY, tableWidth, headerHeight, 'F');
        this.pdf.setTextColor(255, 255, 255);
        this.pdf.setFontSize(isLandscape ? 9 : 8);
        this.pdf.setFont('helvetica', 'bold');
        xPos = margin + 2;
        headers.forEach((header, index) => {
          this.pdf.text(header, xPos, currentY + 5);
          xPos += colWidths[index];
        });
        currentY += headerHeight;
        this.pdf.setTextColor(0, 0, 0);
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setFontSize(isLandscape ? 8 : 7);
      }

      // Cor alternada para linhas
      if (rowIndex % 2 === 0) {
        this.pdf.setFillColor(248, 249, 250);
        this.pdf.rect(margin, currentY, tableWidth, estimatedRowHeight, 'F');
      }

      xPos = margin + 2;
      row.forEach((cell, cellIndex) => {
        const cellText = String(cell);
        const maxWidth = colWidths[cellIndex] - 4;
        
        // Para paisagem, usar quebra mais simples
        const lines = isLandscape ? 
          this.simpleWrapText(cellText, maxWidth) : 
          this.wrapText(cellText, maxWidth);
        
        // Alinhar números à direita, texto à esquerda
        const isNumber = !isNaN(parseFloat(cellText.replace(/[R$\s.,%]/g, '').replace(',', '.'))) && (cellText.includes('R$') || cellText.includes('%'));
        const align = isNumber ? 'right' : 'left';
        
        // Renderizar cada linha
        lines.forEach((line, lineIndex) => {
          const textX = align === 'right' ? xPos + colWidths[cellIndex] - 2 : xPos;
          const textY = currentY + 2.5 + (lineIndex * 2.5); // Espaçamento menor para paisagem
          this.pdf.text(line, textX, textY, { align });
        });
        
        xPos += colWidths[cellIndex];
      });
      
      currentY += estimatedRowHeight;
    });

    return currentY + 10;
  }

  addBankStatementTable(headers: string[], data: any[][], startY: number = 70) {
    const pageWidth = this.pdf.internal.pageSize.getWidth();
    const pageHeight = this.pdf.internal.pageSize.getHeight();
    const margin = 20;
    const tableWidth = pageWidth - (margin * 2);
    
    // Larguras fixas otimizadas para retrato
    const colWidths = this.calculateBankStatementWidths(headers, tableWidth);
    
    const rowHeight = 8; // Altura reduzida para caber mais dados
    const headerHeight = 10; // Altura do cabeçalho

    // Cabeçalho da tabela
    this.pdf.setFillColor(125, 31, 44);
    this.pdf.rect(margin, startY, tableWidth, headerHeight, 'F');
    
    this.pdf.setTextColor(255, 255, 255);
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'bold');
    
    let xPos = margin + 2;
    headers.forEach((header, index) => {
      this.pdf.text(header, xPos, startY + 5);
      xPos += colWidths[index];
    });
    
    let currentY = startY + headerHeight;
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setFontSize(7);

    // Dados da tabela
    data.forEach((row, rowIndex) => {
      // Nova página se necessário
      if (currentY + rowHeight > pageHeight - 50) { // Mais espaço para rodapé
        this.pdf.addPage();
        currentY = margin;
        // Repetir cabeçalho
        this.pdf.setFillColor(125, 31, 44);
        this.pdf.rect(margin, currentY, tableWidth, headerHeight, 'F');
        this.pdf.setTextColor(255, 255, 255);
        this.pdf.setFontSize(8);
        this.pdf.setFont('helvetica', 'bold');
        xPos = margin + 2;
        headers.forEach((header, index) => {
          this.pdf.text(header, xPos, currentY + 5);
          xPos += colWidths[index];
        });
        currentY += headerHeight;
        this.pdf.setTextColor(0, 0, 0);
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setFontSize(7);
      }

      // Cor alternada para linhas
      if (rowIndex % 2 === 0) {
        this.pdf.setFillColor(248, 249, 250);
        this.pdf.rect(margin, currentY, tableWidth, rowHeight, 'F');
      }

      xPos = margin + 2;
      row.forEach((cell, cellIndex) => {
        const cellText = String(cell || '');
        const maxWidth = colWidths[cellIndex] - 4;
        
        // Para valores monetários, usar fonte menor para caber
        const isMonetary = cellText.includes('R$');
        const isNumber = !isNaN(parseFloat(cellText.replace(/[R$\s.,%]/g, '').replace(',', '.'))) && 
                        (cellText.includes('R$') || cellText.includes('%') || /^\d+$/.test(cellText));
        
        if (isMonetary) {
          this.pdf.setFont('helvetica', 'normal');
          this.pdf.setFontSize(6); // Fonte menor para valores monetários caberem
        } else if (isNumber) {
          this.pdf.setFont('helvetica', 'normal');
          this.pdf.setFontSize(7);
        } else {
          this.pdf.setFont('helvetica', 'normal');
          this.pdf.setFontSize(7);
        }
        
        // Quebrar texto se necessário - NUNCA truncar valores
        const lines = this.wrapTextForBankStatement(cellText, maxWidth, isMonetary || isNumber);
        
        // Alinhar números à direita, texto à esquerda
        const align = isNumber ? 'right' : 'left';
        
        // Renderizar cada linha
        lines.forEach((line, lineIndex) => {
          const textX = align === 'right' ? xPos + colWidths[cellIndex] - 2 : xPos + 2;
          const textY = currentY + 4 + (lineIndex * 2.5);
          this.pdf.text(line, textX, textY, { align });
        });
        
        // Resetar fonte
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setFontSize(7);
        
        xPos += colWidths[cellIndex];
      });
      
      currentY += rowHeight;
    });

    return currentY + 10;
  }

  // Calcular larguras específicas para extrato bancário
  private calculateBankStatementWidths(headers: string[], totalWidth: number): number[] {
    const numCols = headers.length;
    
    // Larguras específicas para cada tipo de relatório
    if (numCols === 6 && headers.includes('Saldo')) { // Extrato bancário - 6 colunas
      return [
        totalWidth * 0.15, // Data (15%)
        totalWidth * 0.10, // Hora (10%)
        totalWidth * 0.35, // Descrição (35%) - Mais espaço
        totalWidth * 0.13, // Débito (13%) - Reduzido
        totalWidth * 0.13, // Crédito (13%) - Reduzido
        totalWidth * 0.14  // Saldo (14%) - Aumentado para valores grandes
      ];
    } else if (numCols === 6 && (headers.includes('Categoria') || headers.includes('% Ent.'))) { // Tabela de categorias
      return [
        totalWidth * 0.32, // Categoria (32%)
        totalWidth * 0.17, // Entradas (17%)
        totalWidth * 0.17, // Saídas (17%)
        totalWidth * 0.17, // Saldo (17%)
        totalWidth * 0.085, // % Ent. (8.5%)
        totalWidth * 0.085  // % Saí. (8.5%)
      ];
    } else if (numCols === 7) { // Tabela de contas
      return [
        totalWidth * 0.24, // Conta/Banco (24%)
        totalWidth * 0.11, // Tipo (11%)
        totalWidth * 0.13, // Sld. Inicial (13%)
        totalWidth * 0.13, // Entradas (13%)
        totalWidth * 0.13, // Saídas (13%)
        totalWidth * 0.13, // Sld. Final (13%)
        totalWidth * 0.13  // Movs. (13%)
      ];
    } else if (numCols === 2) { // Resumo executivo
      return [
        totalWidth * 0.50, // Indicador (50%)
        totalWidth * 0.50  // Valor (50%)
      ];
    } else {
      // Distribuição igual para outras tabelas
      const colWidth = totalWidth / numCols;
      return Array(numCols).fill(colWidth);
    }
  }

  // Quebra de texto específica para extrato bancário
  private wrapTextForBankStatement(text: string, maxWidth: number, isMonetary: boolean = false): string[] {
    // Para valores monetários e números, NUNCA quebrar
    if (isMonetary || text.includes('R$') || text.includes('%') || /^\d+[\d.,]*$/.test(text)) {
      // Valores sempre completos, mesmo que ultrapassem
      return [text];
    }

    // Para texto normal, quebrar em palavras
    if (this.pdf.getTextWidth(text) <= maxWidth) {
      return [text];
    }
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.pdf.getTextWidth(testLine);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Palavra muito longa, truncar com cuidado
          let truncated = word;
          while (this.pdf.getTextWidth(truncated + '...') > maxWidth && truncated.length > 3) {
            truncated = truncated.slice(0, -1);
          }
          lines.push(truncated.length < word.length ? truncated + '...' : word);
          currentLine = '';
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Para retrato, permitir até 1 linha para evitar sobreposição
    return lines.slice(0, 1);
  }

  // Método simples para quebra de texto em paisagem
  private simpleWrapText(text: string, maxWidth: number): string[] {
    // Para paisagem, usar truncamento mais agressivo
    if (this.pdf.getTextWidth(text) <= maxWidth) {
      return [text];
    }
    
    // Truncar com ... se muito longo
    let truncated = text;
    while (this.pdf.getTextWidth(truncated + '...') > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return [truncated + '...'];
  }

  // Método para quebrar texto em múltiplas linhas (retrato)
  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.pdf.getTextWidth(testLine);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Palavra muito longa, truncar
          let truncated = word;
          while (this.pdf.getTextWidth(truncated + '...') > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          lines.push(truncated + '...');
          currentLine = '';
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Limitar a 2 linhas máximo
    return lines.slice(0, 2);
  }

  // Calcular larguras fixas para paisagem
  private calculateFixedColumnWidths(headers: string[], totalWidth: number): number[] {
    const numCols = headers.length;
    
    // Distribuição inteligente baseada no tipo de coluna
    if (numCols === 6) { // Tabela de categorias
      const baseWidth = totalWidth / numCols;
      return [
        baseWidth * 2.2, // Categoria (mais espaço)
        baseWidth * 0.9, // Entradas
        baseWidth * 0.9, // Saídas
        baseWidth * 0.9, // Saldo
        baseWidth * 0.5, // % Ent.
        baseWidth * 0.5  // % Saí.
      ];
    } else if (numCols === 7) { // Tabela de contas
      const baseWidth = totalWidth / numCols;
      return [
        baseWidth * 1.8, // Conta/Banco
        baseWidth * 0.7, // Tipo
        baseWidth * 1.0, // Sld. Inicial
        baseWidth * 1.0, // Entradas
        baseWidth * 1.0, // Saídas
        baseWidth * 1.0, // Sld. Final
        baseWidth * 0.5  // Movs.
      ];
    } else {
      // Distribuição igual para outras tabelas
      const colWidth = totalWidth / numCols;
      return Array(numCols).fill(colWidth);
    }
  }

  // Calcular larguras das colunas dinamicamente
  private calculateColumnWidths(headers: string[], data: any[][], totalWidth: number): number[] {
    const numCols = headers.length;
    const minColWidth = 15;
    const padding = 4; // Padding para o texto dentro da célula

    // Calcular largura máxima necessária para cada coluna
    const colWidths = headers.map((header, index) => {
      let maxWidth = this.pdf.getTextWidth(header) + padding;

      data.forEach(row => {
        if (row[index] !== undefined && row[index] !== null) {
          const cellText = String(row[index]);
          const cellWidth = this.pdf.getTextWidth(cellText) + padding;
          maxWidth = Math.max(maxWidth, cellWidth);
        }
      });
      return maxWidth;
    });

    // Distribuir o espaço restante ou ajustar se a soma for maior que o totalWidth
    const totalCalculatedWidth = colWidths.reduce((sum, width) => sum + width, 0);

    if (totalCalculatedWidth < totalWidth) {
      // Se há espaço sobrando, distribuir igualmente
      const remainingSpace = totalWidth - totalCalculatedWidth;
      const spacePerCol = remainingSpace / numCols;
      return colWidths.map(width => width + spacePerCol);
    } else if (totalCalculatedWidth > totalWidth) {
      // Se a soma excede o totalWidth, escalar proporcionalmente
      const scaleFactor = totalWidth / totalCalculatedWidth;
      return colWidths.map(width => Math.max(width * scaleFactor, minColWidth));
    }

    return colWidths;
  }

  // Adicionar texto
  addText(text: string, x: number, y: number, options?: any) {
    this.pdf.text(text, x, y, options);
  }

  // Adicionar seção
  addSection(title: string, content: string[], startY: number) {
    this.pdf.setFontSize(14);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(title, 20, startY);
    
    let currentY = startY + 10;
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'normal');
    
    content.forEach(line => {
      this.pdf.text(line, 25, currentY);
      currentY += 5;
    });
    
    return currentY + 5;
  }

  // Capturar elemento HTML e adicionar ao PDF
  async addElementAsPDF(elementId: string, startY: number = 70) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Elemento com ID ${elementId} não encontrado`);
      return startY;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 170; // Largura em mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Verificar se precisa de nova página
      if (startY + imgHeight > 250) {
        this.pdf.addPage();
        startY = 20;
      }
      
      this.pdf.addImage(imgData, 'PNG', 20, startY, imgWidth, imgHeight);
      return startY + imgHeight + 10;
    } catch (error) {
      console.error('Erro ao capturar elemento:', error);
      return startY;
    }
  }

  // Salvar PDF
  save(filename: string) {
    // CORRIGIDO: Adicionar rodapé apenas se não foi adicionado ainda
    const currentPage = this.pdf.internal.getCurrentPageInfo().pageNumber;
    if (currentPage > 0) {
      this.addFooter();
    }
    this.pdf.save(filename);
  }

  // Obter blob do PDF
  getBlob(): Blob {
    // CORRIGIDO: Adicionar rodapé apenas se não foi adicionado ainda
    const currentPage = this.pdf.internal.getCurrentPageInfo().pageNumber;
    if (currentPage > 0) {
      this.addFooter();
    }
    return this.pdf.output('blob');
  }

  // Método específico para relatório de fluxo de caixa com formatação perfeita
  addFluxoCaixaTable(headers: string[], data: any[][], startY: number, kpisData?: any[][]) {
    const pageWidth = this.pdf.internal.pageSize.getWidth();
    const pageHeight = this.pdf.internal.pageSize.getHeight();
    const margin = 15;
    const tableWidth = pageWidth - (margin * 2);

    let currentY = startY;

    // Se há KPIs, adicionar primeiro
    if (kpisData && kpisData.length > 0) {
      this.pdf.setFontSize(11);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(125, 31, 44);
      this.pdf.text('INDICADORES FINANCEIROS', margin, currentY);
      currentY += 8;

      // Box com KPIs
      const kpiBoxHeight = (kpisData.length * 7) + 4;
      this.pdf.setDrawColor(200, 200, 200);
      this.pdf.setLineWidth(0.3);
      this.pdf.rect(margin, currentY, tableWidth, kpiBoxHeight);

      this.pdf.setFontSize(8);
      this.pdf.setTextColor(0, 0, 0);
      let kpiY = currentY + 5;

      kpisData.forEach((kpi) => {
        // Label
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.text(kpi[0], margin + 3, kpiY);

        // Valor
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.text(kpi[1], pageWidth - margin - 3, kpiY, { align: 'right' });

        kpiY += 7;
      });

      currentY += kpiBoxHeight + 12;
    }

    // Título da tabela de transações
    this.pdf.setFontSize(11);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(125, 31, 44);
    this.pdf.text('EXTRATO DETALHADO DE TRANSAÇÕES', margin, currentY);
    currentY += 8;

    // Larguras fixas otimizadas para as 6 colunas do fluxo de caixa
    // Paisagem tem ~267mm de largura útil
    const isLandscape = pageWidth > pageHeight;
    const colWidths = isLandscape ? [
      28,  // Data
      25,  // Tipo
      120, // Descrição (muito mais espaço)
      30,  // Entrada
      30,  // Saída
      34   // Saldo
    ] : [
      22,  // Data
      18,  // Tipo
      60,  // Descrição
      25,  // Entrada
      25,  // Saída
      30   // Saldo
    ];

    const rowHeight = 7;
    const headerHeight = 8;

    // Cabeçalho da tabela
    this.pdf.setFillColor(125, 31, 44);
    this.pdf.rect(margin, currentY, tableWidth, headerHeight, 'F');

    this.pdf.setTextColor(255, 255, 255);
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'bold');

    let xPos = margin + 2;
    headers.forEach((header, index) => {
      // Alinhar cabeçalhos monetários à direita
      const isMonetaryHeader = ['Entrada', 'Saída', 'Saldo Acumulado', 'Valor'].includes(header);
      if (isMonetaryHeader) {
        this.pdf.text(header, xPos + colWidths[index] - 2, currentY + 5.5, { align: 'right' });
      } else {
        this.pdf.text(header, xPos + 2, currentY + 5.5);
      }
      xPos += colWidths[index];
    });

    currentY += headerHeight;

    // Dados da tabela
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setFontSize(7.5);

    data.forEach((row, rowIndex) => {
      // Nova página se necessário
      if (currentY + rowHeight > pageHeight - 25) {
        this.pdf.addPage();
        currentY = margin;

        // Repetir cabeçalho
        this.pdf.setFillColor(125, 31, 44);
        this.pdf.rect(margin, currentY, tableWidth, headerHeight, 'F');
        this.pdf.setTextColor(255, 255, 255);
        this.pdf.setFontSize(8);
        this.pdf.setFont('helvetica', 'bold');

        xPos = margin + 2;
        headers.forEach((header, index) => {
          const isMonetaryHeader = ['Entrada', 'Saída', 'Saldo Acumulado', 'Valor'].includes(header);
          if (isMonetaryHeader) {
            this.pdf.text(header, xPos + colWidths[index] - 2, currentY + 5.5, { align: 'right' });
          } else {
            this.pdf.text(header, xPos + 2, currentY + 5.5);
          }
          xPos += colWidths[index];
        });

        currentY += headerHeight;
        this.pdf.setTextColor(0, 0, 0);
        this.pdf.setFont('helvetica', 'normal');
        this.pdf.setFontSize(7.5);
      }

      // Linha zebrada
      if (rowIndex % 2 === 0) {
        this.pdf.setFillColor(250, 250, 250);
        this.pdf.rect(margin, currentY, tableWidth, rowHeight, 'F');
      }

      // Bordas laterais
      this.pdf.setDrawColor(220, 220, 220);
      this.pdf.setLineWidth(0.1);

      xPos = margin;
      row.forEach((cell, cellIndex) => {
        const cellText = String(cell || '');
        const cellWidth = colWidths[cellIndex];

        // Verificar se é valor monetário ou numérico
        const isMonetary = cellText.includes('R$');
        const isDash = cellText === '-';
        const isNumber = isMonetary || (!isDash && !isNaN(parseFloat(cellText.replace(/[R$\s.,%]/g, '').replace(',', '.'))));

        // Truncar descrição apenas se muito longa (coluna 2)
        let displayText = cellText;
        const maxDescriptionChars = isLandscape ? 100 : 35;
        if (cellIndex === 2 && cellText.length > maxDescriptionChars) {
          displayText = cellText.substring(0, maxDescriptionChars) + '...';
        }

        // Posição do texto
        const textY = currentY + 5;

        if (isNumber && !isDash) {
          // Números e valores à direita
          this.pdf.text(displayText, xPos + cellWidth - 2, textY, { align: 'right' });
        } else if (isDash) {
          // Traço centralizado
          this.pdf.text(displayText, xPos + (cellWidth / 2), textY, { align: 'center' });
        } else {
          // Texto à esquerda
          this.pdf.text(displayText, xPos + 2, textY);
        }

        // Linha vertical de separação
        if (cellIndex < row.length - 1) {
          this.pdf.line(xPos + cellWidth, currentY, xPos + cellWidth, currentY + rowHeight);
        }

        xPos += cellWidth;
      });

      // Linha horizontal inferior
      this.pdf.setDrawColor(220, 220, 220);
      this.pdf.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      currentY += rowHeight;
    });

    return currentY + 10;
  }

  // Método específico para relatório de fluxo de caixa
  generateFluxoCaixaReport(resumo: any[][], data: any[][], headers: string[], filename: string) {
    let currentY = this.addHeader('Relatório de Fluxo de Caixa', `Gerado em ${new Date().toLocaleDateString('pt-BR')}`);

    currentY = this.addSection('Resumo Executivo', [], currentY);
    currentY = this.addTable(['Indicador', 'Valor'], resumo, currentY);

    currentY = this.addSection('Movimentações Detalhadas', [], currentY + 10);
    this.addTable(headers, data, currentY);

    this.save(filename);
  }
}

// Função utilitária para formatar moeda
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

// Função utilitária para formatar data
const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('pt-BR');
};

// Função para exportar dados como CSV
const exportToCSV = (data: any[], filename: string, headers: string[]) => {
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      row.map(cell => {
        const value = cell || '';
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Função para exportar dados como Excel (usando CSV com extensão .xls)
export const exportToExcel = (data: any[], filename: string, headers: string[]) => {
  const csvContent = [
    headers.join('\t'),
    ...data.map(row => 
      row.map(cell => cell || '').join('\t')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};