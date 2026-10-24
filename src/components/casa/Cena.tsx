import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, Instance, Instances, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { AREAS, ASSENTOS, DIVISAS, LIMITES, MESAS, OBJETOS, PORTA, centro, m, tamanho, type Ret } from './planta';
import type { Distribuicao, Lugar } from './distribuir';
import type { ClienteCasa, StatusCliente } from './tipos';

/**
 * A maquete da casa: o prédio tirado do mapa de mesas, os clientes sentados
 * nas praças dos garçons e os garçons andando entre eles. Só desenha; quem
 * decide onde cada um fica é distribuir().
 */

export interface CenaProps {
  clientes: ClienteCasa[];
  dist: Distribuicao;
  /** Garçom → clientes na praça agora (para o rótulo). */
  garcons: Array<{ nome: string; clientes: number }>;
  selecionado: { tipo: 'cliente' | 'garcom'; id: string } | null;
  onCliente: (id: string) => void;
  onGarcom: (nome: string) => void;
  /** Clique no chão (metros), usado para mover a praça. */
  onChao?: (x: number, z: number) => void;
  moverPraca: string | null;
  girar: boolean;
  /** Hora de Cuiabá que a cena representa (luz do dia ou da noite). */
  hora: number;
}

// ---------- materiais e formas compartilhados ----------

const cacheMat = new Map<string, THREE.MeshStandardMaterial>();
function mat(cor: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) {
  const chave = cor + JSON.stringify(extra ?? {});
  let mt = cacheMat.get(chave);
  if (!mt) { mt = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...extra }); cacheMat.set(chave, mt); }
  return mt;
}

const G = {
  corpo: new THREE.CylinderGeometry(0.15, 0.19, 0.55, 10),
  pernas: new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8),
  cabeca: new THREE.SphereGeometry(0.12, 14, 12),
  cabelo: new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  diamante: new THREE.OctahedronGeometry(0.085),
  coroa: new THREE.CylinderGeometry(0.11, 0.09, 0.09, 6, 1, true),
  anel: new THREE.TorusGeometry(0.34, 0.035, 8, 28),
  avental: new THREE.BoxGeometry(0.3, 0.42, 0.03),
};

const PELES = ['#f1c9a5', '#e0ac87', '#c68b62', '#9a6643', '#6e4630'];
const CABELOS = ['#1f1a17', '#3b2a1e', '#6a4527', '#a0703f', '#c9a36a', '#2a2a2a'];
const ROUPAS = ['#2f4858', '#86577d', '#b04a3c', '#3f6c8f', '#d9b44a', '#4f7a54', '#e7e2d8', '#373737', '#8c5a3c', '#5b5f97'];

const STATUS_COR: Record<StatusCliente, string> = {
  consumindo: '#34d17a', parado: '#f2b33d', saiu: '#8a8f96', sem_consumo: '#9aa0a6',
};

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

// ---------- o prédio ----------

