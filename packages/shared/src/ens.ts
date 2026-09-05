/**
 * ENSv2 (Sepolia beta) constants, role bitmaps and ABI fragments.
 * Addresses: https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta
 * Contracts: https://github.com/ensdomains/contracts-v2 (not final; may change)
 */
import { keccak256, namehash, parseAbi, stringToBytes, toHex } from "viem";
import { packetToBytes } from "viem/ens";

export const ENSV2_SEPOLIA = {
  chainId: 11155111,
  rootRegistry: "0x8115186e8f2e0b0281e86ab91f0f48ba90364354",
  ethRegistry: "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2",
  ethRegistrar: "0xa88553f454b77203b0d036a05c894d555eaaa2cc",
  mockUsdc: "0x768f42455a2d082e23ceef7d51e5787c82d67a39",
  verifiableFactory: "0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef",
  userRegistryImpl: "0x624a25d67b59d587752ebec8dded8827dae52050",
  permissionedResolverImpl: "0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e",
  /** Same address on mainnet and Sepolia; what ENS libraries ship as canonical. */
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  universalResolverV2: "0x4a1817d13e9cf196f471725176355c1234b63c70",
} as const;

// ── Enhanced Access Control role bitmaps (RegistryRolesLib / PermissionedResolverLib) ──
const ADMIN = (r: bigint) => r << 128n;

export const REGISTRY_ROLES = {
  REGISTRAR: 1n << 0n,
  REGISTER_RESERVED: 1n << 4n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
  SET_URI: 1n << 36n,
  CAN_NAME: 1n << 120n,
  UPGRADE: 1n << 124n,
} as const;

export const RESOLVER_ROLES = {
  SET_ADDR: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_CONTENTHASH: 1n << 8n,
  SET_PUBKEY: 1n << 12n,
  SET_ABI: 1n << 16n,
  SET_INTERFACE: 1n << 20n,
  SET_NAME: 1n << 24n,
  SET_ALIAS: 1n << 28n,
  CLEAR: 1n << 32n,
  SET_DATA: 1n << 36n,
  CAN_NAME: 1n << 120n,
  UPGRADE: 1n << 124n,
} as const;

const withAdmin = (roles: bigint[]) => roles.reduce((acc, r) => acc | r | ADMIN(r), 0n);

/** Everything the namespace admin needs on its own UserRegistry root. */
export const REGISTRY_ADMIN_BITMAP = withAdmin([
  REGISTRY_ROLES.REGISTRAR,
  REGISTRY_ROLES.REGISTER_RESERVED,
  REGISTRY_ROLES.SET_PARENT,
  REGISTRY_ROLES.UNREGISTER,
  REGISTRY_ROLES.RENEW,
  REGISTRY_ROLES.SET_SUBREGISTRY,
  REGISTRY_ROLES.SET_RESOLVER,
  REGISTRY_ROLES.SET_URI,
  REGISTRY_ROLES.UPGRADE,
]) | REGISTRY_ROLES.CAN_TRANSFER_ADMIN;

/** Everything the admin needs on its own PermissionedResolver root. */
export const RESOLVER_ADMIN_BITMAP = withAdmin([
  RESOLVER_ROLES.SET_ADDR,
  RESOLVER_ROLES.SET_TEXT,
  RESOLVER_ROLES.SET_CONTENTHASH,
  RESOLVER_ROLES.SET_PUBKEY,
  RESOLVER_ROLES.SET_ABI,
  RESOLVER_ROLES.SET_INTERFACE,
  RESOLVER_ROLES.SET_NAME,
  RESOLVER_ROLES.SET_ALIAS,
  RESOLVER_ROLES.CLEAR,
  RESOLVER_ROLES.SET_DATA,
  RESOLVER_ROLES.UPGRADE,
]);

/**
 * What a *service* gets on its own subname: it may change its resolver and renew,
 * but it gets NO ROLE_CAN_TRANSFER_ADMIN, so the name is non-transferable, and the
 * admin keeps ROLE_UNREGISTER on the root, so it is revocable. Expiry makes it expiring.
 */
export const SERVICE_SUBNAME_BITMAP = REGISTRY_ROLES.SET_RESOLVER | REGISTRY_ROLES.RENEW;

// ── ABI fragments ──
export const verifiableFactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);

export const userRegistryAbi = parseAbi([
  "function initialize(address rootAccount, uint256 roleBitmap)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId)",
  "function renew(uint256 anyId, uint64 newExpiry)",
  "function unregister(uint256 anyId)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function grantRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function revokeRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
  "event LabelUnregistered(uint256 indexed tokenId, address indexed sender)",
  "event SubregistryUpdated(uint256 indexed tokenId, address indexed subregistry, address indexed sender)",
  "event ResolverUpdated(uint256 indexed tokenId, address indexed resolver, address indexed sender)",
]);

export const permissionedResolverAbi = parseAbi([
  "function initialize(address admin, uint256 roleBitmap, bytes[] setters)",
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
  "function setAddr(bytes32 node, address addr_)",
  "function addr(bytes32 node) view returns (address)",
  "function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool updated)",
  "function authorizeAddrRoles(bytes toName, uint256 coinType, address account, bool grant) returns (bool updated)",
  "function authorizeNameRoles(bytes toName, uint256 roleBitmap, address account, bool grant) returns (bool updated)",
  "function setAlias(bytes fromName, bytes toName)",
  "function clearRecords(bytes32 node)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
]);

export const ethRegistrarAbi = parseAbi([
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MAX_COMMITMENT_AGE() view returns (uint64)",
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);

export const mockUsdcAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export const ethRegistryAbi = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function setResolver(uint256 anyId, address resolver)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
]);

// ── helpers ──
/** ENSv2 "anyId" for a label = uint256(keccak256(label)) (LibLabel.id). */
export const labelId = (label: string): bigint => BigInt(keccak256(stringToBytes(label)));
export const nodeOf = (name: string): `0x${string}` => namehash(name);
/** DNS-encoded name bytes, what PermissionedResolver.authorize*Roles expects. */
export const dnsName = (name: string): `0x${string}` => toHex(packetToBytes(name));

/**
 * Text record keys published for services and agents.
 * `agent-context` and `agent-endpoint[<protocol>]` follow ENSIP-26 (Agent Text Records);
 * `x402.*` / `hcs.*` / `erc8004.*` are this project's namespaced keys.
 */
export const RECORD_KEYS = {
  agentContext: "agent-context",
  endpointX402: "agent-endpoint[x402]",
  endpointWeb: "agent-endpoint[web]",
  x402Network: "x402.network",
  x402PayTo: "x402.payTo",
  x402Assets: "x402.assets",
  x402Catalog: "x402.catalog",
  x402Pricing: "x402.pricing",
  hcsAudit: "hcs.audit",
  hederaAccount: "hedera.account",
  erc8004Registration: "erc8004.registration",
} as const;

export const SERVICE_RECORD_KEYS: string[] = [
  RECORD_KEYS.agentContext,
  RECORD_KEYS.endpointX402,
  RECORD_KEYS.endpointWeb,
  RECORD_KEYS.x402Network,
  RECORD_KEYS.x402PayTo,
  RECORD_KEYS.x402Assets,
  RECORD_KEYS.x402Catalog,
  RECORD_KEYS.x402Pricing,
  RECORD_KEYS.hcsAudit,
  RECORD_KEYS.hederaAccount,
  RECORD_KEYS.erc8004Registration,
];
