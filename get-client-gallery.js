/* ============================================================
   get-client-gallery.js — fotos de TODAS las ordenes de UN cliente,
   agrupadas por orden. Mismo criterio que get-admin-gallery.js
   (Admingsocd.com): no hay ninguna lista de SharePoint que registre
   las fotos por separado -- todo se deduce leyendo la carpeta directo:
     TechPhotos/<ClientID> - <BusinessName>/<OrderID>/Photos/*.jpg

   A diferencia de get-admin-gallery.js (que trae TODAS las ordenes de
   la compania), este SIEMPRE filtra por clientId -- el cliente nunca
   debe poder ver fotos de otra cuenta. Mismo patron de filtrado ya
   usado en get-orders.js (fetchByField sobre ClientID via OData).
============================================================ */

const { ORDERS_LIST, ORDER_SERVICES_LIST, listChildren, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';
/* forzar build limpio -- 2026-09-13 */

/* Fotos de un servicio especifico (camara junto a cada servicio, en
   Admin y Tech) traen el nombre del servicio y el momento en que se
   tomaron codificados en el archivo mismo --
   "svc-<ServiceNameSafe>-<timestamp>.jpg". Sin ninguna columna nueva
   en SharePoint. La nota (si hay) siempre se lee de
   NotCompletedReason en OrderServices en ese momento, nunca se
   duplica aqui. Calcado de Admingsocd.com/get-admin-gallery.js y
   tech.gsocd.com/get-my-gallery.js para que se vea IGUAL en los 3
   lados. */
const SVC_PHOTO_PREFIX = /^svc-(.+?)-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:-[a-z0-9]+)?\.[a-z0-9]+$/i;
function safeName(s) { return String(s || '').replace(/[^a-z0-9]/gi, '_'); }

/* BUG REAL encontrado y arreglado (18/09/2026): el nombre del
   archivo guarda la hora del SERVIDOR (Vercel corre en UTC por
   default), no la hora de Iowa -- se mostraba tal cual, sin
   convertir, y una foto tomada a las 9:57 PM se veia como "2:57 AM"
   en Gallery (5-6 horas adelantada, segun horario de verano/
   invierno). Ahora se convierte a America/Chicago antes de mostrarla
   -- Intl.DateTimeFormat ya calcula solo el ajuste correcto de CDT/
   CST segun la fecha, sin tener que llevar la cuenta a mano. */
function formatSvcPhotoDate(y, mo, d, h, mi) {
  const utcDate = new Date(Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(mi, 10)));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(utcDate);
  const get = type => (parts.find(p => p.type === type) || {}).value || '';
  return get('month') + ' ' + get('day') + ', ' + get('year') + ' · ' + get('hour') + ':' + get('minute') + ' ' + get('dayPeriod');
}

/* BUG REAL encontrado y arreglado (18/09/2026, reportado por el
   dueño): fotos normales nunca tenian caption -- respaldo con
   createdDateTime, mismo criterio que en Admin y Tech. */
function formatIsoDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(d);
  const get = type => (parts.find(p => p.type === type) || {}).value || '';
  return get('month') + ' ' + get('day') + ', ' + get('year') + ' · ' + get('hour') + ':' + get('minute') + ' ' + get('dayPeriod');
}

async function buildServiceCaptions(orderId, photoNames) {
  const svcNamesInPhotos = photoNames
    .map(n => (n.match(SVC_PHOTO_PREFIX) || [])[1])
    .filter(Boolean);
  if (!svcNamesInPhotos.length) return {};

  const rows = await fetchByField(ORDER_SERVICES_LIST, 'OrderID', orderId);
  const bySafeName = {};
  rows.forEach(it => {
    const f = it.fields || {};
    const name = f.ServiceName || '';
    if (!name) return;
    bySafeName[safeName(name)] = { name, level: f.Level || '', reason: f.NotCompletedReason || '' };
  });

  const captions = {};
  photoNames.forEach(fileName => {
    const m = fileName.match(SVC_PHOTO_PREFIX);
    if (!m) return;
    const svc = bySafeName[m[1]];
    if (!svc) return;
    const dateStr = formatSvcPhotoDate(m[2], m[3], m[4], m[5], m[6]);
    /* sortKey: ISO real (no el caption formateado) para que Gallery
       pueda ordenar "Por fecha" de verdad -- ver gsocd-shared/
       gallery-groups NOTES.md (rediseño 19/09/2026). Mismos
       componentes del nombre de archivo que ya usa formatSvcPhotoDate,
       reconstruidos aqui como Date.UTC (m[7] son los segundos, antes
       no se usaban para nada). */
    const sortKey = new Date(Date.UTC(
      parseInt(m[2], 10), parseInt(m[3], 10) - 1, parseInt(m[4], 10),
      parseInt(m[5], 10), parseInt(m[6], 10), parseInt(m[7] || '0', 10)
    )).toISOString();
    /* level/reason ahora van SEPARADOS del caption (antes iban
       mezclados como texto) -- Gallery los muestra como sus propios
       renglones, mismo patron que las tarjetas .svc-row del resto de
       la app (nombre + nivel + nota), a peticion del dueño. */
    captions[fileName] = {
      serviceName: svc.name,
      level: svc.level || '',
      reason: svc.reason || '',
      caption: dateStr,
      sortKey
    };
  });
  return captions;
}

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  let url = siteListPath(listName) + `?$expand=fields&$top=200&$filter=${filter}`;
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

function clientFolderName(f) {
  return (String(f.ClientID || '').trim() + ' - ' + String(f.BusinessName || '').trim())
    .replace(/[\\/:*?"<>|]/g, '').trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const clientId = String(b.clientId || '').trim();
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });

    const orderRows = await fetchByField(ORDERS_LIST, 'ClientID', clientId);
    const orders = orderRows.filter(it => it.fields);

    const groups = await Promise.all(orders.map(async (it) => {
      const f = it.fields;
      const orderId = f.OrderID || f.Title || '';
      const folderPath = PHOTOS_FOLDER + '/' + clientFolderName(f) + '/' + orderId + '/Photos';
      const kids = await listChildren(folderPath);
      const photos = kids.filter(k => k.isFile).sort((a, b) => a.name.localeCompare(b.name));
      if (!photos.length) return null;
      const captions = await buildServiceCaptions(orderId, photos.map(p => p.name));
      return {
        orderId,
        division: f.Division || '',
        status: f.Status || '',
        date: f.EntryDate || f.DispatchDate || f.createdDateTime || '',
        photos: photos.map(p => {
          const info = captions[p.name];
          return {
            name: p.name,
            downloadUrl: p.downloadUrl,
            serviceName: info ? info.serviceName : null,
            level: (info && info.level) || '',
            reason: (info && info.reason) || '',
            caption: (info && info.caption) || formatIsoDate(p.createdDateTime) || undefined,
            sortKey: (info && info.sortKey) || p.createdDateTime || ''
          };
        })
      };
    }));

    const nonEmpty = groups.filter(Boolean).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return jsonResponse(200, { groups: nonEmpty });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
