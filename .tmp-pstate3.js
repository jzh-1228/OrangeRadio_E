const http = require('http');
http.get('http://127.0.0.1:9223/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const page = JSON.parse(d).find(t => t.type === 'page' && t.url.includes('3000'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    // 不依赖 audio：直接读 partita 内部循环是否在跑 + 手动喂时间（若暴露）
    const expr = '(async () => { try { const wait = (ms) => new Promise(r => setTimeout(r, ms)); if (!document.body.classList.contains("partita")) { applyPartitaMode(true, { save: false }); await wait(900); } return JSON.stringify({ partitaOn: document.body.classList.contains("partita"), hasAudioVar: typeof audio !== "undefined", audioTag: (typeof audio !== "undefined" && audio) ? audio.tagName : "null", rafAlive: typeof partitaRafId !== "undefined" ? partitaRafId : "n/a", lastTime: typeof partitaLastTime !== "undefined" ? partitaLastTime : "n/a" }); } catch (e) { return "ERR " + e.message; } })()';
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id === 1) { console.log(m.result.result.value); process.exit(0); } };
    setTimeout(() => process.exit(1), 15000);
  });
});
