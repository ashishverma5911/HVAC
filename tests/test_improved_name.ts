import { isValidCustomerName } from '../src/lib/ai/extractConversationData';

function improvedExtractName(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // Pattern matches: "name Alex", "my name is Alex", "name: Alex", "I'm Alex", "this is Alex", etc.
  // Stops before words like address, phone, city, etc.
  const delimiterWords = 'address|phone|number|city|street|service|problem|issue|at|in|my|and|is|live';
  const patterns = [
    new RegExp(`(?:my\\s+name(?:'s|\\s+is)?|name(?:\\s+is|:)?|call\\s+me|this\\s+is|I'm|I\\s+am)\\s+([A-Za-z]+)(?:\\s+(?!${delimiterWords}\\b)([A-Za-z]+))?`, 'i'),
    /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:here|speaking)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const first = match[1]?.trim();
      const second = match[2]?.trim();
      
      // Try full two-word candidate first if both valid
      if (first && second) {
        const fullCandidate = `${first} ${second}`;
        if (isValidCustomerName(fullCandidate)) {
          return fullCandidate;
        }
      }
      
      // Fallback to single first name if valid
      if (first && isValidCustomerName(first)) {
        return first;
      }
    }
  }

  return null;
}

const test1 = "Hi, my name is Alex. My phone number is 214-555-0199. I'm at 456 Oak Street in Plano. My AC isn't cooling.";
const test2 = "name Alex address 456 Oak Street Plano city area Plano service type AC repair problem AC is a cooling";
const test3 = "My name is Alex Miller and my AC is broken";

console.log('Test 1:', improvedExtractName(test1));
console.log('Test 2:', improvedExtractName(test2));
console.log('Test 3:', improvedExtractName(test3));
