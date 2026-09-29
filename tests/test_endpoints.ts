import { getTelephonyEndpoints } from '../src/lib/telephony/telephonyConfig';

console.log('--- Testing Telephony Dual Endpoints Configuration ---');

// Case 1: Local dev fallback
delete process.env.PUBLIC_HTTP_BASE_URL;
delete process.env.PUBLIC_WS_BASE_URL;
delete process.env.PUBLIC_BASE_URL;
delete process.env.TWILIO_AUTH_TOKEN;

const local = getTelephonyEndpoints('localhost:3000', false);
console.log('Local Webhook:', local.webhookUrl);
console.log('Local Stream:', local.streamUrl);
console.log('Local Ready:', local.isReadyForRealTwilio);
console.log('Local Missing:', local.missingConfig);

if (!local.streamUrl.includes(':8080')) throw new Error('Local stream does not point to port 8080');
if (local.streamUrl.includes(':3000')) throw new Error('Local stream incorrectly pointed to port 3000');
if (local.isReadyForRealTwilio !== false) throw new Error('Local dev should not be flagged as ready for real Twilio');

// Case 2: Configured public dual endpoints
process.env.PUBLIC_HTTP_BASE_URL = 'https://app-tunnel.ngrok-free.app';
process.env.PUBLIC_WS_BASE_URL = 'https://ws-tunnel.ngrok-free.app';
process.env.TWILIO_AUTH_TOKEN = 'secret_token_123';

const pub = getTelephonyEndpoints('localhost:3000', false);
console.log('\nPublic Webhook:', pub.webhookUrl);
console.log('Public Stream:', pub.streamUrl);
console.log('Public Ready:', pub.isReadyForRealTwilio);
console.log('Public Missing:', pub.missingConfig);

if (pub.streamUrl !== 'wss://ws-tunnel.ngrok-free.app/api/telephony/twilio-stream') {
  throw new Error(`Public stream URL wrong: got ${pub.streamUrl}`);
}
if (pub.webhookUrl !== 'https://app-tunnel.ngrok-free.app/api/telephony/twilio/voice') {
  throw new Error(`Public webhook URL wrong: got ${pub.webhookUrl}`);
}
if (!pub.isReadyForRealTwilio) {
  throw new Error('Public configuration with all keys should be flagged ready for real Twilio');
}

console.log('\n✅ ALL ENDPOINT CONFIGURATION TESTS PASSED!');
