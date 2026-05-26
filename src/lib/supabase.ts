import { createClient } from "@supabase/supabase-js";

// Server-side client — has full access via service role key
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Upload a receipt image to Supabase Storage
// Returns the public URL of the uploaded file
export async function uploadReceiptImage(
  file: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${fileName}`;

  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(path, file, { contentType: mimeType });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage
    .from("receipts")
    .getPublicUrl(path);

  return data.publicUrl;
}
