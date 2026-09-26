/**
 * Livsmedelskategorier för enheter: densitet (volym → gram), vilka enheter som
 * passar och gissade styckvikter.
 *
 * VÄRDENA ÄR UNGEFÄRLIGA. Densiteterna (g/ml) är typiska värden för kategorin
 * så som den mäts i ett dl-mått hemma – löst hällt, inte packat – sammanställda
 * för Viktresan utifrån svenska hushållsmått och receptsamlingar. De är inte
 * hämtade ur en officiell tabell och varierar mellan sorter och hur man mäter.
 * Enskilda livsmedel kan ha en egen densitet i `src/data/units.ts`.
 * Styckvikterna här är _gissningar_ som användaren får bekräfta eller justera
 * ("1 skiva ≈ 30 g, stämmer det?") innan de sparas som egen enhet.
 *
 * Kategorin bestäms (se `foodProfile` i `src/lib/units.ts`) av, i tur och ordning:
 * 1. en regel för livsmedlet i `src/data/units.ts`,
 * 2. namnmönster i `CATEGORY_RULES` (mot det normaliserade namnet),
 * 3. Livsmedelsverkets livsmedelsgrupp via `GROUP_RULES`,
 * 4. annars `ovrigt`.
 * Namnen går före gruppen eftersom grupperna är breda ("Mjölk och mjölkprodukter"
 * rymmer både mjölk, fil och grädde).
 */

export type FoodCategory =
  | 'dryck'
  | 'mjolk'
  | 'fil'
  | 'gradde'
  | 'efterratt'
  | 'olja'
  | 'matfett'
  | 'bredbart'
  | 'mjol'
  | 'socker'
  | 'sott'
  | 'gryn'
  | 'okokt'
  | 'kokt'
  | 'grot'
  | 'brod'
  | 'ost'
  | 'palagg'
  | 'agg'
  | 'frukt'
  | 'bar'
  | 'gronsak'
  | 'potatis'
  | 'kott'
  | 'korv'
  | 'fisk'
  | 'sas'
  | 'soppa'
  | 'ratt'
  | 'notter'
  | 'godis'
  | 'bakverk'
  | 'glass'
  | 'kryddor'
  | 'maltid'
  | 'ovrigt';

export interface CategoryInfo {
  label: string;
  /** Gram per ml, eller `null` när volym inte passar (kött, bröd …). */
  density: number | null;
  /**
   * Enheter som passar, vanligaste först (den blir förvald). Volymenheter tas
   * med bara om kategorin har en densitet; gram läggs alltid till sist.
   */
  units: readonly string[];
  /** Gissad vikt i gram för styckenheterna i `units` (bekräftas av användaren). */
  pieces: Readonly<Record<string, number>>;
}

