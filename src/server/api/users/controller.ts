import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import AppError from "../utils/errorHandlers/appError";
import { UserModel } from "./schema";
import APIFeatures from "../utils/apiFeatures";

// ---- Type-safe filterObj ----
function filterObj<T extends object, K extends keyof T>(
    obj: T,
    ...allowedFields: K[]
): Pick<T, K> {
    const newObj = {} as Pick<T, K>;
    Object.keys(obj).forEach((el) => {
        if (allowedFields.includes(el as K)) {
            newObj[el as K] = obj[el as K];
        }
    });
    return newObj;
}

// userController.ts
export const getMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError("Not logged in", 401));
    // console.log("get me controller", req.user)
    res.status(200).json({ status: "success", user: req.user });
});


const getAllUsers = catchAsync(async (req: Request, res: Response) => {
    // const users = await UserModel.find();
    const features = new APIFeatures(UserModel.find(), req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();
    const users = await features.query;

    res.status(200).json({
        status: "Success",
        results: users.length,
        message: "Users retrieved successfully",
        data: { users },
    });
});

const createUser = catchAsync(async (req: Request, res: Response) => {
    const newUser = new UserModel(req.body);
    await newUser.save();
    res.status(201).json({
        status: "Success",
        data: {
            userStatus: "newuser",
            user: newUser
        },
    });
});


const getSingleUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
        return next(new AppError("No user found with that ID", 404));
    }
    res.status(200).json({
        status: "Success",
        message: "User retrieved successfully",
        data: { user },
    });
});

const updateMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    if (req.body.password || req.body.confirmpassword) {
        return next(
            new AppError(
                "This route is not for password update. Please use /updateMyPassword",
                400
            )
        );
    }

    if (!req.user?._id) {
        return next(new AppError("Not logged in", 401));
    }

    const filteredBody = filterObj(req.body, "name", "email", "image");
    const updateUser = await UserModel.findByIdAndUpdate(req.user._id, filteredBody, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: "Success",
        message: "User updated successfully",
        data: { user: updateUser },
    });
});

const updateUser = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserModel.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });
    if (!user) {
        return next(new AppError("No user found with that ID", 404));
    }
    res.status(200).json({
        status: "Success",
        message: "User updated successfully",
        data: { user },
    });
});

const deleteMe = catchAsync(async (req: Request, res: Response) => {
    await UserModel.findByIdAndUpdate(req.body.id, { active: false });
    // if (!user) {
    //     return next(new AppError("No user found with that ID", 404));
    // }
    res.status(204).json({
        status: "Success",
        message: "User deleted successfully",
        data: null
    });
});

const deleteUser = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const force = req.query.force === "true"; // e.g. /media/123?force=true

    if (force) {
        // Hard delete
        const deleted = await UserModel.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ message: "User permanently deleted" });
    } else {
        // Soft delete (mark inactive)
        const updated = await UserModel.findByIdAndUpdate(
            id,
            { active: false }, // or status: "inactive"
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Media not found" });
        }
        return res.status(200).json({
            message: "Media item soft deleted",
            media: updated,
        });
    }

});



export const userController = {
    createUser,
    getMe,
    getAllUsers,
    getSingleUser,
    updateUser,
    updateMe,
    deleteMe,
    deleteUser,
};