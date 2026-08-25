/**
 * Autenticación del transporte HTTP remoto.
 *
 * OJO A LA DISTINCIÓN, es la decisión de seguridad central de este repo:
 *   - `T4F_API_KEY`      → la clave de ESTE servidor CONTRA tools4foresight.
 *   - `MCP_ACCESS_TOKEN` → la clave que ESTE servidor le EXIGE a quien lo llama.
 *
 * Un despliegue remoto lleva `T4F_API_KEY` dentro. Publicarlo sin
 * `MCP_ACCESS_TOKEN` sería regalarle el contenido de suscripción a cualquiera
 * que dé con la URL. Por eso, sin esa variable el servidor responde 503 y no
 * atiende: nunca abierto por defecto.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type AuthFailure = { status: number; body: { error: { code: string; message: string } } };

/** Comparación en tiempo constante sobre hashes: así no depende del largo ni lo filtra. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** `null` = autorizado. Un objeto = la respuesta de error que hay que devolver. */
export function checkAccessToken(request: Request, env = process.env): AuthFailure | null {
  const expected = env.MCP_ACCESS_TOKEN?.trim();

  if (!expected) {
    return {
      status: 503,
      body: {
        error: {
          code: "server_not_configured",
          message:
            "Este servidor MCP no tiene MCP_ACCESS_TOKEN configurada y no atiende peticiones. " +
            "Ver docs/DEPLOYMENT.md.",
        },
      },
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) {
    return {
      status: 401,
      body: {
        error: { code: "unauthorized", message: "Falta la cabecera Authorization: Bearer <MCP_ACCESS_TOKEN>." },
      },
    };
  }

  if (!safeEqual(match[1], expected)) {
    return { status: 401, body: { error: { code: "invalid_token", message: "El token de acceso no es válido." } } };
  }

  return null;
}

export function authFailureResponse(failure: AuthFailure): Response {
  return new Response(JSON.stringify(failure.body), {
    status: failure.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
