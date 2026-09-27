#!/bin/sh
# Visuella regressionstester (e2e/visual.spec.ts). Baslinjerna i e2e/__screenshots__ är
# tagna i Playwrights Docker-avbild – typsnitt och Chromium måste vara exakt samma, så
# testerna körs alltid där. I CI körs jobbet redan i avbilden (PLAYWRIGHT_IMAGE=1).
# Argument skickas vidare, t.ex. --update-snapshots.
set -e
IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble

if [ "$PLAYWRIGHT_IMAGE" = "1" ]; then
  exec npx playwright test --project=visual "$@"
fi

exec docker run --rm --ipc=host -v "$PWD":/work -w /work \
  -e PLAYWRIGHT_IMAGE=1 -e APP_COMMIT=visual -e APP_BUILD_TIME=2026-01-01T00:00:00Z \
  "$IMAGE" npx playwright test --project=visual "$@"
