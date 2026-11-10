import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { createServer } from "node:http";
import authRoutes from "./routes/auth.js";
import rideRoutes from "./routes/rides.js";
import { initRealtime } from "./realtime.js";

dotenv.config();
const app = express();
app.use(helmet());
app.use(cors({
  origin(origin, cb) {
    const allowed = (process.env.CLIENT_ORIGINS || "").split(",").map(x => x.trim());
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "BalliaGo Live Ride API" }));
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const port = process.env.PORT || 5000;
try {
  await mongoose.connect(process.env.MONGO_URI);
  const httpServer = createServer(app);
  initRealtime(httpServer);
  httpServer.listen(port, () => console.log(`BalliaGo API + Socket.IO listening on ${port}`));
} catch (err) {
  console.error("Database connection failed:", err.message);
  process.exit(1);
}
