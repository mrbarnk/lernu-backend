import { Router } from "express";
import { validate } from "../middleware/validate";
import { contactSchema } from "../schemas/contactSchema";
import { submitContact } from "../controllers/contactController";
import { strictLimiter } from "../middleware/rateLimiters";

const router = Router();

router.post("/contact", strictLimiter, validate(contactSchema), submitContact);

export default router;