export const CATEGORIES: Readonly<Record<FoodCategory, CategoryInfo>> = {
  dryck: {
    label: 'Drycker',
    density: 1.0,
    units: ['cl', 'dl', 'glas', 'ml', 'l'],
    pieces: {},
  },
  mjolk: {
    label: 'Mjölk och växtdrycker',
    density: 1.03,
    units: ['dl', 'glas', 'cl', 'ml', 'msk'],
    pieces: {},
  },
  fil: {
    label: 'Fil, yoghurt och kvarg',
    density: 1.05,
    units: ['dl', 'msk', 'ml'],
    pieces: {},
  },
  gradde: {
    label: 'Grädde och crème fraiche',
    density: 1.0,
    units: ['msk', 'dl', 'tsk', 'ml'],
    pieces: {},
  },
  efterratt: {
    label: 'Krämer, puddingar och mousse',
    density: 1.05,
    units: ['dl', 'portion', 'msk'],
    pieces: { portion: 150 },
  },
  olja: {
    label: 'Olja',
    density: 0.92,
    units: ['msk', 'tsk', 'dl', 'ml'],
    pieces: {},
  },
  matfett: {
    label: 'Smör och margarin',
    density: 0.93,
    units: ['msk', 'tsk'],
    pieces: {},
  },
  bredbart: {
    label: 'Bredbart (färskost, hummus, kaviar …)',
    density: 1.0,
    units: ['msk', 'tsk'],
    pieces: {},
  },
  mjol: {
    label: 'Mjöl och stärkelse',
    density: 0.6,
    units: ['dl', 'msk', 'tsk'],
    pieces: {},
  },
  socker: {
    label: 'Socker och sirap',
    density: 0.85,
    units: ['tsk', 'msk', 'dl'],
    pieces: {},
  },
  sott: {
    label: 'Sylt, marmelad och honung',
    density: 1.3,
    units: ['msk', 'tsk'],
    pieces: {},
  },
  gryn: {
    label: 'Gryn, flingor och kli',
    density: 0.4,
    units: ['dl', 'msk'],
    pieces: {},
  },
  okokt: {
    label: 'Ris, pasta, baljväxter m.m. – okokt',
    density: 0.8,
    units: ['dl', 'portion'],
    pieces: { portion: 70 },
  },
  kokt: {
    label: 'Ris, pasta, baljväxter m.m. – kokt',
    density: 0.65,
    units: ['dl', 'portion'],
    pieces: { portion: 200 },
  },
  grot: {
    label: 'Gröt och välling',
    density: 1.05,
    units: ['dl', 'portion'],
    pieces: { portion: 250 },
  },
  brod: {
    label: 'Bröd',
    density: null,
    units: ['skiva', 'st'],
    pieces: { skiva: 30, st: 60 },
  },
  ost: {
    label: 'Ost',
    density: null,
    units: ['skiva', 'bit'],
    pieces: { skiva: 10, bit: 20 },
  },
  palagg: {
    label: 'Skivat pålägg',
    density: null,
    units: ['skiva'],
    pieces: { skiva: 10 },
  },
  agg: {
    label: 'Ägg',
    density: null,
    units: ['st'],
    pieces: { st: 60 },
  },
  frukt: {
    label: 'Frukt',
    density: null,
    units: ['st', 'bit'],
    pieces: { st: 130, bit: 30 },
  },
  bar: {
    label: 'Bär',
    density: 0.6,
    units: ['dl', 'näve'],
    pieces: { näve: 40 },
  },
  gronsak: {
    label: 'Grönsaker, baljväxter och svamp',
    density: 0.5,
    units: ['st', 'dl', 'näve'],
    pieces: { st: 100, näve: 30 },
  },
  potatis: {
    label: 'Potatis och rotfrukter',
    density: 0.65,
    units: ['st', 'dl'],
    pieces: { st: 90 },
  },
  kott: {
    label: 'Kött, fågel och vilt',
    density: null,
    units: ['portion', 'bit'],
    pieces: { portion: 125, bit: 30 },
  },
  korv: {
    label: 'Korv',
    density: null,
    units: ['st', 'skiva', 'portion'],
    pieces: { st: 60, skiva: 10, portion: 125 },
  },
  fisk: {
    label: 'Fisk och skaldjur',
    density: null,
    units: ['portion', 'bit'],
    pieces: { portion: 125, bit: 30 },
  },
  sas: {
    label: 'Såser, dressingar och röror',
    density: 1.0,
    units: ['msk', 'dl', 'tsk'],
    pieces: {},
  },
  soppa: {
    label: 'Soppor och buljong',
    density: 1.0,
    units: ['dl', 'portion'],
    pieces: { portion: 300 },
  },
  ratt: {
    label: 'Lagade rätter',
    density: null,
    units: ['portion', 'bit'],
    pieces: { portion: 300, bit: 100 },
  },
  notter: {
    label: 'Nötter, frön och torkad frukt',
    density: 0.55,
    units: ['näve', 'msk', 'dl'],
    pieces: { näve: 30 },
  },
  godis: {
    label: 'Godis, choklad och snacks',
    density: null,
    units: ['bit', 'näve'],
    pieces: { bit: 10, näve: 25 },
  },
  bakverk: {
    label: 'Kakor, bullar och bakverk',
    density: null,
    units: ['st', 'bit'],
    pieces: { st: 40, bit: 50 },
  },
  glass: {
    label: 'Glass',
    density: 0.55,
    units: ['dl', 'st'],
    pieces: { st: 60 },
  },
  kryddor: {
    label: 'Kryddor och bakpulver',
    density: 0.6,
    units: ['tsk', 'krm', 'msk'],
    pieces: {},
  },
  maltid: {
    label: 'Sparad måltid',
    density: null,
    units: [],
    pieces: {},
  },
  ovrigt: {
    label: 'Övrigt',
    density: 1.0,
    units: ['portion', 'dl', 'msk', 'tsk'],
    pieces: { portion: 150 },
  },
};

