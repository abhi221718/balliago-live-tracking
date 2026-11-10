import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import CaptainLocation from "./models/CaptainLocation.js";
import Ride from "./models/Ride.js";

let io;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.CLIENT_ORIGINS || "").split(",").map(x => x.trim()),
      methods: ["GET", "POST"]
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.id).select("_id role isApproved name");
      if (!user) return next(new Error("User not found"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", socket => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);

    socket.on("captain:online", async ({ lat, lng, heading = 0 } = {}, ack = () => {}) => {
      try {
        if (socket.user.role !== "captain" || !socket.user.isApproved)
          return ack({ ok: false, message: "Captain is not approved" });
        if (!validCoordinates(lat, lng)) return ack({ ok: false, message: "Invalid coordinates" });
        await CaptainLocation.findOneAndUpdate(
          { captain: socket.user._id },
          { $set: { location: { type: "Point", coordinates: [lng, lat] }, heading, isOnline: true, lastSeenAt: new Date() } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        socket.join("captains:online");
        ack({ ok: true });
      } catch (e) { ack({ ok: false, message: e.message }); }
    });

    socket.on("captain:location", async ({ lat, lng, heading = 0 } = {}, ack = () => {}) => {
      try {
        if (socket.user.role !== "captain" || !socket.user.isApproved)
          return ack({ ok: false, message: "Captain is not approved" });
        if (!validCoordinates(lat, lng)) return ack({ ok: false, message: "Invalid coordinates" });
        const location = await CaptainLocation.findOneAndUpdate(
          { captain: socket.user._id, isOnline: true },
          { $set: { location: { type: "Point", coordinates: [lng, lat] }, heading, lastSeenAt: new Date() } },
          { new: true }
        );
        if (!location) return ack({ ok: false, message: "Captain is offline" });

        const activeRide = await Ride.findOne({
          captain: socket.user._id, status: { $in: ["accepted", "started"] }
        }).select("_id customer");
        if (activeRide) {
          io.to(`user:${activeRide.customer}`).emit("ride:captain-location", {
            rideId: activeRide._id, captainId: userId, lat, lng, heading, updatedAt: new Date()
          });
        }
        ack({ ok: true });
      } catch (e) { ack({ ok: false, message: e.message }); }
    });

    socket.on("customer:location", async ({ rideId, lat, lng } = {}, ack = () => {}) => {
      try {
        if (socket.user.role !== "customer") return ack({ ok: false, message: "Customer only" });
        if (!rideId || !validCoordinates(lat, lng))
          return ack({ ok: false, message: "Ride and valid coordinates are required" });
        const ride = await Ride.findOne({
          _id: rideId,
          customer: socket.user._id,
          status: { $in: ["accepted", "started"] },
          captain: { $ne: null }
        }).select("_id captain");
        if (!ride) return ack({ ok: false, message: "Active assigned ride not found" });
        io.to(`user:${ride.captain}`).emit("ride:customer-location", {
          rideId: ride._id, customerId: userId, lat, lng, updatedAt: new Date()
        });
        ack({ ok: true });
      } catch (e) { ack({ ok: false, message: e.message }); }
    });

    socket.on("captain:offline", async (ack = () => {}) => {
      if (socket.user.role !== "captain") return ack({ ok: false, message: "Captain only" });
      await CaptainLocation.findOneAndUpdate({ captain: socket.user._id }, { $set: { isOnline: false } });
      socket.leave("captains:online");
      ack({ ok: true });
    });

    socket.on("disconnect", async () => {
      // Do not automatically mark offline on a transient network disconnect.
      // A heartbeat/stale-location job should handle offline status in production.
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Realtime server not initialized");
  return io;
}

export function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