const Piso: React.FC<{ r: Ret; cor: string; y?: number }> = ({ r, cor, y = 0 }) => {
  const [cx, cz] = centro(r);
  const [w, d] = tamanho(r);
  return (
    <mesh position={[cx, y, cz]} rotation-x={-Math.PI / 2} receiveShadow material={mat(cor)}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
};

/** Bloco (balcão, parede, palco) a partir de um retângulo do mapa. */
const Bloco: React.FC<{ r: Ret; altura: number; cor: string; y?: number; extra?: Partial<THREE.MeshStandardMaterialParameters> }> = ({ r, altura, cor, y = 0, extra }) => {
  const [cx, cz] = centro(r);
  const [w, d] = tamanho(r);
  return (
    <mesh position={[cx, y + altura / 2, cz]} castShadow receiveShadow material={mat(cor, extra)}>
      <boxGeometry args={[w, altura, d]} />
    </mesh>
  );
};

/** Parede entre dois pontos do mapa. Baixa, como numa maquete cortada, para ver dentro. */
const Parede: React.FC<{ a: [number, number]; b: [number, number]; altura?: number; cor?: string; vidro?: boolean }> = ({ a, b, altura = 1.3, cor = '#efe6d6', vidro }) => {
  const [ax, az] = m(a[0], a[1]);
  const [bx, bz] = m(b[0], b[1]);
  const comp = Math.hypot(bx - ax, bz - az);
  return (
    <mesh position={[(ax + bx) / 2, altura / 2, (az + bz) / 2]} rotation-y={-Math.atan2(bz - az, bx - ax)} castShadow receiveShadow
      material={vidro ? mat('#bfe3f2', { transparent: true, opacity: 0.28, roughness: 0.1 }) : mat(cor)}>
      <boxGeometry args={[comp, altura, 0.14]} />
    </mesh>
  );
};

const Rotulo: React.FC<{ pos: [number, number, number]; texto: string; forte?: boolean }> = ({ pos, texto, forte }) => (
  <Html position={pos} center distanceFactor={22} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
    <div style={{
      padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: forte ? 15 : 12, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(20,16,14,0.72)', color: '#f4e7c9',
      border: '1px solid rgba(244,231,201,0.25)',
    }}>{texto}</div>
  </Html>
);

const Predio: React.FC<{ noite: boolean }> = ({ noite }) => {
  const { x0, x1, y0, y1 } = LIMITES;
  const e = OBJETOS.entrada;
  const brasa = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (brasa.current) brasa.current.intensity = (noite ? 6 : 2) * (0.85 + Math.sin(clock.elapsedTime * 7) * 0.08 + Math.sin(clock.elapsedTime * 13) * 0.05);
  });
  const [pcx, pcz] = centro(OBJETOS.parrilla);
  const bar = OBJETOS.barChopp;
  const [pax, paz] = centro(OBJETOS.palco);
  const [, palcoD] = tamanho(OBJETOS.palco);

  return (
    <group>
      {/* rua e terreno */}
      <mesh rotation-x={-Math.PI / 2} position={[-4, -0.02, 0]} receiveShadow material={mat(noite ? '#23272b' : '#5d665c')}>
        <planeGeometry args={[90, 90]} />
      </mesh>

      {/* pisos de cada área */}
      <Piso r={AREAS.deck.ret} cor="#9b6a42" y={0.01} />
      <Piso r={AREAS.salao.ret} cor="#d8cdbc" y={0.01} />
      <Piso r={AREAS.parrilla.ret} cor="#cbbda4" y={0.01} />
      <Piso r={AREAS.chopp.ret} cor="#bfae90" y={0.01} />
      <Piso r={OBJETOS.cozinha} cor="#e3e6e9" y={0.01} />
      <Piso r={OBJETOS.estoque} cor="#8d949a" y={0.01} />
      <Piso r={OBJETOS.doca} cor="#6c7277" y={0.01} />

      {/* paredes de fora, com a porta ao lado do palco */}
      <Parede a={[x0, y0]} b={[x1, y0]} />
      <Parede a={[x1, y0]} b={[x1, e.y0]} />
      <Parede a={[x1, e.y1]} b={[x1, y1]} />
      <Parede a={[x0, y1]} b={[x1, y1]} />
      <Parede a={[x0, y0]} b={[x0, OBJETOS.cozinha.y0]} />
      {/* o deck é fechado com vidro */}
      <Parede a={[x0, DIVISAS.deckSalao]} b={[130, DIVISAS.deckSalao]} vidro />
      <Parede a={[200, DIVISAS.deckSalao]} b={[x1, DIVISAS.deckSalao]} vidro />
      {/* cozinha atrás da parrilla e estoque ao lado do bar do chopp */}
      <Parede a={[OBJETOS.cozinha.x0, OBJETOS.cozinha.y0]} b={[x0, OBJETOS.cozinha.y0]} />
      <Parede a={[OBJETOS.cozinha.x0, OBJETOS.cozinha.y0]} b={[OBJETOS.cozinha.x0, OBJETOS.cozinha.y1]} />
      <Parede a={[OBJETOS.estoque.x0, OBJETOS.estoque.y0]} b={[OBJETOS.estoque.x0, OBJETOS.doca.y0]} />
      <Parede a={[OBJETOS.estoque.x0, OBJETOS.estoque.y1]} b={[x0, OBJETOS.estoque.y1]} />
      <Parede a={[OBJETOS.estoque.x0, OBJETOS.estoque.y0]} b={[x0, OBJETOS.estoque.y0]} />

      {/* banheiros e buffet */}
      <Bloco r={OBJETOS.banheiros} altura={1.6} cor="#b9c3c9" />
      <Bloco r={OBJETOS.buffet} altura={0.9} cor="#6b4a32" />
      <Bloco r={{ ...OBJETOS.buffet, x0: OBJETOS.buffet.x0 + 1, x1: OBJETOS.buffet.x1 - 1 }} altura={0.06} y={0.9} cor="#c9ccd0" extra={{ metalness: 0.7, roughness: 0.3 }} />

      {/* palco, caixas de som e luzes */}
      <Bloco r={OBJETOS.palco} altura={0.45} cor="#222" />
      {[-1, 1].map((l) => (
        <mesh key={l} position={[pax - 0.6, 0.45 + 0.55, paz + l * (palcoD / 2 - 0.3)]} castShadow material={mat('#111')}>
          <boxGeometry args={[0.45, 1.1, 0.45]} />
        </mesh>
      ))}
      <mesh position={[pax - 0.2, 0.45 + 0.7, paz]} material={mat('#999', { metalness: 0.8 })}>
        <cylinderGeometry args={[0.02, 0.02, 1.4]} />
      </mesh>
      {noite && <pointLight position={[pax - 1.5, 3.2, paz]} intensity={16} color="#ff9a5a" distance={9} />}

      {/* parrilla: balcão e a brasa */}
      <Bloco r={OBJETOS.parrilla} altura={1.0} cor="#4a2f22" />
      <mesh position={[pcx, 1.02, pcz]} material={mat('#ff5a1f', { emissive: '#ff4a10', emissiveIntensity: noite ? 1.6 : 0.7 })}>
        <boxGeometry args={[1.4, 0.05, 4.5]} />
      </mesh>
      <pointLight ref={brasa} position={[pcx + 0.5, 1.6, pcz]} color="#ff7a30" distance={9} intensity={4} />

      {/* bar do chopp: balcão em L, torneiras e prateleira de garrafas */}
      <Bloco r={{ x0: bar.x1 - 14, y0: bar.y0 + 6, x1: bar.x1, y1: bar.y1 - 6 }} altura={1.1} cor="#5a3a24" />
      <Bloco r={{ x0: bar.x0 + 1, y0: bar.y0 + 6, x1: bar.x1, y1: bar.y0 + 18 }} altura={1.1} cor="#5a3a24" />
      <Bloco r={{ x0: bar.x0 + 1, y0: bar.y0 + 22, x1: bar.x0 + 9, y1: bar.y1 - 6 }} altura={2.0} cor="#3a2618" />
      {Array.from({ length: 9 }, (_, i) => {
        const [tx, tz] = m(bar.x1 - 7, bar.y0 + 30 + i * 18);
        return (
          <mesh key={i} position={[tx, 1.35, tz]} material={mat('#d9b44a', { metalness: 0.9, roughness: 0.25 })}>
            <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
          </mesh>
        );
      })}
      {noite && <pointLight position={[m(bar.x1 - 20, 0)[0], 3, m(0, (bar.y0 + bar.y1) / 2)[1]]} color="#ffcf8a" distance={14} intensity={18} />}

      {/* cozinha: bancadas de inox e fogões */}
      {[0, 1, 2].map((i) => (
        <Bloco key={i} r={{ x0: OBJETOS.cozinha.x0 + 6, y0: 485 + i * 55, x1: OBJETOS.cozinha.x0 + 26, y1: 525 + i * 55 }} altura={0.9} cor="#c7ccd1" extra={{ metalness: 0.6, roughness: 0.35 }} />
      ))}
      <Bloco r={{ x0: -90, y0: 540, x1: -40, y1: 585 }} altura={0.9} cor="#b8bdc2" extra={{ metalness: 0.6, roughness: 0.35 }} />
      <Bloco r={{ x0: -85, y0: 480, x1: -30, y1: 495 }} altura={0.95} cor="#2b2b2b" />

      {/* estoque central: estantes com caixas */}
      {Array.from({ length: 4 }, (_, i) => (
        <group key={i}>
          <Bloco r={{ x0: OBJETOS.estoque.x0 + 25 + i * 34, y0: 690, x1: OBJETOS.estoque.x0 + 37 + i * 34, y1: 820 }} altura={2.2} cor="#5e6a73" />
          {Array.from({ length: 6 }, (_, j) => (
            <Bloco key={j} r={{ x0: OBJETOS.estoque.x0 + 26 + i * 34, y0: 695 + j * 21, x1: OBJETOS.estoque.x0 + 36 + i * 34, y1: 708 + j * 21 }}
              altura={0.35} y={2.2} cor={['#b5843f', '#9c6b33', '#c9a46a'][(i + j) % 3]} />
          ))}
        </group>
      ))}

      {/* doca com o caminhão */}
      <Bloco r={OBJETOS.doca} altura={0.6} cor="#7b8086" />
      <group position={[m(-290, 760)[0], 0, m(-290, 760)[1]]}>
        <mesh position={[0, 1.4, 0.6]} castShadow material={mat('#eceff1')}><boxGeometry args={[2.3, 2.4, 5.2]} /></mesh>
        <mesh position={[0, 1.0, -2.8]} castShadow material={mat('#b23a2e')}><boxGeometry args={[2.2, 1.7, 1.6]} /></mesh>
        <mesh position={[0, 1.3, -3.62]} material={mat('#9fd4ec', { roughness: 0.1 })}><boxGeometry args={[1.9, 0.7, 0.04]} /></mesh>
        {[[-1, -2.6], [1, -2.6], [-1, 1.8], [1, 1.8]].map(([x, z], i) => (
          <mesh key={i} position={[x * 1.15, 0.4, z]} rotation-z={Math.PI / 2} material={mat('#111')}><cylinderGeometry args={[0.4, 0.4, 0.3, 14]} /></mesh>
        ))}
      </group>

      {/* entrada */}
      <mesh position={[m(e.x0, 0)[0] + 0.5, 0.02, m(0, (e.y0 + e.y1) / 2)[1]]} rotation-x={-Math.PI / 2} material={mat('#7a1f2b')}>
        <planeGeometry args={[1.4, 1.5]} />
      </mesh>
      {noite && <pointLight position={[m(e.x1, 0)[0] + 0.5, 2.6, m(0, (e.y0 + e.y1) / 2)[1]]} color="#ffd9a0" distance={6} intensity={6} />}

      {/* nomes dos lugares */}
      <Rotulo pos={[m(165, 0)[0], 1.6, m(0, 230)[1]]} texto="Deck" forte />
      <Rotulo pos={[m(250, 0)[0], 1.6, m(0, 318)[1]]} texto="Salão" forte />
      <Rotulo pos={[m(0, 0)[0] + 0.5, 2.4, m(0, 380)[1]]} texto="Banheiros" />
      <Rotulo pos={[m(92, 0)[0], 1.5, m(0, 300)[1]]} texto="Buffet" />
      <Rotulo pos={[pax, 2.3, paz]} texto="Palco" />
      <Rotulo pos={[m(e.x1, 0)[0] + 0.8, 2.6, m(0, (e.y0 + e.y1) / 2)[1]]} texto="Entrada" />
      <Rotulo pos={[pcx, 2.4, pcz]} texto="Parrilla" forte />
      <Rotulo pos={[m(-75, 0)[0], 2.2, m(0, 470)[1]]} texto="Cozinha" />
      <Rotulo pos={[m(55, 0)[0], 2.6, m(0, 760)[1]]} texto="Bar do Chopp" forte />
      <Rotulo pos={[m(-85, 0)[0], 3.3, m(0, 660)[1]]} texto="Estoque central" />
      <Rotulo pos={[m(-210, 0)[0], 1.6, m(0, 690)[1]]} texto="Doca" />
    </group>
  );
};

