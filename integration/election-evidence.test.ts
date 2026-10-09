import { createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { databaseSchema } from "@/db/schema";
import { createElectionRepository, reviewElectionPackage } from "@/lib/election-repository";
import { projectContest, serializeElectionPackage, type ApprovedElectionReceipt } from "@/lib/elections";
import { evidence, fixtureGraph, NOW, VERIFIED_AT, type Mutable } from "../tests/fixtures/elections/domain";

// This suite runs only against the hosted disposable PostgreSQL job. No skip or local fallback.
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const writerPool = new Pool({ connectionString, max: 1 });
const secondWriterPool = new Pool({ connectionString, max: 1 });
const database = drizzle(pool, { schema: databaseSchema });
beforeAll(async () => {
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString)) throw new Error("Election PostgreSQL proof requires the disposable PostgreSQL job");
  expect((await pool.query("select to_regclass('election_evidence')::text as relation")).rows[0].relation).toBe("election_evidence");
});
afterAll(async () => { await Promise.all([pool.end(), writerPool.end(), secondWriterPool.end()]); });

function fixture() {
  const prefix = "pg-" + randomUUID() + "-";
  const graph = fixtureGraph();
  graph.package = JSON.parse(JSON.stringify(graph.package).replace(/"((?:election|stage|contest|candidate|line)-[^"\\]*)"/g, (_match, id: string) => JSON.stringify(prefix + id)));
  graph.package.election.official_key = prefix + graph.package.election.official_key;
  graph.contest_id = graph.package.contests[0].id;
  for (const authority of graph.policy.authorities) authority.election_key = graph.package.election.official_key;
  return graph;
}

function reviewed(graph: ReturnType<typeof fixture>, suffix = "first") {
  const receipt: Mutable<ApprovedElectionReceipt> = {
    id: graph.package.election.id + "-" + suffix,
    package_sha256: createHash("sha256").update(serializeElectionPackage(graph.package), "utf8").digest("hex"),
    policy_version: graph.policy.version, reviewer: "Synthetic PostgreSQL Reviewer", approval_reference: "synthetic-postgres-proof", verified_at: VERIFIED_AT,
    documents: graph.package.documents.map((document) => ({ id: document.id, sha256: document.sha256,
      locators: [...new Set(graph.package.evidence.flatMap((entry) => (entry.kind === "contest_metadata" ? [entry, ...entry.supporting_sources] : [entry])
        .filter((source) => source.document_id === document.id).map((source) => source.locator)))],
    })),
    contest_inventory: graph.package.contests.map((contest) => ({ contest_id: contest.id,
      candidacy_ids: graph.package.candidacies.filter((candidate) => candidate.contest_id === contest.id).map((candidate) => candidate.id),
      ballot_line_ids: graph.package.ballot_lines.filter((line) => graph.package.candidacies.some((candidate) => candidate.id === line.candidacy_id && candidate.contest_id === contest.id)).map((line) => line.id),
    })),
  };
  return { graph, receipt, options: { policy: graph.policy, approvedReceipts: [receipt], now: () => NOW } };
}

function addIntent(graph: ReturnType<typeof fixture>, value: "declared" | "withdrawn", suffix: string) {
  graph.package.evidence.push(evidence("intent", value, {
    id: graph.package.election.id + "-intent-" + suffix,
    subject: { kind: "candidacy", id: graph.package.candidacies[0].id }, document_id: graph.package.documents[0].id,
  }));
}

