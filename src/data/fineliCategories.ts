/**
 * Finelis användningsklasser (FUCLASS, `fuclass_SV.csv`, version 18 och 20) → appens kategorier
 * för enheter och densitet (se foodCategories.ts). Används för livsmedel från
 * Fineli (`fi:`) när namnet inte gav någon kategori – samma ordning som för
 * Livsmedelsverkets grupper. Klasser som saknas här (övergripande klasser,
 * barnmat, näringspreparat) ger ingen kategori, dvs. `ovrigt` om inte namnet
 * säger något.
 *
 * Kommentaren efter varje kod är Finelis svenska benämning.
 */
import type { FoodCategory } from './foodCategories.ts';

export const FINELI_CLASSES: Readonly<Record<string, FoodCategory>> = {
  // Frukt och bär
  FRUDITOT: 'efterratt', // Frukt- och bärrätter
  FRUFRESH: 'frukt', // Färsk frukt
  FRUBSAL: 'frukt', // Frukt- och bärsallad
  BERFRESH: 'bar', // Färska bär
  FRUBSOUP: 'efterratt', // Kräm, soppor
  FRUBPAST: 'bakverk', // Bärpajer
  FRUBJUIC: 'dryck', // Juicer
  JAM: 'sott', // Sylt, marmelad
  // Grönsaker
  VEGDITOT: 'ratt', // Vegetariska rätter
  VEGFRESH: 'gronsak', // Färska grönsaker
  VEGPOT: 'gronsak', // Kokta grönsaker
  VEGDISH: 'ratt', // Vegetariska huvudrätter
  VEGCASS: 'ratt', // Grönsakslådor
  VEGSOUP: 'soppa', // Grönsakssoppor
  MUSHRDI: 'gronsak', // Svamprätter
  VEGCANN: 'gronsak', // Grönsakskonserver
  VEGJUICE: 'dryck', // Grönsaksjuice
  SALADTOT: 'ratt', // Sallader
  SALADVEG: 'gronsak', // Grönsakssallader
  SALADMIX: 'ratt', // Kombinerade sallader
  // Potatis
  POTATOT: 'potatis', // Potatis
  POTACOOK: 'potatis', // Kokt potatis
  POTADISH: 'ratt', // Potatisrätter
  POTAFAT: 'potatis', // Stekt potatis, gräddpotatis
  // Spannmål och bakverk
  BRMIX: 'brod', // Blandbröd, fullkornsbröd
  BRWHITE: 'brod', // Vetebröd ljust
  BRRYE: 'brod', // Rågbröd
  BUN: 'bakverk', // Kaffebröd
  BAKSWEET: 'bakverk', // Bakverk söta
  BISCUIT: 'bakverk', // Kex, småbröd
  BAKSALT: 'ratt', // Bakverk salta (piroger, pasteijer)
  SANDWICH: 'ratt', // Smörgåsar och hamburger
  RICEADD: 'kokt', // Ris
  PASTAADD: 'ratt', // Pastarätter
  PORR: 'grot', // Gröt
  CERBRKF: 'gryn', // Frukostspannmålsprodukter
  CERPR: 'ratt', // Pajer m.m.
  PIZZA: 'ratt', // Pizza
  // Mjölk och mjölkprodukter
  MILKDTOT: 'mjolk', // Mjölkrätter
  MILKFF: 'mjolk', // Mjölkdrycker fettfria
  MILKLF: 'mjolk', // Mjölkdrycker <2 %
  MILKHF: 'mjolk', // Mjölkdrycker >2 %
  SMILK: 'fil', // Surmjölk
  YOGHURT: 'fil', // Yoghurt
  MILKCURL: 'fil', // Fil
  CHEESHAR: 'ost', // Ost, hård
  CHEESOFT: 'ost', // Ost, smält- och färskost
  VEGCHEES: 'ost', // Ost med vegetabiliskt fett
  ICECREAM: 'glass', // Glass
  MILKPUDD: 'efterratt', // Mjölkdesserter
  MILKSAUC: 'sas', // Mjölksåser
  // Fett
  FATTOT: 'matfett', // Fett och fettprodukter
  BRFBUTT: 'matfett', // Brödfett smör eller mjölkfettblandning >60 %
  BRFMARG: 'matfett', // Brödfett margarin och matfett >55 %
  BRFLOWF: 'matfett', // Brödfett margarin, matfett och fettblandning <55 %
  DRESSING: 'sas', // Salladsdressing
  FATPROD: 'matfett', // Övriga fetter
  FATSAUCE: 'sas', // Fettsåser
  // Ägg, fisk och kött
  EGGDISH: 'ratt', // Äggrätter
  EGGS: 'agg', // Ägg
  EGGMIX: 'ratt', // Äggrätter
  FISHDTOT: 'ratt', // Fiskrätter
  FISH: 'fisk', // Fisk
  FISHCASS: 'ratt', // Fisklådor
  FISHSOUP: 'soppa', // Fisksoppa
  FISHDOTH: 'ratt', // Övriga fiskrätter
  FISHPROD: 'fisk', // Fiskprodukt
  MEATDTOT: 'ratt', // Kötträtter
  MSTEAK: 'kott', // Biffar, kotletter
  MINCMED: 'ratt', // Köttfärsrätter
  MEATPOT: 'ratt', // Köttgrytor
  MEATCASS: 'ratt', // Köttlådor
  MEATSOUP: 'soppa', // Köttsoppor
  POULTDI: 'ratt', // Hönsrätter
  SAUSAGE: 'palagg', // Kött- och korvpålägg (korv känns igen på namnet)
  SAUSDISH: 'ratt', // Korvrätter
  OFFALDI: 'ratt', // Inälvsrätter
  // Drycker (alkohol räknas aldrig som dryck i dryckesmålet – se isAlcoholic)
  BEVTOT: 'dryck', // Drycker
  COFFEE: 'dryck', // Kaffe
  TEA: 'dryck', // Te
  DRWATER: 'dryck', // Vatten
  DRJUICE: 'dryck', // Safter
  DRINKSO: 'dryck', // Söta läskedrycker
  DRINKCO: 'dryck', // Koffeinhaltiga läskedrycker
  DRINKART: 'dryck', // Syntetiskt sötade drycker
  DRSPORT: 'dryck', // Sportdrycker
  ALCTOT: 'dryck', // Alkoholdrycker
  BEER: 'dryck', // Öl
  WINE: 'dryck', // Vin
  SPIRIT: 'dryck', // Starksprit
  ALCOTH: 'dryck', // Övriga alkoholdrycker
  // Socker och övrigt
  SUGARTOT: 'socker', // Socker, sötsaker
  SUGADD: 'socker', // Socker, sirap
  SWEET: 'godis', // Sötsaker
  CHOCOL: 'godis', // Choklad
  SPICES: 'kryddor', // Kryddor
  SNACK: 'godis', // Snacks
  SPISAUCE: 'sas', // Kryddsåser
  // Klasser som tillkom i version 20
  FRUBDISH: 'efterratt', // Frukt- och bärrätter med undantag pajer
  LEGUMES: 'gronsak', // Baljväxter
  LEGUPROD: 'kott', // Baljväxtprodukter (tofu, sojafärs – som vegetariska proteinprodukter)
  LEGUDISH: 'ratt', // Baljväxträtter
  LEGUSOUP: 'soppa', // Baljväxtsoppor
  LEGUSAUC: 'sas', // Baljväxtsåser
  VEGSAUC: 'sas', // Grönsakssåser
  SALADMAY: 'ratt', // Majonnässallader
  POTAFRIE: 'potatis', // Stekt potatis, pommes frites
  PANCAKE: 'bakverk', // Pannkakor
  BISCUSWE: 'bakverk', // Söta kex och småbröd
  BISCUSAV: 'brod', // Smörgåskex
  CERBAR: 'godis', // Spannmålsstänger
  FLOUR: 'mjol', // Mjöl
  CREAM: 'gradde', // Grädde
  CURD: 'fil', // Kvarg
  SOUCREAM: 'fil', // Syrade mjölkprodukter
  CHEESCUR: 'ost', // Ost, mogen
  CHEESUNC: 'ost', // Färskost
  CHEESPRO: 'ost', // Smältost
  BUTTER: 'matfett', // Smör, mjölkfett
  FATANIM: 'matfett', // Animaliskt fett
  BUTTEHIG: 'matfett', // Matfettsblandning >= 55 %
  BUTTELOW: 'matfett', // Matfettsblandning < 55 %
  VEGFATLO: 'matfett', // Margarin och matfett <55 %
  VEGFATHI: 'matfett', // Margarin och matfett >= 55 %
  FATCOOK: 'matfett', // Matlagningsfett och industriellt fett
  SALADDRE: 'sas', // Salladsdressing och majonnäser
  OIL: 'olja', // Olja
  FISHDISH: 'ratt', // Fiskrätter
  FISHSAUC: 'sas', // Fisksåser
  SEAFOOD: 'fisk', // Skaldjur och mollusker
  SEAFDISH: 'ratt', // Skaldjursrätter
  SEAFSOUP: 'soppa', // Skaldjursoppa
  SEAFSAUC: 'sas', // Skaldjurssås
  MEATDISH: 'ratt', // Kötträtter
  POULTRY: 'kott', // Kycklingar och övriga fåglar
  POULTDIS: 'ratt', // Fågelrätter
  POULTSOU: 'soppa', // Fågelsoppor
  POULSAUC: 'sas', // Fågelsåser
  MEATPROD: 'kott', // Köttprodukter
  MEATSAUC: 'sas', // Köttsåser
  SAUSCUTS: 'palagg', // Korvpålägg (korv känns igen på namnet)
  MEATCUTS: 'palagg', // Köttpålägg
  DRINKOTH: 'dryck', // Övriga drycker
  CIDER: 'dryck', // Cider (alkohol räknas inte – se isAlcoholic)
  SAVSAUCE: 'sas', // Såser och buljonger
  DESSAUCE: 'sas', // Dessertsåser
  SNACKTOT: 'godis', // Snacks
  SNACKSAV: 'godis', // Salta snacks
  SNACKVEG: 'notter', // Nötter, frön och torkade frukter
  // Barnmat: bara grötarna har en tydlig kategori
  BABMILPO: 'grot', // Barngröt med mjölk
  BABWATPO: 'grot', // Barngröt med vatten
};

/** Kategorin för en användningsklass från Fineli, annars `null`. */
export function categoryFromFineliClass(code: string): FoodCategory | null {
  return FINELI_CLASSES[code.trim().toUpperCase()] ?? null;
}
