import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const destination = '_site';
await rm(destination, { recursive: true, force: true });
await mkdir(`${destination}/lib`, { recursive: true });
await mkdir(`${destination}/data`, { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js']) {
  await cp(file, `${destination}/${file}`);
}
await cp('lib/debt.js', `${destination}/lib/debt.js`);
await cp('data/rates.json', `${destination}/data/rates.json`);
await writeFile(`${destination}/.nojekyll`, '', 'utf8');
console.log(`Sitio generado en ${destination}/`);
