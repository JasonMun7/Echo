export interface Integration {
  id: string;
  name: string;
  /** Short user-facing line (preferred over long `description` in the UI). */
  tagline?: string;
  description: string;
  icon: string;
  oauth: boolean;
  connected: boolean;
  /** When the backend can reach Composio: whether an ACTIVE connected account exists for this toolkit. */
  composio_account_active?: boolean | null;
  account_name?: string;
  connected_at?: unknown;
  note?: string;
}
