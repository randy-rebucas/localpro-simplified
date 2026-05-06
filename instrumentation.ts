export async function register(): Promise<void> {
  const missing: string[] = [];
  if (!process.env.MONGODB_URI?.trim()) missing.push("MONGODB_URI");
  if (!process.env.ADMIN_PASSWORD?.trim()) missing.push("ADMIN_PASSWORD");
  if (!process.env.AUTH_SECRET?.trim()) missing.push("AUTH_SECRET");

  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables: ${missing.join(", ")}. Set them in your .env.local file.`;
    throw new Error(errorMsg);
  }

  // Validate password strength (both dev and production)
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() ?? "";
  const isWeakPassword = adminPassword === "admin123" || adminPassword.length < 12;
  const isProduction = process.env.NODE_ENV === "production";

  if (isWeakPassword && isProduction) {
    throw new Error(
      "ADMIN_PASSWORD must be at least 12 characters and cannot be 'admin123'. Use a strong random string in production.",
    );
  }

  if (isWeakPassword && !isProduction) {
    console.warn(
      "⚠️  WARNING: ADMIN_PASSWORD is weak. In production, it must be at least 12 characters and cannot be 'admin123'.",
    );
  }

  // Validate AUTH_SECRET strength in production
  const authSecret = process.env.AUTH_SECRET?.trim() ?? "";
  if (authSecret.length < 16 && isProduction) {
    throw new Error(
      "AUTH_SECRET must be at least 16 characters (use a cryptographically random string).",
    );
  }
}
