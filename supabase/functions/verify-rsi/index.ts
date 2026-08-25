import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ ok: false, reason: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return reply({ ok: false, reason: "Sign in before verifying RSI ownership." }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return reply({ ok: false, reason: "Your session expired. Sign in again." }, 401);

  const recentCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase.from("rsi_verification_attempts")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("attempted_at", recentCutoff);
  if ((count ?? 0) >= 8) return reply({ ok: false, reason: "Too many verification attempts. Wait ten minutes." }, 429);

  let payload: { handle?: string; code?: string };
  try { payload = await request.json(); } catch { return reply({ ok: false, reason: "Invalid request." }, 400); }
  const handle = String(payload.handle ?? "").trim();
  const code = String(payload.code ?? "").trim().toUpperCase();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(handle) || !/^(?:SL|NEXUS)-[A-Z0-9-]{8,24}$/.test(code)) {
    return reply({ ok: false, reason: "The RSI handle or verification code is invalid." }, 400);
  }

  const codeHashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const codeHash = [...new Uint8Array(codeHashBytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let succeeded = false;
  let failureReason: string | null = null;

  try {
    const dossierResponse = await fetch(`https://robertsspaceindustries.com/citizens/${encodeURIComponent(handle)}`, {
      headers: { "User-Agent": "STARLADDER-Alpha/0.5 RSI-public-profile-verification" },
      signal: AbortSignal.timeout(12_000),
    });
    if (dossierResponse.status === 404) failureReason = "That RSI handle has no public Citizen Dossier.";
    else if (dossierResponse.status === 403 || dossierResponse.status === 429) failureReason = "RSI temporarily blocked the dossier check. Wait and retry.";
    else if (!dossierResponse.ok) failureReason = `RSI returned an error (${dossierResponse.status}).`;
    else {
      const html = await dossierResponse.text();
      if (/just a moment|challenge-platform|cf-chl-/i.test(html)) failureReason = "RSI requested a browser security check. Retry shortly.";
      else if (!html.toUpperCase().includes(code)) failureReason = "Code not found in the public RSI profile bio yet.";
      else succeeded = true;
    }
  } catch (error) {
    failureReason = error instanceof DOMException && error.name === "TimeoutError"
      ? "RSI did not respond within 12 seconds."
      : "Could not reach RSI. Check your connection and retry.";
  }

  await supabase.from("rsi_verification_attempts").insert({
    user_id: user.id, requested_handle: handle, code_hash: codeHash, succeeded, failure_reason: failureReason,
  });
  if (!succeeded) return reply({ ok: false, reason: failureReason }, 422);

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: user.id, rsi_handle: handle, rsi_verified_at: new Date().toISOString(),
  });
  if (profileError) {
    const duplicate = profileError.code === "23505";
    return reply({ ok: false, reason: duplicate ? "That RSI account is already linked to another STARLADDER account." : "Could not activate the profile." }, duplicate ? 409 : 500);
  }
  return reply({ ok: true, handle, verifiedAt: new Date().toISOString() });
});
