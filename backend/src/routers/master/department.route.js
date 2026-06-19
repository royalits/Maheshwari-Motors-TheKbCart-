import { Router } from "express";
import { authMiddleware } from "../../middlewares/index.js";
import departmentController from "../../controllers/master/department.controller.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();
router.use(authMiddleware);

router
  .route("/")
  .get(departmentController.getDepartmants)
  .post(requirePermission("create"), departmentController.createDepartment);

router
  .route("/:departmentId")
  .put(requirePermission("update"), departmentController.updateDepartment)
  .delete(requirePermission("delete"), departmentController.deleteDepartment);

export default router;
