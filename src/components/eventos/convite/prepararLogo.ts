/**
 * Prepara o logo do cliente para o convite: qualquer imagem (JPG do WhatsApp,
 * print, PNG, SVG) vira um PNG recortado, e o fundo liso (branco ou de uma cor
 * só) sai transparente.
 *
 * A cor do fundo é tirada da imagem inteira (também do miolo das letras). O que
 * era branco dentro do logo fica com a cor da faixa do convite, que é clara.
 */

const LADO_MAX = 1200;
const TOLERANCIA = 38;  // distância de cor (0–441) que ainda conta como fundo
const SUAVE = 34;       // faixa de transição, para a borda não ficar serrilhada

export interface LogoPreparado { blob: Blob; removeuFundo: boolean; aviso?: string }

function carregar(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não consegui abrir essa imagem. Use PNG, JPG, WEBP ou SVG.')); };
    img.src = url;
  });
}

export async function prepararLogo(arquivo: Blob, removerFundo = true): Promise<LogoPreparado> {
  const img = await carregar(arquivo);
  // SVG sem tamanho declarado vem com 0 ou 150: desenha grande
  const ehSvg = arquivo.type === 'image/svg+xml';
  const w0 = img.naturalWidth || 1000, h0 = img.naturalHeight || 1000;
  const escala = ehSvg ? LADO_MAX / Math.max(w0, h0) : Math.min(1, LADO_MAX / Math.max(w0, h0));
  const W = Math.max(1, Math.round(w0 * escala)), H = Math.max(1, Math.round(h0 * escala));

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, W, H);
  const dados = ctx.getImageData(0, 0, W, H);
  const px = dados.data;

  // bordas: já transparentes? fundo liso?
  const borda: number[] = [];
  for (let x = 0; x < W; x++) borda.push(x, (H - 1) * W + x);
  for (let y = 1; y < H - 1; y++) borda.push(y * W, y * W + W - 1);
  const transparentes = borda.filter(i => px[i * 4 + 3] < 16).length;
  let removeu = false;
  let aviso: string | undefined;

  if (removerFundo && transparentes / borda.length < 0.6) {
    const opacos = borda.filter(i => px[i * 4 + 3] >= 16);
    const mediana = (c: number) => { const v = opacos.map(i => px[i * 4 + c]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    const fundo = [mediana(0), mediana(1), mediana(2)];
    const dist = (i: number) => Math.hypot(px[i * 4] - fundo[0], px[i * 4 + 1] - fundo[1], px[i * 4 + 2] - fundo[2]);
    const parecidos = opacos.filter(i => dist(i) < TOLERANCIA).length / opacos.length;

    if (parecidos < 0.7) {
      aviso = 'O fundo da imagem não é liso (foto ou degradê), então ficou como está. Se puder, peça ao cliente o logo em PNG.';
    } else {
      for (let i = 0; i < W * H; i++) {
        const d = dist(i);
        if (d >= TOLERANCIA + SUAVE) continue;
        if (d < TOLERANCIA) { px[i * 4 + 3] = 0; continue; }
        // contorno: fica meio transparente e "descola" a cor do fundo misturada nele
        const alfa = (d - TOLERANCIA) / SUAVE;
        for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, Math.round((px[i * 4 + c] - (1 - alfa) * fundo[c]) / alfa)));
        px[i * 4 + 3] = Math.min(px[i * 4 + 3], Math.round(255 * alfa));
      }
      removeu = true;
    }
  }

  // recorta no que sobrou visível
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('A imagem ficou vazia depois de tirar o fundo. Tente com o fundo original.');
  ctx.putImageData(dados, 0, 0);
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const saida = document.createElement('canvas');
  saida.width = x1 - x0 + 1; saida.height = y1 - y0 + 1;
  saida.getContext('2d')!.drawImage(canvas, x0, y0, saida.width, saida.height, 0, 0, saida.width, saida.height);

  const blob = await new Promise<Blob>((ok, erro) => saida.toBlob(b => (b ? ok(b) : erro(new Error('Não gerou o PNG'))), 'image/png'));
  return { blob, removeuFundo: removeu, aviso };
}
