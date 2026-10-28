const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({
  host: process.env.SQL_HOST,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME
});

async function run() {
  const tables = [
    "packages",
    "lua_scripts",
    "lua_script_versions",
    "app_settings",
    "duration_codes",
    "ads",
    "social_links",
    "package_discounts"
  ];
  const out = {};
  let sql = "-- Arexans Tools Database Seed for Vercel / External PostgreSQL\n\n";

  for (const t of tables) {
    try {
      const res = await pool.query("SELECT * FROM " + t);
      out[t] = res.rows;
      if (res.rows.length > 0) {
        sql += `-- Table: ${t} (${res.rows.length} rows)\n`;
        for (const row of res.rows) {
          const keys = Object.keys(row);
          const cols = keys.map(k => `"${k}"`).join(", ");
          const vals = keys.map(k => {
            const v = row[k];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
            if (typeof v === "number") return v;
            if (v instanceof Date) return `'${v.toISOString()}'`;
            if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            return `'${String(v).replace(/'/g, "''")}'`;
          }).join(", ");
          sql += `INSERT INTO "${t}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        sql += "\n";
      }
    } catch (e) {
      console.log(t, e.message);
    }
  }

  fs.writeFileSync("database_seed.sql", sql);
  fs.writeFileSync("database_export.json", JSON.stringify(out, null, 2));
  console.log("SUCCESS_EXPORTED");
  pool.end();
}

run();
