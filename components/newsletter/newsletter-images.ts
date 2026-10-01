import { prepareNewsletterImage } from "@/components/content-board/compress-image";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_NEWSLETTER_IMAGE_INPUT_BYTES,
  NEWSLETTER_BUCKET,
  NEWSLETTER_IMAGE_TYPES,
} from "@/lib/utils/newsletter-cover";

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

// Compresses an image, uploads it to the public newsletter bucket and returns its address.
export async function uploadNewsletterImage(file: File, workspaceId: string, postId: string) {
  if (!NEWSLETTER_IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
  if (file.size > MAX_NEWSLETTER_IMAGE_INPUT_BYTES) throw new Error("Images can be up to 15 MB.");

  const { image, brightness } = await prepareNewsletterImage(file);
  const supabase = createClient();
  const path = `${workspaceId}/${postId}/${crypto.randomUUID()}.${image.ext}`;
  const { error } = await supabase.storage
    .from(NEWSLETTER_BUCKET)
    .upload(path, image.blob, { contentType: image.contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(NEWSLETTER_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, brightness };
}
