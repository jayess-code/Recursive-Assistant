import { Router } from "express";
import toolsController from "./controller";
import { authController } from "../users/authController";

const router = Router();

router.use(authController.protect);

router.get("/", toolsController.listTools);
router.get("/:name", toolsController.getToolByName);
router.post("/execute", toolsController.executeTool);
router.post("/sync", authController.restrictTo("admin"), toolsController.syncLocalTools);

export default router;
