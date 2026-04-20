// seed.js
// One-time script to create the first tenant and root user.
// Run once with: npm run seed
// Never run again — it checks before inserting to avoid duplicates.

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import connectDB from "./config/db.js";
import {
  SEED_TENANT_NAME,
  SEED_TENANT_SLUG,
  SEED_ROOT_NAME,
  SEED_ROOT_EMAIL,
  SEED_ROOT_PASSWORD,
} from "./config/env.js";

// ─────────────────────────────────────────
// Inline minimal schemas for the seed script.
// We can't import from models/ yet because
// models are built in Phase 2.
// These are intentionally minimal — just enough
// to insert the seed records correctly.
// ─────────────────────────────────────────

const tenantSchema = new mongoose.Schema(
  {
    name: String,
    slug: String,
    plan: { type: String, default: "free" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    tenantId: mongoose.Schema.Types.ObjectId,
    name: String,
    email: String,
    password: String,
    role: { type: String, default: "root" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

const Tenant = mongoose.model("Tenant", tenantSchema);
const User = mongoose.model("User", userSchema);

const seed = async () => {
  // Validate seed env variables before doing anything
  if (
    !SEED_TENANT_NAME ||
    !SEED_TENANT_SLUG ||
    !SEED_ROOT_NAME ||
    !SEED_ROOT_EMAIL ||
    !SEED_ROOT_PASSWORD
  ) {
    console.error(
      "❌ Seed failed: Missing one or more SEED_ variables in .env"
    );
    process.exit(1);
  }

  await connectDB();

  // ─────────────────────────────────────────
  // Check if tenant already exists
  // ─────────────────────────────────────────
  const existingTenant = await Tenant.findOne({ slug: SEED_TENANT_SLUG });
  if (existingTenant) {
    console.log("⚠️  Tenant already exists — seed skipped.");
    console.log(`   Tenant : ${existingTenant.name}`);
    console.log(`   ID     : ${existingTenant._id}`);
    process.exit(0);
  }

  // ─────────────────────────────────────────
  // Create tenant
  // ─────────────────────────────────────────
  const tenant = await Tenant.create({
    name: SEED_TENANT_NAME,
    slug: SEED_TENANT_SLUG,
    plan: "free",
    isActive: true,
  });

  console.log(`✅ Tenant created: ${tenant.name} (${tenant._id})`);

  // ─────────────────────────────────────────
  // Check if root user already exists
  // ─────────────────────────────────────────
  const existingUser = await User.findOne({ email: SEED_ROOT_EMAIL });
  if (existingUser) {
    console.log("⚠️  Root user already exists — skipping user creation.");
    process.exit(0);
  }

  // ─────────────────────────────────────────
  // Hash password and create root user
  // ─────────────────────────────────────────
  const hashedPassword = await bcrypt.hash(SEED_ROOT_PASSWORD, 12);

  const user = await User.create({
    tenantId: tenant._id,
    name: SEED_ROOT_NAME,
    email: SEED_ROOT_EMAIL,
    password: hashedPassword,
    role: "root",
    isActive: true,
  });

  console.log(`✅ Root user created: ${user.name} (${user.email})`);
  console.log("");
  console.log("─────────────────────────────────────");
  console.log("Seed complete. Save these details:");
  console.log(`  Tenant  : ${tenant.name}`);
  console.log(`  Slug    : ${tenant.slug}`);
  console.log(`  Email   : ${user.email}`);
  console.log(`  Password: ${SEED_ROOT_PASSWORD}`);
  console.log("─────────────────────────────────────");

  process.exit(0);
};

seed().catch((err) => {
  console.error("❌ Seed error:", err.message);
  process.exit(1);
});