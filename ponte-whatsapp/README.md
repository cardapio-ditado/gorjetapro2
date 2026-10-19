# Ponte WhatsApp do agente de estoque

Programa pequeno que roda na VPS (a mesma do Brasa, mas separado dele). Ele mantém um chip conectado ao WhatsApp e só faz duas coisas:

- leva cada mensagem recebida para a função `agente-whatsapp` no Supabase do estoque;
- a cada 2 segundos busca na função o que precisa ser enviado e envia;
- a cada 5 segundos conta como está (conectada, esperando QR, parada) e pega o comando que a tela deixou.

Ele não decide nada. Quem é quem, o que cada um pode fazer e o que responder fica no Supabase, nas tabelas `agente_*`.

> WhatsApp não oficial (Baileys). O número pode ser banido. Use um chip só para isso, nunca o número da casa.

## O que precisa

- VPS Ubuntu/Debian com Node.js 20.6 ou mais novo (a do Brasa já tem Node 22).
- Um chip novo com WhatsApp instalado num celular.
- Acesso ao painel do Supabase do estoque, para criar o secret.

## Instalação

Na VPS, como root, um comando só:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/cardapio-ditado/gorjetapro2/main/ponte-whatsapp/instalar.sh)
```

O instalador:

1. Confere o Node (instala o 22 se faltar).
2. Baixa a ponte para `/opt/ponte-estoque` e instala as dependências.
3. Gera o token da ponte e mostra na tela. Copie e crie no Supabase do estoque: *Edge Functions → Secrets → Add new secret*, nome `AGENTE_PONTE_TOKEN`. Ele espera você salvar e confere se o Supabase aceitou. O token fica só na VPS e no Supabase: não mande por chat.
4. Cria o serviço `ponte-estoque`, que fica rodando e volta sozinho se a VPS reiniciar.

Depois, pareie pelo sistema: *Estoque Beta 2 → WhatsApp do estoque → Gerar QR* (ou *Gerar código*, para parear pelo próprio celular do chip). Só admin e master veem essa tela.

Para parear no terminal, como antes, passe `qr` ou o número do chip no fim do comando.

Rodar o mesmo comando de novo atualiza a ponte e mantém o token e a sessão.

## Dia a dia

| Situação | O que fazer |
|---|---|
| Ver se está no ar | Tela *WhatsApp do estoque* (ou `systemctl status ponte-estoque`) |
| Reiniciar | Botão *Reconectar* (ou `systemctl restart ponte-estoque`) |
| WhatsApp encerrou a sessão | A ponte apaga a sessão e gera QR novo na tela. Se ninguém ler, fica parada até alguém tocar em *Gerar QR*. |
| Trocar o número | Botão *Desconectar*, depois *Gerar QR* com o chip novo. |
| Mensagem que falhou ao enviar | Volta para a fila e é tentada de novo, uma vez por minuto, até 4 vezes. |
| Atualizar o código | Rode o comando de instalação de novo. |

## Controle pelo Supabase

Tudo isso se muda no banco, sem mexer na VPS:

| Onde | Para quê |
|---|---|
| `agente_equipe` | Quem pode falar com o agente (telefone, papel, ativo). |
| `agente_permissoes` | O que cada papel pode fazer, em quais estoques, direto ou com aprovação. |
| `agente_config.so_dono` | `true`: só o dono é atendido. Para os testes iniciais. |
| `agente_config.modo_ensaio` | `true`: o agente conversa mas não grava nada no estoque. |
| `agente_config.regras_extra` | Texto com regras novas para o agente, sem precisar publicar código. |
| `agente_mensagens` | Histórico de tudo que entrou e saiu, com o custo de cada resposta. |
