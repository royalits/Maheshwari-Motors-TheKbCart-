import { Router } from "express";
import bankController from "../../controllers/master/bank.controller.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", bankController.getBanks);
router.post("/", requirePermission("create"), bankController.createBank);
router.get("/:bankId", bankController.getBankById);
router.put("/:bankId", requirePermission("update"), bankController.updateBank);
router.delete("/:bankId", requirePermission("delete"), bankController.deleteBank);

export default router;
