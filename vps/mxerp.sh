#!/usr/bin/env bash
# Comando único para cuidar do MXERP na VPS. Rode da pasta do sistema (ex.: /opt/mxerp) como root:
#   ./vps/mxerp.sh ajuda
set -euo pipefail

VPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$VPS")"
CLIENTES="$VPS/clientes"
GERADO="$VPS/gerado"
IMAGEM="mxerp:atual"
CENTRAL="$VPS/central"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
falhar() { vermelho "$*"; exit 1; }
segredo() { openssl rand -hex "${1:-24}"; }

dc() { docker compose --project-directory "$VPS" -f "$VPS/docker-compose.yml" -f "$GERADO/docker-compose.clientes.yml" "$@"; }
psql_admin() { dc exec -T db psql -v ON_ERROR_STOP=1 -U postgres "$@"; }
valor() { grep -m1 "^$2=" "$CLIENTES/$1/cliente.env" 2>/dev/null | cut -d= -f2- || true; }
geral() { grep -m1 "^$1=" "$VPS/.env" 2>/dev/null | cut -d= -f2- || true; }
clientes() {
  # a MXTECH vai sempre primeiro (é quem testa as versões novas)
  local l="" f
  for f in "$CLIENTES"/*/cliente.env; do [ -f "$f" ] && l="$l$(basename "$(dirname "$f")")"$'\n'; done
  l=$(printf '%s' "$l" | sort)
  { echo "$l" | grep -x mxtech || true; echo "$l" | grep -vx mxtech || true; } | sed '/^$/d'
}
existe() { [ -f "$CLIENTES/$1/cliente.env" ] || falhar "Cliente '$1' não existe. Veja: ./vps/mxerp.sh status"; }

gerar() {
  mkdir -p "$GERADO"
  local email; email=$(grep -m1 '^EMAIL_HTTPS=' "$VPS/.env" | cut -d= -f2- || true)
  {
    echo "# GERADO pelo ./vps/mxerp.sh — não edite (é refeito a cada mudança)"
    [ -n "$email" ] && printf '{\n\temail %s\n}\n' "$email"
    local dc_central; dc_central=$(geral DOMINIO_CENTRAL)
    if [ -n "$dc_central" ] && [ -f "$CENTRAL/central.env" ]; then
      printf '\n%s {\n\tencode zstd gzip\n\treverse_proxy central:3000\n}\n' "$dc_central"
    fi
    for c in $(clientes); do
      local dominios; dominios=$(valor "$c" DOMINIOS | tr ',' ' ')
      [ -z "$dominios" ] && continue
      echo
      echo "$dominios {"
      echo "	encode zstd gzip"
      if [ "$(valor "$c" SUSPENSO)" = "1" ]; then
        echo "	header Content-Type \"text/html; charset=utf-8\""
        echo "	respond \"<h2 style='font-family:sans-serif'>Sistema suspenso. Fale com a MXTECH.</h2>\" 503"
      else
        echo "	reverse_proxy app-$c:3000"
      fi
      echo "}"
    done
  } > "$GERADO/Caddyfile"
  {
    echo "# GERADO pelo ./vps/mxerp.sh — não edite (é refeito a cada mudança)"
    echo "services:"
    for c in $(clientes); do
      [ "$(valor "$c" SUSPENSO)" = "1" ] && continue
      cat <<EOF
  app-$c:
    image: $IMAGEM
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: ./clientes/$c/cliente.env
    volumes:
      - ./clientes/$c/certificados:/certificados:ro
    mem_limit: \${MEMORIA_POR_CLIENTE:-768m}
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 120s
EOF
    done
    # a MXTECH aparece na Central como cliente da casa (sem cobrança), para acompanhar os backups dela
    if [ -f "$CLIENTES/mxtech/cliente.env" ]; then
      printf '  central:\n    environment:\n      CLIENTE_ZERO_SLUG: mxtech\n      CLIENTE_ZERO_DOMINIO: "%s"\n' "$(valor mxtech DOMINIOS | cut -d, -f1)"
    fi
  } > "$GERADO/docker-compose.clientes.yml"
  # compose não aceita "services:" vazio
  grep -q '^  [a-z]' "$GERADO/docker-compose.clientes.yml" || echo "services: {}" > "$GERADO/docker-compose.clientes.yml"
}

aplicar() {
  gerar
  dc up -d --remove-orphans
  dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile </dev/null >/dev/null 2>&1 || dc restart caddy
}

esperar_saude() {
  local c=$1 i
  for i in $(seq 1 60); do
    local s; s=$(docker inspect -f '{{.State.Health.Status}}' "mxerp-app-$c-1" 2>/dev/null || echo "?")
    [ "$s" = healthy ] && return 0
    [ "$s" = unhealthy ] && return 1
    sleep 5
  done
  return 1
}

construir() {
  [ "${MXERP_SEM_BUILD:-}" = 1 ] && return 0  # só para testes: usa as imagens que já existem
  verde "Montando a versão nova do sistema e da Central (leva alguns minutos)..."
  docker image inspect "$IMAGEM" >/dev/null 2>&1 && docker tag "$IMAGEM" mxerp:anterior
  docker build -t "$IMAGEM" "$RAIZ"
  docker build -t mxerp-central:atual "$RAIZ/central"
  # o operador só é montado na instalação (ele mesmo roda a atualização e não pode se trocar no meio)
  docker image inspect mxerp-operador:atual >/dev/null 2>&1 || docker build -t mxerp-operador:atual "$VPS/operador"
}

# Central MXTECH: banco "central", sistema de revenda e o operador que executa os pedidos dela na VPS
garantir_central() {
  grep -q '^RAIZ=' "$VPS/.env" || echo "RAIZ=$RAIZ" >> "$VPS/.env"
  grep -q '^DOMINIO_CENTRAL=' "$VPS/.env" || echo "DOMINIO_CENTRAL=${MXERP_DOMINIO_CENTRAL:-}" >> "$VPS/.env"
  [ -f "$CENTRAL/central.env" ] && return 0
  mkdir -p "$CENTRAL"
  local senha; senha=$(segredo)
  cat > "$CENTRAL/central.env" <<EOF
# Central MXTECH — gerado em $(date '+%d/%m/%Y %H:%M'). Não vai para o GitHub.
DATABASE_URL=postgresql://central:$senha@db:5432/central?schema=public
CRON_SECRET=$(segredo)
CHAVE_SEGREDOS=$(segredo 32)
URL_SISTEMAS_MODELO=http://app-{slug}:3000
PASTA_BACKUPS=/backups
TZ=America/Sao_Paulo
EOF
  chmod 600 "$CENTRAL/central.env"
  dc up -d db
  until dc exec -T db pg_isready -U postgres </dev/null >/dev/null 2>&1; do sleep 2; done
  psql_admin <<EOF
CREATE ROLE central LOGIN PASSWORD '$senha';
CREATE DATABASE central OWNER central;
REVOKE ALL ON DATABASE central FROM PUBLIC;
EOF
  verde "Central criada."
}

cmd_instalar() {
  command -v docker >/dev/null || falhar "Docker não instalado. Rode antes: sudo ./vps/preparar-servidor.sh"
  if [ ! -f "$VPS/.env" ]; then
    read -rp "E-mail para os avisos do certificado HTTPS (Let's Encrypt): " email
    read -rp "Endereço da Central de revenda (ex.: central.mxtech.inf.br; vazio = depois): " MXERP_DOMINIO_CENTRAL
    cat > "$VPS/.env" <<EOF
# Configuração geral da VPS (gerada na instalação). Não vai para o GitHub.
DB_SENHA_ADMIN=$(segredo)
EMAIL_HTTPS=$email
# memória máxima do sistema de cada cliente
MEMORIA_POR_CLIENTE=768m
# dias que as cópias ficam na VPS
DIAS_BACKUP=30
# destino da cópia externa (rclone), ex.: b2:mxerp-backups — veja docs/instalar-vps.md
DESTINO_BACKUP=
# pasta do sistema (o operador da Central trabalha nela)
RAIZ=$RAIZ
# endereço da Central de revenda
DOMINIO_CENTRAL=$MXERP_DOMINIO_CENTRAL
EOF
    chmod 600 "$VPS/.env"
  fi
  mkdir -p "$CLIENTES" "$VPS/backups" "$VPS/rclone"
  gerar
  construir
  dc up -d db
  until dc exec -T db pg_isready -U postgres </dev/null >/dev/null 2>&1; do sleep 2; done
  garantir_central
  if [ ! -f "$CLIENTES/mxtech/cliente.env" ]; then
    read -rp "Endereço do sistema da MXTECH (ex.: erp.mxtech.inf.br): " dominio
    echo "Se você já usa o MXERP no PC, abra C:\\mxerp\\.env e copie os valores abaixo (assim o Inter e os"
    echo "certificados A1 salvos continuam funcionando depois de trazer o banco). Se não usa, deixe em branco."
    read -rp "  CHAVE_SEGREDOS do PC: " chave
    read -rp "  CRON_SECRET do PC: " cron
    criar_cliente mxtech "$dominio" "${chave:-}" "${cron:-}"
  fi
  aplicar
  verde "Pronto. Confira: ./vps/mxerp.sh status"
  [ -n "$(geral DOMINIO_CENTRAL)" ] && verde "Central: https://$(geral DOMINIO_CENTRAL) (a primeira tela cria o administrador)"
  true
}

criar_cliente() {
  local c=$1 dominio=$2 chave=${3:-} cron=${4:-}
  [[ "$c" =~ ^[a-z][a-z0-9]{1,29}$ ]] || falhar "Nome do cliente: só letras minúsculas e números, começando com letra (ex.: jtecobio)."
  [ "$c" = postgres ] && falhar "Nome reservado."
  [ -f "$CLIENTES/$c/cliente.env" ] && falhar "Cliente '$c' já existe."
  [ -n "$dominio" ] || falhar "Informe o endereço (ex.: $c.mxerp.com.br)."
  local senha; senha=$(segredo)
  # Vindo do PC sem CHAVE_SEGREDOS: o PC cifrava com o CRON_SECRET, então a chave fica vazia (o sistema usa o CRON_SECRET).
  # Cliente novo: chave própria.
  if [ -z "$chave" ] && [ -z "$cron" ]; then chave=$(segredo 32); fi
  [ -z "$cron" ] && cron=$(segredo)
  mkdir -p "$CLIENTES/$c/certificados"
  cat > "$CLIENTES/$c/cliente.env" <<EOF
# Cliente $c — gerado em $(date '+%d/%m/%Y %H:%M'). Não vai para o GitHub.
DOMINIOS=$dominio
SUSPENSO=0
# horários das cópias automáticas deste cliente (HHMM separados por vírgula)
BACKUP_HORARIOS=${MXERP_HORARIOS:-0300,1230,1930}
# licença (plano, limites e cobrança) vem da Central; vazio = sem limites (a própria MXTECH)
CENTRAL_URL=${MXERP_LICENCA_TOKEN:+http://central:3000}
LICENCA_TOKEN=${MXERP_LICENCA_TOKEN:-}
DATABASE_URL=postgresql://$c:$senha@db:5432/$c?schema=public
CRON_SECRET=$cron
CHAVE_SEGREDOS=$chave
CERTIFICADO_A1_PATH=/certificados/certificado.pfx
CERTIFICADO_A1_SENHA=
TZ=America/Sao_Paulo
EOF
  chmod 600 "$CLIENTES/$c/cliente.env"
  dc up -d db
  until dc exec -T db pg_isready -U postgres </dev/null >/dev/null 2>&1; do sleep 2; done
  psql_admin <<EOF
CREATE ROLE "$c" LOGIN PASSWORD '$senha';
CREATE DATABASE "$c" OWNER "$c";
REVOKE ALL ON DATABASE "$c" FROM PUBLIC;
EOF
  verde "Cliente $c criado ($dominio)."
}

cmd_novo_cliente() {
  [ $# -ge 2 ] || falhar "uso: ./vps/mxerp.sh novo-cliente NOME ENDERECO   (ex.: novo-cliente jtecobio jtecobio.mxerp.com.br)"
  criar_cliente "$1" "$2"
  aplicar
  esperar_saude "$1" && verde "No ar: https://$2 — a primeira tela pede para criar o administrador." || vermelho "Subiu com erro. Veja: ./vps/mxerp.sh logs $1"
}

cmd_backup() {
  dc exec -T backup sh /scripts/backup-todos.sh manual "${1:-}"
}

cmd_restaurar() {
  [ $# -ge 2 ] || falhar "uso: ./vps/mxerp.sh restaurar CLIENTE ARQUIVO.dump"
  local c=$1 arq=$2; existe "$c"
  [ -f "$arq" ] || falhar "Arquivo não encontrado: $arq"
  local ok=${MXERP_CONFIRMAR:-}
  [ -n "$ok" ] || read -rp "Isto SUBSTITUI todos os dados de '$c' pelos do arquivo $(basename "$arq"). Digite RESTAURAR: " ok
  [ "$ok" = RESTAURAR ] || { echo "Cancelado."; exit 0; }
  verde "Cópia de segurança do estado atual antes de restaurar..."
  dc exec -T backup sh /scripts/backup-todos.sh antes-de-restaurar "$c"
  dc stop "app-$c"
  # derruba conexões e recria o banco vazio: a cópia entra limpa, com o cliente como dono de tudo
  psql_admin <<EOF
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$c';
DROP DATABASE "$c";
CREATE DATABASE "$c" OWNER "$c";
REVOKE ALL ON DATABASE "$c" FROM PUBLIC;
EOF
  docker cp "$arq" mxerp-db-1:/tmp/restaurar.dump
  dc exec -T db pg_restore -U postgres -d "$c" --no-owner --no-acl --role="$c" /tmp/restaurar.dump || vermelho "Avisos na restauração (normal se a cópia veio do PC). Confira o sistema."
  dc exec -T db rm -f /tmp/restaurar.dump
  dc up -d "app-$c"
  esperar_saude "$c" && verde "Restaurado e no ar." || vermelho "Restaurado, mas o sistema não subiu. Veja: ./vps/mxerp.sh logs $c"
}

cmd_limpar_movimento() {
  [ $# -ge 1 ] || falhar "uso: ./vps/mxerp.sh limpar-movimento CLIENTE"
  local c=$1; existe "$c"
  sed -n '2,8p' "$VPS/scripts/limpar-movimento.sql" | sed 's/^-- \{0,1\}//'
  local ok=${MXERP_CONFIRMAR:-}
  [ -n "$ok" ] || read -rp "Isto APAGA o movimento de '$c' (fica uma cópia antes). Digite LIMPAR: " ok
  [ "$ok" = LIMPAR ] || { echo "Cancelado."; exit 0; }
  verde "Cópia de segurança antes de limpar..."
  dc exec -T backup sh /scripts/backup-todos.sh antes-de-limpar "$c"
  psql_admin -d "$c" < "$VPS/scripts/limpar-movimento.sql"
  verde "Pronto. Agora importe o backup do Gestão Click na tela Migração (simule antes)."
}
cmd_atualizar() {
  verde "Cópia de todos os bancos antes de atualizar..."
  cmd_backup || falhar "A cópia falhou: não atualizo."
  git -C "$RAIZ" pull --ff-only
  construir
  garantir_central
  gerar
  dc up -d --remove-orphans db caddy backup agendador central
  dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile </dev/null >/dev/null 2>&1 || true
  for c in $(clientes); do
    [ "$(valor "$c" SUSPENSO)" = "1" ] && continue
    echo "Atualizando $c..."
    dc up -d --no-deps "app-$c"
    if esperar_saude "$c"; then verde "  $c ok"; else
      vermelho "  $c NÃO subiu com a versão nova. Paro aqui; os próximos clientes continuam na versão anterior."
      vermelho "  Veja o erro: ./vps/mxerp.sh logs $c   |  voltar a cópia: ./vps/mxerp.sh restaurar $c vps/backups/$c/<arquivo>"
      exit 1
    fi
  done
  docker image prune -f >/dev/null
  verde "Todos atualizados."
}

cmd_status() {
  printf '%-14s %-36s %-10s %s\n' CLIENTE ENDEREÇO SITUAÇÃO "ÚLTIMO BACKUP"
  for c in $(clientes); do
    local s="suspenso"
    [ "$(valor "$c" SUSPENSO)" = "1" ] || s=$(docker inspect -f '{{.State.Health.Status}}' "mxerp-app-$c-1" 2>/dev/null || echo parado)
    local u; u=$(ls -1t "$VPS/backups/$c"/*.dump 2>/dev/null | head -1 | xargs -r basename || true)
    printf '%-14s %-36s %-10s %s\n' "$c" "$(valor "$c" DOMINIOS)" "$s" "${u:--}"
  done
  echo; df -h / | tail -1 | awk '{print "Disco: "$3" usados de "$2" ("$5")"}'
  free -h | awk '/Mem:/{print "Memória: "$3" usados de "$2}'
}

cmd_suspender() { existe "$1"; sed -i 's/^SUSPENSO=.*/SUSPENSO=1/' "$CLIENTES/$1/cliente.env"; aplicar; verde "$1 suspenso (dados guardados)."; }
cmd_reativar() { existe "$1"; sed -i 's/^SUSPENSO=.*/SUSPENSO=0/' "$CLIENTES/$1/cliente.env"; aplicar; esperar_saude "$1" && verde "$1 reativado."; }

cmd_horarios() {
  existe "$1"; [[ "${2:-}" =~ ^[0-9]{4}(,[0-9]{4})*$ ]] || falhar "uso: ./vps/mxerp.sh horarios CLIENTE 0300,1230,1930"
  sed -i "s/^BACKUP_HORARIOS=.*/BACKUP_HORARIOS=$2/" "$CLIENTES/$1/cliente.env"
  verde "Backups de $1 às $2."
}

cmd_dominio() {
  existe "$1"; [[ "${2:-}" =~ ^[a-z0-9.,-]+$ ]] || falhar "uso: ./vps/mxerp.sh dominio CLIENTE endereco[,outro]"
  sed -i "s/^DOMINIOS=.*/DOMINIOS=$2/" "$CLIENTES/$1/cliente.env"
  aplicar
  verde "$1 agora responde em $2 (o HTTPS sai sozinho quando o DNS apontar para a VPS)."
}

cmd_admin() {
  [ $# -ge 3 ] || falhar 'uso: ./vps/mxerp.sh admin CLIENTE email@empresa.com.br "Nome"'
  existe "$1"; dc exec "app-$1" npm run usuario:admin -- "$2" "$3"
}

cmd_copia_externa() {
  case "${1:-}" in
    ligar) dc --profile externo up -d copia-externa; verde "Cópia externa ligada (de hora em hora)." ;;
    desligar) dc --profile externo stop copia-externa ;;
    configurar) docker run --rm -it -v "$VPS/rclone:/config/rclone" rclone/rclone:1.68 config ;;
    *) falhar "uso: ./vps/mxerp.sh copia-externa configurar|ligar|desligar" ;;
  esac
}

