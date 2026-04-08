import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

dotenv.config();

const { Pool } = pg;
const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());


// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

//middleware and helper function
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not logged in" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // attach user to request
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

//helper function to calculate availableMMK
async function getAvailableMMK(client, businessDate, tenderMethod) {
  // tenderMethod: 'CASH_MMK' or 'MOBILE_BANKING'
  const openingCol =
    tenderMethod === "MOBILE_BANKING"
      ? "opening_mobile_mmk"
      : "opening_balance_mmk";

  const q = `
    SELECT
      COALESCE(db.${openingCol}, 0)

      + COALESCE((
          SELECT SUM(
            CASE
              WHEN cm.direction = 'IN' THEN cm.amount
              WHEN cm.direction = 'OUT' THEN -cm.amount
              ELSE 0
            END
          )
          FROM cash_movements cm
          WHERE cm.business_date = db.business_date
            AND cm.tender_method = $2
        ), 0)

      + COALESCE((
          SELECT SUM(
            CASE
              WHEN t.type = 'SELL' THEN tp.amount_mmk
              WHEN t.type = 'BUY'  THEN -tp.amount_mmk
              ELSE 0
            END
          )
          FROM transaction_payments tp
          JOIN transactions t
            ON t.id = tp.transaction_id
          WHERE t.business_date = db.business_date
            AND tp.method = $2
        ), 0)

      AS available_mmk
    FROM daily_balances db
    WHERE db.business_date = $1::date
  `;

  const r = await client.query(q, [businessDate, tenderMethod]);

  if (r.rowCount === 0) {
    return { exists: false, available: 0 };
  }

  return {
    exists: true,
    available: Number(r.rows[0].available_mmk),
  };
}

async function getAvailableFX(client, businessDate, currencyCode) {
  const q = `
    SELECT
      COALESCE(fx.opening_amount, 0)

      + COALESCE((
          SELECT SUM(
            CASE
              WHEN cm.direction = 'IN' THEN cm.amount
              WHEN cm.direction = 'OUT' THEN -cm.amount
              ELSE 0
            END
          )
          FROM cash_movements cm
          WHERE cm.business_date = db.business_date
            AND cm.tender_method = 'FX'
            AND cm.currency_code = $2
        ), 0)

      + COALESCE((
          SELECT SUM(
            CASE
              WHEN t.type = 'BUY' THEN t.foreign_amount
              WHEN t.type = 'SELL' THEN -t.foreign_amount
              ELSE 0
            END
          )
          FROM transactions t
          WHERE t.business_date = db.business_date
            AND t.currency_code = $2
        ), 0)

      AS available_fx
    FROM daily_balances db
    JOIN daily_balance_fx fx
      ON fx.daily_balance_id = db.id
    WHERE db.business_date = $1::date
      AND fx.currency_code = $2
  `;

  const r = await client.query(q, [businessDate, currencyCode]);

  if (r.rowCount === 0) {
    return { exists: false, available: 0 };
  }

  return {
    exists: true,
    available: Number(r.rows[0].available_fx),
  };
}

// Quick health check
app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Login (sets httpOnly cookie)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username and password required" });

    const result = await pool.query(
      `SELECT id, username, full_name, password_hash, role, is_active
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (result.rowCount === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: "User is inactive" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true when using HTTPS in production
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout (clears cookie)
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

// Who am I?
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, fullName: req.user.fullName, role: req.user.role });
});

// List currencies
app.get("/api/currencies", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT code, name, buy_rate, sell_rate, is_active FROM currencies ORDER BY code"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function localDateISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`; // local server date
}

