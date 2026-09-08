# Setup Guide: Google OAuth + Upstash Redis (KV) + Environment Variables

This guide walks through the three setup steps needed to enable the login /
database-contribution features.

> **Important**: Vercel KV was sunset in 2024 and replaced by the **Upstash
> Redis** marketplace integration (it injects the same `KV_REST_API_URL` /
> `KV_REST_API_TOKEN` variables, so the code is unchanged). Do NOT look for a
> "Vercel KV" option — it no longer exists. Use Upstash Redis instead.

---

## 1. Create the Upstash Redis (KV) store (~3 minutes)

### Option A — Dashboard (easiest)

1. Open the Vercel Dashboard: <https://vercel.com/dashboard>
2. Select the **ygo-collection-tracker** project
3. Open the **Storage** tab → **Create Database** → select **Redis**
   (or **Upstash for Redis**; it's a key-value store). It may be listed as
   "Redis" or under **Marketplace** → **Upstash**.
4. If prompted, **accept the Upstash marketplace terms** (one-time).
5. Link the store to the `ygo-collection-tracker` project → **Create**
6. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment
   variables. (Some flows use `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
   — the app accepts both.)
7. Go to **Settings → Environment Variables** and confirm the variables exist
   for Production and Development.

### Option B — CLI (alternative)

1. **Accept the Upstash marketplace terms in your browser first** (required once):
   <https://vercel.com/cat-again/~/integrations/accept-terms/upstash?source=cli>
2. Then run:
   ```bash
   vercel integration add upstash/upstash-kv
   ```
   (If the install reports `action_required` / terms acceptance, open the
   `verification_uri` it prints, accept, then re-run the add command.)
3. Confirm the store exists and the two env vars are set:
   ```bash
   vercel env ls
   ```

> To manage KV data from the CLI: `npx vercel kv` isn't a thing — KV is
> managed from the dashboard. You can also run `vercel env pull` locally after
> adding the store to get the values into `.env.local`.

---

## 2. Create a Google OAuth Client (~5 minutes)

1. Open the Google Cloud Console: <https://console.cloud.google.com>
2. Create a new project (or select an existing one)
3. **APIs & Services → OAuth consent screen**
   - User Type: **External** → **Create**
   - App name: `YGO Collection Tracker`
   - User support email: your email
   - Developer contact email: your email
   - (Scopes stay default: email, profile)
   - Add yourself and other admins under **Test users** (until you publish the app)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `YGO Web`
   - **Authorized redirect URIs** add:
     - `https://ygo-collection-tracker.vercel.app/api/auth/callback`
     - `http://localhost:5173/api/auth/callback`
   - **Create** → you'll see the **Client ID** and **Client Secret**

---

## 3. Set environment variables

Go to Vercel → project → **Settings → Environment Variables** and add:

| Name | Value | Where from |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxx` | Google OAuth client |
| `SESSION_SECRET` | any long random string | `openssl rand -hex 32` |
| `KV_REST_API_URL` | `https://...upstash.io` | auto-created by Vercel KV |
| `KV_REST_API_TOKEN` | `AZXx...` | auto-created by Vercel KV |

Add them for **Production** and **Development** environments.

For local dev, run:
```bash
vercel env pull .env.local
```
then restart `npm run dev`.

### Optional: verify the setup with a script

Once the environment variables are set (locally or on Vercel), run the
verification script to confirm every dependency is correctly configured:

```bash
# Load the pulled env vars into the current shell (Windows PowerShell):
Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }

node scripts/verify-setup.mjs
```

It checks: Google OAuth IDs, SESSION_SECRET length, KV connectivity
(set/get/del round-trip), and the admin bootstrap key. All checks should PASS.

---

## 4. First admin (bootstrap)

The system is configured so that **the first person to log in becomes an
administrator automatically**. Just log in once via the Database page
(侧边栏 → Database → "Log in with Google") and you'll be the admin.

After that, to grant admin to others, either:
- Use the KV dashboard to set `admin:emails` to `["you@gmail.com","other@gmail.com"]`, or
- Ask the developer to run a one-off script.

---

## 5. Verify

1. Visit <https://ygo-collection-tracker.vercel.app/#/database>
2. Click **Log in with Google** → complete the Google flow
3. You should see your name/email and the **Admin** badge
4. Add a card via Collection → search a set code not in the index → the
   "Submit for review" box appears → submit it
5. On the Database page the pending entry appears → **Approve** it
6. The approved mapping is immediately usable in searches and the collection's
   inventory check will flag mismatched passcodes.