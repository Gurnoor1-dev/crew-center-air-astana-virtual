import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const adminDb = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const fail = (message: string, status = 400) => reply({ error: message }, status);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toUpperCase())))).map(v => v.toString(16).padStart(2, "0")).join("");
const normalUsername = (v: string) => v.trim().toLowerCase();
async function adminMember(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  const { data: member } = await adminDb.from("crew_members").select("id,is_admin,status").eq("auth_user_id", user.id).maybeSingle();
  return member?.is_admin === true && member?.status === "active" ? member : null;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return fail("Method not allowed", 405);
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "verify_code") {
      const code = String(body.code || "").trim();
      if (!code) return fail("Enter your registration code.");
      const { data } = await adminDb.from("registration_codes").select("callsign,ifc_username,discord_username,expires_at,consumed_at,disabled_at").eq("code_hash", await hash(code)).maybeSingle();
      if (!data || data.consumed_at || data.disabled_at || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) return fail("That registration code is invalid, expired, or already used.");
      return reply({ valid: true, pilot: { callsign: data.callsign, ifc_username: data.ifc_username, discord_username: data.discord_username } });
    }
    if (action === "check_username") {
      const username = String(body.username || "").trim();
      if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return reply({ available: false, valid: false, message: "Use 3–24 letters, numbers, dots, underscores or hyphens." });
      const { data } = await adminDb.from("crew_members").select("id").ilike("crew_username", username).maybeSingle();
      return reply({ available: !data, valid: true });
    }
    if (action === "register") {
      const code = String(body.code || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!code || !email || !username || !password) return fail("Complete every field.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
      if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return fail("Username must be 3–24 characters using letters, numbers, dots, underscores or hyphens.");
      if (password.length < 8) return fail("Use a password with at least 8 characters.");
      const codeHash = await hash(code);
      const { data: found } = await adminDb.from("registration_codes").select("*").eq("code_hash", codeHash).is("consumed_at", null).is("disabled_at", null).maybeSingle();
      if (!found || (found.expires_at && new Date(found.expires_at).getTime() < Date.now())) return fail("That registration code is invalid, expired, or already used.");
      const { data: existingUser } = await adminDb.from("crew_members").select("id").ilike("crew_username", username).maybeSingle();
      if (existingUser) return fail("That username is already taken. Try another one.");
      const { data: existingEmail } = await adminDb.from("crew_members").select("id").ilike("auth_email", email).maybeSingle();
      if (existingEmail) return fail("An account with that email already exists.");
      // Atomically claim the one-time code before creating the account.
      const { data: claimed } = await adminDb.from("registration_codes").update({ consumed_at: new Date().toISOString() }).eq("id", found.id).is("consumed_at", null).is("disabled_at", null).select("id").maybeSingle();
      if (!claimed) return fail("That registration code has just been used. Please ask staff for a new one.");
      const { data: created, error: createError } = await adminDb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { crew_username: username } });
      if (createError || !created.user) {
        await adminDb.from("registration_codes").update({ consumed_at: null }).eq("id", found.id).is("consumed_by", null);
        return fail(createError?.message || "Could not create account.");
      }
      const memberPayload = {
        auth_user_id: created.user.id, auth_email: email, crew_username: username,
        callsign: found.callsign, ifc_username: found.ifc_username, discord_username: found.discord_username,
        updated_at: new Date().toISOString()
      };
      const memberResult = found.existing_crew_member_id
        ? await adminDb.from("crew_members").update(memberPayload).eq("id", found.existing_crew_member_id).is("auth_user_id", null).select("id").maybeSingle()
        : await adminDb.from("crew_members").insert({ ...memberPayload, discord_user_id: null, status: "active", is_admin: false, joined_at: new Date().toISOString() }).select("id").single();
      const member = memberResult.data;
      const memberError = memberResult.error;
      if (memberError || !member) {
        await adminDb.auth.admin.deleteUser(created.user.id);
        await adminDb.from("registration_codes").update({ consumed_at: null }).eq("id", found.id).is("consumed_by", null);
        return fail(memberError?.message || "Could not link your crew profile.");
      }
      await adminDb.from("registration_codes").delete().eq("id", found.id);
      const { data: signed, error: signError } = await authClient.auth.signInWithPassword({ email, password });
      if (signError || !signed.session) return reply({ registered: true, message: "Account created. Please sign in with your username and password." });
      return reply({ registered: true, session: signed.session });
    }
    if (action === "login") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) return fail("Enter your username and password.");
      const { data: member } = await adminDb.from("crew_members").select("auth_email").ilike("crew_username", username).maybeSingle();
      if (!member?.auth_email) return fail("Invalid username or password.", 401);
      const { data, error } = await authClient.auth.signInWithPassword({ email: member.auth_email, password });
      if (error || !data.session) return fail("Invalid username or password.", 401);
      return reply({ session: data.session, user: { id: data.user.id, email: data.user.email } });
    }
    if (action === "admin_create_code") {
      const staff = await adminMember(req);
      if (!staff) return fail("Staff access required.", 403);
      const callsign = String(body.callsign || "").trim().toUpperCase();
      const ifcUsername = String(body.ifc_username || "").trim();
      const discordUsername = String(body.discord_username || "").trim();
      if (!callsign || !ifcUsername || !discordUsername) return fail("Callsign, IFC username and Discord username are required.");
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      const rawCode = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
      const { error } = await adminDb.from("registration_codes").insert({ code_hash: await hash(rawCode), callsign, ifc_username: ifcUsername, discord_username: discordUsername, created_by: staff.id });
      if (error) return fail(error.message, 500);
      return reply({ code: rawCode, callsign, ifc_username: ifcUsername, discord_username: discordUsername, message: "Copy this code now. It is only shown once." });
    }
    if (action === "admin_list_codes") {
      const staff = await adminMember(req);
      if (!staff) return fail("Staff access required.", 403);
      const { data, error } = await adminDb.from("registration_codes").select("id,callsign,ifc_username,discord_username,created_at,expires_at,consumed_at,disabled_at").order("created_at", { ascending: false }).limit(100);
      if (error) return fail(error.message, 500);
      return reply({ codes: data || [] });
    }
    if (action === "admin_disable_code") {
      const staff = await adminMember(req);
      if (!staff) return fail("Staff access required.", 403);
      const id = String(body.id || "");
      const { error } = await adminDb.from("registration_codes").update({ disabled_at: new Date().toISOString() }).eq("id", id).is("consumed_at", null).is("disabled_at", null);
      if (error) return fail(error.message, 500);
      return reply({ success: true });
    }
    return fail("Unknown action.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unexpected server error.", 500);
  }
});