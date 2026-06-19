import { Router } from "express";
import { contactController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", contactController.getContacts);
router.get("/parties", contactController.getParties);
router.get("/suppliers", contactController.getSuppliers);
router.get("/books", contactController.getBooks);
router.post("/", requirePermission("create"), contactController.createContact);
router.get("/due", contactController.getContactsWithDue);
router.get("/overpaid", contactController.getContactsWithOverpaid);
router.get("/:contactId", contactController.getContactById);
router.put("/:contactId", requirePermission("update"), contactController.updateContact);
router.delete("/:contactId", requirePermission("delete"), contactController.deleteContact);
router.get("/:contactId/balance", contactController.getContactBalance);
router.patch("/:contactId/balance", requirePermission("update"), contactController.updateContactBalance);

export default router;
