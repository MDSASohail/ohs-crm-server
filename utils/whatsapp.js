// utils/whatsapp.js
// WhatsApp Cloud API (Meta) message sending utility.
//
// Setup requirements:
// 1. Create a Meta Developer account at developers.facebook.com
// 2. Create an app and add WhatsApp product
// 3. Get your Phone Number ID and Access Token
// 4. Add them to .env as:
//    WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
//    WHATSAPP_ACCESS_TOKEN=your_access_token
//
// Two message types supported:
// 1. freeform — send any plain text message
//    (only works within 24hr customer service window)
// 2. template — send pre-approved Meta templates
//    (works anytime, required for outbound messages)
//
// Usage — freeform text:
// await sendWhatsApp({
//   to: "919876543210",  // country code + number, no + or spaces
//   message: "Your IGC result is ready. Please contact us.",
// });
//
// Usage — template:
// await sendWhatsApp({
//   to: "919876543210",
//   type: "template",
//   templateName: "result_notification",
//   templateLanguage: "en_US",
//   templateComponents: []
// });

import axios from "axios";
import {
  WHATSAPP_API_URL,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
  NODE_ENV,
} from "../config/env.js";

// ─────────────────────────────────────────
// Check if WhatsApp is configured
// Not required during local development
// ─────────────────────────────────────────
const isWhatsAppConfigured = () => {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    return false;
  }
  return true;
};

if (!isWhatsAppConfigured()) {
  console.warn(
    "⚠️  WhatsApp not configured — WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are missing in .env"
  );
}

// ─────────────────────────────────────────
// sendWhatsApp — main WhatsApp sending function
//
// Parameters:
// to               — recipient number with country code
//                    e.g. "919876543210" for India
// message          — plain text message (freeform type)
// type             — "text" (default) or "template"
// templateName     — template name (required if type is template)
// templateLanguage — template language code (default: "en_US")
// templateComponents — array of template components (optional)
// ─────────────────────────────────────────
const sendWhatsApp = async ({
  to,
  message,
  type = "text",
  templateName,
  templateLanguage = "en_US",
  templateComponents = [],
}) => {
  if (!isWhatsAppConfigured()) {
    throw new Error(
      "WhatsApp service not configured — add credentials to .env"
    );
  }

  if (!to) {
    throw new Error("Recipient phone number is required");
  }

  // Clean the phone number — remove spaces, dashes, plus signs
  const cleanTo = to.replace(/[\s\-\+]/g, "");

  // Build the request payload based on message type
  let payload;

  if (type === "template") {
    // Template message — works anytime
    // Templates must be pre-approved by Meta
    if (!templateName) {
      throw new Error("templateName is required for template messages");
    }

    payload = {
      messaging_product: "whatsapp",
      to: cleanTo,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: templateComponents,
      },
    };
  } else {
    // Freeform text message
    // Only works within 24hr customer service window
    // (i.e. candidate must have messaged you first)
    if (!message) {
      throw new Error("message is required for text messages");
    }

    payload = {
      messaging_product: "whatsapp",
      to: cleanTo,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };
  }

  // ─────────────────────────────────────────
  // Make the API call to Meta WhatsApp Cloud API
  // ─────────────────────────────────────────
  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (NODE_ENV === "development") {
    console.log(
      `✅ WhatsApp message sent to ${cleanTo} — ID: ${response.data?.messages?.[0]?.id}`
    );
  }

  return response.data;
};

export { sendWhatsApp, isWhatsAppConfigured };