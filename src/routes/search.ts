import { Router } from "express";
import { optionalAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { searchAll } from "../controllers/searchController";
import { searchSchema } from "../schemas/searchSchema";

const router = Router();

router.get("/search", optionalAuth, validate(searchSchema), searchAll);

export default router;
