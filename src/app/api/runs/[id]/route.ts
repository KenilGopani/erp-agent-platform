import { getServices } from "@/lib/server/services";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  return getServices().api.getRun(id);
}
