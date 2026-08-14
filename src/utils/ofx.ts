// Parser tolerante de arquivos OFX (SGML ou XML) exportados por bancos.
// Extrai apenas os blocos <STMTTRN> — data, valor, descrição e FITID.
export interface OfxTransacao {
  fitid: string;
  data: string; // YYYY-MM-DD
  valor: number; // positivo = crédito, negativo = débito
  descricao: string;
}

export function parseOfx(texto: string): OfxTransacao[] {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  return blocos
    .map((bloco) => {
      const corpo = bloco.split(/<\/STMTTRN>/i)[0];
      const pega = (tag: string): string => {
        const m = corpo.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i'));
        return m ? m[1].trim() : '';
      };
      const dt = pega('DTPOSTED');
      const data = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : '';
      const valor = parseFloat(pega('TRNAMT').replace(',', '.'));
      const descricao = pega('MEMO') || pega('NAME') || '';
      const fitid = pega('FITID') || `${data}|${valor}|${descricao}`.slice(0, 80);
      return { fitid, data, valor, descricao };
    })
    .filter((t) => t.data !== '' && isFinite(t.valor) && t.valor !== 0);
}
