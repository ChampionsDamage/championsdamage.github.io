# ChampionsDamage — Calculadora de daño de Pokémon Champions

Calculadora de daño para **Pokémon Champions** (nivel 50, sistema **SP**, dobles VGC)
en **4 idiomas nativos**: español, português (BR), français e italiano.
Estática, mobile-first, sin backend, pensada para GitHub Pages + AdSense.

> Estrategia: no competimos en inglés (saturado). Ganamos en ES/PT/FR/IT con
> localización **genuinamente nativa** (no traducción automática), UX limpia y
> velocidad. Ver `docs/` y el brief.

## Estado

- ✅ Motor de daño propio **validado contra `@smogon/calc`** (26/26 escenarios: STAB,
  efectividad, clima, terreno, pantallas, crítico, spread, quemadura, boosts,
  objetos y habilidades). El output numérico es idéntico al de Pokémon Showdown.
- ✅ Datos reales descargados de fuentes canónicas (Showdown / `@pkmn`): 890 especies,
  864 movimientos, tabla de tipos, habilidades, objetos, naturalezas.
- ✅ 4 páginas de calculadora nativas + 4 páginas legales/contacto.
- ✅ SEO completo: `<title>`/meta nativos, **hreflang** (ES/PT/FR/IT + x-default),
  canonical, **JSON-LD** (`WebApplication` + `FAQPage` + `BreadcrumbList`),
  Open Graph/Twitter con **imágenes OG por idioma**, `sitemap.xml`, `robots.txt`,
  `manifest.webmanifest`.
- ✅ URLs de cálculo compartibles (estado en query string) + botón compartir.

## Stack

SSG propio en Node, **sin dependencias de runtime** (las dev-deps son solo para
build/test). El sitio resultante es HTML/CSS/JS estático puro.

## Estructura

```
src/
  i18n/<lang>.json        # textos nativos de la UI + SEO + FAQ + glosario
  legal/<lang>.json       # aviso legal, privacidad, cookies, contacto
  assets/js/engine.js     # motor de daño (puro; corre en navegador y en Node)
  assets/js/app.js        # controlador de UI (comboboxes, SP, auto-cálculo, share)
  assets/css/styles.css   # estilos mobile-first
  assets/og/              # imágenes OG generadas (1200x630)
  data/raw/               # datasets canónicos de Showdown (fuente)
data/                     # JSON ligero servido al cliente (generado)
scripts/
  build-data.js           # raw Showdown -> /data ligero
  build-og.js             # genera imágenes OG por idioma (sharp)
  build-site.js           # genera /dist (HTML por idioma + sitemap/robots/...)
  test-engine.js          # valida el motor contra @smogon/calc
  serve.js                # servidor estático local para previsualizar
site.config.json          # dominio, idiomas, regulación, email de contacto
dist/                     # salida lista para desplegar (generada)
```

## Comandos

```bash
npm install            # instala dev-deps (@smogon/calc para tests, sharp para OG)
npm test               # valida el motor de daño contra @smogon/calc
npm run build:data     # regenera /data desde src/data/raw
npm run build          # build completo: datos + OG + sitio -> dist/
npm run serve          # sirve dist/ en http://localhost:4178
```

## Actualizar datos por regulación

1. (Opcional) Re-descargar datasets canónicos a `src/data/raw/`:
   `pokedex.json`, `moves.json` y, en formato `.js`, `typechart`, `items`,
   `abilities`, `formats-data` (ver cabecera de `build-data.js`).
2. `npm run build:data` para regenerar `/data`.
3. Ajustar `regulation` en `site.config.json`.

El filtro **«Solo Champions (formas finales)»** usa el flag `evo` (Pokémon que
aún puede evolucionar se excluye). Es una aproximación al roster legal.

## Despliegue (GitHub Pages)

1. Edita `site.config.json` → `url` con tu dominio real (p. ej.
   `https://tuusuario.github.io`). Es **crítico** para canonical/hreflang/OG.
2. Sube el repo a GitHub. El workflow `.github/workflows/deploy.yml` construye y
   publica `dist/` automáticamente en cada push a `main`
   (Settings → Pages → Source: GitHub Actions).
3. Recomendado: **user/org page** (`usuario.github.io`) para servir en la raíz.
   Si usas una *project page* en subcarpeta, habría que prefijar las rutas
   absolutas (`/assets`, `/data`) con la base.

## Estado de los extras

- [x] **Nombres de entidades localizados** (Pokémon/movimientos/objetos/habilidades/
      tipos por idioma) desde PokéAPI/veekun → `data/names-<lang>.json`. FR localiza
      todo (Dracaufeu, Séisme); ES/IT localizan movimientos/objetos/tipos y mantienen
      los nombres de Pokémon en inglés (que es lo oficial); PT añade tipos en PT-BR.
      Regenera con `npm run build:names`. La búsqueda acepta nombre nativo e inglés.
- [x] **Páginas de clúster** en los 4 idiomas, enlazadas en el subnav y el sitemap:
      tabla de tipos, **speed tiers** (velocidad de todo el roster a nivel 50) y
      naturalezas. Sitemap = 21 URLs.
- [x] **Banner de consentimiento + carga diferida de AdSense**: rellena
      `adsenseClient` en `site.config.json`. Si está vacío, **no** se carga ningún
      script ni cookie y el banner no aparece (estado actual, 100 % cookie-free).
- [x] **Roster exacto de Reg M-B** parseado del wikitext de Bulbapedia
      (`src/data/raw/champions-roster.wiki` → `scripts/build-regulations.js` →
      `data/regulations.json`): **298 formas** del juego mapeadas a datos reales de
      Showdown (208 especies + 76 Megas + formas regionales; 1 mega exclusiva de
      Champions sin datos en Showdown queda fuera). El filtro «Solo Champions» usa
      esta lista y es el modo por defecto. Para actualizar de regulación: vuelve a
      bajar el wikitext y corre `npm run build:regulations`.

Nota: `pokemon.json` ahora incluye especies «Past» (Beedrill, Megas…) que Showdown
marca como ilegales en SV pero que SÍ están en Champions con stats base válidas.

## Aviso

Herramienta no oficial creada por fans. *Pokémon* y *Pokémon Champions* son marcas
de Nintendo, Game Freak y The Pokémon Company. Datos de combate de fuentes públicas
de la comunidad.
