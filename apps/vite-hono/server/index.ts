import { readFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

const app = new Hono()
const distRoot = './dist'
const port = Number(process.env.PORT ?? 3000)

app.get('/api/clock', (c) => {
  return c.json({
    time: new Date().toLocaleTimeString(),
  })
})

app.use('/assets/*', serveStatic({ root: distRoot }))

app.get('*', async (c) => {
  const html = await readFile(`${distRoot}/index.html`, 'utf8')
  return c.html(html)
})

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    process.stdout.write(
      `API server listening on http://localhost:${info.port}\n`
    )
  }
)