// ---------- mesas e cadeiras (instanciadas: são centenas) ----------

const Moveis: React.FC = () => (
  <group>
    <Instances limit={MESAS.length} castShadow receiveShadow material={mat('#6f4426')}>
      <boxGeometry args={[1, 0.06, 1]} />
      {MESAS.filter((me) => !me.redonda).map((me) => {
        const [cx, cz] = centro(me.ret);
        const [w, d] = tamanho(me.ret);
        return <Instance key={me.id} position={[cx, 0.75, cz]} scale={[w * 0.92, 1, d * 0.92]} />;
      })}
    </Instances>
    {MESAS.filter((me) => me.redonda).map((me) => {
      const [cx, cz] = centro(me.ret);
      const [w, d] = tamanho(me.ret);
      return (
        <mesh key={me.id} position={[cx, 0.75, cz]} castShadow receiveShadow material={mat('#6f4426')}>
          <cylinderGeometry args={[Math.max(w, d) / 2 * 0.85, Math.max(w, d) / 2 * 0.85, 0.06, 28]} />
        </mesh>
      );
    })}
    <Instances limit={MESAS.length} material={mat('#2d2622')}>
      <cylinderGeometry args={[0.05, 0.12, 0.74, 8]} />
      {MESAS.map((me) => { const [cx, cz] = centro(me.ret); return <Instance key={me.id} position={[cx, 0.37, cz]} />; })}
    </Instances>
    <Instances limit={ASSENTOS.length} castShadow material={mat('#3b2c22')}>
      <boxGeometry args={[0.42, 0.06, 0.42]} />
      {ASSENTOS.map((s, i) => <Instance key={i} position={[s.x, 0.46, s.z]} rotation-y={s.rot} />)}
    </Instances>
    <Instances limit={ASSENTOS.length} castShadow material={mat('#3b2c22')}>
      <boxGeometry args={[0.42, 0.45, 0.05]} />
      {ASSENTOS.map((s, i) => {
        const dx = -Math.sin(s.rot) * 0.2; const dz = -Math.cos(s.rot) * 0.2;
        return <Instance key={i} position={[s.x + dx, 0.7, s.z + dz]} rotation-y={s.rot} />;
      })}
    </Instances>
  </group>
);

