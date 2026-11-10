import { Router } from "express";
import crypto from "node:crypto";
import Ride from "../models/Ride.js";
import CaptainLocation from "../models/CaptainLocation.js";
import { protect, allowRoles } from "../middleware/auth.js";
import { getIO, validCoordinates } from "../realtime.js";

const router = Router();
const baseFare = { bike: 30, auto: 45, cab: 90 };
const radiusMeters = Number(process.env.CAPTAIN_SEARCH_RADIUS_METERS || 5000);

router.post("/", protect, allowRoles("customer"), async (req, res, next) => {
  try {
    const { pickup, drop, vehicleType } = req.body;
    if (!pickup?.address || !drop?.address ||
        !validCoordinates(pickup?.coordinates?.lat, pickup?.coordinates?.lng) ||
        !validCoordinates(drop?.coordinates?.lat, drop?.coordinates?.lng) ||
        !baseFare[vehicleType]) {
      return res.status(400).json({ message: "Pickup/drop address, valid map coordinates and vehicle type are required" });
    }

    // Demo fare only: replace with Google Routes distance/time calculation and approved fare policy.
    const ride = await Ride.create({
      customer: req.user._id, pickup, drop, vehicleType, estimatedFare: baseFare[vehicleType]
    });

    const nearby = await CaptainLocation.find({
      isOnline: true,
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [pickup.coordinates.lng, pickup.coordinates.lat] },
          $maxDistance: radiusMeters
        }
      }
    }).limit(30).select("captain");

    const io = getIO();
    for (const item of nearby) {
      io.to(`user:${item.captain}`).emit("ride:request", {
        rideId: ride._id,
        pickup: ride.pickup,
        drop: ride.drop,
        vehicleType: ride.vehicleType,
        estimatedFare: ride.estimatedFare
      });
    }
    res.status(201).json({ ride, notifiedCaptains: nearby.length });
  } catch (e) { next(e); }
});

router.get("/mine", protect, async (req, res, next) => {
  try {
    const filter = req.user.role === "captain"
      ? { $or: [{ captain: req.user._id }, { status: "requested" }] }
      : { customer: req.user._id };
    const rides = await Ride.find(filter)
      .populate("customer", "name phone")
      .populate("captain", "name phone")
      .sort({ createdAt: -1 });
    res.json({ rides });
  } catch (e) { next(e); }
});

router.patch("/:id/accept", protect, allowRoles("captain"), async (req, res, next) => {
  try {
    if (!req.user.isApproved) return res.status(403).json({ message: "Captain approval required" });
    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: "requested", captain: null },
      { $set: { captain: req.user._id, status: "accepted" } },
      { new: true }
    ).populate("customer", "name phone");
    if (!ride) return res.status(409).json({ message: "Ride is no longer available" });

    // Demo OTP: delivered only to the authenticated customer's socket room.
    // Production must use a verified, rate-limited notification/SMS provider.
    const startOtp = String(crypto.randomInt(1000, 10000));
    ride.startOtpHash = crypto.createHash("sha256").update(startOtp).digest("hex");
    await ride.save();

    const io = getIO();
    io.to(`user:${ride.customer._id}`).emit("ride:accepted", {
      rideId: ride._id, captain: { id: req.user._id, name: req.user.name }
    });
    const captainLocation = await CaptainLocation.findOne({ captain: req.user._id, isOnline: true })
      .select("location heading lastSeenAt");
    if (captainLocation) {
      io.to(`user:${ride.customer._id}`).emit("ride:captain-location", {
        rideId: ride._id,
        captainId: req.user._id,
        lat: captainLocation.location.coordinates[1],
        lng: captainLocation.location.coordinates[0],
        heading: captainLocation.heading,
        updatedAt: captainLocation.lastSeenAt
      });
    }
    io.to(`user:${ride.customer._id}`).emit("ride:start-otp", {
      rideId: ride._id, otp: startOtp
    });
    res.json({ ride });
  } catch (e) { next(e); }
});

router.post("/:id/start", protect, allowRoles("captain"), async (req, res, next) => {
  try {
    const { otp } = req.body;
    const ride = await Ride.findOne({ _id: req.params.id, captain: req.user._id, status: "accepted" });
    if (!ride) return res.status(404).json({ message: "Accepted ride not found" });
    const hash = crypto.createHash("sha256").update(String(otp || "")).digest("hex");
    if (!ride.startOtpHash || hash !== ride.startOtpHash)
      return res.status(400).json({ message: "Incorrect ride OTP" });
    ride.status = "started";
    ride.otpVerifiedAt = new Date();
    ride.startOtpHash = null;
    await ride.save();
    getIO().to(`user:${ride.customer}`).emit("ride:started", { rideId: ride._id });
    res.json({ ride });
  } catch (e) { next(e); }
});

router.patch("/:id/status", protect, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["completed", "cancelled"].includes(status))
      return res.status(400).json({ message: "Allowed status: completed or cancelled" });
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    const isCustomer = ride.customer.equals(req.user._id);
    const isCaptain = ride.captain?.equals(req.user._id);
    if (!isCustomer && !isCaptain && req.user.role !== "admin")
      return res.status(403).json({ message: "Not your ride" });
    if (status === "completed" && (!isCaptain || ride.status !== "started"))
      return res.status(400).json({ message: "Only assigned captain can complete a started ride" });
    if (status === "cancelled" && !["requested", "accepted"].includes(ride.status))
      return res.status(400).json({ message: "Ride cannot be cancelled now" });
    ride.status = status;
    await ride.save();
    getIO().to(`user:${ride.customer}`).emit(`ride:${status}`, { rideId: ride._id });
    if (ride.captain) getIO().to(`user:${ride.captain}`).emit(`ride:${status}`, { rideId: ride._id });
    res.json({ ride });
  } catch (e) { next(e); }
});

export default router;
