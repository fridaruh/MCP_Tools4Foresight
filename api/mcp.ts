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
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { authFailureResponse, checkAccessToken } from "../src/http-auth.js";

export const config = { runtime: "nodejs" };

export default async function handler(request: Request): Promise<Response> {
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
