import "dotenv/config";
import hpp from "hpp";
import express, { Request} from "express";
// import { body, validationResult } from "express-validator";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";

import path from "path";

import AppError from "./api/utils/errorHandlers/appError";
import globalErrorHandler from "./api/utils/errorHandlers/globalErrorHandler";
import xss from "xss-clean";

import assistantRouter from "./api/assistants/routes";
import userRouter from "./api/users/routes";
import toolRouter from "./api/tools/routes";
// import conversationRouter from "./Api/conversations/routes";
// import messageRouter from "./Api/message/routes";
// import secretRouter from "./Api/secret/routes";
// import modelsRouter from "./Api/models/routes";

import cookieParser from "cookie-parser";

const app = express();

/* =====================================================
   1️⃣ TRUST PROXY (VERY EARLY)
   Must be set before rate limiting, cookies, etc.
===================================================== */
app.set("trust proxy", 1);
app.use(cookieParser());

/* =====================================================
   2️⃣ DEV LOGGING (EARLY, NON-BLOCKING)
   Pure observers — never respond
===================================================== */
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
  console.log("Hey i am the development function 👋");

  app.use((req: Request & { requestTime?: string }, _res, next) => {
    req.requestTime = new Date().toISOString();
    console.log("Request received at:", req.requestTime);
    next();
  });
}

/* =====================================================
   3️⃣ HEALTH / DOCS ROUTES (FIRST REAL RESPONDERS)
   These must work even if everything else breaks
===================================================== */
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Percy API running 🚀" });
});



app.get("/docs", (_req, res) => {
  res.json({ status: "ok", docs: "Documentation available here." });
});

/* =====================================================
   4️⃣ CORS (BEFORE BODY PARSING & ROUTES)
   Handles preflight + credentials
===================================================== */
const allowedOrigins = [
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);




/* =====================================================
   5️⃣ BODY PARSERS
===================================================== */
app.use(express.json({ limit: "1000kb" }));
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   6️⃣ SECURITY MIDDLEWARE (NON-RESPONDERS)
===================================================== */
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(
  hpp({
    whitelist: ["duration", "rating", "price"],
  })
);

/* =====================================================
   7️⃣ STATIC FILES (AFTER REAL ROUTES)
   Never let static swallow APIs
===================================================== */
app.use(express.static(path.join(__dirname, "public")));

/* =====================================================
   8️⃣ RATE LIMITING (SCOPED)
   Never global
===================================================== */
const apiLimiter = rateLimit({
  max: 200,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP, please try again in an hour.",
});
app.use("/api", apiLimiter);

/* =====================================================
   9️⃣ API ROUTES (BUSINESS LOGIC)
===================================================== */
app.use("/api/v1/assistants", assistantRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/tools", toolRouter);
// app.use("/api/v1/models", modelsRouter);



/* =====================================================
   🔟 CATCH-ALL (ABSOLUTELY LAST)
===================================================== */
app.use((req, _res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

/* =====================================================
   1️⃣1️⃣ GLOBAL ERROR HANDLER (LAST LINE)
===================================================== */
app.use(globalErrorHandler);

export default app;
