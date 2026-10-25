import { getServices } from "@/lib/server/services";

export async function POST(req: Request, ctx: RouteContext<"/api/proposals/[id]/reject">) {
  const { id } = await ctx.params;
  return getServices().api.reject(id, req);
}
