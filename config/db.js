// config/db.js
// Connects to MongoDB Atlas using Mongoose.
// Called once at server startup — exits process on failure.

import mongoose from "mongoose";
import { MONGODB_URI, NODE_ENV } from "./env.js";

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(MONGODB_URI, {
      // These are the recommended options for MongoDB Atlas + Mongoose 8.x
      // No deprecated flags — Mongoose 8 has clean defaults
    });

    console.log(
      `✅ MongoDB connected: ${connection.connection.host} [${NODE_ENV}]`
    );

    // ─────────────────────────────────────────
    // Mongoose global settings
    // ─────────────────────────────────────────

    // Disable Mongoose's internal buffering —
    // if DB is not connected, queries fail immediately
    // instead of silently queuing up
    mongoose.set("bufferCommands", false);

  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    // Exit the process — no point running the server without a DB
    process.exit(1);
  }
};

// ─────────────────────────────────────────
// Graceful shutdown — close DB connection
// when the Node process is terminated
// ─────────────────────────────────────────
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed — process terminated.");
  process.exit(0);
});

export default connectDB;