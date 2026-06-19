import { Router } from "express";
import { dashboardController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";

const router = Router();

router.use(authMiddleware);
router.use(resolveFinancialYear);

router.get("/", dashboardController.getDashboard);

router.get("/firm", requireFirm, dashboardController.getFirmDashboard);

export default router;
