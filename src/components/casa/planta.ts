/**
 * A planta do Ditado, tirada do "MAPA DE MESAS ATUALIZADO" (PDF, em pontos).
 *
 * O PDF é a verdade: as posições do cadastro de mesas estão desatualizadas.
 * Tudo aqui fica em pontos do PDF e vira metros com `m()`: 1 pt = 5 cm, o
 * centro da planta fica na origem. X cresce para a direita (lado do palco e da
 * entrada), Z cresce para o fundo (bar do chopp).
 *
 * De cima para baixo: deck fechado, salão (banheiros, buffet, palco e a entrada
 * ao lado do palco), parrilla (o antigo bar de drinks, com a cozinha atrás) e o
 * bar do chopp (com o estoque central e a doca no terreno ao lado).
 */

export const ESCALA = 0.05;
const CX = 165.5;
const CY = 526;

/** Ponto do PDF em metros: [x, z]. */
export const m = (x: number, y: number): [number, number] => [(x - CX) * ESCALA, (y - CY) * ESCALA];
/** Metros de volta para o PDF (para gravar a praça que o gerente arrastou). */
export const pt = (x: number, z: number): [number, number] => [x / ESCALA + CX, z / ESCALA + CY];

export interface Ret { x0: number; y0: number; x1: number; y1: number }
const R = (x0: number, y0: number, x1: number, y1: number): Ret => ({ x0, y0, x1, y1 });

