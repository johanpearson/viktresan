/**
 * Promptmallen för "Fråga AI". Redigera texten fritt – `{{namn}}` byts ut av
 * `buildAiPrompt` (aiPrompt.ts):
 *
 * - `{{amne}}`         vad som bedöms: "min frukost 26 sep", "min mat idag 26 sep", "min vecka 21–27 sep"
 * - `{{amneKort}}`     kort form: "måltiden", "dagen", "veckan"
 * - `{{underlag}}`     rader med det användaren valt att ta med (profil, mål, maten …)
 * - `{{kalorigolv}}`   lägsta dagsintag att föreslå, t.ex. "1 500 kcal"
 *
 * Tomma rader i början och slutet tas bort.
 */
export const AI_PROMPT_TEMPLATE = `
Hej! Jag följer min vikt och mat i en app och vill ha hjälp att förbättra {{amne}}.

{{underlag}}

Gör så här:
1. Bedöm kort {{amneKort}} mot mina mål (energi, protein, mättnad och näring).
2. Föreslå 2–3 konkreta, förbättrade varianter med ungefärliga kcal och gram protein för varje.
3. Prioritera mättnad och realism: vanliga svenska matvaror som finns i en vanlig mataffär, enkla att laga.
4. Föreslå aldrig något som gör att mitt dagsintag hamnar under {{kalorigolv}}.
5. Svara kort och på svenska, gärna i punktform.
`;

/** Rubriken före underlaget när användaren inte tagit med något. */
export const AI_PROMPT_NO_CONTEXT = 'Jag har valt att inte dela några uppgifter om mig själv.';

/**
 * Mallen för "Fråga AI om platån" (samma platshållare; `{{underlag}}` innehåller
 * platåanalysen om användaren tar med den).
 */
export const AI_PLATEAU_TEMPLATE = `
Hej! Jag följer min vikt i en app och vill ha hjälp att förstå {{amne}}.

{{underlag}}

Gör så här:
1. Förklara kort vad som mest sannolikt ligger bakom platån utifrån uppgifterna ovan. Kom ihåg att vätska och mätbrus kan dölja en nedgång i några veckor.
2. Föreslå 2–3 konkreta, realistiska justeringar jag kan prova de närmaste veckorna.
3. Föreslå aldrig ett dagsintag under {{kalorigolv}} och inga ändringar av läkemedelsdoser – det bestäms av förskrivaren.
4. Var saklig och uppmuntrande, svara kort och på svenska, gärna i punktform.
`;

/**
 * Mallen för "Vad ska jag äta?" (Mat). `{{amne}}` = "lunch idag"; `{{underlag}}` innehåller måltiden,
 * typisk portion, vad som är kvar av dagens mål och det som brukar finnas hemma.
 */
export const AI_WHAT_TO_EAT_TEMPLATE = `
Hej! Jag följer min vikt och mat i en app och undrar vad jag ska äta till {{amne}}.

{{underlag}}

Gör så här:
1. Ge mig 3 realistiska förslag som passar måltiden, med ungefärliga mängder och ungefärliga näringsvärden (kcal, gram protein och gram fiber) för varje.
2. Håll varje förslag nära min typiska portion för måltiden – fyll inte hela det som är kvar av dagen.
3. Utgå gärna från det som brukar finnas hemma. Vanliga svenska matvaror, enkla att laga.
4. Föreslå aldrig något som gör att mitt dagsintag hamnar under {{kalorigolv}}, och uppmana mig inte att äta för att nå ett mål om jag inte är hungrig.
5. Svara kort och på svenska, gärna i punktform.
`;
