# Ponte WhatsApp do agente de estoque

Programa pequeno que roda na VPS (a mesma do Brasa, mas separado dele). Ele mantém um chip conectado ao WhatsApp e só faz duas coisas:

- leva cada mensagem recebida para a função `agente-whatsapp` no Supabase do estoque;
- a cada 2 segundos busca na função o que precisa ser enviado e envia.

Ele não decide nada. Quem é quem, o que cada um pode fazer e o que responder fica no Supabase, nas tabelas `agente_*`.

> WhatsApp não oficial (Baileys). O número pode ser banido. Use um chip só para isso, nunca o número da casa.

## O que precisa

- VPS Ubuntu/Debian com Node.js 20.6 ou mais novo (a do Brasa já tem Node 22).
- Um chip novo com WhatsApp instalado num celular.
- Acesso ao painel do Supabase do estoque, para criar o segredo.

## Instalação

### 1. Copiar a pasta para a VPS

Do computador que tem o repositório (depois de puxar a `main`):

```bash
scp -r ponte-whatsapp root@IP-DA-VPS:/opt/ponte-estoque
```

### 2. Instalar

Na VPS:

```bash
cd /opt/ponte-estoque
npm install --omit=dev
cp .env.example .env
```

### 3. Criar o token da ponte

O token é a senha entre a ponte e o Supabase. Ele é gerado na VPS e não passa por chat nenhum.

```bash
openssl rand -hex 32
```

Copie o resultado e cole em dois lugares:

1. No `.env` da VPS, na linha `AGENTE_PONTE_TOKEN=` (`nano .env`).
2. No Supabase do estoque: *Edge Functions → Secrets → Add new secret*, nome `AGENTE_PONTE_TOKEN`, mesmo valor.

### 4. Parear o chip

```bash
npm start
```

Aparece um QR no terminal. No celular do chip: *WhatsApp → Aparelhos conectados → Conectar aparelho* e leia o QR. Quando aparecer `[ponte] conectado como 55...`, aperte `Ctrl+C`.

Se o terminal mostrar `não consegui falar com o agente`, o token do `.env` não bate com o do Supabase.

### 5. Deixar rodando sempre

```bash
cp ponte-estoque.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ponte-estoque
```

Para ver o que está acontecendo:

```bash
journalctl -u ponte-estoque -f
```

## Dia a dia

| Situação | O que fazer |
|---|---|
| Ver se está no ar | `systemctl status ponte-estoque` |
| Reiniciar | `systemctl restart ponte-estoque` |
| Celular desconectou o aparelho | A ponte apaga a sessão sozinha. Rode `systemctl stop ponte-estoque`, depois `npm start` na pasta para ler o QR de novo, e `systemctl start ponte-estoque`. |
| Atualizar o código | Copie o `ponte.mjs` novo para `/opt/ponte-estoque` e reinicie. |

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
