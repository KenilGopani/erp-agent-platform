import type { OdooRepository } from "../odoo/repository";

export interface ToolDeps {
  repo: OdooRepository;
  now?: () => Date;
}

export const nowOf = (deps: ToolDeps) => (deps.now ?? (() => new Date()))();

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
