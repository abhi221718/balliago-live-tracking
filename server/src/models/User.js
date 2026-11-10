import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, trim: true },
  role: { type: String, enum: ["customer", "captain", "admin"], default: "customer" },
  isApproved: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
