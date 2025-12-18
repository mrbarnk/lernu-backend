import { Router } from "express";
import { login, logout, me, signup } from "../controllers/authController";
import { validate } from "../middleware/validate";
import { loginSchema, signupSchema } from "../schemas/authSchemas";
import { requireAuth } from "../middleware/auth";
import { strictLimiter } from "../middleware/rateLimiters";

const router = Router();

router.post("/signup", strictLimiter, validate(signupSchema), signup);
router.post("/login", strictLimiter, validate(loginSchema), login);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);

export default router;
