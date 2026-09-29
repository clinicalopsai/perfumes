#!/usr/bin/env python3
"""Verifica que el catálogo esté completo y listo para enviar, y escribe CHECKLIST.md.

Uso:  python3 scripts/verificar.py

Necesita pymupdf y pillow (pip install pymupdf pillow). Si opencv-python-headless
está instalado, además lee el código QR del PDF y confirma que abre el WhatsApp correcto.
Sale con código 1 si algo no está listo.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pymupdf
from PIL import Image, ImageStat

RAIZ = Path(__file__).resolve().parent.parent
DATOS = json.loads((RAIZ / "datos" / "perfumes.json").read_text(encoding="utf-8"))
PDF = RAIZ / "catalogo" / "Catalogo-Perfumes-Kevin-Rivera.pdf"
REPORTE = RAIZ / "catalogo" / "reporte-generacion.json"
REVISION = RAIZ / "datos" / "revision-fotos.json"
CHECKLIST = RAIZ / "CHECKLIST.md"
EXTENSIONES = ("jpg", "png", "webp", "avif")
POR_PAGINA = 9

# La lista tal como la envió Kevin: así se comprueba que no falte ni sobre ningún producto.
LISTA_ORIGINAL = {
    "Victoria's Secret": [
        "Bombshell Gold", "Bombshell Intense", "Bombshell Seduction", "Bombshell Paradise",
        "Bombshell Night", "Bombshell Holiday", "Very Sexy Night (cofre de lujo)",
        "Very Sexy Sea (cofre de lujo)", "Very Sexy Oasis (cofre de lujo)", "Very Sexy Now (flores)",
        "Very Sexy Now (blanca)", "Tease Candy Noir", "Tease Eau de Parfum", "Tease Crème Cloud",
        "Angel", "Angel Gold", "Dark Angel",
    ],
    "Giorgio Armani": ["Sì (negra)", "Sì Passione Éclat", "Sì Fiori", "Acqua di Giò Profumo 200 ml"],
    "Tous": ["LoveMe (rosado)", "LoveMe Emerald", "LoveMe Onyx"],
    "Carolina Herrera": ["Good Girl Velvet Fatale", "212 VIP Rosé Smiley", "212 VIP Rosé Elixir"],
    "Bvlgari": ["Rose Goldea", "Goldea (dorada)", "Splendida Jasmin Noir"],
    "Jean Paul Gaultier": ["Scandal Absolu dama", "Scandal Absolu caballero"],
    "Paco Rabanne": ["Lady Million Gold (dama)", "1 Million Gold (hombre)"],
    "Versace": ["Eros Pour Femme (cofre)", "Eros Pour Femme (caja sencilla)"],
    "Tiziana Terenzi": ["Kirké", "Cassiopea"],
    "Lattafa": ["Éclaire", "Emeer (caja sencilla)"],
    "Valentino": ["Donna Gold"],
    "Armaf": ["Club de Nuit Milestone"],
    "Lancôme": ["La Vie Est Belle L'Extrait"],
    "Gucci": ["Guilty (dama)"],
}

PRECIOS = re.compile(r"\$|\bcop\b|\busd\b|precio|\b\d{1,3}(?:[.,]\d{3})+\b")


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKC", texto).replace("’", "'")
    return re.sub(r"\s+", " ", texto).strip().casefold()


def archivo_foto(perfume: dict) -> Path | None:
    for ext in EXTENSIONES:
        archivo = RAIZ / "fotos" / f"{perfume['foto']}.{ext}"
        if archivo.exists():
            return archivo
    return None


def analizar_foto(archivo: Path) -> dict:
    with Image.open(archivo) as img:
        img.load()
        ancho, alto = img.size
        rgb = img.convert("RGB")
    gris = rgb.convert("L")
    histograma = gris.histogram()
    return {
        "archivo": archivo.name,
        "ancho": ancho,
        "alto": alto,
        "sha256": hashlib.sha256(archivo.read_bytes()).hexdigest(),
        "miniatura": rgb.resize((16, 16), Image.Resampling.BILINEAR).tobytes(),
        "desviacion": ImageStat.Stat(gris).stddev[0],
        "no_blanco": sum(histograma[:235]) / (ancho * alto),
    }


def diferencia(a: bytes, b: bytes) -> float:
    """Diferencia media por canal (0-255) entre dos miniaturas: ~0 si es la misma foto re-guardada."""
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def leer_qr(pagina: pymupdf.Page) -> str | None:
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None
    pix = pagina.get_pixmap(dpi=300)
    imagen = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    texto, _, _ = cv2.QRCodeDetector().detectAndDecode(imagen[:, :, :3].copy())
    return texto or None


def main() -> int:
    contacto = DATOS["contacto"]
    perfumes = DATOS["perfumes"]
    url_whatsapp = f"https://wa.me/{contacto['whatsapp']}"
    revision = json.loads(REVISION.read_text(encoding="utf-8")) if REVISION.exists() else {}
    items: list[tuple[bool, str]] = []  # (ok, texto) para el resumen
    problemas: list[str] = []

    def comprobar(ok: bool, texto: str, detalle: str | None = None) -> bool:
        items.append((ok, texto))
        if not ok and detalle:
            problemas.append(detalle)
        return ok

    # 1. Que estén todos los productos de la lista, ni más ni menos.
    por_marca = {marca: [p["comoEnLista"] for p in perfumes if p["marca"] == marca] for marca in LISTA_ORIGINAL}
    faltan = [f"{m}: {n}" for m, lista in LISTA_ORIGINAL.items() for n in lista if n not in por_marca[m]]
    sobran = [f"{p['marca']}: {p['comoEnLista']}" for p in perfumes if p["comoEnLista"] not in LISTA_ORIGINAL.get(p["marca"], [])]
    repetidos = [n for n, c in Counter((p["marca"], p["comoEnLista"]) for p in perfumes).items() if c > 1]
    total_lista = sum(len(v) for v in LISTA_ORIGINAL.values())
    conteo = ", ".join(f"{m} {len(por_marca[m])}/{len(v)}" for m, v in LISTA_ORIGINAL.items())
    comprobar(
        not faltan and not sobran and not repetidos and len(perfumes) == total_lista,
        f"Están los {total_lista} perfumes de tu lista ({conteo})",
        f"Lista incompleta. Faltan: {faltan or '-'}; sobran: {sobran or '-'}; repetidos: {repetidos or '-'}",
    )

    # 2. Fotos: que existan, abran, tengan buena resolución, no estén vacías ni repetidas.
    fotos: dict[str, dict] = {}
    estado_foto: dict[str, str] = {}
    for p in perfumes:
        archivo = archivo_foto(p)
        if not archivo:
            estado_foto[p["slug"]] = "❌ falta la foto"
            continue
        try:
            datos_foto = fotos.get(p["foto"]) or analizar_foto(archivo)
        except Exception as error:  # archivo dañado o formato no soportado
            estado_foto[p["slug"]] = f"❌ no abre ({error.__class__.__name__})"
            continue
        fotos[p["foto"]] = datos_foto
        fallas = []
        if min(datos_foto["ancho"], datos_foto["alto"]) < 300:
            fallas.append(f"resolución baja {datos_foto['ancho']}×{datos_foto['alto']}")
        if datos_foto["desviacion"] < 8 or datos_foto["no_blanco"] < 0.02:
            fallas.append("parece vacía")
        estado_foto[p["slug"]] = ("❌ " + ", ".join(fallas)) if fallas else f"✅ {datos_foto['ancho']}×{datos_foto['alto']}"

    # Dos perfumes distintos (distinta ficha de Fragrantica) no deberían tener la misma foto.
    ids_por_foto = {p["foto"]: p["fragrantica"]["id"] for p in perfumes}
    nombres_por_foto = {p["foto"]: f"{p['marca']} {p['nombre']}" for p in perfumes}
    claves = sorted(fotos)
    for i, a in enumerate(claves):
        for b in claves[i + 1:]:
            if ids_por_foto[a] == ids_por_foto[b]:
                continue
            igual = fotos[a]["sha256"] == fotos[b]["sha256"]
            casi = diferencia(fotos[a]["miniatura"], fotos[b]["miniatura"]) < 1.0
            if igual or casi:
                for p in perfumes:
                    if p["foto"] in (a, b):
                        estado_foto[p["slug"]] = "❌ foto repetida con otro perfume"
                problemas.append(f"Fotos {'idénticas' if igual else 'casi idénticas'}: {nombres_por_foto[a]} y {nombres_por_foto[b]}")

    con_foto = sum(1 for p in perfumes if estado_foto[p["slug"]].startswith("✅"))
    sin_archivo = [p for p in perfumes if estado_foto[p["slug"]] == "❌ falta la foto"]
    if len(sin_archivo) > 5:
        problemas.append(f"Faltan las fotos de {len(sin_archivo)} perfumes: hay que descargarlas con `npm run fotos`")
    for p in perfumes:
        if not estado_foto[p["slug"]].startswith("✅") and not (len(sin_archivo) > 5 and p in sin_archivo):
            problemas.append(f"Foto de {p['marca']} {p['nombre']} ({p['comoEnLista']}): {estado_foto[p['slug']][2:]}")
    comprobar(
        con_foto == len(perfumes),
        f"{con_foto}/{len(perfumes)} perfumes con foto (abre bien, buena resolución, sin fotos vacías ni repetidas)",
    )
    revisadas = sum(1 for p in perfumes if revision.get(p["slug"]))
    comprobar(
        revisadas == len(perfumes),
        f"{revisadas}/{len(perfumes)} fotos revisadas una por una: el frasco corresponde al perfume",
        None if revisadas == len(perfumes) else f"Faltan {len(perfumes) - revisadas} fotos por revisar a ojo (datos/revision-fotos.json)",
    )

    # 3. El PDF generado.
    reporte = json.loads(REPORTE.read_text(encoding="utf-8")) if REPORTE.exists() else None
    paginas_esperadas = 2 + math.ceil(len(perfumes) / POR_PAGINA)
    if not PDF.exists() or reporte is None:
        comprobar(False, "Existe el PDF del catálogo", "No se encontró el PDF: corre primero node scripts/generar-catalogo.mjs")
        doc = None
    else:
        doc = pymupdf.open(PDF)
        tamano_mb = PDF.stat().st_size / 1_048_576
        comprobar(
            doc.page_count == paginas_esperadas,
            f"PDF de {doc.page_count} páginas: portada, {doc.page_count - 2} de perfumes y contraportada",
            f"El PDF tiene {doc.page_count} páginas y se esperaban {paginas_esperadas}",
        )
        textos = [normalizar(pagina.get_text()) for pagina in doc]

        no_aparecen = []
        for i, p in enumerate(perfumes):
            texto = textos[1 + i // POR_PAGINA] if 1 + i // POR_PAGINA < len(textos) else ""
            if normalizar(p["nombre"]) not in texto or normalizar(p["marca"]) not in texto:
                no_aparecen.append(f"{p['marca']} {p['nombre']}")
        comprobar(
            not no_aparecen,
            "Cada perfume aparece en el PDF con su marca y su nombre",
            f"No aparecen en el PDF: {', '.join(no_aparecen)}",
        )

        cargadas = [t for t in reporte["tarjetas"] if t.get("foto") and t["foto"]["cargada"]]
        comprobar(
            len(cargadas) == len(perfumes),
            f"Las {len(perfumes)} fotos quedaron dentro del PDF",
            f"Solo {len(cargadas)} de {len(perfumes)} fotos quedaron dentro del PDF",
        )
        imagenes_pdf = sum(len(pagina.get_images()) for pagina in doc)
        fotos_por_pagina = sum(
            len({p["foto"] for p in perfumes[i:i + POR_PAGINA]}) for i in range(0, len(perfumes), POR_PAGINA)
        )
        if con_foto == len(perfumes):
            usos = Counter(p["foto"] for p in perfumes)
            compartidas = sum(1 for p in perfumes if usos[p["foto"]] > 1)
            nota = f"; {compartidas} presentaciones de la misma fragancia comparten foto" if compartidas else ""
            comprobar(
                imagenes_pdf >= fotos_por_pagina,
                f"Las fotos van incrustadas en el archivo: {imagenes_pdf} imágenes{nota}",
                f"El PDF solo trae {imagenes_pdf} imágenes y se esperaban {fotos_por_pagina}",
            )

        sin_contacto = [
            str(n + 1)
            for n, texto in enumerate(textos)
            if normalizar(contacto["nombre"]) not in texto or normalizar(contacto["telefonoVisible"]) not in texto
        ]
        comprobar(
            not sin_contacto,
            f"Tus datos en todas las páginas: {contacto['nombre']} · WhatsApp y teléfono {contacto['telefonoVisible']}",
            f"Faltan los datos de contacto en las páginas {', '.join(sin_contacto)}",
        )
        sin_enlace = [
            str(n + 1)
            for n, pagina in enumerate(doc)
            if not any(str(e.get("uri", "")).startswith(url_whatsapp) for e in pagina.get_links())
        ]
        comprobar(
            not sin_enlace,
            f"Tocar tu número en cualquier página abre WhatsApp ({url_whatsapp})",
            f"Sin enlace a WhatsApp en las páginas {', '.join(sin_enlace)}",
        )
        qr = leer_qr(doc[0])
        if qr is not None:
            comprobar(
                qr.startswith(url_whatsapp),
                "El código QR de la portada abre tu WhatsApp",
                f"El QR de la portada abre {qr!r} en vez de {url_whatsapp}",
            )

        con_precios = [str(n + 1) for n, texto in enumerate(textos) if PRECIOS.search(texto)]
        comprobar(
            not con_precios,
            "Sin precios (no hay signos $, la palabra \"precio\" ni cifras de dinero)",
            f"Posibles precios en las páginas {', '.join(con_precios)}",
        )
        desbordes = [t["slug"] for t in reporte["tarjetas"] if t["textoDesborda"]]
        comprobar(
            not desbordes and reporte["paginasDesbordadas"] == 0,
            "Todos los textos caben en sus tarjetas (nada cortado)",
            f"Textos cortados en: {', '.join(desbordes) or 'páginas'}",
        )
        comprobar(
            len(reporte.get("fuentesCargadas", [])) >= 3,
            "Tipografías incrustadas (se ve igual en cualquier celular o computador)",
            "No cargaron todas las tipografías",
        )
        comprobar(tamano_mb < 16, f"Tamaño {tamano_mb:.1f} MB: se envía sin problema por WhatsApp o correo")

    listo = all(ok for ok, _ in items)
    escribir_checklist(listo, items, problemas, estado_foto, revision, doc)

    print(("LISTO PARA ENVIAR" if listo else "TODAVÍA NO ESTÁ LISTO") + f" — ver {CHECKLIST.relative_to(RAIZ)}")
    for ok, texto in items:
        print(f"  [{'x' if ok else ' '}] {texto}")
    for problema in problemas:
        print(f"  ! {problema}")
    return 0 if listo else 1


def escribir_checklist(listo, items, problemas, estado_foto, revision, doc) -> None:
    perfumes = DATOS["perfumes"]
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lineas = [
        "# Checklist del catálogo de perfumes",
        "",
        f"**Estado: {'✅ LISTO PARA ENVIAR A CLIENTES' if listo else '⏳ TODAVÍA NO ESTÁ LISTO'}**",
        "",
        f"- Archivo para enviar: `catalogo/{PDF.name}`" + (f" ({doc.page_count} páginas)" if doc else ""),
        "- Versión web (misma información): `catalogo/catalogo.html`",
        f"- Última verificación: {ahora} con `python3 scripts/verificar.py`",
        "",
        "## Verificación",
        "",
    ]
    lineas += [f"- [{'x' if ok else ' '}] {texto}" for ok, texto in items]
    if problemas:
        lineas += ["", "### Pendientes", ""] + [f"- {p}" for p in problemas]

    lineas += [
        "",
        "## Perfume por perfume",
        "",
        "| # | Marca | En tu lista | En el catálogo | Foto | Revisión a ojo | Ficha en Fragrantica |",
        "|---|---|---|---|---|---|---|",
    ]
    for n, p in enumerate(perfumes, 1):
        nombre = p["nombre"] + (f" — {p['subtitulo']}" if p.get("subtitulo") else "")
        if p.get("presentacion"):
            nombre += f" ({p['presentacion'].lower()})"
        ficha = f"[{p['fragrantica']['nombre']}]({p['fragrantica']['url']})"
        visto = f"✅ {revision[p['slug']]}" if revision.get(p["slug"]) else "⏳ pendiente"
        lineas.append(
            f"| {n} | {p['marca']} | {p['comoEnLista']} | {nombre} | {estado_foto[p['slug']]} | {visto} | {ficha} |"
        )

    confirmar = [p for p in perfumes if p.get("confirmar")]
    if confirmar:
        lineas += [
            "",
            "## Para confirmar (opcional)",
            "",
            "Estos productos tienen más de una edición. Si tu frasco no se parece a la foto, avísame y la cambio:",
            "",
        ]
        lineas += [f"- **{p['marca']} — {p['comoEnLista']}:** {p['confirmar']}" for p in confirmar]

    CHECKLIST.write_text("\n".join(lineas) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
