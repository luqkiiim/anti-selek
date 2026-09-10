# Prototype first

Branch: codex/prototype-first, based on main.

The deployed frontend is the approved Play Collective prototype in `prototype/`. Its app screens, styles, artwork and mobile runtime are copied unchanged. Vercel builds this static frontend; the existing Next.js app and backend remain in source but are not deployed by this branch. No live database or authentication is connected. Names, ratings, clubs and sessions are sample data; prototype changes mostly reset on reload.

Use `npm ci --prefix prototype` and `npm run dev --prefix prototype -- --port 4181` locally. Build with `npm run build --prefix prototype`. The original Sites packaging step is excluded from the Vercel build; protected runtime files remain unchanged.

Add features individually on this foundation, preserving the approved interface.
