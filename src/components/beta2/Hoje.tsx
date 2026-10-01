import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button, IconButton, KPICard, PageHeader, type KPITom } from '../ui';
import { beta2Api, type Hoje as HojeDados } from './api';

export type DestinoHoje = 'emergencias' | 'recebimento' | 'contagem_central' | 'setores' | 'compras' | 'kits' | 'reposicao' | 'contagem' | 'aprovacoes' | 'vizinhos';

interface Props {
  onIr: (destino: DestinoHoje) => void;
}

interface Cartao {
  chave: string;
  rotulo: string;
  valor: string;
  detalhe: string;
  tom: KPITom;
  destino: DestinoHoje;
  /** Só para gestor. */
  gestor?: boolean;
}

/**
 * Hoje: só o que é de quem está olhando. Cada cartão é um botão para a tela
 * que resolve aquilo. Sem número zero em destaque: o que está em dia fica cinza.
 */
const Hoje: React.FC<Props> = ({ onIr }) => {
  const [dados, setDados] = useState<HojeDados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setDados(await beta2Api.hoje()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };

  useEffect(() => { void carregar(); }, []);

  const data = dados ? new Date(`${dados.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';
  const zigOk = dados?.zig?.status === 'sucesso' && (dados?.zig?.nao_mapeados ?? 0) === 0;
  const zigHora = dados?.zig?.finalizado_em ? new Date(dados.zig.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  const cartoes: Cartao[] = dados ? [
    { chave: 'repor', rotulo: 'Repor os setores', valor: String(dados.repor_setores), detalhe: dados.repor_setores ? 'setores com item abaixo do nível' : 'setores no nível', tom: dados.repor_setores ? 'atencao' : 'certo', destino: 'reposicao' },
    { chave: 'pedidos', rotulo: 'Pedidos e retiradas', valor: String(dados.pedidos_a_entregar + dados.retiradas_sem_confirmacao), detalhe: dados.retiradas_sem_confirmacao ? `${dados.retiradas_sem_confirmacao} retirada(s) para conferir` : dados.pedidos_a_entregar ? 'pedidos aguardando entrega' : 'nada pendente', tom: dados.pedidos_a_entregar + dados.retiradas_sem_confirmacao ? 'atencao' : 'normal', destino: 'emergencias' },
    { chave: 'notas', rotulo: 'Notas para receber', valor: String(dados.notas_pendentes), detalhe: dados.notas_pendentes ? 'compras chegando' : 'nada pendente', tom: dados.notas_pendentes ? 'atencao' : 'normal', destino: 'recebimento' },
    { chave: 'contagem', rotulo: dados.auditoria_hoje ? 'Auditoria geral hoje' : 'Contagem dos setores', valor: String(dados.contagem_setores_falta), detalhe: dados.contagem_setores_falta ? 'setores sem contagem hoje' : 'todos contaram', tom: dados.contagem_setores_falta ? 'atencao' : 'certo', destino: 'contagem' },
    { chave: 'aprovacoes', rotulo: 'Diferenças a aprovar', valor: String(dados.aprovacoes_pendentes), detalhe: dados.aprovacoes_pendentes ? 'auditorias esperando' : 'nenhuma', tom: dados.aprovacoes_pendentes ? 'atencao' : 'certo', destino: 'aprovacoes', gestor: true },
    { chave: 'zonas', rotulo: 'Contagem do Central', valor: `${dados.zonas_central.vencidas} de ${dados.zonas_central.total}`, detalhe: dados.zonas_central.vencidas ? 'zonas para contar hoje' : 'tudo em dia', tom: dados.zonas_central.vencidas ? 'atencao' : 'certo', destino: 'contagem_central' },
    { chave: 'vizinhos', rotulo: 'Empréstimos com vizinhos', valor: String(dados.emprestimos_abertos), detalhe: dados.emprestimos_antigos ? `${dados.emprestimos_antigos} há mais de 7 dias` : dados.emprestimos_abertos ? 'em aberto' : 'nada em aberto', tom: dados.emprestimos_antigos ? 'atencao' : 'normal', destino: 'vizinhos' },
    { chave: 'kits', rotulo: 'Kits de limpeza', valor: String(dados.kits_faltando), detalhe: dados.kits_faltando ? 'kits com item faltando' : 'todos completos', tom: dados.kits_faltando ? 'atencao' : 'certo', destino: 'kits' },
    { chave: 'zig', rotulo: 'Vendas da Zig', valor: dados.zig ? (zigOk ? 'OK' : dados.zig.nao_mapeados ? `${dados.zig.nao_mapeados} sem vínculo` : dados.zig.status) : 'sem registro', detalhe: zigHora ? `última às ${zigHora}` : 'nenhuma execução', tom: zigOk ? 'certo' : 'alerta', destino: 'setores' },
    { chave: 'negativos', rotulo: 'Saldos negativos', valor: String(dados.negativos), detalhe: dados.negativos ? 'precisam de contagem aprovada' : 'nenhum', tom: dados.negativos ? 'alerta' : 'certo', destino: 'contagem' },
    { chave: 'setores', rotulo: 'Configuração dos setores', valor: String(dados.setores_pendencias), detalhe: dados.setores_vazios.length ? `${dados.setores_vazios.join(', ')} sem itens` : dados.setores_pendencias ? 'pendências (nível ou venda Zig)' : 'tudo configurado', tom: dados.setores_pendencias || dados.setores_vazios.length ? 'atencao' : 'certo', destino: 'setores', gestor: true },
    { chave: 'compras', rotulo: 'Central abaixo do ponto', valor: String(dados.central_abaixo_ponto), detalhe: 'itens para comprar', tom: dados.central_abaixo_ponto ? 'destaque' : 'normal', destino: 'compras', gestor: true },
  ] : [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        caminho={['Estoque', 'Estoque Beta 2']}
        title="Hoje"
        subtitle={data ? data.charAt(0).toUpperCase() + data.slice(1) : ' '}
        actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>}
      />
      {erro && <div className="aviso aviso-perigo mb-4" role="alert">{erro}</div>}
      {!dados && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {dados && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {cartoes.filter(c => !c.gestor || dados.gestor).map(c => (
              <KPICard key={c.chave} rotulo={c.rotulo} valor={c.valor} detalhe={c.detalhe} tom={c.tom} onClick={() => onIr(c.destino)} />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button variante="primario" tamanho="toque" icone={<ArrowRight size={20} />} onClick={() => onIr('reposicao')} className="w-full justify-between">Repor os setores</Button>
            <Button tamanho="toque" icone={<ArrowRight size={20} />} onClick={() => onIr('recebimento')} className="w-full justify-between">Receber mercadoria</Button>
            <Button tamanho="toque" icone={<ArrowRight size={20} />} onClick={() => onIr('emergencias')} className="w-full justify-between">Retirada ou pedido</Button>
          </div>
        </>
      )}
    </div>
  );
};

export default Hoje;
