/** Build-time UI flag. Authorization is enforced independently by the server/database. */
export const isPublicDemo = import.meta.env["VITE_DEMO_MODE"] === "true";
export const DEMO_PROJECT_REF = "llyihdkuplsyduxirvcg";
export const DEMO_SUPABASE_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;
export const DEMO_EMAIL = "public-demo@caiat.invalid";
export const DEMO_USER_ID = "df101cea-e2ed-4a3a-956b-b817038bb648";
