export async function up(pgm) {
  pgm.createTable("cash_movements", {
    id: "bigserial",
    business_date: { type: "date", notNull: true },

    // exact timestamp (local+offset) like transactions
    date_time: { type: "timestamptz", notNull: true },

    // CASH_MMK | MOBILE_BANKING | FX
    tender_method: {
      type: "text",
      notNull: true,
      check: "tender_method IN ('CASH_MMK','MOBILE_BANKING','FX')",
    },

    // only needed if tender_method='FX'
    currency_code: { type: "text" },

    // positive amount only
    amount: { type: "numeric(18,2)", notNull: true },

    // IN or OUT
    direction: {
      type: "text",
      notNull: true,
      check: "direction IN ('IN','OUT')",
    },

    reason: { type: "text" },
    reference_no: { type: "text" },

    created_by: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // guards: FX must have currency_code, non-FX must NOT have it (optional but recommended)
  pgm.addConstraint(
    "cash_movements",
    "cash_movements_fx_currency_guard",
    `CHECK (
      (tender_method = 'FX' AND currency_code IS NOT NULL)
      OR
      (tender_method <> 'FX' AND currency_code IS NULL)
    )`
  );

  pgm.createIndex("cash_movements", ["business_date"]);
  pgm.createIndex("cash_movements", ["date_time"]);
}
export async function down(pgm) {
  pgm.dropTable("cash_movements");
}