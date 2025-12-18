import { Router } from "express";
import { submitContact } from "../controllers/contactController";
import { validate } from "../middleware/validate";
import { contactSchema } from "../schemas/contactSchema";

const router = Router();

router.post("/contact", validate(contactSchema), submitContact);

export default router;
