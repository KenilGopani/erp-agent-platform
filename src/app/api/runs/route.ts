import { getServices } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export const GET = () => getServices().api.listRuns();
export const POST = (req: Request) => getServices().api.createRun(req);
