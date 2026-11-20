#!/bin/sh
# Faz a cópia de cada banco (um por cliente) em /backups/<banco>/<banco>-AAAAMMDD-HHMM-<motivo>.dump
# e apaga as cópias mais velhas que DIAS_BACKUP dias. Uso: backup-todos.sh [motivo] [banco]
motivo=${1:-manual}
so=${2:-}
falhas=0
bancos=$(psql -h db -U postgres -Atc "select datname from pg_database where not datistemplate and datname <> 'postgres' order by 1")
for b in $bancos; do
  [ -n "$so" ] && [ "$b" != "$so" ] && continue
  mkdir -p "/backups/$b"
  f="/backups/$b/$b-$(date +%Y%m%d-%H%M)-$motivo.dump"
  if pg_dump -h db -U postgres -d "$b" -Fc -f "$f.parcial"; then
    mv "$f.parcial" "$f" && echo "backup: $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.parcial"; echo "backup: FALHOU $b"; falhas=$((falhas + 1))
  fi
done
find /backups -name '*.dump' -mtime +"${DIAS_BACKUP:-30}" -delete
exit $falhas