export const centro = (r: Ret): [number, number] => m((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
export const tamanho = (r: Ret): [number, number] => [(r.x1 - r.x0) * ESCALA, (r.y1 - r.y0) * ESCALA];

/** As paredes de fora e as linhas que dividem as áreas. */
export const LIMITES = { x0: 2, x1: 330, y0: 212, y1: 841 };
export const DIVISAS = { deckSalao: 285.8, salaoParrilla: 452, parrillaChopp: 655 };

export type Area = 'deck' | 'salao' | 'parrilla' | 'chopp';
export const AREAS: Record<Area, { nome: string; ret: Ret }> = {
  deck: { nome: 'Deck', ret: R(2, 212, 330, DIVISAS.deckSalao) },
  salao: { nome: 'Salão', ret: R(2, DIVISAS.deckSalao, 330, DIVISAS.salaoParrilla) },
  parrilla: { nome: 'Parrilla', ret: R(2, DIVISAS.salaoParrilla, 330, DIVISAS.parrillaChopp) },
  chopp: { nome: 'Bar do Chopp', ret: R(2, DIVISAS.parrillaChopp, 330, 841) },
};

export const OBJETOS = {
  banheiros: R(1.1, 310.6, 46.3, 453.5),
  buffet: R(85.8, 310.7, 99.1, 422.3),
  palco: R(281.5, 403.3, 326.8, 451.5),
  parrilla: R(1.1, 486.1, 51.4, 652.6),
  barChopp: R(1.1, 655.6, 113.0, 841),
  /** A entrada fica na parede do lado do palco. */
  entrada: R(326, 372, 334, 402),
  /** Atrás da parrilla, fora do mapa. */
  cozinha: R(-150, 470, 1, 653),
  /** No terreno ao lado do bar do chopp, fora do mapa. */
  estoque: R(-170, 656, 1, 841),
  doca: R(-250, 690, -170, 841),
};

/** A porta, onde o cliente aparece ao chegar e some ao ir embora. */
export const PORTA = m(345, 387);

export interface Mesa { id: number; ret: Ret; lugares: number; redonda: boolean; area: Area }

const mesas: Array<[number, number, number, number, number, boolean?]> = [
  // Deck: mesas de 4 em pé e duas redondas de 8 nas pontas
  [108.1, 229.8, 125.4, 256.1, 4], [81.8, 231.2, 99.1, 257.5, 4], [55.6, 235.6, 72.7, 261.8, 4],
  [174.0, 249.5, 191.2, 275.8, 4], [257.3, 249.8, 274.6, 276.0, 4], [215.6, 250.1, 232.9, 276.4, 4],
  [108.1, 260.4, 125.4, 284.6, 4], [81.8, 261.8, 99.1, 284.6, 4],
  [16.3, 239.9, 36.5, 271.1, 8, true], [288.6, 244.0, 308.8, 275.2, 8, true],
  // Salão: grade de mesas de 4 e três redondas ao lado do buffet
  [106.4, 290.9, 144.6, 309.2, 4], [148.4, 290.5, 186.6, 308.9, 4], [192.4, 287.5, 230.5, 305.9, 4],
  [236.3, 287.0, 274.4, 305.3, 4], [281.5, 287.0, 319.7, 305.4, 4],
  [108.0, 330.2, 146.2, 348.6, 4], [150.1, 329.8, 188.2, 348.2, 4], [193.9, 326.9, 232.1, 345.2, 4],
  [238.0, 326.4, 276.1, 344.8, 4], [283.1, 326.4, 321.2, 344.8, 4],
  [106.4, 365.6, 144.6, 384.1, 4], [148.4, 365.3, 186.6, 383.8, 4], [192.4, 362.3, 230.5, 380.6, 4],
  [236.3, 361.7, 274.4, 380.1, 4], [281.5, 361.7, 319.7, 380.0, 4],
  [118.4, 392.2, 156.4, 410.6, 4], [160.2, 391.9, 198.5, 410.3, 4], [204.2, 388.9, 242.4, 407.3, 4],
  [119.2, 418.8, 157.3, 437.2, 4], [161.2, 418.4, 199.4, 436.8, 4], [205.2, 415.6, 243.4, 433.9, 4],
  [54.9, 320.0, 75.1, 351.0, 8, true], [54.9, 366.2, 75.1, 397.3, 6, true], [54.9, 412.4, 75.1, 443.6, 8, true],
  // Parrilla
  [67.1, 470.8, 112.3, 490.3, 4], [117.0, 470.4, 162.4, 490.0, 4], [169.3, 467.3, 214.6, 486.8, 4],
  [221.5, 466.6, 266.7, 486.2, 4], [275.2, 466.6, 320.5, 486.2, 4],
  [67.8, 517.6, 113.0, 537.2, 4], [118.4, 517.2, 163.8, 536.9, 4], [170.0, 516.7, 215.3, 536.4, 4],
  [222.6, 521.3, 267.8, 540.8, 4], [276.0, 520.9, 321.2, 540.6, 4],
  [67.8, 567.7, 113.0, 587.3, 4], [118.4, 567.4, 163.8, 586.9, 4], [170.0, 566.3, 215.3, 585.8, 4],
  [221.4, 569.5, 266.6, 589.1, 4], [276.0, 568.7, 321.2, 588.2, 4],
  [67.8, 603.3, 113.1, 622.9, 4], [118.4, 603.0, 163.8, 622.6, 4], [169.3, 601.4, 214.6, 621.0, 4],
  [222.6, 600.4, 267.9, 620.0, 4], [276.0, 600.4, 321.2, 620.0, 4],
  [170.0, 628.0, 215.3, 647.5, 4], [222.2, 627.2, 267.5, 646.8, 4], [276.0, 627.2, 321.2, 646.8, 4],
  // Bar do chopp: coluna de 4 e mesas de 6 na parede
  [151.2, 670.2, 196.4, 689.8, 4], [151.2, 702.0, 196.4, 721.6, 4], [151.2, 735.6, 196.4, 755.2, 4],
  [151.2, 765.8, 196.4, 785.4, 4], [151.2, 796.2, 196.4, 815.9, 4], [151.2, 821.0, 196.4, 838.0, 4],
  [281.5, 679.9, 326.8, 699.5, 6], [281.5, 721.4, 326.8, 741.1, 6], [281.5, 776.8, 326.8, 796.4, 6],
  [281.5, 815.9, 326.8, 835.4, 6],
];

const areaDe = (y: number): Area =>
  y < DIVISAS.deckSalao ? 'deck' : y < DIVISAS.salaoParrilla ? 'salao' : y < DIVISAS.parrillaChopp ? 'parrilla' : 'chopp';

export const MESAS: Mesa[] = mesas.map(([x0, y0, x1, y1, lugares, redonda], id) => ({
  id, ret: R(x0, y0, x1, y1), lugares, redonda: !!redonda, area: areaDe((y0 + y1) / 2),
}));

export interface Assento { mesa: number; x: number; z: number; /** Para onde a pessoa olha (radianos, em Y). */ rot: number }

/** As cadeiras de cada mesa, em metros. Mesas retangulares têm cadeiras nos lados compridos. */
export const ASSENTOS: Assento[] = MESAS.flatMap((me) => {
  const [cx, cz] = centro(me.ret);
  const [w, d] = tamanho(me.ret);
  const lista: Assento[] = [];
  if (me.redonda) {
    const raio = Math.max(w, d) / 2 + 0.35;
    for (let i = 0; i < me.lugares; i++) {
      const a = (i / me.lugares) * Math.PI * 2;
      const x = cx + Math.cos(a) * raio;
      const z = cz + Math.sin(a) * raio;
      lista.push({ mesa: me.id, x, z, rot: Math.atan2(cx - x, cz - z) });
    }
    return lista;
  }
  const porLado = me.lugares / 2;
  const deitada = w >= d; // lado comprido no eixo X
  for (let lado = -1; lado <= 1; lado += 2) {
    for (let i = 0; i < porLado; i++) {
      const t = (i + 0.5) / porLado - 0.5;
      const x = deitada ? cx + t * w : cx + lado * (w / 2 + 0.32);
      const z = deitada ? cz + lado * (d / 2 + 0.32) : cz + t * d;
      lista.push({ mesa: me.id, x, z, rot: Math.atan2(cx - x, cz - z) });
    }
  }
  return lista;
});

/**
 * Onde cada praça de garçom fica, se o gerente ainda não arrastou: espalhadas
 * pelas áreas, das mais cheias para as mais vazias.
 */
export const PRACAS_PADRAO: Array<[number, number]> = [
  [240, 755], [120, 560], [270, 560], [200, 340], [270, 400], [180, 255],
  [120, 395], [220, 625], [300, 800], [290, 300], [90, 255], [175, 480],
];

/** Onde fica quem compra direto no balcão, sem garçom (em pé, de frente para o balcão). */
export const FILA_BALCAO: Record<'chopp' | 'cozinha', { x: number; y0: number; y1: number }> = {
  chopp: { x: 125, y0: 668, y1: 835 },
  cozinha: { x: 62, y0: 495, y1: 648 },
};

/** Quem só entrou (sem consumo próprio) fica em pé perto da entrada, na frente do palco. */
export const ESPERA = { x0: 205, x1: 275, y0: 441, y1: 449 };
