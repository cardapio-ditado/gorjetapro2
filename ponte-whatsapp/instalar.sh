#!/usr/bin/env bash
#
# Instala a ponte WhatsApp do agente de estoque numa VPS Ubuntu/Debian.
# Fica em /opt/ponte-estoque, separada do Brasa, com serviço próprio.
#
# Uso (como root):
#   bash <(curl -fsSL https://raw.githubusercontent.com/cardapio-ditado/gorjetapro2/main/ponte-whatsapp/instalar.sh)
#
# Para parear pelo próprio celular do chip (código em vez de QR), passe o
# número do chip com DDI e DDD no fim:
#   bash <(curl -fsSL .../instalar.sh) 5565999999999
#
# Pode rodar de novo para atualizar: o .env (token) e a sessão do WhatsApp
# são mantidos.
set -euo pipefail

NUMERO_CHIP="${1:-}"

BASE="https://raw.githubusercontent.com/cardapio-ditado/gorjetapro2/main/ponte-whatsapp"
DESTINO="/opt/ponte-estoque"
SERVICO="ponte-estoque"
URL_AGENTE="https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/agente-whatsapp"

azul()  { printf '\n\033[36m%s\033[0m\n' "$1"; }
verde() { printf '\033[32m%s\033[0m\n' "$1"; }
vermelho() { printf '\033[31m%s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  vermelho "Rode como root."
  exit 1
fi

azul "== 1/5  Node.js =="
precisa_node=1
if command -v node >/dev/null 2>&1; then
  maior=$(node -p 'process.versions.node.split(".").map(Number).reduce((a,v,i)=>a+v*[1e6,1e3,1][i],0)')
  if [ "$maior" -ge 20006000 ]; then precisa_node=0; fi
fi
if [ "$precisa_node" -eq 1 ]; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
verde "Node $(node -v)"

azul "== 2/5  Arquivos =="
mkdir -p "$DESTINO"
cd "$DESTINO"
for arq in ponte.mjs package.json .env.example; do
  curl -fsSL "$BASE/$arq" -o "$arq"
done
npm install --omit=dev --no-audit --no-fund --loglevel=error
verde "Instalado em $DESTINO"

azul "== 3/5  Token da ponte =="
if [ ! -f .env ] || ! grep -q '^AGENTE_PONTE_TOKEN=.\+' .env; then
  TOKEN=$(openssl rand -hex 32)
  printf 'AGENTE_URL=%s\nAGENTE_PONTE_TOKEN=%s\nSESSAO_DIR=%s/sessao\n' "$URL_AGENTE" "$TOKEN" "$DESTINO" > .env
  chmod 600 .env
  echo
  echo "Copie o token abaixo e crie no Supabase do estoque:"
  echo "  Edge Functions → Secrets → Add new secret"
  echo "  Nome:  AGENTE_PONTE_TOKEN"
  echo "  Valor:"
  echo
  verde "  $TOKEN"
  echo
  echo "(Ele já está salvo no .env desta VPS. Não mande por WhatsApp nem por chat.)"
else
  verde "Token já existe no .env, mantido."
fi

TOKEN_ATUAL=$(grep '^AGENTE_PONTE_TOKEN=' .env | cut -d= -f2-)
while true; do
  codigo=$(curl -s -o /dev/null -w '%{http_code}' -H "x-agente-token: $TOKEN_ATUAL" "$URL_AGENTE?acao=status" || true)
  if [ "$codigo" = "200" ]; then
    verde "Supabase aceitou o token."
    break
  fi
  echo
  read -r -p "O Supabase ainda não aceita o token (HTTP $codigo). Salve o secret e aperte Enter para testar de novo... " _ </dev/tty
done

azul "== 4/5  WhatsApp =="
if [ -f "$DESTINO/sessao/creds.json" ]; then
  verde "Já existe sessão salva, não precisa de QR."
else
  # O serviço sem sessão fica gerando QR sozinho no fundo. Dois programas
  # pareando na mesma pasta estragam a sessão um do outro.
  systemctl stop "$SERVICO" 2>/dev/null || true
  rm -rf "$DESTINO/sessao"
  if [ -n "$NUMERO_CHIP" ]; then
    node --env-file=.env ponte.mjs --parear --numero "$NUMERO_CHIP" </dev/tty
  else
    echo "No celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho, e leia o QR."
    node --env-file=.env ponte.mjs --parear </dev/tty
  fi
fi

azul "== 5/5  Serviço =="
cat > "/etc/systemd/system/$SERVICO.service" <<EOF
[Unit]
Description=Ponte WhatsApp do agente de estoque (Ditado Popular)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DESTINO
ExecStart=$(command -v node) --env-file=$DESTINO/.env $DESTINO/ponte.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICO" >/dev/null 2>&1
systemctl restart "$SERVICO"
sleep 3
systemctl --no-pager --lines=5 status "$SERVICO" || true

echo
verde "Pronto. A ponte está rodando e volta sozinha se a VPS reiniciar."
echo "Ver o que está acontecendo:  journalctl -u $SERVICO -f"
