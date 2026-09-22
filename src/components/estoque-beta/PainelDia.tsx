import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { fmt, moeda } from './api';
import { consultasApi, type PainelDia as PainelDados } from './apiConsultas';

type Destino = 'posicao' | 'central' | 'hoje' | 'compras' | 'itens';

interface Props {
  onVoltar: () => void;
  onIr: (destino: Destino) => void;
}

function statusDoBalcao(status: string | null): { rotulo: string; cor: string } {
  if (status === 'concluida') return { rotulo: 'montado', cor: 'bg-emerald-500 text-black' };
  if (status === 'contando') return { rotulo: 'contando', cor: 'bg-[#D4AF37] text-black' };
  if (status === 'levando') return { rotulo: 'levando', cor: 'bg-[#D4AF37] text-black' };
  return { rotulo: 'não montado', cor: 'bg-white/10 text-white/60' };
}

function plural(n: number, um: string, varios: string): string {
  return `${fmt(n)} ${n === 1 ? um : varios}`;
}

function fraseDeStatus(p: PainelDados): string {
  const partes: string[] = [];
  const montados = p.balcoes.filter((b) => b.status === 'concluida').length;
  const emAndamento = p.balcoes.filter((b) => b.status === 'contando' || b.status === 'levando').length;
  if (p.balcoes.length > 0) {
    if (montados === p.balcoes.length) partes.push(p.balcoes.length === 1 ? 'balcão montado' : 'todos os balcões montados');
    else if (montados === 0 && emAndamento === 0) partes.push('nenhum balcão montado ainda');
    else partes.push(`${plural(montados, 'balcão montado', 'balcões montados')}${emAndamento > 0 ? ` e ${emAndamento} em andamento` : ''}`);
  }
  if (p.zonas_vencidas > 0) partes.push(plural(p.zonas_vencidas, 'zona do Central vencendo', 'zonas do Central vencendo'));
  if (p.itens_negativos > 0) partes.push(plural(p.itens_negativos, 'item negativo', 'itens negativos'));
  if (p.listas_abertas > 0) partes.push(plural(p.listas_abertas, 'lista de compra aberta', 'listas de compra aberta'));
  if (partes.length === 0) return 'Tudo em dia por aqui.';
  const frase = partes.join(', ');
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}

interface CartaoProps {
  titulo: string;
  valor: string;
  detalhe?: string;
  tom?: 'normal' | 'destaque' | 'alerta' | 'vinho';
  onClick?: () => void;
  largo?: boolean;
  children?: React.ReactNode;
}

const TONS: Record<NonNullable<CartaoProps['tom']>, { borda: string; valor: string }> = {
  normal: { borda: 'bg-white/5 border-white/10', valor: 'text-white' },
  destaque: { borda: 'bg-white/5 border-[#D4AF37]', valor: 'text-[#D4AF37]' },
  alerta: { borda: 'bg-red-500/15 border-red-500/40', valor: 'text-red-300' },
  vinho: { borda: 'bg-[#7d1f2c]/30 border-[#7d1f2c]', valor: 'text-white' },
};

const Cartao: React.FC<CartaoProps> = ({ titulo, valor, detalhe, tom = 'normal', onClick, largo, children }) => {
  const t = TONS[tom];
  const classes = `rounded-2xl border p-4 text-left ${t.borda} ${largo ? 'col-span-2' : ''} ${onClick ? 'active:bg-white/10' : ''}`;
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-white/50 uppercase tracking-wide">{titulo}</div>
        {onClick && <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />}
      </div>
      <div className={`font-black text-3xl leading-tight mt-1 ${t.valor}`}>{valor}</div>
      {detalhe && <div className="text-xs text-white/50 mt-1">{detalhe}</div>}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={`${classes} w-full`}>
        {conteudo}
      </button>
    );
  }
  return <div className={classes}>{conteudo}</div>;
};

/** Painel do dia: o que está acontecendo no estoque, num olhar só. */
const PainelDia: React.FC<Props> = ({ onVoltar, onIr }) => {
  const [dados, setDados] = useState<PainelDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await consultasApi.painelDia();
      setDados(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o painel');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const hoje = dados?.hoje
    ? new Date(`${dados.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    : '';

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Mapa
        </button>
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-black text-3xl mt-1">Painel do dia</h1>
          <button onClick={carregar} disabled={carregando} className="p-2 rounded-xl bg-white/10 text-white/70 disabled:opacity-40" aria-label="Atualizar">
            <RefreshCw className={`w-5 h-5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {hoje && <p className="text-white/60 capitalize">{hoje}</p>}
      </div>

      {erro && <div className="mx-4 mt-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

      {carregando && !dados ? (
        <div className="p-10 text-center text-white/50">Carregando...</div>
      ) : dados ? (
        <div className={`p-4 space-y-4 max-w-3xl ${carregando ? 'opacity-60' : ''}`}>
          <div className="rounded-2xl bg-white/5 border border-[#D4AF37] p-4">
            <div className="text-xs text-[#D4AF37] uppercase tracking-wide font-bold">Agora</div>
            <div className="font-bold text-xl leading-snug mt-1">{fraseDeStatus(dados)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Cartao titulo="valor parado" valor={moeda(dados.valor_parado)} tom="destaque" largo onClick={() => onIr('posicao')} />

            <Cartao
              titulo="itens negativos"
              valor={fmt(dados.itens_negativos)}
              detalhe={dados.itens_negativos > 0 ? moeda(dados.valor_negativo) : 'nenhum'}
              tom={dados.itens_negativos > 0 ? 'alerta' : 'normal'}
              onClick={() => onIr('posicao')}
            />

            <Cartao
              titulo="zonas do Central"
              valor={`${fmt(dados.zonas_vencidas)} de ${fmt(dados.zonas_total)}`}
              detalhe={dados.zonas_vencidas > 0 ? 'vencidas, precisam contar' : 'tudo em dia'}
              tom={dados.zonas_vencidas > 0 ? 'vinho' : 'normal'}
              onClick={() => onIr('central')}
            />

            <Cartao
              titulo="balcões de hoje"
              valor={`${fmt(dados.balcoes.filter((b) => b.status === 'concluida').length)} de ${fmt(dados.balcoes.length)}`}
              detalhe="montados"
              largo
              onClick={() => onIr('hoje')}
            >
              {dados.balcoes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {dados.balcoes.map((b) => {
                    const s = statusDoBalcao(b.status);
                    return (
                      <span key={b.nome} className={`px-3 py-1 rounded-full text-xs font-bold ${s.cor}`}>
                        {b.nome} · {s.rotulo}
                      </span>
                    );
                  })}
                </div>
              )}
            </Cartao>

            <Cartao titulo="compras da semana" valor={moeda(dados.compras_semana)} onClick={() => onIr('compras')} />
            <Cartao titulo="compras de hoje" valor={moeda(dados.compras_hoje)} onClick={() => onIr('compras')} />

            <Cartao titulo="itens vendidos hoje" valor={fmt(dados.vendas_hoje_itens)} />
            <Cartao titulo="movimentos hoje" valor={fmt(dados.movimentos_hoje)} />

            <Cartao
              titulo="parados há 60 dias"
              valor={fmt(dados.itens_parados_60d)}
              detalhe="itens sem mexer"
              tom={dados.itens_parados_60d > 0 ? 'vinho' : 'normal'}
              onClick={() => onIr('itens')}
            />
            <Cartao
              titulo="listas de compra"
              valor={fmt(dados.listas_abertas)}
              detalhe="abertas"
              tom={dados.listas_abertas > 0 ? 'destaque' : 'normal'}
              onClick={() => onIr('compras')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PainelDia;
