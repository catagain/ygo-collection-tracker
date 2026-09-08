/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// Dev-only Ruten proxy. Replicates api/ruten.ts serverless logic so that
// `npm run dev` can test the real Ruten price flow without `vercel dev`.
function devRutenProxy(): Plugin {
  return {
    name: 'dev-ruten-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ruten', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const q = url.searchParams.get('q') ?? ''
          if (!q) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing q parameter' }))
            return
          }
          const headers: Record<string, string> = {
            Referer: 'https://www.ruten.com.tw/search/',
            Origin: 'https://www.ruten.com.tw',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
          }
          const searchResp = await fetch(
            `https://rtapi.ruten.com.tw/api/search/v4/index.php/core/prod?q=${encodeURIComponent(q)}&type=direct&sort=rnk%2Fdc&limit=20&offset=1`,
            { headers },
          )
          if (!searchResp.ok) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `Ruten search failed: ${searchResp.status}` }))
            return
          }
          const searchJson = (await searchResp.json()) as { Rows?: { Id: string }[] }
          const ids = (searchJson.Rows ?? []).map((r) => r.Id)
          if (ids.length === 0) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ items: [] }))
            return
          }
          const prodResp = await fetch(
            `https://rtapi.ruten.com.tw/api/prod/v3/index.php/prod?id=${ids.join(',')}`,
            { headers },
          )
          if (!prodResp.ok) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: `Ruten prod failed: ${prodResp.status}` }))
            return
          }
          const prods = (await prodResp.json()) as {
            ProdName?: string
            PriceRange?: number[]
            Currency?: string
          }[]
          const items = prods.map((p) => ({
            name: p.ProdName ?? '',
            price: Array.isArray(p.PriceRange) && p.PriceRange.length > 0 ? p.PriceRange[0] : undefined,
            currency: p.Currency ?? 'TWD',
          }))
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ items }))
        } catch (err) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Ruten proxy error' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devRutenProxy(), devYugiohCnProxy(), devYugopackProxy(), devYgoSetsProxy(), devAuthProxy()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})

// Dev-only db.yugioh-card-cn.com proxy. Replicates api/yugiohcn.ts.
function devYugiohCnProxy(): Plugin {
  return {
    name: 'dev-yugiohcn-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yugiohcn', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const setCode = (url.searchParams.get('setcode') ?? '').trim().toUpperCase()
          if (!setCode) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing setcode parameter' }))
            return
          }
          const { handler } = await import('./api/yugiohcn.ts')
          // Wrap the Vercel-style response into a minimal adapter.
          const vercelRes = {
            status: (code: number) => { res.statusCode = code; return vercelRes },
            json: (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) },
            setHeader: res.setHeader.bind(res),
            end: res.end.bind(res),
          }
          await handler({ query: { setcode: setCode }, method: 'GET' } as never, vercelRes as never)
        } catch (err) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'yugiohcn proxy error' }))
        }
      })
    },
  }
}

// Dev-only YGOPRODECK pack page proxy. Replicates api/yugopack.ts.
function devYugopackProxy(): Plugin {
  return {
    name: 'dev-yugopack-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yugopack', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const pack = (url.searchParams.get('pack') ?? '').trim()
          const setCode = (url.searchParams.get('setcode') ?? '').trim().toUpperCase()
          if (!pack || !setCode) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing pack or setcode parameter' }))
            return
          }
          const { handler } = await import('./api/yugopack.ts')
          const vercelRes = {
            status: (code: number) => { res.statusCode = code; return vercelRes },
            json: (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) },
            setHeader: res.setHeader.bind(res),
            end: res.end.bind(res),
          }
          await handler({ query: { pack, setcode: setCode }, method: 'GET' } as never, vercelRes as never)
        } catch (err) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'yugopack proxy error' }))
        }
      })
    },
  }
}

// Dev-only YGOPRODECK OCG set list proxy. Replicates api/ygosets.ts.
function devYgoSetsProxy(): Plugin {
  return {
    name: 'dev-ygosets-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ygosets', async (_req, res) => {
        try {
          const { handler } = await import('./api/ygosets.ts')
          const vercelRes = {
            status: (code: number) => { res.statusCode = code; return vercelRes },
            json: (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) },
            setHeader: res.setHeader.bind(res),
            end: res.end.bind(res),
          }
          await handler({ query: {}, method: 'GET' } as never, vercelRes as never)
        } catch (err) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'ygosets proxy error' }))
        }
      })
    },
  }
}

// Dev-only auth + sets proxy. Replicates api/auth.ts and api/sets.ts.
// Unlike the other proxies it must forward cookies and parse JSON bodies.
// Uses a literal-import map so Vite can statically analyze each handler
// (template-literal dynamic imports don't resolve in a Vite config).
function devAuthProxy(): Plugin {
  // Each handler module uses `export default handler`, so the dynamic import
  // resolves to a module namespace with a `default` key. The consolidated
  // handlers route on ?path= (same as the Vercel rewrites).
  const handlers: Record<string, () => Promise<{ default: (...args: never[]) => unknown }>> = {
    '/api/auth': () => import('./api/auth.ts'),
    '/api/sets': () => import('./api/sets.ts'),
  }

  function makeVercelRes(res: {
    statusCode: number
    setHeader: (name: string, value: string) => unknown
    end: (body?: unknown) => unknown
  }) {
    const vercelRes = {
      status: (code: number) => { res.statusCode = code; return vercelRes },
      json: (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) },
      redirect: (target: string) => { res.statusCode = 302; res.setHeader('Location', target); res.end() },
      setHeader: (name: string, value: string) => { res.setHeader(name, value) },
      end: res.end.bind(res),
    }
    return vercelRes
  }

  return {
    name: 'dev-auth-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        // Route /api/auth/* and /api/sets/* to the consolidated handlers,
        // passing the full path as ?path= so the handler can dispatch.
        const loader = url.pathname.startsWith('/api/auth')
          ? handlers['/api/auth']
          : url.pathname.startsWith('/api/sets')
            ? handlers['/api/sets']
            : undefined
        if (!loader) {
          next()
          return
        }
        try {
          const { default: handler } = await loader()
          const headers = { ...req.headers } as Record<string, string | string[] | undefined>
          const cookie = req.headers.cookie
          // Read the JSON body for POST/PUT/DELETE requests.
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const rawBody = Buffer.concat(chunks).toString('utf8')
          const body = rawBody ? JSON.parse(rawBody) : {}
          const query: Record<string, string> = { path: url.pathname }
          for (const [k, v] of url.searchParams) query[k] = v
          const vercelReq = {
            query,
            method: req.method ?? 'GET',
            headers: cookie ? { ...headers, cookie } : headers,
            body,
          }
          await handler(vercelReq as never, makeVercelRes(res) as never)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
            next()
            return
          }
          res.statusCode = 502
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'auth proxy error' }))
        }
      })
    },
  }
}
