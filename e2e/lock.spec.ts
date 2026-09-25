import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { collectErrors, sendToBackground } from './helpers.ts';

/** Virtuell plattformsautentiserare (som ett fingeravtryckslås) via Chrome DevTools Protocol. */
async function addPlatformAuthenticator(page: Page): Promise<{ client: CDPSession; id: string }> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { client, id: authenticatorId };
}

const lockedHeading = (page: Page) => page.getByRole('heading', { name: 'Viktresan är låst' });

test('låset är av som standard', async ({ page }) => {
  await page.goto('./#/installningar');
  await addPlatformAuthenticator(page);
  await page.reload();
  await expect(page.getByRole('switch', { name: /Lås appen med fingeravtryck/ })).not.toBeChecked();
  await sendToBackground(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');
});

test('lås med fingeravtryck: låses i bakgrunden och vid start', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/installningar');
  const { client, id } = await addPlatformAuthenticator(page);
  await page.reload();

  const toggle = page.getByRole('switch', { name: /Lås appen med fingeravtryck/ });
  // Kontrollerad kryssruta som ändras först efter WebAuthn-dialogen – klicka och vänta.
  await toggle.tap();
  await expect(toggle).toBeChecked();
  const { credentials } = await client.send('WebAuthn.getCredentials', { authenticatorId: id });
  expect(credentials).toHaveLength(1);

  // Appen går i bakgrunden → låst, ingenting av appen syns.
  await sendToBackground(page);
  await expect(lockedHeading(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Huvudmeny' })).toBeHidden();

  // Misslyckad verifiering → fortfarande låst.
  await client.send('WebAuthn.setUserVerified', { authenticatorId: id, isUserVerified: false });
  await page.getByRole('button', { name: 'Lås upp' }).tap();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(lockedHeading(page)).toBeVisible();

  await client.send('WebAuthn.setUserVerified', { authenticatorId: id, isUserVerified: true });
  await page.getByRole('button', { name: 'Lås upp' }).tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');

  // Omladdning → låst från start.
  await page.reload();
  await expect(lockedHeading(page)).toBeVisible();
  await page.getByRole('button', { name: 'Lås upp' }).tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');

  // "Lås nu" och sedan stäng av låset.
  await page.getByRole('button', { name: 'Lås nu' }).tap();
  await expect(lockedHeading(page)).toBeVisible();
  await page.getByRole('button', { name: 'Lås upp' }).tap();
  await toggle.tap();
  await expect(toggle).not.toBeChecked();
  await sendToBackground(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inställningar');

  // Felet från den misslyckade verifieringen loggas inte som konsolfel.
  expect(errors).toEqual([]);
});

test('utan plattformsautentiserare kan låset inte slås på', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', {
      value: () => Promise.resolve(false),
    });
  });
  await page.goto('./#/installningar');
  await expect(page.getByTestId('lock-unsupported')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Lås appen/ })).toHaveCount(0);
});
