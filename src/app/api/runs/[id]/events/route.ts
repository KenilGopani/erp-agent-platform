import { getServices } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/runs/[id]/events">) {
  const { id } = await ctx.params;
  return getServices().api.events(id, req);
}
