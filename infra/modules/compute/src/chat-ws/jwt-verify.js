// Singleton del verifier de Cognito JWT. La instancia cachea el JWKS del
// User Pool entre invocaciones (módulo-level scope sobrevive a la Lambda
// caliente), evitando un round-trip a Cognito en cada invocación.

const { CognitoJwtVerifier } = require("aws-jwt-verify");

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;

if (!USER_POOL_ID || !CLIENT_ID) {
  throw new Error(
    "COGNITO_USER_POOL_ID y COGNITO_APP_CLIENT_ID son requeridos",
  );
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: "id",         // ID token, no access token (necesitamos claims name + email)
  clientId: CLIENT_ID,
});

// Devuelve los claims si el token es válido; tira error si no.
async function verifyIdToken(token) {
  if (!token) throw new Error("missing token");
  return await verifier.verify(token);
}

module.exports = { verifyIdToken };
