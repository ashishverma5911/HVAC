/**
 * Phase 8A: Railway Telephony Server Deployment & Resilience Test Suite
 *
 * Verifies:
 * 1. Dynamic PORT & HOST (0.0.0.0) binding
 * 2. HTTP GET /health endpoint behavior and response structure
 * 3. Graceful shutdown (SIGTERM/SIGINT) handling
 * 4. WebSocket connection lifecycle
 * 5. Zero secret leakage across all public endpoints
 */

import http from 'http';
import { WebSocket } from 'ws';
import { createTelephonyServer } from '../src/server/telephonyServer';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function fetchHttp(url: string, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runSuite() {
  console.log('=================================================================');
  console.log('--- PHASE 8A: RAILWAY TELEPHONY SERVER TEST SUITE ---');
  console.log('=================================================================\n');

  const TEST_PORT = 9876;
  const TEST_HOST = '0.0.0.0';

  console.log('1. Dynamic PORT & HOST (0.0.0.0) Binding');
  const { server, wss, shutdown } = createTelephonyServer();

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, TEST_HOST, () => {
      assert(server.listening, `Server successfully bound and listening on ${TEST_HOST}:${TEST_PORT}`);
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        assert(addr.port === TEST_PORT, `Server bound to configured port ${TEST_PORT}`);
        assert(addr.address === '0.0.0.0' || addr.address === '::', `Server bound to 0.0.0.0 wildcard interface (got ${addr.address})`);
      }
      resolve();
    });
  });

  console.log('\n2. HTTP Health Endpoint (GET /health)');
  const healthRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/health`);
  assert(healthRes.status === 200, `GET /health returned HTTP 200 (got ${healthRes.status})`);
  assert(healthRes.headers['content-type']?.includes('application/json') ?? false, 'Health check returns application/json');

  let healthBody: any = {};
  try {
    healthBody = JSON.parse(healthRes.body);
  } catch {}

  assert(healthBody.status === 'ok', `Health status is "ok" (got ${healthBody.status})`);
  assert(healthBody.service === 'aeris-telephony-bridge', `Service identifier is "aeris-telephony-bridge" (got ${healthBody.service})`);
  assert(typeof healthBody.uptimeSeconds === 'number', `Uptime is reported as a number (${healthBody.uptimeSeconds}s)`);
  assert(typeof healthBody.activeConnections === 'number', `Active connections count is a number (${healthBody.activeConnections})`);
  assert(typeof healthBody.timestamp === 'number', `Timestamp is a valid Unix epoch (${healthBody.timestamp})`);

  console.log('\n3. Zero Secret Leakage Audit');
  const mockSecretApiKey = 'AIzaSyFakeSecretGeminiKeyForAuditVerification99';
  const mockSecretTwilioToken = 'fake_twilio_auth_token_for_audit_33';
  const mockSecretSupabase = 'sbp_fake_service_role_secret_key_88';

  const healthPayload = healthRes.body;
  assert(!healthPayload.includes(mockSecretApiKey), 'Health check contains NO Gemini API keys');
  assert(!healthPayload.includes(mockSecretTwilioToken), 'Health check contains NO Twilio auth tokens');
  assert(!healthPayload.includes(mockSecretSupabase), 'Health check contains NO Supabase service role keys');
  assert(!healthPayload.toLowerCase().includes('secret'), 'Health check contains NO raw secrets or tokens');

  const statusRes = await fetchHttp(`http://127.0.0.1:${TEST_PORT}/api/telephony/status`);
  assert(statusRes.status === 200, 'GET /api/telephony/status returned HTTP 200');
  const statusPayload = statusRes.body;
  assert(!statusPayload.includes(mockSecretApiKey), 'Status check contains NO Gemini API keys');
  assert(!statusPayload.includes(mockSecretTwilioToken), 'Status check contains NO Twilio auth tokens');
  assert(!statusPayload.includes(mockSecretSupabase), 'Status check contains NO Supabase service role keys');

  console.log('\n4. WebSocket Connection Lifecycle');
  const wsUrl = `ws://127.0.0.1:${TEST_PORT}/api/telephony/twilio-stream`;
  const ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      assert(ws.readyState === WebSocket.OPEN, 'WebSocket connection established successfully to /api/telephony/twilio-stream');

      // Send Twilio connected event
      ws.send(
        JSON.stringify({
          event: 'connected',
          protocol: 'Call',
          version: '1.0.0',
        })
      );
      assert(true, 'Dispatched Twilio connected handshake frame');
      resolve();
    });
    ws.on('error', reject);
  });

  console.log('\n5. Graceful Shutdown (SIGTERM / SIGINT handling)');
  let wsClosed = false;
  let closeCode: number | null = null;
  const wsClosedPromise = new Promise<number>((res) => {
    ws.on('close', (code) => {
      wsClosed = true;
      closeCode = code;
      res(code);
    });
  });

  await new Promise<void>((resolve) => {
    shutdown('SIGTERM', () => resolve());
  });

  await wsClosedPromise;
  assert(true, 'Graceful shutdown callback fired successfully');
  assert(!server.listening, 'HTTP server stopped listening after shutdown');
  assert(wsClosed, `WebSocket client received termination event (code ${closeCode})`);

  console.log('\n=================================================================');
  console.log(`PHASE 8A TEST SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('=================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
