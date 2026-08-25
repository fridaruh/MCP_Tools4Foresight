# Arquitectura

## El flujo completo

```
  Agente (Claude Code / Desktop / Cursor / uno propio)
     │
     │  MCP  (stdio  ·  Streamable HTTP)
     ▼
  ┌─────────────────────────────────────────────┐
  │  MCP_Tools4Foresight                        │
  │                                             │
  │   stdio.ts    http.ts    api/mcp.ts         │  ← 3 entry points, solo eligen transporte
  │        └──────────┼──────────┘              │
  │                   ▼                         │
  │              server.ts                      │  ← el core único
  │        tools · resources · prompts          │
  │                   ▼                         │
  │      T4FClient  (+ caché TTL/LRU)           │  ← reintentos, timeout, errores para el LLM
  └───────────────────┼─────────────────────────┘
                      │  HTTPS + Bearer T4F_API_KEY
                      ▼
  ┌─────────────────────────────────────────────┐
  │  tools4foresight  (Next.js 16, en Vercel)   │
  │                                             │
  │   /api/public/v1/**  ← 17 route handlers    │
  │        withPublicApi()                      │  ← auth, rate limit, errores
  │        public-dto.ts                        │  ← LA FRONTERA DE SEGURIDAD
  │        public-query.ts                      │  ← inyecta publishStatus:'published'
  │                   ▼                         │
  │              Prisma 7                       │
  └───────────────────┼─────────────────────────┘
                      ▼
              Postgres (Neon) + pgvector
```

## Decisiones registradas

### Por qué HTTP y no Postgres directo

El MCP podría conectarse a Neon con un rol de solo lectura y ahorrarse un salto.
No lo hace por tres razones:

1. **La frontera de seguridad queda en un solo sitio.** Con acceso directo a la
   base, cada consulta nueva del MCP podría filtrar una columna prohibida. Con la
   API de por medio, `public-dto.ts` decide qué existe fuera y nada más puede
   salir.
2. **La credencial que viaja es revocable y acotada.** Una API key con etiqueta
   se revoca sola; una cadena de conexión a Postgres, no.
3. **El MCP se puede desplegar donde sea** sin acceso de red a la base.

El precio es un salto de red extra, que la caché en memoria amortigua.

### Por qué un core y tres entry points

`server.ts` construye el `McpServer` completo; `stdio.ts`, `http.ts` y
`api/mcp.ts` solo eligen el transporte. Así **no hay forma de que el servidor
local y el remoto expongan cosas distintas** — que es exactamente el tipo de
divergencia que produce un agujero de seguridad meses después.

### Por qué stateless en Vercel

`WebStandardStreamableHTTPServerTransport` sin `sessionIdGenerator`. En Vercel
cada petición puede caer en una instancia distinta, así que una sesión guardada
en memoria se perdería a mitad de conversación y el fallo sería intermitente —
lo peor de depurar. Sin sesión no hay sesión que perder.

Lo que se pierde: resumabilidad y notificaciones del servidor fuera del ciclo de
una petición. No hace falta ninguna de las dos: todas las tools son lecturas
cortas.

### Por qué Streamable HTTP y no SSE

SSE es el transporte legacy del protocolo. Streamable HTTP es el actual y el
único que se implementa aquí.

### Por qué el cursor es compuesto `(likedAt, id)`

`likedAt` es una **estimación** con empates frecuentes: varios ítems históricos
comparten fecha. Un cursor sobre un campo no único **se salta las filas
empatadas** que quedaron del otro lado del corte. El par `(likedAt, id)` sí es
un orden total, así que "la fila siguiente" está definida sin ambigüedad.

Verificado contra la base real: recorrer las 26 páginas de 177 señales devuelve
177 filas únicas, con 15 fechas empatadas solo en la primera página.

Las listas que no ordenan por `likedAt` (temas, snapshots) usan un cursor por id
con un prefijo distinto (`v1i` en vez de `v1`), para que pegar un cursor del
endpoint equivocado dé un 400 claro en vez de una página silenciosamente mal.

### Por qué la caché es un `Map` en memoria y no Redis

El perfil de uso es un puñado de agentes haciendo lecturas repetidas dentro de
una misma conversación. Un `Map` con TTL y evicción LRU cubre eso con cero
dependencias y cero infraestructura. Los TTL van por tipo de dato: taxonomía 10
min, grafo y temas 5 min, señales 1 min, y un snapshot por id es **inmutable**
(es una foto del pasado, nunca cambia).

Si algún día hay muchos clientes, la caché deja de ser el problema antes que el
rate limit — que también es por instancia. Los dos se migrarían juntos.

### Por qué `score` y `strength` conviven

La regla de producto de tools4foresight es que **al lector humano no se le
muestra el porcentaje de similitud**: un 0.63 se lee como una precisión que el
método no tiene, y la conversación se va al número en vez de a la relación.

Pero eso es una regla de presentación, no de seguridad. Un **agente** necesita el
float para ordenar vecinos y poner umbrales; ocultárselo lo obligaría a inventar
heurísticas peores. Así que viajan los dos, y la instrucción de cuál usar al
redactar vive **en la descripción de la tool**, que es donde un modelo la
obedece — no en un README que no lee nadie.

### Por qué un id no publicado devuelve 404 y no 403

Un 403 confirmaría que existe algo detrás de ese id. El catálogo sin publicar es
material sin revisar cuya existencia no debe ser deducible desde fuera.

## Deudas conocidas

- **El rate limit es por instancia serverless**, no global: un `Map` en memoria.
  Es best-effort. Si llega a importar, migrar a Upstash Redis.
- **El SDK de MCP arrastra `express`, `hono`, `ajv` y `jose`** como dependencias.
  Engorda el bundle de la función de Vercel. No hay nada que hacer desde este
  lado.
- **Autenticación remota por clave compartida.** Lo natural más adelante es
  OAuth 2.1 con el `ProxyOAuthServerProvider` del SDK, para que cada suscriptor
  use su propia identidad.
