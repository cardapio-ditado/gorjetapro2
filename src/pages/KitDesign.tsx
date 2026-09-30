import React, { useState } from 'react';
import { Download, Inbox, Plus, Trash2 } from 'lucide-react';
import {
  Badge, Button, Chip, DataTable, EmptyState, IconButton, Input, KPICard, PageHeader, SectionCard, Segmented, Select, Textarea, Toolbar,
  type Column,
} from '../components/ui';

const CORES: Array<{ nome: string; hex: string; uso: string }> = [
  { nome: 'Fundo', hex: '#0b0e14', uso: 'a página' },
  { nome: 'Cartão', hex: '#12161f', uso: 'todo bloco de conteúdo' },
  { nome: 'Elevado', hex: '#181d29', uso: 'menu, popover, linha destacada' },
  { nome: 'Vinho', hex: '#7D1F2C', uso: 'o botão principal, um por tela' },
  { nome: 'Ouro', hex: '#D4AF37', uso: 'o número que importa, o item ativo' },
  { nome: 'Texto', hex: '#e8edf8', uso: 'tudo que se lê' },
  { nome: 'Certo', hex: '#10b981', uso: 'pago, concluído, em dia' },
  { nome: 'Atenção', hex: '#f59e0b', uso: 'vence hoje, abaixo do nível' },
  { nome: 'Problema', hex: '#ef4444', uso: 'atrasado, negativo, erro' },
];

interface Linha { item: string; categoria: string; saldo: number; valor: number }

const LINHAS: Linha[] = [
  { item: 'Exemplo de item A', categoria: 'Bebidas', saldo: -5.4, valor: -637.2 },
  { item: 'Exemplo de item B', categoria: 'Carnes', saldo: 12, valor: 540 },
  { item: 'Exemplo de item C', categoria: 'Descartáveis', saldo: 200, valor: 36 },
];

const COLUNAS: Column<Linha>[] = [
  { key: 'item', label: 'Item' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'saldo', label: 'Saldo', align: 'right', isNumeric: true },
  { key: 'valor', label: 'Valor', align: 'right', isCurrency: true },
];

/**
 * A vitrine viva do kit: cada peça, como se usa, e as regras. Toda tela nova
 * é montada só com o que está aqui. Os números são de exemplo.
 */
