import { ElectionContest } from "@/components/elections";
import { getRuntimeElectionService } from "@/lib/election-service";
import styles from "@/components/elections.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContestPage({ params, searchParams }: {
  params: Promise<{ contestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contestId } = await params;
  const history = (await searchParams)?.history;
  const offset = history === undefined ? 0 : typeof history === "string" && /^\d+$/.test(history) ? Number(history) : NaN;
  if (!Number.isSafeInteger(offset) || offset < 0) return <main className={styles.page} id="main-content"><ElectionContest result={{ status: "missing" }} /></main>;
  const service = await getRuntimeElectionService();
  const result = service ? await service.getContest(contestId, { offset, limit: 100 }) : { status: "unavailable" as const };
  return <main className={styles.page} id="main-content"><ElectionContest result={result} /></main>;
}
