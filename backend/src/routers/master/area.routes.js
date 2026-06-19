import { Router } from "express";
import { areaController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", areaController.getAreas);
router.post("/", requirePermission("create"), areaController.createArea);
router.get("/:areaId", areaController.getAreaById);
router.put("/:areaId", requirePermission("update"), areaController.updateArea);
router.delete("/:areaId", requirePermission("delete"), areaController.deleteArea);

export default router;