const KitDesign: React.FC = () => {
  const [estoque, setEstoque] = useState<'casa' | 'central' | 'bar' | 'cozinha'>('casa');
  const [negativos, setNegativos] = useState(true);
  const [zerados, setZerados] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const simular = () => { setCarregando(true); setTimeout(() => setCarregando(false), 1200); };

  return (
    <div className="max-w-5xl">
      <PageHeader
        caminho={['Gestão', 'Kit de padrões']}
        title="Kit de padrões"
        subtitle="As peças com que toda tela é montada. Nove cores, cinco tamanhos de texto, quatro botões."
        actions={
          <>
            <Button icone={<Download size={16} />}>Secundário</Button>
            <Button variante="primario" icone={<Plus size={16} />}>Primário</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPICard rotulo="valor parado" valor={29640} format="currency" tom="destaque" detalhe="600 itens ativos" />
        <KPICard rotulo="negativos" valor={37} tom="alerta" detalhe="somam −R$ 13.400" onClick={() => undefined} />
        <KPICard rotulo="abaixo do nível" valor={41} tom="atencao" detalhe="entram na lista de compras" />
        <KPICard rotulo="parados há 60 dias" valor={112} detalhe="sem entrada nem saída" />
      </div>

      <Toolbar className="mb-6">
        <Segmented
          rotulo="Estoque"
          valor={estoque}
          onMudar={setEstoque}
          opcoes={[
            { valor: 'casa', rotulo: 'Toda a casa' },
            { valor: 'central', rotulo: 'Central' },
            { valor: 'bar', rotulo: 'Bar' },
            { valor: 'cozinha', rotulo: 'Cozinha' },
          ]}
        />
        <Chip ligado={negativos} onMudar={setNegativos} tom="perigo">Negativos</Chip>
        <Chip ligado={zerados} onMudar={setZerados}>Zerados</Chip>
        <Toolbar.Espaco />
        <Input type="search" placeholder="Buscar item" aria-label="Buscar item" className="w-64" />
      </Toolbar>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Cores: só estas" descricao="Hoje o sistema usa 533 cores diferentes. Passa a usar 9.">
          <div className="grid grid-cols-3 gap-3">
            {CORES.map(c => (
              <div key={c.hex} className="flex flex-col gap-1">
                <div aria-hidden="true" className="h-11 rounded-lg" style={{ background: c.hex, border: '1px solid var(--border-strong)' }} />
                <p className="t-label" style={{ color: 'var(--text-primary)', margin: 0 }}>{c.nome}</p>
                <p className="t-caption" style={{ margin: 0 }}>{c.hex} · {c.uso}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Texto: cinco tamanhos" descricao="Playfair só no título da página. DM Sans em todo o resto.">
          <div className="flex flex-col gap-3">
            <p className="t-title" style={{ margin: 0 }}>Título da página <span className="t-caption">28</span></p>
            <p className="t-subsec" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Título de bloco <span className="t-caption">20</span></p>
            <p className="t-body" style={{ margin: 0 }}>Texto corrido, o que a pessoa lê. Descrições, células de tabela, formulários. <span className="t-caption">14</span></p>
            <p className="t-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>Rótulo e apoio: data, unidade, dica. <span className="t-caption">12</span></p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>R$ 29.640 <span className="t-caption">número 26</span></p>
            <p className="t-caption" style={{ margin: 0 }}>No celular da operação tudo sobe um degrau: texto 16, botão 20, número 32.</p>
          </div>
        </SectionCard>

        <SectionCard title="Botões: quatro, e só">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variante="primario">Salvar</Button>
              <span className="t-caption">principal · um por tela</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button>Exportar</Button>
              <span className="t-caption">secundário · o padrão</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variante="discreto">Cancelar</Button>
              <span className="t-caption">discreto</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variante="perigo" icone={<Trash2 size={16} />}>Excluir</Button>
              <span className="t-caption">perigo · pede confirmação</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button tamanho="sm">Pequeno</Button>
              <IconButton aria-label="Excluir linha" tom="perigo"><Trash2 size={14} /></IconButton>
              <Button variante="primario" carregando={carregando} onClick={simular}>{carregando ? 'Salvando' : 'Com espera'}</Button>
              <span className="t-caption">linha de tabela · só ícone · carregando</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <Button variante="primario" tamanho="toque">Próximo</Button>
              <span className="t-caption">celular · 56 px de altura</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Campos" descricao="36px, fundo da página, rótulo em cima, dica ou erro embaixo.">
          <div className="flex flex-col gap-3">
            <Input rotulo="Fornecedor" defaultValue="Ambev Distribuidora" dica="Comece a digitar para achar no cadastro." />
            <Select rotulo="Estoque" defaultValue="central">
              <option value="central">Central</option>
              <option value="bar">Bar</option>
              <option value="cozinha">Cozinha</option>
            </Select>
            <Input rotulo="Vencimento" defaultValue="31/02/2026" erro="Essa data não existe." />
            <Textarea rotulo="Observações" placeholder="Opcional" rows={2} />
          </div>
        </SectionCard>

        <SectionCard title="Etiquetas">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">pago</Badge>
            <Badge variant="warning">vence hoje</Badge>
            <Badge variant="danger">atrasado</Badge>
            <Badge variant="neutral">rascunho</Badge>
            <Badge variant="gold">destaque</Badge>
            <Badge variant="info">informação</Badge>
          </div>
        </SectionCard>

        <SectionCard title="Avisos" descricao="Texto de estado nunca solto: sempre em .aviso ou .texto-*, que lêem nos dois temas.">
          <div className="flex flex-col gap-2">
            <div className="aviso">Explicação neutra: <strong>Zig baixa</strong> desconta o item sozinho às 6h.</div>
            <div className="aviso aviso-certo">3 itens repostos.</div>
            <div className="aviso aviso-atencao">2 itens sem nível definido.</div>
            <div className="aviso aviso-perigo" role="alert">Sem permissão para mover este item.</div>
            <p className="t-body" style={{ margin: 0 }}>Na linha: saldo <span className="texto-perigo">−4</span> · <span className="texto-atencao">sem nível</span> · <span className="texto-certo">em dia</span></p>
          </div>
        </SectionCard>

        <SectionCard title="Estado vazio">
          <EmptyState icon={Inbox} title="Nenhuma conta vence hoje" description="A próxima é sexta, Ambev, R$ 1.240." action={{ label: 'Ver a semana', onClick: () => undefined }} compact />
        </SectionCard>

        <SectionCard title="Tabela" className="lg:col-span-2" noPadding>
          <DataTable columns={COLUNAS} data={LINHAS} onRowClick={() => undefined} />
        </SectionCard>

        <SectionCard title="Toda tela, a mesma ordem">
          <ol className="t-body pl-5 flex flex-col gap-1" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <li>Caminho (Estoque / Posição)</li>
            <li>Título + frase de uma linha + ações à direita</li>
            <li>Números que importam (até 4)</li>
            <li>Filtros numa linha só</li>
            <li>Lista ou formulário</li>
          </ol>
        </SectionCard>

        <SectionCard title="Medidas fixas">
          <ul className="t-body pl-5 flex flex-col gap-1" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <li>Cantos: 8 px em controle, 10 px em cartão, 12 px no celular</li>
            <li>Espaços: 4, 8, 12, 16, 20, 28. Nada fora disso</li>
            <li>Borda: uma só, branca a 8%</li>
            <li>Sem sombra, sem brilho, sem degradê</li>
            <li>Ícones: um conjunto (Lucide), traço 1,8</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
};

export default KitDesign;
