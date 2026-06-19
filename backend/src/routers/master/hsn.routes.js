import { Router } from "express";
import { hsnController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router
  .route("/")
  .get(hsnController.getHsns)
  .post(requirePermission("create"), hsnController.createHsn);

router
  .route("/:hsnId")
  .get(hsnController.getHsnById)
  .put(requirePermission("update"), hsnController.updateHsn)
  .delete(requirePermission("delete"), hsnController.deleteHsn);

export default router;
