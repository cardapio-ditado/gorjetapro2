import { ASSENTOS, ESPERA, FILA_BALCAO, MESAS, PRACAS_PADRAO, centro, m } from './planta';
import type { Casa, ClienteCasa, Pracas } from './tipos';

/** Onde cada pessoa fica na maquete, em metros. */
export interface Lugar { x: number; z: number; rot: number; sentado: boolean }

export interface Distribuicao {
  lugares: Map<string, Lugar>;
  /** Centro da praça de cada garçom, em metros. */
  ancoras: Map<string, [number, number]>;
  /** Os lugares dos clientes de cada garçom (para ele andar entre eles). */
  porGarcom: Map<string, Lugar[]>;
  /** Quem só entrou e não coube na espera da entrada. */
  semConsumoForaDaTela: number;
}

const naCasa = (c: ClienteCasa) => c.status === 'consumindo' || c.status === 'parado';

/**
 * A ZIG não tem mesa: cada cliente senta perto da praça do garçom que mais o
 * atendeu. As praças vêm de onde o gerente arrastou ou, se ninguém arrastou,
 * de PRACAS_PADRAO. As mesas mais perto da praça enchem primeiro, mesa por
 * mesa, e os clientes que mais gastaram ficam no centro da praça.
 */
export function distribuir(casa: Casa, pracas: Pracas): Distribuicao {
  const lugares = new Map<string, Lugar>();
  const ancoras = new Map<string, [number, number]>();
  const porGarcom = new Map<string, Lugar[]>();

  const presentes = casa.clientes.filter(naCasa);
  const comGarcom = new Map<string, ClienteCasa[]>();
  const semGarcom: ClienteCasa[] = [];
  for (const c of presentes) {
    if (c.garcom) comGarcom.set(c.garcom, [...(comGarcom.get(c.garcom) ?? []), c]);
    else semGarcom.push(c);
  }

  // Praça de cada garçom da noite (mesmo sem clientes agora ele aparece).
  const nomes = [...new Set([...casa.garcons.map((g) => g.nome), ...comGarcom.keys()])]
    .sort((a, b) => (comGarcom.get(b)?.length ?? 0) - (comGarcom.get(a)?.length ?? 0));
  const padroesLivres = PRACAS_PADRAO.filter(([x, y]) =>
    !Object.values(pracas).some(([px, py]) => Math.hypot(px - x, py - y) < 40));
  let proxima = 0;
  for (const nome of nomes) {
    const salva = pracas[nome];
    const [x, y] = salva ?? padroesLivres[proxima++ % Math.max(1, padroesLivres.length)] ?? [165, 526];
    ancoras.set(nome, m(x, y));
  }

  // Cada garçom enche as mesas mais perto da praça dele.
  const ocupado = new Set<number>();
  const mesasPorDistancia = (ax: number, az: number) =>
    MESAS.map((me) => { const [cx, cz] = centro(me.ret); return { id: me.id, d: Math.hypot(cx - ax, cz - az) }; })
      .sort((a, b) => a.d - b.d);
  for (const nome of nomes) {
    const clientes = (comGarcom.get(nome) ?? []).slice().sort((a, b) => b.consumo - a.consumo);
    if (!clientes.length) continue;
    const [ax, az] = ancoras.get(nome)!;
    const fila: number[] = [];
    for (const { id } of mesasPorDistancia(ax, az)) {
      ASSENTOS.forEach((s, i) => { if (s.mesa === id && !ocupado.has(i)) fila.push(i); });
      if (fila.length >= clientes.length) break;
    }
    const meus: Lugar[] = [];
    clientes.forEach((c, k) => {
      const i = fila[k];
      if (i === undefined) return; // casa lotada: sem cadeira, fica fora da maquete
      ocupado.add(i);
      const s = ASSENTOS[i];
      const lugar = { x: s.x, z: s.z, rot: s.rot, sentado: true };
      lugares.set(c.id, lugar);
      meus.push(lugar);
    });
    porGarcom.set(nome, meus);
  }

  // Sem garçom: em pé, na frente do balcão onde comprou.
  const filas: Record<'chopp' | 'cozinha', number> = { chopp: 0, cozinha: 0 };
  for (const c of semGarcom) {
    const b = c.balcao ?? 'chopp';
    const f = FILA_BALCAO[b];
    const n = filas[b]++;
    const passo = 13;
    const vagas = Math.max(1, Math.floor((f.y1 - f.y0) / passo));
    const [x, z] = m(f.x + Math.floor(n / vagas) * 14, f.y0 + (n % vagas) * passo);
    lugares.set(c.id, { x, z, rot: -Math.PI / 2, sentado: false });
  }

  // Só entrou: em pé perto da entrada, de frente para o palco.
  const espera = casa.clientes.filter((c) => c.status === 'sem_consumo');
  const colunas = Math.floor((ESPERA.x1 - ESPERA.x0) / 11);
  const cabem = colunas * 2;
  espera.slice(0, cabem).forEach((c, n) => {
    const [x, z] = m(ESPERA.x0 + (n % colunas) * 11, ESPERA.y0 + Math.floor(n / colunas) * 8);
    lugares.set(c.id, { x, z, rot: Math.PI / 2, sentado: false });
  });

  return { lugares, ancoras, porGarcom, semConsumoForaDaTela: Math.max(0, espera.length - cabem) };
}
