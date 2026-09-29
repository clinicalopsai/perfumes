// Descarga la foto de cada perfume desde el servidor de imágenes de Fragrantica (fimgs.net).
//
// Uso:  node scripts/descargar-fotos.mjs            (solo descarga las que faltan)
//       node scripts/descargar-fotos.mjs --forzar   (vuelve a descargar todas)
//
// Si un perfume trae "fotoUrl" en datos/perfumes.json, se intenta esa URL primero.
// Si ya existe fotos/<foto>.(jpg|png|webp|avif), se respeta (sirve para poner fotos a mano).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_FOTOS = path.join(RAIZ, 'fotos');
const EXTENSIONES = ['jpg', 'png', 'webp', 'avif'];
const AGENTE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const forzar = process.argv.includes('--forzar');
const { perfumes } = JSON.parse(readFileSync(path.join(RAIZ, 'datos/perfumes.json'), 'utf8'));
mkdirSync(DIR_FOTOS, { recursive: true });

// Orden de preferencia: la foto principal de la ficha (375x500) y luego variantes del mismo archivo.
function urlsCandidatas(perfume) {
  const id = perfume.fragrantica.id;
  return [
    perfume.fotoUrl,
    `https://fimgs.net/mdimg/perfume/375x500.${id}.jpg`,
    `https://fimgs.net/mdimg/perfume-thumbs/375x500.${id}.jpg`,
    `https://fimgs.net/mdimg/perfume-thumbs/375x500.${id}.webp`,
    `https://fimgs.net/mdimg/perfume/o.${id}.jpg`,
    `https://fimgs.net/mdimg/perfume/m.${id}.jpg`,
  ].filter(Boolean);
}

function tipoDeImagen(buf) {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 4, 12).startsWith('ftypavi')) return 'avif';
  return null;
}

function fotoExistente(base) {
  return EXTENSIONES.map((ext) => path.join(DIR_FOTOS, `${base}.${ext}`)).find((f) => existsSync(f));
}

function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// curl respeta el proxy del sistema (HTTPS_PROXY) y existe en Linux, macOS y Windows 10+.
function descargar(url, destino) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const codigo = execFileSync(
        'curl',
        ['-sS', '-L', '--max-time', '40', '-A', AGENTE, '-e', 'https://www.fragrantica.com/', '-o', destino, '-w', '%{http_code}', url],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim();
      // Una respuesta del servidor distinta de 200 (403, 404...) no se arregla reintentando.
      return codigo === '200' ? { ok: true } : { ok: false, detalle: `el servidor respondió HTTP ${codigo}` };
    } catch (error) {
      const detalle = String(error.stderr || error.message).trim().split('\n').pop();
      // Si la red (proxy o firewall) no deja llegar al servidor, reintentar tampoco sirve.
      if (/CONNECT tunnel failed|Could not resolve host|Failed to connect/i.test(detalle)) {
        return { ok: false, detalle, sinAcceso: true };
      }
      if (intento === 3) return { ok: false, detalle };
      esperar(2000 * intento);
    }
  }
  return { ok: false, detalle: 'sin respuesta' };
}

const fotosUnicas = new Map(); // un mismo archivo puede servir a dos presentaciones (p. ej. cofre y caja)
for (const perfume of perfumes) {
  if (!fotosUnicas.has(perfume.foto)) fotosUnicas.set(perfume.foto, perfume);
}

const faltantes = [];
const hostsSinAcceso = new Set();
let descargadas = 0;
let existentes = 0;

for (const [base, perfume] of fotosUnicas) {
  const actual = fotoExistente(base);
  if (actual && !forzar) {
    existentes++;
    continue;
  }

  const temporal = path.join(DIR_FOTOS, `.${base}.descarga`);
  let guardada = null;
  const errores = [];
  for (const url of urlsCandidatas(perfume)) {
    const host = new URL(url).host;
    if (hostsSinAcceso.has(host)) {
      errores.push(`${url} -> sin acceso a ${host}`);
      continue;
    }
    const resultado = descargar(url, temporal);
    if (resultado.sinAcceso) hostsSinAcceso.add(host);
    if (!resultado.ok) {
      errores.push(`${url} -> ${resultado.detalle}`);
      continue;
    }
    const buf = readFileSync(temporal);
    const tipo = tipoDeImagen(buf);
    if (!tipo || buf.length < 3000) {
      errores.push(`${url} -> no es una imagen válida (${buf.length} bytes)`);
      continue;
    }
    for (const ext of EXTENSIONES) rmSync(path.join(DIR_FOTOS, `${base}.${ext}`), { force: true });
    guardada = path.join(DIR_FOTOS, `${base}.${tipo}`);
    renameSync(temporal, guardada);
    console.log(`✓ ${perfume.marca} — ${perfume.nombre}: ${path.basename(guardada)} (${Math.round(buf.length / 1024)} KB) desde ${url}`);
    break;
  }
  rmSync(temporal, { force: true });

  if (guardada) {
    descargadas++;
  } else {
    faltantes.push(perfume);
    console.log(`✗ ${perfume.marca} — ${perfume.nombre}: no se pudo descargar`);
    for (const e of errores) if (!/sin acceso a/.test(e)) console.log(`    ${e}`);
  }
}

console.log(
  `\nFotos: ${descargadas} descargadas, ${existentes} ya estaban, ${faltantes.length} faltan (de ${fotosUnicas.size} archivos para ${perfumes.length} productos).`,
);
if (hostsSinAcceso.size) {
  console.log(`Sin acceso a: ${[...hostsSinAcceso].join(', ')}. La red de este equipo bloquea esos servidores.`);
}
if (faltantes.length) {
  console.log('Revisa el acceso a fimgs.net o agrega "fotoUrl" en datos/perfumes.json para las que faltan.');
  process.exitCode = 1;
}
