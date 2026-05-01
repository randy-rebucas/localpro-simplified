import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI && process.env.NODE_ENV !== "test") {
  console.warn("MONGODB_URI is not set. API routes will fail until it is configured.");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalWithMongoose = globalThis as typeof globalThis & {
  __mongoose?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose.__mongoose ?? {
  conn: null,
  promise: null,
};

if (!globalWithMongoose.__mongoose) {
  globalWithMongoose.__mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable");
  }
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
