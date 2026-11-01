// Rwanda's 30 districts by province. The app keeps the same list in app/districts.js (a test checks they match).
export const PROVINCES = {
  'Kigali City': ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  Northern: ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  Southern: ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'],
  Eastern: ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'],
  Western: ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro'],
};
export const DISTRICTS = Object.values(PROVINCES).flat();

export const ROLES = ['extension_officer', 'farmer_promoter', 'rab', 'cooperative', 'agro_dealer', 'ngo_private'];
export const LANGUAGES = ['rw', 'en', 'fr', 'sw'];

// Rwandan mobile numbers (078/079 MTN, 072/073 Airtel) in any common format; returns digits like 250781234567.
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  const intl = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (!intl && /^0?7[2389]\d{7}$/.test(d)) d = '250' + d.replace(/^0/, '');
  return /^2507[2389]\d{7}$/.test(d) ? d : null;
}
