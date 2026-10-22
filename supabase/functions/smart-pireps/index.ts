import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON=Deno.env.get("SUPABASE_ANON_KEY")!;
const IF_KEY=Deno.env.get("INFINITE_FLIGHT_API_KEY")||"";
const BOT_TOKEN=Deno.env.get("DISCORD_BOT_TOKEN")||"";
const PUBLIC_CHANNEL=Deno.env.get("DISCORD_PIREP_CHANNEL_ID")||"";
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers});
const fail=(x:string,s=400)=>reply({error:x},s);
async function staff(req:Request){const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");if(!token)return null;const {data:{user}}=await auth.auth.getUser(token);if(!user)return null;const {data}=await db.from("crew_members").select("id,is_admin,status").eq("auth_user_id",user.id).maybeSingle();return data?.is_admin&&data.status==="active"?data:null;}
async function discordDM(userId:string,embeds:unknown[],components?:unknown[]){if(!BOT_TOKEN||!userId)return false;const dm=await fetch("https://discord.com/api/v10/users/@me/channels",{method:"POST",headers:{"Authorization":"Bot "+BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({recipient_id:userId})});if(!dm.ok)return false;const channel=await dm.json();const msg=await fetch("https://discord.com/api/v10/channels/"+channel.id+"/messages",{method:"POST",headers:{"Authorization":"Bot "+BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({embeds,components})});return msg.ok;}
async function configuredPirepChannel(){const {data}=await db.from("va_settings").select("value").eq("key","discord_pirep_channel_id").maybeSingle();return typeof data?.value==="string"&&/^\d{17,20}$/.test(data.value)?data.value:PUBLIC_CHANNEL;}
async function publicPirep(p:any,member:any,channelOverride?:string){const channelId=channelOverride||await configuredPirepChannel();if(!BOT_TOKEN||!channelId)return null;const r=await fetch("https://discord.com/api/v10/channels/"+channelId+"/messages",{method:"POST",headers:{"Authorization":"Bot "+BOT_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({embeds:[{title:"PIREP submitted · "+(p.flight_number||member.callsign),color:0x111111,fields:[{name:"Pilot",value:member.ifc_username||member.crew_username||"Crew member",inline:true},{name:"Route",value:(p.dep_icao||"????")+" → "+(p.arr_icao||"????"),inline:true},{name:"Aircraft",value:p.aircraft||"Not provided",inline:true},{name:"Flight time",value:Math.floor((p.flight_time_minutes||0)/60)+"h "+String((p.flight_time_minutes||0)%60).padStart(2,"0")+"m",inline:true},{name:"Status",value:"Pending staff review",inline:true}],timestamp:new Date().toISOString()}]})});if(!r.ok)return null;return (await r.json()).id;}
async function requireAuthMember(req:Request){const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");if(!token)return null;const {data:{user}}=await auth.auth.getUser(token);if(!user)return null;const {data:member}=await db.from("crew_members").select("id,auth_user_id,discord_user_id,discord_username,ifc_user_id,ifc_username,crew_username,callsign,status,is_admin").eq("auth_user_id",user.id).maybeSingle();return member?.status==="active"?member:null;}
async function detectLanded(){if(!IF_KEY)return fail("Infinite Flight API key is not configured.",503);
 const {data:members,error}=await db.from("crew_members").select("id,if_user_id,ifc_username,discord_user_id,callsign,status").eq("status","active").not("if_user_id","is",null).limit(500);
 if(error)return fail(error.message,500);
 const {data:setting}=await db.from("va_settings").select("value").eq("key","accepted_callsign_suffixes").maybeSingle();
 const suffixes=Array.isArray(setting?.value)?setting.value.map((x:string)=>String(x).toUpperCase()):["KC"];
 const candidates=[];
 // IF user-flight history is cached by the API; do not poll a given user more often than once per five minutes.
 for(const m of members||[]){try{
  const url="https://api.infiniteflight.com/public/v2/users/"+m.if_user_id+"/flights";
  const res=await fetch(url,{headers:{"Authorization":"Bearer "+IF_KEY}});
  if(!res.ok)continue;const json=await res.json();const flights=Array.isArray(json?.result)?json.result:(Array.isArray(json)?json:[]);
  const f=flights[0];if(!f)continue;
  const callsign=String(f.callsign||f.flightNumber||"").trim();
  if(!suffixes.some((s:string)=>callsign.toUpperCase().endsWith(s))||Number(f.pilotState)!==2)continue;
  const flightId=String(f.flightId||f.id||"");if(!flightId)continue;
  const {data:existing}=await db.from("smart_pirep_candidates").select("id").eq("crew_member_id",m.id).eq("if_flight_id",flightId).maybeSingle();if(existing)continue;
  const start=Date.parse(f.created||f.startTime||f.startedAt||"");const end=Date.parse(f.lastUpdate||f.endTime||f.endedAt||"");
  const minutes=Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.min(1440,Math.max(0,Math.round((end-start)/60000))):0;
  const payload={callsign,flightId,dep_icao:f.originAirport?.icao||f.departureAirport?.icao||f.origin||null,arr_icao:f.destinationAirport?.icao||f.arrivalAirport?.icao||f.destination||null,aircraft:f.aircraft?.name||f.aircraftName||f.aircraft||null,flight_time_minutes:minutes,landing_rate_fpm:f.landingRate||f.landingRateFpm||null,flight_date:Number.isFinite(start)?new Date(start).toISOString().slice(0,10):new Date().toISOString().slice(0,10)};
  const {data:candidate,error:insertError}=await db.from("smart_pirep_candidates").insert({crew_member_id:m.id,if_flight_id:flightId,flight_number:callsign,dep_icao:payload.dep_icao,arr_icao:payload.arr_icao,aircraft:typeof payload.aircraft==="string"?payload.aircraft:JSON.stringify(payload.aircraft),flight_time_minutes:minutes,landing_rate_fpm:payload.landing_rate_fpm,flight_date:payload.flight_date,payload}).select("*").single();
  if(insertError||!candidate)continue;
  const embeds=[{title:"Confirm your Smart PIREP",description:"We detected a landed Infinite Flight session. Review the details below. This report will only be filed if you approve it.",color:0x111111,fields:[{name:"Callsign",value:callsign,inline:true},{name:"Route",value:(payload.dep_icao||"????")+" → "+(payload.arr_icao||"????"),inline:true},{name:"Aircraft",value:String(payload.aircraft||"Unknown"),inline:true},{name:"Flight time",value:Math.floor(minutes/60)+"h "+String(minutes%60).padStart(2,"0")+"m",inline:true},{name:"Landing rate",value:payload.landing_rate_fpm===null?"Not available":String(payload.landing_rate_fpm)+" fpm",inline:true}],footer:{text:"Expires in 24 hours · Smart PIREPs"}}];
  const dm=await discordDM(m.discord_user_id||"",embeds,[{type:1,components:[{type:2,style:3,label:"Approve",custom_id:"smartpirep:approve:"+candidate.id},{type:2,style:4,label:"Reject",custom_id:"smartpirep:reject:"+candidate.id}]}]);
  candidates.push({candidate_id:candidate.id,callsign,dm_sent:dm});
 }catch(_){continue}}
 return reply({scanned:members?.length||0,candidates,notice:"Run this action no more frequently than every five minutes. Infinite Flight response fields are interpreted defensively; confirm the actual API payload shape before enabling a scheduled scan."});
}
async function testDiscordDM(username:string){
 if(!BOT_TOKEN)return fail("DISCORD_BOT_TOKEN is not configured.",503);
 const clean=username.trim().replace(/^<@!?(\d+)>$/,"$1");
 let member:any=null;
 if(/^\d{17,20}$/.test(clean)){
  const {data}=await db.from("crew_members").select("discord_user_id,discord_username,ifc_username,callsign").eq("discord_user_id",clean).maybeSingle();member=data;
 }else{
  const {data}=await db.from("crew_members").select("discord_user_id,discord_username,ifc_username,callsign").ilike("discord_username",clean).limit(2);
  if(data?.length===1)member=data[0];
  else if((data?.length||0)>1)return fail("More than one crew member matches that Discord username. Use their Discord user ID instead.",409);
 }
 if(!member?.discord_user_id)return fail("No linked crew member found for that Discord username/ID. Make sure their Discord account is linked in the crew profile.",404);
 const discordHeaders={"Authorization":"Bot "+BOT_TOKEN,"Content-Type":"application/json"};
 const dmResponse=await fetch("https://discord.com/api/v10/users/@me/channels",{method:"POST",headers:discordHeaders,body:JSON.stringify({recipient_id:member.discord_user_id})});
 if(!dmResponse.ok){const detail=(await dmResponse.text()).slice(0,400);return fail("Discord could not open a DM channel (HTTP "+dmResponse.status+"). Check the bot token, that the bot shares a server with this user, and the user's DM privacy settings. "+detail,502);}
 const dmChannel=await dmResponse.json();
 const messageResponse=await fetch("https://discord.com/api/v10/channels/"+dmChannel.id+"/messages",{method:"POST",headers:discordHeaders,body:JSON.stringify({embeds:[{title:"KCVA Discord DM test",description:"This is a test message from the Air Astana Virtual Crew Center admin panel. Your DM integration is working.",color:0x111111,fields:[{name:"Pilot",value:String(member.ifc_username||member.callsign||"Crew member"),inline:true}],timestamp:new Date().toISOString()}]})});
 if(!messageResponse.ok){const detail=(await messageResponse.text()).slice(0,400);return fail("Discord opened the DM channel but could not send the message (HTTP "+messageResponse.status+"). "+detail,502);}
 return reply({ok:true,message:"Test DM sent.",recipient:member.discord_username||member.discord_user_id});
 }
 if(action==="notify_pirep"){const who=await requireAuthMember(req);if(!who)return fail("Sign in required.",401);const id=String(body.pirep_id||"");const {data:p}=await db.from("pireps").select("*").eq("id",id).eq("crew_member_id",who.id).maybeSingle();if(!p)return fail("PIREP not found.",404);const messageId=await publicPirep(p,who);if(messageId)await db.from("pireps").update({discord_message_id:messageId,discord_webhook_channel_id:PUBLIC_CHANNEL}).eq("id",p.id);return reply({posted:Boolean(messageId)});}
 return fail("Unknown action.");
 }catch(e){return fail(e instanceof Error?e.message:"Unexpected server error.",500);}});
