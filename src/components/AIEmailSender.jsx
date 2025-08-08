// src/components/AIEmailSender.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { chatWithOpenRouter } from '../lib/openrouter.js';

/** Simple helpers */
function parseRecipients(raw) {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}
function recipientsToString(recipients) {
  return recipients.map((r) => r.email).join(', ');
}

/** Local fallback generator used when the API is rate-limited/unavailable */
function fallbackGenerateLocal({ prompt, tone, recipients }) {
  // build subject by extracting short topic from prompt
  const firstRecipient = recipients[0]?.email ?? '';
  const name = firstRecipient ? firstRecipient.split('@')[0].replace(/[._]/g, ' ') : '';
  // create short subject using first 6 words of prompt
  const short = prompt.split(/\s+/).slice(0, 6).join(' ');
  const subject = `${tone} — ${short || 'Follow-up'}`;

  // body template
  const greeting = name ? `Dear ${capitalize(name)}` : 'Hello';
  const body = `${greeting},

${makeToneOpening(tone)} ${prompt}

Please let me know your thoughts or the next steps. I appreciate your time.

Best regards,
[Your Name]`;

  const aiRaw = JSON.stringify({ subject, body }, null, 2);
  return { subject, body, aiRaw, source: 'fallback' };
}

function capitalize(s = '') {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}
function makeToneOpening(tone) {
  const t = (tone || '').toLowerCase();
  if (t.includes('casual')) return 'Hope you are doing well.';
  if (t.includes('friendly')) return 'Hope you are well and having a great week.';
  if (t.includes('urgent')) return 'Following up with some urgency on the matter.';
  if (t.includes('concise')) return 'Quick note:';
  return 'I am writing to follow up on';
}

