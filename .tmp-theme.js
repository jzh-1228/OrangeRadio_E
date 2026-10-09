const http = require('http');
http.get('http://127.0.0.1:9223/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const page = JSON.parse(d).find(t => t.type === 'page' && t.url.includes('3000'));
    if (!page) { console.log('NO PORT'); process.exit(2); }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: 'JSON.stringify({ mode: document.documentElement.className.includes("light") ? "light" : "dark", primary: getComputedStyle(document.documentElement).getPropertyValue("--theme-primary"), bg: getComputedStyle(document.documentElement).getPropertyValue("--theme-bg") })',
      returnByValue: true
    }}));
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id === 1) { console.log(m.result.result.value); process.exit(0); } };
    setTimeout(() => process.exit(1), 8000);
  });
});
