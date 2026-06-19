import { Router } from "express";
import { labelController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", labelController.getLabels);
router.post("/", requirePermission("create"), labelController.createLabel);
router.get("/:labelId", labelController.getLabelById);
router.put("/:labelId", requirePermission("update"), labelController.updateLabel);
router.delete("/:labelId", requirePermission("delete"), labelController.deleteLabel);

// Granular discount endpoints
router.get("/:labelId/brands", labelController.getLabelBrands);
router.get(
  "/:labelId/brands/:brandId/items",
  labelController.getLabelBrandItems,
);
router.patch(
  "/:labelId/brands/:brandId",
  requirePermission("update"),
  labelController.updateBrandDiscount,
);
router.patch(
  "/:labelId/brands/:brandId/items/:itemId",
  requirePermission("update"),
  labelController.updateItemDiscount,
);

export default router;
