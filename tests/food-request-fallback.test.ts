/// <reference types="vite/client" />
/** Exercise the stay page's actual picker and submit callback against local PostgreSQL. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import ts from "typescript";
import { readFileSync } from "node:fs";
import {
  foodOrderErrorMessage,
  isKitchenMenuDish,
  isOrderableKitchenDish,
  type MenuDishLike,
} from "../src/lib/preview-orders";
import { setLang, t } from "../src/lib/i18n";
import {
  actAs,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";

type Service = MenuDishLike & { id: string; label: string; requestable: boolean };
type Values = {
  serviceTypeId: string | null;
  label: string;
  quantity: number;
  timing: string;
  scheduledAt: string | null;
  notes: string;
};
type FoodInput = {
  stayId: string;
  items: { service_type_id: string; quantity: number }[];
  notes: string;
  timing: string;
};
type RequestInput = {
  stayId: string;
  roomId: string;
  serviceTypeId: string | null;
  label: string;
  scheduledAt: string | null;
  notes: string;
  userId: string;
};

// Extract the production expressions, so reverting the route's filter or branch
// fails these tests even if the standalone classification helpers stay correct.
const source = readFileSync(
  new URL("../src/routes/_authenticated/stays.$id.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "stay.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const expressions: Record<string, string> = {};
function visit(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "RequestForm") {
    for (const attr of node.attributes.properties) {
      if (
        ts.isJsxAttribute(attr) &&
        attr.initializer &&
        ts.isJsxExpression(attr.initializer) &&
        attr.initializer.expression
      ) {
        expressions[attr.name.getText(ast)] = attr.initializer.expression.getText(ast);
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function expression(name: string) {
  const value = expressions[name];
  if (!value) throw new Error(`Missing RequestForm ${name}`);
  return ts.transpileModule(`return (${value});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const picker = new Function(
  "services",
  "isMenuDish",
  "isOrderableKitchenDish",
  expression("services"),
) as (
  services: Service[],
  identity: typeof isKitchenMenuDish,
  eligible: typeof isOrderableKitchenDish,
) => Service[];
const submitFactory = new Function(
  "services",
  "isMenuDish",
  "staffCreateFoodOrder",
  "addRequest",
  "id",
  "stay",
  "user",
  "online",
  "toast",
  "t",
  "refresh",
  "setSheet",
  expression("onSubmit"),
);
const menu: Service = {
  id: "menu",
  label: "Dish",
  guest_category: "food",
  guest_subcategory: "mains",
  active: true,
  requestable: true,
  preview_only: false,
  guest_visible: true,
  available_today: true,
};
const flags = [
  "available_today",
  "guest_visible",
  "active",
  "requestable",
  "preview_only",
] as const;
function ineligible(flag: (typeof flags)[number], service = menu): Service {
  return { ...service, [flag]: flag === "preview_only" };
}
function visible(services: Service[]) {
  return picker(services, isKitchenMenuDish, isOrderableKitchenDish);
}
function values(service: Service | null): Values {
  return {
    serviceTypeId: service?.id ?? null,
    label: service?.label ?? "Custom service",
    quantity: 2,
    timing: "asap",
    scheduledAt: null,
    notes: "",
  };
}
function submit(
  services: Service[],
  food: (v: FoodInput) => Promise<unknown>,
  ordinary: (v: RequestInput) => Promise<unknown>,
  stayId = "stay",
  roomId = "room",
  staffId = "staff",
) {
  const errors: string[] = [];
  const handler = submitFactory(
    services,
    isKitchenMenuDish,
    food,
    ordinary,
    stayId,
    { room_id: roomId },
    { id: staffId },
    true,
    { error: (message: string) => errors.push(message), success: () => {} },
    t,
    async () => {},
    () => {},
  ) as (v: Values) => Promise<void>;
  return { handler, errors };
}

describe("staff restaurant classification and routing", () => {
  for (const flag of flags) {
    test(`${flag} cannot turn a restaurant dish into an ordinary request`, async () => {
      const dish = ineligible(flag);
      expect(isKitchenMenuDish(dish)).toBe(true);
      expect(isOrderableKitchenDish(dish)).toBe(false);
      expect(visible([dish]).length).toBe(0);
      const calls: string[] = [];
      const route = submit(
        [dish],
        async () => {
          calls.push("kitchen");
          throw new Error(foodOrderErrorMessage("INVALID_ITEM"));
        },
        async () => {
          calls.push("ordinary");
        },
      );
      await route.handler(values(dish));
      expect(calls).toEqual(["kitchen"]);
      expect(route.errors).toEqual([t("foodOrderInvalidItem")]);
    });
  }

  test("a selected service removed by catalogue refresh cannot become custom", async () => {
    const calls: string[] = [];
    const route = submit(
      [],
      async () => {
        calls.push("kitchen");
      },
      async () => {
        calls.push("ordinary");
      },
    );
    await route.handler(values(menu));
    expect(calls).toEqual([]);
    expect(route.errors).toEqual([t("foodOrderInvalidItem")]);
  });

  for (const category of ["breakfast", "meals", "room_service", "cleaning"]) {
    test(`${category} stays an ordinary request`, async () => {
      const service = {
        ...menu,
        guest_subcategory: category,
        guest_visible: false,
        available_today: false,
      };
      expect(isKitchenMenuDish(service)).toBe(false);
      expect(visible([service])).toEqual([service]);
      const calls: string[] = [];
      const route = submit(
        [service],
        async () => {
          calls.push("kitchen");
        },
        async () => {
          calls.push("ordinary");
        },
      );
      await route.handler(values(service));
      expect(calls).toEqual(["ordinary"]);
    });
  }

  test("custom requests keep the ordinary workflow", async () => {
    const calls: string[] = [];
    const route = submit(
      [],
      async () => {
        calls.push("kitchen");
      },
      async () => {
        calls.push("ordinary");
      },
    );
    await route.handler(values(null));
    expect(calls).toEqual(["ordinary"]);
  });

  test("all restaurant categories retain identity regardless of availability", () => {
    for (const category of ["signature", "mains", "drinks", "desserts"]) {
      expect(
        isKitchenMenuDish({ ...menu, guest_subcategory: category, available_today: false }),
      ).toBe(true);
    }
    expect(isKitchenMenuDish({ ...menu, guest_category: "services" })).toBe(false);
    expect(visible([menu])).toEqual([menu]);
  });
});

const suite = databaseAvailable() ? describe : describe.skip;
suite("staff request routing with authoritative catalogue eligibility", () => {
  let db: TestDatabase;
  let sql: SQL;
  let staff: SQL;
  let staffId: string;
  let roomId: string;
  let dish: Service;
  let ingredientId: string;
  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    staffId = await createStaffUser(sql, "fallback_regression");
    staff = db.connect();
    await actAs(staff, staffId);
    await staff.unsafe("SET ROLE authenticated");
    const [room] = await sql`SELECT id FROM public.rooms LIMIT 1`;
    roomId = String((room as { id: string }).id);
    const [row] = await sql`
      INSERT INTO public.service_types(key,label,default_price,billable,requestable,active,guest_visible,guest_category,guest_subcategory,preview_only,available_today)
      VALUES ('fallback_regression','Regression dish',25,true,true,true,true,'food','mains',false,true) RETURNING *
    `;
    dish = row as Service;
    const [ingredient] =
      await sql`INSERT INTO public.inventory_items(key,label,unit,active,preview_only) VALUES ('fallback_regression','Regression ingredient','kg',true,false) RETURNING id`;
    ingredientId = String((ingredient as { id: string }).id);
    await sql`INSERT INTO public.inventory_recipe_components(service_type_id,inventory_item_id,qty_per_portion) VALUES (${dish.id},${ingredientId},0.25)`;
  });
  afterAll(async () => {
    setLang("en");
    await db?.drop();
  });

  async function stay() {
    const [guest] =
      await sql`INSERT INTO public.guests(full_name) VALUES ('Fallback regression') RETURNING id`;
    const [row] = await sql`
      INSERT INTO public.stays(guest_id,room_id,check_in,check_out,num_guests,source,accommodation_total,status,confirmation_status)
      VALUES (${(guest as { id: string }).id},${roomId},CURRENT_DATE,CURRENT_DATE+1,1,'walk_in',0,'active','confirmed') RETURNING id
    `;
    return String((row as { id: string }).id);
  }
  function databaseRoute(services: Service[], stayId: string) {
    return submit(
      services,
      async (v) => {
        try {
          return await staff`SELECT public.staff_create_food_order(${v.stayId},jsonb_build_array(jsonb_build_object('service_type_id',${v.items[0]!.service_type_id}::uuid,'quantity',${v.items[0]!.quantity}::int)),${v.notes},${v.timing})`;
        } catch (error) {
          throw new Error(foodOrderErrorMessage((error as Error).message));
        }
      },
      async (v) => staff`
      INSERT INTO public.requests(stay_id,room_id,service_type_id,label,scheduled_at,notes,status,created_by)
      VALUES (${v.stayId},${v.roomId},${v.serviceTypeId},${v.label},${v.scheduledAt},${v.notes},'pending',${v.userId})
    `,
      stayId,
      roomId,
      staffId,
    );
  }
  async function effects(stayId: string) {
    const [row] = await sql`
      SELECT (SELECT count(*)::int FROM public.requests WHERE stay_id=${stayId}) AS requests,
             (SELECT count(*)::int FROM public.preview_food_orders WHERE stay_id=${stayId}) AS orders,
             (SELECT count(*)::int FROM public.charges WHERE stay_id=${stayId}) AS charges,
             (SELECT count(*)::int FROM public.inventory_movements m JOIN public.preview_food_orders o ON o.id=m.source_id WHERE o.stay_id=${stayId}) AS movements
    `;
    return row;
  }

  for (const flag of flags) {
    test(`RPC rejects stale ${flag} without ordinary fallback or partial writes`, async () => {
      const stayId = await stay();
      // The page loaded this eligible snapshot before the catalogue changed.
      expect(isOrderableKitchenDish(dish)).toBe(true);
      await sql.unsafe(
        `UPDATE public.service_types SET ${flag} = ${flag === "preview_only"} WHERE key = 'fallback_regression'`,
      );
      try {
        for (const lang of ["en", "pt", "fr", "ar"] as const) {
          setLang(lang);
          const route = databaseRoute([dish], stayId);
          await route.handler(values(dish));
          expect(route.errors).toEqual([t("foodOrderInvalidItem")]);
          expect(route.errors[0] === "INVALID_ITEM").toBe(false);
          expect(await effects(stayId)).toEqual({
            requests: 0,
            orders: 0,
            charges: 0,
            movements: 0,
          });
        }
      } finally {
        setLang("en");
        await sql.unsafe(
          `UPDATE public.service_types SET ${flag} = ${flag !== "preview_only"} WHERE key = 'fallback_regression'`,
        );
      }
    });
  }

  test("eligible dish follows kitchen statuses and bills and consumes on delivery", async () => {
    const stayId = await stay();
    const route = databaseRoute([dish], stayId);
    await route.handler(values(dish));
    expect(route.errors).toEqual([]);
    const [row] =
      await sql`SELECT id,subtotal::float8 AS subtotal,status FROM public.preview_food_orders WHERE stay_id=${stayId}`;
    const order = row as { id: string; subtotal: number; status: string };
    expect(order.subtotal).toBe(50);
    expect(order.status).toBe("requested");
    for (const status of ["accepted", "preparing"]) {
      await staff`SELECT public.preview_food_order_set_status(${order.id},${status})`;
      const [state] = await sql`SELECT status FROM public.preview_food_orders WHERE id=${order.id}`;
      expect(state).toEqual({ status });
      expect(await effects(stayId)).toEqual({ requests: 0, orders: 1, charges: 0, movements: 0 });
    }
    await staff`SELECT public.preview_food_order_set_status(${order.id},'delivered')`;
    const charges =
      await sql`SELECT quantity::float8 AS quantity,unit_price::float8 AS unit_price,total::float8 AS total FROM public.charges WHERE source_food_order_id=${order.id}`;
    expect([...charges]).toEqual([{ quantity: 2, unit_price: 25, total: 50 }]);
    const moves =
      await sql`SELECT inventory_item_id,quantity::float8 AS quantity FROM public.inventory_movements WHERE source_id=${order.id}`;
    expect([...moves]).toEqual([{ inventory_item_id: ingredientId, quantity: -0.5 }]);
    await staff`SELECT public.preview_food_order_set_status(${order.id},'delivered')`;
    expect(await effects(stayId)).toEqual({ requests: 0, orders: 1, charges: 1, movements: 1 });
  });

  test("genuine ordinary services still create and complete ordinary requests", async () => {
    for (const category of ["breakfast", "meals", "room_service", "cleaning"]) {
      const [row] = await sql`
        INSERT INTO public.service_types(key,label,requestable,active,guest_category,guest_subcategory)
        VALUES (${`fallback_${category}`},${category},true,true,${category === "cleaning" ? "services" : "food"},${category}) RETURNING *
      `;
      const service = row as Service;
      const stayId = await stay();
      const route = databaseRoute([service], stayId);
      await route.handler(values(service));
      expect(route.errors).toEqual([]);
      const [request] = await sql`SELECT id FROM public.requests WHERE stay_id=${stayId}`;
      await staff`SELECT public.complete_request(${(request as { id: string }).id},false)`;
      const [state] = await sql`SELECT status FROM public.requests WHERE stay_id=${stayId}`;
      expect(state).toEqual({ status: "completed" });
      expect(await effects(stayId)).toEqual({ requests: 1, orders: 0, charges: 0, movements: 0 });
    }
  });
});
