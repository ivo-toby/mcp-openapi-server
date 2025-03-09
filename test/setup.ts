import { beforeAll, expect } from "vitest";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Make sure we have the required environment variables
beforeAll(() => {
  const requiredEnvVars = [""];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
});

export { expect };
