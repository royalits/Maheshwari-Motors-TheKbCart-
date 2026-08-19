import { Router } from "express";
import multer from "multer";
import { itemController } from "../../controllers/index.js";
import { authMiddleware } from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed =
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      /\.xlsx$/i.test(file.originalname || "");
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are allowed"), false);
    }
  },
});

router.get("/:itemId/image", itemController.getItemImage);

router.use(authMiddleware);

router.get("/", itemController.getItems);
router.post(
  "/",
  requirePermission("create"),
  upload.single("image"),
  itemController.createItem,
);
router.post(
  "/import",
  requirePermission("create"),
  excelUpload.single("file"),
  itemController.importItems,
);
router.get("/export", itemController.exportItems);
router.post("/check-barcode", itemController.checkBarcodeUnique);
router.get("/low-stock", itemController.getLowStockItems);
router.put(
  "/batch-update",
  requirePermission("update"),
  itemController.batchUpdateItems,
);
router.get("/:itemId", itemController.getItemById);
router.put(
  "/:itemId",
  requirePermission("update"),
  upload.single("image"),
  itemController.updateItem,
);
router.delete(
  "/:itemId",
  requirePermission("delete"),
  itemController.deleteItem,
);
router.patch(
  "/:itemId/stock",
  requirePermission("update"),
  itemController.updateStock,
);

export default router;
