/*
  # Expandir Manual - Estoque Detalhado
*/

INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Passo a Passo: Minha Primeira Compra',
  '<h3>Como Fazer Sua Primeira Compra no Sistema</h3>
<p>Vou te guiar passo a passo, como se estivesse do seu lado! 😊</p>

<h4>Situação: Você acabou de receber bebidas do fornecedor</h4>

<h5>📦 Passo 1: Separar a Nota Fiscal</h5>
<ul>
  <li>Pegue a nota fiscal que veio com a entrega</li>
  <li>Confira se os produtos da nota batem com o que chegou</li>
  <li>Deixe a nota ao lado do computador</li>
</ul>

<h5>💻 Passo 2: Entrar no Sistema</h5>
<ol>
  <li>Abra o sistema</li>
  <li>No menu lateral, clique em <strong>Estoque</strong></li>
  <li>Clique na aba <strong>Compras</strong></li>
  <li>Clique no botão verde <strong>+ Nova Compra</strong></li>
</ol>

<h5>📝 Passo 3: Preencher Dados da Compra</h5>
<p>Vai abrir um formulário. Vamos preencher juntos:</p>

<ol>
  <li><strong>Fornecedor:</strong>
    <ul>
      <li>Clique na caixinha</li>
      <li>Vai aparecer uma lista</li>
      <li>Procure o nome do fornecedor (exemplo: "Distribuidora XYZ")</li>
      <li>Clique nele</li>
      <li>Se não achar, clique em "Cadastrar Novo"</li>
    </ul>
  </li>
  
  <li><strong>Estoque Destino:</strong>
    <ul>
      <li>Para onde vai essa mercadoria?</li>
      <li>Exemplo: "Estoque Bar" ou "Estoque Cozinha"</li>
      <li>Clique e escolha</li>
    </ul>
  </li>
  
  <li><strong>Data da Compra:</strong>
    <ul>
      <li>Olhe na nota fiscal</li>
      <li>Coloque a data que está na nota</li>
      <li>Clique no calendário e escolha o dia</li>
    </ul>
  </li>
  
  <li><strong>Número da Nota Fiscal:</strong>
    <ul>
      <li>Olhe no topo da nota</li>
      <li>Tem um número grande (exemplo: 123456)</li>
      <li>Digite esse número</li>
    </ul>
  </li>
</ol>

<h5>🛒 Passo 4: Adicionar os Produtos</h5>
<p>Agora vem a parte mais importante: colocar os produtos!</p>

<ol>
  <li>Clique no botão <strong>+ Adicionar Item</strong></li>
  <li>Vai abrir uma linha. Preencha assim:
    
    <h6>Exemplo: Cerveja Brahma Lata 350ml</h6>
    <ul>
      <li><strong>Produto:</strong>
        <ul>
          <li>Clique na caixinha</li>
          <li>Digite "Brahma"</li>
          <li>Escolha "Cerveja Brahma Lata 350ml"</li>
        </ul>
      </li>
      
      <li><strong>Quantidade Comprada:</strong>
        <ul>
          <li>Quantas você comprou?</li>
          <li>Na nota diz: 10 caixas</li>
          <li>Digite: 10</li>
          <li>A unidade já vem: "Caixa" (porque você cadastrou assim)</li>
        </ul>
      </li>
      
      <li><strong>Valor Unitário:</strong>
        <ul>
          <li>Quanto custou CADA caixa?</li>
          <li>Na nota: Cada caixa R$ 28,50</li>
          <li>Digite: 28,50</li>
        </ul>
      </li>
      
      <li><strong>Quantidade Recebida:</strong>
        <ul>
          <li>Quantas chegaram DE VERDADE?</li>
          <li>Conta as caixas físicas</li>
          <li>Se tudo certo: 10</li>
          <li>Se veio só 9: coloque 9 (isso é importante!)</li>
        </ul>
      </li>
    </ul>
  </li>
  
  <li>O sistema calcula sozinho:
    <ul>
      <li>10 caixas × R$ 28,50 = R$ 285,00</li>
      <li>Esse valor aparece automaticamente</li>
    </ul>
  </li>
  
  <li>Repita para cada produto da nota:
    <ul>
      <li>Clique <strong>+ Adicionar Item</strong></li>
      <li>Preencha do mesmo jeito</li>
      <li>Continue até terminar todos os itens</li>
    </ul>
  </li>
