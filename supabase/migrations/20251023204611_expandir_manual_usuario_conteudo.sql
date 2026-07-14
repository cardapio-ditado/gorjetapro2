/*
  # Expandir Conteúdo do Manual do Usuário
  
  Adiciona mais tópicos detalhados para cada módulo
*/

-- Adicionar mais tópicos ao Dashboard
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Dashboard' LIMIT 1),
  'Como Usar o Dashboard',
  '<h3>Entendendo o Dashboard</h3>
<p>O Dashboard é sua central de comando. Aqui você tem uma visão rápida de tudo que está acontecendo no seu negócio.</p>

<h4>Cards de Resumo</h4>
<p>Na parte superior, você encontra cards coloridos com:</p>
<ul>
  <li><strong>Vendas do Dia:</strong> Total de vendas até o momento</li>
  <li><strong>Contas a Pagar Hoje:</strong> Quantas contas vencem hoje</li>
  <li><strong>Estoque Crítico:</strong> Produtos com estoque baixo</li>
  <li><strong>Colaboradores Ativos:</strong> Quantos funcionários estão escalados</li>
</ul>

<h4>Gráficos</h4>
<p>Os gráficos mostram tendências importantes:</p>
<ul>
  <li><strong>Receita Mensal:</strong> Como está seu faturamento comparado aos meses anteriores</li>
  <li><strong>Despesas por Categoria:</strong> Onde seu dinheiro está sendo gasto</li>
  <li><strong>Vendas por Período:</strong> Horários de pico do seu estabelecimento</li>
</ul>

<h4>Ações Rápidas</h4>
<p>Clique em qualquer card para ir direto ao módulo específico e tomar ações.</p>

<h4>Dicas de Uso</h4>
<ul>
  <li>Consulte o Dashboard no início do dia para se planejar</li>
  <li>Fique atento aos alertas em vermelho - são prioridades!</li>
  <li>Use os filtros de período para análises customizadas</li>
</ul>',
  ARRAY['dashboard', 'início', 'visão geral', 'gráficos'],
  1,
  true
)
ON CONFLICT DO NOTHING;

-- Adicionar tópico sobre Baixa de Contas no Financeiro
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Financeiro' LIMIT 1),
  'Como Dar Baixa em Contas',
  '<h3>Baixa de Contas a Pagar</h3>
<p>Dar baixa significa registrar que você pagou uma conta. É muito importante fazer isso corretamente!</p>

<h4>Passo a Passo Completo:</h4>

<h5>1. Acesse a Tela de Baixa</h5>
<ul>
  <li>Clique em <strong>Financeiro</strong> no menu</li>
  <li>Vá na aba <strong>Baixa de Contas</strong></li>
  <li>Você verá todas as contas aprovadas que ainda não foram pagas</li>
</ul>

<h5>2. Localize a Conta</h5>
<ul>
  <li>Use os filtros para encontrar: por fornecedor, por data, por categoria</li>
  <li>As contas vencidas aparecem em vermelho</li>
  <li>As que vencem hoje em amarelo</li>
</ul>

<h5>3. Dar a Baixa</h5>
<ol>
  <li>Clique no botão <strong>Dar Baixa</strong> na linha da conta</li>
  <li>Abre um formulário, preencha:
    <ul>
      <li><strong>Data do Pagamento:</strong> Quando você pagou (pode ser hoje ou outro dia)</li>
      <li><strong>Valor Pago:</strong> Quanto você pagou de fato</li>
      <li><strong>Forma de Pagamento:</strong> Dinheiro, PIX, Cartão, Transferência...</li>
      <li><strong>Desconto:</strong> Se o fornecedor deu desconto, informe aqui</li>
      <li><strong>Juros/Multa:</strong> Se pagou atrasado e teve multa, coloque aqui</li>
      <li><strong>Observações:</strong> Qualquer detalhe importante</li>
    </ul>
  </li>
  <li>Clique em <strong>Confirmar Baixa</strong></li>
</ol>

<h4>Situações Especiais:</h4>

<h5>Pagamento Parcial</h5>
<p>Se você não pagou o valor total:</p>
<ul>
  <li>Informe só o valor que pagou</li>
  <li>O sistema deixa o saldo restante em aberto</li>
  <li>Você pode dar baixa parcial quantas vezes precisar</li>
</ul>

<h5>Pagamento com Desconto</h5>
<ul>
  <li>Preencha o campo "Desconto"</li>
  <li>O sistema recalcula automaticamente</li>
  <li>O histórico fica registrado</li>
</ul>

