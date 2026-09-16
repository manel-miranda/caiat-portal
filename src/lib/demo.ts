/** Build-time UI flag. Authorization is enforced independently by the server/database. */
export const isPublicDemo = import.meta.env["VITE_DEMO_MODE"] === "true";
export const DEMO_PROJECT_REF = "llyihdkuplsyduxirvcg";
export const DEMO_SUPABASE_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;

export const DEMO_ROLES = ["staff", "supervisor", "admin"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_IDENTITIES: Record<
  DemoRole,
  { id: string; email: string; name: string }
> = {
  staff: {
    id: "6ffc1230-ee90-473d-b2fb-9c36736d37f2",
    email: "public-demo-staff@caiat.invalid",
    name: "Demo staff",
  },
  supervisor: {
    id: "df101cea-e2ed-4a3a-956b-b817038bb648",
    email: "public-demo@caiat.invalid",
    name: "Demo supervisor",
  },
  admin: {
    id: "55672d38-529a-49c8-88a6-f604ad6096ca",
    email: "public-demo-admin@caiat.invalid",
    name: "Demo admin",
  },
};

export const DEMO_EMAIL = DEMO_IDENTITIES.supervisor.email;
export const DEMO_USER_ID = DEMO_IDENTITIES.supervisor.id;

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === "string" && DEMO_ROLES.includes(value as DemoRole);
}
