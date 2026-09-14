# NOTES.md — Cómo se trabaja en este proyecto

Este archivo existe para que cualquier chat de Claude (u otra persona) que entre
a este repo después no tenga que adivinar el proceso, ni repetir preguntas ya
resueltas, ni subir cosas sin permiso. Léelo completo antes de tocar código.

## Reglas de trabajo con el dueño del proyecto

1. **Nada se sube al repo sin permiso explícito.** El dueño dice cómo quiere
   que algo funcione (el resultado, no el código línea por línea). Quien
   programa se inventa la forma técnica de lograrlo, pero antes de tocar el
   repo real, regresa y explica: "encontré esto, funciona así, ¿le entro?" —
   sobre todo si hay una decisión de por medio (crear una columna nueva,
   elegir entre 2 formas de resolverlo, etc.). Solo con un "dale"/"súbelo"
   explícito se sube. Sin excepción, aunque el fix se vea obvio.

2. **No asumas silenciosamente.** Si algo es ambiguo, o si el código actual
   sugiere un mecanismo distinto al que el dueño describe, se pregunta o se
   verifica ANTES de decidir por cuenta propia. Leer el código para entender
   cómo funciona hoy está bien y se espera — pero eso no reemplaza confirmar
   qué se quiere que pase.

3. **"Minis" antes de tocar UI/visual.** Para cualquier cambio visual o de
   comportamiento de interfaz, se arma una vista previa interactiva (HTML
   autocontenido, publicado como artifact) ANTES de tocar el repo real. Si
   el cambio usa un componente de `gsocd-shared`, el mini debe inyectar el
   componente REAL (el archivo tal cual, no una reconstrucción) para que lo
   que se prueba sea exactamente el comportamiento real, no una simulación.

4. **Los cambios se pueden acumular en local sin subir.** El dueño puede
   pedir varios cambios seguidos y decir "no subas nada todavía" — en ese
   caso los cambios se hacen sobre copias locales (en el sandbox de la
   sesión) y se van apilando, hasta que se den todos juntos con un solo
   "dale". Cuando esto pase, quien retome la conversación (aunque sea otra
   sesión) debe saber que puede haber cambios locales sin commitear — si el
   dueño menciona algo que "quedó pendiente" y no aparece en el repo, no es
   un error, probablemente sigue en el sandbox de la sesión anterior sin
   subir. Pregúntale directo si quiere que se rehaga o si ya se perdió.

5. **Cada commit debe explicar el porqué, no solo el qué.** El mensaje de
   commit tiene que ser lo bastante específico para que una sesión nueva
   entienda el contexto completo sin tener que re-investigar: qué problema
   real se encontró, por qué se eligió esa solución y no otra, y si hay
   trade-offs o casos que se dejaron fuera a propósito.

6. **El tono del dueño es directo y con groserías — no es un ataque
   personal, es como habla.** Se puede hablar de igual a igual, con más
   soltura de la que se usaría normalmente, sin necesidad de ser cortante
   ni de disculparse en exceso. Dicho eso: no hay que auto-insultarse ni
   quedarse callado si algo cruza a un insulto directo — se puede reconocer
   el error real sin necesidad de repetir el insulto.

7. **Antes de subir CUALQUIER cambio al repo (aunque ya esté "confirmado" y
   listo para el commit), hay que revisarlo de punta a punta como si fuera
   un caso real** — seguir el flujo completo, paso a paso, desde que algo
   se crea/pide hasta que se completa/cierra, buscando específicamente: dos
   flujos que puedan pisarse o duplicarse, un dato que se pierda en el
   camino entre una pantalla y otra, una pantalla que no se entere de un
   cambio que hizo otra, y campos usados en el código que no coincidan con
   lo documentado como columnas necesarias en SharePoint. Esto no es
   opcional ni solo para features grandes — es el último paso antes de
   cualquier "dale", cada vez. En esta sesión, esta revisión encontró 7
   bugs reales que el código "ya terminado" traía escondidos — ninguno era
   un error de sintaxis (esos ya se habían validado con `node --check`),
   todos eran de lógica: cosas que se ven perfectas archivo por archivo
   pero fallan en la costura entre dos archivos.

