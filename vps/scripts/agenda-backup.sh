#!/bin/sh
# Roda sem parar no serviço "backup": a cada minuto vê quais bancos têm cópia marcada para esta hora.
# Horários por cliente em vps/clientes/<cliente>/cliente.env (BACKUP_HORARIOS=0300,1230,1930);
# bancos sem cliente.env (ex.: a Central) usam HORARIOS_PADRAO.
echo "backup: ativo (padrão $HORARIOS_PADRAO)"
while true; do
  h=$(date +%H%M)
  for b in $(psql -h db -U postgres -Atc "select datname from pg_database where not datistemplate and datname <> 'postgres'" 2>/dev/null); do
    hs=$(grep -m1 '^BACKUP_HORARIOS=' "/clientes/$b/cliente.env" 2>/dev/null | cut -d= -f2-)
    case ",${hs:-$HORARIOS_PADRAO}," in *",$h,"*) sh /scripts/backup-todos.sh agendado "$b" ;; esac
  done
  sleep $((60 - $(date +%S | sed 's/^0//')))
done
