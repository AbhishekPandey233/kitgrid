const env = require('../config/env');

const RP_NAME = env.webauthnRpName;
const RP_ID = env.webauthnRpId;
const ORIGIN = env.frontendOrigin;

function credentialToDescriptor(cred) {
  return { id: cred.credentialID, transports: cred.transports };
}

function toStoredCredential({ id, publicKey, counter }) {
  return { credentialID: id, publicKey: Buffer.from(publicKey).toString('base64'), counter };
}

function toLibraryCredential(stored) {
  return {
    id: stored.credentialID,
    publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
    counter: stored.counter,
    transports: stored.transports,
  };
}

module.exports = { RP_NAME, RP_ID, ORIGIN, credentialToDescriptor, toStoredCredential, toLibraryCredential };
