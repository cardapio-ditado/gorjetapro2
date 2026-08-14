import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CarFront,
  ClipboardCheck,
  FolderCog,
  HardHat,
  Landmark,
  LogOut,
  ShieldCheck,
  ShoppingCart,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';

interface Modulo {
  slug: string;
  nome: string;
  descricao: string;
  icone: React.ElementType;
  rota?: string; // sem rota = em construção
  destaque?: boolean;
}

const MODULOS: Modulo[] = [
  {
    slug: 'viagens',
    nome: 'Prestação de Contas Externa',
    descricao: 'Dinheiro de viagem, lançamentos do colaborador e comprovantes',
    icone: CarFront,
    rota: '/viagens',
    destaque: true,
  },
  { slug: 'cadastros', nome: 'Cadastros', descricao: 'Funcionários, veículos, produtos e materiais', icone: FolderCog, rota: '/cadastros' },
  { slug: 'eventos', nome: 'Eventos', descricao: 'Agenda e gestão dos eventos de bar & show', icone: CalendarDays, rota: '/eventos' },
  { slug: 'estoque-central', nome: 'Estoque Central', descricao: 'Depósito central, entradas e saídas', icone: Warehouse },
  { slug: 'estoque-eventos', nome: 'Estoque de Eventos', descricao: 'Carga por evento e transferências entre eventos', icone: ArrowLeftRight },
  { slug: 'financeiro', nome: 'Financeiro Central', descricao: 'Contas a pagar/receber e fluxo da central', icone: Landmark },
  { slug: 'fechamento', nome: 'Fechamento de Evento', descricao: 'Resultado financeiro e fechamento de caixa por evento', icone: ClipboardCheck },
  { slug: 'equipe', nome: 'Equipe & Freelancers', descricao: 'Alocação de equipe fixa e freelancers nos eventos', icone: HardHat },
  { slug: 'materiais', nome: 'Materiais & Logística', descricao: 'Caixas térmicas, bistrôs e alocação por evento', icone: Boxes },
  { slug: 'compras', nome: 'Compras & Fornecedores', descricao: 'Pedidos de compra e histórico de fornecedores', icone: ShoppingCart },
  { slug: 'relatorios', nome: 'Relatórios & Painéis', descricao: 'Visão consolidada da operação e indicadores', icone: BarChart3 },
  { slug: 'usuarios', nome: 'Usuários & Permissões', descricao: 'Contas de acesso e papéis no sistema', icone: ShieldCheck },
];

export default function Home() {
  const { session, sair } = useAuth();
  const [contadores, setContadores] = useState<{ viagens: number; eventos: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [v, e] = await Promise.all([
          supabase.from('rr_viagens').select('id', { count: 'exact', head: true }).neq('status', 'fechada').neq('status', 'cancelada'),
          supabase.from('rr_eventos').select('id', { count: 'exact', head: true }).in('status', ['planejado', 'em_andamento']),
        ]);
        setContadores({ viagens: v.count ?? 0, eventos: e.count ?? 0 });
      } catch {
        /* contadores são decorativos */
      }
    })();
  }, []);

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-night-950">
      {/* fundo com luzes */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-64 left-1/2 h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-gold-500/[0.07] blur-3xl" />
        <div className="absolute -left-40 top-1/2 h-96 w-96 rounded-full bg-amber-800/[0.08] blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-gold-600/[0.05] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-8">
        {/* topo */}
        <header className="flex items-center justify-between">
          <Logo size={54} showName={false} />
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-zinc-300">{session?.user.email}</div>
              <div className="text-xs capitalize text-zinc-600">{hoje}</div>
            </div>
            <button onClick={sair} className="btn-ghost !px-3" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* hero */}
        <div className="mt-12 text-center animate-fadeUp">
          <div className="mx-auto mb-4 h-px w-24 bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <h1 className="font-display text-4xl font-bold tracking-wide text-white sm:text-5xl">
            Central de{' '}
            <span className="bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 bg-clip-text text-transparent">
              Operações
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-500">
            Gestão completa dos eventos de bar &amp; show — da preparação da viagem ao fechamento do caixa.
          </p>

          {contadores && (
            <div className="mt-6 flex items-center justify-center gap-8 text-sm">
              <div>
                <span className="font-display text-2xl font-bold text-gold-400">{contadores.viagens}</span>{' '}
                <span className="text-zinc-500">viagens em aberto</span>
              </div>
              <div className="h-8 w-px bg-night-700" />
              <div>
                <span className="font-display text-2xl font-bold text-gold-400">{contadores.eventos}</span>{' '}
                <span className="text-zinc-500">eventos ativos</span>
              </div>
            </div>
          )}
        </div>

        {/* grade de módulos */}
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {MODULOS.map((m, i) => {
            const Icone = m.icone;
            const disponivel = Boolean(m.rota);
            const conteudo = (
              <div
                className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all duration-300 animate-fadeUp ${
                  disponivel
                    ? 'border-night-700 bg-night-850 hover:-translate-y-1 hover:border-gold-500/60 hover:shadow-2xl hover:shadow-gold-600/10 cursor-pointer'
                    : 'border-night-800 bg-night-900/60 opacity-60'
                } ${m.destaque ? 'border-gold-600/40 shadow-lg shadow-gold-600/5' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* brilho no hover */}
                {disponivel && (
                  <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gold-500/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                )}

                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                      disponivel
                        ? 'border-gold-600/30 bg-gradient-to-b from-gold-500/15 to-gold-600/5 text-gold-400'
                        : 'border-night-700 bg-night-800 text-zinc-600'
                    }`}
                  >
                    <Icone className="h-6 w-6" />
                  </div>
                  {disponivel ? (
                    <ArrowUpRight className="h-4 w-4 text-zinc-600 transition group-hover:text-gold-400" />
                  ) : (
                    <span className="rounded-full border border-night-700 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-zinc-600">
                      Em breve
                    </span>
                  )}
                </div>

                <div>
                  {m.destaque && (
                    <span className="mb-1.5 inline-block rounded-full bg-gold-500/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-gold-400">
                      Prioridade
                    </span>
                  )}
                  <h2 className={`text-sm font-semibold leading-snug ${disponivel ? 'text-white' : 'text-zinc-500'}`}>
                    {m.nome}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{m.descricao}</p>
                </div>
              </div>
            );

            return disponivel ? (
              <Link key={m.slug} to={m.rota!}>
                {conteudo}
              </Link>
            ) : (
              <Link key={m.slug} to={`/modulo/${m.slug}`}>
                {conteudo}
              </Link>
            );
          })}
        </div>

        <footer className="mt-16 text-center text-xs text-zinc-700">
          RR Bares · Sistema de Gestão de Eventos
        </footer>
      </div>
    </div>
  );
}
