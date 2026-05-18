import mongoose from "mongoose";

const connectToDatabase = async () => {
  const DB = process.env.MONGO_URI;

  if (!DB) {
    throw new Error(
      "Database connection string is not defined in the environment variables."
    );
  }

  await mongoose
    .connect(DB)
    // .then(() => console.log("DB connection successful"))
    .catch((err) => console.error("DB connection failed:", err));
};

export { connectToDatabase };