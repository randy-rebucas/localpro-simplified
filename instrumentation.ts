export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.MONGODB_URI?.trim()) missing.push("MONGODB_URI");
  if (!process.env.ADMIN_PASSWORD?.trim()) missing.push("ADMIN_PASSWORD");
  if (!process.env.AUTH_SECRET?.trim()) missing.push("AUTH_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Production requires: ${missing.join(", ")}. Set them in your host environment (see .env.example).`,
    );
  }
}
