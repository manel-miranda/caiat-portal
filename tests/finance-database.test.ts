import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  actAs,
  createStaffUser,
  createTestDatabase,
  databaseAvailable,
  type TestDatabase,
} from "./support/preview-db";
import type { FinanceReport } from "../src/lib/finance";

const suite = databaseAvailable() ? describe : describe.skip;

suite("finance database boundaries and calculations", () => {
  let db: TestDatabase;
  let sql: SQL;
  let manager: SQL;
  let staff: SQL;
  let anon: SQL;
  let managerId: string;
  const dishes: Record<"high" | "low" | "missing" | "zero" | "tie" | "preview", string> = {
    high: "",
    low: "",
    missing: "",
    zero: "",
    tie: "",
    preview: "",
  };
  let ingredient: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    managerId = await createStaffUser(sql, "finance_manager");
    await sql`UPDATE public.user_roles SET role = 'supervisor' WHERE user_id = ${managerId}`;
    const staffId = await createStaffUser(sql, "finance_staff");
    manager = db.connect();
    await actAs(manager, managerId);
    await manager.unsafe("SET ROLE authenticated");
    staff = db.connect();
    await actAs(staff, staffId);
    await staff.unsafe("SET ROLE authenticated");
    anon = db.connect();
    await anon.unsafe("SET ROLE anon");

    const [item] =
      await sql`INSERT INTO public.inventory_items (key,label,unit) VALUES ('finance_test','Finance test','kg') RETURNING id`;
    ingredient = String((item as { id: string }).id);
    // Legacy ingredients can retain preview flags even when real recipes use them.
    await sql`UPDATE public.inventory_items SET preview_only = true WHERE id = ${ingredient}`;
    const [unknown] =
      await sql`INSERT INTO public.inventory_items (key,label,unit) VALUES ('finance_unknown','Unknown','kg') RETURNING id`;
    for (const [name, price, quantity] of [
      ["high", 100, 1],
      ["low", 100, 4],
      ["missing", 100, 1],
      ["zero", 0, 1],
      ["tie", 100, 1],
      ["preview", 100, 1],
    ] as const) {
      const [dish] =
        await sql`INSERT INTO public.service_types (key,label,default_price,billable,active,requestable,guest_visible,preview_only,guest_category,guest_subcategory)
        VALUES (${`finance_${name}`},${name},${price},true,true,true,true,${name === "preview"},'food','mains') RETURNING id`;
      dishes[name] = String((dish as { id: string }).id);
      if (name === "preview") {
        await sql`UPDATE public.service_types SET billable = false WHERE id = ${(dish as { id: string }).id}`;
      }
      await sql`INSERT INTO public.inventory_recipe_components (service_type_id,inventory_item_id,qty_per_portion)
        VALUES (${(dish as { id: string }).id},${name === "missing" ? (unknown as { id: string }).id : ingredient},${quantity})`;
    }
    await sql`INSERT INTO public.service_types (key,label,default_price,billable,active,guest_category)
      VALUES ('finance_no_recipe','Unconfigured recipe',100,true,true,'food')`;
    for (const [date, cost] of [
      ["2020-01-01", 5],
      ["2020-02-01", 20],
    ] as const) {
      const [purchase] =
        await sql`INSERT INTO public.purchases (purchased_at) VALUES (${date}::timestamptz) RETURNING id`;
      await sql`INSERT INTO public.purchase_lines (purchase_id,inventory_item_id,quantity,unit_cost) VALUES (${(purchase as { id: string }).id},${ingredient},1,${cost})`;
    }
    const [recentPurchase] =
      await sql`INSERT INTO public.purchases (purchased_at,total_cost,line_count) VALUES (now(),40,1) RETURNING id`;
    await sql`INSERT INTO public.purchase_lines (purchase_id,inventory_item_id,quantity,unit_cost,line_total)
      VALUES (${(recentPurchase as { id: string }).id},${ingredient},2,20,40)`;
    await sql`INSERT INTO public.inventory_movements (inventory_item_id,movement_type,quantity,unit_cost,source_type,source_id,notes)
      VALUES (${ingredient},'receipt',3,20,'purchase',${(recentPurchase as { id: string }).id},'Finance summary stock')`;
    for (const [position, name] of (["low", "missing", "high"] as const).entries()) {
      await sql`INSERT INTO public.service_recommendations (service_type_id,recommended_service_type_id,position) VALUES (${dishes.preview},${dishes[name]},${position})`;
    }
    for (const [position, name] of (["zero", "tie", "high"] as const).entries()) {
      await sql`INSERT INTO public.service_recommendations (service_type_id,recommended_service_type_id,position) VALUES (${dishes.missing},${dishes[name]},${position})`;
    }
  });

  afterAll(async () => {
    await db?.drop();
  });

  test("uses latest purchase costs, preserves unknowns and zero-price semantics, excludes preview recipes", async () => {
    const [row] = await manager`SELECT public.finance_profitability() AS report`;
    const report = (row as { report: FinanceReport }).report as FinanceReport;
    expect(report.dishes.find((d) => d.label === "Unconfigured recipe")).toMatchObject({
      cost: null,
      missingCost: true,
      marginPercent: null,
    });
    expect(report.dishes.find((d) => d.id === dishes.high)).toMatchObject({
      cost: 20,
      grossProfit: 80,
      marginPercent: 80,
      missingCost: false,
    });
    expect(report.dishes.find((d) => d.id === dishes.low)).toMatchObject({
      cost: 80,
      grossProfit: 20,
      marginPercent: 20,
    });
    expect(report.dishes.find((d) => d.id === dishes.missing)).toMatchObject({
      cost: null,
      grossProfit: null,
      marginPercent: null,
      missingCost: true,
    });
    expect(report.dishes.find((d) => d.id === dishes.zero)).toMatchObject({
      cost: 20,
      grossProfit: -20,
      marginPercent: null,
      missingCost: false,
    });
    expect(report.dishes.some((d) => d.id === dishes.preview)).toBe(false);
    expect(report.ingredients.find((i) => i.id === ingredient)?.unitCost).toBe(20);
    expect(report.summary).toMatchObject({
      currentStockValue: 60,
      recommendedBuyCost: 0,
      purchaseSpend30d: 40,
      purchaseSpendPrevious30d: 0,
      stockCoverageDays: 28,
      lowStockItems: 0,
    });
    const [previewReport] = await manager`SELECT public.finance_profitability(true) AS report`;
    expect(
      ((previewReport as { report: FinanceReport }).report as FinanceReport).dishes.some(
        (d) => d.id === dishes.preview,
      ),
    ).toBe(true);
  });

  test("denies ordinary staff and anon, and hides the ranking helper from API roles", async () => {
    await expect(Promise.resolve(staff`SELECT public.finance_profitability()`)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
    await expect(Promise.resolve(anon`SELECT public.finance_profitability()`)).rejects.toThrow(
      "permission denied",
    );
    await expect(
      Promise.resolve(
        manager`SELECT public.finance_ranked_recommendations(${dishes.preview}::uuid)`,
      ),
    ).rejects.toThrow("permission denied");
    const unauthenticated = db.connect();
    await unauthenticated.unsafe("SET ROLE authenticated");
    await expect(
      Promise.resolve(unauthenticated`SELECT public.finance_profitability()`),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  test("staff can access finance when explicitly granted activity_view", async () => {
    const id = await createStaffUser(sql, "finance_override");
    await sql`INSERT INTO public.user_permissions (user_id, permission, granted) VALUES (${id}, 'activity_view', true)`;
    const user = db.connect();
    await actAs(user, id);
    await user.unsafe("SET ROLE authenticated");
    const [result] = await user`SELECT public.finance_profitability() AS report`;
    expect((result as { report: FinanceReport }).report.dishes.length).toBeGreaterThan(0);
  });

  test("ranks margins descending, preserves curated ties, and leaves uncomputable margins last", async () => {
    const [row] =
      await sql`SELECT public.finance_ranked_recommendations(${dishes.preview}::uuid) AS ids`;
    expect((row as { ids: string[] }).ids).toEqual([dishes.high, dishes.low, dishes.missing]);
    const [ties] =
      await sql`SELECT public.finance_ranked_recommendations(${dishes.missing}::uuid) AS ids`;
    expect((ties as { ids: string[] }).ids).toEqual([dishes.tie, dishes.high, dishes.zero]);
  });

  test("guest portal returns ranked IDs without exposing costs and retains token validation", async () => {
    const [room] = await sql`SELECT id FROM public.rooms LIMIT 1`;
    const [guest] =
      await sql`INSERT INTO public.guests (full_name) VALUES ('Finance Guest') RETURNING id`;
    const [stay] =
      await sql`INSERT INTO public.stays (guest_id,room_id,check_in,check_out,num_guests,source,accommodation_total,status)
      VALUES (${(guest as { id: string }).id},${(room as { id: string }).id},CURRENT_DATE,CURRENT_DATE+1,1,'walk_in',100,'active') RETURNING id`;
    const [access] =
      await manager`SELECT public.guest_token_generate(${(stay as { id: string }).id}) AS token`;
    const [row] =
      await anon`SELECT public.guest_portal(${(access as { token: string }).token}) AS portal`;
    const portal = (
      row as {
        portal: {
          accommodation_total: number;
          services: { id: string; recommended_ids: string[] }[];
          demo_services: { id: string; recommended_ids: string[] }[];
        };
      }
    ).portal;
    expect(portal.accommodation_total).toBe(100);
    const preview = portal.demo_services.find((s: { id: string }) => s.id === dishes.preview);
    expect(preview?.recommended_ids).toEqual([dishes.high, dishes.low, dishes.missing]);
    for (const service of [...portal.services, ...portal.demo_services]) {
      expect(Object.keys(service).some((key) => /cost|margin|profit/i.test(key))).toBe(false);
    }
    const [invalid] = await anon`SELECT public.guest_portal('invalid') AS portal`;
    expect((invalid as { portal: null }).portal).toBeNull();
  });
});
