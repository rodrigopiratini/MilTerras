#!/usr/bin/env bash
# Leva o núcleo do molde (easyapp-base) para um app de segmento já criado.
# Não toca nas telas, no segmento.js/css, no seed, no dominio nem no segmento.sql.
# Uso (a partir do easyapp-base): bash scripts/atualizar-base.sh ../easyapp-frota
set -euo pipefail
DEST="${1:?informe a pasta do app de segmento}"
ORIG="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ORIG"
for f in src/js/core src/css/base.css src/vendor supabase/base.sql supabase/gerar.mjs sw.js .github/workflows/pages.yml scripts docs/FABRICA.md docs/INSTALACAO.md; do
  rm -rf "$DEST/$f"; mkdir -p "$DEST/$(dirname "$f")"; cp -r "$f" "$DEST/$f"
done
echo "Núcleo atualizado em $DEST. Agora: cd $DEST && node supabase/gerar.mjs && node scripts/aplicar-segmento.mjs"
