/**
 * El core del servidor MCP: construye el `McpServer` con todas sus tools,
 * resources y prompts.
 *
 * Un solo core, tres entry points (`src/stdio.ts`, `src/http.ts`, `api/mcp.ts`):
 * los entry points solo eligen transporte y no saben nada de las tools. Así no
 * hay forma de que el servidor local y el remoto expongan cosas distintas.
 *
 * Solo consulta: tools, resources y prompts (que son guiones de conversación
 * sugeridos, no capacidades). Nada que se parezca a una operación de
 * administración — publicar o recalcular el grafo vive en tools4foresight.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { T4FClient } from "./client/http-client.js";
import type { Config } from "./config.js";
import { registerAllTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

export const SERVER_NAME = "mcp-tools4foresight";
export const SERVER_VERSION = "0.1.0";

export function createServer(config: Config): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Servidor de SOLO LECTURA sobre las señales de foresight de tools4foresight.com.\n\n" +
        "Vocabulario del dominio, respétalo al redactar:\n" +
        "- Una *señal* es una pieza de contenido curado guardada como indicio de futuro.\n" +
        "- Un *tema* es un linaje de señales que persiste entre corridas; puede morir y resucitar. " +
        "Un tema muerto es un *fósil*, NO un borrado: nada se elimina.\n" +
        "- La fecha en que se guardó una señal (`likedAt`) es una ESTIMACIÓN: muéstrala siempre con `~`.\n" +
        "- Los horizontes son H1 (ya está pasando), H2 (en transición) y H3 (señal débil).\n" +
        "- NO le muestres a una persona el porcentaje de similitud entre señales: usa " +
        "`strength` (fuerte/media/débil). El `score` numérico es solo para tu razonamiento.\n\n" +
        "Si no conoces el tamaño ni la actualidad del corpus, empieza por `get_corpus_overview`. " +
        "Para el estado general del mapa, `get_horizons_overview`. Si dudas de un término del " +
        "método, `explain_foresight_term` en vez de improvisar la definición.",
    },
  );

  const client = new T4FClient(config);
  const ctx = { client };

  registerAllTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server);

  return server;
}
