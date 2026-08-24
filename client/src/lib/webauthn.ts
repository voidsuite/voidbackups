/**
 * WebAuthn client-side helpers.
 * Handles passkey registration and authentication ceremonies.
 */

/** Convert a base64url string to Uint8Array. */
function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i)
  }
  return buffer.buffer
}

/** Convert ArrayBuffer to base64url string. */
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Prepare registration options for the browser. */
export function prepareRegistrationOptions(
  options: PublicKeyCredentialCreationOptionsJSON
): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge as string),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id as string),
    },
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id),
    })),
  } as PublicKeyCredentialCreationOptions
}

/** Prepare authentication options for the browser. */
export function prepareAuthenticationOptions(
  options: PublicKeyCredentialRequestOptionsJSON
): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge as string),
    allowCredentials: options.allowCredentials?.map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id),
    })),
  } as PublicKeyCredentialRequestOptions
}

/** Encode a registration response for sending to the server. */
export function encodeRegistrationResponse(
  credential: PublicKeyCredential
): Record<string, unknown> {
  const attestationResponse = credential.response as AuthenticatorAttestationResponse

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      attestationObject: bufferToBase64url(attestationResponse.attestationObject),
      clientDataJSON: bufferToBase64url(attestationResponse.clientDataJSON),
    },
  }
}

/** Encode an authentication response for sending to the server. */
export function encodeAuthenticationResponse(
  credential: PublicKeyCredential
): Record<string, unknown> {
  const assertionResponse = credential.response as AuthenticatorAssertionResponse

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
      signature: bufferToBase64url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle
        ? bufferToBase64url(assertionResponse.userHandle)
        : undefined,
    },
  }
}
