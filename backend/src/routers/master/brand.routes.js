import { Router } from "express";
import { brandController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", brandController.getBrands);
router.post("/", requirePermission("create"), brandController.createBrand);
router.get("/:brandId", brandController.getBrandById);
router.put("/:brandId", requirePermission("update"), brandController.updateBrand);
router.delete("/:brandId", requirePermission("delete"), brandController.deleteBrand);
router.patch("/:brandId/discount", requirePermission("update"), brandController.updateDiscount);

export default router;