</ol>

<h5>💰 Passo 5: Gerar Conta a Pagar (Opcional)</h5>
<p>Se você ainda não pagou essa compra:</p>
<ul>
  <li>Marque a caixinha: ☑️ <strong>"Gerar Conta a Pagar"</strong></li>
  <li>O sistema cria automaticamente a conta</li>
  <li>Informe quando vence (exemplo: 30 dias)</li>
</ul>

<h5>✅ Passo 6: Salvar</h5>
<ol>
  <li>Revise tudo rapidinho</li>
  <li>O total bate com a nota? Sim?</li>
  <li>Clique no botão verde <strong>Salvar Compra</strong></li>
  <li>Pronto! 🎉</li>
</ol>

<h4>O Que Aconteceu Agora?</h4>
<ul>
  <li>✅ Os produtos entraram no estoque</li>
  <li>✅ A quantidade está atualizada</li>
  <li>✅ Se marcou "Conta a Pagar", ela foi criada</li>
  <li>✅ Tudo está registrado e você pode ver no relatório</li>
</ul>

<h4>⚠️ E Se Eu Errar?</h4>
<p>Calma! Acontece com todo mundo!</p>
<ul>
  <li>Você pode editar a compra depois</li>
  <li>Ou avisar o gerente/master para corrigir</li>
  <li>O sistema guarda histórico, nada se perde</li>
</ul>

<h4>🎯 Dica de Ouro</h4>
<p><strong>Sempre confira fisicamente:</strong></p>
<ul>
  <li>Abra as caixas</li>
  <li>Conta os produtos</li>
  <li>Vê se não tem nada quebrado</li>
  <li>Coloca no sistema exatamente o que recebeu</li>
  <li>Isso evita dor de cabeça depois!</li>
</ul>',
  ARRAY['compra', 'tutorial', 'passo a passo', 'iniciante'],
  10,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Como Fazer Produção (Passo a Passo)',
  '<h3>Registrando Produção no Sistema</h3>
<p>Exemplo prático: Você vai fazer 50 porções de batata frita</p>

<h4>🥔 Antes de Começar</h4>
<p>Você precisa ter:</p>
<ul>
  <li>✅ Uma Ficha Técnica da batata frita cadastrada</li>
  <li>✅ Os ingredientes no estoque (batata, óleo, sal)</li>
</ul>

<h5>Se Não Tem Ficha Técnica Ainda:</h5>
<ol>
  <li>Vá em <strong>Estoque > Fichas Técnicas</strong></li>
  <li>Clique <strong>+ Nova Ficha</strong></li>
  <li>Escolha o produto final: "Batata Frita Porção"</li>
  <li>Adicione os ingredientes:
    <ul>
      <li>Batata: 150g</li>
      <li>Óleo: 30ml</li>
      <li>Sal: 2g</li>
    </ul>
  </li>
  <li>Salve</li>
</ol>

<h4>📋 Agora Vamos Produzir!</h4>

<h5>Passo 1: Abrir Tela de Produção</h5>
<ol>
  <li>Menu <strong>Estoque</strong></li>
  <li>Aba <strong>Produção</strong></li>
  <li>Botão <strong>+ Nova Produção</strong></li>
</ol>

<h5>Passo 2: Escolher O Que Vai Produzir</h5>
<ul>
  <li><strong>Ficha Técnica:</strong>
    <ul>
      <li>Clique na caixinha</li>
      <li>Digite "Batata"</li>
      <li>Escolha "Batata Frita Porção"</li>
    </ul>
  </li>
</ul>

