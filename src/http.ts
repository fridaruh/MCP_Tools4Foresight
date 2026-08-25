/**
 * Entry point HTTP local (`npm run dev:http`): mismo transporte Streamable HTTP
 * que el despliegue de Vercel, pero sobre `node:http` puro — sin Express, sin
 * dependencias extra.
 *
 * Sirve para probar el modo remoto en local con el MCP Inspector antes de
 * desplegar. La lógica de auth es la misma (`MCP_ACCESS_TOKEN`): si el modo
 * remoto se prueba sin auth, el despliegue acaba sin auth.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConfigError, loadConfig } from "./config.js";
import { SERVER_NAME, SERVER_VERSION, createServer } from "./server.js";
import { checkAccessToken } from "./http-auth.js";

const PORT = Number(process.env.MCP_PORT ?? 3333);
const HOST = "127.0.0.1";

/** `node:http` habla en streams; el transporte habla en `Request`/`Response` web. */
async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
  }

  // `exactOptionalPropertyTypes` no acepta `method: undefined`; node siempre
  // trae uno, pero el tipo lo declara opcional.
  const method = req.method ?? "GET";

  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) return void res.end();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function main(): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`[${SERVER_NAME}] no se pudo iniciar:\n${error instanceof ConfigError ? error.message : String(error)}`);
    process.exit(1);
  }

  const httpServer = createHttpServer((req, res) => {
    void (async () => {
      try {
        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          return void res.end(JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION }));
        }

        const request = await toWebRequest(req);
        const failure = checkAccessToken(request);
        if (failure) {
          res.writeHead(failure.status, { "content-type": "application/json" });
          return void res.end(JSON.stringify(failure.body));
        }

        // Un transporte y un servidor por petición: stateless, igual que en
        // Vercel. Probar en local con estado y desplegar sin él escondería los
        // bugs justo hasta producción.
        const transport = new WebStandardStreamableHTTPServerTransport({
          // Protección contra DNS rebinding: en local hay que declararlo a mano
          // (en Vercel el host lo controla la plataforma).
          allowedHosts: [`${HOST}:${PORT}`, `localhost:${PORT}`],
          enableDnsRebindingProtection: true,
        });
        const server = createServer(config);
        await server.connect(transport);
        await writeWebResponse(await transport.handleRequest(request), res);
      } catch (error) {
        console.error(`[${SERVER_NAME}] error atendiendo la petición:`, error);
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "internal_error", message: "Error interno." } }));
      }
    })();
  });

  httpServer.listen(PORT, HOST, () => {
    console.error(`[${SERVER_NAME}] v${SERVER_VERSION} escuchando en http://${HOST}:${PORT}/mcp → ${config.baseUrl}`);
  });
}

main();
