import mongoose from "mongoose";

const pointSchema = new mongoose.Schema({
  address: { type: String, required: true, trim: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }
}, { _id: false });

const rideSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  captain: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  pickup: { type: pointSchema, required: true },
  drop: { type: pointSchema, required: true },
  vehicleType: { type: String, enum: ["bike", "auto", "cab"], required: true },
  estimatedFare: { type: Number, min: 0, required: true },
  status: { type: String, enum: ["requested", "accepted", "started", "completed", "cancelled"], default: "requested" },
  startOtpHash: { type: String, default: null },
  otpVerifiedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model("Ride", rideSchema);