// ---------- gente ----------

const VELOCIDADE = 1.7; // m/s

/** Anda de onde está até o alvo; devolve se ainda está andando. */
function andar(pos: THREE.Vector3, alvo: THREE.Vector3, dt: number) {
  const falta = alvo.clone().sub(pos);
  const d = falta.length();
  if (d < 0.03) { pos.copy(alvo); return { andando: false, direcao: 0 }; }
  const passo = Math.min(d, VELOCIDADE * dt);
  pos.add(falta.multiplyScalar(passo / d));
  return { andando: true, direcao: Math.atan2(alvo.x - pos.x, alvo.z - pos.z) };
}

interface PessoaProps {
  c: ClienteCasa;
  lugar: Lugar | null;
  saindo: boolean;
  /** Chega pela porta (cliente novo) ou já aparece sentado (primeira leitura). */
  pelaPorta: boolean;
  coroa: boolean;
  selecionado: boolean;
  onClick: () => void;
}

const Pessoa: React.FC<PessoaProps> = React.memo(({ c, lugar, saindo, pelaPorta, coroa, selecionado, onClick }) => {
  const grupo = useRef<THREE.Group>(null);
  const corpo = useRef<THREE.Group>(null);
  const diamante = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const porta = useMemo(() => new THREE.Vector3(PORTA[0], 0, PORTA[1]), []);
  const pos = useRef(pelaPorta || !lugar ? porta.clone() : new THREE.Vector3(lugar.x, 0, lugar.z));
  const h = hash(c.id);
  const pele = PELES[h % PELES.length];
  const cabelo = CABELOS[(h >> 3) % CABELOS.length];
  const roupa = ROUPAS[(h >> 6) % ROUPAS.length];
  const escala = 0.92 + Math.min(0.3, c.consumo / 1200);

  useFrame(({ clock }, dt) => {
    if (!grupo.current || !corpo.current) return;
    const alvo = saindo || !lugar ? porta : new THREE.Vector3(lugar.x, 0, lugar.z);
    const { andando, direcao } = andar(pos.current, alvo, Math.min(dt, 0.1));
    grupo.current.position.copy(pos.current);
    grupo.current.rotation.y = andando ? direcao : lugar?.rot ?? 0;
    const sentado = !andando && !!lugar?.sentado && !saindo;
    // Sentado: o corpo desce até a cadeira. Andando: balança.
    corpo.current.position.y = sentado ? -0.32 : andando ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.04 : 0;
    if (diamante.current) {
      diamante.current.rotation.y += dt * 1.6;
      diamante.current.position.y = 1.72 + Math.sin(clock.elapsedTime * 2 + h) * 0.04;
    }
  });

  const corStatus = STATUS_COR[c.status];
  // Flutuando só o que pede uma ação do gerente; as visitas ficam no painel.
  const marcas = [c.aniversario && '🎂', c.clube && '🥃', c.premio && '🎁'].filter(Boolean).join('');

  return (
    <group ref={grupo} scale={escala}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}>
      <group ref={corpo}>
        <mesh geometry={G.pernas} material={mat('#2b2f3a')} position={[0, 0.25, 0]} castShadow />
        <mesh geometry={G.corpo} material={mat(roupa)} position={[0, 0.78, 0]} castShadow />
        <mesh geometry={G.cabeca} material={mat(pele)} position={[0, 1.18, 0]} castShadow />
        <mesh geometry={G.cabelo} material={mat(cabelo)} position={[0, 1.2, -0.01]} />
        {coroa
          ? <mesh geometry={G.coroa} material={mat('#f4c430', { metalness: 0.9, roughness: 0.2, emissive: '#7a5a00', emissiveIntensity: 0.4 })} position={[0, 1.36, 0]} />
          : <mesh ref={diamante} geometry={G.diamante} material={mat(corStatus, { emissive: corStatus, emissiveIntensity: 0.9 })} position={[0, 1.72, 0]} />}
      </group>
      {selecionado && <mesh geometry={G.anel} material={mat('#f4c430', { emissive: '#f4c430', emissiveIntensity: 1 })} rotation-x={Math.PI / 2} position={[0, 0.03, 0]} />}
      {(hover || selecionado || marcas) && (
        <Html position={[0, coroa ? 1.65 : 2.0, 0]} center distanceFactor={14} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div style={{
            padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700,
            background: hover || selecionado ? 'rgba(20,16,14,0.88)' : 'transparent', color: '#fff',
          }}>
            {marcas}{(hover || selecionado) && <span style={{ marginLeft: marcas ? 4 : 0 }}>{c.nome}</span>}
          </div>
        </Html>
      )}
    </group>
  );
});

