import { Router } from "express";
import mediaController from "../controllers/media.controller.js";

const router = Router();

router.get("/items/:fileName", mediaController.streamItemImage);
router.get("/signatures/:fileName", mediaController.streamSignature);
router.get("/file", mediaController.streamFile);

export default router;
