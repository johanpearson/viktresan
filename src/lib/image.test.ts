import { describe, expect, it, vi } from 'vitest';
import {
  compressImage,
  fitWithin,
  MAX_DIMENSION,
  stripJpegMetadata,
  stripMetadata,
  stripWebpMetadata,
  type DecodedImage,
  type ImageCodec,
} from './image.ts';

const GPS_TEXT = 'GPS 59.3293N 18.0686E';
const enc = new TextEncoder();

function bytesOf(...parts: (number[] | string | Uint8Array)[]): Uint8Array<ArrayBuffer> {
  const arrays = parts.map((p) =>
    typeof p === 'string' ? enc.encode(p) : p instanceof Uint8Array ? p : Uint8Array.from(p),
  );
  const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function contains(haystack: Uint8Array, needle: string): boolean {
  return new TextDecoder('latin1').decode(haystack).includes(needle);
}

/** JPEG-segment: FF <marker> <längd inkl. längdfältet> <data>. */
function jpegSegment(marker: number, data: Uint8Array): Uint8Array {
  const length = data.length + 2;
  return bytesOf([0xff, marker, length >> 8, length & 0xff], data);
}

const SCAN_DATA = bytesOf([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0xff, 0x00, 0x33]);
const EOI = [0xff, 0xd9];

function jpegWithExif(): Uint8Array<ArrayBuffer> {
  return bytesOf(
    [0xff, 0xd8],
    jpegSegment(0xe0, bytesOf('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    jpegSegment(0xe1, bytesOf('Exif\0\0MM\0*', GPS_TEXT)),
    jpegSegment(0xe1, bytesOf('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')),
    jpegSegment(0xe2, bytesOf('ICC_PROFILE\0', [1, 1])),
    jpegSegment(0xed, bytesOf('Photoshop 3.0\0', GPS_TEXT)),
    jpegSegment(0xfe, bytesOf('kommentar')),
    jpegSegment(0xdb, bytesOf([0, 1, 2, 3])),
    SCAN_DATA,
    EOI,
  );
}

function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  header.set(enc.encode(fourcc), 0);
  new DataView(header.buffer).setUint32(4, data.length, true);
  return bytesOf(header, data, data.length % 2 ? [0] : []);
}

function riff(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const body = bytesOf('WEBP', ...chunks);
  const header = bytesOf('RIFF', [0, 0, 0, 0]);
  new DataView(header.buffer).setUint32(4, body.length, true);
  return bytesOf(header, body);
}

const VP8_DATA = bytesOf([9, 8, 7, 6, 5]); // udda längd → utfyllnadsbyte

function webpWithExif(): Uint8Array<ArrayBuffer> {
  return riff([
    riffChunk('VP8X', bytesOf([0x0c | 0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0])),
    riffChunk('VP8 ', VP8_DATA),
    riffChunk('EXIF', bytesOf('MM\0*', GPS_TEXT)),
    riffChunk('XMP ', bytesOf('<x:xmpmeta/>')),
  ]);
}

describe('fitWithin', () => {
  it('skalar ner liggande bilder så att bredden blir max', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_DIMENSION, height: 810 });
  });

  it('skalar ner stående bilder så att höjden blir max', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 810, height: MAX_DIMENSION });
  });

  it('skalar aldrig upp små bilder', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(1080, 1080)).toEqual({ width: 1080, height: 1080 });
  });

  it('ger minst en pixel för extrema proportioner', () => {
    expect(fitWithin(10_000, 2)).toEqual({ width: 1080, height: 1 });
  });
});

