import { Router } from "express";
import { autoBillController } from "../../controllers/index.js";
import { authMiddleware, requireFirm } from "../../middlewares/index.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);

router
  .route("/")
  .get(autoBillController.getRules)
  .post(autoBillController.createRule);

router
  .route("/:ruleId")
  .get(autoBillController.getRuleById)
  .put(autoBillController.updateRule)
  .delete(autoBillController.deleteRule);

export default router;
