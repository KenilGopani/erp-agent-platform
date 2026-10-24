const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "odoo",
        "seed",
        "tools",
        "agents",
        "quoting",
        "procurement",
        "guardrails",
        "models",
        "db",
        "workflow",
        "approval",
        "observability",
        "ui",
        "api",
        "evals",
        "infra",
        "deps",
        "repo",
        "env",
        "readme",
      ],
    ],
    "subject-case": [2, "never", ["upper-case", "pascal-case", "start-case"]],
    "header-max-length": [2, "always", 72],
  },
};

export default config;
