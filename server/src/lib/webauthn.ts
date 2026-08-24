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

// In-memory challenge cache is NOT used — challenges are persisted in SQLite.

// --- Registration ---

export async function startRegistration(userName: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
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
  const expectedOrigin = config.appUrl

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: RP_ID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registration verification failed")
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  // Generate a user ID
  const userId = crypto.randomUUID()

  // Store the credential
  const user = createUser({
    id: userId,
    credentialId: credential.id,
    publicKey: JSON.stringify(credential.publicKey),
    counter: credential.counter,
    name: userName,
  })

  return user
}

// --- Authentication ---

export async function startAuthentication(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
  })

  // Store the challenge for verification later
  storeChallenge(options.challenge, "authentication")

  return options
}

export async function completeAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string
): Promise<StoredUser> {
  const expectedOrigin = config.appUrl

  // Look up the credential
  const credentialId = response.id
  const user = getUserByCredentialId(credentialId)

  if (!user) {
    throw new Error("Unknown credential")
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID: RP_ID,
    credential: {
      id: user.credential_id,
      publicKey: JSON.parse(user.public_key) as Uint8Array,
      counter: user.counter,
      transports: ["internal"] as AuthenticatorTransportFuture[],
    },
  })

  if (!verification.verified) {
    throw new Error("Authentication verification failed")
  }

  // Update the counter to prevent replay attacks
  const newCounter = verification.authenticationInfo.newCounter
  // We'll update the counter in the session handler

  return user
}
