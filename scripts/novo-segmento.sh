#!/usr/bin/env bash
# Copia o molde para a pasta de um repositório novo (vazio) de segmento.
# Uso: bash scripts/novo-segmento.sh ../easyapp-vinhos
set -euo pipefail
DEST="${1:?informe a pasta do repositório novo}"
ORIG="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$DEST"
[ -z "$(ls -A "$DEST" | grep -v '^.git$' || true)" ] || { echo "A pasta $DEST não está vazia"; exit 1; }
cd "$ORIG"
git ls-files | grep -v '^supabase/instalar.sql$' | while read -r f; do mkdir -p "$DEST/$(dirname "$f")"; cp "$f" "$DEST/$f"; done
echo "Molde copiado para $DEST. Próximos passos: docs/FABRICA.md › Receita."