<h5>Passo 3: Definir Estoques</h5>
<ul>
  <li><strong>Estoque Origem (Ingredientes):</strong>
    <ul>
      <li>De onde vão sair batata, óleo, sal?</li>
      <li>Exemplo: "Estoque Cozinha"</li>
    </ul>
  </li>
  
  <li><strong>Estoque Destino (Produto Pronto):</strong>
    <ul>
      <li>Para onde vai a batata pronta?</li>
      <li>Pode ser o mesmo: "Estoque Cozinha"</li>
      <li>Ou outro: "Estoque Produtos Prontos"</li>
    </ul>
  </li>
</ul>

<h5>Passo 4: Quantidade</h5>
<ul>
  <li><strong>Quantas porções vai fazer?</strong>
    <ul>
      <li>Digite: 50</li>
    </ul>
  </li>
</ul>

<h5>Passo 5: Sistema Verifica</h5>
<p>Automaticamente o sistema mostra:</p>

<table>
  <tr><th>Ingrediente</th><th>Precisa</th><th>Tem no Estoque</th><th>Status</th></tr>
  <tr><td>Batata</td><td>7,5 kg</td><td>15 kg</td><td>✅ OK</td></tr>
  <tr><td>Óleo</td><td>1,5 L</td><td>5 L</td><td>✅ OK</td></tr>
  <tr><td>Sal</td><td>100 g</td><td>50 g</td><td>❌ FALTA!</td></tr>
</table>

<h5>Passo 6: Resolver Problemas</h5>
<p>Se aparecer ❌ FALTA:</p>
<ul>
  <li><strong>Opção 1:</strong> Comprar o que falta</li>
  <li><strong>Opção 2:</strong> Produzir menos
    <ul>
      <li>O sistema sugere: "Você pode fazer 25 porções"</li>
      <li>Mude a quantidade para 25</li>
    </ul>
  </li>
</ul>

<h5>Passo 7: Confirmar Produção</h5>
<ol>
  <li>Tudo verde? ✅</li>
  <li>Clique <strong>Iniciar Produção</strong></li>
  <li>Sistema pergunta: "Confirma?"</li>
  <li>Clique <strong>Sim</strong></li>
</ol>

<h4>🎉 Pronto! O Que Aconteceu?</h4>

<h5>No Estoque de Ingredientes (Origem):</h5>
<ul>
  <li>❌ Saiu: 7,5 kg de batata</li>
  <li>❌ Saiu: 1,5 L de óleo</li>
  <li>❌ Saiu: 100g de sal</li>
</ul>

<h5>No Estoque de Produtos (Destino):</h5>
<ul>
  <li>✅ Entrou: 50 porções de Batata Frita</li>
</ul>

<h5>No Sistema:</h5>
<ul>
  <li>✅ Tudo registrado com data e hora</li>
  <li>✅ Custo calculado automaticamente</li>
  <li>✅ Histórico completo mantido</li>
</ul>

<h4>💡 Dicas Importantes</h4>

<h5>Desperdício</h5>
<p>Se você fez 50 porções mas 2 queimaram:</p>
<ul>
  <li>Registre as 2 queimadas como desperdício</li>
  <li>O sistema rastreia isso</li>
  <li>Ajuda a identificar problemas</li>
</ul>

<h5>Produção Parcial</h5>
<p>Se começou a fazer 50 mas só completou 40:</p>
<ul>
  <li>Registre só as 40 que ficaram prontas</li>
  <li>Os ingredientes gastos saem proporcional</li>
</ul>

<h4>🔍 Ver Histórico</h4>
<p>Para ver todas as produções:</p>
<ul>
  <li>Aba <strong>Produção</strong></li>
  <li>Lista mostra tudo que foi produzido</li>
  <li>Pode filtrar por data, produto, usuário</li>
</ul>',
  ARRAY['produção', 'fabricação', 'tutorial', 'ficha técnica'],
  11,
  true
)
ON CONFLICT DO NOTHING;
