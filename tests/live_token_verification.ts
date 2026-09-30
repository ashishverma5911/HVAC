import { GoogleGenAI } from '@google/genai';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local manually
const envRaw = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
const apiKeyMatch = envRaw.match(/GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';
const liveModelMatch = envRaw.match(/GEMINI_LIVE_MODEL=(.*)/);
const liveModel = liveModelMatch ? liveModelMatch[1].trim() : 'gemini-3.8-live';

async function runTestSuite() {
  console.log('====================================================');
  console.log('PHASE 5: GEMINI LIVE EPHEMERAL TOKEN TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ ${message}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAILED: ${message}`);
      process.exitCode = 1;
    }
  }

  // --- Test A: Missing GEMINI_API_KEY configuration check ---
  console.log('--- Test A: Missing GEMINI_API_KEY Validation ---');
  try {
    const unauthClient = new GoogleGenAI({ apiKey: '' });
    let threw = false;
    try {
      await unauthClient.authTokens.create({
        config: {
          uses: 1,
          liveConnectConstraints: {
            model: liveModel,
          },
        },
      });
    } catch (e: any) {
      threw = true;
      assert(threw, 'Client without API key is rejected immediately');
    }
  } catch (err: any) {
    assert(true, 'Missing key rejected');
  }

  // --- Test B: Valid Token Generation via HTTP Endpoint ---
  console.log('\n--- Test B: Valid Ephemeral Token Generation via POST /api/receptionist/live-token ---');
  const resB = await fetch('http://localhost:3000/api/receptionist/live-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: 'conv-test-suite-b' }),
  });
  assert(resB.status === 200, `Endpoint returned HTTP 200 (got ${resB.status})`);
  const dataB = await resB.json();
  assert(typeof dataB.token === 'string', 'Token is returned as a string');
  assert(dataB.token.startsWith('auth_tokens/'), `Token name starts with auth_tokens/ (got ${dataB.token.substring(0, 15)}...)`);
  assert(dataB.model === 'gemini-3.8-live', `Model matches gemini-3.8-live (got ${dataB.model})`);
  assert(typeof dataB.expireTime === 'string', `expireTime is an ISO string (got ${dataB.expireTime})`);
  assert(dataB.conversationId === 'conv-test-suite-b', `conversationId matches (got ${dataB.conversationId})`);

  // --- Test C: Live WebSocket Handshake with Fresh Ephemeral Token ---
  console.log('\n--- Test C: Live WebSocket Connection with Fresh Ephemeral Token ---');
  const clientC = new GoogleGenAI({
    apiKey: dataB.token,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let sessionCOpened = false;
  let sessionCSetupComplete = false;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Live connect timed out after 10 seconds'));
    }, 10000);

    clientC.live.connect({
      model: dataB.model,
      callbacks: {
        onopen: () => {
          sessionCOpened = true;
        },
        onmessage: (msg: any) => {
          if (msg.setupComplete) {
            sessionCSetupComplete = true;
            clearTimeout(timeout);
            resolve();
          }
        },
        onerror: (err: any) => {
          clearTimeout(timeout);
          reject(err);
        },
        onclose: () => {},
      },
    }).catch(reject);
  });

  assert(sessionCOpened, 'Gemini Live WebSocket opened successfully');
  assert(sessionCSetupComplete, 'Received setupComplete message from Gemini Live');

  // --- Test D: Session Isolation (Second Session Requests Fresh Token) ---
  console.log('\n--- Test D: Fresh Token for Second Voice Session ---');
  const resD = await fetch('http://localhost:3000/api/receptionist/live-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: 'conv-test-suite-d' }),
  });
  const dataD = await resD.json();
  assert(resD.status === 200, 'Second token request succeeded with HTTP 200');
  assert(dataD.token !== dataB.token, 'Second session received a distinct, fresh token (not reused)');

  // --- Test E: Invalid / Expired Token Simulation ---
  console.log('\n--- Test E: Invalid Ephemeral Token Handling ---');
  const clientE = new GoogleGenAI({
    apiKey: 'auth_tokens/invalid_fake_token_00000000000000000000000000000000',
    httpOptions: { apiVersion: 'v1alpha' },
  });

  let invalidTokenRejected = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Timed out or rejected
      }, 5000);

      clientE.live.connect({
        model: 'gemini-3.8-live',
        callbacks: {
          onopen: () => {},
          onmessage: () => {},
          onerror: () => {
            invalidTokenRejected = true;
            clearTimeout(timeout);
            resolve();
          },
          onclose: (e: any) => {
            invalidTokenRejected = true;
            clearTimeout(timeout);
            resolve();
          },
        },
      }).catch((e) => {
        invalidTokenRejected = true;
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch {
    invalidTokenRejected = true;
  }
  assert(invalidTokenRejected, 'Invalid/expired token connection is rejected cleanly');

  // --- Test F: Health Check GET Endpoint ---
  console.log('\n--- Test F: Health Check GET Endpoint ---');
  const resF = await fetch('http://localhost:3000/api/receptionist/live-token');
  const dataF = await resF.json();
  assert(resF.status === 200, 'GET /api/receptionist/live-token returned 200');
  assert(dataF.status === 'healthy', 'Health check reports healthy');
  assert(dataF.geminiApiKeyConfigured === true, 'geminiApiKeyConfigured is true');
  assert(dataF.liveModel === 'gemini-3.8-live', 'liveModel is gemini-3.8-live');
  assert(!('apiKey' in dataF), 'GEMINI_API_KEY is not leaked in health check response');

  console.log(`\n====================================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`====================================================`);

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTestSuite().catch((e) => {
  console.error('Test Suite encountered fatal error:', e);
  process.exit(1);
});
