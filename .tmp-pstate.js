const http = require('http');
http.get('http://127.0.0.1:9223/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const page = JSON.parse(d).find(t => t.type === 'page' && t.url.includes('3000'));
    if (!page) { console.log('NO PORT'); process.exit(2); }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const expr = '(async () => { try { const words = [...document.querySelectorAll(".pt-word")]; const states = words.slice(0, 8).map(w => ({ cls: w.className.replace("pt-word ", ""), t: (w.querySelector(".pt-body") || {}).textContent })); const bodyCls = document.body.className; const now = typeof audio !== "undefined" && audio ? audio.currentTime : -1; return JSON.stringify({ wordCount: words.length, states, playing: typeof playing !== "undefined" ? playing : "?", now: Math.round(now * 10) / 10 }, null, 1); } catch (e) { return "ERR " + e.message; } })()';
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id === 1) { console.log(m.result.result.value); process.exit(0); } };
    setTimeout(() => process.exit(1), 10000);
  });
});
