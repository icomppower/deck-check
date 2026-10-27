# Deck Check

One sentence in → deck framing plan out → every joist checked by code.

Muse (`muse-wonder-1.0`) drafts the joist plan, repairs failing joists and writes the summary. A deterministic span checker in `lib/core.js` marks each joist red or green and decides pass/fail. Muse never approves its own work, and a fix can only change the framing, not the deck or the hot tub load.

> The model proposes. The code approves.

Built for the Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026).

## Run

```sh
npm test       # checker + pipeline test, no key needed: 4 red → 0 red
npm run dev    # http://localhost:3000
npm run ping   # one-call Muse auth check
```

Put `MODEL_API_KEY` in `./.env` (copy `.env.example`, then `chmod 600 .env`). The key stays on the server.

## Muse calls per run (3–5)

1. **PLAN**: sentence → deck size, hot tub zone, framing zones (JSON)
2. **FIX** (up to 3 rounds): failing joists + span table → repaired zones (JSON), re-checked by code each round
3. **SUMMARY**: cut list + 3-sentence permit note from the verified plan

"Without hot tub" and "Add hot tub" rerun the current framing with the tub removed or added, skipping PLAN. Adding the tub is the demo moment: the joists under it go red, Muse fixes only those, and the checker re-verifies.

## Honesty

Demo span table: simplified IRC 2021 R507.6, Southern Pine #2, 40 live + 10 dead psf. Above 50 psf total, allowable = table × √(50 / total); the hot tub zone is 100 psf live. Every joist under the tub's footprint is checked at the full tub load. This is not an engineering stamp. Hot tub decks need a licensed engineer.

## Secrets

The key lives only in `./.env` (gitignored). On Vercel, set `MODEL_API_KEY` as a Production environment variable. `./muse-claude` runs Claude Code on Muse for this folder only.
