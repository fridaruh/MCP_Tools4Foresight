/**
 * Entry point HTTP remoto (Vercel Function): Streamable HTTP para agentes que
 * no pueden lanzar un proceso local.
 *
 * STATELESS a propósito (sin `sessionIdGenerator`): en Vercel cada petición
 * puede caer en una instancia distinta, así que una sesión guardada en memoria
 * se perdería a mitad de conversación. Sin sesión no hay sesión que perder. El
 * precio —ni resumabilidad ni notificaciones del servidor fuera del ciclo de
 * una petición— no importa aquí: todas las tools son lecturas cortas.
 *
 * `runtime: nodejs` y no edge: el SDK usa APIs de Node.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { authFailureResponse, checkAccessToken } from "../src/http-auth.js";
import { isWebRequest, toWebRequest, writeNodeResponse } from "../src/node-adapter.js";

export const config = { runtime: "nodejs" };

/**
 * El runtime de funciones de Vercel invoca esto con la firma de Node
 * (`req`, `res`), no con un `Request` web. `respond` es la lógica real —
 * escrita contra la API web, como el resto del servidor— y este handler solo
 * traduce (ver src/node-adapter.ts). Acepta las dos formas: si algún día
 * llega un `Request` nativo, se atiende directo.
 */
export default async function handler(
  incoming: Request | IncomingMessage,
  res?: ServerResponse,
): Promise<Response | void> {
  if (isWebRequest(incoming)) return respond(incoming);

  const request = await toWebRequest(incoming);
  const response = await respond(request);
  if (!res) return response;
  await writeNodeResponse(res, response);
}

async function respond(request: Request): Promise<Response> {
  const failure = checkAccessToken(request);
  if (failure) return authFailureResponse(failure);

  try {
    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createServer(loadConfig());
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    // El error real solo al log del servidor: al cliente no le sirve el stack y
    // podría filtrar la configuración.
    console.error("[mcp-tools4foresight] error en el handler HTTP:", error);
    return new Response(
      JSON.stringify({ error: { code: "internal_error", message: "Error interno del servidor MCP." } }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}
