import mongoose from "mongoose";

const captainLocationSchema = new mongoose.Schema({
  captain: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  heading: { type: Number, default: 0 },
  isOnline: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

captainLocationSchema.index({ location: "2dsphere" });
export default mongoose.model("CaptainLocation", captainLocationSchema);