interface GarcomProps {
  nome: string;
  ancora: [number, number];
  clientes: Lugar[];
  qtd: number;
  selecionado: boolean;
  movendo: boolean;
  onClick: () => void;
}

const Garcom: React.FC<GarcomProps> = ({ nome, ancora, clientes, qtd, selecionado, movendo, onClick }) => {
  const grupo = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(ancora[0], 0, ancora[1]));
  const alvo = useRef(new THREE.Vector3(ancora[0], 0, ancora[1]));
  const proximo = useRef(0);
  const h = hash(nome);

  useFrame(({ clock }, dt) => {
    if (!grupo.current) return;
    // A cada poucos segundos vai até um cliente da praça (ao lado da cadeira).
    if (clock.elapsedTime > proximo.current) {
      proximo.current = clock.elapsedTime + 4 + ((h + Math.floor(clock.elapsedTime)) % 4);
      if (clientes.length && !movendo) {
        const l = clientes[Math.floor(Math.random() * clientes.length)];
        const lado = Math.random() < 0.5 ? 1 : -1;
        alvo.current.set(l.x + Math.cos(l.rot) * 0.55 * lado, 0, l.z - Math.sin(l.rot) * 0.55 * lado);
      } else {
        alvo.current.set(ancora[0], 0, ancora[1]);
      }
    }
    const { andando, direcao } = andar(pos.current, alvo.current, Math.min(dt, 0.1));
    grupo.current.position.copy(pos.current);
    if (andando) grupo.current.rotation.y = direcao;
    grupo.current.children[0].position.y = andando ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.05 : 0;
  });

  const primeiro = nome.split(/\s+/)[0];
  return (
    <group ref={grupo} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <group scale={1.08}>
        <mesh geometry={G.pernas} material={mat('#141414')} position={[0, 0.25, 0]} castShadow />
        <mesh geometry={G.corpo} material={mat('#111')} position={[0, 0.78, 0]} castShadow />
        <mesh geometry={G.avental} material={mat('#f5f1e8')} position={[0, 0.66, 0.17]} />
        <mesh geometry={G.cabeca} material={mat(PELES[h % PELES.length])} position={[0, 1.18, 0]} castShadow />
        <mesh geometry={G.cabelo} material={mat(CABELOS[(h >> 2) % CABELOS.length])} position={[0, 1.2, -0.01]} />
      </group>
      {(selecionado || movendo) && <mesh geometry={G.anel} material={mat('#7ad3ff', { emissive: '#7ad3ff', emissiveIntensity: 1 })} rotation-x={Math.PI / 2} position={[0, 0.03, 0]} scale={1.3} />}
      <Html position={[0, 1.75, 0]} center distanceFactor={16} zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
        <div style={{
          padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 800,
          background: movendo ? '#2b7bb9' : '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.35)',
        }}>{primeiro} · {qtd}</div>
      </Html>
    </group>
  );
};