app.get("/api/inventory", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    // 1) MMK availability
    const cashAvail = await getAvailableMMK(pool, date, "CASH_MMK");
    const mobileAvail = await getAvailableMMK(pool, date, "MOBILE_BANKING");

    // 2) get all active currencies
    const curRes = await pool.query(
      `SELECT code, name
       FROM currencies
       WHERE is_active = true
       ORDER BY code`
    );

    const fx = [];

    for (const c of curRes.rows) {
      const fxRes = await pool.query(
        `
        SELECT
          COALESCE(fx.opening_amount, 0)

          + COALESCE((
              SELECT SUM(
                CASE
                  WHEN cm.direction = 'IN' THEN cm.amount
                  WHEN cm.direction = 'OUT' THEN -cm.amount
                  ELSE 0
                END
              )
              FROM cash_movements cm
              WHERE cm.business_date = db.business_date
                AND cm.tender_method = 'FX'
                AND cm.currency_code = $2
            ), 0)

          + COALESCE((
              SELECT SUM(
                CASE
                  WHEN t.type = 'BUY' THEN t.foreign_amount
                  WHEN t.type = 'SELL' THEN -t.foreign_amount
                  ELSE 0
                END
              )
              FROM transactions t
              WHERE t.business_date = db.business_date
                AND t.currency_code = $2
            ), 0)

          AS available_fx
        FROM daily_balances db
        LEFT JOIN daily_balance_fx fx
          ON fx.daily_balance_id = db.id
         AND fx.currency_code = $2
        WHERE db.business_date = $1::date
        `,
        [date, c.code]
      );

      const available =
        fxRes.rowCount === 0 ? 0 : Number(fxRes.rows[0].available_fx ?? 0);

      fx.push({
        currency: c.code,
        name: c.name,
        available,
      });
    }

    res.json({
      date,
      mmk: {
        cash: cashAvail.exists ? cashAvail.available : 0,
        mobile: mobileAvail.exists ? mobileAvail.available : 0,
      },
      fx,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/balances/available", requireAuth, async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "date query param required" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        db.business_date,

        db.opening_balance_mmk

        + COALESCE((
            SELECT SUM(
              CASE
                WHEN direction = 'IN' THEN amount
                WHEN direction = 'OUT' THEN -amount
              END
            )
            FROM cash_movements cm
            WHERE cm.business_date = db.business_date
              AND cm.tender_method = 'CASH_MMK'
          ), 0)

        + COALESCE((
            SELECT SUM(
              CASE
                WHEN t.type = 'SELL' THEN t.mmk_amount
                WHEN t.type = 'BUY'  THEN -t.mmk_amount
              END
            )
            FROM transactions t
            WHERE t.business_date = db.business_date
          ), 0)

        AS available_mmk

      FROM daily_balances db
      WHERE db.business_date = $1::date
      `,
      [date]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No opening balance for that date." });
    }

    res.json({
      businessDate: result.rows[0].business_date,
      availableMMK: Number(result.rows[0].available_mmk),
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cash-movements", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    // 🔐 only admin can top-up
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can create cash movements." });
    }

    const {
      businessDate,
      dateTime,
      tenderMethod,
      currencyCode,
      amount,
      direction,
      reason,
      referenceNo,
    } = req.body;

    // --- Basic validation ---
    if (!businessDate) {
      return res.status(400).json({ error: "businessDate required" });
    }

    if (!dateTime) {
      return res.status(400).json({ error: "dateTime required" });
    }

    const dt = new Date(dateTime);
    if (Number.isNaN(dt.getTime())) {
      return res.status(400).json({ error: "Invalid dateTime" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Amount must be positive number" });
    }

    const method = String(tenderMethod || "").toUpperCase();
    const dir = String(direction || "").toUpperCase();

    if (!["CASH_MMK", "MOBILE_BANKING", "FX"].includes(method)) {
      return res.status(400).json({ error: "Invalid tenderMethod" });
    }

    if (!["IN", "OUT"].includes(dir)) {
      return res.status(400).json({ error: "Invalid direction" });
    }

    // Block if day is closed
    const closed = await client.query(
      `SELECT closed_at FROM daily_balances WHERE business_date = $1::date`,
      [businessDate]
    );

    if (closed.rowCount && closed.rows[0].closed_at) {
      return res.status(403).json({ error: `Day ${businessDate} is closed.` });
    }

    // Insert movement
    const inserted = await client.query(
      `INSERT INTO cash_movements
        (business_date, date_time, tender_method, currency_code,
         amount, direction, reason, reference_no, created_by)
       VALUES ($1::date, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        businessDate,
        dt.toISOString(),
        method,
        method === "FX" ? currencyCode : null,
        amt,
        dir,
        reason || null,
        referenceNo || null,
        req.user.username,
      ]
    );

    res.status(201).json(inserted.rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Create a transaction (BUY/SELL) and calculate MMK amount
app.post("/api/transactions", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { type, currencyCode, foreignAmount, customerName, payments, transactionDateTime } = req.body;
    const createdBy = req.user.username;

    const raw = String(transactionDateTime || "").trim();
    if (!raw) {
      return res.status(400).json({
        error: "transactionDateTime is required (must include timezone offset, e.g. 2026-03-02T10:30:00+06:30)",
      });
    }

    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) {
      return res.status(400).json({ error: "Invalid transactionDateTime" });
    }

    // ✅ business date = user’s local date part (NOT UTC)
    const businessDate = raw.slice(0, 10);

    // ✅ Block if day closed for that business date
    const closed = await client.query(
      `SELECT closed_at FROM daily_balances WHERE business_date = $1::date`,
      [businessDate]
    );
    if (closed.rowCount && closed.rows[0].closed_at) {
      return res.status(403).json({ error: `Day ${businessDate} is closed.` });
    }

    const t = String(type).toUpperCase();
    const fa = Number(foreignAmount);

    if (!["BUY", "SELL"].includes(t)) {
      return res.status(400).json({ error: "type must be BUY or SELL" });
    }
    if (!Number.isFinite(fa) || fa <= 0) {
      return res.status(400).json({ error: "Invalid foreignAmount" });
    }

    const cur = await client.query(
      "SELECT buy_rate, sell_rate FROM currencies WHERE code = $1 AND is_active = true",
      [String(currencyCode).toUpperCase()]
    );

    if (cur.rowCount === 0) {
      return res.status(404).json({ error: "Currency not found" });
    }

    const rate = t === "BUY" ? Number(cur.rows[0].buy_rate) : Number(cur.rows[0].sell_rate);
    const mmkAmount = Number((fa * rate).toFixed(2));

    // ---- PAYMENT LOGIC (validated & normalized) ----
    const allowedMethods = new Set(["CASH_MMK", "MOBILE_BANKING"]);
    let paymentRows = Array.isArray(payments) ? payments : [];

    // ---- default: all cash ------- //
    if (paymentRows.length === 0) {
      paymentRows = [{ method: "CASH_MMK", amountMMK: mmkAmount }];
    }

    const normalized = paymentRows.map((p) => {
      const method = String(p.method || "").toUpperCase().trim();
      if (!allowedMethods.has(method)) {
        throw new Error(`Invalid payment method: ${method}`);
      }

      const amount = Number(p.amountMMK ?? p.amount_mmk ?? p.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid payment amount for ${method}`);
      }

      return {
        method,
        amount: Number(amount.toFixed(2)),
        provider: p.provider ? String(p.provider) : null,
        referenceNo: p.referenceNo
          ? String(p.referenceNo)
          : p.reference_no
          ? String(p.reference_no)
          : null,
      };
    });


    const total = normalized.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(total - mmkAmount) > 0.01) {
      return res.status(400).json({
        error: `Payment amounts do not match transaction total: payments=${total}, total=${mmkAmount}`,
      });
    }

    // ✅ Block BUY if not enough MMK in the selected payment method(s)
    if (t === "BUY") {
      for (const p of normalized) {
        const { exists, available } = await getAvailableMMK(client, businessDate, p.method);

        if (!exists) {
          return res.status(400).json({
            error: `No opening balance set for ${businessDate} (${p.method}).`,
          });
        }

        if (available < p.amount) {
          return res.status(400).json({
            error: `Insufficient ${p.method}. Available: ${available}, required: ${p.amount}`,
          });
        }
      }
    }

    // 🔒 Block SELL if not enough foreign currency
    if (t === "SELL") {
      const { exists, available } = await getAvailableFX(
        client,
        businessDate,
        String(currencyCode).toUpperCase()
      );

      if (!exists) {
        return res.status(400).json({
          error: `No FX opening set for ${currencyCode} on ${businessDate}.`,
        });
      }

      if (available < fa) {
        return res.status(400).json({
          error: `Insufficient ${currencyCode}. Available: ${available}, required: ${fa}`,
        });
      }
    }

    await client.query("BEGIN");

    // ✅ Insert transaction using:
    // - business_date from chosen datetime (or now)
    // - date_time = chosen datetime (or now)
    const inserted = await client.query(
      `INSERT INTO transactions
       (business_date, date_time, type, currency_code, foreign_amount, rate, mmk_amount, customer_name, created_by)
       VALUES ($1::date, $2::timestamptz, $3,$4,$5,$6,$7,$8,$9)
       RETURNING id, business_date, date_time, type, currency_code, foreign_amount, rate, mmk_amount, customer_name, created_by`,
      [
        businessDate,
        raw,
        t,
        String(currencyCode).toUpperCase(),
        fa,
        rate,
        mmkAmount,
        customerName || null,
        createdBy,
      ]
    );

    const tx = inserted.rows[0];

    // Insert payment rows
    for (const p of normalized) {
      await client.query(
        `INSERT INTO transaction_payments
         (transaction_id, method, amount_mmk, provider, reference_no)
         VALUES ($1,$2,$3,$4,$5)`,
        [tx.id, p.method, p.amount, p.provider, p.referenceNo]
      );
    }

    // Read back payments (source of truth)
    const pay = await client.query(
      `SELECT id, method, amount_mmk, provider, reference_no, created_at
       FROM transaction_payments
       WHERE transaction_id = $1
       ORDER BY id`,
      [tx.id]
    );

    await client.query("COMMIT");

    res.status(201).json({ ...tx, payments: pay.rows });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get one transaction (for receipt later)
app.get("/api/transactions/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    // 1) get the transaction
    const tx = await pool.query(
      `SELECT id, date_time, type, currency_code, foreign_amount, rate, mmk_amount, customer_name, created_by
       FROM transactions
       WHERE id = $1`,
      [id]
    );

    if (tx.rowCount === 0) return res.status(404).json({ error: "Not found" });

    // 2) get payment rows for this transaction
    const pay = await pool.query(
      `SELECT id, method, amount_mmk, provider, reference_no, created_at
       FROM transaction_payments
       WHERE transaction_id = $1
       ORDER BY id`,
      [id]
    );

    // 3) return combined response
    res.json({
      ...tx.rows[0],
      payments: pay.rows, // [] if none
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: edit a transaction (can change rate/amount/type/currency/customer)
// Recalculates mmk_amount = foreign_amount * rate
app.put("/api/transactions/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const { type, currencyCode, foreignAmount, rate, customerName } = req.body;

    // Load existing transaction
    const existing = await pool.query(
      `SELECT business_date, type, currency_code, foreign_amount, rate, customer_name
       FROM transactions
       WHERE id = $1`,
      [id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: "Transaction not found" });

    const businessDate = existing.rows[0].business_date;

    // Safety: block edits if day is closed
    const closed = await pool.query(
      `SELECT closed_at FROM daily_balances WHERE business_date = $1::date`,
      [businessDate]
    );
    if (closed.rowCount > 0 && closed.rows[0].closed_at) {
      return res.status(403).json({ error: `Day ${businessDate} is closed. Re-open day before editing.` });
    }

    // Decide new values (fallback to existing if not provided)
    const newType = type ? String(type).toUpperCase() : existing.rows[0].type;
    if (!["BUY", "SELL"].includes(newType)) return res.status(400).json({ error: "type must be BUY or SELL" });

    const newCurrency = currencyCode ? String(currencyCode).toUpperCase() : existing.rows[0].currency_code;

    const newForeign = foreignAmount !== undefined ? Number(foreignAmount) : Number(existing.rows[0].foreign_amount);
    if (!Number.isFinite(newForeign) || newForeign <= 0) {
      return res.status(400).json({ error: "foreignAmount must be > 0" });
    }

    const newRate = rate !== undefined ? Number(rate) : Number(existing.rows[0].rate);
    if (!Number.isFinite(newRate) || newRate <= 0) {
      return res.status(400).json({ error: "rate must be > 0" });
    }

    const newMMK = Number((newForeign * newRate).toFixed(2));
    const newCustomer = customerName !== undefined ? (customerName ? String(customerName) : null) : existing.rows[0].customer_name;

    const updated = await pool.query(
      `UPDATE transactions
       SET type = $2,
           currency_code = $3,
           foreign_amount = $4,
           rate = $5,
           mmk_amount = $6,
           customer_name = $7
       WHERE id = $1
       RETURNING id, business_date, date_time, type, currency_code, foreign_amount, rate, mmk_amount, customer_name, created_by`,
      [id, newType, newCurrency, newForeign, newRate, newMMK, newCustomer]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Admin: delete a transaction
app.delete("/api/transactions/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    // Optional safety: block deleting if day is closed (recommended)
    const tx = await pool.query(`SELECT business_date FROM transactions WHERE id = $1`, [id]);
    if (tx.rowCount === 0) return res.status(404).json({ error: "Transaction not found" });

    const businessDate = tx.rows[0].business_date;
    const closed = await pool.query(
      `SELECT closed_at FROM daily_balances WHERE business_date = $1::date`,
      [businessDate]
    );
    if (closed.rowCount > 0 && closed.rows[0].closed_at) {
      return res.status(403).json({ error: `Day ${businessDate} is closed. Re-open day before deleting.` });
    }

    await pool.query(`DELETE FROM transactions WHERE id = $1`, [id]);
    res.json({ ok: true, deletedId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily summary totals (MMK totals + counts) for a date
app.get("/api/reports/daily", requireAuth, async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    // 1) Business totals (unchanged meaning)
    const txTotals = await pool.query(
      `
      SELECT
        $1::date AS date,
        COUNT(*)::int AS total_transactions,
        COALESCE(SUM(CASE WHEN type='BUY'  THEN mmk_amount ELSE 0 END), 0) AS total_mmk_paid_out,
        COALESCE(SUM(CASE WHEN type='SELL' THEN mmk_amount ELSE 0 END), 0) AS total_mmk_received
      FROM transactions
      WHERE business_date = $1::date
      `,
      [date]
    );

    // 2) Tender totals (cash/mobile) from payments
    const tenderTotals = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_in,
        COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_out
      FROM transaction_payments tp
      JOIN transactions t ON t.id = tp.transaction_id
      WHERE t.business_date = $1::date
      `,
      [date]
    );

    const t = txTotals.rows[0];
    const p = tenderTotals.rows[0];

    const cashIn = Number(p.cash_in);
    const cashOut = Number(p.cash_out);
    const mobileIn = Number(p.mobile_in);
    const mobileOut = Number(p.mobile_out);

    res.json({
      date: t.date,
      total_transactions: Number(t.total_transactions),
      total_mmk_paid_out: Number(t.total_mmk_paid_out),
      total_mmk_received: Number(t.total_mmk_received),

      tenders: {
        cashIn,
        cashOut,
        mobileIn,
        mobileOut,
        cashNet: Number((cashIn - cashOut).toFixed(2)),
        mobileNet: Number((mobileIn - mobileOut).toFixed(2)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary between two dates (inclusive start, inclusive end)
app.get("/api/reports/range", requireAuth, async (req, res) => {
  try {
    const { start, end } = req.query; // YYYY-MM-DD
    if (!start || !end) return res.status(400).json({ error: "start and end are required (YYYY-MM-DD)" });

    // transactions totals
    const tx = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_transactions,
        COALESCE(SUM(CASE WHEN type='BUY'  THEN mmk_amount ELSE 0 END), 0) AS total_mmk_paid_out,
        COALESCE(SUM(CASE WHEN type='SELL' THEN mmk_amount ELSE 0 END), 0) AS total_mmk_received
      FROM transactions
      WHERE business_date >= $1::date
        AND business_date <= $2::date
      `,
      [start, end]
    );

    // profit/loss based on daily balances (opening - closing per day)
    const pl = await pool.query(
      `
      SELECT
        COALESCE(SUM(closing_balance_mmk - opening_balance_mmk), 0) AS profit_loss_mmk
      FROM daily_balances
      WHERE business_date >= $1::date
        AND business_date <= $2::date
        AND closed_at IS NOT NULL
        AND opening_balance_mmk IS NOT NULL
        AND closing_balance_mmk IS NOT NULL
      `,
      [start, end]
    );

    res.json({
      start,
      end,
      ...tx.rows[0],
      profit_loss_mmk: Number(pl.rows[0].profit_loss_mmk),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly totals for a year (YYYY)
app.get("/api/reports/monthly", requireAuth, async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: "year is required (e.g. 2025)" });

    const result = await pool.query(
      `
      WITH tx AS (
        SELECT
          date_trunc('month', business_date) AS m,
          COUNT(*)::int AS total_transactions,
          COALESCE(SUM(CASE WHEN type='BUY'  THEN mmk_amount ELSE 0 END), 0) AS total_mmk_paid_out,
          COALESCE(SUM(CASE WHEN type='SELL' THEN mmk_amount ELSE 0 END), 0) AS total_mmk_received
        FROM transactions
        WHERE business_date >= ($1 || '-01-01')::date
          AND business_date <  (($1 || '-01-01')::date + INTERVAL '1 year')
        GROUP BY 1
      ),
      pl AS (
        SELECT
          date_trunc('month', business_date) AS m,
          COALESCE(SUM(closing_balance_mmk - opening_balance_mmk), 0) AS profit_loss_mmk
        FROM daily_balances
        WHERE business_date >= ($1 || '-01-01')::date
          AND business_date <  (($1 || '-01-01')::date + INTERVAL '1 year')
          AND closed_at IS NOT NULL
          AND opening_balance_mmk IS NOT NULL
          AND closing_balance_mmk IS NOT NULL
        GROUP BY 1
      ),
      tenders AS (
        SELECT
          date_trunc('month', t.business_date) AS m,
          COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_in,
          COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_out,
          COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_in,
          COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_out
        FROM transaction_payments tp
        JOIN transactions t ON t.id = tp.transaction_id
        WHERE t.business_date >= ($1 || '-01-01')::date
          AND t.business_date <  (($1 || '-01-01')::date + INTERVAL '1 year')
        GROUP BY 1
      )
      SELECT
        to_char(COALESCE(tx.m, pl.m, tenders.m), 'YYYY-MM') AS month,

        COALESCE(tx.total_transactions, 0)::int AS total_transactions,
        COALESCE(tx.total_mmk_paid_out, 0) AS total_mmk_paid_out,
        COALESCE(tx.total_mmk_received, 0) AS total_mmk_received,
        COALESCE(pl.profit_loss_mmk, 0) AS profit_loss_mmk,

        COALESCE(tenders.cash_in, 0) AS cash_in,
        COALESCE(tenders.cash_out, 0) AS cash_out,
        COALESCE(tenders.mobile_in, 0) AS mobile_in,
        COALESCE(tenders.mobile_out, 0) AS mobile_out,

        (COALESCE(tenders.cash_in,0) - COALESCE(tenders.cash_out,0))::numeric AS cash_net,
        (COALESCE(tenders.mobile_in,0) - COALESCE(tenders.mobile_out,0))::numeric AS mobile_net

      FROM tx
      FULL OUTER JOIN pl USING (m)
      FULL OUTER JOIN tenders USING (m)
      ORDER BY month
      `,
      [String(year)]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Yearly totals (all years available)
app.get("/api/reports/yearly", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      WITH tx AS (
        SELECT
          date_trunc('year', business_date) AS y,
          COUNT(*)::int AS total_transactions,
          COALESCE(SUM(CASE WHEN type='BUY'  THEN mmk_amount ELSE 0 END), 0) AS total_mmk_paid_out,
          COALESCE(SUM(CASE WHEN type='SELL' THEN mmk_amount ELSE 0 END), 0) AS total_mmk_received
        FROM transactions
        GROUP BY 1
      ),
      pl AS (
        SELECT
          date_trunc('year', business_date) AS y,
          COALESCE(SUM(closing_balance_mmk - opening_balance_mmk), 0) AS profit_loss_mmk
        FROM daily_balances
        WHERE closed_at IS NOT NULL
          AND opening_balance_mmk IS NOT NULL
          AND closing_balance_mmk IS NOT NULL
        GROUP BY 1
      ),
      tenders AS (
        SELECT
          date_trunc('year', t.business_date) AS y,
          COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_in,
          COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_out,
          COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_in,
          COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_out
        FROM transaction_payments tp
        JOIN transactions t ON t.id = tp.transaction_id
        GROUP BY 1
      )
      SELECT
        to_char(COALESCE(tx.y, pl.y, tenders.y), 'YYYY') AS year,
        COALESCE(tx.total_transactions, 0)::int AS total_transactions,
        COALESCE(tx.total_mmk_paid_out, 0) AS total_mmk_paid_out,
        COALESCE(tx.total_mmk_received, 0) AS total_mmk_received,
        COALESCE(pl.profit_loss_mmk, 0) AS profit_loss_mmk,

        COALESCE(tenders.cash_in, 0)   AS cash_in,
        COALESCE(tenders.cash_out, 0)  AS cash_out,
        COALESCE(tenders.mobile_in, 0) AS mobile_in,
        COALESCE(tenders.mobile_out, 0) AS mobile_out,

        (COALESCE(tenders.cash_in, 0) - COALESCE(tenders.cash_out, 0)) AS cash_net,
        (COALESCE(tenders.mobile_in, 0) - COALESCE(tenders.mobile_out, 0)) AS mobile_net

      FROM tx
      FULL OUTER JOIN pl USING (y)
      FULL OUTER JOIN tenders USING (y)
      ORDER BY year
      `
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List transactions (optionally by date: YYYY-MM-DD)
app.get("/api/transactions", requireAuth, async (req, res) => {
  try {
    const { date, currency } = req.query;
    const currencyCode=currency? String(currency).trim().toUpperCase() : "";

    const baseQuery = `
      SELECT
        t.id,
        t.date_time,
        t.type,
        t.currency_code,
        t.foreign_amount,
        t.rate,
        t.mmk_amount,
        t.customer_name,
        t.created_by,

        -- aggregated payment breakdown
        COALESCE(SUM(CASE WHEN tp.method = 'CASH_MMK' THEN tp.amount_mmk ELSE 0 END), 0) AS cash_amount,
        COALESCE(SUM(CASE WHEN tp.method = 'MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_amount

      FROM transactions t
      LEFT JOIN transaction_payments tp
        ON tp.transaction_id = t.id
    `;

    const conditions=[];
    const params=[];

    if (date) {
      params.push(date);
      conditions.push(`t.business_date = $${params.length}::date`);
    }
    if (currencyCode) {
      params.push(currencyCode);
      conditions.push(`t.currency_code = $${params.length}`);
    }  

    const whereClauses=conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitClause=date ? "" : "LIMIT 100";
   

    const result = await pool.query(
      `
      ${baseQuery}
      ${whereClauses}
      GROUP BY t.id
      ORDER BY t.date_time DESC
      ${limitClause}
      `,
      params
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Set opening balance for a date (creates/overwrites opening)
app.post("/api/balances/open", requireAuth, async (req, res) => {
  try {
    const { date, openingBalanceMMK, openingMobileMMK } = req.body; // NEW: openingMobileMMK

    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    const openingCash = Number(openingBalanceMMK);
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      return res.status(400).json({ error: "openingBalanceMMK must be a number >= 0" });
    }

    // mobile is optional (you can force required if you want)
    const openingMobile =
      openingMobileMMK === undefined || openingMobileMMK === null || openingMobileMMK === ""
        ? null
        : Number(openingMobileMMK);

    if (openingMobile !== null && (!Number.isFinite(openingMobile) || openingMobile < 0)) {
      return res.status(400).json({ error: "openingMobileMMK must be a number >= 0" });
    }

    const result = await pool.query(
      `
      INSERT INTO daily_balances (business_date, opening_balance_mmk, opening_mobile_mmk)
      VALUES ($1::date, $2, $3)
      ON CONFLICT (business_date)
      DO UPDATE SET
        opening_balance_mmk = EXCLUDED.opening_balance_mmk,
        opening_mobile_mmk  = COALESCE(EXCLUDED.opening_mobile_mmk, daily_balances.opening_mobile_mmk)
      RETURNING business_date,
                opening_balance_mmk, opening_mobile_mmk,
                closing_balance_mmk, closing_mobile_mmk,
                opened_at, closed_at
      `,
      [date, openingCash, openingMobile]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: set opening FX balance for a date
app.post("/api/balances/open-fx", requireAuth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();

  try {
    const { date, currency, openingAmount } = req.body;

    if (!date || !currency || openingAmount === undefined) {
      return res.status(400).json({ error: "date, currency, openingAmount are required" });
    }

    const currencyCode = String(currency).trim().toUpperCase();
    if (!currencyCode) {
      return res.status(400).json({ error: "currency is required (e.g. USD)" });
    }

    const amount = Number(openingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "openingAmount must be a number >= 0" });
    }

    await client.query("BEGIN");

    // Optional: validate currency exists and active
    const cur = await client.query(
      `SELECT code FROM currencies WHERE code = $1 AND is_active = true`,
      [currencyCode]
    );
    if (cur.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Currency ${currencyCode} not found or inactive` });
    }

    // Lock the daily balance row for the date
    // NOTE: table name here must match your DB: daily_balances (plural)
    const bal = await client.query(
      `
      SELECT id, closed_at
      FROM daily_balances
      WHERE business_date = $1::date
      FOR UPDATE
      `,
      [date]
    );

    if (bal.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Set MMK opening balance first for this date." });
    }

    if (bal.rows[0].closed_at) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Day is closed. Re-open day before setting FX opening." });
    }

    const dailyBalanceId = bal.rows[0].id;

    // Upsert FX opening
    const upsert = await client.query(
      `
      INSERT INTO daily_balance_fx (daily_balance_id, currency_code, opening_amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (daily_balance_id, currency_code)
      DO UPDATE SET
        opening_amount = EXCLUDED.opening_amount,
        updated_at = NOW()
      RETURNING currency_code, opening_amount, closing_amount
      `,
      [dailyBalanceId, currencyCode, amount]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      date,
      fx: {
        currency: upsert.rows[0].currency_code,
        openingAmount: Number(upsert.rows[0].opening_amount),
        closingAmount: upsert.rows[0].closing_amount !== null ? Number(upsert.rows[0].closing_amount) : null,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Admin: set closing FX balance for a date + currency
app.post("/api/balances/close-fx", requireAuth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { date, currency, closingAmount } = req.body;

    if (!date || !currency || closingAmount === undefined) {
      return res.status(400).json({ error: "date, currency, closingAmount are required" });
    }

    const currencyCode = String(currency).trim().toUpperCase();
    const amount = Number(closingAmount);

    if (!currencyCode) return res.status(400).json({ error: "currency is required (e.g. USD)" });
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "closingAmount must be a number >= 0" });
    }

    await client.query("BEGIN");

    // Ensure currency exists and active (prevents random codes)
    const cur = await client.query(
      `SELECT code FROM currencies WHERE code = $1 AND is_active = true`,
      [currencyCode]
    );
    if (cur.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Currency ${currencyCode} not found or inactive` });
    }

    // Lock the day row
    const bal = await client.query(
      `
      SELECT id, closed_at
      FROM daily_balances
      WHERE business_date = $1::date
      FOR UPDATE
      `,
      [date]
    );

    if (bal.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Set MMK opening balance first for this date." });
    }

    const dailyBalanceId = bal.rows[0].id;

    // Require opening exists (so you don't close something never opened)
    const existingFx = await client.query(
      `
      SELECT id
      FROM daily_balance_fx
      WHERE daily_balance_id = $1 AND currency_code = $2
      `,
      [dailyBalanceId, currencyCode]
    );

    if (existingFx.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `No FX opening found for ${currencyCode}. Set opening first.` });
    }

    // Update closing
    const updated = await client.query(
      `
      UPDATE daily_balance_fx
      SET closing_amount = $3,
          updated_at = NOW()
      WHERE daily_balance_id = $1
        AND currency_code = $2
      RETURNING currency_code, opening_amount, closing_amount
      `,
      [dailyBalanceId, currencyCode, amount]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      date,
      fx: {
        currency: updated.rows[0].currency_code,
        openingAmount: Number(updated.rows[0].opening_amount),
        closingAmount: Number(updated.rows[0].closing_amount),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Admin: delete FX row for a date + currency
app.delete("/api/balances/fx", requireAuth, requireRole("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { date, currency } = req.query;

    if (!date || !currency) {
      return res.status(400).json({ error: "date and currency are required" });
    }

    const currencyCode = String(currency).trim().toUpperCase();

    await client.query("BEGIN");

    // Lock the day row (and block deletes if day is closed)
    const bal = await client.query(
      `
      SELECT id, closed_at
      FROM daily_balances
      WHERE business_date = $1::date
      FOR UPDATE
      `,
      [date]
    );

    if (bal.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No daily balance for that date" });
    }

    if (bal.rows[0].closed_at) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Day is closed. Re-open day before deleting FX." });
    }

    const dailyBalanceId = bal.rows[0].id;

    const del = await client.query(
      `
      DELETE FROM daily_balance_fx
      WHERE daily_balance_id = $1 AND currency_code = $2
      RETURNING currency_code
      `,
      [dailyBalanceId, currencyCode]
    );

    await client.query("COMMIT");

    if (del.rowCount === 0) {
      return res.status(404).json({ error: "FX row not found" });
    }

    res.json({ ok: true, date, deletedCurrency: del.rows[0].currency_code });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// Get balance + totals for a date (suggested closing = opening + received - paid_out)
app.get("/api/balances", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    // 1️⃣ Daily balances (now includes mobile columns)
    const balResult = await pool.query(
      `
      SELECT id, business_date,
             opening_balance_mmk, closing_balance_mmk,
             opening_mobile_mmk,  closing_mobile_mmk,
             opened_at, closed_at
      FROM daily_balances
      WHERE business_date = $1::date
      `,
      [date]
    );

    const balance = balResult.rowCount ? balResult.rows[0] : null;

    const openingCash = balance?.opening_balance_mmk ?? null;
    const openingMobile = balance?.opening_mobile_mmk ?? null;

    // 2️⃣ Tender totals from transaction_payments (cash vs mobile)
    // Assumption consistent with your code comments:
    // SELL = shop receives MMK (IN), BUY = shop pays out MMK (OUT)
    const tenderTotals = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='CASH_MMK'       THEN tp.amount_mmk ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN t.type='SELL' AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_in,
        COALESCE(SUM(CASE WHEN t.type='BUY'  AND tp.method='MOBILE_BANKING' THEN tp.amount_mmk ELSE 0 END), 0) AS mobile_out
      FROM transaction_payments tp
      JOIN transactions t ON t.id = tp.transaction_id
      WHERE t.business_date = $1::date
      `,
      [date]
    );

    const cashIn = Number(tenderTotals.rows[0].cash_in);
    const cashOut = Number(tenderTotals.rows[0].cash_out);
    const mobileIn = Number(tenderTotals.rows[0].mobile_in);
    const mobileOut = Number(tenderTotals.rows[0].mobile_out);

    const suggestedClosingCash =
      openingCash === null || openingCash === undefined
        ? null
        : Number((Number(openingCash) + cashIn - cashOut).toFixed(2));

    const suggestedClosingMobile =
      openingMobile === null || openingMobile === undefined
        ? null
        : Number((Number(openingMobile) + mobileIn - mobileOut).toFixed(2));

    // 2.5️⃣ Keep your old transaction totals (business volume) if you still want them
    const txTotals = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type='BUY'  THEN mmk_amount ELSE 0 END), 0) AS total_mmk_paid_out,
        COALESCE(SUM(CASE WHEN type='SELL' THEN mmk_amount ELSE 0 END), 0) AS total_mmk_received
      FROM transactions
      WHERE business_date = $1::date
      `,
      [date]
    );

    // FX totals from transactions (per currency) - unchanged
    const fxTx = await pool.query(
      `
      SELECT
        currency_code,
        COALESCE(SUM(CASE WHEN type='BUY'  THEN foreign_amount ELSE 0 END), 0) AS foreign_in,
        COALESCE(SUM(CASE WHEN type='SELL' THEN foreign_amount ELSE 0 END), 0) AS foreign_out,
        COALESCE(SUM(CASE WHEN type='BUY' THEN mmk_amount ELSE 0 END), 0) AS buy_mmk,
        COALESCE(SUM(CASE WHEN type='SELL' THEN mmk_amount ELSE 0 END), 0) AS sell_mmk
      FROM transactions
      WHERE business_date = $1::date
        AND currency_code IS NOT NULL
      GROUP BY currency_code
      ORDER BY currency_code
      `,
      [date]
    );

    // 3️⃣ FX balances (unchanged, just uses daily_balance_fx)
    let fxBalances = [];
    if (balance) {
      const fxResult = await pool.query(
        `
        SELECT currency_code, opening_amount, closing_amount
        FROM daily_balance_fx
        WHERE daily_balance_id = $1
        ORDER BY currency_code
        `,
        [balance.id]
      );

      fxBalances = fxResult.rows.map(row => ({
        currency: row.currency_code,
        openingAmount: row.opening_amount === null ? null : Number(row.opening_amount),
        closingAmount: row.closing_amount !== null ? Number(row.closing_amount) : null,
      }));
    }

    // 3.5️⃣ Merge FX transaction totals into fxBalances (+ suggested closing & difference) - unchanged
    const fxTotalsByCur = {};
    for (const r of fxTx.rows) {
      const cur = r.currency_code;
      const foreignIn = Number(r.foreign_in);
      const foreignOut = Number(r.foreign_out);
      const buyMMK = Number(r.buy_mmk);
      const sellMMK = Number(r.sell_mmk);
      const netForeign = Number((foreignIn - foreignOut).toFixed(2));
      fxTotalsByCur[cur] = { foreignIn, foreignOut, buyMMK, sellMMK, netForeign };
    }

    const allCurrencies=new Set([
      ...fxBalances.map((fx)=>fx.currency),
      ...Object.keys(fxTotalsByCur),
    ]);

   fxBalances = Array.from(allCurrencies)
      .sort()
      .map((currency) => {
        const fx = fxBalances.find((x) => x.currency === currency) || {
          currency,
          openingAmount: null,
          closingAmount: null,
        };
        const t = fxTotalsByCur[currency] || {
          foreignIn: 0,
          foreignOut: 0,
          buyMMK: 0,
          sellMMK: 0,
          netForeign: 0,
        };
        const suggestedClosingAmount =
          fx.openingAmount === null || fx.openingAmount === undefined
            ? null
            : Number((Number(fx.openingAmount) + t.netForeign).toFixed(2));
        const diffAmount =
          fx.closingAmount === null || fx.closingAmount === undefined || suggestedClosingAmount === null
            ? null
            : Number((Number(fx.closingAmount) - suggestedClosingAmount).toFixed(2));
        return {
          ...fx,
          foreignIn: t.foreignIn,
          foreignOut: t.foreignOut,
          buyMMK: t.buyMMK,
          sellMMK: t.sellMMK,
          netForeign: t.netForeign,
          suggestedClosingAmount,
          diffAmount,
        };
      });

    res.json({
      date,

      // openings/closings (cash + mobile)
      openingBalanceMMK: openingCash === null ? null : Number(openingCash),
      closingBalanceMMK: balance?.closing_balance_mmk ?? null,
      openingMobileMMK: openingMobile === null ? null : Number(openingMobile),
      closingMobileMMK: balance?.closing_mobile_mmk ?? null,

      isClosed: balance ? !!balance.closed_at : false,

      // tender totals (what you need now)
      tenders: {
        cashIn,
        cashOut,
        mobileIn,
        mobileOut,
      },

      suggestedClosingMMK: suggestedClosingCash,
      suggestedClosingMobileMMK: suggestedClosingMobile,

      // keep business totals too (optional)
      totals: {
        totalMMKReceived: Number(txTotals.rows[0].total_mmk_received),
        totalMMKPaidOut: Number(txTotals.rows[0].total_mmk_paid_out),
      },

      fxBalances,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Close the day (store closing balance)
app.post("/api/balances/close", requireAuth, async (req, res) => {
  try {
    const { date, closingBalanceMMK, closingMobileMMK } = req.body; // NEW: closingMobileMMK
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    const closingCash = Number(closingBalanceMMK);
    if (!Number.isFinite(closingCash)) {
      return res.status(400).json({ error: "closingBalanceMMK must be a number" });
    }

    const closingMobile =
      closingMobileMMK === undefined || closingMobileMMK === null || closingMobileMMK === ""
        ? null
        : Number(closingMobileMMK);

    if (closingMobile !== null && !Number.isFinite(closingMobile)) {
      return res.status(400).json({ error: "closingMobileMMK must be a number" });
    }

    // Must already have opening set
    const existing = await pool.query(
      `SELECT business_date, closed_at FROM daily_balances WHERE business_date = $1::date`,
      [date]
    );
    if (existing.rowCount === 0) {
      return res.status(400).json({ error: "Set opening balance first for this date." });
    }

    // Optional: block if already closed
    if (existing.rows[0].closed_at) {
      return res.status(403).json({ error: "Day is already closed. Re-open to change closing." });
    }

    const result = await pool.query(
      `
      UPDATE daily_balances
      SET closing_balance_mmk = $2,
          closing_mobile_mmk  = $3,
          closed_at = NOW()
      WHERE business_date = $1::date
      RETURNING business_date,
                opening_balance_mmk, opening_mobile_mmk,
                closing_balance_mmk, closing_mobile_mmk,
                opened_at, closed_at
      `,
      [date, closingCash, closingMobile]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create currency
app.post("/api/admin/currencies", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { code, name, buy_rate, sell_rate, is_active } = req.body;
    if (!code || !name) return res.status(400).json({ error: "code and name are required" });

    const br = Number(buy_rate);
    const sr = Number(sell_rate);
    if (!Number.isFinite(br) || !Number.isFinite(sr) || br <= 0 || sr <= 0) {
      return res.status(400).json({ error: "buy_rate and sell_rate must be > 0" });
    }

    const result = await pool.query(
      `INSERT INTO currencies (code, name, buy_rate, sell_rate, is_active)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING code, name, buy_rate, sell_rate, is_active`,
      [code.toUpperCase(), name, br, sr, is_active ?? true]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update rates + active flag
app.put("/api/admin/currencies/:code", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const { name, buy_rate, sell_rate, is_active } = req.body;

    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
    if (buy_rate !== undefined) {
      const br = Number(buy_rate);
      if (!Number.isFinite(br) || br <= 0) return res.status(400).json({ error: "buy_rate must be > 0" });
      fields.push(`buy_rate=$${i++}`); values.push(br);
    }
    if (sell_rate !== undefined) {
      const sr = Number(sell_rate);
      if (!Number.isFinite(sr) || sr <= 0) return res.status(400).json({ error: "sell_rate must be > 0" });
      fields.push(`sell_rate=$${i++}`); values.push(sr);
    }
    if (is_active !== undefined) { fields.push(`is_active=$${i++}`); values.push(!!is_active); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(code);
    const result = await pool.query(
      `UPDATE currencies SET ${fields.join(", ")}
       WHERE code = $${i}
       RETURNING code, name, buy_rate, sell_rate, is_active`,
      values
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Currency not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete currency (hard delete)
app.delete("/api/admin/currencies/:code", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const code = String(req.params.code).toUpperCase();

    // Optional: block delete if used in transactions (friendlier message)
    const used = await pool.query(
      `SELECT 1 FROM transactions WHERE currency_code = $1 LIMIT 1`,
      [code]
    );
    if (used.rowCount > 0) {
      return res.status(409).json({
        error: `Cannot delete ${code} because it is used in transactions. Deactivate it instead.`,
      });
    }

    const result = await pool.query(
      `DELETE FROM currencies WHERE code = $1 RETURNING code`,
      [code]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Currency not found" });

    res.json({ ok: true, deleted: result.rows[0].code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: re-open a closed day
app.post("/api/balances/reopen", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { date } = req.body; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    const result = await pool.query(
      `
      UPDATE daily_balances
      SET closed_at = NULL,
          closing_balance_mmk = NULL
      WHERE business_date = $1::date
      RETURNING business_date, opening_balance_mmk, closing_balance_mmk, opened_at, closed_at
      `,
      [date]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "No balance record for that date" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});