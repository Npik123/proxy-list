/**
 * Browser Sentry (errors + a light trace sample). Session Replay is not loaded.
 * SDK is vendored at docs/vendor/sentry.tracing.min.js.
 * Does not load or send until the visitor opts in (proxyList_sentryConsent_v1).
 */
(function (global) {
  "use strict";

  var DSN =
    "https://651c06e7a707a3944a0ae8b5502604c6@o4512286757879808.ingest.us.sentry.io/4512286767448064";
  var WORKER_ORIGIN = "https://proxy-list.jasonthegamer48.workers.dev";
  var CONSENT_KEY = "proxyList_sentryConsent_v1";
  var DIALOG_ID = "proxyListSentryConsentBackdrop";
  var STYLE_ID = "proxyListSentryConsentStyles";
  var INIT_DIR = scriptDir();

  function scriptDir() {
    try {
      var s = document.currentScript && document.currentScript.src;
      if (s) return s.replace(/[^/]+$/, "");
    } catch (_) {}
    return "";
  }

  function environmentName() {
    try {
      var host = String(location.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return "development";
      if (/preview|workers\.dev/i.test(host) && host.indexOf("proxy-list.jasonthegamer48.workers.dev") === -1) {
        return "preview";
      }
      if (host.indexOf("workers.dev") !== -1 && host.indexOf("preview") !== -1) return "preview";
      return "production";
    } catch (_) {
      return "production";
    }
  }

  function sentryTunnelUrl() {
    try {
      var host = String(location.hostname || "").toLowerCase();
      var port = String(location.port || "");
      var sameOrigin =
        host === "proxy-list.jasonthegamer48.workers.dev" ||
        /-proxy-list\.jasonthegamer48\.workers\.dev$/i.test(host) ||
        /\.proxy-list\.jasonthegamer48\.workers\.dev$/i.test(host) ||
        ((host === "localhost" || host === "127.0.0.1" || host === "[::1]") && port === "8787");
      if (sameOrigin) return "/api/sentry";
    } catch (_) {}
    return WORKER_ORIGIN + "/api/sentry";
  }

  function readConsent() {
    try {
      var v = String(localStorage.getItem(CONSENT_KEY) || "");
      if (v === "enabled" || v === "disabled") return v;
    } catch (_) {}
    return "";
  }

  function writeConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (_) {}
  }

  function emitConsent(value) {
    try {
      global.dispatchEvent(new CustomEvent("proxy-list-sentry-consent", { detail: { value: value } }));
    } catch (_) {}
  }

  function isEmbedMode() {
    try {
      if (document.documentElement.classList.contains("embed-mode")) return true;
      var params = new URLSearchParams(location.search || "");
      if (params.get("embed") === "1" || params.get("embed") === "true") return true;
    } catch (_) {}
    return false;
  }

  function initSentry() {
    if (readConsent() !== "enabled") return;
    if (!global.Sentry || global.__PROXY_LIST_SENTRY__) return;
    global.__PROXY_LIST_SENTRY__ = true;
    try {
      var integrations = [];
      if (typeof Sentry.browserTracingIntegration === "function") {
        integrations.push(Sentry.browserTracingIntegration());
      }
      var initOpts = {
        dsn: DSN,
        environment: environmentName(),
        tracesSampleRate: 0.08,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        integrations: integrations,
        sendDefaultPii: false,
        // Empty list: do not attach sentry-trace/baggage to API fetches (CORS preflight).
        tracePropagationTargets: [],
      };
      var tunnel = sentryTunnelUrl();
      if (tunnel) initOpts.tunnel = tunnel;
      Sentry.init(initOpts);
      try {
        if (/(?:^|[?&])sentry_verify=1(?:&|$)/.test(String(location.search || ""))) {
          Sentry.captureException(new Error("Sentry verification: SDK connected"));
        }
      } catch (_) {}
    } catch (_) {}
  }

  function loadScript(src, onerror) {
    var sdk = document.createElement("script");
    sdk.src = src;
    sdk.async = true;
    sdk.onload = initSentry;
    sdk.onerror = typeof onerror === "function" ? onerror : function () {};
    (document.head || document.documentElement).appendChild(sdk);
  }

  function loadSdk() {
    if (readConsent() !== "enabled") return;
    if (global.Sentry) {
      initSentry();
      return;
    }
    if (global.__PROXY_LIST_SENTRY_LOADING__) return;
    global.__PROXY_LIST_SENTRY_LOADING__ = true;
    var localSdk = (INIT_DIR || "") + "vendor/sentry.tracing.min.js";
    loadScript(localSdk, function () {
      loadScript(WORKER_ORIGIN + "/vendor/sentry.tracing.min.js");
    });
  }

  function disableSdk() {
    try {
      if (global.Sentry && typeof Sentry.close === "function") Sentry.close();
    } catch (_) {}
    global.__PROXY_LIST_SENTRY__ = false;
  }

  function hideConsentDialog() {
    var el = document.getElementById(DIALOG_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent =
      "#" + DIALOG_ID + "{" +
        "position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;" +
        "padding:1rem;background:rgba(7,10,14,.72);" +
      "}" +
      "#" + DIALOG_ID + " .pl-sentry-modal{" +
        "width:min(520px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column;" +
        "background:var(--surface,#141414);color:var(--text,#e8e8e8);" +
        "border:1px solid var(--border,#2e2e2e);border-radius:10px;" +
        "box-shadow:0 16px 36px rgba(0,0,0,.45);" +
      "}" +
      "#" + DIALOG_ID + " .pl-sentry-head{" +
        "padding:.9rem 1rem;border-bottom:1px solid var(--border,#2e2e2e);flex-shrink:0;" +
      "}" +
      "#" + DIALOG_ID + " .pl-sentry-title{font-size:1rem;margin:0;font-weight:650;}" +
      "#" + DIALOG_ID + " .pl-sentry-body{padding:.9rem 1rem 1.05rem;display:flex;flex-direction:column;gap:.75rem;}" +
      "#" + DIALOG_ID + " .pl-sentry-body p{margin:0;color:var(--muted,#9a9a9a);line-height:1.55;font-size:.92rem;}" +
      "#" + DIALOG_ID + " .pl-sentry-body a{color:var(--accent,#6cb3ff);}" +
      "#" + DIALOG_ID + " .pl-sentry-actions{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.2rem;}" +
      "#" + DIALOG_ID + " .pl-sentry-btn{" +
        "display:inline-flex;align-items:center;justify-content:center;padding:.38rem .7rem;" +
        "font-family:inherit;font-size:.82rem;font-weight:500;border-radius:6px;cursor:pointer;" +
        "border:1px solid var(--border,#2e2e2e);background:var(--surface,#1a1a1a);color:var(--text,#e8e8e8);" +
      "}" +
      "#" + DIALOG_ID + " .pl-sentry-btn:hover{border-color:var(--accent,#6cb3ff);color:var(--accent,#6cb3ff);}" +
      "#" + DIALOG_ID + " .pl-sentry-btn-primary{" +
        "background:#2a2a2a;border-color:#2d5588;color:var(--accent,#6cb3ff);" +
      "}" +
      "#" + DIALOG_ID + " .pl-sentry-btn-primary:hover{background:#333;color:#9fd4ff;}";
    (document.head || document.documentElement).appendChild(css);
  }

  function showConsentDialog() {
    if (readConsent() || isEmbedMode()) return;
    if (document.getElementById(DIALOG_ID)) return;
    ensureStyles();
    var backdrop = document.createElement("div");
    backdrop.id = DIALOG_ID;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "proxyListSentryConsentTitle");

    var modal = document.createElement("section");
    modal.className = "pl-sentry-modal";

    var head = document.createElement("div");
    head.className = "pl-sentry-head";
    var title = document.createElement("h2");
    title.className = "pl-sentry-title";
    title.id = "proxyListSentryConsentTitle";
    title.textContent = "Analytics Collection";
    head.appendChild(title);

    var body = document.createElement("div");
    body.className = "pl-sentry-body";

    var p1 = document.createElement("p");
    p1.appendChild(document.createTextNode("The Proxy List uses Sentry ("));
    var link = document.createElement("a");
    link.href = "https://sentry.io";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "https://sentry.io";
    p1.appendChild(link);
    p1.appendChild(
      document.createTextNode(
        ") to collect data on site performance and crashes/errors that are encountered. These logs are used to improve your experience on the site so that we can identify bugs and fix them faster. Sentry is enabled on all stable links as well as preview links."
      )
    );

    var p2 = document.createElement("p");
    p2.textContent =
      "Would you like to enable this? It is completely optional and is not required for the site to function properly.";

    var actions = document.createElement("div");
    actions.className = "pl-sentry-actions";

    var p3 = document.createElement("p");
    p3.textContent = "This setting can be changed at any time in Settings.";

    var enableBtn = document.createElement("button");
    enableBtn.type = "button";
    enableBtn.className = "pl-sentry-btn pl-sentry-btn-primary";
    enableBtn.textContent = "Opt-into sending analytic data";
    enableBtn.addEventListener("click", function () {
      setConsent("enabled");
    });

    var disableBtn = document.createElement("button");
    disableBtn.type = "button";
    disableBtn.className = "pl-sentry-btn";
    disableBtn.textContent = "Opt-out";
    disableBtn.addEventListener("click", function () {
      setConsent("disabled");
    });

    actions.appendChild(enableBtn);
    actions.appendChild(disableBtn);
    body.appendChild(p1);
    body.appendChild(p2);
    body.appendChild(p3);
    body.appendChild(actions);
    modal.appendChild(head);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    (document.body || document.documentElement).appendChild(backdrop);
    try {
      enableBtn.focus();
    } catch (_) {}
  }

  function onReady(fn) {
    if (document.body) {
      fn();
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
      return;
    }
    fn();
  }

  function setConsent(value) {
    var next = value === "enabled" ? "enabled" : "disabled";
    writeConsent(next);
    hideConsentDialog();
    if (next === "enabled") loadSdk();
    else disableSdk();
    emitConsent(next);
    return next;
  }

  function hasChoice() {
    return readConsent() === "enabled" || readConsent() === "disabled";
  }

  global.ProxyListSentry = {
    CONSENT_KEY: CONSENT_KEY,
    hasChoice: hasChoice,
    getConsent: readConsent,
    setConsent: setConsent,
  };

  if (global.__PROXY_LIST_SENTRY_SCRIPT__) {
    if (readConsent() === "enabled" && global.Sentry) initSentry();
    return;
  }
  global.__PROXY_LIST_SENTRY_SCRIPT__ = true;

  var consent = readConsent();
  if (consent === "enabled") {
    loadSdk();
    return;
  }
  if (consent === "disabled" || isEmbedMode()) return;
  onReady(showConsentDialog);
})(typeof window !== "undefined" ? window : globalThis);
