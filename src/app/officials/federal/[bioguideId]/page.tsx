import { notFound } from "next/navigation";

import { FederalProfile } from "@/components/federal-profile";
import { createDatabase } from "@/db";
import { fetchCongressRoster } from "@/lib/congress-gov";
import {
  createFederalOfficialCacheRepository,
  createFederalOfficialsService,
} from "@/lib/federal-officials-service";
import { fetchCurrentHouseVacancies } from "@/lib/house-clerk-vacancy";

const bioguidePattern = /^[A-Z][0-9]{6}$/;

export default async function FederalOfficialProfilePage({
  params,
}: Readonly<{ params: Promise<{ bioguideId: string }> }>) {
  const { bioguideId } = await params;
  if (!bioguidePattern.test(bioguideId)) {
    notFound();
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    notFound();
  }
  const cache = createFederalOfficialCacheRepository(
    await createDatabase(connectionString),
  );
  const service = createFederalOfficialsService({
    cache,
    environment: {
      CONGRESS_GOV_API_KEY: process.env.CONGRESS_GOV_API_KEY,
    },
    fetch: globalThis.fetch,
    fetchCongressRoster,
    fetchCurrentHouseVacancies,
    now: () => new Date(),
  });
  const result = await service.getProfile(bioguideId);
  if (result.status === "unavailable") {
    notFound();
  }

  return (
    <main id="main-content">
      <FederalProfile result={result} />
    </main>
  );
}
