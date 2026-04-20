// utils/email.js
// Nodemailer setup and email sending utility.
// Currently configured for Gmail SMTP.
// To switch providers later, only this file changes.
//
// Gmail setup requirements:
// 1. Enable 2-factor authentication on your Gmail account
// 2. Generate an App Password:
//    Google Account → Security → App Passwords
// 3. Use that App Password as SMTP_PASS in .env
//    Do NOT use your regular Gmail password
//
// Usage:
// await sendEmail({
//   to: "candidate@example.com",
//   subject: "Your IGC result is ready",
//   html: "<p>Congratulations! You have passed.</p>",
//   text: "Congratulations! You have passed." // plain text fallback
// });

import nodemailer from "nodemailer";
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  NODE_ENV,
} from "../config/env.js";

// ─────────────────────────────────────────
// Create reusable transporter
// In development, we log a warning if SMTP
// credentials are not configured rather than
// crashing the server — email is optional
// during local development
// ─────────────────────────────────────────
let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
} else {
  console.warn(
    "⚠️  Email not configured — SMTP_USER and SMTP_PASS are missing in .env"
  );
}

// ─────────────────────────────────────────
// sendEmail — main email sending function
//
// Parameters:
// to      — recipient email address
// subject — email subject line
// html    — HTML body (primary)
// text    — plain text fallback (optional)
// from    — sender name/address (optional,
//            defaults to SMTP_USER)
// ─────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text, from }) => {
  if (!transporter) {
    throw new Error(
      "Email service not configured — add SMTP credentials to .env"
    );
  }

  if (!to || !subject || !html) {
    throw new Error("to, subject and html are required to send an email");
  }

  const mailOptions = {
    from: from || `OHS CRM <${SMTP_USER}>`,
    to,
    subject,
    html,
    // Plain text fallback for email clients that
    // don't render HTML
    text: text || html.replace(/<[^>]*>/g, ""),
  };

  const info = await transporter.sendMail(mailOptions);

  if (NODE_ENV === "development") {
    console.log(`✅ Email sent to ${to} — MessageId: ${info.messageId}`);
  }

  return info;
};

// ─────────────────────────────────────────
// verifyEmailConnection — checks SMTP config
// Call this on server startup to validate
// email credentials are working
// ─────────────────────────────────────────
const verifyEmailConnection = async () => {
  if (!transporter) return false;

  try {
    await transporter.verify();
    console.log("✅ Email service connected successfully");
    return true;
  } catch (error) {
    console.warn(`⚠️  Email service verification failed: ${error.message}`);
    return false;
  }
};

export { sendEmail, verifyEmailConnection };