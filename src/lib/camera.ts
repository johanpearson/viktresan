/** Kameravyn för progressbilder: stöd, felmeddelanden och bildtagning ur videon. */

/** Finns getUserMedia? Annars används filväljaren direkt. */
export function cameraSupported(): boolean {
  // mediaDevices saknas utanför säkra sammanhang (http), trots typen.
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  return typeof devices?.getUserMedia === 'function';
}

/** Text när kameran inte gick att öppna (nekad, saknas eller upptagen). */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
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
