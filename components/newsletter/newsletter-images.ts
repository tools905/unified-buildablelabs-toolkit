import { prepareNewsletterImage } from "@/components/content-board/compress-image";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_NEWSLETTER_IMAGE_INPUT_BYTES,
  NEWSLETTER_BUCKET,
  NEWSLETTER_CARD_SUFFIX,
  NEWSLETTER_FULL_SUFFIX,
  NEWSLETTER_IMAGE_TYPES,
  coverCardUrl,
} from "@/lib/utils/newsletter-cover";

// Every file gets a fresh random name and is never overwritten, so browsers and the CDN may
// keep it for a year. A changed image is a new file with a new address.
const IMAGE_CACHE_SECONDS = String(60 * 60 * 24 * 365);

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

// Compresses an image, uploads it to the public newsletter bucket and returns its address.
// A cover (`card: true`) also gets a small copy for the website's cards, stored next to the
// full image as <id>-full.<ext> and <id>-card.webp so the card's address follows from the
// cover's. `cardUrl` is null when no small copy could be made.
export async function uploadNewsletterImage(
  file: File,
  workspaceId: string,
  postId: string,
  options: { card?: boolean } = {},
) {
  if (!NEWSLETTER_IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
  if (file.size > MAX_NEWSLETTER_IMAGE_INPUT_BYTES) throw new Error("Images can be up to 15 MB.");

  const { image, card, brightness } = await prepareNewsletterImage(file, options);
  const supabase = createClient();
  const bucket = supabase.storage.from(NEWSLETTER_BUCKET);
  const id = crypto.randomUUID();
  const folder = `${workspaceId}/${postId}`;
  const path = `${folder}/${id}${card ? NEWSLETTER_FULL_SUFFIX : ""}.${image.ext}`;

  const { error } = await bucket.upload(path, image.blob, {
    contentType: image.contentType,
    cacheControl: IMAGE_CACHE_SECONDS,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  if (card) {
    const { error: cardError } = await bucket.upload(`${folder}/${id}${NEWSLETTER_CARD_SUFFIX}`, card.blob, {
      contentType: card.contentType,
      cacheControl: IMAGE_CACHE_SECONDS,
      upsert: false,
    });
    // Without its small copy the full image must not claim to have one: store it under a plain name.
    if (cardError) {
      await bucket.remove([path]);
      return uploadNewsletterImage(file, workspaceId, postId, { card: false });
    }
  }

  const { data } = bucket.getPublicUrl(path);
  return { url: data.publicUrl, cardUrl: coverCardUrl(data.publicUrl), brightness };
}
