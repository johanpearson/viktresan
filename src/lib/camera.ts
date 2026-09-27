/** Kameravyn för progressbilder: stöd, felmeddelanden och bildtagning ur videon. */

/** Finns getUserMedia? Annars används filväljaren direkt. */
export function cameraSupported(): boolean {
  // mediaDevices saknas utanför säkra sammanhang (http), trots typen.
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  return typeof devices?.getUserMedia === 'function';
}

/**
 * Text när kameran inte gick att öppna (nekad, saknas eller upptagen). `scanner` ger
 * streckkodsskannerns reserver (skriv in koden, välj bild) i stället för kameraappen.
 */
export function cameraErrorMessage(error: unknown, purpose: 'photo' | 'scanner' = 'photo'): string {
  const name = error instanceof DOMException ? error.name : '';
  const denied = name === 'NotAllowedError' || name === 'SecurityError';
  if (purpose === 'scanner') {
    return denied
      ? 'Appen fick inte använda kameran. Skriv in streckkoden eller välj en bild.'
      : 'Kameran gick inte att öppna. Skriv in streckkoden eller välj en bild.';
  }
  if (denied) {
    return 'Appen fick inte använda kameran. Ta bilden med kameraappen eller välj en från galleriet.';
  }
  return 'Kameran gick inte att öppna. Ta bilden med kameraappen eller välj en från galleriet.';
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Tar en bildruta ur videon som JPEG i full upplösning. Komprimering och
 * metadatarensning sker sedan med `compressImage`, precis som för en vald fil.
 */
export function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.videoWidth === 0 || video.videoHeight === 0) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
}
