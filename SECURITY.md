# Seguridad

Este servidor MCP es de **solo lectura**. No expone ninguna herramienta que escriba,
modifique o borre nada en tools4foresight. Si alguna vez aparece una, es un bug.

## Lo que NUNCA se expone

La frontera de seguridad no está en este repo: está en
`src/lib/public-dto.ts` de `tools4foresight`. **Si un campo no está en un DTO, no
sale de la API** — y este servidor solo puede mostrar lo que la API le da.

Tablas y columnas que la API pública jamás devuelve:

| Qué | Por qué |
|---|---|
| `users`, `sessions`, `accounts`, `verifications` | Datos de cuenta de personas reales |
| `favorites`, `feedback` | Actividad privada de cada miembro |
| `x_auth_tokens` | Credenciales de X, cifradas AES-256-GCM en la base |
| `prompt_settings` | Prompts internos de curaduría |
| `custom_field_definitions`, `liked_item_custom_fields` | Banco de trabajo del enriquecimiento: columnas libres que pueden contener notas internas |
| Todo lo de Stripe (`stripe_customer_id`, `subscription_*`) | Datos de facturación |
| La columna `embedding` (`vector(768)`) | 768 floats por señal; expone el modelo y no aporta nada a un agente |
| `embeddingHash`, `publishStatus`, `enrichDiscarded`, `likeRank`, `detectedAt`, `fetchStatus`, `membersHash`, las columnas `*Source` | Estado interno editorial y de infraestructura |
| Señales `pending` o `enrichDiscarded` | Material sin revisar. **Un id no publicado devuelve 404, no 403**: un 403 confirmaría que hay algo detrás de ese id |

## Las dos credenciales

Son distintas a propósito y no deben confundirse:

- **`T4F_API_KEY`** — la clave del servidor MCP contra la API de tools4foresight.
  Da acceso a todo el contenido publicado.
- **`MCP_ACCESS_TOKEN`** — la clave que exige *este* servidor cuando corre en modo
  HTTP remoto.

El despliegue remoto **lleva `T4F_API_KEY` dentro**. Publicarlo sin
`MCP_ACCESS_TOKEN` sería regalar el contenido de suscripción a quien encuentre la
URL. Por eso el handler responde **503 si `MCP_ACCESS_TOKEN` no está configurada**:
nunca abierto por defecto.

Reglas de manejo:

- Nunca en el repo, nunca en un commit, nunca en logs.
- Nunca en un frontend: una API key en el navegador es una API key pública.
- Rotación: ver [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Las claves de la API
  llevan etiqueta (`label:clave`) precisamente para poder revocar una sin tirar a
  las demás.

## Licencia del código vs. licencia de los datos

El código de este repo es MIT. **El contenido que sirve no lo es**: las señales,
análisis y el mapa semántico de tools4foresight son material de suscripción de
pago. Poder leer este código no da derecho a redistribuir lo que devuelve.

## Reportar un problema

Escribe a quien mantiene el repo antes de abrir un issue público, sobre todo si
crees haber encontrado una forma de leer algo de la tabla de arriba.
