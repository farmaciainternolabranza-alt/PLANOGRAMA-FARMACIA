# Planograma digital de farmacia

Sitio estático para GitHub Pages con:

- Buscador de productos por texto libre.
- Resultados con `producto`, `mueble`, `id_mueble` y `ubicacion`.
- Visualización por mueble usando polígonos normalizados (`poly_norm`).
- Fallback textual cuando falta imagen o polígono.
- Editor local de polígonos en navegador (`admin.html`).
- Generación automática de `data/productos.json` desde Excel con GitHub Actions.

## Estructura

```text
/
├─ index.html
├─ app.js
├─ styles.css
├─ admin.html
├─ admin.js
├─ data/
│  ├─ productos.json
│  ├─ muebles.json
│  ├─ muebles.schema.json
│  └─ reporte.json
├─ tools/
│  ├─ generar_productos_json.py
│  └─ validar_muebles.py
├─ assets/
│  ├─ images/
│  └─ reference/
└─ .github/workflows/
   └─ actualizar-productos.yml
```

## Uso local rápido

Desde la carpeta raíz:

```bash
python -m http.server 8000
```

Luego abrir:

```text
http://localhost:8000
```

No se recomienda abrir `index.html` con doble clic porque el navegador puede bloquear `fetch()` de los JSON locales.

## Subir Excel

1. Subir el Excel a la raíz del repositorio. Debe tener una hoja llamada `ubicacion`.
2. La hoja debe incluir columnas:
   - `Producto`
   - `MUEBLE`
   - `ID_MUEBLE`
   - `UBICACION`
3. Al hacer push, GitHub Actions ejecuta:

```bash
python tools/generar_productos_json.py
python tools/validar_muebles.py
```

4. Si cambia `data/productos.json` o reportes, el workflow los commitea automáticamente.

## Publicar en GitHub Pages

1. Crear repositorio en GitHub.
2. Subir todos estos archivos.
3. Entrar a **Settings → Pages**.
4. En **Build and deployment**, elegir:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/root`
5. Guardar.
6. GitHub entregará una URL tipo:

```text
https://usuario.github.io/nombre-repo/
```

## Usar editor de zonas

1. Abrir `admin.html` desde GitHub Pages o servidor local.
2. Seleccionar `Mueble / cara`.
3. Seleccionar `Ubicación`.
4. Cargar una foto local para dibujar, o usar la imagen guardada en `assets/images`.
5. Pulsar **Nuevo polígono**.
6. Hacer clic en los vértices de la zona.
7. Cerrar con el botón **Cerrar polígono** o haciendo clic cerca del primer punto.
8. Arrastrar puntos para corregir.
9. Pulsar **Exportar muebles.json**.
10. Reemplazar `data/muebles.json` en el repositorio.

## Subir fotos después

1. Guardar la foto en `assets/images/`.
2. En `admin.html`, escribir esa ruta en “Ruta de imagen en repositorio”.
   Ejemplo:

```text
assets/images/M04B_original.png
```

3. Dibujar o ajustar zonas.
4. Exportar y subir `data/muebles.json`.

## Validación

- `admin.html` valida qué ubicaciones de `data/productos.json` no tienen polígono.
- `tools/validar_muebles.py` genera `data/reporte.json`.
- La UI pública nunca se rompe: si falta una zona, muestra texto de respaldo.

## Nota de privacidad

Las fotos incluidas son útiles para dejar el sistema listo, pero si el repositorio será público se recomienda revisar que no aparezcan personas, documentos visibles u otros elementos sensibles.
