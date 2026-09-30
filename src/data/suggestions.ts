/**
 * Startlistan för "Föreslå" (Mat): vanliga svenska mellanmål, frukostar och måltidskomponenter
 * som används när den egna historiken för en måltid är liten (kallstart). Varje förslag är
 * kopplat till ett livsmedel i Livsmedelsverkets (`lv:`) eller Finelis (`fi:`) databas med en
 * standardportion och de måltider det passar. Värdena per 100 g är en kopia av databasens
 * (kontrolleras mot public/livsmedel.json och public/fineli.json i suggestions.test.ts) och
 * används bara om databasen inte är laddad – annars gäller databasens aktuella värden.
 *
 * Blandningen: proteinrika (kvarg, ägg, fisk, kyckling), fiberrika (fullkorn, baljväxter, bär)
 * och energisnåla (grönsaker) alternativ. Portionerna är ungefärliga.
 */
import type { MealSlot, Nutrients } from '../lib/nutrition.ts';

export interface StartSuggestion {
  /** Livsmedlets id: `lv:<nummer>` eller `fi:<FOODID>`. */
  id: string;
  /** Namnet i databasen (reserv när databasen inte är laddad). */
  name: string;
  /** Per 100 g, som i databasen. */
  per100: Nutrients;
  /** Fiber per 100 g, `null` = saknas i databasen. */
  fiberG: number | null;
  /** Standardportionen: mängd i enheten (`g` = gram) … */
  amount: number;
  unit: string;
  /** … och vad den väger. */
  grams: number;
  /** Måltiderna förslaget passar. */
  slots: readonly MealSlot[];
}

function s(
  id: string,
  name: string,
  [kcal, proteinG, carbsG, fatG, fiberG]: [number, number, number, number, number | null],
  amount: number,
  unit: string,
  grams: number,
  slots: string,
): StartSuggestion {
  return {
    id,
    name,
    per100: { kcal, proteinG, carbsG, fatG },
    fiberG,
    amount,
    unit,
    grams,
    slots: slots.split(' ') as MealSlot[],
  };
}

