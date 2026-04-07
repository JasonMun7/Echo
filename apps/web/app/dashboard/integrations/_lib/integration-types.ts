export const PENDING_VAULT_KEY = "echo_pending_vault_integration";

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  oauth: boolean;
  connected: boolean;
  account_name?: string;
  connected_at?: unknown;
  note?: string;
  token_vault?: boolean;
}