/**
 * Korta eller tvetydiga ord som bara räknas som första ord i namnet ("Bar
 * energibar", "Te bryggt", "Nöt entrecote"), inte senare i namnet ("Pajfyllning bär").
 */
export const FIRST_WORD_ONLY: ReadonlySet<string> = new Set([
  'bar',
  'te',
  'ol',
  'vin',
  'rom',
  'al',
  'not',
  'ren',
  'gas',
  'hare',
  'lake',
  'sik',
  'kola',
  'hona',
  'fars',
  'must',
  'mjuk',
  'hart',
  'gris',
  'vita',
  'bruna',
  'svarta',
  'roda',
  'gula',
  'grona',
  'torkad',
]);

/**
 * Ord som inleder en tillsats ("Lax filé i olja", "Köttbullar m. sås"): namnet
 * klassas på det som står före.
 */
export const CONNECTIVES: ReadonlySet<string> = new Set([
  'm',
  'med',
  'i',
  'u',
  'utan',
  'el',
  'eller',
  'och',
  'till',
  'pa',
]);

export interface CategoryRule {
  category: FoodCategory;
  pattern: RegExp;
  exclude?: RegExp;
}

/** Mönster som matchar ett av orden i början av namnet (hela ordet). */
function first(...words: string[]): RegExp {
  return new RegExp(`^(?:${words.join('|')})(?: |$)`, 'u');
}

/** Tillagat, torkat, konserverat m.m. – råvarans kategori gäller inte längre. */
const PROCESSED =
  /(friterad|stekt|torkad|torkat|konserv|juice|saft|sylt|mos|soppa|sallad|chips|pure|stuvad|gratang|pulver|dryck|smoothie|paj|kaka|glass|kram|nektar(?!in)|kompott|sas|chutney|fyllning)/;

/**
 * Namnmönster mot det normaliserade namnet (gemener, å/ä → a, ö → o, se
 * `normalize` i foodSearch.ts). Första regeln som matchar gäller – specifika först.
 */