// ---------- luz conforme a hora ----------

const Luz: React.FC<{ hora: number }> = ({ hora }) => {
  const noite = hora >= 18.5 || hora < 6;
  const tarde = !noite && hora >= 16.5;
  return (
    <>
      <color attach="background" args={[noite ? '#0d1117' : tarde ? '#f2c79b' : '#bcd6e6']} />
      <hemisphereLight args={[noite ? '#6d7aa0' : '#ffffff', noite ? '#2a1f16' : '#6b5a48', noite ? 0.7 : 0.75]} />
      <directionalLight position={noite ? [-12, 22, -8] : tarde ? [22, 12, -6] : [12, 30, 10]}
        intensity={noite ? 0.45 : tarde ? 1.4 : 2.0} color={noite ? '#9fb4ff' : tarde ? '#ffc58a' : '#fff6e6'}
        castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26}
        shadow-camera-top={26} shadow-camera-bottom={-26} shadow-bias={-0.0004} />
      {/* luz da casa à noite: deck, salão, parrilla e bar do chopp */}
      {noite && [[0, -13], [2, -6], [2, 2], [2, 9], [1, 14]].map(([x, z], i) => (
        <pointLight key={i} position={[x, 4.5, z]} color="#ffd29a" intensity={22} distance={18} />
      ))}
    </>
  );
};

