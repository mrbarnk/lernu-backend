import { Router } from "express";
import { communityStats } from "../controllers/statsController";

const router = Router();

router.get("/community", communityStats);

export default router;
