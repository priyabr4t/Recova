// Thin wrapper — the real seed lives in src/lib/seed.ts and is shared with
// POST /simulation/reset, so `db:seed` and a demo reset can never drift.
// Importing it here also runs the seed (see the argv guard at the bottom
// of src/lib/seed.ts, which matches "seed.ts" for this entrypoint too).
import '../src/lib/seed.js'
