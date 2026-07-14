/*
  # Manual Prático - RH e Eventos
*/

INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo RH' LIMIT 1),
  'Como Criar uma Escala de Trabalho',
  '<h3>Montando a Escala da Semana</h3>
<p>Vou te ensinar a montar uma escala de forma simples e organizada!</p>

<h4>📅 Situação: Preciso fazer a escala da próxima semana</h4>

<h5>Passo 1: Planejar no Papel Primeiro</h5>
<p>Antes de entrar no sistema, faça assim:</p>
<ul>
  <li>Pegue um papel e caneta</li>
  <li>Escreva os dias da semana</li>
  <li>Pense: Quais dias são mais movimentados?
    <ul>
      <li>Sexta e sábado precisam de mais gente</li>
      <li>Segunda e terça são mais calmos</li>
    </ul>
  </li>
  <li>Liste quem está disponível</li>
  <li>Lembre das folgas (cada um precisa de 1 folga por semana)</li>
</ul>

<h5>Passo 2: Entrar no Sistema</h5>
<ol>
  <li>Menu <strong>RH</strong></li>
  <li>Aba <strong>Escalas</strong></li>
  <li>Botão <strong>+ Nova Escala</strong></li>
</ol>

<h5>Passo 3: Configurar a Escala</h5>
<ul>
  <li><strong>Nome da Escala:</strong>
    <ul>
      <li>Exemplo: "Escala Garçons - Semana 20/01 a 26/01"</li>
      <li>Assim fica fácil encontrar depois</li>
    </ul>
  </li>
  
  <li><strong>Período:</strong>
    <ul>
      <li>Data início: 20/01/2025</li>
      <li>Data fim: 26/01/2025</li>
    </ul>
  </li>
  
  <li><strong>Setor:</strong>
    <ul>
      <li>Escolha: Salão, Bar, Cozinha, etc</li>
    </ul>
  </li>
</ul>

<h5>Passo 4: Adicionar Colaboradores</h5>
<p>Agora vem a parte legal!</p>

<ol>
  <li>Clique <strong>+ Adicionar Colaborador</strong></li>
  
  <li>Escolha o primeiro (exemplo: João)
    <ul>
      <li>Uma linha aparece com os dias da semana</li>
    </ul>
  </li>
  
  <li>Para cada dia:
    <h6>Segunda (20/01):</h6>
    <ul>
      <li>João trabalha? SIM</li>
      <li>Clique na célula de segunda</li>
      <li>Escolha o turno:
        <ul>
          <li>🌅 Manhã: 08h às 16h</li>
          <li>🌆 Tarde: 14h às 22h</li>
          <li>🌙 Noite: 18h às 02h</li>
          <li>📅 Dia todo: 10h às 22h</li>
        </ul>
      </li>
    </ul>
    
    <h6>Terça (21/01):</h6>
    <ul>
      <li>João folga!</li>
      <li>Clique na célula</li>
      <li>Escolha: ⭕ Folga</li>
      <li>A célula fica cinza</li>
    </ul>
    
    <h6>Quarta, Quinta, Sexta, Sábado:</h6>
    <ul>
      <li>Repita escolhendo os turnos</li>
    </ul>
    
    <h6>Domingo:</h6>
    <ul>
      <li>Se não trabalha domingo: ⭕ Folga</li>
      <li>Se trabalha: escolha o turno</li>
    </ul>
  </li>
  
  <li>Clique <strong>+ Adicionar Colaborador</strong></li>
  
  <li>Escolha o próximo (Maria) e repita</li>
  
  <li>Continue até colocar todo mundo</li>
</ol>

<h5>Passo 5: Sistema Te Ajuda!</h5>
<p>Olha que legal, o sistema mostra alertas:</p>

