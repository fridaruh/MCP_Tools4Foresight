# Despliegue

El modo **stdio** no requiere desplegar nada: se instala con `npx` y corre en la
máquina de quien lo usa. Este documento es para el modo **HTTP remoto**, útil
cuando varios agentes —o agentes que no pueden lanzar procesos— tienen que
consultar el mismo servidor.

## Antes de nada: las dos credenciales

Son distintas y confundirlas es el error caro:

| Variable | Quién la usa | Qué protege |
|---|---|---|
| `T4F_API_KEY` | Este servidor, contra tools4foresight | El contenido de la API |
| `MCP_ACCESS_TOKEN` | Quien llama a este servidor | Este servidor |

El despliegue remoto **lleva `T4F_API_KEY` dentro**. Sin `MCP_ACCESS_TOKEN`,
cualquiera que dé con la URL tendría acceso al contenido de suscripción. Por eso
el handler responde **503 si esa variable no está**: no arranca abierto.

## 1. Conseguir la clave de tools4foresight

La forma normal es la pantalla: entra en **tools4foresight.com/perfil →
"Conecta tus agentes"** y genera una clave. Sale una sola vez, empieza por
`t4f_` y va tal cual en `T4F_API_KEY`.

Esa clave hereda el acceso de su dueño y se revalida en CADA petición: si la
suscripción caduca, la clave deja de funcionar sola, sin tener que revocarla.

> Alternativa para claves de servicio que no cuelgan de ninguna cuenta:
> `T4F_PUBLIC_API_KEYS` en el entorno de `x-likes-curator`, con formato
> `label:clave` y varias separadas por coma. El label existe para poder revocar
> una sin tirar las demás.

**Ojo con quién usa el despliegue remoto.** El servidor lleva UNA `T4F_API_KEY`
dentro, así que todo el que tenga el `MCP_ACCESS_TOKEN` lee el banco con esa
clave y contra esa cuota: no hay forma de saber quién consumió qué, y quitarle
el acceso a uno obliga a rotar el token para todos. Si cada persona debe usar
su propia clave, la vía es **stdio**, no esta.

## 2. Desplegar este servidor

```bash
cd MCP_Tools4Foresight
vercel link

# la clave CONTRA tools4foresight (solo la parte de después de los dos puntos)
vercel env add T4F_API_KEY production
vercel env add T4F_API_BASE_URL production   # https://tools4foresight.com/api/public/v1

# la clave que este servidor EXIGE
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
vercel env add MCP_ACCESS_TOKEN production

vercel deploy --prod
```

`vercel.json` fija `maxDuration: 60` para `api/mcp.ts` y desactiva la
detección de framework (`framework: null` + un `buildCommand` que no hace nada):
sin eso, Vercel toma el `exports` del `package.json` por el arranque de un
servidor y la función muere con *"Invalid export found in module server.js"*.

El runtime invoca la función con la firma de Node (`req`, `res`), no con un
`Request` web como el que espera el transporte MCP. `src/node-adapter.ts` hace
de puente y acepta las dos formas, así que el handler funciona con o sin esa
detección.

## 3. Prueba de humo

Sin token debe dar 401:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://tu-despliegue.vercel.app/api/mcp
```

Con token, un `initialize` del protocolo debe responder:

```bash
curl -s -X POST https://tu-despliegue.vercel.app/api/mcp \
  -H "Authorization: Bearer $MCP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Y con el Inspector, que es la forma cómoda de ver las 18 tools:

```bash
npx @modelcontextprotocol/inspector
# transporte: Streamable HTTP
# URL: https://tu-despliegue.vercel.app/api/mcp
# header: Authorization: Bearer <MCP_ACCESS_TOKEN>
```

## 4. Conectar un agente

```json
{
  "mcpServers": {
    "tools4foresight": {
      "type": "http",
      "url": "https://tu-despliegue.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer tu-mcp-access-token" }
    }
  }
}
```

## Probar el modo remoto en local

```bash
MCP_ACCESS_TOKEN=local-de-prueba npm run dev:http
npx @modelcontextprotocol/inspector   # http://127.0.0.1:3333/mcp
```

Corre el **mismo** transporte stateless que Vercel, a propósito: probar en local
con estado y desplegar sin él escondería los bugs justo hasta producción.

## Rotar claves

1. Añade la clave nueva a `T4F_PUBLIC_API_KEYS` **sin quitar la vieja** y
   redespliega tools4foresight.
2. Cambia `T4F_API_KEY` en este servidor y redespliega.
3. Comprueba que responde.
4. Recién entonces quita la entrada vieja de `T4F_PUBLIC_API_KEYS`.

Para `MCP_ACCESS_TOKEN` no hay solapamiento posible (es una sola): avisa a quien
lo use antes de cambiarla.

## Deuda conocida

El rate limit de la API pública vive en un `Map` por instancia serverless, así
que el límite es **best-effort**: con varias instancias activas, el techo real es
más alto que el configurado. Es aceptable para el volumen actual. Si deja de
serlo, migrar `src/lib/rate-limit.ts` de tools4foresight a Upstash Redis.
