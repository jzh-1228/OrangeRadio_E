const http = require('http');
http.get('http://127.0.0.1:9223/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const page = JSON.parse(d).find(t => t.type === 'page' && t.url.includes('3000'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    // 模拟播放推进：把 audio.currentTime 拨到歌词中间，看状态机是否翻转
    const expr = '(async () => { try { const wait = (ms) => new Promise(r => setTimeout(r, ms)); if (!document.body.classList.contains("partita")) { applyPartitaMode(true, { save: false }); await wait(900); } const a = (typeof audio !== "undefined") ? audio : null; if (!a) return "no audio"; const wasPaused = a.paused; const dur = a.duration || 100; a.currentTime = Math.min(dur * 0.5, dur - 5); await wait(1500); const words1 = [...document.querySelectorAll(".pt-word")].map(w => w.className.replace("pt-word", "").trim() || "none"); a.currentTime = Math.min(dur * 0.6, dur - 4); await wait(1500); const words2 = [...document.querySelectorAll(".pt-word")].map(w => w.className.replace("pt-word", "").trim() || "none"); if (wasPaused) { a.pause(); } return JSON.stringify({ t1: words1.slice(0, 6), t2: words2.slice(0, 6), changed: JSON.stringify(words1) !== JSON.stringify(words2) }, null, 1); } catch (e) { return "ERR " + e.message; } })()';
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id === 1) { console.log(m.result.result.value); process.exit(0); } };
    setTimeout(() => process.exit(1), 20000);
  });
});