8. **Todo cambio visual o de comportamiento se considera en mobile ANTES de
   proponerlo o subirlo — no después.** No basta con que se vea bien en
   desktop. En la sesión del 13/09/2026 esto se pasó por alto varias veces
   seguidas sobre el mismo componente compartido
   (`gsocd-shared/order-form-premium`): un fix se probaba, se declaraba
   listo, se subía, y el dueño encontraba en su propio celular que seguía
   roto — o que se veía distinto entre Admin y Orders aunque los dos usan
   el mismo componente, porque el padding/contexto que lo envuelve en cada
   app es distinto. Esto obligó a repetir el mismo ciclo de investigación
   3-4 veces sobre lo mismo (filas de unidad, pestañas de división, padding
   de tarjetas). La lección: antes de decir "ya está" sobre cualquier
   componente visual — sobre todo uno compartido, usado en más de un lugar
   — hay que verificar con un render real (no solo leer el CSS) a un ancho
   angosto realista (320-375px, el peor caso siendo un iPhone SE de 320px),
   y hacerlo DENTRO de cada contexto donde ese componente se usa, no solo
   uno — un componente puede verse perfecto en una pantalla y roto en otra
   por lo que lo rodea, no por el componente en sí.

## Mapa de la arquitectura (para no perderse)

**4 repos, todos de `tunena1023` en GitHub, cada uno su propio proyecto en
Vercel (equipo "GS Solutions"):**

| Repo | Dominio | Para quién | Notas |
|---|---|---|---|
| `tech.gsocd.com` | tech.gsocd.com | Empleados/supervisores en campo | Login por QR + DeviceToken (sin password). Nunca se crean órdenes aquí. |
| `Admingsocd.com` | admin.gsocd.com | Oficina/staff | Aprobar órdenes, catálogo de servicios, scheduling |
| `ordersgsocd.com` | orders.gsocd.com | Clientes | Pedir servicio, tracking, portal de cliente |
| `gsocd-shared` | — (no se despliega) | — | Componentes de UI reutilizados por los 3 portales, vía jsDelivr + git tags |

**Cómo se consume `gsocd-shared`:** cada componente se referencia en el HTML
con una URL fija a una versión (`https://cdn.jsdelivr.net/gh/tunena1023/
gsocd-shared@vX.X.X/nombre-componente/archivo.js`). Los tags son de TODO el
repo (no por componente), así que subir un fix implica: 1) editar el archivo
en `main`, 2) crear un tag nuevo (`git/refs` con `refs/tags/vX.X.X` apuntando
al commit), 3) actualizar el `<script src>` en cada HTML que lo usa a la
versión nueva. Sin el paso 3, el fix vive en el repo pero nadie lo usa
todavía — cada consumidor está pegado a la versión que tenga escrita.

**El catálogo de servicios tiene 2 listas de SharePoint, NO conectadas entre
sí por el sistema — son fuentes independientes, a propósito:**
- **`ServicesCatalog`** — SKUs importados de QuickBooks (Division,
  PropertyType, Price, ServiceName se sobreescriben en cada import). El
  campo `Category` es la ÚNICA excepción: el import nunca la toca, se
  mantiene a mano desde `developer.html` > tab "Services" (botón junto a
  cada renglón). Esta es la lista real que alimenta el selector de
  servicios en TODO lugar donde se pone o edita una orden.
- **`Services`** — lista vieja, migrada de un Excel el 30/08/2026. Ya no es
  la fuente real para nada activo del selector de servicios nuevo (ver
  historial de conversación del 10/09/2026 para el porqué se descartó como
  fuente — quedó documentado ahí que mezclar las 2 listas fue un error).

