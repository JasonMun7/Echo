"use client";

import { useEffect, type MutableRefObject } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { toast } from "sonner";

import { PENDING_VAULT_KEY } from "../_lib/integration-types";

const VAULT_IDS = ["slack", "github", "google"] as const;

export function useIntegrationsOAuthParams(
  searchParams: ReadonlyURLSearchParams,
  options: {
    loadIntegrations: () => Promise<void>;
    connectVaultIntegration: (id: string) => Promise<void>;
    pendingVaultHandledRef: MutableRefObject<boolean>;
  }
) {
  const { loadIntegrations, connectVaultIntegration, pendingVaultHandledRef } =
    options;

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const al = searchParams.get("auth0_linked");
    const vaultExchangeOk = searchParams.get("vault_exchange_ok");
    const vaultExchangeDetail = searchParams.get("vault_exchange_detail");

    if (al !== "1") {
      pendingVaultHandledRef.current = false;
    }

    if (connected) {
      toast.success(`${connected} connected successfully!`);
      void loadIntegrations();
    }

    if (vaultExchangeOk === "0") {
      const hint = vaultExchangeDetail
        ? decodeURIComponent(vaultExchangeDetail.replace(/\+/g, " "))
        : null;
      toast.error(
        hint
          ? `Token Vault could not verify this connection: ${hint}`
          : "Token Vault could not verify this connection. Check Auth0 (Connected Accounts, Offline Access for Google, Grant Types) and try Connect again."
      );
      void loadIntegrations();
    } else if (vaultExchangeOk === "1") {
      toast.success("Integration connected — Token Vault verified.");
      void loadIntegrations();
    } else if (al === "1") {
      const pending = sessionStorage.getItem(PENDING_VAULT_KEY);
      if (pending && VAULT_IDS.includes(pending as (typeof VAULT_IDS)[number])) {
        toast.success("Auth0 linked. Opening provider sign-in…");
      } else {
        toast.success("Auth0 linked for integrations (Token Vault).");
      }
      void loadIntegrations().then(() => {
        if (pendingVaultHandledRef.current) return;
        const p = sessionStorage.getItem(PENDING_VAULT_KEY);
        if (p && VAULT_IDS.includes(p as (typeof VAULT_IDS)[number])) {
          pendingVaultHandledRef.current = true;
          sessionStorage.removeItem(PENDING_VAULT_KEY);
          void connectVaultIntegration(p);
        }
      });
    }

    if (error) {
      const rawDesc = searchParams.get("error_description");
      const desc = rawDesc ? rawDesc.replace(/\+/g, " ") : "";
      if (error === "access_denied") {
        toast.error(
          desc
            ? `Access denied: ${desc}`
            : "Access denied. In Auth0, enable this app on the social connection (Applications tab)."
        );
      } else if (
        error === "invalid_request" &&
        /connection is not enabled/i.test(desc)
      ) {
        toast.error(
          "Auth0: connection not enabled for this app. Enable your Echo app on Authentication → Social → the provider. Set AUTH0_CONNECTION_* if you use custom connection names."
        );
      } else if (
        error === "invalid_request" &&
        /not active for authentication/i.test(desc)
      ) {
        toast.error(
          "Auth0: enable Authentication on that connection for legacy Connect, or keep My Account Connect (default; do not set AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0). See README."
        );
      } else if (
        error === "invalid_request" &&
        /not authorized to access resource server/i.test(desc)
      ) {
        toast.error(
          "Auth0: backend AUTH0_AUDIENCE must match an API Identifier, and Applications → your app → APIs must authorize that API. Fix in Auth0 Dashboard or env; see README."
        );
      } else {
        toast.error(
          desc ? `OAuth error (${error}): ${desc}` : `OAuth error: ${error}`
        );
      }
    }
  }, [
    searchParams,
    loadIntegrations,
    connectVaultIntegration,
    pendingVaultHandledRef,
  ]);
}
