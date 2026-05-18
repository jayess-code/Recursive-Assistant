import { Request, Response, NextFunction } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";

// Typing the argument for myFn more strictly, depending on the expected request types.
export const catchAsync = (
  myFn: (
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    res: Response<any, Record<string, any>>,
    next: NextFunction
  ) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    myFn(req, res, next).catch(next); // Catch async errors and pass them to next
  };
};