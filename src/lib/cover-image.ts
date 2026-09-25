// Cover compression before upload — AGENTS.md § Upload Rules, "Cover images".
// Browser only: it decodes and re-encodes through a canvas. No React, no
// hooks, no JSX.

/**
 * The largest cover kept, in pixels. The mobile app's widest cover is the
 * full-width Discover hero, about 1080px on a 3x phone, so anything larger is
 * bytes nobody sees. Smaller covers keep their size.
 */
export const MAX_COVER_WIDTH = 1200;
export const MAX_COVER_HEIGHT = 1800;

/**
 * WebP quality. At 0.85 the live 848×1264 PNG covers (~1.6 MB) came out at
 * 120–150 KB with no visible difference, title lettering included
 * (measured 2026-09-25).
 */
export const COVER_WEBP_QUALITY = 0.85;

/**
 * Sent as `Cache-Control` with every cover upload; Storage serves it back on
 * every read. A cover path is never reused (every replace writes a new uuid
 * path), so a year is safe, and it lets Supabase's CDN and browsers keep the
 * file. Without it Storage stores `no-cache`: the CDN missed on every request
 * and a browser re-checked each cover on every view (measured 2026-09-25).
 */
export const COVER_CACHE_CONTROL = "max-age=31536000";

export type PreparedCover = {
  /** What gets uploaded: the WebP, or the original when converting didn't help. */
  file: File;
  /** Of `file`. 0 when the image couldn't be decoded. */
  width: number;
  height: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new window.Image();
  image.src = url;
  // An <img> applies a JPEG's EXIF rotation, so a phone photo stays upright.
  return image.decode().then(() => image);
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", COVER_WEBP_QUALITY));
}

/**
 * Re-encodes a cover as WebP at the same resolution, scaled down only past
 * `MAX_COVER_WIDTH` × `MAX_COVER_HEIGHT`. Every reader downloads the stored
 * file on every cover card, so it is compressed once here rather than on
 * every phone.
 *
 * Keeps the original when the browser can't encode WebP (Safari hands back a
 * PNG instead), when the WebP is no smaller and no resize was needed (an
 * already optimised file), or when the image can't be decoded at all.
 */
export async function prepareCover(source: File): Promise<PreparedCover> {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const { naturalWidth, naturalHeight } = image;
    const scale = Math.min(1, MAX_COVER_WIDTH / naturalWidth, MAX_COVER_HEIGHT / naturalHeight);
    const width = Math.round(naturalWidth * scale);
    const height = Math.round(naturalHeight * scale);
    const original = { file: source, width: naturalWidth, height: naturalHeight };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const blob = await toWebp(canvas);
    if (!blob || blob.type !== "image/webp") return original;
    if (scale === 1 && blob.size >= source.size) return original;

    const baseName = source.name.replace(/\.[^.]*$/, "") || "cover";
    return {
      file: new File([blob], `${baseName}.webp`, { type: "image/webp" }),
      width,
      height,
    };
  } catch {
    return { file: source, width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
