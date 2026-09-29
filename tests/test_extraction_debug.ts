import { extractFallbackName, extractStructuredCustomerData } from '../src/lib/ai/extractConversationData';

const text1 = "Hi, my name is Alex. My phone number is 214-555-0199. I'm at 456 Oak Street in Plano. My AC isn't cooling.";
console.log('--- TEST 1 ---');
console.log('Test 1 extractFallbackName:', extractFallbackName(text1));
console.log('Test 1 full customerInfo:', extractStructuredCustomerData(text1).customerInfo);

const text2 = "name Alex address 456 Oak Street Plano city area Plano service type AC repair problem AC is a cooling";
console.log('\n--- TEST 2 ---');
console.log('Test 2 extractFallbackName:', extractFallbackName(text2));
console.log('Test 2 full customerInfo:', extractStructuredCustomerData(text2).customerInfo);
