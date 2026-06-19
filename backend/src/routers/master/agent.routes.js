import { Router } from "express";
import { agentController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", agentController.getAgents);
router.post("/", requirePermission("create"), agentController.createAgent);
router.get("/:agentId", agentController.getAgentById);
router.put("/:agentId", requirePermission("update"), agentController.updateAgent);
router.delete("/:agentId", requirePermission("delete"), agentController.deleteAgent);

export default router;