<ul>
  <li>🔴 <strong>Conflito de Horário</strong>
    <ul>
      <li>"João já está escalado neste horário"</li>
      <li>Significa que você colocou ele 2 vezes no mesmo dia</li>
    </ul>
  </li>
  
  <li>🟡 <strong>Carga Horária Alta</strong>
    <ul>
      <li>"João vai trabalhar 60 horas esta semana"</li>
      <li>Atenção: pode ter hora extra!</li>
    </ul>
  </li>
  
  <li>🟠 <strong>Falta de Folga</strong>
    <ul>
      <li>"Maria não tem folga esta semana"</li>
      <li>Todo mundo precisa de pelo menos 1 folga!</li>
    </ul>
  </li>
  
  <li>✅ <strong>Tudo Certo</strong>
    <ul>
      <li>Linha fica verde</li>
      <li>Pode seguir tranquilo</li>
    </ul>
  </li>
</ul>

<h5>Passo 6: Revisar</h5>
<p>Antes de salvar, confira:</p>
<ul>
  <li>☑️ Ninguém trabalha 7 dias seguidos?</li>
  <li>☑️ Sexta e sábado tem gente suficiente?</li>
  <li>☑️ Não tem buracos (dias sem ninguém)?</li>
  <li>☑️ Horários fazem sentido? (ninguém entra 8h e sai 2h da madrugada)</li>
</ul>

<h5>Passo 7: Salvar e Publicar</h5>
<ol>
  <li>Clique <strong>Salvar Escala</strong></li>
  <li>Clique <strong>Publicar</strong>
    <ul>
      <li>Todos os funcionários recebem notificação</li>
      <li>Eles podem ver a escala deles</li>
    </ul>
  </li>
</ol>

<h4>📱 Depois de Publicar</h4>

<h5>Imprimir para o Mural:</h5>
<ul>
  <li>Clique em <strong>Imprimir</strong></li>
  <li>Sai bonitinho para colar no mural</li>
</ul>

<h5>Precisou Mudar?</h5>
<ul>
  <li>Pode editar a escala</li>
  <li>Sistema avisa quem foi afetado</li>
  <li>Histórico fica registrado</li>
</ul>

<h4>💡 Dicas de Ouro</h4>

<h5>Faça com Antecedência</h5>
<ul>
  <li>Crie a escala com 1 semana de antecedência</li>
  <li>Pessoal se programa melhor</li>
  <li>Evita reclamações</li>
</ul>

<h5>Seja Justo</h5>
<ul>
  <li>Reveze quem trabalha fim de semana</li>
  <li>Distribua as folgas de domingo</li>
  <li>Todo mundo merece descansar</li>
</ul>

<h5>Considere Preferências</h5>
<ul>
  <li>Pergunte quem prefere manhã/noite</li>
  <li>Alguns estudam: evite horários de aula</li>
  <li>Mães com filhos: considere horário escolar</li>
</ul>

<h4>❓ Situações Comuns</h4>

<h5>"Alguém Faltou!"</h5>
<ul>
  <li>Vá na escala</li>
  <li>Marque como: ❌ Falta</li>
  <li>Sistema registra</li>
  <li>Chame um substituto</li>
</ul>

<h5>"Preciso Trocar Dois Colaboradores"</h5>
<ul>
  <li>Edite a escala</li>
  <li>Tire um, coloque outro</li>
  <li>Sistema avisa ambos</li>
</ul>

<h5>"Esqueci de Escalar Alguém"</h5>
<ul>
  <li>Sem problema!</li>
  <li>Edite e adicione</li>
  <li>Publique de novo</li>
</ul>',
  ARRAY['escala', 'trabalho', 'turno', 'folga', 'tutorial'],
  10,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Eventos' LIMIT 1),
  'Cadastrando um Evento Fechado Completo',
  '<h3>Do Primeiro Contato até o Evento Acontecer</h3>
<p>Vou te guiar em todo o processo de venda de um evento!</p>

<h4>📞 Fase 1: Cliente Ligou Interessado</h4>

<h5>O Que Perguntar:</h5>
<ul>
  <li>📅 Que dia quer o evento?</li>
  <li>👥 Quantas pessoas?</li>
  <li>🎉 Que tipo de festa? (aniversário, casamento, formatura...)</li>
  <li>🕐 Que horário? (início e fim)</li>
  <li>💰 Qual o orçamento?</li>
</ul>

<h5>Anotar Contato:</h5>
<ul>
  <li>Nome completo</li>
  <li>Telefone (com WhatsApp)</li>
  <li>Email (se tiver)</li>