describe('stripJpegMetadata', () => {
  it('tar bort EXIF/GPS, XMP, IPTC och kommentarer men behåller bilddata', () => {
    const input = jpegWithExif();
    expect(contains(input, GPS_TEXT)).toBe(true);

    const out = stripJpegMetadata(input);

    expect(contains(out, 'Exif')).toBe(false);
    expect(contains(out, GPS_TEXT)).toBe(false);
    expect(contains(out, 'xmpmeta')).toBe(false);
    expect(contains(out, 'Photoshop')).toBe(false);
    expect(contains(out, 'kommentar')).toBe(false);
    expect(Array.from(out)).toEqual(
      Array.from(
        bytesOf(
          [0xff, 0xd8],
          jpegSegment(0xe0, bytesOf('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
          jpegSegment(0xe2, bytesOf('ICC_PROFILE\0', [1, 1])),
          jpegSegment(0xdb, bytesOf([0, 1, 2, 3])),
          SCAN_DATA,
          EOI,
        ),
      ),
    );
  });

  it('lämnar annat än JPEG orört', () => {
    const png = bytesOf([0x89], 'PNG');
    expect(Array.from(stripJpegMetadata(png))).toEqual(Array.from(png));
  });
});

describe('stripWebpMetadata', () => {
  it('tar bort EXIF- och XMP-chunkar och nollställer flaggorna i VP8X', () => {
    const input = webpWithExif();
    expect(contains(input, GPS_TEXT)).toBe(true);

    const out = stripWebpMetadata(input);

    expect(contains(out, 'EXIF')).toBe(false);
    expect(contains(out, GPS_TEXT)).toBe(false);
    expect(contains(out, 'XMP')).toBe(false);
    const expected = riff([
      riffChunk('VP8X', bytesOf([0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0])),
      riffChunk('VP8 ', VP8_DATA),
    ]);
    expect(Array.from(out)).toEqual(Array.from(expected));
    // RIFF-storleken stämmer med den nya längden.
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
  });

  it('lämnar en WebP utan metadata oförändrad', () => {
    const plain = riff([riffChunk('VP8 ', VP8_DATA)]);
    expect(Array.from(stripWebpMetadata(plain))).toEqual(Array.from(plain));
  });
});

describe('stripMetadata', () => {
  it('känner igen formatet från innehållet', async () => {
    const webp = await stripMetadata(new Blob([webpWithExif()], { type: 'image/webp' }));
    expect(webp.type).toBe('image/webp');
    expect(contains(new Uint8Array(await webp.arrayBuffer()), GPS_TEXT)).toBe(false);

    const jpeg = await stripMetadata(new Blob([jpegWithExif()], { type: 'image/jpeg' }));
    expect(jpeg.type).toBe('image/jpeg');
    expect(contains(new Uint8Array(await jpeg.arrayBuffer()), GPS_TEXT)).toBe(false);
  });
});

/** Fejkad codec: "kodar" till en färdig byte-sekvens som innehåller EXIF. */
function fakeCodec(source: { width: number; height: number }, webpSupported = true) {
  const close = vi.fn();
  const image: DecodedImage = { ...source, source: {} as CanvasImageSource, close };
  const decode = vi.fn(() => Promise.resolve(image));
  const encode = vi.fn((_img: DecodedImage, _size, type: string) =>
    Promise.resolve(
      type === 'image/webp' && webpSupported
        ? new Blob([webpWithExif()], { type: 'image/webp' })
        : type === 'image/jpeg'
          ? new Blob([jpegWithExif()], { type: 'image/jpeg' })
          : new Blob([bytesOf([0x89], 'PNG')], { type: 'image/png' }),
    ),
  );
  const codec: ImageCodec = { decode, encode };
  return { codec, decode, encode, image, close };
}

describe('compressImage', () => {
  it('skalar ner till max 1080 px, kodar som WebP och tar bort EXIF', async () => {
    const { codec, decode, encode, image, close } = fakeCodec({ width: 4000, height: 3000 });
    const file = new Blob([jpegWithExif()], { type: 'image/jpeg' });

    const result = await compressImage(file, codec);

    expect(decode).toHaveBeenCalledWith(file);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith(image, { width: 1080, height: 810 }, 'image/webp', 0.8);
    expect(result).toMatchObject({ width: 1080, height: 810 });
    expect(result.blob.type).toBe('image/webp');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(contains(bytes, 'EXIF')).toBe(false);
    expect(contains(bytes, GPS_TEXT)).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it('faller tillbaka till JPEG utan EXIF när WebP inte kan kodas', async () => {
    const { codec, encode } = fakeCodec({ width: 1200, height: 1600 }, false);

    const result = await compressImage(new Blob(['x']), codec);

    expect(encode).toHaveBeenLastCalledWith(
      expect.anything(),
      { width: 810, height: 1080 },
      'image/jpeg',
      0.8,
    );
    expect(result.blob.type).toBe('image/jpeg');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(contains(bytes, 'Exif')).toBe(false);
    expect(contains(bytes, GPS_TEXT)).toBe(false);
  });

  it('behåller storleken på små bilder', async () => {
    const { codec } = fakeCodec({ width: 800, height: 600 });
    const result = await compressImage(new Blob(['x']), codec);
    expect(result).toMatchObject({ width: 800, height: 600 });
  });

  it('frigör den avkodade bilden även när kodningen misslyckas', async () => {
    const { codec, encode, close } = fakeCodec({ width: 800, height: 600 });
    encode.mockRejectedValue(new Error('nej'));
    await expect(compressImage(new Blob(['x']), codec)).rejects.toThrow('nej');
    expect(close).toHaveBeenCalledOnce();
  });
});
