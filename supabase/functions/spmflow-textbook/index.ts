import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const securedHandler = withSupabase(
  { auth: "publishable:default" },
  async (req, ctx) => {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const formLevel = Number(new URL(req.url).searchParams.get("form_level") ?? 4);
    if (![4, 5].includes(formLevel)) return json({ error: "Invalid form level" }, 400);

    const { data: textbook, error: metadataError } = await ctx.supabaseAdmin
      .from("textbooks")
      .select("id,title,storage_path,printed_page_offset,pdf_page_count")
      .eq("subject", "sejarah")
      .eq("form_level", formLevel)
      .single();

    if (metadataError || !textbook) {
      console.error("Textbook metadata lookup failed", metadataError);
      return json({ error: "Textbook is not configured" }, 404);
    }

    const { data: signed, error: signedUrlError } = await ctx.supabaseAdmin.storage
      .from("textbooks")
      .createSignedUrl(textbook.storage_path, 60 * 60);

    if (signedUrlError || !signed?.signedUrl) {
      console.error("Textbook signed URL failed", signedUrlError);
      return json({ error: "Textbook file is not available yet" }, 404);
    }

    return json({
      id: textbook.id,
      title: textbook.title,
      url: signed.signedUrl,
      printed_page_offset: textbook.printed_page_offset,
      pdf_page_count: textbook.pdf_page_count,
      expires_in: 3600,
    });
  },
);

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders });
}

export default {
  fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return securedHandler(req);
  },
};
