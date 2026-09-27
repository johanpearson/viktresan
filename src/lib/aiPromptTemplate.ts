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
