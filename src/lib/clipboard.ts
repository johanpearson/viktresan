/** Kopiera och dela text (prompter till AI-tjänster). */

/** Kopierar text; reserv med markering + execCommand när Clipboard API saknas. */
export async function copyText(
  text: string,
  fallback: HTMLTextAreaElement | null,
): Promise<boolean> {
  try {
    // Clipboard API finns bara i säkra sammanhang (https, localhost).
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Prova reserven nedan.
  }
  if (!fallback) return false;
  fallback.select();
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reserv för äldre webbläsare
  return document.execCommand('copy');
}

/**
 * Delar text via Web Share (Androids delningsmeny). `unavailable` när API:t saknas eller
 * delningen misslyckades – anroparen kopierar då i stället.
 */
export async function shareText(text: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (typeof navigator.share !== 'function') return 'unavailable';
  try {
    await navigator.share({ text });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}
