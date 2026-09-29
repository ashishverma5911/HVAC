import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

const ai = new GoogleGenAI({ apiKey });

async function listModels() {
  const models = await ai.models.list();
  console.log('Available models:');
  for await (const m of models) {
    if (m.name && (m.name.includes('live') || m.name.includes('flash') || m.name.includes('2.0') || m.name.includes('2.5') || m.name.includes('3.'))) {
      console.log(m.name, m.supportedActions || m.displayName);
    }
  }
}

listModels().catch(console.error);
