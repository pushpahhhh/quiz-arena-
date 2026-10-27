const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY;
const INDEX = path.join(__dirname, 'index.html');
const MAX_BODY = 12 * 1024;
const rate = new Map();

function send(res, status, data, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(new Error('Request too large.')); req.destroy(); return; } body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Please send valid JSON.')); } });
    req.on('error', reject);
  });
}
function getClientKey(req) { return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim(); }
function allowRequest(req) {
  const now = Date.now(); const key = getClientKey(req); const entry = rate.get(key) || {start:now,count:0};
  if (now-entry.start > 60_000) { entry.start=now; entry.count=0; }
  entry.count++; rate.set(key,entry); return entry.count <= 8;
}
function extractOutputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  for (const item of (data.output || [])) for (const c of (item.content || [])) if (c.type === 'output_text' && c.text) return c.text;
  return '';
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try { send(res, 200, fs.readFileSync(INDEX, 'utf8'), 'text/html; charset=utf-8'); }
    catch { send(res, 500, 'Quiz Arena file is missing.', 'text/plain; charset=utf-8'); }
    return;
  }
  if (req.method === 'GET' && req.url === '/health') { send(res, 200, {ok:true, apiKeyConfigured:Boolean(API_KEY)}); return; }
  if (req.method !== 'POST' || req.url !== '/api/generate-quiz') { send(res, 404, {error:'Not found.'}); return; }
  if (!allowRequest(req)) { send(res, 429, {error:'Too many quiz requests. Please wait a minute and try again.'}); return; }
  if (!API_KEY) { send(res, 503, {error:'The server is running, but OPENAI_API_KEY is not configured in the server environment.'}); return; }
  let payload;
  try { payload = await readBody(req); } catch (e) { if (!res.headersSent && !res.writableEnded) send(res, 400, {error:e.message || 'Invalid request.'}); return; }
  const topic = typeof payload.topic === 'string' ? payload.topic.trim().slice(0,100) : '';
  const count = Number(payload.count);
  const level = ['easy','moderate','tough'].includes(payload.level) ? payload.level : 'moderate';
  if (!topic) { send(res, 400, {error:'Please enter a topic.'}); return; }
  if (!Number.isInteger(count) || count < 1 || count > 20) { send(res, 400, {error:'Choose between 1 and 20 questions to keep the demo safe and affordable.'}); return; }
  const prompt = `Create exactly ${count} accurate, age-appropriate multiple-choice quiz questions about the topic: "${topic}". Difficulty: ${level}. Return only a JSON object with a "questions" array. Each question must have keys: q (string), opts (array of exactly four strings), correct (integer 0, 1, 2, or 3; zero-based index), explain (short simple explanation). Ensure exactly one correct answer per question, plausible distractors, no duplicate questions, and explanations that match the correct answer. Do not include markdown.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', signal:controller.signal,
      headers:{'Authorization':`Bearer ${API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4.1-mini', store:false, input:[{role:'system',content:'You generate accurate quiz questions and follow the requested JSON format exactly.'},{role:'user',content:prompt}], text:{format:{type:'json_object'}}})
    });
    const raw = await response.json().catch(()=>({}));
    if (!response.ok) {
      const detail = raw.error && raw.error.message ? raw.error.message : `OpenAI returned HTTP ${response.status}.`;
      console.error('OpenAI API error:', response.status, detail);
      send(res, response.status === 429 ? 429 : 502, {error: response.status === 429 ? 'The AI service is busy or the API usage limit was reached. Check API billing/limits and try again.' : 'The AI service could not generate questions. Check the server API key, model access, and API billing settings.'}); return;
    }
    const text = extractOutputText(raw);
    let parsed;
    try { parsed = JSON.parse(text); } catch { send(res, 502, {error:'The AI returned a format the quiz could not read. Please try again.'}); return; }
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions)) { send(res, 502, {error:'The AI response did not contain a questions list. Please try again.'}); return; }
    const valid = questions.filter(q => q && typeof q.q === 'string' && q.q.trim() && Array.isArray(q.opts) && q.opts.length === 4 && q.opts.every(o => typeof o === 'string' && o.trim()) && Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3).slice(0,count).map(q=>({q:q.q.trim(),opts:q.opts.map(s=>s.trim()),correct:q.correct,explain:typeof q.explain==='string'?q.explain.trim():'Review the correct answer.'}));
    if (valid.length < count) { send(res, 502, {error:'The AI did not return enough valid questions. Please try again.'}); return; }
    send(res, 200, {questions:valid});
  } catch (e) {
    console.error('Quiz generation error:', e.name || e.message);
    send(res, 504, {error:e.name === 'AbortError' ? 'Question generation took too long. Please try again.' : 'Could not connect to the AI service. Check the server internet connection.'});
  } finally { clearTimeout(timeout); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Quiz Arena server running on port ${PORT}`));
