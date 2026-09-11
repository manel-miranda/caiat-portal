import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/admin-guard";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import {
  OPERATIONAL_PERMISSIONS,
  PERMISSION_LABEL_KEYS,
  effectivePermission,
  roleDefault,
  type AppRole,
  type OperationalPermission,
} from "@/lib/permissions";
import {
  changeMyPin,
  generatePin,
  isValidPin,
  managedUsersQuery,
  setUserPermission,
  setUserRole,
  type ManagedUser,
} from "@/lib/users";
import { createStaffUser, resetUserPin, setUserActiveFn } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  beforeLoad: requireAdmin,
  head: () => ({
    meta: [
      { title: "Users & permissions — Caiat Operations" },
      { name: "description", content: "Manage Caiat team roles, permissions and PINs." },
    ],
  }),
  component: UsersPage,
});

const ROLES: AppRole[] = ["staff", "supervisor", "admin"];

function roleName(role: AppRole) {
  if (role === "admin") return t("roleAdmin");
  if (role === "supervisor") return t("roleSupervisor");
  return t("roleStaff");
}

function UsersPage() {
  const users = useQuery(managedUsersQuery);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [shownPin, setShownPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>, okMessage: string) {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries();
      toast.success(okMessage);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("usersTitle")}>
      {users.isLoading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
      {users.error ? (
        <p className="text-sm text-destructive">{(users.error as Error).message}</p>
      ) : null}

      <ul className="space-y-3">
        {(users.data ?? []).map((u) => {
          const open = openId === u.id;
          return (
            <li key={u.id} className="surface-card p-4">
              <button
                className="flex w-full items-center justify-between gap-3 text-start"
                onClick={() => {
                  setOpenId(open ? null : u.id);
                  setPin("");
                  setShownPin(null);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{u.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{u.username} · {roleName(u.role)}
                  </span>
                </span>
                <span
                  className={
                    u.active
                      ? "shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                      : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                  }
                >
                  {u.active ? t("activeUser") : t("inactiveUser")}
                </span>
              </button>

              {open ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("role")}</Label>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {ROLES.map((r) => (
                        <Button
                          key={r}
                          size="sm"
                          variant={u.role === r ? "default" : "outline"}
                          disabled={busy || u.role === r}
                          onClick={() => void run(() => setUserRole(u.id, r), t("roleChanged"))}
                        >
                          {roleName(r)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">{t("permissions")}</Label>
                    <ul className="mt-1.5 space-y-1.5">
                      {OPERATIONAL_PERMISSIONS.map((key) => (
                        <PermissionRow
                          key={key}
                          user={u}
                          permission={key}
                          busy={busy}
                          onChange={(granted) =>
                            void run(
                              () => setUserPermission(u.id, key, granted),
                              t("permissionChanged"),
                            )
                          }
                        />
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("resetPin")}</Label>
                    <div className="flex gap-2">
                      <Input
                        className="tap-target text-base"
                        inputMode="numeric"
                        maxLength={6}
                        value={pin}
                        placeholder={t("pinRule")}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                      <Button
                        variant="outline"
                        className="tap-target shrink-0"
                        onClick={() => setPin(generatePin())}
                      >
                        {t("generatePin")}
                      </Button>
                    </div>
                    <Button
                      className="tap-target w-full"
                      disabled={busy || !isValidPin(pin)}
                      onClick={() =>
                        void run(async () => {
                          await resetUserPin({ data: { userId: u.id, pin } });
                          setShownPin(pin);
                          setPin("");
                        }, t("pinReset"))
                      }
                    >
                      {t("resetPin")}
                    </Button>
                    {shownPin ? (
                      <p className="rounded-xl bg-muted p-3 text-sm">
                        <span className="font-mono text-lg font-semibold tracking-widest">
                          {shownPin}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t("pinShownOnce")}
                        </span>
                      </p>
                    ) : null}
                  </div>

                  {u.id !== user?.id ? (
                    <Button
                      variant="outline"
                      className="tap-target w-full"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await setUserActiveFn({ data: { userId: u.id, active: !u.active } });
                        }, t("userUpdated"))
                      }
                    >
                      {u.active ? t("deactivate") : t("activate")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <AddUserCard busy={busy} run={run} />
      <ChangeMyPinCard busy={busy} run={run} />
    </AppShell>
  );
}

/** Admin-only: creates the sign-in account, profile and role in one step. */
function AddUserCard({
  busy,
  run,
}: {
  busy: boolean;
  run: (fn: () => Promise<void>, ok: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<AppRole>("staff");

  return (
    <section className="surface-card mt-4 p-4">
      <button className="w-full text-start font-semibold" onClick={() => setOpen(!open)}>
        {t("addUser")}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("displayName")}</Label>
            <Input
              className="tap-target text-base"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("username")}</Label>
            <Input
              className="tap-target text-base"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
              }
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("newPin")}</Label>
            <div className="flex gap-2">
              <Input
                className="tap-target text-base"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                placeholder={t("pinRule")}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <Button
                variant="outline"
                className="tap-target shrink-0"
                onClick={() => setPin(generatePin())}
              >
                {t("generatePin")}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={role === r ? "default" : "outline"}
                onClick={() => setRole(r)}
              >
                {roleName(r)}
              </Button>
            ))}
          </div>
          <Button
            className="tap-target w-full"
            disabled={busy || !isValidPin(pin) || fullName.trim().length < 2 || username.length < 2}
            onClick={() =>
              void run(async () => {
                await createStaffUser({ data: { username, fullName: fullName.trim(), pin, role } });
                setFullName("");
                setUsername("");
                setPin("");
              }, t("userCreated"))
            }
          >
            {t("addUser")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Self-service PIN change; the PIN itself is only ever sent to Auth. */
function ChangeMyPinCard({
  busy,
  run,
}: {
  busy: boolean;
  run: (fn: () => Promise<void>, ok: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <section className="surface-card mt-4 space-y-3 p-4">
      <p className="font-semibold">{t("changeMyPin")}</p>
      <Input
        className="tap-target text-base"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        placeholder={t("newPin")}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <Input
        className="tap-target text-base"
        inputMode="numeric"
        maxLength={6}
        value={confirm}
        placeholder={t("confirmPin")}
        onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <Button
        className="tap-target w-full"
        disabled={busy || !isValidPin(pin)}
        onClick={() =>
          void run(async () => {
            if (pin !== confirm) throw new Error(t("pinMismatch"));
            await changeMyPin(pin);
            setPin("");
            setConfirm("");
          }, t("pinReset"))
        }
      >
        {t("changeMyPin")}
      </Button>
    </section>
  );
}

function PermissionRow({
  user,
  permission,
  busy,
  onChange,
}: {
  user: ManagedUser;
  permission: OperationalPermission;
  busy: boolean;
  onChange: (granted: boolean | null) => void;
}) {
  const isDefault = typeof user.overrides[permission] !== "boolean";
  const effective = effectivePermission(user.role, user.overrides, permission, user.active);
  const disabled = busy || user.role === "admin";
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="block truncate">{t(PERMISSION_LABEL_KEYS[permission])}</span>
        <span className="block text-[11px] text-muted-foreground">
          {isDefault
            ? `${t("roleDefault")} · ${roleDefault(user.role, permission) ? t("allowed") : t("notAllowed")}`
            : effective
              ? t("allowed")
              : t("notAllowed")}
        </span>
      </span>
      <span className="flex flex-wrap gap-1 sm:shrink-0">
        <Button
          size="sm"
          variant={!isDefault && effective ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(true)}
        >
          {t("allowed")}
        </Button>
        <Button
          size="sm"
          variant={!isDefault && !effective ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(false)}
        >
          {t("notAllowed")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || isDefault}
          onClick={() => onChange(null)}
        >
          {t("roleDefault")}
        </Button>
      </span>
    </li>
  );
}