describe("PostgreSQL append-only election ledger", () => {
  it("blocks ordinary update, delete and truncate on all eight relations", async () => {
    const { graph, receipt, options } = reviewed(fixture());
    const repository = createElectionRepository(database, options);
    expect((await repository.importReviewedPackage(graph.package, receipt.id)).status).toBe("imported");
    for (const table of ["election", "election_stage", "election_contest", "election_candidacy", "election_ballot_line", "election_import_batch", "election_evidence", "election_evidence_supersession"]) {
      const column = table === "election_import_batch" ? "receipt_id" : table === "election_evidence_supersession" ? "reason" : "id";
      await expect(pool.query(`update ${table} set ${column} = ${column} where false`)).rejects.toThrow("Election history is immutable");
      await expect(pool.query(`delete from ${table} where false`)).rejects.toThrow("Election history is immutable");
      await expect(pool.query(`truncate table ${table} cascade`)).rejects.toThrow("Election history is immutable");
    }
    expect((await repository.readContest(graph.contest_id))?.ledger.evidence).toHaveLength(7);
  });

  it("rolls back a new election when a late relational identity collision is discovered", async () => {
    const original = reviewed(fixture());
    const first = createElectionRepository(database, original.options);
    expect((await first.importReviewedPackage(original.graph.package, original.receipt.id)).status).toBe("imported");
    const graph = fixture();
    const previousId = graph.package.candidacies[1].id;
    graph.package.candidacies[1].id = original.graph.package.candidacies[1].id;
    for (const entry of graph.package.evidence) if (entry.subject.id === previousId) entry.subject.id = graph.package.candidacies[1].id;
    const { receipt, options } = reviewed(graph);
    expect(reviewElectionPackage(graph.package, receipt.id, options).status).toBe("valid");
    expect((await createElectionRepository(database, options).importReviewedPackage(graph.package, receipt.id)).status).toBe("unavailable");
    expect((await pool.query("select count(*)::int as count from election where id = $1", [graph.package.election.id])).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int as count from election_import_batch where package_sha256 = $1", [receipt.package_sha256])).rows[0].count).toBe(0);
    expect((await first.readContest(original.graph.contest_id))?.ledger.evidence).toHaveLength(7);
  });

  it("serializes physical writers on one election row and retains both conflicting assertions", async () => {
    const initial = reviewed(fixture());
    const leftGraph = structuredClone(initial.graph);
    const rightGraph = structuredClone(initial.graph);
    addIntent(leftGraph, "declared", "left");
    addIntent(rightGraph, "withdrawn", "right");
    const left = reviewed(leftGraph, "left");
    const right = reviewed(rightGraph, "right");
    initial.options.approvedReceipts.push(left.receipt, right.receipt);
    const repository = createElectionRepository(database, initial.options);
    expect((await repository.importReviewedPackage(initial.graph.package, initial.receipt.id)).status).toBe("imported");
    const holder = await pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await holder.query("begin");
      await holder.query("select id from election where id = $1 for update", [initial.graph.package.election.id]);
      const leftPid = (await writerPool.query("select pg_backend_pid() as pid")).rows[0].pid as number;
      const rightPid = (await secondWriterPool.query("select pg_backend_pid() as pid")).rows[0].pid as number;
      pending.push(createElectionRepository(drizzle(writerPool, { schema: databaseSchema }), initial.options).importReviewedPackage(leftGraph.package, left.receipt.id));
      pending.push(createElectionRepository(drizzle(secondWriterPool, { schema: databaseSchema }), initial.options).importReviewedPackage(rightGraph.package, right.receipt.id));
      await Promise.all([waitForLock(leftPid), waitForLock(rightPid)]);
      await holder.query("commit");
      expect(await Promise.all(pending)).toEqual([
        { status: "imported", package_sha256: left.receipt.package_sha256 },
        { status: "imported", package_sha256: right.receipt.package_sha256 },
      ]);
    } finally {
      await holder.query("rollback");
      holder.release();
      await Promise.allSettled(pending);
    }
    const graph = await repository.readContest(initial.graph.contest_id, { offset: 0, limit: 1 });
    const view = graph && projectContest(graph, NOW);
    expect(view?.status).toBe("available");
    if (view?.status === "available") expect(view.candidates[0].tracks.intent).toMatchObject({ state: "conflict", assertions: [expect.anything(), expect.anything()] });
  });

  it("reads one repeatable snapshot when another connection commits between graph queries", async () => {
    const initial = reviewed(fixture());
    const changedGraph = structuredClone(initial.graph);
    addIntent(changedGraph, "declared", "later");
    const changed = reviewed(changedGraph, "later");
    initial.options.approvedReceipts.push(changed.receipt);
    const writer = createElectionRepository(database, initial.options);
    expect((await writer.importReviewedPackage(initial.graph.package, initial.receipt.id)).status).toBe("imported");
    const client = await pool.connect();
    let reached!: () => void;
    let release!: () => void;
    const firstRead = new Promise<void>((resolve) => { reached = resolve; });
    const continueRead = new Promise<void>((resolve) => { release = resolve; });
    let paused = false;
    const observedClient = new Proxy(client, { get(target, property) {
      if (property !== "query") return Reflect.get(target, property, target);
      return async (...args: unknown[]) => {
        const result = await Reflect.apply(target.query, target, args);
        const query = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string }).text;
        if (!paused && query?.includes('from "election_contest"')) { paused = true; reached(); await continueRead; }
        return result;
      };
    } });
    // The repository uses only Drizzle transaction/query behavior; this client pins a physical connection for the probe.
    const reader = createElectionRepository(drizzle(observedClient, { schema: databaseSchema }) as unknown as typeof database, initial.options);
    const pending = reader.readContest(initial.graph.contest_id);
    void pending.then(reached, reached);
    try {
      await firstRead;
      expect(paused).toBe(true);
      expect((await writer.importReviewedPackage(changedGraph.package, changed.receipt.id)).status).toBe("imported");
      release();
      expect((await pending)?.ledger.evidence).toHaveLength(7);
      expect((await writer.readContest(initial.graph.contest_id))?.ledger.evidence).toHaveLength(8);
    } finally { release(); await pending.catch(() => undefined); client.release(); }
  });

  it("rejects a foreign-batch opposite edge while the actual election's correction is uncommitted", async () => {
    const own = await correctionFixture();
    const foreign = reviewed(fixture());
    expect((await createElectionRepository(database, foreign.options).importReviewedPackage(foreign.graph.package, foreign.receipt.id)).status).toBe("imported");
    const holder = await pool.connect();
    const contender = await writerPool.connect();
    try {
      await holder.query("begin isolation level read committed");
      expect((await insertCorrection(holder, own.right, own.left, own.receipt.package_sha256)).rowCount).toBe(1);
      await contender.query("begin isolation level read committed");
      await contender.query("set local statement_timeout = '2s'");
      await expect(insertCorrection(contender, own.left, own.right, foreign.receipt.package_sha256)).rejects.toThrow("Election correction batch does not match subject election");
      await contender.query("rollback");
      await holder.query("commit");
      expect((await pool.query("select count(*)::int as count from election_evidence_supersession where replacement_id = any($1::text[])", [[own.left, own.right]])).rows[0].count).toBe(1);
    } finally {
      await Promise.all([holder.query("rollback"), contender.query("rollback")]);
      holder.release(); contender.release();
    }
  });

  it("serializes same-election raw opposite edges at read committed and rejects the cycle", async () => {
    const own = await correctionFixture();
    const holder = await pool.connect();
    const contender = await writerPool.connect();
    let pending: Promise<{ error: unknown }> | undefined;
    try {
      await holder.query("begin isolation level read committed");
      expect((await insertCorrection(holder, own.right, own.left, own.receipt.package_sha256)).rowCount).toBe(1);
      await contender.query("begin isolation level read committed");
      await contender.query("set local statement_timeout = '3s'");
      const pid = (await contender.query("select pg_backend_pid() as pid")).rows[0].pid as number;
      pending = insertCorrection(contender, own.left, own.right, own.receipt.package_sha256).then(() => ({ error: null }), (error: unknown) => ({ error }));
      await waitForLock(pid);
      await holder.query("commit");
      expect((await pending).error).toMatchObject({ message: "Election correction is cyclic" });
      await contender.query("rollback");
      expect((await pool.query("select count(*)::int as count from election_evidence_supersession where replacement_id = any($1::text[])", [[own.left, own.right]])).rows[0].count).toBe(1);
    } finally {
      await holder.query("rollback");
      if (pending) await pending;
      await contender.query("rollback");
      holder.release(); contender.release();
    }
  });

  it("rejects a raw opposite correction from a repeatable snapshot older than a committed edge", async () => {
    const own = await correctionFixture();
    const stale = await writerPool.connect();
    try {
      await stale.query("begin isolation level repeatable read");
      const count = () => stale.query("select count(*)::int as count from election_evidence_supersession where replacement_id = any($1::text[])", [[own.left, own.right]]);
      expect((await count()).rows[0].count).toBe(0);
      expect((await pool.query("insert into election_evidence_supersession(replacement_id,predecessor_id,batch_sha256,reason) values($1,$2,$3,'Synthetic committed correction')", [own.right, own.left, own.receipt.package_sha256])).rowCount).toBe(1);
      expect((await count()).rows[0].count).toBe(0);
      await expect(insertCorrection(stale, own.left, own.right, own.receipt.package_sha256)).rejects.toThrow("Election corrections require read committed");
      await stale.query("rollback");
      expect((await pool.query("select count(*)::int as count from election_evidence_supersession where replacement_id = any($1::text[])", [[own.left, own.right]])).rows[0].count).toBe(1);
    } finally { await stale.query("rollback"); stale.release(); }
  });
});

async function correctionFixture() {
  const graph = fixture();
  addIntent(graph, "declared", "left");
  addIntent(graph, "withdrawn", "right");
  const own = reviewed(graph);
  expect((await createElectionRepository(database, own.options).importReviewedPackage(graph.package, own.receipt.id)).status).toBe("imported");
  return { ...own, left: graph.package.evidence.at(-2)!.id, right: graph.package.evidence.at(-1)!.id };
}

function insertCorrection(client: PoolClient, replacement: string, predecessor: string, batch: string) {
  return client.query("insert into election_evidence_supersession(replacement_id,predecessor_id,batch_sha256,reason) values($1,$2,$3,'Synthetic physical correction')", [replacement, predecessor, batch]);
}

async function waitForLock(pid: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await pool.query("select wait_event_type from pg_stat_activity where pid = $1", [pid])).rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Election writer did not wait for the election row lock");
}
