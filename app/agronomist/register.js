import { PROVINCES, PROVINCES_RW } from '../districts.js';
import { api, ROLE_LABELS } from '../api.js';

// Kinyarwanda is a first draft and needs review by a native speaker.
const T = {
  en: {
    sub: 'For agronomists', title: 'Help farmers near you',
    lead: 'When Ijisho checks a bean leaf, farmers can send the photo and result to an agronomist on WhatsApp. Register to be one of them.',
    how1: 'Farmers see your name, role, organisation and districts, can search for you, and can message you on WhatsApp.',
    how2: 'You receive a link to the leaf photo with Ijisho’s result. You reply directly to the farmer.',
    how3: 'Every registration is checked before it appears. You can ask to be removed at any time.',
    name: 'Full name', phone: 'WhatsApp number', phoneHint: 'Rwandan number (MTN or Airtel). Farmers will message you here.',
    role: 'Your role', rolePick: 'Choose…', org: 'Organisation (optional)', orgPh: 'e.g. Kamonyi District, RAB Rubona, a cooperative',
    districts: 'Districts where you work (helps farmers find you)', langs: 'Languages you can reply in',
    note: 'Anything we should know? (optional)', notePh: 'e.g. the sectors you cover',
    consent: 'I agree that Ijisho shows my name, role, organisation, districts and WhatsApp number to farmers who use Ijisho, and that farmers may message me.',
    submit: 'Register', privacy: 'How Ijisho uses this information',
    errName: 'Please enter your name.', errPhone: 'Enter a Rwandan mobile number like 078 123 4567.', errRole: 'Choose your role.',
    errDistricts: 'Choose at least one district.', errConsent: 'Please agree so farmers can contact you.',
    errDup: 'This number is already registered. If you need to change something, contact theonestedev@gmail.com.',
    errBusy: 'Too many attempts. Please try again in an hour.', errNet: 'Could not send. Check your connection and try again.',
    sending: 'Sending…', doneTitle: 'Thank you!',
    doneText: 'Your registration has been received. Once it is checked, farmers will see you in Ijisho.',
    openApp: 'Open Ijisho', lang: 'Ikinyarwanda',
  },
  rw: {
    sub: 'Ku bajyanama b’ubuhinzi', title: 'Fasha abahinzi bo hafi yawe',
    lead: 'Iyo Ijisho risuzumye ikibabi cy’igishyimbo, abahinzi bashobora kohereza ifoto n’igisubizo ku mujyanama kuri WhatsApp. Iyandikishe ube umwe muri bo.',
    how1: 'Abahinzi babona izina ryawe, umurimo wawe, ikigo ukorera n’uturere ukoreramo, bashobora kugushakisha, kandi bashobora kukwandikira kuri WhatsApp.',
    how2: 'Wakira umurongo ugana ku ifoto y’ikibabi n’igisubizo cya Ijisho. Usubiza umuhinzi mu buryo butaziguye.',
    how3: 'Buri kwiyandikisha kurasuzumwa mbere yo kugaragara. Ushobora gusaba gukurwamo igihe icyo ari cyo cyose.',
    name: 'Amazina yombi', phone: 'Nimero ya WhatsApp', phoneHint: 'Nimero yo mu Rwanda (MTN cyangwa Airtel). Abahinzi bazakwandikira kuri iyi nimero.',
    role: 'Umurimo wawe', rolePick: 'Hitamo…', org: 'Ikigo (si ngombwa)', orgPh: 'urugero: Akarere ka Kamonyi, RAB Rubona, koperative',
    districts: 'Uturere ukoreramo (bifasha abahinzi kukubona)', langs: 'Indimi ushobora gusubizamo',
    note: 'Hari icyo dukwiye kumenya? (si ngombwa)', notePh: 'urugero: imirenge ukoreramo',
    consent: 'Nemeye ko Ijisho ryereka abahinzi barikoresha izina ryanjye, umurimo wanjye, ikigo nkorera, uturere nkoreramo na nimero yanjye ya WhatsApp, kandi ko abahinzi bashobora kunyandikira.',
    submit: 'Iyandikishe', privacy: 'Uko Ijisho rikoresha aya makuru',
    errName: 'Andika izina ryawe.', errPhone: 'Andika nimero ya telefoni yo mu Rwanda nka 078 123 4567.', errRole: 'Hitamo umurimo wawe.',
    errDistricts: 'Hitamo nibura akarere kamwe.', errConsent: 'Emera kugira ngo abahinzi bashobore kukwandikira.',
    errDup: 'Iyi nimero yamaze kwiyandikisha. Niba hari icyo ushaka guhindura, andikira theonestedev@gmail.com.',
    errBusy: 'Wagerageje kenshi. Ongera ugerageze nyuma y’isaha imwe.', errNet: 'Ntibyoherejwe. Reba murandasi maze wongere ugerageze.',
    sending: 'Biroherezwa…', doneTitle: 'Murakoze!',
    doneText: 'Kwiyandikisha kwawe kwakiriwe. Nikumara gusuzumwa, abahinzi bazakubona muri Ijisho.',
    openApp: 'Fungura Ijisho', lang: 'English',
  },
};

