// What Ijisho tells the farmer. English is the reference text.
// Kinyarwanda is a first draft and must be reviewed by a native speaker and an agronomist before field use.
// Advice is preventive and general on purpose: product and dose choices belong to an agronomist.

export const CONFIDENT = 0.7; // below this, Ijisho says it is not sure instead of guessing

export const T = {
  en: {
    title: 'Ijisho',
    tagline: 'Check a bean leaf for disease. Works offline.',
    take: 'Take a photo',
    upload: 'Choose a photo',
    tips: 'One bean leaf, in daylight, filling most of the photo.',
    checking: 'Checking the leaf…',
    loading: 'Getting ready…',
    ready: 'Ready, works offline',
    confidence: 'Confidence',
    again: 'Check another leaf',
    whatToDo: 'What to do',
    unsureTitle: 'Not sure',
    unsureText: 'Ijisho could not tell clearly from this photo.',
    unsureAdvice: [
      'Take a new photo of a single bean leaf in daylight, close enough that the leaf fills the photo.',
      'If you are still unsure, show the plant to your local agronomist or farmer promoter.',
    ],
    disclaimer: 'Ijisho helps you spot problems early. It does not replace an agronomist. It only knows bean leaves and two diseases.',
    credits: 'Model trained on field photos from the Makerere AI Lab and NaCRRI (MIT licence).',
    lang: 'Ikinyarwanda',
    error: 'Could not read this photo. Try another one.',
  },
  rw: {
    title: 'Ijisho',
    tagline: 'Suzuma ikibabi cy’igishyimbo urebe niba kirwaye. Ikora nta murandasi.',
    take: 'Fata ifoto',
    upload: 'Hitamo ifoto',
    tips: 'Ikibabi kimwe cy’igishyimbo, ku manywa, cyuzuye hafi ifoto yose.',
    checking: 'Turimo gusuzuma ikibabi…',
    loading: 'Biritegura…',
    ready: 'Byiteguye, bikora nta murandasi',
    confidence: 'Icyizere',
    again: 'Suzuma ikindi kibabi',
    whatToDo: 'Icyo wakora',
    unsureTitle: 'Ntibisobanutse',
    unsureText: 'Ijisho ntiryashoboye kubona neza kuri iyi foto.',
    unsureAdvice: [
      'Ongera ufotore ikibabi kimwe cy’igishyimbo ku manywa, ukegere ku buryo cyuzura ifoto.',
      'Niba bigikomeye, erekana igihingwa umujyanama w’ubuhinzi cyangwa umufashamyumvire w’abahinzi.',
    ],
    disclaimer: 'Ijisho rigufasha kubona ikibazo kare. Ntirisimbura umujyanama w’ubuhinzi. Rizi ibibabi by’ibishyimbo n’indwara ebyiri gusa.',
    credits: 'Ryatojwe ku mafoto yafatiwe mu mirima na Makerere AI Lab na NaCRRI (uruhushya rwa MIT).',
    lang: 'English',
    error: 'Iyi foto ntiyasomwe. Gerageza indi.',
  },
};

// Order must match the model's output order (see models/metrics.json).
export const CLASSES = ['angular_leaf_spot', 'bean_rust', 'healthy'];

export const RESULTS = {
  angular_leaf_spot: {
    tone: 'warn',
    en: {
      name: 'Angular leaf spot',
      what: 'A fungal disease. Look for brown or grey spots with straight edges, boxed in by the leaf veins.',
      advice: [
        'Remove badly infected leaves and burn or bury them away from the field.',
        'Do not work in the field while the leaves are wet; the disease spreads on wet hands and tools.',
        'Next season, plant certified clean seed and, if you can, a resistant variety.',
        'Rotate: wait at least two seasons before planting beans in this field again.',
        'If many plants are affected, ask your agronomist or agro-dealer which fungicide is approved and how to use it.',
      ],
    },
    rw: {
      name: 'Indwara y’utubara tw’impande',
      what: 'Ni indwara iterwa n’agahumyo. Reba utubara tw’ikigina cyangwa tw’ivu dufite impande zigororotse, tuzitiwe n’imitsi y’ikibabi.',
      advice: [
        'Kuraho ibibabi byarwaye cyane, ubitwike cyangwa ubitabe kure y’umurima.',
        'Ntukore mu murima amababi atose; indwara ikwirakwizwa n’intoki n’ibikoresho bitose.',
        'Igihembwe gitaha, tera imbuto zemewe kandi, niba bishoboka, ubwoko bwihanganira indwara.',
        'Simburanya ibihingwa: tegereza nibura ibihembwe bibiri mbere yo kongera gutera ibishyimbo muri uyu murima.',
        'Niba ibihingwa byinshi byarwaye, baza umujyanama w’ubuhinzi cyangwa ucuruza inyongeramusaruro umuti wemewe n’uko ukoreshwa.',
      ],
    },
  },
  bean_rust: {
    tone: 'warn',
    en: {
      name: 'Bean rust',
      what: 'A fungal disease. Look for small, raised, rust-coloured spots, often with a yellow ring, mostly under the leaf.',
      advice: [
        'Remove infected leaves early and destroy old bean stalks after harvest.',
        'Pull out beans that grow on their own between seasons; they carry the disease over.',
        'Leave enough space between plants so leaves dry quickly.',
        'Next season, plant a resistant variety and plant early in the season.',
        'If rust spreads fast, ask your agronomist or agro-dealer which fungicide is approved and how to use it.',
      ],
    },
    rw: {
      name: 'Ingese y’ibishyimbo',
      what: 'Ni indwara iterwa n’agahumyo. Reba utuntu duto tubyimbye dufite ibara ry’ingese, akenshi tuzengurutswe n’umuhondo, cyane cyane munsi y’ikibabi.',
      advice: [
        'Kuraho kare ibibabi byarwaye, kandi wangize ibisigazwa by’ibishyimbo nyuma yo gusarura.',
        'Randura ibishyimbo bimeze ubwabyo hagati y’ibihembwe; ni byo bitwara indwara.',
        'Siga intera ihagije hagati y’ibihingwa kugira ngo amababi yume vuba.',
        'Igihembwe gitaha, tera ubwoko bwihanganira indwara kandi uhinge kare.',
        'Niba ingese ikwirakwira vuba, baza umujyanama w’ubuhinzi cyangwa ucuruza inyongeramusaruro umuti wemewe n’uko ukoreshwa.',
      ],
    },
  },
  healthy: {
    tone: 'ok',
    en: {
      name: 'Looks healthy',
      what: 'No signs of angular leaf spot or bean rust on this leaf.',
      advice: [
        'Check your field once a week, including under the leaves.',
        'Check several plants in different parts of the field, not just one leaf.',
        'Keep the field weeded and the plants well spaced so leaves dry quickly.',
      ],
    },
    rw: {
      name: 'Gisa n’ikizima',
      what: 'Nta bimenyetso by’utubara tw’impande cyangwa ingese biri kuri iki kibabi.',
      advice: [
        'Suzuma umurima wawe rimwe mu cyumweru, harimo no munsi y’amababi.',
        'Suzuma ibihingwa byinshi mu bice bitandukanye by’umurima, si ikibabi kimwe gusa.',
        'Kura ibyatsi bibi kandi usige intera hagati y’ibihingwa kugira ngo amababi yume vuba.',
      ],
    },
  },
};
