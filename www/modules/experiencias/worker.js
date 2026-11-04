/* Lee chats grandes fuera del hilo principal. Todo ocurre en el dispositivo. */
importScripts('./engine.js');
self.onmessage = function (e) {
  try {
    const out = self.GolifiarExperienciasEngine.parseWhatsApp(e.data.text, e.data.name);
    self.postMessage({ ok: true, messages: Array.from(out), system: out.system, dateOrder: out.dateOrder });
  } catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); }
};
