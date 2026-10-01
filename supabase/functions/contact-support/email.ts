// The email contact-support sends to the support inbox: a subject, a branded
// HTML body and its plain-text twin. The owner asked for a clean, professional
// one on 2026-10-01 (the mobile app's AGENTS.md, Decisions — 2026-10-01,
// "The support email, cleaned up"). Pure: no network, no secrets, so a sample
// can be drawn locally.
//
// Everything the reader or the app sent is escaped before it reaches the
// HTML, and the reader's line breaks are kept.

export type Sender = { name: string | null; email: string | null };

export type Device = {
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
};

export type EmailInput = {
  /** The Clerk user id, for looking the account up. */
  userId: string;
  sender: Sender;
  /** The topic as the app words it: "Downloads", "Something else". */
  topic: string;
  message: string;
  device: Device;
};

/** The start of the message, on one line, for the subject and the inbox preview. */
function excerptOf(message: string, max: number): string {
  const start = message.replace(/\s+/g, " ").trim();
  return start.length > max ? `${start.slice(0, max - 1)}…` : start;
}

const PLATFORMS: Record<string, string> = { android: "Android", ios: "iOS", web: "Web" };

/** "Talebrim 1.0.0 (build 1)" and "itel A662LM · Android 12", or null for nothing known. */
function appAndDevice(device: Device): { app: string | null; phone: string | null } {
  const platform = device.platform ? (PLATFORMS[device.platform.toLowerCase()] ?? device.platform) : null;
  return {
    app: device.appVersion ? `Talebrim ${device.appVersion}${device.appBuild ? ` (build ${device.appBuild})` : ""}` : null,
    phone:
      [device.deviceModel, [platform, device.osVersion].filter(Boolean).join(" ") || null].filter(Boolean).join(" · ") ||
      null,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Talebrim's own colours. Muted text is #6b6275: 5.6:1 on white.
const INK = "#1a1420";
const MUTED = "#6b6275";
const EMBER = "#e8663f";

export function buildEmail({ userId, sender, topic, message, device }: EmailInput) {
  const subject = `${topic} — ${excerptOf(message, 60)}`;
  const { app, phone } = appAndDevice(device);
  const who = sender.name ?? sender.email ?? "a reader";

  const text = [
    `New message from ${who}`,
    topic,
    "",
    message,
    "",
    `Name: ${sender.name ?? "Not given"}`,
    `Email: ${sender.email ?? "None on the account"}`,
    `App: ${app ?? "Unknown"}`,
    `Device: ${phone ?? "Unknown"}`,
    `Account: ${userId}`,
    "",
    sender.email ? `Reply to this email to answer ${who} directly.` : "This account has no email to reply to.",
  ].join("\n");

  const whoHtml = escapeHtml(who);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;width:88px;color:${MUTED};font-size:14px;vertical-align:top;">${label}</td>` +
    `<td style="padding:6px 0;color:${INK};font-size:14px;">${value}</td></tr>`;
  const reply = sender.email
    ? `<tr><td style="padding:22px 28px 0;"><a href="mailto:${escapeHtml(sender.email)}?subject=${encodeURIComponent(`Re: ${subject}`)}" ` +
      `style="display:inline-block;background:${EMBER};color:${INK};font-size:14px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:999px;">` +
      `Reply to ${whoHtml}</a></td></tr>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f2f7;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(excerptOf(message, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f7;padding:24px 12px;font-family:${FONT};">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;text-align:left;">
<tr><td style="background:#150e1f;padding:18px 28px;">
<span style="font-size:19px;font-weight:700;color:#f4e3ce;letter-spacing:0.2px;">Talebrim</span>
<span style="font-size:13px;color:#a79bb5;padding-left:8px;">Support</span>
</td></tr>
<tr><td style="padding:28px 28px 0;">
<div style="font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#c9502b;">${escapeHtml(topic)}</div>
<div style="font-size:21px;font-weight:700;color:${INK};padding-top:6px;line-height:1.3;">New message from ${whoHtml}</div>
${sender.email && sender.name ? `<div style="font-size:14px;color:${MUTED};padding-top:4px;">${escapeHtml(sender.email)}</div>` : ""}
</td></tr>
<tr><td style="padding:20px 28px 0;">
<div style="background:#f7f4f0;border-left:3px solid ${EMBER};border-radius:8px;padding:16px 18px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(message).replace(/\r?\n/g, "<br>")}</div>
</td></tr>
${reply}
<tr><td style="padding:24px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece8f0;">
<tr><td colspan="2" style="height:10px;"></td></tr>
${row("App", escapeHtml(app ?? "Unknown"))}
${row("Device", escapeHtml(phone ?? "Unknown"))}
${row("Account", `<span style="font-family:Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(userId)}</span>`)}
</table>
</td></tr>
<tr><td style="padding:18px 28px 26px;font-size:13px;line-height:1.5;color:${MUTED};">
${sender.email ? `Replying to this email answers ${whoHtml} directly.` : "This account has no email to reply to."}
</td></tr>
</table>
<div style="font-size:12px;color:${MUTED};padding-top:14px;">Sent from the Help form in the Talebrim app.</div>
</td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
