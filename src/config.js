export const BUSINESS = {
  name: 'Luxury Detailing',
  subtitle: 'Auto detailing',
  place: 'Banjica, Beograd',
  address: 'Miloja Pavlovića 2, Banjica, Beograd',
  phones: [
    { label: '069/460 60 60', tel: '+381694606060' },
    { label: '061/191 97 19', tel: '+381611919719' },
  ],
  whatsapp: '381694606060',
  instagram: 'https://www.instagram.com/luxury_detailing_beograd/',
  instagramHandle: '@luxury_detailing_beograd',
  facebook:
    'https://www.facebook.com/people/Luxury-Detailing-Beograd/61561847549056/?ref=NONE_xav_ig_profile_page_web#',
}

// Sekcija ispod animacije: pitanje kao nadnaslov, odgovor kao naslov, pa lista koraka.
export const PROCESS = {
  eyebrow: 'Zašto naš detailing traje ceo dan?',
  title: 'Naš tretman je toliko zahtevan da traje ceo dan.',
  text: 'Jer sa vašim autom radimo sve ovo, korak po korak:',
}

// text = pun opis (računar), short = skraćen opis (telefon). Skraćeni su samo isečeni iz punih, bez novih tvrdnji.
export const STEPS = [
  {
    title: 'Prijem i pregled auta',
    text: 'Auto stiže u radionicu i pregleda se sa svih strana. Beleži se stanje laka i postojeća oštećenja pre nego što počne bilo kakav rad.',
    short: 'Auto se pregleda sa svih strana, a stanje laka i oštećenja se beleže pre rada.',
  },
  {
    title: 'Mikroogrebotine',
    text: 'Pod jakim svetlom se vide sitne ogrebotine i kovitlaci u laku koji na dnevnom svetlu promaknu. To su mikroogrebotine, zbog kojih lak izgleda mutno.',
    short: 'Pod jakim svetlom se vide sitne ogrebotine i kovitlaci zbog kojih lak izgleda mutno.',
  },
  {
    title: 'Merenje debljine laka',
    text: 'Debljina laka se meri uređajem na više tačaka. Tako se zna koliko laka ima i koliko se bezbedno sme skinuti pri poliranju.',
    short: 'Debljina laka se meri na više tačaka, da se zna koliko se sme bezbedno skinuti.',
  },
  {
    title: 'Dekontaminacija laka',
    text: 'Lak se opere i očisti od svega što obično pranje ne skida: čestica, smole i naslaga. Površina mora biti potpuno čista pre poliranja.',
    short: 'Lak se čisti od čestica, smole i naslaga koje obično pranje ne skida.',
  },
  {
    title: 'Višeslojno poliranje',
    text: 'Mašinsko poliranje u više prolaza, od grubljih ka finijim pastama, uklanja mikroogrebotine i vraća laku dubinu i sjaj.',
    short: 'Poliranje u više prolaza, od grubljih ka finijim pastama, uklanja ogrebotine i vraća sjaj.',
  },
  {
    title: 'Odmašćivanje',
    text: 'Posle poliranja površina se odmašćuje da na laku ne ostanu ulja i ostaci paste. Samo potpuno čist lak pravilno prima zaštitu.',
    short: 'Odmašćivanje uklanja ulja i ostatke paste, da lak pravilno primi zaštitu.',
  },
  {
    title: 'Nanošenje keramike',
    text: 'Keramički premaz se nanosi pažljivo, deo po deo karoserije, u tankom sloju.',
    short: 'Keramički premaz se nanosi deo po deo karoserije, u tankom sloju.',
  },
  {
    title: 'Kristalizacija',
    text: 'Premaz se kristališe i stvara tvrd, gladak zaštitni sloj koji štiti lak i daje mu sjaj.',
    short: 'Premaz se kristališe u tvrd, gladak sloj koji štiti lak i daje mu sjaj.',
  },
]

// Udeo skrola (0-1): do introEnd se vidi tekst sa ulaza; animacija ide ravnomerno do storyEnd,
// a ostatak skrola drži poslednji frejm pre nego što počne sledeća sekcija.
// introMinPx = najmanje piksela skrola pre nego što se tekst sa ulaza skloni, da ne nestane "na prvi dodir"
// kada je skrol kroz animaciju kratak (telefon).
export const TIMELINE = { introEnd: 0.06, storyEnd: 0.95, introMinPx: 90 }

// Koliko brzo animacija sustiže skrol: osnovna brzina + dodatak srazmeran zaostatku (u frejmovima).
export const FOLLOW = { base: 16, perFrame: 0.7, max: 70 }

// Dve odvojene animacije: uspravan prozor (telefon) koristi mobile, ostalo desktop.
// Frejmovi se zovu f_0001.webp, f_0002.webp...; count mora da odgovara broju fajlova u folderu.
// speed = koliko puta brže se animacija vrti po skrolu u odnosu na desktop (1 = osnovna brzina).
// Visina sekcije = 100vh (ekran) + 900vh / speed, pa veći speed = kraći skrol kroz animaciju.
// Svi frejmovi se i dalje prikazuju, samo se brže smenjuju. Za brže/sporije menjaj samo speed.
// size = dimenzije frejma u pikselima (canvas se na telefonu ne crta većim od toga, jer detalja više nema).
// Telefon ima dva sloja (vidi lib/sequence.js):
//   soft  = mali frejmovi (360x640), svaki ~2. izvorni frejm, svi ostaju dekodirani u memoriji. Stižu prvi,
//           pa se animacija odmah vrti bez zastoja, a pri brzom skrolu se crta uvek tačan frejm iz ovog sloja.
//   oštri = svi frejmovi (720x1280), dekodiraju se `around` frejmova sa svake strane trenutnog, a u memoriji
//           ostaju do `keep` frejmova od trenutnog. Crtaju se kad skrol uspori, i tada zamenjuju male.
// Desktop nema ove opcije: jedan sloj, sve dekodirano (192 x 3.7 MB).
// Frejmovi telefona se keširaju godinu dana (public/_headers): kad se promene, treba novi folder (m3...).
const sequence = (dir, count, speed, size, extra = {}) => ({
  dir,
  count,
  speed,
  size,
  scrollVh: Math.round(100 + 900 / speed),
  ...extra,
})

export const SEQUENCES = {
  desktop: sequence('/frames/desktop', 192, 1, [1280, 720]),
  mobile: sequence('/frames/m2', 240, 16, [720, 1280], {
    soft: { dir: '/frames/m2/s', count: 120 },
    around: 6,
    keep: 10,
  }),
}
