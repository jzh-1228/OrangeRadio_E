const fs = require('fs');
const http = require('http');
http.get('http://127.0.0.1:9223/json', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const page = JSON.parse(d).find(t => t.type === 'page' && t.url.includes('3000'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 0;
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: ++msgId, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id === 1 && m.result) {
        fs.writeFileSync('.tmp-partita-check.png', Buffer.from(m.result.data, 'base64'));
        console.log('saved');
        process.exit(0);
      }
    };
    setTimeout(() => process.exit(1), 10000);
  });
});
