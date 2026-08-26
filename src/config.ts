// Carga y valida la configuración del servidor MCP a partir de variables de entorno.
// Ver docs/PLAN.md §2.4. Los mensajes de error están en español y son accionables:
// le dicen al operador humano (no al LLM) exactamente qué hacer para arrancar el
// servidor, porque estos errores explotan antes de que exista ninguna conexión MCP.
import * as z from 'zod/v4';

export type LogLevel = 'silent' | 'error' | 'debug';

const DEFAULT_BASE_URL = 'https://tools4foresight.com/api/public/v1';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CACHE_TTL_MS = 60_000;
// Sin variable de entorno propia: el plan (§2.4, .env.example en §3) no la expone
// porque no es algo que un operador necesite tocar para operar el servidor; es un
// tope de memoria interno. Si algún día hace falta, se añade T4F_CACHE_MAX_ENTRIES aquí.
const DEFAULT_CACHE_MAX_ENTRIES = 200;
// No especificado en el plan. 'error' es el punto medio seguro: por defecto no se
// inunda stderr con debug, pero tampoco se queda 'silent' y esconde fallos reales.
const DEFAULT_LOG_LEVEL: LogLevel = 'error';

/**
 * Error de configuración, distinto de un Error genérico para que `stdio.ts` pueda
 * atraparlo específicamente e imprimir solo el mensaje (sin stack de zod) antes de
 * hacer `process.exit(1)`.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Recorta la(s) barra(s) final(es) de la base URL: los métodos de conveniencia del
// cliente concatenan `${baseUrl}${path}` donde `path` siempre empieza con "/", así
// que una base URL con barra final produciría "//signals" en vez de "/signals".
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

// Trata las variables de entorno vacías ("") igual que si no estuvieran definidas,
// para que `FOO=` en un .env no se cuele como valor distinto del default.
function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const MISSING_API_KEY_MESSAGE =
  'Falta T4F_API_KEY: genera una clave en tools4foresight y ponla en la configuración del servidor MCP.';

const configSchema = z.object({
  baseUrl: z
    .string({ error: 'T4F_API_BASE_URL debe ser una URL en formato texto.' })
    .trim()
    .min(1, { message: 'T4F_API_BASE_URL no puede estar vacía si se define. Quítala del entorno para usar el valor por defecto.' })
    .refine(
      (value) => {
        try {
          // eslint-disable-next-line no-new
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: `T4F_API_BASE_URL no es una URL válida. Ejemplo correcto: "${DEFAULT_BASE_URL}".` },
    )
    // HTTPS obligatorio fuera de localhost: por esta URL viaja la cabecera
    // `Authorization: Bearer <T4F_API_KEY>` en cada petición, y una clave de
    // suscripción en claro por la red es una clave comprometida. Se permite
    // http contra localhost/127.0.0.1 para desarrollar contra la app en local.
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          if (url.protocol === 'https:') return true;
          return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
        } catch {
          return false;
        }
      },
      { message: 'T4F_API_BASE_URL debe usar https:// (solo se permite http:// contra localhost). La API key viaja en cada petición por esa URL.' },
    )
    .transform(normalizeBaseUrl),
  apiKey: z
    .string({ error: MISSING_API_KEY_MESSAGE })
    .trim()
    .min(1, { message: MISSING_API_KEY_MESSAGE }),
  timeoutMs: z.coerce
    .number({ error: 'T4F_TIMEOUT_MS debe ser un número de milisegundos, por ejemplo 15000.' })
    .int({ message: 'T4F_TIMEOUT_MS debe ser un entero (milisegundos), sin decimales.' })
    .positive({ message: 'T4F_TIMEOUT_MS debe ser mayor que 0; si quieres desactivar el timeout, sube el valor en vez de ponerlo en 0.' }),
  retries: z.coerce
    .number({ error: 'T4F_RETRIES debe ser un número entero, por ejemplo 2.' })
    .int({ message: 'T4F_RETRIES debe ser un entero, sin decimales.' })
    .min(0, { message: 'T4F_RETRIES no puede ser negativo; usa 0 para desactivar los reintentos.' })
    .max(10, { message: 'T4F_RETRIES no puede ser mayor que 10: evita machacar la API de tools4foresight con reintentos descontrolados.' }),
  cacheTtlMs: z.coerce
    .number({ error: 'T4F_CACHE_TTL_MS debe ser un número de milisegundos. Usa 0 para desactivar la caché.' })
    .int({ message: 'T4F_CACHE_TTL_MS debe ser un entero (milisegundos), sin decimales.' })
    .min(0, { message: 'T4F_CACHE_TTL_MS no puede ser negativo.' }),
  cacheMaxEntries: z.coerce
    .number({ error: 'El tope de entradas de caché debe ser un entero positivo.' })
    .int({ message: 'El tope de entradas de caché debe ser un entero, sin decimales.' })
    .positive({ message: 'El tope de entradas de caché debe ser mayor que 0.' }),
  logLevel: z.enum(['silent', 'error', 'debug'], {
    error: "T4F_LOG_LEVEL debe ser uno de: 'silent', 'error' o 'debug'.",
  }),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Lee y valida la configuración desde `env` (por defecto `process.env`).
 * Lanza `ConfigError` con uno o varios mensajes accionables si algo falta o es
 * inválido; no hay valores "silenciosamente inventados" salvo los defaults
 * documentados aquí y en `.env.example`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = {
    baseUrl: emptyToUndefined(env.T4F_API_BASE_URL) ?? DEFAULT_BASE_URL,
    // Sin default: es la única variable obligatoria. Si falta, zod produce
    // MISSING_API_KEY_MESSAGE vía el error de tipo (string requerido).
    apiKey: env.T4F_API_KEY,
    timeoutMs: emptyToUndefined(env.T4F_TIMEOUT_MS) ?? String(DEFAULT_TIMEOUT_MS),
    retries: emptyToUndefined(env.T4F_RETRIES) ?? String(DEFAULT_RETRIES),
    cacheTtlMs: emptyToUndefined(env.T4F_CACHE_TTL_MS) ?? String(DEFAULT_CACHE_TTL_MS),
    cacheMaxEntries: String(DEFAULT_CACHE_MAX_ENTRIES),
    logLevel: emptyToUndefined(env.T4F_LOG_LEVEL) ?? DEFAULT_LOG_LEVEL,
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const detalle = result.error.issues.map((issue) => `- ${issue.message}`).join('\n');
    throw new ConfigError(`Configuración del servidor MCP inválida:\n${detalle}`);
  }
  return result.data;
}
