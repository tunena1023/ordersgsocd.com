/* Guion de la guia movil: una imagen 9:16 por paso. Solo lo que el cliente ve en su portal. */
module.exports = [
  { cover: true, img: 'm01-home', title: 'How to use your Order Portal', text: 'A step-by-step guide for GS Solutions clients.<br><b>orders.gsocd.com</b>' },

  { sec: 'Getting started', img: 'm02-client-number', title: 'Sign in with your client number', text: 'Go to <b>orders.gsocd.com</b>, type your client number (for example GS-1042) and tap <b>Access Portal</b>.' },
  { sec: 'Getting started', img: 'm03-verify', title: 'Confirm it’s you', text: 'The first time you sign in on a device, enter the <b>ZIP code</b> or the <b>last 4 digits of a phone</b> on your account. Keep <b>Remember this device</b> checked so we don’t ask again.' },
  { sec: 'Getting started', img: 'm05-recover', title: 'Forgot your client number?', text: 'Tap <b>Forgot your client number?</b>, enter the email on your account and tap <b>Send My Client Number</b>. We’ll email it to you.' },
  { sec: 'Getting started', img: 'm04-register', title: 'New client? Register', text: 'Tap <b>First Time? Register</b>, fill in your business details and tap <b>Complete Registration</b>. You’re signed in right away.' },
  { sec: 'Getting started', img: 'm06-portal', title: 'Your portal at a glance', text: 'Use the tabs at the top: <b>New Order</b>, <b>Templates</b>, <b>Processing</b>, <b>History</b>, <b>Gallery</b>, <b>Recurring</b> and <b>Profile</b>. Swipe the bar to see them all.' },

  { sec: 'Place a new order', img: 'm07-step1', title: 'Step 1 · Where is this?', text: 'Enter the <b>building #</b>, <b>unit #</b>, <b>bedrooms</b> and <b>bathrooms</b>. Tap the building field to pick one of your saved buildings.' },
  { sec: 'Place a new order', img: 'm08-multi', title: 'More than one unit?', text: 'Switch <b>Single</b> to <b>Multi</b> to order several units at once. Tap <b>+ Add Another Unit</b> to add more.' },
  { sec: 'Place a new order', img: 'm09-division', title: 'Step 2 · Choose a division', text: 'Pick <b>Janitorial</b>, <b>Renovations</b>, <b>Exteriors</b> or <b>Mixed</b>. Use the <b>Commercial / Residential</b> switch to see the right services.' },
  { sec: 'Place a new order', img: 'm11-packages', title: 'Packages', text: 'Pick a <b>package</b> to add a full set of services in one tap, or choose one of <b>your saved packages</b>.' },
  { sec: 'Place a new order', img: 'm10-services', title: 'Or pick services one by one', text: 'Open a category and tap a level: <b>L1</b>, <b>L2</b> or <b>L3</b>. Some services ask for a <b>quantity</b> instead.' },
  { sec: 'Place a new order', img: 'm12-step3', title: 'Step 3 · Access & scheduling', text: 'Tell us anything we need from you, like keys or access codes. Then choose the <b>entry date</b>, the <b>time</b> and the <b>due date</b>.' },
  { sec: 'Place a new order', img: 'm13-datepicker', title: 'Picking a date', text: 'Tap a date field to open the calendar and tap the day you want.' },
  { sec: 'Place a new order', img: 'm15-summary', title: 'Check your order summary', text: 'Scroll down to see every service you picked. Tap <b>✕</b> to remove one.' },
  { sec: 'Place a new order', img: 'm14-photos', title: 'Add photos and submit', text: 'Add photos if you want to show us what needs attention (optional). Then tap <b>Submit Order</b>.' },
  { sec: 'Place a new order', img: 'm16-received', title: 'Order received', text: 'You’ll see your order number right away. Our office will email you the <b>date and arrival window within 24 hours</b>.' },
  { sec: 'Place a new order', img: 'm17-received-details', title: 'What happens next', text: 'Your confirmation shows the order details and the next steps. Tap <b>Track this order</b> to follow it.' },

  { sec: 'Track your orders', img: 'p01-processing', title: 'Processing', text: 'All your open orders are here, plus any orders you started and didn’t submit yet.' },
  { sec: 'Track your orders', img: 'p03-draft', title: 'Unfinished drafts', text: 'Orders you started are saved as <b>drafts</b>. Tap <b>Continue</b> to finish one, or <b>Delete draft</b> if you don’t need it.' },
  { sec: 'Track your orders', img: 'p02-active-list', title: 'Active orders', text: 'Each card shows the order number, unit, dates and <b>status</b>. Tap a card to open it.' },
  { sec: 'Track your orders', img: 'p04-received-open', title: 'Order details', text: 'See the entry and due dates, the service window, and the building, unit and bedrooms/bathrooms.' },
  { sec: 'Track your orders', img: 'p04b-services', title: 'Services requested', text: 'Tap <b>Services Requested</b> to see the list. Use the camera icon to add a photo of a specific service.' },
  { sec: 'Track your orders', img: 'p07-materials', title: 'Tell us when it’s ready', text: 'Turn on <b>Materials ready</b> (Renovations) or <b>Unit ready</b> (Janitorial) and choose when we can come in. Let us know if someone is living in the unit.' },
  { sec: 'Track your orders', img: 'p08-history', title: 'Order history', text: 'Every step of your order: created, assigned, schedule confirmed and more. Tap <b>details</b> to see more.' },
  { sec: 'Track your orders', img: 'p09-tracker', title: 'Order tracker', text: 'The tracker shows where your order is, from created to completed.' },

  { sec: 'Make changes', img: 'p05-received-buttons', title: 'Edit a new order', text: 'While your order is still <b>Received</b>, tap <b>Edit Order</b> to change it. Your changes go to our office for review.' },
  { sec: 'Make changes', img: 'p10-buttons', title: 'Your order buttons', text: '<b>Request Change</b>, <b>Cancel Request</b>, <b>Print PDF</b> and <b>Notifications</b>. Tap <b>+</b> to upload a document (PDF, Word or text, up to 25 MB).' },
  { sec: 'Make changes', img: 'p12-request-change-send', title: 'Request a change', text: 'Describe what you need and pick new dates or a preferred service window. Nothing changes until our office approves it — you’ll get the confirmed dates by email.' },
  { sec: 'Make changes', img: 'p13-cancel-dialog', title: 'Cancel an order', text: 'Tap <b>Cancel Request</b>, then <b>Request Cancellation</b>. Our office will review it and confirm. A cancelled order can’t be recovered.' },
  { sec: 'Make changes', img: 'p16-proposal-services', title: 'When we need your OK', text: 'If our team proposes a change, you’ll see the <b>proposed services</b> on the order. Review them and tap <b>Confirm</b> to apply it.' },
  { sec: 'Make changes', img: 'p14-order-notifications', title: 'Notifications for one order', text: 'Choose which emails you get for this order and who receives them. <b>Default</b> follows your Profile settings.' },
  { sec: 'Make changes', img: 'p18-po', title: 'Orders with several units', text: 'Multi-unit orders are grouped under one <b>PO</b>. Tap <b>+ Add a Unit</b> to add another unit to it.' },

  { sec: 'Templates', img: 't01-templates', title: 'Templates', text: 'Save the services you order often. Tap <b>Use</b> to start a new order with them — you’ll still add the unit and the dates.' },
  { sec: 'Templates', img: 't04-template-new', title: 'Create a template', text: 'Tap <b>+ New template</b>, give it a name, pick the services and tap <b>Save Template</b>.' },

  { sec: 'History & files', img: 'h02-history-open', title: 'History', text: 'Completed orders move to <b>History</b>. Open one to see the details and photos.' },
  { sec: 'History & files', img: 'h03-history-print', title: 'Completion report', text: 'Tap <b>Print PDF</b> to open the completion report for that order.' },
  { sec: 'History & files', img: 'g02-gallery-open', title: 'Gallery', text: 'Photos from your orders, grouped by order. Tap an order to open it, then tap any photo to see it full screen.' },
  { sec: 'History & files', img: 'g04-docs', title: 'Docs', text: 'All the documents from your orders in one place. Tap a file to view or download it.' },

  { sec: 'Recurring service', img: 'r02-recurring-open', title: 'Recurring service', text: 'If you have a standing cleaning contract, see its days, time, services and visit history here. Tap <b>Request a Change</b> to add or remove services.' },

  { sec: 'Your profile', img: 'u01-profile', title: 'Profile', text: 'Your business information, contacts and saved buildings. Tap <b>Edit</b> to update them.' },
  { sec: 'Your profile', img: 'u04-office-hours', title: 'Office hours & holidays', text: 'Tell us when someone will be there to let our crew in, and which holidays you’re open or closed.' },
  { sec: 'Your profile', img: 'u06-notifications', title: 'Your notifications', text: 'Choose which emails you get — <b>confirmations</b>, <b>changes</b> and <b>updates</b> — and who receives them.' },
  { sec: 'Your profile', img: 'u07-add-building', title: 'Add a building', text: 'Tap <b>+ Add Building</b> to save another property. You can choose it when you place an order.' },

  { sec: 'Need help?', img: 'x01-contact', title: 'Contact us', text: 'Tap <b>Contact</b> at the top to send us a message.' },
  { closing: true, title: 'Thank you for choosing GS Solutions', text: 'Questions? We’re here to help.<br><b>(515) 473-5990</b> · <b>orders@gsocd.com</b>' }
];