**El selector de servicios compartido (`gsocd-shared/service-picker`)**
tiene una opción `groupByCategory: true` que agrupa por `Category` en un
acordeón (categorías sin asignar caen en "Uncategorized", nunca se pierden).
Por regla del dueño (confirmada 10/09/2026): **este acordeón es el estándar
en TODO lugar de Admin u Orders donde se pone o edita una orden** — no
aplica a Tech (ahí nunca se crean órdenes). Los 6 lugares que existen hoy:
`create-order` y `appr-`/`admin-` (edición) en Admin, `customer-order` en
Orders, más `tpl-admin` (Admin) y `template-editor` (Orders) para
plantillas — estos últimos 2 se estandarizaron el 10/09/2026, antes se
habían quedado en una versión vieja del componente sin el acordeón.

## Pendientes conocidos (al 10/09/2026)

- **COMPLETAMENTE RESUELTO (13/09/2026):** el preview de foto al pasar el
  mouse (1s, tamaño máximo) ya se movió a `gsocd-shared/photo-hover-
  preview` (tag `v1.26.0` — ver su NOTES.md para el detalle completo).
  `customer.html` (Gallery embebido), `tracking.html` (Processing/
  History) Y `gallery.html` standalone (por consistencia, aunque ya no
  lo usa nadie dentro de la app — Gallery vive en `customer.html` desde
  el fix del parpadeo) ya usan `GSPhotoHoverPreview.setup()`/
  `.stripHtml()` en vez de sus propias copias locales. **Ya se conectó
  también en `tech.gsocd.com`** (`employee.html`/`supervisor.html`,
  mismo día) — resulta que Tech YA tenía Gallery completo y funcionando
  (`get-my-gallery.js` + `GSGalleryGroups`), solo le faltaba el
  hover-preview mismo. Los 3 repos quedan conectados al mismo
  componente compartido, sin ninguna copia local en ningún lado.
- El **sistema de servicios recurrentes** (ubicaciones/clientes con
  servicio recurrente, técnico asignado que ve y marca servicios como
  hechos) está apenas empezado — no es funcional todavía. Documento de
  referencia pendiente de analizar con el dueño.
- **En local, sin subir al repo:** fix en `service-picker.js` para que solo
  una categoría del acordeón esté abierta a la vez (hoy se pueden abrir
  varias al mismo tiempo). Vive en el sandbox de la sesión del 10/09/2026,
  no en GitHub — si no aparece en el repo y no se sabe por qué, es por esto.
- **RESUELTO (12/09/2026) — 404 de `Logo.jpg` / `NavBackground.jpg` en Orders
  (`/api/site-image`).** El diagnostico original de esta nota estaba
  MAL -- no era que los archivos tuvieran otro nombre en SharePoint (SI
  se llaman exactamente `Logo.jpg` / `NavBackground.jpg`, confirmado
  viendo la raiz del drive directo). La causa real: `serveRootFile()`
  en `orders/site-image.js` listaba TODOS los archivos de la raiz del
  drive (`cachedChildren('')`) y buscaba el nombre pedido entre ellos --
  forma menos confiable que Admingsocd.com ya habia dejado atras hace
  tiempo, cambiando a una busqueda DIRECTA con `driveItemByPath()` (una
  sola llamada a Graph pidiendo esa ruta exacta, sin listar nada). Orders
  nunca recibio esa misma actualizacion -- `driveItemByPath()` YA EXISTIA
  en `lib/graph.js` de Orders (identica a la de Admin), solo no estaba
  conectada en `site-image.js`.
  **Si vuelve a pasar algo parecido (imagen/banner/logo que da 404 en
  cualquiera de los 3 repos):** antes que nada comparar el archivo
  sospechoso (`site-image.js` y/o `lib/graph.js`) contra su equivalente
  en Admingsocd.com byte por byte (`diff`) -- Admin suele tener la
  version mas actualizada/confiable de estas funciones. Tambien:
  `Vercel:get_runtime_logs` (proyecto real, no adivinar la plataforma --
  es Vercel, NO Netlify, aunque haya un `netlify.toml` suelto sin usar)
  filtrando por `/api/site-image` muestra el codigo de respuesta real
  (200/404/500) sin necesidad de pedirle a nadie que abra devtools.
