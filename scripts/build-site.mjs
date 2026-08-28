import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const destination = '_site';
await rm(destination, { recursive: true, force: true });
await mkdir(`${destination}/lib`, { recursive: true });
await mkdir(`${destination}/data`, { recursive: true });

for (const file of ['index.html', 'entidades.html', 'styles.css', 'app.js', 'entities.js']) {
  await cp(file, `${destination}/${file}`);
}
for (const file of ['debt.js', 'market.js']) {
  await cp(`lib/${file}`, `${destination}/lib/${file}`);
}
await cp('data/rates.json', `${destination}/data/rates.json`);
await writeFile(`${destination}/.nojekyll`, '', 'utf8');
console.log(`Sitio generado en ${destination}/`);
