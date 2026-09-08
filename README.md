# YGO Collection Tracker

A client-side Yu-Gi-Oh! card collection tracker built with React + TypeScript + Vite + Tailwind CSS.

## Features

- **Card Collection**: search cards by set code / passcode / card name, add to collection with language, rarity, and quantity
- **Rarity system**: standard Yu-Gi-Oh rarities including over-frame versions (UR-OR, ScR-OR, PSER-OR)
- **Deck Management**: create decks, import YDK/text lists, analyze missing cards
- **Pricing**: rarity-matched prices from YGOPRODECK, plus real Ruten (露天) market prices via a Vercel serverless proxy
- **Currency**: choose TWD or USD display with automatic conversion
- **Local storage**: all data persisted in IndexedDB (no backend required)

## Local Development

### Frontend only (no Ruten prices)

```bash
npm install
npm run dev
```

### Full local testing (includes Ruten proxy)

The Ruten price proxy is a Vercel serverless function (`api/ruten.ts`). To test it locally, use `vercel dev`, which serves both the static frontend and the `/api/ruten` function:

```bash
npm install
npm run dev:local   # runs `vercel dev`
```

The first time you run `vercel dev`, you'll be prompted to log in to Vercel and link the project. After that it starts a local server (default `http://localhost:3000`) with the proxy available at `/api/ruten`.

> **Note on `import.meta.env.VITE_API_BASE`**: when running via `vercel dev` or deployed to Vercel, the frontend and API are same-origin, so `VITE_API_BASE` stays empty and the app calls `/api/ruten` relatively. Only set it if you split frontend and API across origins.

## Ruten Price Proxy

The proxy (`api/ruten.ts`) works around Ruten's CORS and session restrictions:

1. Searches `rtapi.ruten.com.tw/api/search/v4/index.php/core/prod?q=<keyword>` with the required `Referer`/`Origin` headers
2. Collects matching product IDs
3. Fetches `prod/v3/index.php/prod?id=...` to get real names and prices (TWD)
4. Returns `{ items: [{ name, price, currency }] }`

The frontend (`src/services/ruten.ts`) filters prices (median × 3 outlier removal) and takes the lowest as the card price. The refresh button prefers Ruten prices and falls back to YGOPRODECK.

## Deploying to Vercel

```bash
npm run build
vercel --prod
```

The `vercel.json` rewrites all non-API routes to `index.html` (SPA), while `/api/*` is served by the serverless functions.

## Tests

```bash
npm run test
npm run lint
npm run build
```
