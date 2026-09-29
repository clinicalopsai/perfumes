// Genera el catálogo (HTML autocontenido + PDF A4) a partir de datos/perfumes.json y las fotos en fotos/.
//
// Uso:  node scripts/generar-catalogo.mjs
//
// Salida en catalogo/:
//   Catalogo-Perfumes-Kevin-Rivera.pdf   el que se envía a los clientes
//   catalogo.html                        la misma versión para abrir en el navegador
//   reporte-generacion.json              lo usa scripts/verificar.py

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import QRCode from 'qrcode';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_SALIDA = path.join(RAIZ, 'catalogo');
const ARCHIVO_PDF = path.join(DIR_SALIDA, 'Catalogo-Perfumes-Kevin-Rivera.pdf');
const ARCHIVO_HTML = path.join(DIR_SALIDA, 'catalogo.html');
const ARCHIVO_REPORTE = path.join(DIR_SALIDA, 'reporte-generacion.json');
const POR_PAGINA = 9; // cuadrícula de 3 x 3
const TIPOS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

const { contacto, marcas, perfumes } = JSON.parse(readFileSync(path.join(RAIZ, 'datos/perfumes.json'), 'utf8'));

const esc = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const dataUri = (archivo, tipo) => `data:${tipo};base64,${readFileSync(archivo).toString('base64')}`;

function fotoDe(perfume) {
  for (const [ext, tipo] of Object.entries(TIPOS)) {
    const archivo = path.join(RAIZ, 'fotos', `${perfume.foto}.${ext}`);
    if (existsSync(archivo)) return dataUri(archivo, tipo);
  }
  return null;
}

const urlWhatsapp = `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(contacto.mensajeWhatsapp)}`;
const urlTelefono = `tel:+${contacto.whatsapp}`;
const qr = await QRCode.toString(urlWhatsapp, {
  type: 'svg',
  margin: 0,
  errorCorrectionLevel: 'M',
  color: { dark: '#1d1b19', light: '#ffffff' },
});

function tarjeta(perfume) {
  const foto = fotoDe(perfume);
  const titulo = `${perfume.marca} ${perfume.nombre}${perfume.subtitulo ? ` ${perfume.subtitulo}` : ''}`;
  const meta = [perfume.genero, perfume.familia].filter(Boolean).join(' · ');
  return `
      <article class="tarjeta" data-slug="${esc(perfume.slug)}">
        <div class="foto">
          ${foto ? `<img src="${foto}" alt="${esc(titulo)}">` : '<div class="sin-foto">Foto pendiente</div>'}
          ${perfume.presentacion ? `<span class="sello">${esc(perfume.presentacion)}</span>` : ''}
        </div>
        <div class="texto">
          <p class="marca">${esc(perfume.marca)}</p>
          <h3 class="nombre">${esc(perfume.nombre)}</h3>
          ${perfume.subtitulo ? `<p class="subtitulo">${esc(perfume.subtitulo)}</p>` : ''}
          <p class="meta">${esc(meta)}</p>
          <p class="notas">${perfume.notas.map(esc).join(' · ')}</p>
        </div>
      </article>`;
}

// Reparte las marcas en líneas completas para que ningún separador quede suelto al final de una línea.
function lineasDeMarcas(lista, maximo = 48) {
  const lineas = [[]];
  for (const marca of lista) {
    const actual = lineas.at(-1);
    const largo = [...actual, marca].join(' · ').length;
    if (actual.length && largo > maximo) lineas.push([marca]);
    else actual.push(marca);
  }
  return lineas;
}

const grupos = [];
for (let i = 0; i < perfumes.length; i += POR_PAGINA) grupos.push(perfumes.slice(i, i + POR_PAGINA));
const totalPaginas = grupos.length + 2;

