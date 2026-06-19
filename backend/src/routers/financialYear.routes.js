import { Router } from "express";
import financialYearController from "../controllers/common/financialYear.controller.js";
import { authMiddleware, requireFirm } from "../middlewares/index.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);

router.get("/", financialYearController.getYears);

export default router;
