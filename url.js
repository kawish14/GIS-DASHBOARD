const RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};

/* Public IP and Port */
const api = RUNTIME_CONFIG.API// API URL
const authenticate =  RUNTIME_CONFIG.AUTHENTICATE// Login URL
const Realtime = RUNTIME_CONFIG.Realtime

export {api,authenticate, Realtime}