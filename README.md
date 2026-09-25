# Viktresan

Personlig viktloggning som PWA. All data stannar på din enhet – ingen server, inget konto.

```sh
npm ci
npm run dev
```

Se [CLAUDE.md](CLAUDE.md) för arkitektur, konventioner och kommandon.

## Säkerhetskopiering och återställning

Eftersom all data bara finns på enheten är det du själv som ansvarar för säkerhetskopian. Om
ingen export gjorts på 7 dagar visas en påminnelse på Översikt.

### Exportera

1. Gå till **Inställningar → Säkerhetskopia**.
2. Kryssa i **Kryptera med lösenord** om du vill (rekommenderas om filen ska ligga i molnet).
   Lösenordet måste ha minst 8 tecken och **går inte att återställa**.
3. Tryck **Exportera säkerhetskopia**. På telefonen öppnas delningsmenyn så att du kan spara
   filen i t.ex. Google Drive, Filer eller skicka den med e-post. Saknar webbläsaren stöd för
   delning laddas filen ner i stället.

Filen heter `viktresan-backup-ÅÅÅÅ-MM-DD.zip` och innehåller profil, alla mätningar och alla
bilder. En okrypterad fil går att öppna med vilket zip-program som helst (`backup.json` +
mappen `photos/`). En krypterad fil innehåller bara `backup.json` med krypteringsparametrar och
`backup.enc` (AES-256-GCM, nyckel härledd ur lösenordet med PBKDF2-SHA-256, 600 000 iterationer).

Inställningar som är knutna till enheten – till exempel låset – ingår inte.

### Återställa

1. Gå till **Inställningar → Säkerhetskopia → Välj säkerhetskopia** och välj zip-filen.
2. Är filen krypterad: ange lösenordet. Fel lösenord ger ett tydligt felmeddelande.
3. Granska förhandsvisningen (exportdatum, antal mätningar och bilder, period).
4. Välj hur datan ska importeras:
   - **Slå ihop med befintlig data** – nya poster läggs till. Finns samma post redan behålls den
     som ändrats senast. Din nuvarande profil behålls (saknas den används filens).
   - **Ersätt all befintlig data** – profil, mätningar och bilder på enheten raderas och ersätts
     med innehållet i filen.
5. Tryck **Importera**. Importen sker i ett svep – misslyckas den ändras ingenting.

Filen valideras innan något skrivs: filer som inte är säkerhetskopior från Viktresan, skadade
filer och filer från en nyare version av appen avvisas.

## Lås (valfritt)

Under **Inställningar → Lås** kan du slå på upplåsning med fingeravtryck (eller ansikte/skärmlås)
via WebAuthn. Appen låses då när den går i bakgrunden och när den startas. Låset är av som
standard.

Låset skyddar mot nyfikna blickar men krypterar inte datan på enheten. Försvinner nyckeln (t.ex.
efter att skärmlåset tagits bort) går appen bara att öppna igen genom att rensa webbplatsdatan –
exportera därför en säkerhetskopia innan du slår på låset.
