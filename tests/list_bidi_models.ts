import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : '';

async function listModels() {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const pager = await ai.models.list();
  for await (const m of pager) {
    if (m.supportedActions && m.supportedActions.includes('bidiGenerateContent')) {
      console.log('BIDI MODEL:', m.name, '| Display:', m.displayName);
    }
  }
}
listModels().catch(console.error);
