import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, phone, role = "customer" } = req.body;
    if (!name || !email || !password || password.length < 8)
      return res.status(400).json({ message: "Name, valid email and password (8+ chars) are required" });
    if (!["customer", "captain"].includes(role))
      return res.status(400).json({ message: "Invalid registration role" });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ message: "Email already registered" });
    const user = await User.create({
      name, email, phone, role,
      passwordHash: await bcrypt.hash(password, 12)
    });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isApproved: user.isApproved }
    });
  } catch (e) { next(e); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(password || "", user.passwordHash)))
      return res.status(401).json({ message: "Incorrect email or password" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isApproved: user.isApproved }
    });
  } catch (e) { next(e); }
});

router.get("/me", protect, (req, res) => res.json({ user: req.user }));
export default router;
