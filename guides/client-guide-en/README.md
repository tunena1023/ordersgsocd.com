# Guía del portal de clientes (Orders), en inglés

Guía para los clientes de orders.gsocd.com. **Versión móvil lista.** La versión desktop sigue pendiente.

| Archivo | Para qué |
|---|---|
| `GS-Order-Portal-Guide-Mobile.pdf` | Para mandar por email (45 páginas verticales, un paso por página). |
| `images-mobile/Mobile-01.png … Mobile-45.png` | Las mismas 45 imágenes en 1080×1920 (9:16), en orden, para armar el video. |
| `source/` | Todo lo necesario para cambiarla y volver a sacarla. |

## Reglas del dueño para esta guía
- Es para el **cliente**: nada interno ni de más (sin promo code escondido, precios, tiempos estimados, "Your usual order", nombres de supervisores ni términos de la oficina).
- Nada de guardar cosas en el teléfono ni de ubicación.
- Todo en inglés.

## Cómo cambiar el texto y volver a sacar las imágenes y el PDF
En `source/` (necesita Node 22 y Playwright con Chromium):
```
npm install
node render-mobile.js                                   # escribe ../images-mobile/Mobile-NN.png
node framespdf.js ../images-mobile ../GS-Order-Portal-Guide-Mobile.pdf
```
El guion (título y texto de cada paso, y qué captura usa) está en `frames-mobile.js`. Las capturas que usa están en `source/shotsj/`.

## Cómo volver a sacar las capturas (si cambia la app)
Las capturas son del portal REAL (los HTML de este repo, tal cual) con datos de ejemplo. No tocan SharePoint.
1. `node mock-orders.js`: sirve la raíz de este repo en http://localhost:8788 y contesta `/api/*` con un cliente de ejemplo ("Maple Court Apartments", GS-1042).
2. `node cap-m1.js` (entrar y nueva orden), `node cap-m2.js` (Processing y cambios) y `node cap-m3.js` (Templates, History, Gallery, Recurring, Profile, Contact). Guardan en `shots/` a tamaño de teléfono (390 px, 3x).
3. `node tojpg.js`: pasa `shots/` a `shotsj/`.

## Cosas de la app que se vieron al hacerla (no se arreglaron)
- Request a change: si el cliente solo cambia fechas y no escribe descripción, el servidor lo rechaza (`request-change.js`). La guía le dice que describa el cambio.
- A 390 px, la tarjeta con "Office access needed" corta el estado. La orden de ejemplo no lleva esa etiqueta.
- La lista de órdenes nunca muestra "Scheduled", porque `get-orders` no manda Supervisor/DispatchDate.
