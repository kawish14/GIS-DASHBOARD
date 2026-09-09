/**
 * Backend endpoints, read from window.RUNTIME_CONFIG.
 *
 * Set by public/config.js, which index.html loads as a plain script before the
 * bundle -- so the deployed build can be pointed at a different environment by
 * editing that one file, with no rebuild.
 *
 *   api           GeoServer / feature services
 *   authenticate  login, session and user administration
 *   Realtime      socket.io server and the symbology config
 *   supportUrl    service-desk / SR portal, for users without an account
 *   supportEmail  fallback contact when supportUrl is not set
 */
const RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};

/* Public IP and Port */
const api = RUNTIME_CONFIG.API// API URL
const authenticate =  RUNTIME_CONFIG.AUTHENTICATE// Login URL
const Realtime = RUNTIME_CONFIG.Realtime

/* Where to send someone who has no account yet. Both optional. */
const supportUrl = RUNTIME_CONFIG.SUPPORT_URL || ""
const supportEmail = RUNTIME_CONFIG.SUPPORT_EMAIL || ""

export {api, authenticate, Realtime, supportUrl, supportEmail}