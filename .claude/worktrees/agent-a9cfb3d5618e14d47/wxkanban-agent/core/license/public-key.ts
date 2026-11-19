// Ed25519 PUBLIC verification key for entitlement tokens (Phase 1B).
// The matching PRIVATE key lives only on the hosted MCP server
// (env ENTITLEMENT_PRIVATE_KEY_B64). Shipping only the public key means a
// customer cannot forge an "active" token offline.
export const ENTITLEMENT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAcHvvPsAtGUjrdaQ3Iv+O7qeZRJfRfMU7/MZmoFtKqJU=
-----END PUBLIC KEY-----
`;
