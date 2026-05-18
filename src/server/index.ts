import { connectToDatabase } from "./api/utils/connectMongodb";
import app from "./app";
import "dotenv/config";

// Gracefully handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
    console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
    console.error(error);
    process.exit(1);
});

// Validate env variables
const validateEnvironmentVariables = (): void => {
    const required = ["MONGO_URI", "PORT"];
    required.forEach((key) => {
        if (!process.env[key]) {
            console.error(`Missing env variable: ${key}`);
            process.exit(1);
        }
    });
};
// console.log("NGROK_AUTHTOKEN:", process.env.NGROK_AUTHTOKEN);
console.log(`Environment: ${app.get("env")}`);
validateEnvironmentVariables();

const port =  process.env.PORT || 8080;



const startServer = async () => {
    await connectToDatabase();

    app.listen(port, () => {
        console.log(`✅ Server running on port http://localhost:${port}...`);
        
    });
};

startServer();

// Handle unhandled rejections
process.on("unhandledRejection", (error: Error) => {
    console.error("UNHANDLED REJECTION! 💥");
    console.error(error);
    process.exit(1);
});