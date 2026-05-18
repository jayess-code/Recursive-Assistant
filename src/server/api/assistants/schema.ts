import mongoose, {
  Schema,
  type Document,
  type Model,
  type Query,
} from "mongoose";
import validator from "validator";

export interface IAssistant extends Document {
  name: string;
  email: string;
  image?: string;
  role: "assistant";
  active: boolean;
  googleId?: string;
  githubId?: string;

  // Optional wallet fields for assistants that execute on-chain actions
  walletAddress?: string;
  encryptedPrivateKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

const assistantSchema = new Schema<IAssistant>(
  {
    name: {
      type: String,
      required: [true, "Please state assistant name"],
      unique: true,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [60, "Name must be at most 60 characters"],
    },
    email: {
      type: String,
      required: [true, "Please provide assistant email"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Please provide a valid email address"],
    },
    image: {
      type: String,
      trim: true,
      validate: {
        validator: (v: string) => !v || validator.isURL(v),
        message: "Please provide a valid image URL",
      },
    },
    role: {
      type: String,
      enum: ["assistant"],
      default: "assistant",
      immutable: true,
    },
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    googleId: {
      type: String,
      index: true,
      sparse: true,
    },
    githubId: {
      type: String,
      index: true,
      sparse: true,
    },

    // Store encrypted value only, never raw private key
    walletAddress: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    encryptedPrivateKey: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hide inactive assistants by default
assistantSchema.pre<Query<IAssistant[], IAssistant>>(/^find/, function () {
  this.find({ active: { $ne: false } });
});

export const AssistantModel: Model<IAssistant> =
  (mongoose.models.Assistant as Model<IAssistant>) ||
  mongoose.model<IAssistant>("Assistant", assistantSchema);