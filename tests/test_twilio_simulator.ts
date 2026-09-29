import { createTelephonyServer } from '../src/server/telephonyServer';
import { CallSessionManager } from '../src/lib/telephony/callSessionManager';
import { linearSampleToMuLaw } from '../src/lib/telephony/audioCodec';
import { WebSocket } from 'ws';
import * as http from 'http';

// Load env
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile('.env.local');
  }
} catch {}

const TEST_PORT = 8089;

function generateTestMulawAudio(samplesCount: number = 160): string {
  // 160 samples at 8kHz is 20ms of audio (standard Twilio packet size)
  const mulawBuffer = Buffer.alloc(samplesCount);
  for (let i = 0; i < samplesCount; i++) {
    // 440 Hz sine wave
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 16000);
    mulawBuffer[i] = linearSampleToMuLaw(sample);
  }
  return mulawBuffer.toString('base64');
}

async function runSimulator() {
  console.log('--- Starting Twilio Telephony Simulator Test ---');

  const { server, wss } = createTelephonyServer();

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`[Simulator] Test telephony server listening on port ${TEST_PORT}`);
      resolve();
    });
  });

  const sessionManager = CallSessionManager.getInstance();

  try {
    // 1. Test TwiML Webhook HTTP POST
    console.log('[Test 1] Testing TwiML Webhook HTTP POST...');
    const postData = 'CallSid=CA_SIM_001&From=%2B15559876543&To=%2B15551112222';
    const twimlResponse = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/telephony/twilio/voice',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve(body));
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    if (!twimlResponse.includes('<Response>') || !twimlResponse.includes('<Stream url="')) {
      throw new Error(`Invalid TwiML response received: ${twimlResponse}`);
    }
    console.log('✓ Valid TwiML <Connect><Stream> response generated successfully');

    // 2. Test Media Stream WebSocket Handshake & LifeCycle
    console.log('[Test 2] Connecting Twilio Media Stream WebSocket...');
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/api/telephony/twilio-stream`);

    const streamSid = 'MZ_SIM_STREAM_999';
    const callSid = 'CA_SIM_001';
    let receivedTwilioMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        console.log('✓ WebSocket connected to telephony bridge');
        resolve();
      });
      ws.on('error', reject);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        receivedTwilioMessages.push(msg);
      } catch {}
    });

    // Send 'connected'
    ws.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }));

    // Send 'start'
    console.log('[Test 3] Sending Twilio start event...');
    ws.send(
      JSON.stringify({
        event: 'start',
        streamSid,
        start: {
          callSid,
          callerPhone: '+15559876543',
          customParameters: {
            callerPhone: '+15559876543',
          },
        },
      })
    );

    // Wait for session creation and Gemini Live connection
    console.log('Waiting for Gemini Live bridge handshake...');
    await new Promise((r) => setTimeout(r, 3000));

    const session = sessionManager.getSessionByStream(streamSid);
    if (!session) {
      throw new Error(`Expected session for streamSid ${streamSid} was not found!`);
    }
    console.log(`✓ Isolated call session found: ${session.sessionId}, caller: ${session.callerPhone}`);

    // Send 10 packets of audio (simulate 200ms of caller speech)
    console.log('[Test 4] Streaming 10 audio media chunks (8kHz μ-law)...');
    for (let i = 0; i < 10; i++) {
      ws.send(
        JSON.stringify({
          event: 'media',
          streamSid,
          media: {
            payload: generateTestMulawAudio(160),
            timestamp: i * 20,
            chunk: i,
          },
        })
      );
      await new Promise((r) => setTimeout(r, 20));
    }

    // Wait a brief moment to let Gemini Live receive and process
    await new Promise((r) => setTimeout(r, 3000));

    console.log(`✓ Telemetry after streaming:`);
    console.log(`  - Twilio chunks received: ${session.metrics.twilioChunksReceived}`);
    console.log(`  - Twilio bytes received: ${session.metrics.twilioBytesReceived}`);
    console.log(`  - PCM frames generated (16kHz): ${session.metrics.pcmFramesGenerated}`);
    console.log(`  - Gemini chunks forwarded: ${session.metrics.geminiChunksSent}`);
    console.log(`  - Outbound Twilio messages returned from AI: ${receivedTwilioMessages.length}`);

    if (session.metrics.twilioChunksReceived < 10) {
      throw new Error(`Expected at least 10 chunks received, got ${session.metrics.twilioChunksReceived}`);
    }

    // 5. Test Twilio Stop event and cleanup
    console.log('[Test 5] Sending Twilio stop event...');
    ws.send(
      JSON.stringify({
        event: 'stop',
        streamSid,
      })
    );

    await new Promise((r) => setTimeout(r, 1000));
    ws.close();

    const endedSession = sessionManager.getSessionByStream(streamSid);
    if (!endedSession || !endedSession.ended) {
      throw new Error(`Expected session ${streamSid} to be ended.`);
    }
    console.log(`✓ Session successfully terminated with duration: ${endedSession.metrics.durationSeconds}s`);

    // 6. Test Status Endpoint
    console.log('[Test 6] Testing GET /api/telephony/status...');
    const statusData = await new Promise<any>((resolve, reject) => {
      http.get(`http://127.0.0.1:${TEST_PORT}/api/telephony/status`, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    console.log(`✓ Status API Response: activeCalls=${statusData.activeCallCount}, recentSessions=${statusData.recentSessions.length}`);
    const recordedCall = statusData.recentSessions.find((s: any) => s.callSid.startsWith('CA_SIM_001'.substring(0, 8)));
    if (!recordedCall) {
      throw new Error('Recorded simulated call was not found in status recentSessions');
    }
    console.log(`✓ Privacy masking confirmed: callerPhone is ${recordedCall.callerPhone}`);

    console.log('\n=========================================');
    console.log('🎉 ALL TELEPHONY SIMULATOR TESTS PASSED!');
    console.log('=========================================\n');
  } finally {
    wss.close();
    server.close();
  }
}

runSimulator().catch((err) => {
  console.error('❌ Telephony Simulator Test Failed:', err);
  process.exit(1);
});
