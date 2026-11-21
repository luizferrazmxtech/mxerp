#!/usr/bin/env bash
# Operador: pega na Central (tabela "Tarefa" do banco central) os pedidos pendentes, um de cada vez,
# executa com o ./vps/mxerp.sh e grava o resultado. Roda no serviço "operador" (tem acesso ao docker).
set -uo pipefail
cd "${RAIZ:-$(dirname "$(dirname "$(dirname "$(readlink -f "$0")")")")}"

sql() { psql -h "${PGHOST:-db}" -U postgres -d central -v ON_ERROR_STOP=1 -qAt "$@"; }

echo "operador: ativo em $(pwd)"
until sql -c 'select 1 from "Tarefa" limit 1' >/dev/null 2>&1; do sleep 10; done
# o que estava executando quando o operador parou (VPS reiniciou, atualização) não terminou
sql -c "UPDATE \"Tarefa\" SET situacao='ERRO', saida=coalesce(saida,'')||E'\nInterrompida (o operador reiniciou). Peça de novo.', \"fimEm\"=now() WHERE situacao='EXECUTANDO'" >/dev/null

while true; do
  linha=$(sql -F $'\t' -c "UPDATE \"Tarefa\" SET situacao='EXECUTANDO', \"iniciadoEm\"=now()
    WHERE id = (SELECT id FROM \"Tarefa\" WHERE situacao='PENDENTE' ORDER BY \"createdAt\" LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id, tipo, parametros::text" 2>/dev/null)
  if [ -z "$linha" ]; then sleep 5; continue; fi
  IFS=$'\t' read -r id tipo params <<<"$linha"
  p() { jq -r --arg k "$1" '.[$k] // ""' <<<"$params"; }
  slug=$(p slug)
  saida=$(mktemp)
  echo "operador: $tipo $slug"
  {
    # nomes sempre conferidos antes de ir para a linha de comando
    if [ -n "$slug" ] && ! [[ "$slug" =~ ^[a-z][a-z0-9]{1,29}$ ]]; then echo "nome de cliente inválido"; false
    else
      case "$tipo" in
        CRIAR)
          if [ -f "vps/clientes/$slug/cliente.env" ]; then ./vps/mxerp.sh aplicar
          else MXERP_LICENCA_TOKEN=$(p token) MXERP_HORARIOS=$(p horarios) ./vps/mxerp.sh novo-cliente "$slug" "$(p dominio)"; fi ;;
        BACKUP) ./vps/mxerp.sh backup "$slug" ;;
        RESTAURAR)
          arq=$(p arquivo)
          if [[ "$arq" =~ ^[a-z0-9]+-[0-9]{8}-[0-9]{4}-[a-z-]+\.dump$ ]] && [[ "$arq" == "$slug-"* ]]; then
            MXERP_CONFIRMAR=RESTAURAR ./vps/mxerp.sh restaurar "$slug" "vps/backups/$slug/$arq"
          else echo "arquivo inválido"; false; fi ;;
        ATUALIZAR_TODOS) ./vps/mxerp.sh atualizar ;;
        SUSPENDER) ./vps/mxerp.sh suspender "$slug" ;;
        REATIVAR) ./vps/mxerp.sh reativar "$slug" ;;
        HORARIOS) ./vps/mxerp.sh horarios "$slug" "$(p horarios)" ;;
        DOMINIO) ./vps/mxerp.sh dominio "$slug" "$(p dominio)" ;;
        *) echo "tarefa desconhecida: $tipo"; false ;;
      esac
    fi
  } >"$saida" 2>&1 </dev/null
  r=$?
  situacao=$([ $r = 0 ] && echo OK || echo ERRO)
  # tira as cores do terminal e guarda só o fim (as tarefas longas escrevem muito)
  texto=$(sed 's/\x1b\[[0-9;]*m//g' "$saida" | tail -c 20000)
  rm -f "$saida"
  # variáveis do psql (:'x') só valem em comandos lidos da entrada, não no -c: por isso o "echo |"
  echo "UPDATE \"Tarefa\" SET situacao=:'sit', saida=:'txt', \"fimEm\"=now() WHERE id=:'id'" | sql -v id="$id" -v sit="$situacao" -v txt="$texto" >/dev/null
  if [ "$tipo" = CRIAR ] && [ "$situacao" = OK ]; then
    echo "UPDATE \"Cliente\" SET situacao='ATIVO' WHERE slug=:'s' AND situacao='CRIANDO'" | sql -v s="$slug" >/dev/null
  fi
  echo "operador: $tipo $slug -> $situacao"
done
