import { Router } from "express";
import { transportController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", transportController.getTransports);
router.post("/", requirePermission("create"), transportController.createTransport);
router.get("/:transportId", transportController.getTransportById);
router.put("/:transportId", requirePermission("update"), transportController.updateTransport);
router.delete("/:transportId", requirePermission("delete"), transportController.deleteTransport);

export default router;
