/**
 * Bildbehandling för progressbilder: skalar ner, kodar om till WebP och tar
 * bort metadata (EXIF/GPS, XMP, IPTC) innan bilden sparas på enheten.
 */

/** Längsta sidan på en sparad bild, i pixlar. */
export const MAX_DIMENSION = 1080;
export const WEBP_QUALITY = 0.8;

export interface Size {
  width: number;
  height: number;
}

/** En avkodad bild, redan roterad enligt eventuell EXIF-orientering. */
export interface DecodedImage extends Size {
  source: CanvasImageSource;
  close(): void;
}

/** Avkodning/kodning. Utbytbar i tester (jsdom saknar canvas). */
export interface ImageCodec {
  decode(file: Blob): Promise<DecodedImage>;
  encode(image: DecodedImage, size: Size, type: string, quality: number): Promise<Blob>;
}

export interface CompressedImage extends Size {
  blob: Blob;
}

/** Skalar ner (aldrig upp) så att längsta sidan är högst `max`, med bibehållna proportioner. */
export function fitWithin(width: number, height: number, max = MAX_DIMENSION): Size {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Komprimerar en bild till högst `MAX_DIMENSION` px som WebP. Webbläsare som
 * inte kan koda WebP (äldre Safari ger PNG i stället) får JPEG.
 */
export async function compressImage(
  file: Blob,
  codec: ImageCodec = browserCodec,
): Promise<CompressedImage> {
  const image = await codec.decode(file);
  try {
    const size = fitWithin(image.width, image.height);
    let blob = await codec.encode(image, size, 'image/webp', WEBP_QUALITY);
    if (blob.type !== 'image/webp') {
      blob = await codec.encode(image, size, 'image/jpeg', WEBP_QUALITY);
    }
    return { blob: await stripMetadata(blob), ...size };
  } finally {
    image.close();
  }
}

/**
 * Tar bort metadata ur en WebP- eller JPEG-blob. Omkodning via canvas tar
 * redan bort originalets EXIF, men vi kontrollerar resultatet ändå så att
 * plats och kamerainformation garanterat aldrig sparas.
 */
export async function stripMetadata(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isWebp(bytes)) return new Blob([stripWebpMetadata(bytes)], { type: 'image/webp' });
  if (isJpeg(bytes)) return new Blob([stripJpegMetadata(bytes)], { type: 'image/jpeg' });
  return blob;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ']);
/** Flaggor i VP8X-chunken som talar om att EXIF (0x08) och XMP (0x04) finns. */
const VP8X_METADATA_FLAGS = 0x08 | 0x04;

/** Tar bort EXIF- och XMP-chunkar ur en WebP-fil (RIFF-container). */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!isWebp(bytes)) return concat([bytes]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.slice(0, 12)];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const end = Math.min(bytes.length, offset + 8 + size + (size % 2));
    if (!WEBP_METADATA_CHUNKS.has(fourcc)) {
      const chunk = bytes.slice(offset, end);
      if (fourcc === 'VP8X' && chunk.length > 8) {
        chunk[8] = (chunk[8] ?? 0) & ~VP8X_METADATA_FLAGS;
      }
      kept.push(chunk);
    }
    offset = end;
  }
  const out = concat(kept);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

/** APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) och kommentarer. APP0/APP2/APP14 behövs för färger. */
function isJpegMetadataMarker(marker: number): boolean {
  return marker === 0xe1 || marker === 0xed || marker === 0xfe;
}

/** Tar bort metadatasegment ur en JPEG-fil. Bilddata efter SOS kopieras orörd. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!isJpeg(bytes)) return concat([bytes]);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    // Start of scan: resten är komprimerad bilddata fram till EOI.
    if (marker === 0xda) break;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    const end = offset + 2 + length;
    if (!isJpegMetadataMarker(marker)) kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  kept.push(bytes.subarray(offset));
  return concat(kept);
}

/** Webbläsarens avkodare/kodare: createImageBitmap + (Offscreen)Canvas. */
export const browserCodec: ImageCodec = {
  async decode(file) {
    // 'from-image' roterar enligt EXIF-orienteringen, eftersom den taggen försvinner.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => {
        bitmap.close();
      },
    };
  },
  async encode(image, { width, height }, type, quality) {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(width, height);
      draw(canvas.getContext('2d'), image, width, height);
      return canvas.convertToBlob({ type, quality });
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), image, width, height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Kunde inte koda bilden'));
        },
        type,
        quality,
      );
    });
  },
};

function draw(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  image: DecodedImage,
  width: number,
  height: number,
): void {
  if (!ctx) throw new Error('Canvas stöds inte');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, width, height);
}