- **RESUELTO (confirmado por el dueño, 13/09/2026):** banner "File
  downloaded... sharepoint.com" en Tech (portal de empleados, celular) —
  el fondo o logo se descargaba como archivo en vez de solo mostrarse.
  `site-image.js` de Tech ya sirve el buffer con `Content-Type` correcto
  por extensión y sin `Content-Disposition: attachment`. No quedó
  registrado en un commit con ese nombre específico — probablemente se
  arregló junto con otro cambio a `site-image.js`/`lib/graph.js`.

## Cómo conectarse (para que una sesión nueva no tenga que preguntar)

**Vercel:** ya está disponible como conector en Claude -- no requiere token,
solo usar las herramientas Vercel: list_teams / list_projects / get_project
etc. Team: "GS Solutions" (team_JW18RqqLyzjaO9nYs4NWVAVA).

**GitHub:** NO hay conector instalado en Claude -- no existe, no hay que
buscarlo dos veces. La unica forma de acceso es que el dueño pegue un
Personal Access Token (fine-grained, scope: Contents Read/Write + Metadata
Read, limitado a los 3 repos de tunena1023) directo en el chat. Con ese
token se clonan los repos por HTTPS (`git clone https://<token>@github.com/
tunena1023/<repo>.git`). El token NO se guarda entre sesiones -- se pide
uno nuevo cada vez, y el dueño lo revoca al terminar.

Repos: tunena1023/Admingsocd.com, tunena1023/tech.gsocd.com,
tunena1023/ordersgsocd.com.


## Regla reforzada (12/09/2026): nunca tocar codigo en produccion directo

Todo cambio de codigo se hace SIEMPRE sobre la copia local del repo (el
sandbox de la sesion), nunca hay edicion directa a lo ya desplegado. El
commit + push (que dispara el deploy en Vercel) SOLO pasa cuando el dueño
lo autoriza explicitamente para ESE cambio puntual -- una autorizacion
general de "asi trabajamos" no cuenta como luz verde para subir algo
especifico. Si el dueño pide varios ajustes seguidos, se acumulan en
local (ver regla 4 de arriba) hasta que diga que los suba.


## Regla reforzada (12/09/2026): leer TODO este archivo antes de tocar nada

Antes de tocar codigo, revisar un bug, o proponer un cambio -- lo primero,
siempre, es leer este NOTES.md completo (los 3 repos, no solo el que se
va a tocar, porque comparten arquitectura y gsocd-shared). No asumir que
"ya se sabe" el contexto de sesiones anteriores sin haber leido esta
version actual del archivo -- puede haber pendientes, decisiones o
cambios en local sin subir que cambian por completo cual es la forma
correcta de resolver algo.


## SUBIDO Y DESPLEGADO (13/09/2026): Multi/Single contaba tarjetas de fuera del formulario

Bug real, no de lógica sino de scope: `removeUnitCard()`, `renumberUnitCards()`
y `gatherUnitsRaw()` en `customer.html` buscaban con
`document.querySelectorAll('.gs-ofp-unitline')` — SIN restringir a ningún
contenedor, en TODA la página. Esta misma clase también la usa
`addUnitFormHtml()` (el formulario oculto de "+ Add a Unit" que se agrega a
CADA orden activa en la lista de Processing). Si el cliente tenía 2+ órdenes
activas, ya había 2+ elementos `.gs-ofp-unitline` ocultos en el DOM desde
que se cargaba Processing — inflando el conteo real de Multi sin que el
usuario tocara nada ahí. El síntoma: quitar unidades hasta llegar a 1 nunca
bajaba a Single, sin importar cuántas veces se intentara.

Se encontró comparando byte por byte contra `Admingsocd.com/admin.html`
(`removeCreateUnitCard`), que SIEMPRE restringe su búsqueda a
`#create-unit-cards` — nunca le pasó esto porque nunca cuenta nada de fuera.
Fix: las 5 ocurrencias en `customer.html` ahora llevan el prefijo
`#unit-cards `, igual que Admin usa `#create-unit-cards `. Ningún otro
cambio de lógica.