const $ = (s) => document.querySelector(s);
let lang = localStorage.getItem('ijisho-lang') || ((navigator.language || '').startsWith('rw') ? 'rw' : 'en');

function renderStatic() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-t]')) if (T[lang][el.dataset.t]) el.textContent = T[lang][el.dataset.t];
  for (const el of document.querySelectorAll('[data-ph]')) el.placeholder = T[lang][el.dataset.ph] || '';
  $('#lang').textContent = T[lang].lang;
  const role = $('#role');
  const current = role.value;
  role.replaceChildren(
    Object.assign(document.createElement('option'), { value: '', textContent: T[lang].rolePick }),
    ...Object.entries(ROLE_LABELS).map(([v, l]) => Object.assign(document.createElement('option'), { value: v, textContent: l[lang] })),
  );
  role.value = current;
  for (const lg of document.querySelectorAll('[data-province]')) {
    lg.textContent = lang === 'rw' ? PROVINCES_RW[lg.dataset.province] : lg.dataset.province;
  }
}

function buildDistricts() {
  const box = $('#districts');
  for (const [prov, list] of Object.entries(PROVINCES)) {
    const group = document.createElement('div');
    group.className = 'prov';
    const title = document.createElement('p');
    title.className = 'prov-name';
    title.dataset.province = prov;
    const checks = document.createElement('div');
    checks.className = 'checks';
    for (const d of list) {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" name="districts" value="${d}"> ${d}`;
      checks.append(l);
    }
    group.append(title, checks);
    box.append(group);
  }
}

function showErrors(fields) {
  for (const el of document.querySelectorAll('[data-err]')) el.hidden = !fields[el.dataset.err];
  const first = Object.keys(fields)[0];
  if (first) (document.querySelector(`[name="${first}"]`) || $('#districts')).scrollIntoView({ block: 'center', behavior: 'smooth' });
}

$('#lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'rw' : 'en';
  localStorage.setItem('ijisho-lang', lang);
  renderStatic();
});

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const data = {
    name: f.get('name'), phone: f.get('phone'), role: f.get('role'), organisation: f.get('organisation'),
    districts: f.getAll('districts'), languages: f.getAll('languages'), note: f.get('note'),
    consent: f.get('consent') === 'on', website: f.get('website'),
  };
  // Quick checks in the browser; the server checks everything again.
  const fields = {};
  if (!data.name || data.name.trim().length < 2) fields.name = 1;
  if (!/^(\+?250|0)?7[2389]\d{7}$/.test((data.phone || '').replace(/[\s-]/g, ''))) fields.phone = 1;
  if (!data.role) fields.role = 1;
  if (!data.districts.length) fields.districts = 1;
  if (!data.consent) fields.consent = 1;
  showErrors(fields);
  if (Object.keys(fields).length) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = T[lang].sending;
  $('#formErr').hidden = true;
  try {
    const r = await api('/api/agronomists', { method: 'POST', body: data });
    if (r.ok) {
      $('#form').hidden = true;
      $('#done').hidden = false;
      $('#done').scrollIntoView({ block: 'start' });
      return;
    }
    if (r.status === 422) return showErrors(r.data.fields || {});
    $('#formErr').textContent = r.status === 409 ? T[lang].errDup : r.status === 429 ? T[lang].errBusy : T[lang].errNet;
    $('#formErr').hidden = false;
  } catch {
    $('#formErr').textContent = T[lang].errNet;
    $('#formErr').hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = T[lang].submit;
  }
});

buildDistricts();
renderStatic();