</ul>

<h4>💼 Fase 2: Fazer Orçamento</h4>

<h5>Entrar no Sistema:</h5>
<ol>
  <li>Menu <strong>Eventos</strong></li>
  <li>Aba <strong>Eventos Fechados</strong></li>
  <li>Botão <strong>+ Novo Evento</strong></li>
</ol>

<h5>Preencher Dados do Evento:</h5>

<h6>Informações Básicas:</h6>
<ul>
  <li><strong>Nome do Evento:</strong>
    <ul>
      <li>Exemplo: "Aniversário 15 anos Maria Silva"</li>
    </ul>
  </li>
  
  <li><strong>Tipo:</strong>
    <ul>
      <li>Aniversário</li>
      <li>Casamento</li>
      <li>Formatura</li>
      <li>Corporativo</li>
      <li>Outro</li>
    </ul>
  </li>
  
  <li><strong>Data:</strong>
    <ul>
      <li>Clique no calendário</li>
      <li>Escolha o dia</li>
    </ul>
  </li>
  
  <li><strong>Horário:</strong>
    <ul>
      <li>Início: 20:00</li>
      <li>Término: 02:00 (madrugada)</li>
    </ul>
  </li>
  
  <li><strong>Número de Pessoas:</strong>
    <ul>
      <li>150 pessoas</li>
    </ul>
  </li>
</ul>

<h6>Dados do Cliente:</h6>
<ul>
  <li><strong>Nome Completo:</strong> Maria Silva Santos</li>
  <li><strong>CPF:</strong> 123.456.789-00</li>
  <li><strong>Telefone:</strong> (11) 98765-4321</li>
  <li><strong>Email:</strong> maria@email.com</li>
  <li><strong>Endereço:</strong> Rua das Flores, 123</li>
</ul>

<h6>Valores:</h6>
<p>Agora você monta o orçamento:</p>

<table style="width:100%; border:1px solid #ddd;">
  <tr><th>Item</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th></tr>
  <tr><td>Locação do Espaço</td><td>1</td><td>R$ 2.000</td><td>R$ 2.000</td></tr>
  <tr><td>Buffet (por pessoa)</td><td>150</td><td>R$ 45</td><td>R$ 6.750</td></tr>
  <tr><td>Open Bar (por pessoa)</td><td>150</td><td>R$ 35</td><td>R$ 5.250</td></tr>
  <tr><td>Decoração</td><td>1</td><td>R$ 1.500</td><td>R$ 1.500</td></tr>
  <tr><td>Som e DJ</td><td>1</td><td>R$ 1.000</td><td>R$ 1.000</td></tr>
  <tr><th colspan="3">TOTAL</th><th>R$ 16.500</th></tr>
</table>

<p>No sistema, você preenche:</p>
<ul>
  <li><strong>Valor Total:</strong> R$ 16.500,00</li>
  
  <li><strong>Forma de Pagamento:</strong>
    <ul>
      <li>Sinal (30%): R$ 4.950</li>
      <li>Restante: R$ 11.550 (parcelado ou na data)</li>
    </ul>
  </li>
</ul>

<h6>Detalhes do Evento:</h6>
<p>Campo de observações, coloque tudo:</p>
<ul>
  <li>Tema da festa: Anos 2000</li>
  <li>Cores: Pink e preto</li>
  <li>Bolo: De chocolate, 3 andares</li>
  <li>Restrições alimentares: 5 vegetarianos, 2 celíacos</li>
  <li>Horário do parabéns: 23h</li>
  <li>Música: Pop e funk</li>
  <li>Observações: Cliente quer balões rosa</li>
</ul>

<h5>Status do Orçamento:</h5>
<ul>
  <li><strong>Orçamento:</strong> Cliente ainda está pensando</li>
  <li>Salve assim</li>
</ul>

<h4>📱 Fase 3: Cliente Aprovou!</h4>

<h5>Ele ligou e confirmou:</h5>
<ol>
  <li>Abra o evento no sistema</li>
  <li>Clique <strong>Editar</strong></li>
  <li>Mude status para: <strong>Confirmado</strong></li>
  <li>Marque: ☑️ <strong>Contrato Assinado</strong></li>
  <li>Registre o sinal recebido:
    <ul>
      <li>Sinal Pago: R$ 4.950</li>
      <li>Data Recebimento: hoje</li>
      <li>Forma: PIX</li>
    </ul>
  </li>
  <li>Salve</li>
