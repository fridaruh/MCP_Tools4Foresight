# MCP Tools4Foresight

Servidor **MCP de solo lectura** sobre las señales de foresight de
[tools4foresight.com](https://tools4foresight.com). Le da a un agente acceso al
mismo mapa que ve un miembro: las señales curadas, el grafo semántico, los temas
con su historia y los tres horizontes.

**No escribe nada.** No hay una sola herramienta que modifique, publique o borre
algo. Ver [`SECURITY.md`](./SECURITY.md).

## Qué puede hacer un agente con esto

- «¿Cuál es el estado del mapa?» → panorama de H1/H2/H3 con sus macro-temas.
- «¿Qué temas están creciendo y cuáles se apagan?» → serie temporal por tema.
- «Resume el tema de agentes de IA» → ficha con sus cuatro indicadores y sus señales.
- «¿Qué se parece a esta señal?» → vecinos semánticos, sin salir del mapa curado.
- «¿Qué señales débiles hay en H3?» → temas chicos con novedad alta.
- «¿Qué murió este mes?» → fósiles, comparando snapshots.

## Instalación

Necesitas una **API key de tools4foresight** (pídesela a quien lo administre).

### Claude Code

```bash
claude mcp add tools4foresight \
  --env T4F_API_KEY=tu-api-key \
  -- npx -y mcp-tools4foresight
```

### Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tools4foresight": {
      "command": "npx",
      "args": ["-y", "mcp-tools4foresight"],
      "env": { "T4F_API_KEY": "tu-api-key" }
    }
  }
}
```

### Cursor

En `.cursor/mcp.json`, el mismo bloque que Claude Desktop.

### Remoto (HTTP)

Si prefieres desplegarlo una vez y que varios agentes lo usen, ver
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). El endpoint remoto exige su **propia**
credencial (`MCP_ACCESS_TOKEN`), distinta de la API key.

Hay un ejemplo completo en [`.mcp.json.example`](./.mcp.json.example).

## Variables de entorno

| Variable | Obligatoria | Default | Qué es |
|---|---|---|---|
| `T4F_API_KEY` | **sí** | — | Clave de este servidor contra la API de tools4foresight |
| `T4F_API_BASE_URL` | no | `https://tools4foresight.com/api/public/v1` | Útil para apuntar a un entorno local |
| `T4F_TIMEOUT_MS` | no | `15000` | Timeout por petición |
| `T4F_RETRIES` | no | `2` | Reintentos en 429/5xx/red. Nunca se reintenta un 401 |
| `T4F_CACHE_TTL_MS` | no | `60000` | `0` desactiva la caché en memoria |
| `T4F_LOG_LEVEL` | no | `error` | `silent`, `error` o `debug`. Siempre a `stderr` |
| `MCP_ACCESS_TOKEN` | solo en HTTP | — | Credencial que exige este servidor a quien lo llama |
| `MCP_PORT` | no | `3333` | Puerto del servidor HTTP local |

## Las 18 tools

Referencia completa con ejemplos en [`docs/TOOLS.md`](docs/TOOLS.md).

| Tema | Tools |
|---|---|
| Señales | `list_signals`, `search_signals`, `get_signal`, `get_signal_neighbors` |
| Temas | `list_themes`, `get_theme`, `list_theme_signals`, `get_theme_history`, `list_macro_themes` |
| Horizontes | `get_horizons_overview`, `get_horizon` |
| Taxonomía | `list_categories`, `list_pestel_dimensions`, `get_corpus_overview` |
| Grafo | `get_graph` |
| Snapshots | `list_snapshots`, `get_snapshot` |
| Método | `explain_foresight_term` |

Más 7 **resources**, para adjuntar contexto a mano desde Claude Desktop o Cursor:
`foresight://overview`, `://glossary`, `://horizons`, `://signal/{id}`,
`://theme/{id}`, `://horizon/{key}` y `://macro-theme/{id}`.

Y 6 **prompts** —guiones de conversación sugeridos, que no dan ninguna capacidad
extra— para las preguntas que se repiten: `analizar_horizonte`,
`informe_de_tema`, `radar_semanal`, `senales_debiles`, `comparar_temas` y
`explorar_desde_senal`.

Este servidor es **para explorar**: publicar, despublicar, editar el análisis o
recalcular el grafo se siguen haciendo desde tools4foresight, y nada de eso se
expone aquí.

## Tres cosas que conviene saber antes de leer la salida

1. **La fecha de una señal es una estimación.** La API de X no expone cuándo
   ocurrió un like, solo el orden. Por eso `likedAt` se muestra siempre con `~`.
2. **Un tema muerto es un fósil, no un borrado.** Se conserva y puede resucitar.
   Nada se elimina del mapa.
3. **El porcentaje de similitud no se le muestra a una persona.** Un 0.63 se lee
   como una precisión que el método no tiene. Se usa `strength`
   (fuerte/media/débil); el `score` crudo está disponible para el razonamiento del
   agente.

El glosario completo del método está en [`docs/DOMAIN.md`](docs/DOMAIN.md) y se
puede consultar en vivo con `explain_foresight_term`.

## Documentación

| Documento | Para qué |
|---|---|
| [`docs/TOOLS.md`](docs/TOOLS.md) | Cada tool, con entrada y salida de ejemplo |
| [`docs/API.md`](docs/API.md) | Contrato de la API pública que consume |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Cómo está armado y por qué |
| [`docs/DOMAIN.md`](docs/DOMAIN.md) | Glosario del método de foresight |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Desplegar el modo remoto |
| [`SECURITY.md`](./SECURITY.md) | Qué nunca se expone |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Cómo agregar una tool |

## Licencia

El código es MIT. **El contenido que sirve no lo es**: las señales y el mapa de
tools4foresight son material de suscripción de pago.
