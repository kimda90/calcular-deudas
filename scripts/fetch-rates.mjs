import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BCRA_PERSONAL_LOANS_URL, buenosAiresDate, normalizeBcraResponse } from './rates-lib.mjs';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const output = arg('--output', 'data/rates.json');
const historyDir = arg('--history');
const input = arg('--input');

let payload;
if (input) {
  payload = JSON.parse(await readFile(input, 'utf8'));
} else {
  const response = await fetch(BCRA_PERSONAL_LOANS_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'calcular-deudas/1.0 (+https://github.com/kimda90/calcular-deudas)',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`BCRA HTTP ${response.status} ${response.statusText}`);
  payload = await response.json();
}

const snapshot = normalizeBcraResponse(payload);
await mkdir(dirname(output), { recursive: true });
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
await writeFile(output, serialized, 'utf8');

if (historyDir) {
  await mkdir(historyDir, { recursive: true });
  const historyPath = join(historyDir, `${buenosAiresDate()}.json`);
  await writeFile(historyPath, serialized, 'utf8');
  console.log(`Histórico: ${historyPath}`);
}

console.log(`Guardados ${snapshot.productCount} productos en ${output}`);