</ol>

<h5>Gerar Conta a Receber:</h5>
<ul>
  <li>O sistema pergunta: "Gerar conta a receber do saldo?"</li>
  <li>Clique <strong>Sim</strong></li>
  <li>Ele cria automaticamente:
    <ul>
      <li>Conta de R$ 11.550</li>
      <li>Vencimento: data do evento</li>
      <li>Cliente: Maria Silva Santos</li>
      <li>Vinculada ao evento</li>
    </ul>
  </li>
</ul>

<h4>📋 Fase 4: Organização Interna</h4>

<h5>Checklist (anote no campo observações):</h5>
<ul>
  <li>☐ Confirmar com fornecedor decoração</li>
  <li>☐ Confirmar com DJ</li>
  <li>☐ Comprar ingredientes buffet</li>
  <li>☐ Escalar equipe para o dia</li>
  <li>☐ Preparar mesas (150 pessoas = quantas mesas?)</li>
  <li>☐ Testar som 1 dia antes</li>
</ul>

<h5>Uma Semana Antes:</h5>
<ul>
  <li>Ligue para o cliente confirmando tudo</li>
  <li>Pergunte se mudou algo</li>
  <li>Lembre do saldo (se não pagou)</li>
</ul>

<h4>🎉 Fase 5: Dia do Evento</h4>

<h5>Antes de Começar:</h5>
<ul>
  <li>Abra o evento no sistema</li>
  <li>Tenha todos os detalhes na mão</li>
  <li>Imprima se quiser</li>
</ul>

<h5>Durante:</h5>
<ul>
  <li>Siga o planejado</li>
  <li>Anote qualquer problema no campo observações</li>
</ul>

<h5>Cliente Pagou o Restante:</h5>
<ol>
  <li>Vá em <strong>Financeiro > Contas a Receber</strong></li>
  <li>Procure pela conta da Maria Silva</li>
  <li>Clique <strong>Receber</strong></li>
  <li>Confirme: R$ 11.550</li>
  <li>Forma: Dinheiro/PIX/Cartão</li>
  <li>Finalize</li>
</ol>

<h4>✅ Fase 6: Após o Evento</h4>

<h5>No Sistema:</h5>
<ol>
  <li>Edite o evento</li>
  <li>Mude status: <strong>Realizado</strong></li>
  <li>Adicione observações finais:
    <ul>
      <li>Como foi</li>
      <li>Se teve algum problema</li>
      <li>Gastos extras</li>
    </ul>
  </li>
  <li>Salve</li>
</ol>

<h5>Feedback:</h5>
<ul>
  <li>Mande mensagem agradecendo</li>
  <li>Peça avaliação/depoimento</li>
  <li>Guarde contato para futuras festas</li>
</ul>

<h4>💡 Dicas Profissionais</h4>

<h5>Orçamento:</h5>
<ul>
  <li>Seja realista com valores</li>
  <li>Deixe margem de lucro (mínimo 30%)</li>
  <li>Considere imprevistos</li>
</ul>

<h5>Contrato:</h5>
<ul>
  <li>SEMPRE faça contrato assinado</li>
  <li>Deixe claras as regras de cancelamento</li>
  <li>Anexe no sistema (pode tirar foto e subir)</li>
</ul>

<h5>Sinal:</h5>
<ul>
  <li>Mínimo 30% de entrada</li>
  <li>Não confirme evento sem sinal</li>
  <li>Pessoas desistem!</li>
</ul>

<h5>Comunicação:</h5>
<ul>
  <li>Responda rápido (WhatsApp é rei)</li>
  <li>Seja cordial sempre</li>
  <li>Tire TODAS as dúvidas antes</li>
  <li>Confirme 1 semana antes</li>
</ul>',
  ARRAY['evento', 'festa', 'fechado', 'tutorial', 'vendas'],
  10,
  true
)
ON CONFLICT DO NOTHING;
