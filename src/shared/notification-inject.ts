/**
 * Source injected into messenger.com's MAIN world (via webContents.executeJavaScript,
 * which bypasses the site CSP) to make its web notifications reach macOS.
 *
 * Why this is needed: Electron does not surface messenger.com's notifications natively
 * under our hardened config, so we override the page's `Notification` constructor. Each
 * `new Notification(...)` is forwarded to the isolated-world preload via `window.postMessage`
 * (shared DOM across worlds), which relays it over IPC to the main process, which shows a
 * real `electron.Notification`. This mirrors Caprine's proven approach for Messenger.
 *
 * It also probes `ServiceWorkerRegistration.showNotification` so that if Messenger ever
 * posts via the service-worker path instead, we both forward it AND log it for diagnosis.
 *
 * Kept as a template string (not a separate bundled file) so it ships inside dist/main
 * without extra build wiring; it must be self-contained ES5-ish page code, no imports.
 */
export const NOTIFICATION_INJECT_SOURCE = String.raw`
(() => {
  if (window.__mercuryNotifyInstalled) return;
  window.__mercuryNotifyInstalled = true;

  var RealNotification = window.Notification;
  var counter = 0;
  var registry = new Map();

  function post(type, data) {
    window.postMessage({ __mercury: true, type: type, data: data }, window.location.origin);
  }

  function MercuryNotification(title, options) {
    options = options || {};
    var id = ++counter;
    this._id = id;
    this.title = title;
    this.body = options.body;
    this.onclick = null;
    this.onclose = null;
    this.onerror = null;
    this.onshow = null;
    registry.set(id, this);
    post('notify', {
      id: id,
      title: String(title == null ? '' : title),
      body: String(options.body == null ? '' : options.body),
    });
  }
  MercuryNotification.prototype.close = function () { post('notify-close', { id: this._id }); };
  MercuryNotification.prototype.addEventListener = function (type, cb) {
    if (type === 'click') this.onclick = cb;
    else if (type === 'close') this.onclose = cb;
  };
  MercuryNotification.prototype.removeEventListener = function () {};
  Object.defineProperty(MercuryNotification, 'permission', { get: function () { return 'granted'; } });
  MercuryNotification.requestPermission = function (cb) {
    if (cb) cb('granted');
    return Promise.resolve('granted');
  };
  MercuryNotification.maxActions = RealNotification ? RealNotification.maxActions : 2;

  window.Notification = MercuryNotification;

  // Receive click/close callbacks relayed from the main process by the preload.
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d || d.__mercuryCallback !== true) return;
    var n = registry.get(d.id);
    if (!n) return;
    if (d.event === 'click' && typeof n.onclick === 'function') n.onclick();
    if (d.event === 'close') { if (typeof n.onclose === 'function') n.onclose(); registry.delete(d.id); }
  });

  // Diagnostic + fallback: catch the service-worker notification path too.
  try {
    var proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
    if (proto && proto.showNotification) {
      var realShow = proto.showNotification;
      proto.showNotification = function (title, options) {
        options = options || {};
        post('notify', {
          id: ++counter,
          title: String(title == null ? '' : title),
          body: String(options.body == null ? '' : options.body),
        });
        try { return realShow.apply(this, arguments); } catch (e) { return Promise.resolve(); }
      };
    }
  } catch (err) { /* sw prototype not patchable: nothing to do */ }
})();
`;
