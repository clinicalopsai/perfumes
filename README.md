# Catálogo de perfumes · Kevin Rivera

Catálogo sencillo en español, sin precios, con la foto de cada perfume (tomada de Fragrantica) y los datos de contacto de Kevin Rivera: WhatsApp y teléfono 304 334 9782.

- **Para enviar a los clientes:** `catalogo/Catalogo-Perfumes-Kevin-Rivera.pdf`
- **Estado y revisión perfume por perfume:** [`CHECKLIST.md`](CHECKLIST.md)

## Contenido

44 perfumes de 14 marcas: Victoria's Secret (17), Giorgio Armani (4), Tous (3), Carolina Herrera (3), Bvlgari (3), Jean Paul Gaultier (2), Paco Rabanne (2), Versace (2), Tiziana Terenzi (2), Lattafa (2), Valentino (1), Armaf (1), Lancôme (1) y Gucci (1).

Cada tarjeta lleva foto, marca, nombre, dama/caballero/unisex, familia olfativa, notas principales y, cuando aplica, la presentación (cofre de lujo, cofre, caja sencilla, 200 ml). La portada y la contraportada tienen un código QR que abre WhatsApp, y el número en el pie de cada página también es un enlace.

## Cómo se genera

Necesita Node 18+ y Python 3 con `pymupdf` y `pillow` (y `opencv-python-headless` para comprobar el QR), además de acceso a `fimgs.net` (el servidor de fotos de Fragrantica).

```bash
npm install                  # instala playwright y qrcode
npx playwright install chromium   # solo si el equipo no tiene Chromium para Playwright
npm run catalogo             # descarga fotos, genera el PDF y corre la verificación
```

Los pasos también se pueden correr por separado:

| Comando | Qué hace |
|---|---|
| `npm run fotos` | Descarga a `fotos/` la foto de cada perfume desde Fragrantica (solo las que falten; `--forzar` las baja todas otra vez). |
| `npm run pdf` | Genera `catalogo/Catalogo-Perfumes-Kevin-Rivera.pdf` y `catalogo/catalogo.html`. |
| `npm run verificar` | Revisa que estén los 44 perfumes con foto, contacto, enlaces y sin precios, y escribe `CHECKLIST.md`. |

## Cambiar algo

- **Datos de un perfume o del contacto:** `datos/perfumes.json`. Cada perfume guarda su ficha de Fragrantica (`fragrantica.id`); si la edición no es la correcta, basta con cambiar ese id (en `alternativas` están las otras ediciones encontradas) y volver a correr `npm run fotos -- --forzar` y `npm run pdf`.
- **Usar una foto propia:** guárdala como `fotos/<foto>.jpg` (el nombre está en el campo `foto` del perfume) y corre `npm run pdf`.
- **Revisión a ojo:** `datos/revision-fotos.json` anota, perfume por perfume, que la foto se revisó y corresponde al frasco.

Fotos: Fragrantica. Tipografías: Cormorant Garamond y Montserrat (SIL Open Font License).