ajuda() {
  cat <<'EOF'
MXERP na VPS — comandos (rode como root na pasta do sistema):
  ./vps/mxerp.sh instalar                       primeira instalação (cria a MXTECH)
  ./vps/mxerp.sh status                         clientes, situação, último backup, disco e memória
  ./vps/mxerp.sh atualizar                      backup de todos + versão nova do GitHub, cliente por cliente (MXTECH primeiro)
  ./vps/mxerp.sh backup [CLIENTE]               cópia agora (de todos ou de um)
  ./vps/mxerp.sh restaurar CLIENTE ARQUIVO      volta uma cópia (também serve para trazer o banco do PC)
  ./vps/mxerp.sh limpar-movimento CLIENTE       apaga OS, vendas, contas e estoque (fica configuração, cadastros e notas)
  ./vps/mxerp.sh novo-cliente NOME ENDERECO     cria um cliente com banco próprio
  ./vps/mxerp.sh suspender|reativar CLIENTE     tira do ar / volta (os dados ficam)
  ./vps/mxerp.sh horarios CLIENTE 0300,1230     horários dos backups automáticos
  ./vps/mxerp.sh dominio CLIENTE ENDERECO       troca o endereço (pode ser domínio próprio do cliente)
  ./vps/mxerp.sh admin CLIENTE EMAIL "NOME"     cria ou redefine a senha de um administrador
  ./vps/mxerp.sh logs CLIENTE                   últimas mensagens do sistema do cliente
  ./vps/mxerp.sh copia-externa configurar|ligar|desligar
EOF
}