// ---------- a cena ----------

const SAIDA_MS = 9000;

const Cena: React.FC<CenaProps> = ({ clientes, dist, garcons, selecionado, onCliente, onGarcom, onChao, moverPraca, girar, hora }) => {
  // Quem estava na casa e foi embora ainda anda até a porta antes de sumir.
  const [saindo, setSaindo] = useState<Map<string, { c: ClienteCasa; lugar: Lugar | null; ate: number }>>(new Map());
  const anterior = useRef<Map<string, { c: ClienteCasa; lugar: Lugar | null }> | null>(null);

  const presentes = useMemo(() => clientes.filter((c) => dist.lugares.has(c.id)), [clientes, dist]);

  useEffect(() => {
    const agora = new Map(presentes.map((c) => [c.id, { c, lugar: dist.lugares.get(c.id) ?? null }]));
    const antes = anterior.current;
    if (antes) {
      setSaindo((prev) => {
        const foram = new Map(prev);
        for (const [id, v] of antes) if (!agora.has(id)) foram.set(id, { ...v, ate: Date.now() + SAIDA_MS });
        for (const id of agora.keys()) foram.delete(id);
        return foram;
      });
    }
    anterior.current = agora;
    const t = setTimeout(() => setSaindo((s) => new Map([...s].filter(([, v]) => v.ate > Date.now()))), SAIDA_MS + 200);
    return () => clearTimeout(t);
  }, [presentes, dist]);

  // Coroa para quem mais gastou (os 8% de cima, no mínimo R$ 200).
  const coroas = useMemo(() => {
    const valores = presentes.map((c) => c.consumo).sort((a, b) => b - a);
    const corte = Math.max(200, valores[Math.floor(valores.length * 0.08)] ?? Infinity);
    return new Set(presentes.filter((c) => c.consumo >= corte).map((c) => c.id));
  }, [presentes]);

  // Quem já estava na primeira leitura aparece no lugar; quem chega depois entra
  // pela porta. (Não dá para usar "já renderizou": a cena 3D monta as pessoas um
  // instante depois do primeiro render.)
  const iniciais = useRef<Set<string> | null>(null);
  if (iniciais.current === null) iniciais.current = new Set(presentes.map((c) => c.id));
  const jaEstava = iniciais.current;
  const noite = hora >= 18.5 || hora < 6;
  const qtdPorGarcom = new Map(garcons.map((g) => [g.nome, g.clientes]));

  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [22, 26, 24], fov: 38, near: 0.5, far: 300 }}
      onPointerMissed={() => { /* clique no vazio não desmarca: o painel tem o botão de fechar */ }}>
      <Luz hora={hora} />
      <Predio noite={noite} />
      <Moveis />
      {/* chão invisível que recebe o clique de "mover praça" */}
      {moverPraca && onChao && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} onClick={(e) => { e.stopPropagation(); onChao(e.point.x, e.point.z); }}>
          <planeGeometry args={[60, 60]} />
          <meshBasicMaterial transparent opacity={0.08} color="#7ad3ff" />
        </mesh>
      )}
      {presentes.map((c) => (
        <Pessoa key={c.id} c={c} lugar={dist.lugares.get(c.id) ?? null} saindo={false}
          pelaPorta={!jaEstava.has(c.id)} coroa={coroas.has(c.id)}
          selecionado={selecionado?.tipo === 'cliente' && selecionado.id === c.id} onClick={() => onCliente(c.id)} />
      ))}
      {[...saindo.values()].map(({ c, lugar }) => (
        <Pessoa key={`saindo-${c.id}`} c={c} lugar={lugar} saindo pelaPorta={false} coroa={false} selecionado={false} onClick={() => onCliente(c.id)} />
      ))}
      {[...dist.ancoras.entries()].map(([nome, ancora]) => (
        <Garcom key={nome} nome={nome} ancora={ancora} clientes={dist.porGarcom.get(nome) ?? []} qtd={qtdPorGarcom.get(nome) ?? 0}
          selecionado={selecionado?.tipo === 'garcom' && selecionado.id === nome} movendo={moverPraca === nome} onClick={() => onGarcom(nome)} />
      ))}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} target={[-2, 0, 0]} maxPolarAngle={1.32}
        minDistance={6} maxDistance={75} autoRotate={girar} autoRotateSpeed={0.35} />
    </Canvas>
  );
};

export default Cena;
