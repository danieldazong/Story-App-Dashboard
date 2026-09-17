export {};

/**
 * Operator roles live in Clerk `publicMetadata` and are surfaced on the
 * session token via a custom claim (configured in the Clerk Dashboard under
 * Sessions → Customize session token as `{"metadata": "{{user.public_metadata}}"}`).
 *
 * Roles are never stored in Postgres as a source of truth — RLS reads them
 * from the JWT. See AGENTS.md, Clerk Rules.
 */
export type Roles = "admin";

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: Roles;
    };
  }
}
