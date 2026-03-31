/**
 * Vitest global setup — creates an isolated "mello_test" schema so that
 * tests never touch production data in the "public" schema.
 *
 * Clones the structure of every table in public (columns, defaults,
 * constraints, indexes) into mello_test, then re-creates triggers.
 */
import postgres from 'postgres';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://mello:changeme@localhost:5432/mello';

export async function setup() {
  const sql = postgres(DATABASE_URL);

  // Drop and recreate the test schema
  await sql.unsafe('DROP SCHEMA IF EXISTS mello_test CASCADE');
  await sql.unsafe('CREATE SCHEMA mello_test');

  // Get all tables in public schema
  const tables = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  // Clone each table's structure (columns, defaults, constraints, indexes)
  for (const { tablename } of tables) {
    await sql.unsafe(
      `CREATE TABLE mello_test."${tablename}" (LIKE public."${tablename}" INCLUDING ALL)`
    );
  }

  // Re-create foreign key constraints pointing to mello_test instead of public
  const fks = await sql`
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule,
      rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name
  `;

  for (const fk of fks) {
    const onDelete = fk.delete_rule === 'NO ACTION' ? 'NO ACTION' : fk.delete_rule;
    const onUpdate = fk.update_rule === 'NO ACTION' ? 'NO ACTION' : fk.update_rule;
    await sql.unsafe(`
      ALTER TABLE mello_test."${fk.table_name}"
      ADD CONSTRAINT "${fk.constraint_name}"
      FOREIGN KEY ("${fk.column_name}")
      REFERENCES mello_test."${fk.foreign_table_name}"("${fk.foreign_column_name}")
      ON DELETE ${onDelete} ON UPDATE ${onUpdate}
    `);
  }

  // Re-create trigger functions and triggers in the test schema
  await sql.unsafe('SET search_path TO mello_test');

  // Cards search vector trigger
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION mello_test.cards_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await sql.unsafe(`
    CREATE TRIGGER cards_search_vector_trigger
      BEFORE INSERT OR UPDATE OF name, description ON mello_test.cards
      FOR EACH ROW EXECUTE FUNCTION mello_test.cards_search_vector_update()
  `);

  // Comments search vector trigger
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION mello_test.comments_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await sql.unsafe(`
    CREATE TRIGGER comments_search_vector_trigger
      BEFORE INSERT OR UPDATE OF body ON mello_test.comments
      FOR EACH ROW EXECUTE FUNCTION mello_test.comments_search_vector_update()
  `);

  await sql.unsafe('SET search_path TO public');
  await sql.end();
}

export async function teardown() {
  const sql = postgres(DATABASE_URL);
  await sql.unsafe('DROP SCHEMA IF EXISTS mello_test CASCADE');
  await sql.end();
}
