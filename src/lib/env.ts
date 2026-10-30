/** Public demo build: sample data only, never calls real services. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Changes with every deployment; used to offer a reload when a new version ships. */
export const APP_VERSION =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local";
