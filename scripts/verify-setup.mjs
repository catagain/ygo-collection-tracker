/**
 * Post-setup verification script.
 * Run AFTER you've created the Vercel KV store, the Google OAuth client, and
 * set the environment variables (see docs/setup-google-kv.md). It verifies
 * every dependency is correctly configured so the login / database-contribution
 * features will work once deployed.
 *
 * Usage:
 *   # 1. Pull the production env vars (or set them in this shell)
 *   vercel env pull .env.local
 *   # 2. Load them into the current shell (Windows PowerShell):
 *   Get-Content .env.local | ForEach-Object { if ($_ -match '^([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
 *   # 3. Run:
 *   node scripts/verify-setup.mjs
 */
import { Redis } from '@upstash/redis'

// Vercel KV was sunset in 2024; use the Upstash Redis marketplace integration.
// It injects KV_REST_API_URL/KV_REST_API_TOKEN; native Upstash uses
// UPSTASH_REDIS_REST_URL/TOKEN. Accept both.
const kvUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? ''
const kvToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? ''

let failures = 0

function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('=== YGO Collection Tracker — Setup Verification ===\n')

// 1. Google OAuth
const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
check('GOOGLE_CLIENT_ID', Boolean(clientId), clientId ? 'present' : 'missing')
check(
  'GOOGLE_CLIENT_ID format',
  !clientId || /^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId),
  'should end with .apps.googleusercontent.com',
)
check('GOOGLE_CLIENT_SECRET', Boolean(clientSecret), clientSecret ? 'present' : 'missing')

// 2. Session secret
const sessionSecret = process.env.SESSION_SECRET
check('SESSION_SECRET', Boolean(sessionSecret), sessionSecret ? 'present' : 'missing')
check(
  'SESSION_SECRET length',
  !sessionSecret || sessionSecret.length >= 32,
  `length=${sessionSecret?.length ?? 0} (recommend >= 32)`,
)

// 3. Redis (KV) store — Upstash integration
check('KV_REST_API_URL / UPSTASH_REDIS_REST_URL', Boolean(kvUrl), kvUrl ? 'present' : 'missing')
check('KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN', Boolean(kvToken), kvToken ? 'present' : 'missing')

const kv = kvUrl && kvToken ? new Redis({ url: kvUrl, token: kvToken }) : null

if (kv) {
  try {
    // Verify the store is reachable with a round-trip write/read/delete.
    const testKey = `setup-verify-${Date.now()}`
    await kv.set(testKey, 'ok')
    const readBack = await kv.get(testKey)
    await kv.del(testKey)
    check('Redis connectivity (set/get/del round-trip)', readBack === 'ok')
  } catch (err) {
    check('Redis connectivity (set/get/del round-trip)', false, err instanceof Error ? err.message : 'error')
  }
} else {
  check('Redis connectivity (set/get/del round-trip)', false, 'skipped — Redis vars missing')
}

// 4. Admin bootstrap
const adminKey = 'admin:emails'
if (!kv) {
  check('admin:emails key', false, 'skipped — Redis vars missing')
} else {
  try {
    const admins = await kv.get(adminKey)
    check('admin:emails key', Array.isArray(admins), Array.isArray(admins) ? `contains ${admins.length} admin(s)` : 'empty — first login will bootstrap')
  } catch (err) {
    check('admin:emails key', false, err instanceof Error ? err.message : 'error')
  }
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED — ready to deploy/use' : `${failures} check(s) FAILED — fix above items`} ===`)
if (failures > 0) process.exitCode = 1