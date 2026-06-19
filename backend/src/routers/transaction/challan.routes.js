import { Router } from "express";
import { challanController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);

const setChallanType = (type) => (req, _res, next) => {
  req.params.challanType = type;
  next();
};

router.post("/", requirePermission("create"), challanController.createChallan);
router.post("/check-challan-no", challanController.checkChallanNoUnique);

router.get("/", challanController.getAllChallans);
router.get("/sale", setChallanType("sale"), challanController.getChallans);
router.get(
  "/purchase",
  setChallanType("purchase"),
  challanController.getChallans,
);

router.get(
  "/contact/:contactId/unconverted",
  challanController.getUnconvertedChallansForContact,
);

router.get("/item/:itemId/last-sold", challanController.getLastSoldItem);

router.get("/:challanId", challanController.getChallanById);
router.put("/:challanId", requirePermission("update"), challanController.updateChallan);
router.delete("/:challanId", requirePermission("delete"), challanController.deleteChallan);

router.post("/:challanId/payment", requirePermission("create"), challanController.recordPayment);

export default router;
