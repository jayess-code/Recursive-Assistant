import { Router } from "express";
import { userController } from "./controller";
import { authController } from "./authController";

const router = Router();

// Auth
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// Password
router.post("/forgot-password", authController.forgotPassword);
router.patch("/reset-password/:token", authController.resetPassword);
router.patch("/update-password", authController.protect, authController.updatePassword);

// Users
router.route("/")
    .get(userController.getAllUsers)
    .post(authController.protect, authController.restrictTo("admin"), userController.createUser);

router.get("/me", authController.protect, userController.getMe);

router.patch("/update-me", authController.protect, userController.updateMe);
router.delete("/delete-me", authController.protect, userController.deleteMe);

router.route("/:id")
    .get(userController.getSingleUser)
    .patch(authController.protect, userController.updateUser)
    .delete(authController.protect, authController.restrictTo("admin", "guide"),
        userController.deleteUser);

export default router;