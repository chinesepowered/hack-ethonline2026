/**
 * Revoke a service subname: the namespace admin keeps ROLE_UNREGISTER on the root
 * resource of its own registry, so a misbehaving service can be delisted at any time.
 * Usage: pnpm ens:revoke api
 */
import { labelId, loadEnsDeployment, userRegistryAbi } from "@rugradar/shared";
import { admin, sendAndWait } from "./clients.ts";

const label = process.argv[2];
if (!label) throw new Error("usage: pnpm ens:revoke <label>");
const deployment = loadEnsDeployment();
if (!deployment) throw new Error("No namespace yet — run pnpm ens:deploy first");
const { wallet } = admin();
await sendAndWait(`unregister ${label}.${deployment.parentName}`, wallet.writeContract({ address: deployment.userRegistry, abi: userRegistryAbi, functionName: "unregister", args: [labelId(label)] }));
console.log("✓ revoked; the name no longer resolves and can be re-registered by the admin.");
