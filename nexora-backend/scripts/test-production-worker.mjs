import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createHmac } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

// Real PostgreSQL execution of the dispatcher; the HTTP transport and Vault are synthetic.
// Never point this test at an application database.
const url = new URL(process.env.SCHEDULER_TEST_DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.equal(url.pathname, '/nexora_scheduler_test');
const pool = new Pool({ connectionString: url.href, max: 1 });
const c = await pool.connect();
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
let checks = 0;
async function check(sql, expected) {
  assert.equal((await c.query(sql)).rows[0].value, expected);
  checks++;
}
async function tick() {
  await c.query('SELECT nexora_worker_ops.tick()');
}
try {
  await c.query(`BEGIN;
    CREATE SCHEMA net; CREATE SCHEMA vault;
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    CREATE TABLE schools(id uuid PRIMARY KEY,status text);
    CREATE TABLE exams(id uuid,school_id uuid,import_id uuid,state text);
    CREATE TABLE import_jobs(id uuid,school_id uuid,exam_id uuid,state text,lease_until timestamptz);
    CREATE TABLE ai_jobs(school_id uuid,import_job_id uuid,status text,retry_at timestamptz,lease_until timestamptz);
    CREATE TABLE package_jobs(school_id uuid,status text,lease_until timestamptz);
    CREATE TABLE vault.decrypted_secrets(id uuid,decrypted_secret text);
    CREATE TABLE net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text);
    CREATE TABLE net.http_request_queue(id bigserial,url text,headers jsonb,body jsonb,timeout integer);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
    RETURNS bigint LANGUAGE sql AS $fn$
      INSERT INTO net.http_request_queue(url,headers,body,timeout)
      VALUES($1,$2,$3,$4) RETURNING id
    $fn$;`);
  await c.query(readFileSync(new URL('./sql/production-worker.sql', import.meta.url), 'utf8'));
  await c.query(
    `INSERT INTO vault.decrypted_secrets VALUES($1,repeat('x',48));
    `,
    [a],
  );
  await c.query(
    `INSERT INTO nexora_worker_ops.scheduler(endpoint,secret_id)
    VALUES('https://example.invalid/api/v1/internal/import-worker',$1)`,
    [a],
  );
  await c.query(`INSERT INTO schools VALUES($1,'active'),($2,'active');`, [a, b]);
  await c.query(`INSERT INTO package_jobs VALUES($1,'pending',NULL),($2,'pending',NULL)`, [a, b]);
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 0);
  await c.query('UPDATE nexora_worker_ops.scheduler SET enabled=true');
  await tick();
  await check(
    "SELECT body->>'schoolId' AS value FROM net.http_request_queue ORDER BY id DESC LIMIT 1",
    a,
  );
  const dispatched = (
    await c.query('SELECT headers,body FROM net.http_request_queue ORDER BY id DESC LIMIT 1')
  ).rows[0];
  const signature = createHmac('sha256', 'x'.repeat(48))
    .update(
      `nexora-worker-v1\n${a}\n${dispatched.headers['x-nexora-worker-nonce']}\n${dispatched.headers['x-nexora-worker-time']}`,
    )
    .digest('hex');
  assert.equal(dispatched.headers.Authorization, `Nexora-HMAC ${signature}`);
  checks++;
  assert.ok(!JSON.stringify(dispatched).includes('x'.repeat(48)));
  checks++;
  await check(
    `SELECT public.nexora_claim_worker_dispatch('${b}',dispatch_nonce) AS value FROM nexora_worker_ops.scheduler`,
    false,
  );
  await check(
    `SELECT public.nexora_claim_worker_dispatch('${a}',dispatch_nonce) AS value FROM nexora_worker_ops.scheduler`,
    true,
  );
  await check(
    `SELECT public.nexora_claim_worker_dispatch('${a}',dispatch_nonce) AS value FROM nexora_worker_ops.scheduler`,
    false,
  );
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 1);
  await c.query(
    'INSERT INTO net._http_response SELECT request_id,200,false,NULL FROM nexora_worker_ops.scheduler',
  );
  await tick();
  await check(
    "SELECT body->>'schoolId' AS value FROM net.http_request_queue ORDER BY id DESC LIMIT 1",
    b,
  );
  await check('SELECT successful_requests::int AS value FROM nexora_worker_ops.scheduler', 1);
  await c.query(
    'INSERT INTO net._http_response SELECT request_id,403,false,NULL FROM nexora_worker_ops.scheduler',
  );
  await tick();
  await check(
    "SELECT body->>'schoolId' AS value FROM net.http_request_queue ORDER BY id DESC LIMIT 1",
    a,
  );
  await check('SELECT failed_requests::int AS value FROM nexora_worker_ops.scheduler', 1);
  await c.query("UPDATE nexora_worker_ops.scheduler SET dispatched_at=now()-interval '4 minutes'");
  await tick();
  await check('SELECT failed_requests::int AS value FROM nexora_worker_ops.scheduler', 2);
  await check(
    "SELECT body->>'schoolId' AS value FROM net.http_request_queue ORDER BY id DESC LIMIT 1",
    b,
  );
  await c.query(`UPDATE nexora_worker_ops.scheduler SET request_id=NULL;
    DELETE FROM package_jobs; DELETE FROM net.http_request_queue;`);
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 0);
  await c.query(
    `INSERT INTO exams VALUES($1,$1,$1,'draft');
    `,
    [a],
  );
  await c.query(`INSERT INTO import_jobs VALUES($1,$1,$1,'queued',NULL)`, [a]);
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 1);
  await c.query(
    "UPDATE nexora_worker_ops.scheduler SET request_id=NULL; UPDATE schools SET status='suspended'; DELETE FROM net.http_request_queue",
  );
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 0);
  await c.query("UPDATE schools SET status='active'; UPDATE import_jobs SET state='cancelled'");
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 0);
  await c.query("UPDATE import_jobs SET state='ai_queued'");
  await c.query("INSERT INTO ai_jobs VALUES($1,$1,'pending',now()+interval '1 hour',NULL)", [a]);
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 0);
  await c.query("UPDATE ai_jobs SET retry_at=now()-interval '1 second'");
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 1);
  await c.query(
    "UPDATE nexora_worker_ops.scheduler SET request_id=NULL; UPDATE ai_jobs SET status='processing',lease_until=now()+interval '1 minute'; DELETE FROM net.http_request_queue",
  );
  await tick();
  await check('SELECT count(*)::int AS value FROM net.http_request_queue', 0);
  await c.query(
    "UPDATE ai_jobs SET lease_until=now()-interval '1 second'; UPDATE vault.decrypted_secrets SET decrypted_secret='short'",
  );
  await tick();
  await check('SELECT enabled AS value FROM nexora_worker_ops.scheduler', false);
  await check(
    "SELECT EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid='nexora_worker_ops.tick()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS value",
    false,
  );
  console.log(`${checks} PostgreSQL scheduler checks passed. No external HTTP or AI calls.`);
} finally {
  await c.query('ROLLBACK');
  c.release();
  await pool.end();
}
