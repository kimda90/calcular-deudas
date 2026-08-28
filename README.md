# Calcular deudas

Comparador de préstamos personales informados al BCRA y simulador de endeudamiento recurrente.

## Qué hace

- Consume el endpoint público `Prestamos/Personales` del Régimen de Transparencia del BCRA.
- Normaliza y conserva TEA, CFTEA, plazo, beneficiario, montos, ingreso mínimo y cuota inicial informada.
- Simula dos escenarios:
  - **Préstamos recurrentes**: las cuotas existentes aumentan el faltante del mes siguiente y se toma un préstamo nuevo para cubrirlo.
  - **Deuda compuesta**: el saldo completo continúa capitalizando y se agrega un faltante mensual constante.
- Muestra deuda pendiente, capital pedido acumulado, pagos, intereses, servicio de deuda e impacto sobre el ingreso.
- Publica un sitio estático en GitHub Pages.
- Actualiza las tasas diariamente y guarda snapshots históricos.

## Fuente de datos

API pública del Banco Central de la República Argentina, Régimen de Transparencia:

`https://api.bcra.gob.ar/transparencia/v1.0/Prestamos/Personales`

El BCRA informa que los datos son presentados por las entidades financieras en carácter de declaración jurada y que durante días hábiles la última actualización diaria está disponible a las 19:00 (hora Argentina). El workflow diario corre a las **19:30 ART / 22:30 UTC**.

## Desarrollo local

No hay dependencias de runtime ni de build.

```bash
npm test
npm run build
python3 -m http.server 8000 -d _site
```

Actualizar las tasas localmente:

```bash
npm run rates:update
```

## GitHub Actions

### `Deploy GitHub Pages`

Se ejecuta con cada push a `main` y manualmente. Corre tests, genera `_site`, intenta refrescar las tasas para ese deploy y publica el artifact usando las Actions oficiales de GitHub Pages.

**Primera activación:** en `Settings → Pages → Build and deployment → Source`, seleccionar **GitHub Actions**. GitHub requiere esta habilitación una sola vez para custom workflows.

### `Update BCRA rates`

Se ejecuta todos los días a las 22:30 UTC (19:30 ART) y también manualmente. Actualiza:

- `data/rates.json`: último snapshot.
- `data/history/YYYY-MM-DD.json`: histórico diario.

El commit del snapshot vuelve a disparar el deploy de Pages.

### `Validate`

Corre tests y build en pull requests.

## Modelo financiero

El simulador convierte el CFTEA a una tasa efectiva mensual equivalente:

`i = (1 + CFTEA)^(1/12) - 1`

Para préstamos recurrentes estima una cuota fija con sistema francés. Esto permite comparar escenarios de forma homogénea, pero **no reproduce necesariamente el cuadro de marcha contractual** de cada producto: el CFTEA incorpora costos que una entidad puede aplicar de forma distinta y las ofertas dependen del perfil crediticio.

## Cobertura

La fuente automática inicial es el Régimen de Transparencia del BCRA. Si una billetera o fintech no informa una línea dentro de ese endpoint, la UI permite simularla con CFTEA manual; no se inventan ni se scrapean tasas no verificadas.

## Estructura

```text
index.html                 UI estática
app.js                     Estado y renderizado
lib/debt.js                Motor de simulación
scripts/rates-lib.mjs      Normalización BCRA
scripts/fetch-rates.mjs    Descarga + snapshots
scripts/build-site.mjs     Build de Pages
data/rates.json            Último snapshot
.github/workflows/         Deploy, CRON y validación
tests/                     Tests del motor y normalizador
```
