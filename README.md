# Japonea.me-Learning

Aplicación web mobile-first para aprender japonés con flashcards por lotes semanales.

## Estructura

```text
.
├── .github/workflows/deploy.yml
├── app.js
├── data/batches.json
├── index.html
└── styles.css
```

## Ejecutar localmente

Al ser un sitio estático, abre `index.html` en el navegador o usa un servidor local:

```bash
python -m http.server 8080
```

Luego visita `http://localhost:8080`.

## Datos y escalabilidad

- El vocabulario vive en `data/batches.json`.
- Para agregar más semanas/lotes, añade un nuevo objeto dentro de `batches`.
- No hace falta modificar la lógica principal para agregar nuevos lotes/categorías.

## Deploy (GitHub Pages)

El workflow `.github/workflows/deploy.yml` despliega automáticamente a GitHub Pages en cada push a `main`.
