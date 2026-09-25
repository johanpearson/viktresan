export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Delar filen via Web Share API (t.ex. till Google Drive eller e-post) om
 * webbläsaren kan dela filer, annars laddas den ner.
 */
export async function shareOrDownload(file: File): Promise<ShareResult> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Delningen misslyckades av annan anledning – ladda ner i stället.
    }
  }
  download(file);
  return 'downloaded';
}

export function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Ge webbläsaren tid att starta nedladdningen innan URL:en släpps.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