const pie = (numero) => `
    <footer class="pie">
      <a href="${esc(urlWhatsapp)}"><strong>${esc(contacto.nombre)}</strong> · WhatsApp y teléfono: <strong>${esc(contacto.telefonoVisible)}</strong></a>
      <span>${numero} / ${totalPaginas}</span>
    </footer>`;

const paginasProductos = grupos
  .map((grupo, i) => {
    const marcasPagina = [...new Set(grupo.map((p) => p.marca))];
    return `
  <section class="pagina productos">
    <header class="encabezado">${marcasPagina.map(esc).join(' · ')}</header>
    <div class="cuadricula">${grupo.map(tarjeta).join('')}
    </div>${pie(i + 2)}
  </section>`;
  })
  .join('\n');

const bloqueContacto = (clase) => `
      <div class="contacto ${clase}">
        <div class="contacto-texto">
          <p class="contacto-nombre">${esc(contacto.nombre)}</p>
          <p class="contacto-etiqueta">WhatsApp y teléfono</p>
          <p class="contacto-numero"><a href="${esc(urlWhatsapp)}">${esc(contacto.telefonoVisible)}</a></p>
          <p class="contacto-acciones"><a href="${esc(urlWhatsapp)}">Escribir por WhatsApp</a> · <a href="${esc(urlTelefono)}">Llamar</a></p>
        </div>
        <a class="qr" href="${esc(urlWhatsapp)}" aria-label="Abrir WhatsApp">${qr}</a>
      </div>`;

