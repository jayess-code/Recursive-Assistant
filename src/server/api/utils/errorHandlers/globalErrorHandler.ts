import { Response, Request, NextFunction } from "express";
import AppError from "./appError";

interface MongooseError extends Error {
  path?: string;
  value?: any;
  code?: number;
  errors?: Record<string, { message: string }>;
  name: string;
}


const sendErrorDev = (err: AppError, res: Response) => {
  console.error("ERROR 💥", err);

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    error: err,
    stack: err.stack,
  });
};

const sendErrorProd = (err: AppError, res: Response) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    console.error("ERROR 💥", err);
    res.status(500).json({
      status: "error",
      message: "Something Went Wrong!!!",
    });
  }
};

const handleCastError = (err: MongooseError) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err: MongooseError) => {
  const match = err.message.match(/(["'])(?:(?=(\\?))\2.)*?\1/);
  const keyValue = match ? match[0] : "";
  const message = `${keyValue} already exists!`;
  return new AppError(message, 409);
};

const handleValidationError = (err: MongooseError) => {
  const errors = Object.values(err.errors ?? {}).map((el: any) => el.message);
  const message = `Invalid Data Input. ${errors.join(". ")}`;
  const appError = new AppError(message, 409);
  return appError;
};


const handleJWTError = () =>
  new AppError("Invalid Token, Please Login Again", 401);

const handleJWTExpiredError = () =>
  new AppError("Your Token Got Expired, Please Login Again", 401);


const globalErrorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
  void req;
  if (res.headersSent) {
    return next(err);
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === "production") {
    let error = Object.assign({}, err);
    error.message = err.message;
    error.name = err.name;
    error.statusCode = err.statusCode || 500;
    error.status = err.status || "error";

    if (error.name === "CastError") error = handleCastError(error);
    if (err.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError") error = handleValidationError(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

export default globalErrorHandler;