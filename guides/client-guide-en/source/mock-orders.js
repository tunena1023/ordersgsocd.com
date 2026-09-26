/* Servidor de prueba: sirve el portal Orders REAL (archivos del repo tal cual)
   y contesta /api/* con datos de ejemplo. Solo para sacar capturas de la guia. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..'); // raiz del repo ordersgsocd.com
const HERE = __dirname;
const PORT = 8788;
const T = (d, h, m = 0, mo = 8) => new Date(Date.UTC(2026, mo, d, h + 5, m)).toISOString();
const CID = 'GS-1042';
const SESSION = { valid: true, clientId: CID, businessName: 'Maple Court Apartments', contactPerson: 'Dana Reyes', address: '1215 Grand Ave', suite: '', city: 'Des Moines', zip: '50309', contact: 'dana@maplecourt.com', phone: '(515) 555-0101', showEstimatedTime: false };
const STATE = { verify: true };

const base = { ClientID: CID, BusinessName: 'Maple Court Apartments', Address: '1215 Grand Ave', Suite: '', City: 'Des Moines', Zip: '50309', Contact: 'dana@maplecourt.com', DirtLevel: '', Services: '', DraftData: '', Notes: '', UnitOccupied: false, NeedsOfficeAccess: false, OfficeNeedNotes: '', ServiceWindow: '', DelayReasonType: '', DelayReasonNotes: '', InspectionDate: '', InspectionWindow: '', InspectionDoneAt: '', BatchId: '', BuildingId: '', CompletedDate: '' };
const O = (o) => Object.assign({}, base, o);

const ORDERS = [
  O({ id: '12', createdDateTime: T(25, 10, 12), lastModifiedDateTime: T(25, 10, 12), OrderID: 'GS-1042-1012', Division: 'Renovations', Status: 'Received', BuildingNumber: '1215', UnitNumber: '205', Bedrooms: '2', Bathrooms: '1', EntryDate: T(29, 8), DueDate: T(2, 17, 0, 9) }),
  O({ id: '10', createdDateTime: T(22, 9, 30), lastModifiedDateTime: T(24, 11), OrderID: 'GS-1042-1010', Division: 'Janitorial', Status: 'Assigned', BuildingNumber: '1215', UnitNumber: '312', Bedrooms: '1', Bathrooms: '1', EntryDate: T(28, 8), DueDate: T(29, 17), ServiceWindow: '8:00 AM - 11:00 AM', Supervisor: 'Laura M.', DispatchDate: T(28, 8), UnitOccupied: false }),
  O({ id: '8', createdDateTime: T(20, 14, 5), lastModifiedDateTime: T(25, 16), OrderID: 'GS-1042-1008', Division: 'Renovations', Status: 'Change Requested', BuildingNumber: '1215', UnitNumber: '118', Bedrooms: '2', Bathrooms: '2', EntryDate: T(30, 8), DueDate: T(3, 17, 0, 9), ServiceWindow: '8:00 AM - 11:00 AM' }),
  O({ id: '14', createdDateTime: T(24, 15, 40), lastModifiedDateTime: T(24, 15, 40), OrderID: 'GS-1042-1014-PO5001', Division: 'Janitorial', Status: 'Received', BuildingNumber: '1215', UnitNumber: '401', Bedrooms: '2', Bathrooms: '1', EntryDate: T(1, 8, 0, 9), DueDate: T(2, 17, 0, 9), BatchId: 'PO5001' }),
  O({ id: '15', createdDateTime: T(24, 15, 40), lastModifiedDateTime: T(24, 15, 40), OrderID: 'GS-1042-1015-PO5001', Division: 'Janitorial', Status: 'Received', BuildingNumber: '1215', UnitNumber: '402', Bedrooms: '1', Bathrooms: '1', EntryDate: T(1, 8, 0, 9), DueDate: T(2, 17, 0, 9), BatchId: 'PO5001' }),
  O({ id: '3', createdDateTime: T(14, 9), lastModifiedDateTime: T(18, 16), OrderID: 'GS-1042-0998', Division: 'Janitorial', Status: 'Completed', BuildingNumber: '1215', UnitNumber: '107', Bedrooms: '2', Bathrooms: '1', EntryDate: T(17, 8), DueDate: T(18, 17), ServiceWindow: '8:00 AM - 11:00 AM', CompletedDate: T(18, 15, 20) }),
  { id: 'd1', createdDateTime: T(25, 18), lastModifiedDateTime: T(25, 18, 20), OrderID: 'GS-1042-TEMP-0003', ClientID: CID, BusinessName: 'Maple Court Apartments', Division: 'Janitorial', Status: 'Incomplete', DirtLevel: '', Services: '', DraftServices: [{ ServiceName: 'Kitchen Deep Clean', Category: 'Residential', SubOption: '222-68', Level: 'Level 2', Quantity: '' }, { ServiceName: 'Bathroom Deep Clean', Category: 'Residential', SubOption: '222-70', Level: 'Level 2', Quantity: '' }], DraftData: '', BuildingNumber: '1215', UnitNumber: '220', Bedrooms: '1', Bathrooms: '1', CompletedDate: '', EntryDate: T(5, 8, 0, 9), DueDate: T(6, 17, 0, 9), Address: '1215 Grand Ave', Suite: '', City: 'Des Moines', Zip: '50309', Contact: '', Notes: '', ServiceWindow: '', DelayReasonType: '', DelayReasonNotes: '', UnitsData: '' }
];

const S = (Category, ServiceName, SubOption, Division, Level = '', Quantity = '') => ({ Category, ServiceName, SubOption, Division, Level, Quantity, NotCompleted: false, NotCompletedReason: '' });
const SERVICES = {
  'GS-1042-1012': [S('Residential', 'Interior Painting', '410-01', 'Renovations'), S('Residential', 'Interior Door Replacement', '410-12', 'Renovations', '', '2'), S('Residential', 'Carpet Replacement', '410-20', 'Renovations', '', '2')],
  'GS-1042-1010': [S('Residential', 'Unit Turnover Package', '300-01', 'Janitorial', 'Level 2'), S('Residential', 'Window Cleaning', '222-80', 'Janitorial', 'Level 1')],
  'GS-1042-1008': [S('Residential', 'Interior Painting', '410-01', 'Renovations'), S('Residential', 'Carpet Replacement', '410-20', 'Renovations', '', '3'), S('Residential', 'Blinds Replacement', '410-30', 'Renovations', '', '5')],
  'GS-1042-1014-PO5001': [S('Residential', 'Kitchen Deep Clean', '222-68', 'Janitorial', 'Level 2'), S('Residential', 'Bathroom Deep Clean', '222-70', 'Janitorial', 'Level 2')],
  'GS-1042-1015-PO5001': [S('Residential', 'Kitchen Deep Clean', '222-68', 'Janitorial', 'Level 2'), S('Residential', 'Bathroom Deep Clean', '222-70', 'Janitorial', 'Level 2')],
  'GS-1042-0998': [S('Residential', 'Unit Turnover Package', '300-01', 'Janitorial', 'Level 2')],
  'GS-1042-TEMP-0003': [S('Residential', 'Kitchen Deep Clean', '222-68', 'Janitorial', 'Level 2'), S('Residential', 'Bathroom Deep Clean', '222-70', 'Janitorial', 'Level 2')]
};
const created = (svcs, e, d) => 'SERVICES:' + JSON.stringify({ services: svcs.map(s => ({ Category: s.Category, ServiceName: s.ServiceName, SubOption: s.SubOption, Level: s.Level, Quantity: s.Quantity })), entryDate: e, dueDate: d });
const H = (ChangeType, ChangedBy, ChangeDate, extra = {}) => Object.assign({ Title: '', ChangeType, ChangedBy, ChangeDate, Notes: '', FieldChanged: 'Status', OldValue: '', NewValue: '' }, extra);
const HISTORY = {
  'GS-1042-1012': [H('Created', CID, T(25, 10, 12), { NewValue: created(SERVICES['GS-1042-1012'], '2026-09-29', '2026-10-02') })],
  'GS-1042-1010': [H('Created', CID, T(22, 9, 30), { NewValue: created(SERVICES['GS-1042-1010'], '2026-09-28', '2026-09-29') }),
    H('Order Assigned', 'GS Solutions', T(22, 13), { NewValue: JSON.stringify({ supervisor: 'Laura M.', dispatchDate: '2026-09-28', serviceWindow: '8:00 AM - 11:00 AM' }) }),
    H('Dates Confirmed', 'GS Solutions', T(22, 13, 1), { NewValue: JSON.stringify({ entryDate: '2026-09-28', dueDate: '2026-09-29', serviceWindow: '8:00 AM - 11:00 AM' }) })],
  'GS-1042-1008': [H('Created', CID, T(20, 14, 5), { NewValue: created(SERVICES['GS-1042-1008'], '2026-09-30', '2026-10-03') }),
    H('Order Assigned', 'GS Solutions', T(21, 10), { NewValue: JSON.stringify({ supervisor: 'Laura M.', dispatchDate: '2026-09-30', serviceWindow: '8:00 AM - 11:00 AM' }) }),
    H('Change Requested', 'GS Solutions', T(25, 16), { FieldChanged: 'Client Confirmation', Notes: 'Our team found 4 windows that need new blinds instead of 5, and the hallway also needs paint.', OldValue: 'SERVICES:' + JSON.stringify(SERVICES['GS-1042-1008']), NewValue: 'SERVICES:' + JSON.stringify([S('Residential', 'Interior Painting', '410-01', 'Renovations'), S('Residential', 'Carpet Replacement', '410-20', 'Renovations', '', '3'), S('Residential', 'Blinds Replacement', '410-30', 'Renovations', '', '4')]) })],
  'GS-1042-1014-PO5001': [H('Created', CID, T(24, 15, 40), { NewValue: created(SERVICES['GS-1042-1014-PO5001'], '2026-10-01', '2026-10-02') })],
  'GS-1042-1015-PO5001': [H('Created', CID, T(24, 15, 40), { NewValue: created(SERVICES['GS-1042-1015-PO5001'], '2026-10-01', '2026-10-02') })],
  'GS-1042-0998': [H('Created', CID, T(14, 9), { NewValue: created(SERVICES['GS-1042-0998'], '2026-09-17', '2026-09-18') }),
    H('Order Assigned', 'GS Solutions', T(14, 12), { NewValue: JSON.stringify({ supervisor: 'Laura M.', dispatchDate: '2026-09-17', serviceWindow: '8:00 AM - 11:00 AM' }) }),
    H('Completed', 'GS Solutions', T(18, 15, 20), { Notes: 'Order completed.' })]
};

const C = (id, sku, serviceName, division, propertyType, category, description, extra = {}) => Object.assign({ id, sku, serviceName, division, propertyType, price: null, category, description: description || '', areas: [], packageItems: [], levelPrices: null, active: true, requiresQuantity: false }, extra);
const CATALOG = [
  C('1', '222-68', 'Kitchen Deep Clean', 'Janitorial', 'Residential', 'Kitchen & Bathrooms', 'Degrease stove and hood, clean inside appliances, cabinets, counters, sink and floor.'),
  C('2', '222-70', 'Bathroom Deep Clean', 'Janitorial', 'Residential', 'Kitchen & Bathrooms', 'Tub, shower, toilet, sink, mirrors and floor.'),
  C('3', '222-72', 'Carpet Shampoo', 'Janitorial', 'Residential', 'Floors', 'Hot water extraction of all carpeted rooms.'),
  C('4', '222-74', 'Hard Floor Mop & Polish', 'Janitorial', 'Residential', 'Floors'),
  C('5', '222-80', 'Window Cleaning', 'Janitorial', 'Residential', 'Windows', 'Inside glass, frames and tracks.'),
  C('6', '222-82', 'Blinds Dusting', 'Janitorial', 'Residential', 'Windows'),
  C('7', '222-90', 'Wall Spot Cleaning', 'Janitorial', 'Residential', 'Walls & Doors'),
  C('8', '300-01', 'Unit Turnover Package', 'Janitorial', 'Residential', 'Package', 'Everything a unit needs between residents.', { packageItems: [{ sku: '222-68', level: 'Level 2' }, { sku: '222-70', level: 'Level 2' }, { sku: '222-72', level: 'Level 1' }, { sku: '222-80', level: 'Level 1' }] }),
  C('20', '410-01', 'Interior Painting', 'Renovations', 'Residential', 'Paint', 'Two coats on walls, standard colors.'),
  C('21', '410-12', 'Interior Door Replacement', 'Renovations', 'Residential', 'Doors', '', { requiresQuantity: true }),
  C('22', '410-20', 'Carpet Replacement', 'Renovations', 'Residential', 'Flooring', 'Remove old carpet and pad, install new, per room.', { requiresQuantity: true }),
  C('23', '410-30', 'Blinds Replacement', 'Renovations', 'Residential', 'Windows', '', { requiresQuantity: true }),
  C('24', '410-40', 'Drywall Repair', 'Renovations', 'Residential', 'Walls'),
  C('25', '410-50', 'Light Fixture Replacement', 'Renovations', 'Residential', 'Electrical', '', { requiresQuantity: true }),
  C('30', '510-01', 'Pressure Washing', 'Exteriors', 'Residential', 'Cleaning', 'Sidewalks, entries and patios.'),
  C('31', '510-10', 'Gutter Cleaning', 'Exteriors', 'Residential', 'Roof & Gutters'),
  C('32', '510-20', 'Snow Removal', 'Exteriors', 'Residential', 'Seasonal'),
  C('40', '222-01', 'Common Area Vacuuming', 'Janitorial', 'Commercial', 'Floors'),
  C('41', '222-02', 'Lobby Glass Cleaning', 'Janitorial', 'Commercial', 'Windows'),
  C('42', '222-03', 'Trash Removal', 'Janitorial', 'Commercial', 'General')
];
const oldCat = (type, dl) => ({ type, dirtLevels: dl, categories: {} });

const ph = (f, extra = {}) => Object.assign({ name: f + '.jpg', downloadUrl: '/mock-photos/' + f + '.jpg', serviceName: null, level: '', reason: '', caption: 'Sep 18, 2026 · 2:40 PM', sortKey: T(18, 14, 40), stage: 'work' }, extra);
const GALLERY = {
  groups: [
    { orderId: 'GS-1042-0998', division: 'Janitorial', status: 'Completed', date: T(17, 8), bedrooms: '2', bathrooms: '1', unitNumber: '107', completedDate: T(18, 15, 20), services: [{ name: 'Unit Turnover Package', level: 'Level 2' }],
      photos: [ph('kitchen', { serviceName: 'Kitchen Deep Clean', level: 'Level 2', caption: 'Sep 18, 2026 · 1:20 PM', sortKey: T(18, 13, 20) }), ph('bathroom', { serviceName: 'Bathroom Deep Clean', level: 'Level 2', caption: 'Sep 18, 2026 · 2:10 PM', sortKey: T(18, 14, 10) }), ph('carpet', { caption: 'Sep 18, 2026 · 1:55 PM', sortKey: T(18, 13, 55) }), ph('living', { caption: 'Sep 18, 2026 · 2:45 PM', sortKey: T(18, 14, 45) })] },
    { orderId: 'GS-1042-1010', division: 'Janitorial', status: 'Assigned', date: T(28, 8), bedrooms: '1', bathrooms: '1', unitNumber: '312', completedDate: '', services: [{ name: 'Unit Turnover Package', level: 'Level 2' }, { name: 'Window Cleaning', level: 'Level 1' }],
      photos: [ph('hallway', { caption: 'Sep 22, 2026 · 9:15 AM', sortKey: T(22, 9, 15) })] }
  ],
  docGroups: [
    { orderId: 'GS-1042-1012', clientLabel: 'Unit 205 · 1215 Grand Ave', date: T(25, 10, 30), docs: [
      { id: 'd1', orderId: 'GS-1042-1012', clientId: CID, name: 'Paint colors.pdf', size: 184320, by: 'Client', uploaderName: 'Dana Reyes', uploadedAt: T(25, 10, 30) }] },
    { orderId: 'GS-1042-0998', clientLabel: 'Unit 107 · 1215 Grand Ave', date: T(18, 15, 30), docs: [
      { id: 'd2', orderId: 'GS-1042-0998', clientId: CID, name: 'Completion report GS-1042-0998.pdf', size: 402000, by: 'Office', uploaderName: '', uploadedAt: T(18, 15, 30) }] }
  ]
};

const ADDRESSES = [
  { id: 'b1', label: 'Maple Court – North', buildingNumber: '1215', address: '1215 Grand Ave', suite: '', city: 'Des Moines', zip: '50309', contactId: '', monOpen: true, tueOpen: true, wedOpen: true, thuOpen: true, friOpen: true, satOpen: false, sunOpen: false, officeHours: '9:00 AM - 5:00 PM', archived: false },
  { id: 'b2', label: 'Maple Court – South', buildingNumber: '1219', address: '1219 Grand Ave', suite: '', city: 'Des Moines', zip: '50309', contactId: 'c2', monOpen: true, tueOpen: true, wedOpen: true, thuOpen: true, friOpen: true, satOpen: false, sunOpen: false, officeHours: '9:00 AM - 5:00 PM', archived: false }
];
const CONTACTS = [
  { id: 'c2', name: 'Marcus Hill', type: 'Email', value: 'marcus@maplecourt.com', notifyRecipient: false, archived: false },
  { id: 'c3', name: 'Front Desk', type: 'Phone', value: '(515) 555-0199', notifyRecipient: false, archived: false }
];
const PROFILE = { success: true, businessName: SESSION.businessName, contactPerson: 'Dana Reyes', contact: SESSION.contact, phone: SESSION.phone, address: SESSION.address, suite: '', city: 'Des Moines', zip: '50309', notificationsEnabled: true, notifyConfirmations: true, notifyChanges: true, notifyUpdates: true, monOpen: true, tueOpen: true, wedOpen: true, thuOpen: true, friOpen: true, satOpen: false, sunOpen: false, officeHours: '9:00 AM - 5:00 PM', changesLogged: 0 };
const TEMPLATES = [
  { id: 't1', name: 'Standard unit turn', division: 'Janitorial', mine: true, services: [S('Residential', 'Kitchen Deep Clean', '222-68', 'Janitorial', 'Level 2'), S('Residential', 'Bathroom Deep Clean', '222-70', 'Janitorial', 'Level 2'), S('Residential', 'Carpet Shampoo', '222-72', 'Janitorial', 'Level 1'), S('Residential', 'Window Cleaning', '222-80', 'Janitorial', 'Level 1')] },
  { id: 't2', name: 'Paint & carpet refresh', division: 'Renovations', mine: true, services: [S('Residential', 'Interior Painting', '410-01', 'Renovations'), S('Residential', 'Carpet Replacement', '410-20', 'Renovations', '', '2')] }
];
const RECURRING = { contracts: [
  { id: '17', buildingNumber: '1215', division: 'Janitorial', daysOfWeek: 'Mon, Wed, Fri', time: '6:00 PM', activeSince: '2026-06-01',
    Services: [{ ServiceName: 'Common Area Vacuuming', Level: 'Level 2' }, { ServiceName: 'Lobby Glass Cleaning', Level: 'Level 1' }, { ServiceName: 'Trash Removal', Level: '' }],
    clientPhotos: [], history: [{ ChangeType: 'Completed', ChangeDate: T(21, 21), ChangedBy: 'GS Solutions', Notes: 'Visit completed.' }, { ChangeType: 'Completed', ChangeDate: T(23, 21), ChangedBy: 'GS Solutions', Notes: 'Visit completed.' }, { ChangeType: 'Completed', ChangeDate: T(25, 21), ChangedBy: 'GS Solutions', Notes: 'Visit completed.' }] }
] };
const HOLIDAYS = { holidays: [
  { id: 'h1', name: 'Thanksgiving', date: '2026-11-26', choiceId: 'x1', isOpen: false, openTime: '', closeTime: '' },
  { id: 'h2', name: 'Christmas Day', date: '2026-12-25', choiceId: 'x2', isOpen: false, openTime: '', closeTime: '' },
  { id: 'h3', name: 'New Year\'s Day', date: '2027-01-01', choiceId: null, isOpen: null, openTime: '', closeTime: '' },
  { id: 'h4', name: 'Memorial Day', date: '2027-05-31', choiceId: null, isOpen: null, openTime: '', closeTime: '' }
] };

function detail(orderId) {
  const o = ORDERS.find(x => x.OrderID === orderId);
  if (!o) return { __status: 404, error: 'Order not found' };
  const order = Object.assign({ PackageContents: JSON.stringify({ '300-01': [{ sku: '222-68', serviceName: 'Kitchen Deep Clean', level: 'Level 2' }, { sku: '222-70', serviceName: 'Bathroom Deep Clean', level: 'Level 2' }, { sku: '222-72', serviceName: 'Carpet Shampoo', level: 'Level 1' }, { sku: '222-80', serviceName: 'Window Cleaning', level: 'Level 1' }] }), Supervisor: '', DispatchDate: '', Archived: false,
    OrderNotificationsEnabled: '', OrderNotifyConfirmations: '', OrderNotifyChanges: '', OrderNotifyUpdates: '', OrderContactId: '', ExpectedReadyDate: '', MaterialsReady: false, MaterialsReadySeen: false, EntryTime: '08:00', AssignByService: false }, o);
  return { order, services: SERVICES[orderId] || [], history: HISTORY[orderId] || [], document: o.Status === 'Received' ? null : { name: orderId + '.pdf', revision: 1, webUrl: '', driveItemId: 'x' }, serviceAssignments: [] };
}

function api(route, body, query) {
  switch (route) {
    case 'validate-client':
      if (!body.clientId) return { valid: false };
      return STATE.verify ? { valid: true, verify: true, clientId: String(body.clientId).toUpperCase() } : SESSION;
    case 'verify-client': return SESSION;
    case 'register-client': return Object.assign({}, SESSION, { clientId: 'GS-1043' });
    case 'recover-client-id': return { found: true };
    case 'logout': case 'submit-contact': return { success: true };
    case 'get-services': return { Janitorial: oldCat('categorized_rooms', true), renovations: oldCat('categorized_trades', false), exteriors: oldCat('categorized_trades', false), catalog: CATALOG, serviceTimes: {}, recurringAllowed: false, pricesAllowed: false, usualSets: [] };
    case 'get-orders': return { orders: ORDERS };
    case 'get-order-detail': return detail(body.orderId);
    case 'save-draft': return { success: true, orderId: 'GS-1042-TEMP-0004' };
    case 'delete-draft': return { success: true, rowsDeleted: 1 };
    case 'submit-order': return body.Units ? { success: true, batchId: 'PO5002', orderIds: ['GS-1042-1016-PO5002', 'GS-1042-1017-PO5002'] } : { success: true, orderId: 'GS-1042-1016', id: '16' };
    case 'add-batch-unit': return { success: true, orderId: 'GS-1042-1018-PO5001' };
    case 'request-change': return { success: true, status: body.type === 'cancel' ? 'Cancellation Requested' : 'Change Requested' };
    case 'undo-request': return { success: true, status: 'Assigned' };
    case 'confirm-change': return { success: true, status: 'Received' };
    case 'confirm-reactivation': return { success: true, status: 'Assigned' };
    case 'save-order-notifications': case 'save-expected-ready-date': case 'save-unit-occupied': return { success: true };
    case 'set-materials-ready': return { success: true, materialsReady: !!body.materialsReady };
    case 'get-client-gallery': return GALLERY;
    case 'get-client-order-photos': { const g = GALLERY.groups.find(x => x.orderId === body.orderId); return { photos: g ? g.photos : [] }; }
    case 'get-recurring-gallery': return { photos: [{ name: 'lobby.jpg', downloadUrl: '/mock-photos/lobby.jpg', visitDate: '2026-09-25' }, { name: 'office.jpg', downloadUrl: '/mock-photos/office.jpg', visitDate: '2026-09-23' }] };
    case 'upload-client-photo': case 'upload-client-service-photo': case 'upload-client-recurring-photo': return { success: true, fileName: 'x.jpg', webUrl: '' };
    case 'order-docs':
      if (body.action === 'view') return { viewUrl: '/mock-photos/scope.html', downloadUrl: '/mock-photos/scope.pdf' };
      if (body.action === 'start-upload') return { uploadUrl: '/mock-upload' };
      if (body.action === 'finish-upload') return { doc: { id: 'd9', orderId: body.orderId, clientId: CID, name: body.fileName, size: 1000, by: 'Client', uploaderName: 'Dana Reyes', uploadedAt: new Date().toISOString() }, clientLabel: 'Unit 205 · 1215 Grand Ave' };
      return { success: true };
    case 'get-my-recurring': return RECURRING;
    case 'request-recurring-change': return { success: true };
    case 'update-client-profile': return Object.keys(body).length <= 2 ? PROFILE : Object.assign({}, PROFILE, { success: true });
    case 'get-client-addresses': return { addresses: ADDRESSES };
    case 'get-client-contacts': return { contacts: CONTACTS };
    case 'save-client-address': return { success: true, addressId: 'b3', contactId: '' };
    case 'save-client-contact': return { success: true, contactId: 'c9' };
    case 'get-holidays': return HOLIDAYS;
    case 'save-client-holiday': return { success: true, id: 'x9' };
    case 'list-templates': return { templates: TEMPLATES };
    case 'save-template': return { success: true, id: 't9' };
    case 'delete-template': return { success: true };
    default: return { __status: 404, error: 'Unknown endpoint: ' + route };
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };
http.createServer((req, resp) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__verify') { STATE.verify = u.searchParams.get('on') === '1'; resp.end('ok'); return; }
  if (u.pathname === '/mock-upload') { req.resume(); req.on('end', () => { resp.writeHead(200, { 'Content-Type': 'application/json' }); resp.end('{"id":"item9"}'); }); return; }
  if (u.pathname.startsWith('/api/')) {
    const route = u.pathname.split('/').pop();
    if (route === 'site-image') {
      const n = u.searchParams.get('name');
      const f = n ? path.join(HERE, 'assets', path.basename(n)) : '';
      if (f && fs.existsSync(f)) { resp.writeHead(200, { 'Content-Type': 'image/jpeg' }); fs.createReadStream(f).pipe(resp); }
      else { resp.writeHead(404, { 'Content-Type': 'application/json' }); resp.end('{"error":"not found"}'); }
      return;
    }
    if (route === 'get-order-document') { resp.writeHead(200, { 'Content-Type': 'application/pdf' }); fs.createReadStream(path.join(HERE, 'photos/scope.pdf')).pipe(resp); return; }
    let data = ''; req.on('data', c => data += c); req.on('end', () => {
      let body = {}; try { body = JSON.parse(data || '{}'); } catch (e) {}
      const q = Object.fromEntries(u.searchParams);
      const out = api(route, Object.assign({}, q, body), q); const st = out.__status || 200; delete out.__status;
      resp.writeHead(st, { 'Content-Type': 'application/json' }); resp.end(JSON.stringify(out));
    });
    return;
  }
  const file = u.pathname.startsWith('/mock-photos/') ? path.join(HERE, 'photos', path.basename(u.pathname)) : path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { resp.writeHead(404); resp.end('404'); return; }
  resp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(resp);
}).listen(PORT, () => console.log('orders mock on ' + PORT));
