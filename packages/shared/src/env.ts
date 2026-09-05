import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root = two levels up from packages/shared/src
const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../../..");

config({ path: resolve(REPO_ROOT, ".env"), quiet: true });

export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var ${name} (see .env.example)`);
}

export function envOptional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export interface EnsDeployment {
  parentLabel: string;
  parentName: string;
  userRegistry: `0x${string}`;
  resolver: `0x${string}`;
  deployBlock: number;
  admin: `0x${string}`;
  chainId: number;
}

/** ENS deployment written by `pnpm ens:deploy`; env vars override file values. */
export function loadEnsDeployment(): EnsDeployment | undefined {
  const file = resolve(REPO_ROOT, "ens.deployment.json");
  let fromFile: Partial<EnsDeployment> = {};
  if (existsSync(file)) {
    fromFile = JSON.parse(readFileSync(file, "utf8")) as Partial<EnsDeployment>;
  }
  const parentLabel = envOptional("ENS_PARENT_LABEL") ?? fromFile.parentLabel;
  const userRegistry = (envOptional("ENS_USER_REGISTRY") ?? fromFile.userRegistry) as `0x${string}` | undefined;
  const resolver = (envOptional("ENS_RESOLVER") ?? fromFile.resolver) as `0x${string}` | undefined;
  const deployBlock = Number(envOptional("ENS_DEPLOY_BLOCK") ?? fromFile.deployBlock ?? 0);
  if (!parentLabel || !userRegistry || !resolver) return undefined;
  return {
    parentLabel,
    parentName: `${parentLabel}.eth`,
    userRegistry,
    resolver,
    deployBlock,
    admin: (fromFile.admin ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    chainId: fromFile.chainId ?? 11155111,
  };
}