[ "$(id -u)" = 0 ] || falhar "Rode como root (sudo)."
mkdir -p "$GERADO"; [ -f "$GERADO/docker-compose.clientes.yml" ] || echo "services: {}" > "$GERADO/docker-compose.clientes.yml"
[ -f "$GERADO/Caddyfile" ] || : > "$GERADO/Caddyfile"
cmd=${1:-ajuda}; shift || true
case "$cmd" in
  instalar) cmd_instalar ;;
  status) cmd_status ;;
  atualizar) cmd_atualizar ;;
  backup) cmd_backup "$@" ;;
  restaurar) cmd_restaurar "$@" ;;
  limpar-movimento) cmd_limpar_movimento "$@" ;;
  novo-cliente) cmd_novo_cliente "$@" ;;
  suspender) cmd_suspender "${1:?informe o cliente}" ;;
  reativar) cmd_reativar "${1:?informe o cliente}" ;;
  admin) cmd_admin "$@" ;;
  horarios) cmd_horarios "$@" ;;
  dominio) cmd_dominio "$@" ;;
  logs) existe "${1:?informe o cliente}"; dc logs --tail 100 "app-$1" ;;
  aplicar) aplicar ;;
  copia-externa) cmd_copia_externa "$@" ;;
  *) ajuda ;;
esac