export function AIEmailSender() {
  const [rawRecipients, setRawRecipients] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const recipients = useMemo(() => parseRecipients(rawRecipients), [rawRecipients]);

  const [prompt, setPrompt] = useState(
    `Write a polite, concise follow-up email asking for a decision. Keep it under 200 words.`
  );
  const [tone, setTone] = useState('Professional');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiRaw, setAiRaw] = useState('');
  const [error, setError] = useState(null);
  const [lastSource, setLastSource] = useState(null); // 'openrouter' | 'fallback'

  // heartbeat
  const [heartbeatOn, setHeartbeatOn] = useState(true);
  const [lastBeat, setLastBeat] = useState(null);
  useEffect(() => {
    if (!heartbeatOn) return;
    const id = setInterval(() => {
      const now = Date.now();
      console.log('[heartbeat] app alive at', new Date(now).toISOString());
      setLastBeat(now);
    }, 30000);
    setLastBeat(Date.now());
    return () => clearInterval(id);
  }, [heartbeatOn]);

  const recipientInputRef = useRef(null);

  const pushRecipientFromInput = () => {
    if (!recipientInput.trim()) return;
    const combined = rawRecipients ? `${rawRecipients}, ${recipientInput}` : recipientInput;
    setRawRecipients(combined);
    setRecipientInput('');
    recipientInputRef.current?.focus();
  };

  const removeRecipient = (index) => {
    const arr = parseRecipients(rawRecipients);
    arr.splice(index, 1);
    setRawRecipients(arr.map((r) => r.email).join(', '));
  };

  /** Robust parser: prefer JSON, else 'Subject:' format, else fallback */
  const parseModelOutput = (txt) => {
    if (!txt) return { subject: '', body: '' };

    // try to find JSON blob first
    try {
      const firstJsonMatch = (txt || '').match(/({[\s\S]*})/);
      const jsonText = firstJsonMatch ? firstJsonMatch[1] : txt;
      const parsed = JSON.parse(jsonText);
      if (parsed?.subject || parsed?.body) {
        return {
          subject: String(parsed.subject ?? '').trim() || '',
          body: String(parsed.body ?? '').trim() || '',
        };
      }
    } catch (e) {
      // ignore
    }

    // fallback: "Subject: ..." style
    const subjMatch = txt.match(/Subject:\s*(.*)/i);
    if (subjMatch) {
      const parsedSubject = subjMatch[1].trim();
      const bodyStart = txt.indexOf('\n', subjMatch.index ?? 0);
      const parsedBody = bodyStart >= 0 ? txt.slice(bodyStart + 1).trim() : '';
      return { subject: parsedSubject || '', body: parsedBody || '' };
    }

    // last resort: put everything into body, generic subject
    return { subject: 'Hello', body: String(txt).trim() };
  };

  /** Generate: tries OpenRouter first, falls back to local template on error (429 etc) */
  const generate = async () => {
    setError(null);
    if (!rawRecipients.trim()) {
      setError('Please add at least one recipient (comma/newline separated).');
      return;
    }
    if (loading) return;
    setLoading(true);

    try {
      const recipientsStr = recipientsToString(parseRecipients(rawRecipients));
      const fullPrompt = `Generate a ${tone.toLowerCase()} email (subject and body) for recipients: ${recipientsStr}
User prompt:
${prompt}

Output format: JSON like {"subject":"...", "body":"..."} if possible. If not possible, put "Subject:" on the first line, then the body.`;

      // attempt OpenRouter
      const ai = await chatWithOpenRouter(fullPrompt);

      // openrouter might return an error string or throw; handle both
      if (!ai || typeof ai !== 'string' || ai.trim().length === 0) {
        throw new Error('Empty response from AI');
      }

      // parse and set result
      setAiRaw(ai);
      const parsed = parseModelOutput(ai);
      setSubject(parsed.subject);
      setBody(parsed.body);
      setLastSource('openrouter');
    } catch (err) {
      // If the error message includes 429 or "rate-limited" we fallback
      const msg = err?.message ? String(err.message) : String(err);
      console.warn('AI call failed:', msg);

      // detect rate-limit or provider error
      const isRateLimit = /429|rate[- ]?limit|temporarily rate-limited|rate limited/i.test(msg);

      // show user-friendly error message
      if (isRateLimit) {
        setError('OpenRouter is temporarily rate-limited. Using local fallback generator.');
      } else {
        setError(`AI generation failed (${msg}). Using local fallback.`);
      }

      // local fallback generator always returns subject/body so UI remains usable
      const fallback = fallbackGenerateLocal({
        prompt,
        tone,
        recipients: parseRecipients(rawRecipients),
      });
      setAiRaw(fallback.aiRaw);
      setSubject(fallback.subject);
      setBody(fallback.body);
      setLastSource('fallback');
    } finally {
      setLoading(false);
    }
  };

  const sendViaMailto = () => {
    const parsedRecipients = parseRecipients(rawRecipients);
    if (!parsedRecipients.length) {
      setError('Add at least one recipient to send.');
      return;
    }
    const to = parsedRecipients.map((r) => r.email).join(',');
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const simulateSendAndDownload = () => {
    const record = {
      to: parseRecipients(rawRecipients).map((r) => r.email),
      subject,
      body,
      generatedAt: new Date().toISOString(),
      aiRaw,
      source: lastSource,
    };
    console.log('Simulated send:', record);
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sent-email-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    alert('Simulated send saved to your downloads.');
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      alert('Email copied to clipboard');
    } catch {
      alert('Unable to copy to clipboard');
    }
  };

  const applyPreset = (p) => setPrompt(p);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* header with purple->pink gradient */}
      <div className="relative overflow-hidden rounded-2xl mb-6">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#8b5cf6] via-[#f472b6] to-[#fbcfe8] opacity-90" />
        <div className="relative z-10 p-6 md:p-8 bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-14 h-14 rounded-xl bg-white/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a3 3 0 003.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-white drop-shadow-sm">AI Generated Email Sender</h1>
              <p className="mt-1 text-sm text-white/90">Generate, edit and send emails fast. Uses OpenRouter (client-side). Keep your API key in <code className="bg-white/20 px-1 rounded">.env</code>.</p>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <span className="text-xs bg-white/20 text-white px-2 py-1 rounded-full">Quick demo</span>
                <span className="text-xs bg-white/20 text-white px-2 py-1 rounded-full">No backend required</span>
                <span className="text-xs bg-white/20 text-white px-2 py-1 rounded-full">Simulate send</span>
              </div>
            </div>

            <div className="hidden md:flex md:flex-col md:items-end">
              <div className="text-sm text-white">Heartbeat</div>
              <button
                onClick={() => setHeartbeatOn(h => !h)}
                className="mt-2 px-3 py-1 bg-white/30 text-white rounded-md text-sm hover:bg-white/40 whitespace-nowrap"
              >
                {heartbeatOn ? 'On' : 'Off'}
              </button>
              {lastBeat ? <div className="mt-2 text-xs text-white/80">{new Date(lastBeat).toLocaleTimeString()}</div> : null}
            </div>
          </div>
        </div>
      </div>

      {/* content */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* left */}
        <div className="space-y-4">
          <label className="text-sm font-medium">Recipients</label>

          <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="flex flex-wrap gap-2 mb-2">
              {parseRecipients(rawRecipients).map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-white dark:bg-gray-700 px-3 py-1 rounded-full text-sm shadow-sm">
                  <span className="max-w-xs truncate">{r.email}</span>
                  <button
                    onClick={() => removeRecipient(i)}
                    className="text-gray-500 hover:text-red-500"
                    aria-label={`Remove ${r.email}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <input
                ref={recipientInputRef}
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    pushRecipientFromInput();
                  } else if (e.key === 'Backspace' && !recipientInput) {
                    const arr = parseRecipients(rawRecipients);
                    arr.pop();
                    setRawRecipients(arr.map((r) => r.email).join(', '));
                  }
                }}
                placeholder="Type email and press Enter (or paste comma-separated)"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              <button
                onClick={pushRecipientFromInput}
                className="px-4 py-2 bg-gradient-to-r from-[#8b5cf6] to-[#f472b6] text-white rounded-md text-sm hover:opacity-95 whitespace-nowrap flex-shrink-0"
              >
                Add
              </button>
            </div>

            <textarea
              rows={2}
              value={rawRecipients}
              onChange={(e) => setRawRecipients(e.target.value)}
              className="mt-3 w-full bg-transparent text-sm resize-none outline-none"
              placeholder="Or paste recipients: alice@example.com, bob@example.com"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Tone</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="ml-2 rounded-md border px-2 py-1 text-sm">
              <option>Professional</option>
              <option>Casual</option>
              <option>Friendly</option>
              <option>Urgent</option>
              <option>Concise</option>
            </select>

            <div className="ml-auto flex gap-2">
              <button
                onClick={() => applyPreset('Write a short, friendly follow-up asking for next steps within a week.')}
                className="px-3 py-1 text-sm border rounded-md whitespace-nowrap flex-shrink-0"
              >
                Follow-up
              </button>
              <button
                onClick={() => applyPreset('Write a short introduction email to request a meeting and propose 2 time slots.')}
                className="px-3 py-1 text-sm border rounded-md whitespace-nowrap flex-shrink-0"
              >
                Intro
              </button>
            </div>
          </div>

          <label className="text-sm font-medium">Prompt for the email AI</label>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full border rounded-md p-3 text-sm focus:ring-2 focus:ring-indigo-300"
          />

          <div className="flex gap-3 items-center">
            <button
              onClick={generate}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-md text-white ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-[#8b5cf6] to-[#f472b6] shadow-lg hover:opacity-95'} whitespace-nowrap min-w-[160px]`}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  Generate Email
                </>
              )}
            </button>

            <button
              onClick={() => setPrompt('Write a short, friendly follow-up asking for next steps within a week.')}
              className="px-4 py-2 border rounded-md text-sm whitespace-nowrap flex-shrink-0"
            >
              Quick Prompt
            </button>

            <div className="ml-auto text-xs text-red-600 truncate">{error}</div>
          </div>
        </div>

        {/* right */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">Preview</h3>
                <div className="text-xs text-gray-500">Editable before sending {lastSource ? `(from ${lastSource})` : ''}</div>
              </div>
              <div className="text-xs text-gray-400">Recipients: {parseRecipients(rawRecipients).length}</div>
            </div>

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="w-full mb-3 bg-transparent outline-none font-medium text-lg"
            />

            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Generated email body will appear here..."
              className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed min-h-[180px]"
            />

            <div className="mt-3 flex gap-2 flex-wrap">
              <button onClick={sendViaMailto} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 whitespace-nowrap">
                Send (opens mail)
              </button>

              <button onClick={simulateSendAndDownload} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 whitespace-nowrap">
                Simulate & Download
              </button>

              <button onClick={copyToClipboard} className="px-3 py-2 border rounded-md text-sm whitespace-nowrap">
                Copy
              </button>

              <button
                onClick={() => {
                  if (!aiRaw) {
                    alert('No AI output yet.');
                  } else {
                    const newWin = window.open('', '_blank');
                    if (newWin) {
                      newWin.document.write('<pre style="white-space:pre-wrap;font-family:monospace;padding:16px;">' + aiRaw.replace(/</g, '&lt;') + '</pre>');
                      newWin.document.title = 'AI Raw Output';
                    } else {
                      alert(aiRaw);
                    }
                  }
                }}
                className="px-3 py-2 border rounded-md text-sm whitespace-nowrap"
              >
                View AI Raw
              </button>
            </div>
          </div>

          <details className="text-sm text-gray-500">
            <summary className="cursor-pointer">AI Raw Output (click to expand)</summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-md max-h-52 overflow-auto text-xs whitespace-pre-wrap">{aiRaw || 'No AI output yet.'}</pre>
          </details>

          <div className="text-xs text-gray-400">
            Tip: Use <strong>Simulate & Download</strong> to produce a JSON file you can attach to your submission.
          </div>
        </div>
      </div>
    </div>
  );
}
