import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,   // 👈 CRITICAL: Stops Supabase from tracking or picking up client/browser tokens
      autoRefreshToken: false, // 👈 CRITICAL: Stops background loops from corrupting the auth header
    },
    global: {
      // Re-enforces the service role key explicitly on every fetch request overhead
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    },
  }
);

export async function uploadReceiptImage(
  file: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${fileName}`;
  
  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(path, file, { 
      contentType: mimeType,
      duplex: "half" // Clean pass-through execution for newer Node runtime stream buffers
    });
    
  if (error) throw new Error(`Upload failed: ${error.message}`);
  
  const { data } = supabaseAdmin.storage.from("receipts").getPublicUrl(path);
  return data.publicUrl;
}