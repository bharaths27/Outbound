// Shrinks a picked photo to a 320 px square WebP before upload (center crop), so uploads are
// small and the original file (with its location metadata) never leaves the device.

export async function squarePhoto(file: File, size = 320): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error("Pick an image file.");
  if (file.size > 15_000_000) throw new Error("That photo is over 15 MB.");
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't resize photos.");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.86));
  if (blob && blob.type === "image/webp") return blob;
  const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!jpg) throw new Error("That photo couldn't be read.");
  return jpg;
}
