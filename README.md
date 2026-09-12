# YGO Collection Tracker

A full-featured Yu-Gi-Oh! card **collection tracker** + **deck builder** with cloud sync, real market prices (Ruten 露天), and a community-maintained card database.

Built with **React + TypeScript + Vite + Tailwind CSS**, deployed on **Vercel**, data persisted in **IndexedDB** with optional **Google login + cloud sync**.

---

## ✨ Features

### 🃏 Card Collection
- Search cards by **set code** (LOB-EN001), **passcode** (8-digit), or **card name**
- Multi-language support: Japanese / Asian-English / English / Other
- **Auto pad** passcodes to 8 digits (handles leading zeros lost by JSON sources, e.g. `09205573`)
- **OCG (Japanese) card artwork** shown for JP cards (official db.yugioh-card.com images)
- Full rarity system including over-frame versions (UR-OR, ScR-OR, PSER-OR)
- TCG multi-language set codes supported (FR/DE/IT/PT/SP → EN lookup)
- Local cache (IndexedDB) for fast repeat lookups

### 💰 Pricing
- **YGOPRODECK** prices (rarity-matched)
- **Ruten (露天)** real market prices via a Vercel serverless proxy
- **Manual price** input — overrides auto prices, never overwritten by refresh
- Counterfeit/doujin card **filtering** (高仿/同人/打印 cards excluded)
- Currency toggle: **TWD / USD** with automatic conversion
- Price source priority: Ruten-first or YGOPRODECK-first

### 🛡️ Deck Building (Master Duel style)
- Three-column layout: card pool (right) → build zones (center) → card details (left)
- **Main / Extra / Side** deck zones with counts & limits (60/15/15)
- **HTML5 drag & drop** + click-to-add
- Smart classification: Fusion/Synchro/Xyz/Link auto-route to Extra Deck
- **Related cards**: select a card to see its archetype series + cards that support it / it supports
- Cards you don't own render **grayscale** when deck count exceeds owned copies
- Max 3 copies per card; duplicate copies render as separate cards
- Instant save to IndexedDB (cloud-synced when logged in)

### 📊 Analysis
- Compare a deck against your collection → **missing cards list**
- Export missing list as **text** or **CSV**

### ☁️ Cloud Sync & Login
- **Google OAuth** login (session cookie)
- Sync **collection + decks + settings** to your account (Upstash Redis)
- On login, shows local vs cloud diff → choose which side wins (once per session)
- Offline-friendly: works fully without login (local IndexedDB)

### 🗄️ Community Database (admin review)
- Users can **submit new set code → passcode mappings** for review
- Admin review queue (approve / reject / delete)
- Approved mappings merge into the search index for everyone
- First login user becomes admin (bootstrap)

### 🔄 Automatic Data Updates
- Prebuilt indexes: **sets** (set code → card), **cards** (card data), **card-links** (relation graph)
- **GitHub Actions** weekly cron refreshes all indexes from YGOPRODECK and auto-deploys
- New card packs appear automatically without manual work

### ⚙️ Settings
- Currency & price-priority preferences (cloud-synced)
- Preload/clear local card cache
- **JSON backup export/import**
- Danger zone: clear all data

---

## 🚀 Local Development

### Prerequisites
- Node.js 22+
- (Optional) Vercel CLI for full local API testing

### 1. Install

```bash
npm install
```

### 2. Frontend only (fast, no API)

```bash
npm run dev
```

### 3. Full local testing (includes Ruten proxy & API)

```bash
npm run dev:local   # runs `vercel dev`
```

The first run of `vercel dev` prompts you to log in and link the project. It serves the frontend **and** the `/api/*` serverless functions on `http://localhost:3000`.

> **`VITE_API_BASE`**: when running via `vercel dev` or deployed on Vercel, frontend & API are same-origin so it stays empty. Only set it if you split origins.

---

## 🔧 Configuration

Copy `.env.example` to `.env.local` and fill in the values (see [`docs/setup-google-kv.md`](docs/setup-google-kv.md) for the full guide):

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login (Google Cloud Console) |
| `SESSION_SECRET` | Signs the session cookie (`openssl rand -hex 32`) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (cloud sync + approved sets). Also accepts `UPSTASH_REDIS_REST_URL/TOKEN` |
| `VITE_API_BASE` | (Optional) custom API base URL |

Set these as **Vercel Environment Variables** for Production/Preview/Development.

---

## ☁️ Deploying to Vercel

### Manual deploy

```bash
npm run build
vercel --prod
```

### Auto-deploy (recommended)

The repo includes a GitHub Actions workflow (`.github/workflows/update-data.yml`) that:
1. Runs **every Monday 03:00 UTC** (or manually via Actions tab)
2. Refreshes all card indexes from YGOPRODECK (`npm run update:data`)
3. Commits & pushes changes → triggers Vercel redeploy
4. Deploys production via `VERCEL_TOKEN`

GitHub repo secrets needed for auto-deploy:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` (from `.vercel/project.json` → `orgId`)
- `VERCEL_PROJECT_ID` (from `.vercel/project.json` → `projectId`)

---

## 🧱 Data Architecture

| File | Source | Built by | Purpose |
|---|---|---|---|
| `public/sets-index.json` | YGOPRODECK pack pages | `scripts/build-sets-index.mjs` | set code → card (name/passcode/rarity) |
| `public/cards-index.json` | YGOPRODECK cardinfo API | `scripts/build-card-index.mjs` | passcode → card data (type/race/image) |
| `public/card-links.json` | YGOPRODECK cardinfo API | `scripts/build-card-links.mjs` | passcode → relation graph (archetype/mentions) |

Refresh all indexes with one command:

```bash
npm run update:data
```

The card-links relation graph powers the deck builder's **Related Cards** feature:
- **sameArchetype** — cards in the same series (e.g. all "Blue-Eyes" cards)
- **mentionedBy** — cards whose effect text names the selected card
- **mentions** — cards named by the selected card's effect text

---

## 🗄️ API (Vercel Serverless Functions)

| Route | Purpose |
|---|---|
| `GET /api/ruten` | Ruten price proxy (CORS/session workaround) |
| `GET /api/yugiohcn` | OCG database proxy (db.yugioh-card-cn.com) |
| `GET /api/yugopack` | YGOPRODECK pack-page passcode resolver |
| `GET /api/ygosets` | YGOPRODECK set list proxy |
| `POST /api/auth/*` | Google OAuth (google/callback/me/logout) |
| `GET/PUT/DELETE /api/collection` | Per-user cloud collection sync |
| `GET/POST /api/sets/*` | Community database submissions & admin review |

---

## 🧪 Tests

```bash
npm run test      # Vitest unit tests
npm run lint      # oxlint
npm run build     # type-check + production build
```

---

## 📁 Project Structure

```
api/          # Vercel serverless functions (proxy + auth + sync)
lib/          # Shared server-side logic (auth, KV)
public/       # Prebuilt data indexes + icons
scripts/      # Data build scripts (sets/cards/links)
src/
  components/ # Layout & shared UI
  features/   # Pages: collection, decks, deckBuilder, analysis, database, settings, sync
  services/   # Card API, storage (IndexedDB), auth, sync, pricing
  stores/     # Zustand app store
  types/      # Shared TypeScript types
docs/         # Setup guides
```

---

## 📄 License

MIT — free to use, modify, and deploy.

*Yu-Gi-Oh! is a registered trademark of Konami Digital Entertainment. This project is a fan tool and is not affiliated with or endorsed by Konami.*