# Domain functions

`metrics.mjs` contains pure display selectors, elapsed-time interpolation, timer-pause handling, gap-aware chart rows, and local continuous 5/10/20-minute estimates. Raw tracks/windows use SI and UTC; source summary DTOs retain explicit display units. Keep UI/SDK/network imports out of this layer. External analysis contracts remain in `schemas/` and `docs/data/data-model.md`.
