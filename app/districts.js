// Rwanda's 30 districts by province (same list as api/src/rwanda.js; a test checks they match).
export const PROVINCES = {
  'Kigali City': ['Gasabo', 'Kicukiro', 'Nyarugenge'],
  Northern: ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'],
  Southern: ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'],
  Eastern: ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'],
  Western: ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro'],
};
export const PROVINCES_RW = {
  'Kigali City': 'Umujyi wa Kigali', Northern: 'Intara y’Amajyaruguru', Southern: 'Intara y’Amajyepfo',
  Eastern: 'Intara y’Iburasirazuba', Western: 'Intara y’Iburengerazuba',
};
export const DISTRICTS = Object.values(PROVINCES).flat();