export const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: 'agg', pattern: first('agg', 'aggula', 'aggvita') },
  {
    category: 'mjolk',
    pattern: first(
      'mjolk',
      'mellanmjolk',
      'lattmjolk',
      'minimjolk',
      'standardmjolk',
      'mjolkdryck',
      'havredryck',
      'sojadryck',
      'mandeldryck',
      'risdryck',
      'artdryck',
      'kokosnotdryck',
      'sesamdryck',
      'kondenserad mjolk',
    ),
    exclude: /pulver/,
  },
  {
    category: 'fil',
    pattern: first(
      'filmjolk',
      'lattfil',
      'mellanfil',
      'filbunke',
      'yoghurt',
      'fruktyoghurt',
      'drickyoghurt',
      'yoghurtdryck',
      'havregurt',
      'soygurt',
      'kefir',
      'kvarg',
      'keso',
      'cottage',
      'vaniljkvarg',
      'rismal',
    ),
  },
  {
    category: 'gradde',
    pattern: first(
      '\\p{L}*gradde',
      'graddfil',
      'creme',
      'graddersattning',
      'kokosmjolk',
      'matlagningsbas',
      'fraiche',
    ),
    exclude: /tarta|sas/,
  },
  { category: 'glass', pattern: first('glass', 'glasstrut', 'sorbet', 'slush') },
  {
    category: 'efterratt',
    pattern: /^(\p{L}*(pudding|kram|mousse|pannacotta)|ris a la malta|tiramisu|marangsviss)( |$)/u,
    exclude: /^(fisk|sill|lax|kal|blod)pudding/,
  },
  { category: 'olja', pattern: /^\p{L}*olja( |$)/u },
  {
    category: 'matfett',
    pattern: first(
      'smor',
      'lattsmor',
      'bregott',
      '\\p{L}*margarin',
      'matfettsblandning',
      'kokosfett',
      'renfett',
      'flytande',
    ),
  },
  {
    category: 'bredbart',
    pattern: first(
      'farskost',
      'mjukost',
      'hummus',
      'rodbetshummus',
      'messmor',
      'jordnotssmor',
      'tahini',
      'notkram',
      'palaggskaviar',
      'kaviar',
      'tangkaviar',
      'ostkram',
      'skagenrora',
      '\\p{L}*rora',
      'havrebaserat bredbart',
    ),
    exclude: /aggrora/,
  },
  {
    category: 'mjol',
    pattern: first('\\p{L}*mjol', 'mjolblandning', 'majsstarkelse', 'potatismjol', 'mjolkpulver'),
  },
  {
    category: 'socker',
    pattern: first(
      '\\p{L}*socker',
      'sirap',
      'glykossirap',
      'sotningsmedel',
      'sorbitol',
      'farin',
      'brun farin',
    ),
    exclude: /sockerarter|sockerkaka/,
  },
  {
    category: 'sott',
    pattern: /^(\p{L}*sylt|\p{L}*marmelad|honung|gele|nutella|lemon curd)( |$)/u,
  },
  {
    category: 'grot',
    pattern: /^\p{L}*(grot|valling)( |$)/u,
  },
  {
    category: 'gryn',
    pattern: first(
      '\\p{L}*gryn',
      'fiberhavregryn',
      'grynblandning',
      '\\p{L}*flingor',
      'frukostflingor',
      'musli',
      'granola',
      '\\p{L}*kli',
      '\\p{L}*kross',
      'vetegroddar',
      'strobrod',
    ),
    exclude: /kokosflingor/,
  },
  {
    category: 'kokt',
    pattern:
      /^(ris|pasta|nudlar|makaroner|spagetti|bulgur|couscous|quinoa|matvete|mathavre|havreris|linser|kikartor|bonor|bon|vita|bruna|svarta|roda|gula|kidneybonor|sojabonor|mungbonor|bondbonor|akerbonor|graartor|artor|hirs|bovete|dinkel|amarant|korn|farro)( |$).*\bkokt/,
    exclude: /okokt|gryta|sallad|sas|soppa|malta/,
  },
  {
    category: 'okokt',
    pattern:
      /^(ris|pasta|nudlar|makaroner|spagetti|bulgur|couscous|quinoa|matvete|mathavre|havreris|linser|kikartor|kidneybonor|sojabonor|mungbonor|bondbonor|akerbonor|graartor|hirs|bovete|dinkel|amarant)( |$)/,
    exclude: /gryta|sallad|sas|soppa|konserv|malta|carbonara/,
  },
  { category: 'soppa', pattern: /^\p{L}*(soppa|buljong|borsjtj)( |$)/u },
  {
    category: 'sas',
    pattern:
      /^(\p{L}*sas|\p{L}*dressing|\p{L}*majonnas|ketchup|senap|\p{L}*senap|pesto|aioli|tzatziki|guacamole|\p{L}*salsa|ajvar|chutney|vinager|\p{L}*vinager|vinagrett|dippmix|fisksas|sojasas|miso|sky|tomatpure)( |$)/u,
  },
  {
    category: 'dryck',
    pattern:
      /^(varm choklad|lask|alkolask|julmust|paskmust|must|\p{L}*saft|\p{L}*juice|\p{L}*nektar|\p{L}*dryck|\p{L}*dricka|vatten|mineralvatten|kaffe|snabbkaffe|iskaffe|kaffedrink|latte|islatte|caffe|cafe|cappuccino|cortado|espresso|chai|te|orte|nyponte|ol|vin|cider|glogg|saftglogg|svagdricka|brannvin|gin|whisky|konjak|likor|punsch|starkvin|rom|vodka|smoothie|milkshake|havremust|energidryck|sportdryck|kombucha|tonic)( |$)/u,
    exclude: /pulver/,
  },
  {
    category: 'brod',
    pattern:
      /^(\p{L}*brod|hart|mjuk brod|baguette|bagel|ciabatta|toast|skorpor|knackemacka|knacke|wrap|tunnbrod|polarbrod|fralla|frallor|limpa|tortilla|pitabrod|naan|focaccia|tekaka|hamburgerbrod|korvbrod|scones|croissant|kavring)( |$)/u,
    exclude: /^(wienerbrod|vetebrod|strobrod|brodkrutonger|smorgas)/,
  },
  {
    category: 'ost',
    pattern:
      /^(ost|\p{L}*ost|halloumi|paneer|fromage|mozzarella|parmesan|feta|brie|cheddar|gouda|mesost)( |$)/u,
    exclude: /^(ostkaka|farskost|mjukost|salladsost kram|ost sas)/,
  },
  {
    category: 'palagg',
    pattern:
      /^(palaggskorv|salami|rostbiff|leverpastej|pastej|pate|lantpate|kalkon rokt|skinka|kassler|rokt|pressylta|rullsylta|kalvsylta|hushallssylta|grisfotter)( |$)/,
  },
  {
    category: 'korv',
    pattern: /^(korv|\p{L}*korv|falukorv|prinskorv|chorizo|kabanoss|wienerkorv|grillkorv)( |$)/u,
    exclude: /^(korvbrod|korvgryta|korvkaka|korvstroganoff)/,
  },
  {
    category: 'fisk',
    pattern:
      /^(fisk|\p{L}*fisk|abborre|lax|\p{L}*lax|regnbagslax|torsk|sill|\p{L}*sill|makrill|stromming|\p{L}*stromming|sej|kolja|rodspatta|flundra|halleflundra|tonfisk|raka|rakor|krabba|hummer|krafta|havskrafta|mussla|blamussla|ostron|blackfisk|bleckfisk|sardiner|sardeller|ansjovis|skarpsill|gadda|gos|sik|sikloja|roding|oring|al|braxen|lake|kummel|vitling|pangasiusmal|tilapia|hoki|marulk|piggvar|rodspatta|havsabborre|guldsparid|bockling|surstromming|lutfisk|surimi|pinklax|alaska|stenbitsrom|lojrom|fiskrom|sikrom|rom|pilgrimsmussla|kraftor|snigel)( |$)/u,
    exclude: /(soppa|gratang|sas|pudding|bullar|burgare|pinnar|pate|pastej|sallad)/,
  },
  {
    category: 'kott',
    pattern:
      /^(gris|not|kalv|lamm|ren|alg|hjort|radjur|vildsvin|vilt|kyckling|kalkon|anka|gas|hona|fasan|duva|hare|kanin|struts|hast|ripa|biff|\p{L}*biff|fars|\p{L}*fars|blandfars|kottfars|bacon|lever|\p{L}*lever|flaskkotlett|kotlett|schnitzel|kebabkott|pulled|oxfile|entrecote|flask|kottbullar|jarpar|frikadeller|wallenbergare|pannbiff|sojaprotein|soja|mykoprotein|tofu|tempeh|havreprotein|artprotein|veteprotein|quorn|groda|rimmat|renskav)( |$)/u,
    exclude: /(soppa|gryta|gratang|sas|sallad|pastej|pate|buljong|korv|panna)/,
  },
  {
    category: 'potatis',
    pattern:
      /^(potatis|farskpotatis|sotpotatis|klyftpotatis|kalrot|palsternacka|rotselleri|rotfrukter|jordartskocka|majrova|rodbeta|rodbetor|svartrot|rotpersilja|kalrabbi|pommes)( |$)/,
    exclude: /(soppa|mos|gratang|sallad|bullar|chips|stuvad|kroketter|krokett|bakelse|palt|lada)/,
  },
  {
    category: 'notter',
    pattern:
      /^(aprikos|banan|fikon|mango|papaya|persika|paron|apple|dadlar|gojibar|blabar|tranbar|nypon|frukt|russin) (torkad|torkade|torkat)( |$)/,
  },
  {
    category: 'bar',
    pattern:
      /^(\p{L}+bar|hallon|lingon|jordgubbar|jordgubbe|hjortron|nypon|odon|havtorn|aronia|krusbar)( |$)/u,
    exclude: PROCESSED,
  },
  {
    category: 'frukt',
    pattern:
      /^(apple|paron|banan|apelsin|kiwi|mango|ananas|persika|nektarin|plommon|aprikos|mandarin|klementin|clementin|smacitrus|grapefrukt|citron|lime|\p{L}*melon|vindruvor|druvor|fikon|avokado|papaya|granatapple|kaki|sharon|passionsfrukt|litchi|kumquat|physalis|guava|carambole|cherimoya|kvitten|kokosnot|paradisapple|frukt|kaktusfikon|noni|surkorsbar|sotkorsbar|korsbar)( |$)/u,
    exclude: PROCESSED,
  },
  {
    category: 'gronsak',
    pattern:
      /^(tomat|tomater|\p{L}*tomat|gurka|morot|morotter|lok|purjolok|vitlok|graslok|rodlok|schalottenlok|salladslok|silverlok|paprika|broccoli|blomkal|vitkal|rodkal|gronkal|brysselkal|svartkal|spetskal|savojkal|kinakal|palmkal|brunkal|surkal|kal|spenat|\p{L}*sallat|sallat|champinjon|\p{L}*svamp|svamp|kantarell|ostronskivling|zucchini|squash|aubergine|sparris|majs|majskolv|majskorn|artor|\p{L}*artor|bonor|\p{L}*bonor|haricots|linser|kikartor|selleri|stjalkselleri|fankal|rattika|radisa|okra|pumpa|groddar|\p{L}*groddar|ruccola|mangold|kronartskocka|oliver|bambuskott|vattenkastanj|nasslor|skott|\p{L}*skott|chilipeppar|ingefara|vitlok|gronsaker|gronsaksblandning|wokgronsaker|grona|vaxbonor|sockerartor|artskott|\p{L}*krasse|krasse|salladskal)( |$)/u,
    exclude:
      /(soppa|gratang|biff|sas|juice|sallad|stuvad|puré|pure|pulver|burgare|bullar|chips|dryck|mos|pudding|paj|lada|^\p{L}*skal( |$))/u,
  },
  {
    category: 'notter',
    pattern:
      /^(notter|\p{L}*notter|mandel|sotmandel|pistaschnotter|\p{L}*fro|russin|katrinplommon|dadlar|torkad|kokosflingor|japanmix|kastanjer|kakaobonor|cashew|branda)( |$)/u,
    exclude: /(olja|dryck|smor|sas)/,
  },
  {
    category: 'godis',
    pattern:
      /^(\p{L}*godis|choklad|mjolkchoklad|morkchoklad|vitchoklad|bakchoklad|karameller|kola|\p{L}*kola|lakrits|chips|\p{L}*chips|popcorn|ostbagar|jordnotsbagar|linsbagar|tuggummi|polkagris|klubba|godisklubba|skumboll|marmeladkonfekt|mintplattor|chokladpralin|chokladbiskvi|praliner|bar|fruktstang|maltkulor|knack|chokladkola)( |$)/u,
  },
  {
    category: 'bakverk',
    pattern:
      /^(\p{L}*kaka|\p{L}*kakor|kex|\p{L}*kex|\p{L}*bulle|\p{L}*bullar|muffins|\p{L}*muffins|munk|semla|wienerbrod|vetebrod|\p{L}*tarta|\p{L}*bakelse|kakor|brownie|cookie|vaffla|\p{L}*vaffla|crepes|pannkaka|mazariner|biskvi|\p{L}*biskvi|marang|toscabit|mjuk|punschrulle|arraksboll|chokladboll|dammsugare|kanelbulle|lussekatt|napoleonbakelse|baklava|petit choux|savoiardikex|mandelkubb|spettekaka|sockerkaka|cheesecake)( |$)/u,
    exclude:
      /^(majskaka|risgrynskaka|linskaka|potatiskaka|sesamkaka|kroppkakor|korvkaka|laxbullar|fiskbullar|sillbullar|potatisbullar|kottbullar)( |$)/,
  },
  {
    category: 'kryddor',
    pattern:
      /^(salt|peppar|svartpeppar|vitpeppar|kanel|kardemumma|spiskummin|gurkmeja|kryddnejlika|muskotnot|paprikapulver|chilipulver|kryddblandning|bakpulver|bikarbonat|jast|narinsjast|naringsjast|basilika|dill|persilja|koriander|gronmynta|timjan|oregano|rosmarin|lagerblad|saffran|vanilj|vaniljsocker|citronskal|apelsinskal|wasabi|pepparrot|kapris|gelatinblad|agar)( |$)/,
  },
  {
    category: 'ratt',
    pattern:
      /^(\p{L}*gryta|lasagne|pizza|\p{L}*paj|\p{L}*gratang|pirog|pytt|\p{L}*dolmar|dolma|sushi|falafel|hamburgare|\p{L}*burgare|kebab|kebabtallrik|taco|tacos|burrito|sandwich|biryani|paella|risotto|moussaka|\p{L}*sallad|\p{L}*lada|\p{L}*panna|kroppkakor|\p{L}*palt|pitepalt|lapskojs|kalpudding|pannbiff|stuvning|stuvade|\p{L}*suffle|nasi|tikka|nudelwok|\p{L}*wok|carbonara|tortellini|ravioli|gnocchi|vararulle|varrulle|vol au vent|borek|fatteh|pizzapalagg|smorgastarta|parisersmorgas|tunnbrodrulle|tunnbrodsrulle|pastagratang|korvgryta|korvstroganoff|kottfarssas|sojafarssas|mykoproteinfarssas|kalops|janssons|polsa|fiskpinnar|fiskbullar|laxbullar|sillbullar|potatisbullar|potatismos|rotmos|\p{L}*mos|pommes|kalvdans|ugnspannkaka|flaskpannkaka|raggmunk|blodpudding|blodpalt|pasta)( |$)/u,
  },
];

