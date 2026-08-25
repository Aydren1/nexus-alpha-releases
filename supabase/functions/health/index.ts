import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(JSON.stringify({ service: "starladder-alpha", ok: true, at: new Date().toISOString() }), {
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
