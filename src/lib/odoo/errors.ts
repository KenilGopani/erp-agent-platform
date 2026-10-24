/** Odoo replied with an application-level error (access denied, validation, ...). Never retried. */
export class OdooError extends Error {
  constructor(
    message: string,
    readonly odooName?: string,
    readonly debug?: string,
  ) {
    super(message);
    this.name = "OdooError";
  }
}

/** Network failure, timeout or 5xx. Safe to retry for idempotent calls. */
export class OdooTransportError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OdooTransportError";
  }
}

export class OdooAuthError extends OdooError {
  constructor(message = "Odoo authentication failed") {
    super(message);
    this.name = "OdooAuthError";
  }
}
