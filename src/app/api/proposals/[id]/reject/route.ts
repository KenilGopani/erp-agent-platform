import { getServices } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/reject">) {
  const { id } = await ctx.params;
  return getServices().api.reject(id, req);
}