**Lección para la próxima vez que un contador/lógica de UI se comporte
raro sin razón aparente:** revisar primero si la clase CSS que se está
contando/buscando se reutiliza en algún OTRO lugar de la misma página para
algo completamente distinto — un `document.querySelectorAll` sin scope
cuenta TODO lo que exista en el DOM con esa clase, esté visible o no.

## SUBIDO Y DESPLEGADO (13/09/2026): Preview de foto al pasar el mouse (1s, tamaño máximo, sin clic)

Aprobado con mini antes de tocar código real. Reemplaza cualquier
comportamiento anterior de "crecer un poco al pasar el mouse" por un
preview tipo lightbox: al quedarse 1 segundo con el mouse sobre una
miniatura de foto, esta crece al tamaño máximo posible en pantalla — sin
necesidad de clic. Se cierra en cuanto el mouse SALE de la miniatura (no
por micro-movimientos naturales mientras sigue encima de la misma foto —
decisión explícita, se sentiría roto exigir inmovilidad total).

Implementado primero en `Admingsocd.com/admin.html` (reemplazando el viejo
`.order-photo-thumb:hover { scale(2.4) }`), extendido después a **todos**
los lugares que muestran una orden real con fotos — a petición explícita
del dueño ("en todos los tabs... las fotos siempre deben ser visibles desde
cualquier orden"): Approvals, Review (2 secciones), Active, History,
Schedule (2 secciones), y Gallery (`.gs-gal-ph`, que es un `<div>` que
envuelve un `<img>` adentro, a diferencia de `.order-photo-thumb` que es el
`<img>` directo — los videos `.gs-gal-ph.video` se excluyen del preview).

Se implementó con **delegación de eventos** (`mouseover`/`mouseout` en
`document`, revisando `closest()`) en vez de `addEventListener` directo
sobre cada miniatura — necesario porque estas se insertan y reinsertan
constantemente vía `innerHTML` cada vez que se refresca cualquier tab;
delegación es la única forma de que siga funcionando sin reconectar
listeners en cada refresh.

Portado después a `ordersgsocd.com` (ver siguiente sección) — mismo
componente exacto, mismo criterio de exclusión de videos.

## SUBIDO Y DESPLEGADO (13/09/2026): Gallery en Orders + fotos en Processing/History — Y la lección real del "parpadeo"

**Piezas nuevas:**
- `get-client-gallery.js` — mismo patrón que `get-admin-gallery.js` de
  Admin (fotos leídas directo de `TechPhotos/<Cliente>/<OrderID>/Photos`,
  sin ninguna lista de SharePoint separada), pero SIEMPRE filtrado por
  `clientId` — el cliente nunca debe poder ver fotos de otra cuenta. No
  hizo falta ninguna columna nueva de SharePoint; `listChildren()` ya
  maneja una carpeta que todavía no existe (regresa vacío, no truena), así
  que las carpetas se siguen creando solas al subir la primera foto.
- `customer.html` ahora carga TODAS las fotos del cliente de un jalón
  (`loadOrders()` en paralelo con `get-orders`) para pintar la tira de
  miniaturas en Processing/History, en vez de pedirlas una por una.

**El error real que costó varias vueltas — documentado para no repetirlo:**

Primero se construyó Gallery como página standalone (`gallery.html`),
calcada de `recurring.html`. Esto trajo 3 bugs de estructura que
`recurring.html` YA tenía (nadie los había notado porque nadie comparó
ambos lado a lado antes):
1. Layout angosto y centrado (`.wrap { max-width:920px }`) en vez de ancho
   completo como Processing/History (`.history-wrap`, sin `max-width`).
2. Orden del banner "Welcome back" ANTES de los tabs de navegación, cuando
   `customer.html` (la página principal) lo tiene DESPUÉS. Se corrigió en
   los 6 archivos de Orders (`gallery.html`, `profile.html`,
   `recurring.html`, `templates.html`, `tracking.html`, y ya lo tenía bien
   `customer.html`).
3. **El bug real, el que causaba el "parpadeo":** `gallery.html` era una
   página `.html` SEPARADA. Cada vez que el usuario entraba o salía de
   Gallery, el navegador hacía un refresh COMPLETO de la página —
   incluyendo el nav y el logo, que se destruían y volvían a crear desde
   cero. "New Order" nunca parpadea porque vive DENTRO de `customer.html`
   como panel interno (igual que Recurring/Templates/Profile/Processing/
   History) — cambiar de panel ahí es solo un toggle de clases CSS
   (`GSNavPremium.showPanel()`), sin ninguna recarga.

   Se intentó primero un fix equivocado (arreglar el tamaño estático del
   CSS del nav en `customer.html`, que sí tenía un bug real de
   dependencia en `applyChrome()` en tiempo de ejecución — quedó
   corregido, pero NO era la causa del parpadeo). El dueño insistió en
   comparar directo New Order contra Gallery en vez de seguir
   especulando por timing de red, y ahí se encontró la causa real.

   **Fix definitivo:** Gallery se convirtió en un séptimo panel interno de
   `customer.html` (`#panel-gallery`), usando los mismos componentes
   compartidos (`gallery-groups.js` + `lightbox.js`, este último ya estaba
   cargado). El tab de Gallery en el nav pasó de `href:'gallery.html'` a
   `dataView:'gallery'` + `onclick:showTab('gallery')` — mismo mecanismo
   que los otros 6 tabs. `gallery.html` standalone se dejó tal cual (por
   si alguien llega ahí desde otra página vía link directo), pero DENTRO
   de `customer.html` ya nunca se usa esa ruta.

**Lección para la próxima vez que algo "parpadee" o se sienta lento al
cambiar de tab:** antes de tocar CSS o timing, preguntar primero — ¿esta
sección vive en un archivo `.html` separado, o es un panel interno de la
página principal? Si es un archivo separado, cualquier navegación hacia o
desde ahí SIEMPRE va a recargar la página completa (nav, logo, todo) sin
importar qué tan optimizado esté el CSS o el JS — la única forma real de
evitarlo es convertirlo en panel interno (`GSNavPremium.showPanel()`),
como ya hacen la mayoría de los tabs de `customer.html`.

Verificado con Puppeteer contando navegaciones de página reales (no
timing/CSS): clic en Gallery = 0 navegaciones; ir de Gallery a History y
de vuelta = 0 navegaciones — el nav y el logo nunca se destruyen. Batería
completa en 0 errores en cada paso.

## SUBIDO Y DESPLEGADO (confirmado 13/09/2026): "+ Add a Unit" portado desde Admin

Mismo rediseño ya aprobado en `Admingsocd.com/admin.html` (tab Approvals),
portado aquí. El modal (`#addunit-dialog`, `openAddBatchUnit`/
`closeAddBatchUnit`/`submitAddBatchUnit` viejos) se QUITÓ por completo —
ahora "+ Add a Unit" despliega un formulario inline debajo del botón
(`addUnitFormHtml`/`toggleAddUnitForm`/`submitAddBatchUnit` nuevos), mismos
6 campos con look premium `gs-ofp-*`, tarjeta "Need anything from the
office?" delgada con toggle real, y los botones se quedaron con los
colores NATIVOS de Orders (`.btn-gold`/`.btn-ghost`), no los verdes de
Admin — decisión tomada sola por ser "solo estético", sin pedirlo, avisado
en el chat. `add-batch-unit.js` ahora acepta y guarda `NeedsOfficeAccess`/
`OfficeNeedNotes` (antes no lo hacía, igual que en Admin).

Diferencia real con Admin descrita originalmente aquí (buildings pedidos a
`/get-client-addresses` de forma async, con "Loading buildings…") quedó
SUPERADA por el cambio de la sección siguiente — Building # pasó a texto
libre y ya no se piden direcciones guardadas del cliente en absoluto.

Confirmado en el repo real (13/09/2026): `customer.html` en `main` ya usa
`addUnitFormHtml`/`toggleAddUnitForm`/`submitAddBatchUnit` con look
`gs-ofp-*` (vía `GSOrderFormPremium.unitDetailPanelHtml`), sin rastro del
modal viejo `#addunit-dialog`. Referencia `gsocd-shared@v1.25.19`.

## SUBIDO Y DESPLEGADO (confirmado 13/09/2026): Building # pasó de select a texto libre

Mismo cambio que en Admin (ver su NOTES.md): el "+ Add a Unit" portado hoy
usaba un `<select>` de direcciones guardadas del cliente
(`/get-client-addresses`) para Building — se quitó por completo. Ahora es
texto libre y OPCIONAL, igual que "Building #" del modo Single. Si se deja
vacío, `add-batch-unit.js` autorellena con los dígitos iniciales de la
dirección del cliente (`Clients` list), regex `/^\s*(\d+)/`. Ya no se
importa `CLIENT_ADDRESSES_LIST` en ese archivo (quedó sin uso). `BuildingId`
tampoco se guarda ya en la unidad nueva (no aplica sin building ligado).

Mismo criterio que en Admin: clientes con varias propiedades guardadas
siempre van a la dirección default del cliente al usar este formulario,
nunca a una distinta. Esto NO es una limitación pendiente — es la
instrucción explícita y confirmada del dueño (12/09/2026, ver comentario
en `add-batch-unit.js`), ya implementada y desplegada tal cual.

Confirmado en el repo real (13/09/2026): `add-batch-unit.js` en `main`
solo lee `cf.Address` del cliente (`Clients` list) para autorellenar
Building #, sin ningún selector de propiedades — coincide con la
decisión documentada arriba.

## SUBIDO Y DESPLEGADO (12/09/2026): Office Access unificado en gsocd-shared

Mismo cambio que en Admin (ver su NOTES.md, y el de `gsocd-shared` para
el detalle completo de la API nueva). Se reemplazaron las 2 tarjetas
duplicadas en este repo (flujo de crear orden y formulario de Add Unit)
por llamadas a `GSOrderFormPremium.officeAccessHtml(dom, opts)`. Se
quitaron `officeNeedYes`/`setOfficeNeed`/`toggleOfficeNeed`/
`resetOfficeNeed` (locales de esta página) y `addUnitOfficeNeedState`/
`setAddUnitOfficeNeed` (del formulario de Add Unit). `<script src>`
actualizado a `gsocd-shared@v1.25.0`.

Detalle propio de este repo (no aplica en Admin): el toggle del flujo de
crear orden le cambia el nombre a OTRO campo de la pantalla ("Entry
time" → "Office availability time") -- por eso se usa
`GSOrderFormPremium.onOfficeNeedChange('create', fn)` para engancharse
sin que el componente compartido tenga que saber de esta lógica ajena a
él. Probado con jsdom que el hook renombra y des-renombra correctamente,
y que `restoreOfficeNeed(o)` (cargar un borrador/orden existente) prende
el estado, llena el texto, Y dispara el hook del label los 3 a la vez
(9/9).

También se descubrió y arregló al hacer esto: el `<div id=
"access-scheduling-mount">` vive a mitad de página, pero el `<script
src>` de `order-form-premium` carga hasta el final del `<body>` -- si se
llama a `GSOrderFormPremium.officeAccessHtml()` directo ahí sin esperar,
truena porque el componente todavia no existe. Se envolvió en
`document.addEventListener('DOMContentLoaded', ...)`.

Título/label/placeholder nuevos confirmados con jsdom sobre el código
real de `customer.html`: 20/20 en Add Unit.

**Estado real (12/09/2026, verificado con fetch directo a producción):**
`gsocd-shared@v1.25.0` se subió primero (repo + tag), luego este repo.
`customer.html` en producción ya referencia `gsocd-shared@v1.25.0` en su
`<script src>`, el `#addunit-dialog` (modal viejo) ya no existe en el
HTML servido, y no queda ningún rastro del texto viejo ni de
`addUnitBuildingsCache`. Deployment en Vercel: `READY`, sin errores
nuevos en runtime logs.
