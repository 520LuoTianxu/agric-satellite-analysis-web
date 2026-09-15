# agric-satellite-analysis-web contribution notes

This repository contains the standalone Next.js frontend for agric-satellite-analysis. The FastAPI backend is maintained in the sibling `agric-satellite-analysis` repository.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run type-check
npm run build
python scripts/check-i18n-keys.py
```

Read `DESIGN.md` before changing UI. Design tokens live in `src/app/globals.css` and are exposed through `tailwind.config.js`. Use the typed API client in `src/lib/api.ts` for backend requests and keep user-facing strings in `messages/`.

The backend API URL is configured with `NEXT_PUBLIC_API_URL`. Server-side requests use `INTERNAL_API_URL` when the frontend runs inside the Docker Compose network.
