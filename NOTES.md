# NOTES.md — Cómo se trabaja en este proyecto

Este archivo existe para que cualquier chat de Claude (u otra persona) que entre
a este repo después no tenga que adivinar el proceso, ni repetir preguntas ya
resueltas, ni subir cosas sin permiso. Léelo completo antes de tocar código.

## SUBIDO (24/09/2026): Building # con lista de edificios + Profile en tarjetas

- **New Order > Building #** (una unidad, cada renglon de varias
  unidades y "+ Add a Unit" de un PO): al tocarlo sale "Your buildings"
  con los edificios NO archivados de Profile (nombre, # y direccion);
  escribir filtra; escoger pone el numero (o el nombre si no tiene
  numero). Sigue siendo texto libre. Aprobado con mini ("asi mero"):
  https://claude.ai/artifact/1cjaexdsmizqg5rMmT3JjN
  A proposito NO cambia la direccion de la orden ni la tarjeta negra
  (sigue la principal). Si el dueño lo pide, ese seria otro paso.
- **Profile**: secciones en tarjetas desplegables, TODAS cerradas por
  defecto, y Save al final (abajo de Contacts). OJO: el Profile que ven
  los clientes es el panel `#panel-profile` DENTRO de `customer.html`;
  `profile.html` es una copia VIEJA que todavia linkean templates,
  tracking, gallery y recurring. Primero se cambio solo profile.html y
  el dueño no veia nada -- cualquier cambio a Profile va en los DOS
  mientras exista la copia.
- **PENDIENTE (sin decidir):** apuntar el tab Profile de templates /
  tracking / gallery / recurring a customer.html y retirar profile.html.

## SUBIDO (23/09/2026): paquetes como plantilla en el portal

Picker v1.52.0 en customer/recurring/templates/tracking; Create Order
arranca en Units (paquetes como plantilla). get-services manda `areas` y
`packageItems` (Settings, los escribe Admin). `lib/package-contents.js`
(copia sin defaults): al crear una orden (los 4 caminos de submit-order)
se congela lo que incluía cada paquete ese día (OrderHistory 'Package
Snapshot', interno: el cliente no lo ve en la línea de tiempo), y
tracking muestra "Includes" SOLO desde esa foto.

## SUBIDO (23/09/2026): descripción del servicio en tooltip

gsocd-shared v1.50.0 (`service-tooltip` + picker) en customer,
recurring, templates y tracking. get-services.js manda `description` en
el catálogo. tracking.html ahora pide get-services siempre (antes solo
con tiempos estimados) para registrar las descripciones; los tiempos
siguen saliendo solo si el cliente los tiene activados.

## SUBIDO (23/09/2026, tarde): lugar con edificios en el Recurring del cliente

get-my-recurring.js arma el lugar con las mismas reglas que placeLabel()
de Admingsocd.com (edificio si hay varios, piso si el edificio tiene
varios, área). Si cambian allá, cambiar aquí.

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
Por regla del dueño (confirmada 10/09/2026): este acordeón es el estándar
en TODO lugar de Admin u Orders donde se pone o edita una orden — no
aplica a Tech (ahí nunca se crean órdenes). Los 5 lugares reales hoy (verificado
contra el código, 15/09/2026): `appr-` (Approvals > Update) en Admin,
`create-order` en Admin, `customer-order` en Orders, más `tpl-admin` (Admin)
y `template-editor` (Orders) para plantillas.

**Excepción confirmada:** Active (`admin.html`) YA NO usa este acordeón para
editar servicios de una orden en curso -- el rediseño del 15/09/2026 lo
reemplazó por una lista editable en línea (X/undo por servicio, pills
L1/L2/L3 para Janitorial), sin categorías. El código viejo que montaba el
acordeón ahí (`buildServiceRows`/`mountAdminServicePicker`/
`buildAdminLegacyNote`) se dejó de llamar en ese rediseño pero no se borró
hasta ahora (15/09/2026) -- quedó como código muerto que hacía parecer que
Active seguía usando el acordeón cuando ya no era cierto. Se confirmó con
el dueño que no hace falta reactivarlo, y se borró por completo.

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
**Si una imagen/banner/logo da 404 en cualquiera de los 3 repos
(`/api/site-image`):** comparar `site-image.js`/`lib/graph.js` contra su
equivalente en Admingsocd.com byte por byte (`diff`) -- Admin suele tener
la versión más actualizada/confiable de estas funciones (búsqueda DIRECTA
con `driveItemByPath()`, no listar toda la raíz del drive). También:
`Vercel:get_runtime_logs` (proyecto real -- es Vercel, NO Netlify, aunque
haya un `netlify.toml` suelto sin usar) filtrando por `/api/site-image`
muestra el código de respuesta real (200/404/500) sin pedirle a nadie que
abra devtools.
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

## Regla nueva (19/09/2026): probar en un Preview de Vercel ANTES de pedir el "dale" a main -- no solo prometer que se probo

Motivo: una sesion anterior subio cambios directo a main sin permiso del
dueno (violando la regla de arriba), y otra dejo un bug real sin poder
probarlo de verdad antes de subirlo. Esto reemplaza "confio en que
funciona" por una forma de que el dueno lo vea funcionando de verdad,
en su propio celular, con datos reales, ANTES de que exista la
posibilidad de tocar produccion:

1. Cualquier cambio que vaya a subirse (no solo visual -- ver regla 3
   para el mini de UI, este paso es el que sigue DESPUES de eso, al
   tocar el repo real) se hace en una rama nueva creada desde
   `origin/main`, nunca commiteando directo a main. Nombre descriptivo,
   ej. `fix/services-requested-mobile-cards`.
2. Se hace `git push` de esa rama (con el token de GitHub). Vercel
   arma automaticamente un deployment de Preview para esa rama -- no
   hace falta configurar nada, es automatico en este proyecto (equipo
   "GS Solutions" en Vercel).
3. Para conseguir el link real del Preview (no adivinarlo): usar las
   herramientas de Vercel (`list_deployments` filtrando por `branch` y
   `slug: "gs-solutions1"`, luego `get_deployment` hasta que
   `readyState` sea `READY`). El campo `alias` del deployment trae la
   URL estable tipo
   `<proyecto>-git-<rama-slug>-gs-solutions1.vercel.app` -- ESA es la
   que se le manda al dueno, no la URL de un deployment individual
   (que cambia cada vez que se sube algo nuevo a la rama).
4. Esa URL alias NO cambia aunque se suban mas commits a la misma
   rama despues (para iterar un fix sin mandar un link nuevo cada
   vez) -- se le puede pedir al dueno que solo haga refresh.
5. Es el MISMO backend/datos reales que produccion (mismas
   SharePoint lists, mismo Graph), asi que el dueno puede probar con
   una orden real de verdad -- no es una simulacion.
6. Solo cuando el dueno prueba en ese link y dice explicitamente que
   se suba (ej. "dale", "subelo a produccion") se hace el merge de esa
   rama a `main` y el push a main (que es lo unico que de verdad toca
   orders.gsocd.com / admin.gsocd.com / tech.gsocd.com reales). Esto
   nunca se asume ni se hace por iniciativa propia, ni siquiera si el
   cambio "ya se probo y se ve bien" en el Preview -- ver la primera
   regla de este archivo.
7. Si algo sale mal despues de subir a la rama, se siguen iterando
   ahi (mas commits a la misma rama) -- production nunca se toca
   hasta que el dueno lo confirma, sin importar cuantas vueltas tome
   arreglarlo bien.


## Regla reforzada (12/09/2026): leer TODO este archivo antes de tocar nada

Antes de tocar codigo, revisar un bug, o proponer un cambio -- lo primero,
siempre, es leer este NOTES.md completo (los 3 repos, no solo el que se
va a tocar, porque comparten arquitectura y gsocd-shared). No asumir que
"ya se sabe" el contexto de sesiones anteriores sin haber leido esta
version actual del archivo -- puede haber pendientes, decisiones o
cambios en local sin subir que cambian por completo cual es la forma
correcta de resolver algo.


## SUBIDO Y DESPLEGADO (14/09/2026): Request a Change con lista + selector + diff (Recurring y Processing)

A petición del dueño: "Request a Change" ya no es un cuadro de texto —
ahora abre un panel a la DERECHA (misma técnica de 2→3 columnas que ya
usaba Processing/History, `order-2col`/`col-right`) con:
1. "Currently on this contract/order": un renglón por servicio con nombre
   + nota (opcional) + cámara — mismo look que Admin > Active > Edit. La
   nota y la foto NO se ligan a un servicio específico en el backend
   (confirmado con el dueño): la nota se junta al mensaje general, la
   cámara reusa `addClientPhoto()` (Recurring) / `startClientPhoto()`
   (Processing).
2. El selector real de servicios precargado con lo que ya tiene, y el
   diff en vivo (verde = agregado, rojo = quitado con nota obligatoria) —
   mismo patrón que Supervisor en Tech ("Update Services").
Todo viene de `gsocd-shared/service-change-panel` (ver su NOTES.md).

**Recurring** (`recurring.html` + panel embebido en `customer.html`):
`request-recurring-change.js` acepta `services`/`removedNotes` además del
mensaje libre (mismo `ServicesJSON` que `submit-recurring-update.js`);
`renderRecurringChangeReview()` en Admin ya lo mostraba sin cambios.

**Processing** (`tracking.html` mobile + `customer.html` desktop): el
panel arranca con la lista + selector + diff y abajo siguen los campos
de antes (describir, fechas, ventana). Describir es opcional si hubo
cambio de servicios. `request-change.js` guarda un renglón de historial
`Services Change Requested` / `Requested Services` con
`{services, removedNotes}` en NewValue — mismo espíritu que
`Reschedule Requested`: nada se aplica hasta que la oficina apruebe.
**Pendiente:** que `admin-approve-order` muestre/aplique esos
`Requested Services` al aprobar (hoy solo llegan al historial).

**History no cambia:** Request Change nunca se muestra en
Completed/Cancelled (`actionButtonsFor` ya lo condiciona) — el dueño lo
confirmó: "eso ya pasó".

**2 bugs reales encontrados en el camino:**
- Una `async function` declarada dentro de un bloque `if {}` NO se eleva
  al scope global (a diferencia de `function` normal) — confirmado con
  prueba aislada. El botón "Send" VIEJO de Recurring ya tenía este bug
  (nunca funcionó). Fix: `window.rcSendChangeRequest = async function`.
- Colisión de nombres en `customer.html`: `toggleChangePanel`/
  `renderChangePanel` ya existían para el Request Change de órdenes
  normales; la copia de Recurring las pisaba. Fix: prefijo `rc` en las
  de Recurring, y el componente compartido no usa nombres globales.

**Quirk heredado (documentado en shared):** en Recurring los servicios no
traen sku, así que quitar uno toma DOS clics en el mismo nivel; en
Processing (sku real) toma uno.

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

## Proyecto grande (15/09/2026): cámara propia + cola offline real

Ver `gsocd-shared/NOTES.md` para el contexto completo (origen, arquitectura
por dominio, los 9 puntos totales). Este repo fue el ÚLTIMO en conectarse
y el que tuvo el caso más complicado de los 3.

- **`ordersgsocd.com/camera-capture.html`** (nuevo) -- usa `shared.js`/
  `GS.api` de este dominio, mismo patrón que Tech.
- 3 puntos de captura, repartidos en 4 archivos (customer.html trae los 3
  juntos; `recurring.html` y `tracking.html` standalone repiten Recurring
  y Tracking cada uno por su lado):
  1. **Recurring** (`addClientPhoto`) -- opcional, botón "+ Add Photo" en
     "Your Photos", más un ícono de cámara aparte dentro de "Request a
     Change" (mismo `addClientPhoto`, misma función).
  2. **Tracking/Processing** (`startClientPhoto`) -- opcional, botón
     "📷 Add Photo" en la sección "Photos" de cada orden.
  3. **Orden nueva sin `OrderID` todavía** (`addNewOrderPhoto`) -- el más
     raro de los 9 en total. Ver el detalle completo en
     `gsocd-shared/NOTES.md` ("El caso de la orden nueva"). Resumen: usa
     `notReady`/`release` de `camera-queue` (v1.28.1), fuerza `saveDraft()`
     antes de ir a la cámara para proteger el resto del formulario, y
     reusa `?continue=<draftOrderId>` (mecanismo que YA EXISTÍA, el mismo
     del botón "Continue" del diálogo de drafts) para restaurar todo al
     volver. **Si se está editando una orden existente** (`editOrderId`
     real desde el principio), la MISMA función sube la foto directo, sin
     diferir nada -- se encontró este caso a tiempo revisando el código
     antes de que se rompiera silenciosamente.
- `client-photo-thumbs-new` (la fila de miniaturas del formulario de
  orden/edición) ahora siempre muestra AMBAS cosas juntas: las fotos que
  YA existen en el servidor (`/get-client-order-photos`, mismo endpoint
  real que ya usaba Tracking, reusado tal cual) más las que están
  pendientes de subir en la cola -- confirmado con el dueño explícitamente
  ("toda información debe ser visible para admin en todo momento"), nunca
  se esconde nada aunque sea un estado intermedio.
- **Efecto secundario real:** "Request a Change" (Recurring y
  Tracking/Processing) tiene edición viva en memoria (picker de
  servicios + notas +, en Tracking, también fechas/ventana/descripción).
  Mismo patrón de snapshot en `sessionStorage` que Admin/Supervisor.
  Se volvieron `async`/esperables `rcToggleChangePanel`/
  `rcRenderChangePanel`/`rcMountChangePicker` (Recurring) y
  `toggleChangePanel`/`renderChangePanel`/`ocMountChangePicker`
  (Tracking) -- ninguna de las dos cadenas esperaba el montaje del picker
  antes de este cambio. Las que se llaman desde un `onclick` inline en el
  HTML se expusieron a mano a `window` (bug real ya documentado en este
  mismo archivo: una `async function` declarada dentro de un bloque
  `if(){}` no hace hoist al scope global sola, a diferencia de una
  `function` normal).

## Cómo funciona el soporte mobile en este repo (18/09/2026)

Igual que en Admin (ver `Admingsocd.com/NOTES.md`), no hay un archivo CSS
aparte para mobile ni ningún framework -- todo vive inline dentro de
`<style>` en el mismo HTML, con `@media (max-width: ...)`. El breakpoint
más usado en este repo también es **768px**, aunque hay varios otros
sueltos (600, 640, 700, 720, 768, 860, 900px) según lo que cada quien
sintió que hacía falta en su momento -- no hay una sola constante.

**Técnica real para tablas de datos (Category/Service/Detail, y
parecidas): tabla → tarjetas con `data-label`.** Exactamente la misma
técnica que ya existía en Admin (`#panel-developer .staff-table` /
`.sched-table`) -- el dueño mismo señaló copiarla de ahí, después de 2
intentos fallidos (celda con ancho fijo, filas flex con `flex-wrap`) que
no resolvían el choque de verdad en pantallas angostas.

- En escritorio: `<table>` normal, con `<thead>` real.
- En mobile (`@media max-width: 768px`): se fuerza `display:block` en
  tabla/fila/celda (se rompe el layout nativo de tabla a propósito), se
  esconde el `<thead>`, cada `<tr>` se vuelve una tarjeta con borde, y
  cada `<td data-label="X">` imprime su propia etiqueta arriba usando
  `content: attr(data-label)` -- sin JavaScript extra.
- Implementado real en: **`.svcreq-table`** (la tabla "Services
  Requested" que se ve al abrir una orden en Processing/History/Tracking)
  -- CSS completo en `customer.html` justo antes de `</style>` del bloque
  principal (buscar `.svcreq-table` para ubicarlo). El comentario ahí
  mismo documenta los 2 intentos previos que no funcionaron, por si se
  vuelve a tocar esa tabla.

**Antes de asumir que una tabla "nunca tuvo versión mobile" en este
repo:** buscar primero si ya existe (`grep -n "data-label"` /
`grep -n "@media"` en el archivo real) -- puede que otra sesión ya lo
haya arreglado y solo falte confirmar que el deploy esté al día, como
pasó exactamente con esta misma tabla (se encontró, al investigar un
reporte del dueño, que el arreglo YA estaba hecho y desplegado por otra
sesión en paralelo -- la confusión inicial fue por trabajar con una
copia local desactualizada del repo, no por un bug real sin resolver).
