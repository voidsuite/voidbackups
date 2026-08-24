/**
 * WebAuthn server-side helpers.
 * Handles registration and authentication ceremony logic.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server"
import config from "../config.js"
import {
  createUser,
  getUserByCredentialId,
  storeChallenge,
  takeChallenge,
  type StoredUser,
} from "../db/webauthn.js"

const RP_NAME = config.rpName
const RP_ID = config.rpID

// --- Helpers for Uint8Array ↔ base64url ---

function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64urlToBuffer(base64url: string): Uint8Array {
  // Handle old JSON-stringified Uint8Array format ({"0":72,"1":101,...})
  if (base64url.startsWith("{")) {
    try {
      const obj = JSON.parse(base64url)
      if (typeof obj === "object" && obj !== null && "0" in obj) {
        const values = Object.values(obj).map(Number)
        return new Uint8Array(values)
      }
    } catch {}
  }
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i)
  }
  return buffer
}

// --- Registration ---

export async function startRegistration(userName: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "discouraged",
    },
  })

  // Store the challenge for verification later
  storeChallenge(options.challenge, "registration")

  return options
}

export async function completeRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  userName: string
): Promise<StoredUser> {
  const storedChallenge = takeChallenge(expectedChallenge)
  if (!storedChallenge) {
    console.error("[webauthn] registration failed: challenge not found or expired")
    throw new Error("Challenge expired or not found — please try again")
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: storedChallenge.challenge,
    expectedOrigin: config.appUrl,
    expectedRPID: RP_ID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registration verification failed")
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  // Generate a user ID
  const userId = crypto.randomUUID()

  // Store the credential — public key as base64url (not JSON.stringify of Uint8Array)
  const user = createUser({
    id: userId,
    credentialId: credential.id,
    publicKey: bufferToBase64url(credential.publicKey),
    counter: credential.counter,
    name: userName,
  })

  return user
}

// --- Authentication ---

export async function startAuthentication(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "discouraged",
  })

  // Store the challenge for verification later
  storeChallenge(options.challenge, "authentication")

  return options
}

export async function completeAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string
): Promise<StoredUser> {
  // Build list of acceptable origins — always include the configured appUrl
  const origins = [config.appUrl]
  // If appUrl is https, also accept http variant (for dev/reverse-proxy scenarios)
  if (config.appUrl.startsWith("https://")) {
    origins.push(config.appUrl.replace("https://", "http://"))
  }

  // Look up the credential
  const credentialId = response.id
  const user = getUserByCredentialId(credentialId)

  if (!user) {
    console.error("[webauthn] login failed: unknown credential ID:", credentialId)
    throw new Error("Unknown credential — have you registered a passkey?")
  }

  const storedChallenge = takeChallenge(expectedChallenge)
  if (!storedChallenge) {
    console.error("[webauthn] login failed: challenge not found or expired for:", expectedChallenge.slice(0, 16) + "...")
    throw new Error("Challenge expired or not found — please try again")
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: origins[0],
      expectedRPID: RP_ID,
      credential: {
        id: user.credential_id,
        publicKey: base64urlToBuffer(user.public_key),
        counter: user.counter,
        transports: ["internal"] as AuthenticatorTransportFuture[],
      },
    })

    if (!verification.verified) {
      console.error("[webauthn] login failed: verification returned false")
      throw new Error("Authentication verification failed")
    }

    // Update the counter to prevent replay attacks
    const newCounter = verification.authenticationInfo.newCounter
    // We'll update the counter in the session handler

    return user
  } catch (err) {
    // Log the actual error for debugging
    console.error("[webauthn] login verification error:", err)
    throw err
  }
}
