/**
 * Smart PIREP Discord button interaction handler.
 * Compatible with src/index.js importing installSmartPirepHandler.
 */
const SMART_PIREPS_URL = String(
  process.env.SMART_PIREPS_API_URL ||
    "https://huqvffdiwqilbpxepfpo.supabase.co/functions/v1/smart-pireps"
).replace(/\/$/, "");

export async function handleSmartPirepButton(interaction) {
  if (!interaction.isButton?.()) return false;

  const match = /^smartpirep:(approve|reject):([0-9a-f-]{36})$/i.exec(
    interaction.customId || ""
  );
  if (!match) return false;

  const [, rawDecision, candidateId] = match;
  const decision = rawDecision.toLowerCase();
  await interaction.deferUpdate();

  try {
    const secret = process.env.BOT_API_SECRET;
    if (!secret) throw new Error("BOT_API_SECRET is not configured for the bot.");

    const response = await fetch(SMART_PIREPS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-secret": secret
      },
      body: JSON.stringify({
        action: "bot_smart_pirep_decide",
        candidate_id: candidateId,
        decision,
        discord_user_id: interaction.user.id
      })
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}

    if (!response.ok || data.error) {
      throw new Error(data.error || `Smart PIREP service failed (HTTP ${response.status}).`);
    }

    await interaction.editReply({
      content: decision === "approve"
        ? `✅ Smart PIREP approved and filed.${data.discord_posted ? " The PIREP was also posted to the public channel." : " Public Discord notification could not be sent."}`
        : "🗑️ Smart PIREP rejected. No PIREP was filed.",
      embeds: [],
      components: []
    });
  } catch (error) {
    await interaction.editReply({
      content: "❌ " + (error instanceof Error ? error.message : "Could not process this Smart PIREP."),
      embeds: [],
      components: []
    }).catch(() => {});
  }

  return true;
}

export function installSmartPirepHandler(client) {
  client.on("interactionCreate", async interaction => {
    try {
      await handleSmartPirepButton(interaction);
    } catch (error) {
      console.error("Smart PIREP interaction error:", error);
    }
  });
}