const fuente = (archivo) => dataUri(path.join(RAIZ, 'fuentes', archivo), 'font/woff2');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catálogo de Perfumes · ${esc(contacto.nombre)}</title>
<style>
  @font-face { font-family: "Cormorant Garamond"; src: url(${fuente('CormorantGaramond.woff2')}) format("woff2"); font-weight: 300 700; font-style: normal; }
  @font-face { font-family: "Cormorant Garamond"; src: url(${fuente('CormorantGaramond-Italic.woff2')}) format("woff2"); font-weight: 300 700; font-style: italic; }
  @font-face { font-family: "Montserrat"; src: url(${fuente('Montserrat.woff2')}) format("woff2"); font-weight: 100 900; font-style: normal; }

  @page { size: A4; margin: 0; }
  :root {
    --crema: #f8f4ee;
    --tinta: #1d1b19;
    --oro: #a8864f;
    --oro-claro: #d8c3a0;
    --gris: #6d675f;
    --borde: #e7dfd2;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: #cfc9c0; color: var(--tinta); font-family: "Montserrat", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: inherit; text-decoration: none; }
  p, h1, h2, h3 { margin: 0; }

  .pagina { width: 210mm; height: 297mm; margin: 8mm auto; position: relative; overflow: hidden; background: var(--crema); box-shadow: 0 2mm 8mm rgba(0,0,0,.18); break-after: page; }
  .pagina:last-child { break-after: auto; }
  @media print { body { background: none; } .pagina { margin: 0; box-shadow: none; } }

  /* Portada y contraportada */
  .portada, .cierre { background: var(--tinta); color: #f3ede3; }
  .marco { position: absolute; inset: 10mm; border: 0.35mm solid var(--oro); }
  .marco::after { content: ""; position: absolute; inset: 1.6mm; border: 0.2mm solid rgba(168,134,79,.55); }
  .portada-contenido { position: absolute; inset: 10mm; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 34mm 18mm 16mm; }
  .centro { margin: auto 0; display: flex; flex-direction: column; align-items: center; }
  .antetitulo { font-size: 8.5pt; font-weight: 600; letter-spacing: .5em; text-transform: uppercase; color: var(--oro-claro); padding-left: .5em; }
  .titulo, .bajada, .contacto-nombre { font-variant-ligatures: no-common-ligatures no-discretionary-ligatures; }
  .titulo { font-family: "Cormorant Garamond", serif; font-weight: 500; font-size: 76pt; line-height: .95; margin-top: 7mm; color: #fbf7f0; }
  .bajada { font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 17pt; color: var(--oro-claro); margin-top: 4mm; }
  .separador { display: flex; align-items: center; gap: 4mm; margin: 0 0 10mm; color: var(--oro); font-size: 8pt; }
  .separador::before, .separador::after { content: ""; width: 26mm; height: 0.3mm; background: var(--oro); }
  .lista-marcas { font-size: 8.3pt; font-weight: 500; letter-spacing: .2em; line-height: 2.25; text-transform: uppercase; color: #e9e1d4; max-width: 150mm; }
  .lista-marcas i { font-style: normal; color: var(--oro); padding: 0 1.6mm; }

  .contacto { width: 100%; display: flex; align-items: center; justify-content: center; gap: 9mm; padding-top: 8mm; border-top: 0.25mm solid rgba(168,134,79,.6); }
  .contacto-texto { text-align: left; }
  .contacto-nombre { font-family: "Cormorant Garamond", serif; font-size: 25pt; font-weight: 600; color: #fbf7f0; line-height: 1; }
  .contacto-etiqueta { margin-top: 2.5mm; font-size: 7.5pt; font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: var(--oro-claro); }
  .contacto-numero { margin-top: 1mm; font-family: "Cormorant Garamond", serif; font-size: 30pt; font-weight: 600; letter-spacing: .02em; color: #fbf7f0; line-height: 1.05; }
  .contacto-acciones { margin-top: 1.5mm; font-size: 7.5pt; color: #cfc4b3; }
  .contacto-acciones a { color: var(--oro-claro); font-weight: 600; }
  .qr { display: block; width: 33mm; height: 33mm; padding: 2.5mm; background: #fff; border-radius: 1.5mm; flex: none; }
  .qr svg { display: block; width: 100%; height: 100%; }
  .qr-nota { margin-top: 3mm; font-size: 7pt; color: #b9ad9b; }

  .cierre .portada-contenido { justify-content: center; padding-top: 0; }
  .cierre .titulo { font-size: 52pt; margin-top: 0; }
  .cierre .bajada { max-width: 150mm; }
  .cierre .contacto { margin-top: 16mm; padding-top: 12mm; }
  .aviso { position: absolute; left: 20mm; right: 20mm; bottom: 16mm; text-align: center; font-size: 7pt; line-height: 1.6; color: #a79b89; }

  /* Páginas de productos */
  .productos { display: flex; flex-direction: column; padding: 11mm 13mm 10mm; }
  .encabezado { padding-bottom: 2.5mm; border-bottom: 0.3mm solid var(--oro); font-size: 7pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; text-align: right; color: var(--gris); }
  .cuadricula { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 4.5mm; margin: 5mm 0 4.5mm; }
  .tarjeta { display: flex; flex-direction: column; min-height: 0; background: #fff; border: 0.25mm solid var(--borde); border-radius: 2.5mm; overflow: hidden; }
  .foto { position: relative; flex: none; height: 49mm; display: flex; align-items: center; justify-content: center; padding: 3mm 3mm 1.5mm; background: #fff; }
  .foto img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  .sin-foto { width: 70%; height: 100%; display: flex; align-items: center; justify-content: center; border: 0.3mm dashed #c9bfae; border-radius: 2mm; font-size: 7pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #a39888; background: #faf8f4; }
  .sello { position: absolute; top: 2.4mm; left: 2.4mm; padding: 0.9mm 1.9mm; border-radius: 0.9mm; background: var(--tinta); color: #f3e7d2; font-size: 5.6pt; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; }
  .texto { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0.9mm; padding: 2.6mm 3.4mm 3mm; border-top: 0.25mm solid #f1ebe1; overflow: hidden; }
  .marca { font-size: 6.2pt; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--oro); }
  .nombre { font-family: "Cormorant Garamond", serif; font-weight: 600; font-size: 14.5pt; line-height: 1.02; color: var(--tinta); font-variant-ligatures: no-common-ligatures no-discretionary-ligatures; }
  .subtitulo { margin-top: -0.4mm; font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 10.5pt; line-height: 1.05; color: var(--gris); }
  .meta { margin-top: 0.3mm; font-size: 6.6pt; font-weight: 600; color: #4b4640; }
  .notas { font-size: 6.4pt; line-height: 1.4; color: var(--gris); }

  .pie { display: flex; justify-content: space-between; align-items: center; padding-top: 2.5mm; border-top: 0.25mm solid var(--borde); font-size: 7pt; color: var(--gris); }
  .pie strong { color: var(--tinta); font-weight: 600; }
</style>
</head>
<body>
  <section class="pagina portada">
    <div class="marco"></div>
    <div class="portada-contenido">
      <p class="antetitulo">Catálogo</p>
      <h1 class="titulo">Perfumes</h1>
      <div class="centro">
      <div class="separador">◆</div>
      <div class="lista-marcas">${lineasDeMarcas(marcas)
        .map((linea) => `<p>${linea.map(esc).join('<i>·</i>')}</p>`)
        .join('')}</div>
      </div>${bloqueContacto('portada-contacto')}
      <p class="qr-nota">Escanea el código para escribirme por WhatsApp</p>
    </div>
  </section>
${paginasProductos}
  <section class="pagina cierre">
    <div class="marco"></div>
    <div class="portada-contenido">
      <h2 class="titulo">¿Te gustó alguno?</h2>
      <p class="bajada">Escríbeme por WhatsApp o llámame y te confirmo la disponibilidad.</p>${bloqueContacto('cierre-contacto')}
    </div>
    <p class="aviso">Fotos de referencia: Fragrantica. La presentación (cofre o caja) puede variar según la edición.</p>
  </section>
</body>
</html>
`;

mkdirSync(DIR_SALIDA, { recursive: true });
writeFileSync(ARCHIVO_HTML, html);

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 900, height: 1200 } });
  await pagina.emulateMedia({ media: 'print' });
  await pagina.goto(pathToFileURL(ARCHIVO_HTML).href, { waitUntil: 'load' });
  await pagina.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
  });

  const reporte = await pagina.evaluate(() => {
    const desborda = (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    return {
      paginas: document.querySelectorAll('.pagina').length,
      paginasDesbordadas: [...document.querySelectorAll('.pagina')].filter(desborda).length,
      fuentesCargadas: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.style}`),
      tarjetas: [...document.querySelectorAll('.tarjeta')].map((t) => {
        const img = t.querySelector('img');
        return {
          slug: t.dataset.slug,
          foto: img ? { cargada: img.complete && img.naturalWidth > 0, ancho: img.naturalWidth, alto: img.naturalHeight } : null,
          textoDesborda: desborda(t.querySelector('.texto')),
        };
      }),
    };
  });

  await pagina.pdf({ path: ARCHIVO_PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
  writeFileSync(ARCHIVO_REPORTE, `${JSON.stringify({ generado: new Date().toISOString(), ...reporte }, null, 2)}\n`);

  const sinFoto = reporte.tarjetas.filter((t) => !t.foto?.cargada).length;
  const desbordes = reporte.tarjetas.filter((t) => t.textoDesborda).length;
  console.log(`PDF: ${path.relative(RAIZ, ARCHIVO_PDF)} (${reporte.paginas} páginas, ${reporte.tarjetas.length} perfumes)`);
  console.log(`HTML: ${path.relative(RAIZ, ARCHIVO_HTML)}`);
  if (sinFoto) console.log(`⚠ ${sinFoto} perfumes sin foto (aparecen como "Foto pendiente").`);
  if (desbordes || reporte.paginasDesbordadas) console.log(`⚠ Texto que no cabe: ${desbordes} tarjetas, ${reporte.paginasDesbordadas} páginas.`);
} finally {
  await navegador.close();
}
