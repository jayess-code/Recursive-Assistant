import { Router } from "express";
import  assistantController  from "./controller";
import { authController } from "../users/authController";

const router = Router();



// Password
router.post("/forgot-password", authController.forgotPassword);
router.patch("/reset-password/:token", authController.resetPassword);
router.patch("/update-password", authController.protect, authController.updatePassword);

// Assistants
router.route("/")
    .get(assistantController.getAllAssistants)
    .post(authController.protect, authController.restrictTo("admin"), assistantController.createAssistant);

router.get("/me", authController.protect, assistantController.getAssistant);

router.patch("/update-me", authController.protect, assistantController.updateAssistant);
router.delete("/delete-me", authController.protect, assistantController.deleteAssistant);

router.route("/:id")
    .get(assistantController.getAssistant)
    .patch(authController.protect, assistantController.updateAssistant)
    .delete(authController.protect, authController.restrictTo("admin", "guide"),
        assistantController.deleteAssistant);

export default router;