// En rad per förslag: id, namn, [kcal, protein, kolhydrater, fett, fiber] per 100 g, mängd, enhet, gram, måltider.
// prettier-ignore
export const START_SUGGESTIONS: readonly StartSuggestion[] = [
  s('lv:3243', 'Kvarg naturell fett 0,2%', [64, 10, 5.2, 0.2, 0], 1.5, 'dl', 165, 'frukost mellanmal'),
  s('lv:7146', 'Yoghurt smaksatt m. sötningsm. fett 0% typ grekisk yoghurt', [59, 9.1, 5.1, 0.1, 0], 1.5, 'dl', 157.5, 'frukost mellanmal'),
  s('lv:70', 'Färskost cottage cheese naturell fett 4%', [100, 13.4, 1.9, 4.3, 0], 100, 'g', 100, 'frukost mellanmal lunch'),
  s('lv:2205', 'Ägg kokt', [136, 12.1, 0, 9.8, 0], 1, 'st', 60, 'frukost mellanmal'),
  s('lv:135', 'Yoghurt naturell lätt fett 0,5% berikad', [39, 3.6, 5, 0.5, 0], 2, 'dl', 210, 'frukost mellanmal'),
  s('lv:114', 'Filmjölk fett 3% berikad', [57, 3.3, 4.6, 2.8, 0], 2, 'dl', 210, 'frukost'),
  s('lv:2123', 'Havregrynsgröt fullkorn fiberhavregryn', [68, 1.8, 11.2, 1.3, 1.9], 1, 'portion', 250, 'frukost'),
  s('lv:6461', 'Chiapudding', [111, 3.2, 11, 5, 4.9], 1, 'portion', 150, 'frukost mellanmal'),
  s('lv:171', 'Hårt bröd fullkorn råg fibrer ca 14% typ rutknäcke', [356, 10, 65.3, 2.6, 14.2], 2, 'skiva', 24, 'frukost mellanmal lunch'),
  s('lv:3794', 'Bröd fullkorn vete råg fibrer ca 6%', [256, 7.4, 42.6, 4, 8.8], 1, 'skiva', 35, 'frukost mellanmal'),
  s('lv:77', 'Ost hårdost fett 10%', [226, 32.4, 1.5, 10, 0], 2, 'skiva', 20, 'frukost mellanmal'),
  s('fi:32257', 'Pålägg av helt kött, broilerpålägg, 2 % fett', [87, 13.8, 3.2, 2, 0.042], 2, 'skiva', 20, 'frukost mellanmal'),
  s('lv:590', 'Hallon frysvara', [48, 1.2, 7.6, 0.4, 4.5], 1, 'dl', 60, 'frukost mellanmal'),
  s('lv:555', 'Blåbär', [53, 0.7, 9.1, 0.8, 3.1], 1, 'dl', 60, 'frukost mellanmal'),
  s('lv:565', 'Kiwi grön', [53, 0.9, 9, 0.7, 3.3], 1, 'st', 75, 'frukost mellanmal'),
  s('lv:553', 'Banan', [95, 1.1, 21.3, 0.1, 1.4], 1, 'st', 120, 'frukost mellanmal'),
  s('lv:583', 'Päron', [54, 0.3, 11.5, 0.1, 2.7], 1, 'st', 150, 'mellanmal'),
  s('lv:588', 'Äpple m. skal', [48, 0, 10.6, 0, 2.3], 1, 'st', 150, 'mellanmal'),
  s('lv:551', 'Apelsin', [50, 0.8, 10.4, 0.2, 1.2], 1, 'st', 150, 'mellanmal'),
  s('lv:526', 'Jordgubbar', [41, 0.5, 8.3, 0.2, 1.9], 2, 'dl', 120, 'mellanmal'),
  s('lv:3051', 'Hummus kikärtsröra', [306, 5.8, 8.3, 26.5, 7.4], 2, 'msk', 30, 'mellanmal lunch'),
  s('lv:1576', 'Valnötter', [680, 13.8, 8.3, 64.8, 9], 20, 'g', 20, 'mellanmal'),
  s('fi:379', 'Mandel', [602, 24.1, 6.6, 51.2, 12.5], 20, 'g', 20, 'mellanmal'),
  s('lv:339', 'Gurka', [13, 0.8, 2.3, 0.1, 0], 100, 'g', 100, 'mellanmal lunch middag'),
  s('lv:4937', 'Tomat körsbärstomat röd', [25, 0.8, 4.4, 0.1, 1.5], 8, 'st', 120, 'mellanmal lunch middag'),
  s('lv:289', 'Morot', [36, 0.7, 6.6, 0.2, 2.4], 1, 'st', 75, 'mellanmal lunch middag'),
  s('lv:392', 'Paprika grön gul röd', [22, 0.5, 4, 0.2, 1.3], 1, 'st', 100, 'mellanmal lunch middag'),
  s('lv:888', 'Sojabönor torkade kokta u. salt', [128, 11, 5.8, 5.7, 5], 1, 'dl', 65, 'mellanmal lunch middag'),
  s('lv:1278', 'Tonfisk i vatten konserv. avrunnen', [106, 24.1, 0, 1, 0], 80, 'g', 80, 'mellanmal lunch middag'),
  s('lv:1395', 'Räka kokt', [77, 17.6, 0, 0.6, 0], 100, 'g', 100, 'lunch middag'),
  s('lv:1170', 'Kyckling bröstfilé färsk stekt u. skinn', [116, 23, 0, 2.5, 0], 1, 'portion', 125, 'lunch middag'),
  s('lv:1316', 'Lax stekt m. salt', [221, 24.1, 0.8, 13.5, 0], 1, 'portion', 125, 'lunch middag'),
  s('lv:1337', 'Torsk stekt', [108, 25.2, 0, 0.7, 0], 1, 'portion', 125, 'lunch middag'),
  s('fi:35619', 'Tofu, fast, sojapreparat', [154, 17.3, 0.5, 8.7, 2.3], 1, 'portion', 125, 'lunch middag'),
  s('lv:3762', 'Kikärtor torkade kokta m. salt', [133, 8.1, 12.6, 2.9, 12.3], 1, 'dl', 65, 'lunch middag'),
  s('lv:3816', 'Kidneybönor röda bönor konserv. u. lag', [110, 8.8, 13.4, 0.7, 7.2], 1, 'dl', 50, 'lunch middag'),
  s('fi:31225', 'Linser, röda, kokta', [101, 7.6, 15.6, 0.4, 1.9], 1, 'dl', 65, 'lunch middag'),
  s('lv:374', 'Gröna ärtor frysvara', [69, 5.2, 8.9, 0.4, 4.4], 1, 'dl', 50, 'lunch middag'),
  s('lv:325', 'Broccoli', [36, 2.9, 3.5, 0.6, 2.6], 150, 'g', 150, 'lunch middag'),
  s('lv:390', 'Sallad m. grönsallat gurka tomat u. dressing', [16, 0.9, 2.4, 0.1, 0.8], 1, 'portion', 300, 'lunch middag'),
  s('lv:3828', 'Pasta kokt m. salt fullkorn>50%', [161, 5.8, 29.9, 1, 3.7], 150, 'g', 150, 'lunch middag'),
  s('fi:1377', 'Fullkornsris, kokt utan salt', [145, 3.2, 28.5, 1.2, 2.96], 150, 'g', 150, 'lunch middag'),
  s('lv:4458', 'Potatis kokt m. salt', [83, 1.8, 17.5, 0.1, 2.1], 2, 'st', 180, 'lunch middag'),
];
