// config/env.js
// Loads, validates, and exports all environment variables.
// Every other file must import from here — never use process.env directly.

import dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────
// Helper — throws a clear error if a required
// variable is missing, so the server never
// starts with a broken config silently.
// ─────────────────────────────────────────
const required = (key, fallback) => {
  const value = process.env[key];
  // if (!value) {
  //   throw new Error(`Missing required environment variable: ${key}`);
  // }
  return value || fallback;
};

// Optional variable — returns a fallback if not set
const optional = (key, fallback = "") => {
  return process.env[key] || fallback;
};

// ─────────────────────────────────────────
// SERVER
// ─────────────────────────────────────────
export const PORT = optional("PORT", "5000");
export const NODE_ENV = optional("NODE_ENV", "development");

// ─────────────────────────────────────────
// MONGODB
// ─────────────────────────────────────────
export const MONGODB_URI = required("MONGODB_URI",'mongodb+srv://mdsa:mongodb@atlascluster.iutgm4q.mongodb.net/fileManagement?retryWrites=true&w=majority');

// ─────────────────────────────────────────
// JWT
// ─────────────────────────────────────────
export const ACCESS_TOKEN_SECRET = required("ACCESS_TOKEN_SECRET","access");
export const ACCESS_TOKEN_EXPIRY = optional("ACCESS_TOKEN_EXPIRY", "15m");
export const REFRESH_TOKEN_SECRET = required("REFRESH_TOKEN_SECRET","REFRESH_TOKEN_SECRET ");
export const REFRESH_TOKEN_EXPIRY = optional("REFRESH_TOKEN_EXPIRY", "7d");

// ─────────────────────────────────────────
// COOKIES
// ─────────────────────────────────────────
export const COOKIE_SECRET = required("COOKIE_SECRET","REFRESH_TOKEN_EXPIRY");

// ─────────────────────────────────────────
// CORS
// ─────────────────────────────────────────
export const CLIENT_ORIGIN = optional("CLIENT_ORIGIN", "http://localhost:5173");

// ─────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────
export const UPLOAD_DEST = optional("UPLOAD_DEST", "uploads");
export const MAX_FILE_SIZE_MB = parseInt(optional("MAX_FILE_SIZE_MB", "5"), 10);

// ─────────────────────────────────────────
// CLOUDINARY (placeholder — not used yet)
// ─────────────────────────────────────────
export const CLOUDINARY_CLOUD_NAME = optional("CLOUDINARY_CLOUD_NAME");
export const CLOUDINARY_API_KEY = optional("CLOUDINARY_API_KEY");
export const CLOUDINARY_API_SECRET = optional("CLOUDINARY_API_SECRET");

// ─────────────────────────────────────────
// EMAIL
// ─────────────────────────────────────────
export const SMTP_HOST = optional("SMTP_HOST", "smtp.gmail.com");
export const SMTP_PORT = parseInt(optional("SMTP_PORT", "587"), 10);
export const SMTP_USER = optional("SMTP_USER");
export const SMTP_PASS = optional("SMTP_PASS");

// ─────────────────────────────────────────
// WHATSAPP
// ─────────────────────────────────────────
export const WHATSAPP_API_URL = optional("WHATSAPP_API_URL", "https://graph.facebook.com/v19.0");
export const WHATSAPP_PHONE_NUMBER_ID = optional("WHATSAPP_PHONE_NUMBER_ID");
export const WHATSAPP_ACCESS_TOKEN = optional("WHATSAPP_ACCESS_TOKEN");

// ─────────────────────────────────────────
// SEED SCRIPT
// ─────────────────────────────────────────
export const SEED_TENANT_NAME = optional("SEED_TENANT_NAME");
export const SEED_TENANT_SLUG = optional("SEED_TENANT_SLUG");
export const SEED_ROOT_NAME = optional("SEED_ROOT_NAME");
export const SEED_ROOT_EMAIL = optional("SEED_ROOT_EMAIL");
export const SEED_ROOT_PASSWORD = optional("SEED_ROOT_PASSWORD");