import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";

dotenv.config();
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const [username, fullName, password, role] = process.argv.slice(2);

if (!username || !fullName || !password || !role) {
  console.log('Usage: node scripts/create-user.js <username> "<Full Name>" <password> <admin|cashier>');
  process.exit(1);
}

const allowed = new Set(["admin", "cashier"]);
if (!allowed.has(role)) {
  console.log("Role must be admin or cashier");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

await pool.query(
  `INSERT INTO users (username, full_name, password_hash, role)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (username) DO UPDATE
   SET full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role`,
  [username, fullName, hash, role]
);

console.log("User created/updated:", username, role);
await pool.end();