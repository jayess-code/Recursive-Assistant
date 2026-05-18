import { catchAsync } from "../utils/catchAsync";
import { Request, Response, NextFunction } from "express";
import APIFeatures from "../utils/apiFeatures";
import { AssistantModel } from "./schema";
import AppError from "../utils/errorHandlers/appError";

const assistantControllers = {
    createAssistant: catchAsync(async (req: Request, res: Response) => {
        const assistant = req.body;
        const newAssistant = await AssistantModel.create(assistant);
        res.status(201).json({
            status: "success",
            message: "Assistant created successfully",
            data: newAssistant
        });
    }),
    
    getAllAssistants: catchAsync(async (req: Request, res: Response) => {
        // Apply API features for pagination, sorting, etc.
        const features = new APIFeatures(AssistantModel.find(), req.query)
            .filter()
            .sort()
            .limitFields()
            .paginate();
        const assistants = await features.query;

        res.status(200).json({
            status: "success",
            total: assistants.length,
            message: "All assistants fetched successfully",
            data: assistants
        });
    }),
    getAssistant: catchAsync(async (req: Request, res: Response) => {
        const assistantId = req.params.id;
        const assistant = await AssistantModel.findById(assistantId);
        if (!assistant) {
            return res.status(404).json({ message: "Assistant not found" });
        }
        res.status(200).json({
            status: "success",
            message: "Assistant fetched successfully",
            data: assistant
        });
    }),
    uploadAssistant: catchAsync(async (req: Request, res: Response) => {

        const assistant = req.body;
        const newAssistant = await AssistantModel.create(assistant);
        // Handle assistant upload
        res.status(200).json({
            status: "success",
            message: "Assistant uploaded successfully",
            data: newAssistant
        });

    }),
    // Update assistant by ID
    updateAssistant: catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const assistantId = req.params.id;
        const updatedAssistant = await AssistantModel.findByIdAndUpdate(assistantId, req.body, { new: true });
        if (!updatedAssistant) {
            return next(new AppError("Assistant not found", 404));
        }
        res.status(200).json({
            status: "success",
            message: "Assistant updated successfully",
            data: updatedAssistant
        });
    }),
    // Delete assistant by ID
    deleteAssistant: catchAsync(async (req: Request, res: Response) => {
        const assistantId = req.params.id;
        const assistant = await AssistantModel.findById(assistantId);
        if (!assistant) {
            return res.status(404).json({ message: "Assistant not found" });
        }
        await AssistantModel.findByIdAndDelete(assistantId);
        res.status(200).json({
            status: "success",
            message: "Assistant deleted successfully",

            data: {
                assistantId,
                assistant: assistant
            }
        });
    }),

    //AGGREGATION PIPELINE
    getAssistantStats: catchAsync(async (req: Request, res: Response) => {
        const groupByField = String(req.query.groupBy || "assistantType");
        const sortField = String(req.query.sort || "avgRating");

        // Construct the aggregation pipeline
        const stats = await AssistantModel.aggregate([
            {
                $match: { rating: { $gte: 3.3 } }, // Match stage to filter documents with rating >= 0
            },
            {
                $group: {
                    _id: { $toUpper: `$${groupByField}` }, // Group by the specified field, converted to uppercase
                    numAssistants: { $sum: 1 }, // Count the number of NFTs
                    avgRating: { $avg: "$ratingAverage" }, // Calculate the average rating
                    numOfRatings: { $sum: "$rating" }, // Sum the ratings
                    avgPrice: { $avg: "$price" }, // Calculate the average price
                    minPrice: { $min: "$price" }, // Find the minimum price
                    maxPrice: { $max: "$price" }, // Find the maximum price
                },
            },
            {
                $sort: { [sortField]: -1 }, // Sort by selected metric in descending order
            },
            // Exclude specific documents
            {
                $match: {
                    _id: { $nin: ["HARMONY BEATS", "ALICE WONDERLAND"] }, // Exclude documents with _id "HARMONY BEATS" and "ALICE WONDERLAND"
                },
            },
        ]);

        res.status(200).json({
            status: "success",
            data: {
                stats,
            },
        });
    }),

    // APIfeatures test middleware
    getTop5Assistants: catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
        req.query.limit = "5";
        req.query.sort = "-rating";
        req.query.fields = "name,price,rating,";
        next()
    })
};

export default assistantControllers;