import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    },
  },
);

const RECEIPTS_BUCKET = "receipts";

/**
 * Uploads a receipt image to Supabase Storage and returns the public URL.
 */
export async function uploadReceiptImage(
  file: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${fileName}`;

  const { error } = await supabaseAdmin.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, {
      contentType: mimeType,
      duplex: "half",
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage
    .from(RECEIPTS_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Deletes a receipt image from Supabase Storage given its public URL.
 * Extracts the storage path by stripping the bucket prefix from the URL.
 * Logs a warning (does not throw) if the path cannot be determined or
 * the deletion fails — DB row cleanup still proceeds.
 */
export async function deleteReceiptImage(imageUrl: string): Promise<void> {
  try {
    // Public URL format:
    // https://<project>.supabase.co/storage/v1/object/public/receipts/<path>
    const marker = `/object/public/${RECEIPTS_BUCKET}/`;
    const idx = imageUrl.indexOf(marker);

    if (idx === -1) {
      console.warn(
        `[supabase] Could not extract storage path from URL: ${imageUrl}`,
      );
      return;
    }

    const storagePath = imageUrl.slice(idx + marker.length);

    if (!storagePath) {
      console.warn(`[supabase] Empty storage path derived from URL: ${imageUrl}`);
      return;
    }

    const { error } = await supabaseAdmin.storage
      .from(RECEIPTS_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.warn(
        `[supabase] Storage deletion failed for path "${storagePath}": ${error.message}`,
      );
    }
  } catch (err) {
    console.warn("[supabase] Unexpected error during storage deletion:", err);
  }
}