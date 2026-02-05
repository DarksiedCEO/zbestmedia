import { PrismaClient } from "../generated/prisma/index.js";

const isTest = process.env.NODE_ENV === "test" || process.env.BRANDGRAPH_DB === "test";

if (isTest) {
  process.env.DATABASE_URL = "file:./prisma/test.db";
}

export const prisma = new PrismaClient({ log: ["error", "warn"] });
