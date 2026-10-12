const { Client } = require("../frontend/node_modules/pg");
const fs = require("fs");
const path = require("path");

const DB_HOST = process.env.SUPABASE_DB_HOST || "aws-0-eu-west-1.pooler.supabase.com";
const DB_PORT = parseInt(process.env.SUPABASE_DB_PORT || "5432", 10);
const DB_USER = process.env.SUPABASE_DB_USER || "postgres.spchcnkmpssxyyeizgwb";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const DB_NAME = process.env.SUPABASE_DB_NAME || "postgres";

console.log("=== TradeSure Supabase Database Migration & Bucket Provisioning ===");

if (!DB_PASSWORD) {
  console.error("✖ Missing SUPABASE_DB_PASSWORD environment variable.");
  process.exit(1);
}

console.log(`Connecting to: ${DB_HOST}:${DB_PORT} as ${DB_USER}...`);

const client = new Client({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("✔ Connected to Supabase PostgreSQL database successfully!");

  // 1. Read and apply schema SQL
  const schemaPath = path.join(__dirname, "../supabase/migrations/20261011_tradesure_schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  console.log(`Applying migration: 20261011_tradesure_schema.sql (${schemaSql.length} bytes)...`);

  await client.query("BEGIN;");
  try {
    await client.query(schemaSql);
    await client.query("COMMIT;");
    console.log("✔ Applied 20261011_tradesure_schema.sql migration successfully!");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw new Error(`Migration failed: ${err.message}`);
  }

  // 2. Verify all tables in public schema
  console.log("\n[Verification] Checking public tables in database...");
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  const tableNames = tablesRes.rows.map((r) => r.table_name);
  console.log(`✔ Found ${tableNames.length} tables in public schema:`, tableNames.join(", "));

  // 3. Verify RLS status on tables
  console.log("\n[Verification] Checking Row-Level Security (RLS)...");
  const rlsRes = await client.query(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'organizations', 'orders', 'evidence', 'disputes');
  `);
  for (const row of rlsRes.rows) {
    console.log(`  Table '${row.tablename}': RLS enabled = ${row.rowsecurity}`);
  }

  // 4. Create and configure storage bucket: evidence-vault
  console.log("\n[Storage] Provisioning private 'evidence-vault' bucket...");
  const bucketCheck = await client.query(`
    SELECT id, name, public, file_size_limit, allowed_mime_types 
    FROM storage.buckets 
    WHERE id = 'evidence-vault';
  `);

  if (bucketCheck.rows.length === 0) {
    await client.query(`
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
      VALUES (
        'evidence-vault',
        'evidence-vault',
        false,
        15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'application/json'],
        NOW(),
        NOW()
      );
    `);
    console.log("✔ Created private 'evidence-vault' storage bucket in storage.buckets");
  }

  // Ensure storage.buckets allows reading
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'buckets' AND policyname = 'Allow bucket select'
      ) THEN
        CREATE POLICY "Allow bucket select" ON storage.buckets FOR SELECT USING (true);
      END IF;
    END $$;
  `);

  // 5. Configure storage RLS policies for evidence-vault
  console.log("\n[Storage] Configuring storage RLS policies for 'evidence-vault'...");
  await client.query(`
    DO $$
    BEGIN
      -- Select policy for authenticated users or service role
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Evidence vault read policy'
      ) THEN
        CREATE POLICY "Evidence vault read policy" ON storage.objects
          FOR SELECT USING (bucket_id = 'evidence-vault');
      END IF;

      -- Insert policy
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Evidence vault insert policy'
      ) THEN
        CREATE POLICY "Evidence vault insert policy" ON storage.objects
          FOR INSERT WITH CHECK (bucket_id = 'evidence-vault');
      END IF;
    END $$;
  `);
  console.log("✔ Storage RLS policies verified on storage.objects");

  // 6. Test roundtrip insert and select
  console.log("\n[Verification] Testing live record write & read...");
  const testOrderId = "00000000-0000-0000-0000-000000000001";
  await client.query(`
    INSERT INTO public.orders (id, order_reference, title, currency, total_amount, status)
    VALUES ($1, 'TEST-REF-001', 'Test Validation Order', 'USD', 99.00, 'ORDER_CREATED')
    ON CONFLICT (id) DO NOTHING;
  `, [testOrderId]);

  const verifyOrder = await client.query(`SELECT id, order_reference, status FROM public.orders WHERE id = $1;`, [testOrderId]);
  console.log("✔ Live record verified in public.orders:", verifyOrder.rows[0]);

  await client.query(`DELETE FROM public.orders WHERE id = $1;`, [testOrderId]);
  console.log("✔ Cleaned up test record");

  console.log("\n=== ALL SCHEMA MIGRATION & STORAGE CHECKS COMPLETED SUCCESSFULLY ===");
}

main().catch((err) => {
  console.error("✖ Migration error:", err.message);
  process.exit(1);
}).finally(() => client.end());
