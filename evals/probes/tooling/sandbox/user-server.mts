// The user's own app server, started without GENKIT_ENV=dev: POST /<flow> with { data } answers { result }.
import http from 'node:http'
import path from 'node:path'

const app: Record<string, unknown> = await import(path.resolve(process.cwd(), 'src/index.ts'))
http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', async () => {
      const flow = app[(req.url ?? '').replace(/^\//, '')]
      if (req.method !== 'POST' || typeof flow !== 'function') {
        res.writeHead(404).end('not found')
        return
      }
      try {
        const result = await flow(JSON.parse(body || '{}').data)
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ result }))
      } catch (error) {
        res.writeHead(500).end(JSON.stringify({ error: String(error) }))
      }
    })
  })
  .listen(Number(process.env.PORT ?? 4100))
