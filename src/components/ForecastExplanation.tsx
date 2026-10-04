/**
 * Kort förklaring av måldatumsprognosen (Översikt → info-ikonen vid "mål ca …", Framsteg →
 * Historik → "Hur räknas prognosen?"): varför början går fort och varför prognosen är försiktig.
 */
export function ForecastExplanation() {
  return (
    <>
      I början går vikten ofta ner snabbt – mest vätska och glykogen, inte fett. Därför räknas de
      första två veckorna inte in i takten, och prognosen bygger på trenden först efter tre veckor
      och tolv vägningar (innan dess visas datumet enligt vald takt). Takten räknas på trendvikten
      de senaste fyra veckorna och blir aldrig snabbare än din valda takt eller 1 % av vikten per
      vecka. Varierar takten mycket visas ett intervall i stället för en månad.
    </>
  );
}