<h5>Pagamento Atrasado</h5>
<ul>
  <li>Use o campo "Juros/Multa"</li>
  <li>Informe o valor adicional que pagou</li>
  <li>O total fica correto no relatório</li>
</ul>

<h4>O Que Acontece Depois?</h4>
<ul>
  <li>✅ A conta muda para status "Paga"</li>
  <li>✅ Sai automaticamente do Fluxo de Caixa</li>
  <li>✅ Aparece nos relatórios como despesa realizada</li>
  <li>✅ Fica no histórico do fornecedor</li>
</ul>

<h4>⚠️ Atenção!</h4>
<ul>
  <li>Não dê baixa antes de pagar de verdade!</li>
  <li>Sempre confira o valor antes de confirmar</li>
  <li>Guarde os comprovantes de pagamento</li>
  <li>Se errar, não tem problema: o sistema mantém histórico e você pode ajustar</li>
</ul>',
  ARRAY['baixa', 'pagamento', 'pagar', 'fornecedor'],
  4,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Financeiro' LIMIT 1),
  'Relatórios Financeiros Explicados',
  '<h3>Entendendo Seus Relatórios</h3>
<p>Os relatórios são essenciais para entender como está a saúde financeira do seu negócio.</p>

<h4>DRE - Demonstrativo de Resultado</h4>
<p>Este é o relatório mais importante! Ele mostra se você está tendo lucro ou prejuízo.</p>

<h5>Como Ler o DRE:</h5>
<ul>
  <li><strong>Receitas:</strong> Todo dinheiro que entrou
    <ul>
      <li>Vendas do bar/restaurante</li>
      <li>Eventos fechados</li>
      <li>Outras receitas</li>
    </ul>
  </li>
  <li><strong>(-) Custos Diretos:</strong> Gastos diretos com produtos
    <ul>
      <li>Compras de bebidas</li>
      <li>Compras de alimentos</li>
      <li>Embalagens</li>
    </ul>
  </li>
  <li><strong>(=) Lucro Bruto:</strong> Receita - Custos Diretos</li>
  <li><strong>(-) Despesas Operacionais:</strong> Gastos para manter aberto
    <ul>
      <li>Salários e encargos</li>
      <li>Aluguel</li>
      <li>Luz, água, gás</li>
      <li>Marketing</li>
      <li>Manutenção</li>
    </ul>
  </li>
  <li><strong>(=) Lucro Líquido:</strong> O que sobrou de verdade</li>
</ul>

<h5>Exemplo Prático:</h5>
<pre>
Receitas: R$ 100.000
(-) Custos: R$ 30.000
= Lucro Bruto: R$ 70.000 (70%)
(-) Despesas: R$ 50.000
= Lucro Líquido: R$ 20.000 (20%)
</pre>

<h4>Fluxo de Caixa Projetado</h4>
<p>Este relatório mostra o que vai acontecer nos próximos dias/meses.</p>

<h5>Para Que Serve:</h5>
<ul>
  <li>Ver se vai ter dinheiro para pagar as contas</li>
  <li>Planejar compras grandes</li>
  <li>Decidir se pode fazer investimentos</li>
  <li>Evitar surpresas desagradáveis</li>
</ul>

<h5>Como Usar:</h5>
<ul>
  <li>Verde: Você tem dinheiro suficiente ✅</li>
  <li>Amarelo: Fique atento, o dinheiro está curto ⚠️</li>
  <li>Vermelho: Perigo! Você vai ficar sem dinheiro ❌</li>
</ul>

<h4>Análise por Centro de Custos</h4>
<p>Mostra quanto cada setor está gastando.</p>

<h5>Centros de Custo Comuns:</h5>
<ul>
  <li><strong>Bar:</strong> Compras de bebidas, barmen</li>
  <li><strong>Cozinha:</strong> Alimentos, cozinheiros</li>
  <li><strong>Salão:</strong> Garçons, mesas, decoração</li>
  <li><strong>Administrativo:</strong> Contador, sistemas, materiais de escritório</li>
  <li><strong>Marketing:</strong> Redes sociais, eventos, promoções</li>
</ul>

<h4>Dicas de Análise:</h4>
<ul>
  <li>📊 Compare com o mês anterior - está melhor ou pior?</li>
  <li>📊 Compare com o mesmo mês do ano passado</li>
  <li>📊 Estabeleça metas: "Quero ter 25% de lucro"</li>
  <li>📊 Olhe onde está gastando mais - dá para economizar?</li>
  <li>📊 Tome decisões baseadas em números, não em "achismo"</li>
</ul>',
  ARRAY['relatório', 'dre', 'análise', 'lucro'],
  5,
  true
)
ON CONFLICT DO NOTHING;

-- Continua na próxima parte...
