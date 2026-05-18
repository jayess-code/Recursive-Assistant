
import { IUser, UserModel } from "./schema";
import AppError from "../utils/errorHandlers/appError";
import { catchAsync } from "../utils/catchAsync";
import { CookieOptions, NextFunction, Request, Response } from "express";
import sendEmail from "../utils/sendEmail";
import crypto from "crypto";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
// import { OAuth2Client } from "google-auth-library";
declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}

// Custom JWT payload interface
// --- Custom JWT Payload Interface ---
interface JWTPayload extends JwtPayload {
    id: string;
}

// --- Extend Request for typed user ---
interface AuthRequest extends Request {
    user?: IUser;
}

// --- Environment Variables ---
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "90d";
// const GOOGLE_ID = process.env.GOOGLE_ID!;
// const GOOGLE_SECRET = process.env.GOOGLE_SECRET!;
const GITHUB_ID = process.env.GITHUB_ID!;
const GITHUB_SECRET = process.env.GITHUB_SECRET!;


// --- GOOGLE LOGIN ---
// const googleClient = new OAuth2Client(GOOGLE_ID);

if (!JWT_SECRET || !JWT_EXPIRES_IN) {
    throw new Error("JWT_SECRET and JWT_EXPIRES_IN must be defined in environment variables");
}


// --- Send Token via Cookie ---
const createAndSendToken = (user: IUser, statusCode: number, res: Response) => {
    const expiresIn: SignOptions["expiresIn"] =
        (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) || "10d";

    const token = jwt.sign({ id: user._id }, JWT_SECRET as jwt.Secret, {
        expiresIn,
    });
    
    const cookieOptions: CookieOptions = {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };


    res.cookie("jwt", token, cookieOptions);
  console.log("🟢 SET-COOKIE HEADER:", res.getHeaders()["set-cookie"]);

    user.password = undefined;

    res.status(statusCode).json({
        status: "success",
        token,
        data: { user: user },
    });
};

// --- SIGNUP ---
const signup = catchAsync(async (req: Request, res: Response) => {
    const newUser = await UserModel.create(req.body);
    createAndSendToken(newUser, 201, res);
});

// --- LOGIN ---
const login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new AppError("Please provide your email & password", 400));
    }

    // console.log("Attempting login for email:", email);

    const user = await UserModel.findOne({ email }).select("+password");
    if (!user || !(await user.correctPassword(password, user.password!))) {
        return next(new AppError("Incorrect email or password", 401));
    }

    createAndSendToken(user, 200, res);
});




const logout = (_req: Request, res: Response) => {
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({ status: "success" });
};


// --- PROTECT ROUTE ---
const protect = catchAsync(async (req: AuthRequest, _res: Response, next: NextFunction) => {
    let token: string | undefined;

// 1️⃣ From cookies (browser auth)
if (req.cookies?.jwt) {
  token = req.cookies.jwt;
}

// 2️⃣ Fallback: Authorization header (Postman / mobile)
else if (
  req.headers.authorization &&
  req.headers.authorization.startsWith("Bearer")
) {
  token = req.headers.authorization.split(" ")[1];
}

if (!token) {
  return next(new AppError("You are not logged in", 401));
}

const decoded = jwt.verify(token, JWT_SECRET)  as JWTPayload;


    const currentUser = await UserModel.findById(decoded.id);
    if (!currentUser) return next(new AppError("User no longer exists", 401));

    if (decoded.iat && currentUser.changedPasswordAfter(decoded.iat)) {
        return next(new AppError("User recently changed password", 401));
    }

    req.user = currentUser;
    next();
});

// --- RESTRICT ROLES ---
const restrictTo = (...roles: Array<"user" | "creator" | "admin" | "guide">) => {
    return (req: AuthRequest, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new AppError("You do not have permission", 403));
        }
        next();
    };
};

// --- FORGOT PASSWORD ---
const forgotPassword = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const user = await UserModel.findOne({ email: req.body.email });
    if (!user) return next(new AppError("No user with that email", 404));

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${req.protocol}://${req.get("host")}${req.originalUrl}/${resetToken}`;
    console.log("Reset URL:", resetURL);
    const message = `Reset your password using: ${resetURL}.\n 
        If you did not request this, ignore this email.  `;

    try {
        await sendEmail({
            email: user.email,
            subject: "Password Reset", message
        });
        res.status(200).json({
            status: "success",
            message: "Token sent to email"
        });
    } catch (err) {
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });
        return next(
            new AppError("Error sending email, try again later", 500));
    }
});

// --- RESET PASSWORD ---
const resetPassword = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
const { token } = req.params as { token: string };

const hashedToken = crypto
  .createHash("sha256")
  .update(token)
  .digest("hex");

    const user = await UserModel.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) return next(new AppError("Token invalid or expired", 400));

    user.password = req.body.password;
    user.confirmpassword = req.body.confirmpassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    createAndSendToken(user, 200, res);
});

// --- UPDATE PASSWORD ---
const updatePassword = catchAsync(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = await UserModel.findById(req.user?._id).select("+password");
    if (!user) return next(new AppError("User not found", 404));

    if (!(await user.correctPassword(req.body.passwordCurrent, user.password!))) {
        return next(new AppError("Current password is wrong", 401));
    }

    user.password = req.body.password;
    user.confirmpassword = req.body.confirmpassword;
    await user.save();

    createAndSendToken(user, 200, res);
});

/**
 * GitHub Login Controller (server-side OAuth)
 */
export const githubLogin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const { code } = req.body;
    if (!code) return next(new AppError("Missing GitHub OAuth code", 400));

    try {
        // Step 1: Exchange code for access token
        const tokenRes = await fetch(`https://github.com/login/oauth/access_token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                client_id: GITHUB_ID,
                client_secret: GITHUB_SECRET,
                code,
            }),
        });

        const tokenJson = await tokenRes.json();
        const accessToken = tokenJson.access_token;

        if (!accessToken) return next(new AppError("GitHub OAuth failed to get access token", 400));

        // Step 2: Fetch user profile
        const userRes = await fetch(`https://api.github.com/user`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const profile = await userRes.json();

        if (!profile?.email) {
            // Attempt to fetch emails if email is private
            const emailsRes = await fetch(`https://api.github.com/user/emails`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const emails = await emailsRes.json();
            const primaryEmail = emails.find((e: any) => e.primary)?.email;
            profile.email = primaryEmail;
        }

        if (!profile?.email) return next(new AppError("GitHub login failed: email not available", 400));

        // Step 3: Find or create user
        let user: IUser | null = await UserModel.findOne({ githubId: profile.id });
        if (!user) {
            user = await UserModel.findOne({ email: profile.email });
            if (!user) {
                user = await UserModel.create({
                    githubId: profile.id,
                    email: profile.email,
                    name: profile.name || profile.login,
                });
            } else {
                // Link GitHub ID if user exists
                user.githubId = profile.id;
                await user.save();
            }
        }

        // Step 4: Assign role
        const role = profile.email === "crypto2doe@gmail.com" ? "admin" : "user";

        // Step 5: Sign JWT
        jwt.sign({ id: user._id, email: user.email, role }, JWT_SECRET, {
            expiresIn: "7d",
        });

        createAndSendToken(user, 200, res);
    } catch (err: any) {
        console.error("GitHub OAuth Error:", err);
        next(new AppError("GitHub login failed", 401));
    }
});


export const authController = {
    signup,
    login,
    logout,
    protect,
    restrictTo,
    forgotPassword,
    resetPassword,
    updatePassword,
};