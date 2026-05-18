import crypto from "crypto";
import mongoose, {
    Document,
    Model,
    Query,
    HydratedDocument,
} from "mongoose";
import validator from "validator";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
    name: string;
    email: string;
    image: string;
    role: "user" | "creator" | "admin" | "guide";
    password?: string | undefined;
    confirmpassword?: string | undefined;
    passwordResetToken?: string | undefined;
    passwordResetExpires?: Date | undefined;
    passwordChangedAt?: Date | undefined;
    active: boolean;
    googleId?: string;
    githubId?: string;
}

export interface IUserMethods {
    correctPassword(candidatePassword: string, userPassword: string): Promise<boolean>;
    changedPasswordAfter(JWTTimestamp: number): boolean;
    createPasswordResetToken(): string;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const userSchema = new mongoose.Schema<IUser, Model<IUser, {}, IUserMethods>>({
    name: {
        type: String,
        required: [true, "Please State Your Name"],
        unique: true,
        lowercase: true,
    },
    email: {
        type: String,
        required: [true, "Please Provide Your Email Address"],
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, "Please Provide A VALID EMAIL Address!"],
    },
    image: {
        type: String,
        validate: [validator.isURL, "Please Provide A VALID IMAGE URL!"],
    },
    role: {
        type: String,
        enum: ["user", "creator", "admin", "guide"],
        default: "user",
    },
    password: {
        type: String,
        required: [true, "Please Provide A Password"],
        minlength: 7,
        message: "Password must be at least 7 characters",
        select: false,
    },
    confirmpassword: {
        type: String,
        required: [true, "Please Confirm Your PASSWORD"],
        validate: {
            validator: function (this: UserDocument, el: string): boolean {
                return el === this.password;
            },
            message: "Passwords Do NOT Match!!!",
        },
    },
    googleId: String,
    githubId: String,
    // passwordChangedAt: Date,
    passwordChangedAt: { type: Date, select: false },
    passwordResetToken: String,
    passwordResetExpires: Date,
    active: {
        type: Boolean,
        default: true,
        select: false,
    },
});

// ----- MIDDLEWARE -----
userSchema.pre("save", function () {
    if (!this.isModified("password") || this.isNew) return;
    this.passwordChangedAt = new Date(Date.now() - 1000);
});


userSchema.pre<Query<UserDocument[], UserDocument>>(/^find/, function () {
    this.find({ active: { $ne: false } });
});

userSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) return;

    this.password = await bcrypt.hash(this.password, 14);
    this.confirmpassword = undefined;
});


// ----- METHODS -----
userSchema.methods.correctPassword = async function (
    candidatePassword: string,
    userPassword: string
): Promise<boolean> {
    return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (
    JWTTimestamp: number
): boolean {
    if (this.passwordChangedAt) {
        const changedTimeStamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
        return JWTTimestamp < changedTimeStamp;
    }
    return false;
};

userSchema.methods.createPasswordResetToken = function (): string {
    const resetToken = crypto.randomBytes(32).toString("hex");

    this.passwordResetToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

    return resetToken;
};

export const UserModel =
    (mongoose.models.User as Model<IUser, {}, IUserMethods>) ||
    mongoose.model<IUser, Model<IUser, {}, IUserMethods>>("User", userSchema);