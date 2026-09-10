import { createFileRoute } from "@tanstack/react-router";

const ACCOUNTS = [
  { username: "bernardo", full_name: "Bernardo", phone: "+212600000001", pin: "246810", role: "admin" },
  { username: "youssef", full_name: "Youssef El Amrani", phone: "+212600000002", pin: "135790", role: "staff" },
  { username: "fatima", full_name: "Fatima Zahra", phone: "+212600000003", pin: "112358", role: "staff" },
];

export const Route = createFileRoute("/api/public/seed-users")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const out: Record<string, string> = {};
        for (const a of ACCOUNTS) {
          const email = `${a.username}@caiat.local`;
          const { data: existing } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", a.username)
            .maybeSingle();
          let id = existing?.id as string | undefined;
          if (!id) {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: a.pin,
              email_confirm: true,
              user_metadata: { username: a.username, full_name: a.full_name },
            });
            if (error || !data.user) {
              return new Response(JSON.stringify({ error: error?.message }), { status: 500 });
            }
            id = data.user.id;
            await supabaseAdmin.from("profiles").insert({
              id,
              username: a.username,
              full_name: a.full_name,
              phone: a.phone,
            });
            await supabaseAdmin.from("user_roles").insert({ user_id: id, role: a.role });
          }
          out[a.username] = id!;
        }
        return new Response(JSON.stringify(out), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
