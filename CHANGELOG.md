# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [0.1.0] — no publicado

Primera versión del servidor MCP de solo lectura sobre tools4foresight.

### Añadido

- **18 tools** de consulta: señales (`list_signals`, `search_signals`,
  `get_signal`, `get_signal_neighbors`), temas (`list_themes`, `get_theme`,
  `list_theme_signals`, `get_theme_history`, `list_macro_themes`), horizontes
  (`get_horizons_overview`, `get_horizon`), taxonomía (`list_categories`,
  `list_pestel_dimensions`, `get_corpus_overview`), grafo (`get_graph`),
  snapshots (`list_snapshots`, `get_snapshot`) y método
  (`explain_foresight_term`, que resuelve en local, sin red).
- **7 resources** (`foresight://overview`, `://glossary`, `://horizons`,
  `://signal/{id}`, `://theme/{id}`, `://horizon/{key}`, `://macro-theme/{id}`).
- **6 prompts** como guiones de conversación: `analizar_horizonte`,
  `informe_de_tema`, `radar_semanal`, `senales_debiles`, `comparar_temas`,
  `explorar_desde_senal`. Todos inyectan primero las reglas del dominio.
- **Tres entry points** sobre un mismo core: stdio (`npx`), HTTP local para
  desarrollo y una función de Vercel con Streamable HTTP stateless.
- Cliente HTTP propio con reintentos (solo 429/5xx/red), timeout, errores
  traducidos a mensajes accionables para el modelo, y caché en memoria con TTL
  por tipo de dato y evicción LRU.
- Glosario del método como datos (`src/domain/glossary.ts`, 25 términos), que
  alimenta la tool, el resource y `docs/DOMAIN.md` desde una sola fuente.
- Documentación: `README.md`, `docs/{API,TOOLS,ARCHITECTURE,DOMAIN,DEPLOYMENT}.md`,
  `SECURITY.md`, `CONTRIBUTING.md`, `AGENTS.md`.

### Decidido

- **Superficie solo de consulta**: ni tools ni prompts hacen nada que un
  administrador haría. Los prompts son guiones sugeridos, no capacidades.
- **Sin acceso directo a Postgres**: todo pasa por la API pública
  `/api/public/v1` de tools4foresight, para que la frontera de seguridad viva en
  un solo sitio (`public-dto.ts`).
- **Se exponen `score` y `strength`**: el porcentaje de similitud no se le
  muestra a una persona, pero un agente lo necesita para ordenar y filtrar. La
  regla de uso va en la descripción de la tool.
