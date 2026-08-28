# Calcular deudas

Comparador visual de cómo crece una deuda impaga usando tasas de préstamos personales informadas al BCRA.

## Qué responde

La aplicación está diseñada alrededor de dos preguntas:

1. **Si me prestan una cantidad de dinero una sola vez, ¿cómo crece la deuda si nunca la pago?**
2. **Si necesito pedir esa misma cantidad todos los meses, ¿cómo crece la deuda acumulada si nunca pago?**

Además permite ingresar un **salario mensual congelado** que se dibuja como referencia horizontal para visualizar la distancia entre el ingreso y la deuda.

## Comparación entre entidades

La gráfica muestra una línea por entidad financiera. Para evitar mezclar múltiples productos de un mismo banco, se toma automáticamente el préstamo personal en pesos con la **menor CFTEA disponible dentro de cada entidad** en el snapshot del BCRA.

Debajo de la gráfica se muestra:

- entidad;
- CFTEA utilizada;
- deuda final;
- cuántos salarios mensuales representa esa deuda.

## Fuente de datos

API pública del Banco Central de la República Argentina, Régimen de Transparencia:

`https://api.bcra.gob.ar/transparencia/v1.0/Prestamos/Personales`

El workflow diario corre a las **19:30 ART / 22:30 UTC**, después de la última actualización diaria informada por el BCRA.

## Modelo financiero

El CFTEA se transforma en una tasa efectiva mensual equivalente:

`i = (1 + CFTEA)^(1/12) - 1`

### Una sola vez

En el mes 0 se recibe el capital. Luego, cada mes, el saldo completo capitaliza intereses y no se realiza ningún pago.

### Todos los meses

Cada mes se agrega el mismo capital solicitado al saldo existente y luego el total capitaliza intereses. No hay cuotas ni pagos parciales en la simulación.

El objetivo es mostrar de forma comparable la velocidad de crecimiento de una deuda impaga. **No reproduce un cuadro de marcha contractual ni una estrategia de refinanciación específica.**

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

**Primera activación:** en `Settings → Pages → Build and deployment → Source`, seleccionar **GitHub Actions**.

### `Update BCRA rates`

Se ejecuta diariamente a las 22:30 UTC / 19:30 ART y también manualmente. Actualiza:

- `data/rates.json`: último snapshot;
- `data/history/YYYY-MM-DD.json`: histórico diario.

Si cambia el snapshot, el commit vuelve a disparar el deploy de Pages.

### `Validate`

Corre tests y build en pull requests.

## Estructura

```text
index.html                 UI estática
app.js                     Comparación y gráfica
lib/debt.js                Motor de deuda impaga
scripts/rates-lib.mjs      Normalización BCRA
scripts/fetch-rates.mjs    Descarga + snapshots
scripts/build-site.mjs     Build de Pages
data/rates.json            Último snapshot
.github/workflows/         Deploy, CRON y validación
tests/                     Tests del motor y normalizador
```