export interface GroupRule {
  category: FoodCategory;
  /** Mot den normaliserade gruppen (gemener, å/ä → a, ö → o). */
  pattern: RegExp;
}

/**
 * Livsmedelsverkets livsmedelsgrupper → kategori. Används när namnet inte gav
 * någon kategori. Matchar på nyckelord så att små namnändringar i grupperna
 * ("Fett, olja" / "Matfett och oljor") inte spelar någon roll.
 */
export const GROUP_RULES: readonly GroupRule[] = [
  { category: 'agg', pattern: /\bagg\b/ },
  { category: 'glass', pattern: /glass/ },
  { category: 'efterratt', pattern: /dessert|efterratt|pudding|kram/ },
  { category: 'fil', pattern: /\bfil\b|yoghurt|syrade|kvarg/ },
  { category: 'gradde', pattern: /gradde/ },
  { category: 'ost', pattern: /\bost\b|ostar/ },
  { category: 'mjolk', pattern: /mjolk|vaxtbaserade drycker|vaxtdryck/ },
  { category: 'olja', pattern: /olja|oljor/ },
  { category: 'matfett', pattern: /fett|smor|margarin/ },
  { category: 'grot', pattern: /grot|valling|barnmat/ },
  { category: 'gryn', pattern: /gryn|flingor|musli/ },
  { category: 'mjol', pattern: /mjol/ },
  { category: 'okokt', pattern: /\bris\b|pasta|spannmal|baljvaxter torkade/ },
  { category: 'brod', pattern: /brod|knacke/ },
  { category: 'bakverk', pattern: /kak|bakverk|bakelse|kex|konditori|finbrod/ },
  { category: 'godis', pattern: /godis|konfektyr|choklad|snacks|chips/ },
  { category: 'sott', pattern: /sylt|marmelad|honung/ },
  { category: 'socker', pattern: /socker|sotningsmedel|sirap/ },
  { category: 'soppa', pattern: /soppa|soppor|buljong/ },
  { category: 'sas', pattern: /sas|saser|dressing|kryddsas/ },
  { category: 'kryddor', pattern: /krydd/ },
  {
    category: 'dryck',
    pattern: /dryck|lask|juice|saft|vatten|kaffe|\bte\b|\bol\b|\bvin\b|sprit|alkohol/,
  },
  { category: 'korv', pattern: /korv/ },
  { category: 'palagg', pattern: /palagg|chark/ },
  { category: 'fisk', pattern: /fisk|skaldjur/ },
  {
    category: 'kott',
    pattern: /kott|fagel|vilt|inalvor|inalvsmat|kyckling|vegetariska proteinprodukter/,
  },
  { category: 'potatis', pattern: /potatis|rotfrukt/ },
  { category: 'frukt', pattern: /frukt/ },
  { category: 'bar', pattern: /\bbar\b/ },
  { category: 'notter', pattern: /notter|froer|fro\b/ },
  { category: 'gronsak', pattern: /gronsak|baljvaxt|svamp|rotsaker/ },
  { category: 'ratt', pattern: /ratt|ratter|maltid|pizza|paj|smorgas|fardig/ },
];
