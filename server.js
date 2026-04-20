// server.js
// Entry point for the OHS CRM backend server.
// Sets up Express, registers global middleware,
// mounts all API routes, connects to MongoDB,
// and starts listening.

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import connectDB from "./config/db.js";
import { PORT, NODE_ENV, CLIENT_ORIGIN, COOKIE_SECRET } from "./config/env.js";


// ─────────────────────────────────────────
// Route imports
// Add new route files here as phases complete
// ─────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import tenantRoutes from "./routes/tenant.routes.js";
import userRoutes from "./routes/user.routes.js";
import courseRoutes from "./routes/course.routes.js";
import checklistRoutes from "./routes/checklist.routes.js";
import instituteRoutes from "./routes/institute.routes.js";
import candidateRoutes from "./routes/candidate.routes.js";
import documentRoutes from "./routes/document.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import reminderRoutes from "./routes/reminder.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import reportRoutes from "./routes/report.routes.js";
import activityLogRoutes from "./routes/activitylog.routes.js";


// ─────────────────────────────────────────
// Global error handler middleware
// ─────────────────────────────────────────
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// ─────────────────────────────────────────
// CORS
// Allows the frontend origin to make requests.
// credentials: true is required for httpOnly
// cookies (refresh token) to be sent.
// ─────────────────────────────────────────
app.use(cors({
  origin: "https://ohs-crm-client.vercel.app",
  credentials: true,
}));

// IMPORTANT: Handle preflight for ALL routes explicitly
app.options('*', cors());




// ─────────────────────────────────────────
// Body parsers
// ─────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─────────────────────────────────────────
// Cookie parser
// Required to read httpOnly refresh token cookie
// ─────────────────────────────────────────
app.use(cookieParser(COOKIE_SECRET));

// ─────────────────────────────────────────
// HTTP request logger — development only
// ─────────────────────────────────────────
if (NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ─────────────────────────────────────────
// Static files — local uploads
// Serves uploaded files during development.
// Remove this when switching to Cloudinary/S3.
// ─────────────────────────────────────────
app.use("/uploads", express.static("uploads"));

// ─────────────────────────────────────────
// Health check
// ─────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "OHS CRM Server is running",
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────
// API Routes
// Each phase adds its router here.
// ─────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/checklists", checklistRoutes);
app.use("/api/institutes", instituteRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/activity-logs", activityLogRoutes);

// Phase 4  — app.use("/api/tenants", tenantRoutes);
// Phase 5  — app.use("/api/users", userRoutes);
// Phase 6  — app.use("/api/courses", courseRoutes);
// Phase 7  — app.use("/api/checklists", checklistRoutes);
// Phase 8  — app.use("/api/institutes", instituteRoutes);
// Phase 9  — app.use("/api/candidates", candidateRoutes);
// Phase 10 — app.use("/api/documents", documentRoutes);
// Phase 11 — app.use("/api/enrollments", enrollmentRoutes);
// Phase 12 — app.use("/api/payments", paymentRoutes);
// Phase 13 — app.use("/api/reminders", reminderRoutes);
// Phase 14 — app.use("/api/dashboard", dashboardRoutes);
// Phase 15 — app.use("/api/reports", reportRoutes);

// ─────────────────────────────────────────
// 404 handler
// Catches any request that did not match
// a registered route above
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─────────────────────────────────────────
// Global error handler
// Must be registered last — after all routes.
// Receives all errors from asyncHandler and
// any manually called next(error).
// ─────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────
// Start server
// ─────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT} [${NODE_ENV}]`);
  });
});