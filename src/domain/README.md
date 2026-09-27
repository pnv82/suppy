# Domain functions

`metrics.mjs` contains pure display selectors, elapsed-time interpolation, timer-pause handling, gap-aware chart rows, and local continuous 5/10/20-minute estimates. Raw tracks/windows use SI and UTC; source summary DTOs retain explicit display units. Keep UI/SDK/network imports out of this layer. External analysis contracts remain in `schemas/` and `docs/data/data-model.md`.

`analysis.mjs` owns reproducible session/window/interval evidence: time-weighted speed/HR/raw cadence, coverage, eligible distance, and exact best windows independent of GPS availability. Versioned methods and limits accompany every result. The LLM consumes this evidence to interpret it; it does not replace this computation layer.
