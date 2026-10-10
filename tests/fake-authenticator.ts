/**
 * A pretend passkey for tests: a P-256 key pair that answers registration and sign-in the way a
 * phone's authenticator would (no attestation, user present and verified). It lets the server's
 * passkey checks run for real without a browser.
 */
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest();

// Flags: user present (0x01), user verified (0x04), attested credential data (0x40).
const UP_UV = 0x05;
const UP_UV_AT = 0x45;

export function fakeAuthenticator(origin: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialId = randomBytes(16);
  let counter = 0;

  function authData(rpID: string, flags: number, extra: Uint8Array = new Uint8Array()) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    return Buffer.concat([sha256(rpID), Buffer.from([flags]), count, extra]);
  }

  function clientData(type: string, challenge: string, from = origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: from, crossOrigin: false }));
  }

  return {
    credentialId: b64url(credentialId),

    /** Answers navigator.credentials.create(). */
    create(
      options: PublicKeyCredentialCreationOptionsJSON,
      from = origin,
    ): RegistrationResponseJSON {
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x!, "base64url")],
          [-3, Buffer.from(jwk.y!, "base64url")],
        ]),
      );
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(credentialId.length);
      const attested = Buffer.concat([Buffer.alloc(16), idLength, credentialId, cose]);
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Map<never, never> | Uint8Array>([
          ["fmt", "none"],
          ["attStmt", new Map<never, never>()],
          ["authData", authData(options.rp.id!, UP_UV_AT, attested)],
        ]),
      );
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientData("webauthn.create", options.challenge, from)),
          attestationObject: b64url(attestationObject),
          transports: ["internal", "hybrid"],
        },
      };
    },

    /** Answers navigator.credentials.get(). Each answer counts up, as real authenticators do. */
    get(options: PublicKeyCredentialRequestOptionsJSON, from = origin): AuthenticationResponseJSON {
      counter += 1;
      const data = authData(options.rpId!, UP_UV);
      const client = clientData("webauthn.get", options.challenge, from);
      const signature = createSign("SHA256")
        .update(Buffer.concat([data, sha256(client)]))
        .sign(privateKey);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(client),
          authenticatorData: b64url(data),
          signature: b64url(signature),
        },
      };
    },
  };
}
