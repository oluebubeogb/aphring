/**
 * Outgoing mail: Resend (HTTP API), SMTP (nodemailer) or console (logs only).
 * Sending never blocks sign-up: callers decide whether a failure matters.
 */
import nodemailer from "nodemailer";
import { mailConfig } from "../config.js";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Printed instead of the full body when MAIL_PROVIDER=console. */
  consoleSummary?: string;
}

let smtpTransport: nodemailer.Transporter | null = null;

export async function sendMail(msg: MailMessage): Promise<{ provider: string }> {
  const cfg = mailConfig();
  if (cfg.provider === "console") {
    console.log(`[mail:console] to=${msg.to} subject="${msg.subject}" ${msg.consoleSummary || ""}`.trim());
    return { provider: "console" };
  }
  if (cfg.provider === "resend") {
    if (!cfg.resendKey) throw new Error("RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.resendKey}` },
      body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { provider: "resend" };
  }
  if (!cfg.smtp.host) throw new Error("SMTP_HOST is not set");
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
    });
  }
  await smtpTransport.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  return { provider: "smtp" };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Calm, minimal email with the word set large and lowercase. */
export function wordEmail(opts: {
  name: string;
  heading: string;
  intro: string;
  word: string;
  minutes: number;
  actionLabel: string;
  actionUrl: string;
  footnote: string;
}) {
  const word = opts.word.toLowerCase();
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f5f1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #ebe8e1;">
<tr><td style="padding:36px 36px 8px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a24;">
<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#4f7a62;font-weight:600;">Aphring</div>
<h1 style="font-size:22px;line-height:1.3;font-weight:600;margin:16px 0 8px 0;">${esc(opts.heading)}</h1>
<p style="font-size:15px;line-height:1.6;color:#4a524d;margin:0 0 24px 0;">Hi ${esc(opts.name)}, ${esc(opts.intro)}</p>
</td></tr>
<tr><td align="center" style="padding:0 36px;">
<div style="background:#f1f6f2;border-radius:12px;padding:22px 12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:30px;letter-spacing:.12em;color:#1f4d36;font-weight:600;">${esc(word)}</div>
<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#7a807c;margin:12px 0 0 0;">Type it in any case — it works either way. Valid for ${opts.minutes} minutes.</p>
</td></tr>
<tr><td align="center" style="padding:28px 36px 8px 36px;">
<a href="${esc(opts.actionUrl)}" style="display:inline-block;background:#1f4d36;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;padding:12px 22px;border-radius:999px;">${esc(opts.actionLabel)}</a>
</td></tr>
<tr><td style="padding:24px 36px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9a9f9b;">
${esc(opts.footnote)}
</td></tr>
</table>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#a5a9a6;margin-top:16px;">Aphring · Nigeria's community knowledge network</div>
</td></tr></table>
</body></html>`;
  const text = `${opts.heading}

Hi ${opts.name}, ${opts.intro}

    ${word}

Type it in any case — it works either way. Valid for ${opts.minutes} minutes.

${opts.actionLabel}: ${opts.actionUrl}

${opts.footnote}

— Aphring`;
  return { html, text };
}
