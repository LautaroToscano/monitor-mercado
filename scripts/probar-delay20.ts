/**
 * Prueba la API Delay20 de BYMA contra la real y resuelve lo que el manual
 * deja dudoso (docs/BYMA_DELAY20_API.md, puntos con ⚠️).
 *
 *   npm run probar:delay20
 *
 * Lee las credenciales de .env. No imprime ninguna.
 */
import { delay20Configurado, ErrorDelay20, getDelay20, pedirToken, type FilaDelay20 } from '../src/lib/sources/byma-delay20';
import { getUniverse } from '../src/lib/universes';

const corto = (e: unknown) => (e instanceof ErrorDelay20 ? `HTTP ${e.status}` : (e as Error).message.slice(0, 120));

async function probar<T>(nombre: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    console.log(`  ✓ ${nombre}`);
    return r;
  } catch (e) {
    console.log(`  ✗ ${nombre}: ${corto(e)}`);
    return null;
  }
}

async function main() {
  if (!delay20Configurado()) {
    console.log('Faltan BYMA_CLIENT_ID y BYMA_CLIENT_SECRET en .env');
    process.exit(1);
  }

  console.log('\n1. Token');
  const t = await pedirToken();
  console.log(`  credenciales por: ${t.forma === 'basic' ? 'HTTP Basic' : 'el body del pedido'}`);
  console.log(`  scope pedido: ${process.env.BYMA_SCOPE || 'delay20.read (por defecto)'} · scope otorgado: ${t.scope ?? '(no lo dice)'}`);

  console.log('\n2. Renta fija: en qué grupo y plazo viene cada papel de las curvas');
  const grupos = ['LETRASTESORO', 'TITULOSPUBLICOS', 'LETRAS', 'BONOSCONSOLIDACION', 'TITULOSDEUDA'];
  const filas: (FilaDelay20 & { grupo: string })[] = [];
  for (const grupo of grupos) {
    const r = await probar(`fixed_income group=${grupo}`, () =>
      getDelay20('fixed_income', { group: grupo, market: 'PPT', operativeform: 'CONTADO', currency: 'ARS' }),
    );
    if (r) {
      console.log(`    ${r.length} filas · plazos ${[...new Set(r.map((f) => f.settlPeriod))].join(', ')}`);
      filas.push(...r.map((f) => ({ ...f, grupo })));
    }
  }

  const slugs = ['tasa-fija', 'tasa-cer', 'dolar-linked', 'tamar'];
  const hoy = new Date().toISOString().slice(0, 10);
  for (const slug of slugs) {
    const u = getUniverse(slug)!;
    const vivos = [...u.reference.values()].filter((r) => r.maturityDate > hoy && r.issueDate <= hoy).map((r) => r.symbol);
    const faltan = vivos.filter((s) => !filas.some((f) => f.symbol === s && f.settlPeriod === '0002'));
    const en = [...new Set(filas.filter((f) => vivos.includes(f.symbol)).map((f) => f.grupo))];
    console.log(`  ${slug}: ${vivos.length - faltan.length}/${vivos.length} a 24 hs, en ${en.join(', ') || '—'}${faltan.length ? ` · faltan ${faltan.join(', ')}` : ''}`);
  }

  console.log('\n3. Convención de precio: contra data912 (por cada 100 de VN)');
  const d912 = new Map<string, number>();
  for (const p of ['arg_notes', 'arg_bonds']) {
    const r = await fetch(`https://data912.com/live/${p}`).then((x) => x.json() as Promise<{ symbol: string; c: number }[]>).catch(() => []);
    for (const x of r) d912.set(x.symbol, x.c);
  }
  for (const s of ['S29E7', 'T15E7', 'TZXD6', 'TX28', 'D30N6', 'TMF27', 'AL30']) {
    const f = filas.find((x) => x.symbol === s && x.settlPeriod === '0002');
    const p = f?.trade || f?.closing_price || f?.previous_close;
    const o = d912.get(s);
    console.log(`  ${s}: Delay20 ${p ?? '—'} · data912 ${o ?? '—'}${p && o ? ` · cociente ${(p / o).toFixed(4)}` : ''}`);
  }
  const muestra = filas.find((x) => x.symbol === 'S29E7' && x.settlPeriod === '0002');
  if (muestra) console.log(`  fila de ejemplo (S29E7): ${JSON.stringify(muestra)}`);

  console.log('\n4. Paginación en renta fija');
  const p0 = await probar('page=0', () => getDelay20('fixed_income', { group: 'TITULOSPUBLICOS', market: 'PPT', operativeform: 'CONTADO', currency: 'ARS', page: 0 }));
  const p1 = await probar('page=1', () => getDelay20('fixed_income', { group: 'TITULOSPUBLICOS', market: 'PPT', operativeform: 'CONTADO', currency: 'ARS', page: 1 }));
  if (p0 && p1) {
    const iguales = JSON.stringify(p0.map((f) => f.security_id)) === JSON.stringify(p1.map((f) => f.security_id));
    console.log(`    page=0: ${p0.length} filas · page=1: ${p1.length} filas · ${p1.length === 0 ? 'la 1 viene vacía' : iguales ? 'iguales (ignora page)' : 'distintas (pagina)'}`);
  }

  console.log('\n5. Path de acciones');
  for (const path of ['equity.raw/', 'equity']) {
    const r = await probar(path, () => getDelay20(path, { group: 'ACCIONES', operativeform: 'CONTADO', subgroup: 'LIDER', page: 0 }));
    if (r) console.log(`    ${r.length} filas`);
  }

  console.log('\n6. Futuros, opciones y préstamos: operativeform o group');
  const casos: [string, Record<string, string>][] = [
    ['futures', { operativeform: 'FUTMONEDAS' }],
    ['futures', { group: 'FUTMONEDAS' }],
    ['options', { operativeform: 'OPCIONES', currency: 'ARS' }],
    ['options', { group: 'OPCIONES', currency: 'ARS' }],
    ['loans', { operativeform: 'PRESTAMOSV', currency: 'ARS' }],
    ['loans', { group: 'PRESTAMOSV', currency: 'ARS' }],
    ['collateralized_repos', { group: 'CAUCIONES' }],
  ];
  for (const [path, params] of casos) {
    const r = await probar(`${path} ${JSON.stringify(params)}`, () => getDelay20(path, params));
    if (r) console.log(`    ${r.length} filas`);
  }
}

main().catch((err) => {
  console.error(corto(err));
  process.exit(1);
});
