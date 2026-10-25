/**
 * Shared Firebase Auth bootstrap: LOCAL persistence + wait for session restore
 * before any anonymous sign-in. Prevents "signed out when navigating" races.
 */
(function (global) {
  "use strict";

  function waitForAuthReady(auth) {
    if (!auth) return Promise.resolve();
    if (typeof auth.authStateReady === "function") return auth.authStateReady();
    if (typeof auth.onAuthStateChanged !== "function") return Promise.resolve();
    return new Promise(function (resolve) {
      var unsub = auth.onAuthStateChanged(function () {
        try {
          unsub();
        } catch (_) {}
        resolve();
      });
    });
  }

  function setLocalPersistence(auth) {
    try {
      if (
        auth &&
        typeof auth.setPersistence === "function" &&
        global.firebase &&
        firebase.auth &&
        firebase.auth.Auth &&
        firebase.auth.Auth.Persistence
      ) {
        return Promise.resolve(auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)).catch(function () {});
      }
    } catch (_) {}
    return Promise.resolve();
  }

  /**
   * Prepare auth for this page: LOCAL persistence, then wait until IndexedDB
   * restore finishes. Safe to call multiple times.
   */
  function stripLocalStorageAuthTokens() {
    if (global.ProxyListAuthSecurity && typeof global.ProxyListAuthSecurity.stripLocalStorageAuthTokens === "function") {
      global.ProxyListAuthSecurity.stripLocalStorageAuthTokens();
      return;
    }
    var stores = [];
    try {
      if (global.localStorage) stores.push(global.localStorage);
    } catch (_) {}
    try {
      if (global.sessionStorage) stores.push(global.sessionStorage);
    } catch (_) {}
    stores.forEach(function (store) {
      try {
        var keys = [];
        for (var i = 0; i < store.length; i++) keys.push(store.key(i));
        keys.forEach(function (k) {
          if (!k) return;
          if (k === "proxyList_github_access_token" || /^firebase:(authUser|host|redirectUser):/i.test(k)) {
            store.removeItem(k);
          }
        });
      } catch (_) {}
    });
  }

  function prepare(auth) {
    stripLocalStorageAuthTokens();
    return setLocalPersistence(auth).then(function () {
      return waitForAuthReady(auth).then(function () {
        stripLocalStorageAuthTokens();
      });
    });
  }

  /**
   * Ensure there is a Firebase user. Never replaces an already-restored account
   * (including anonymous) with a new anonymous session.
   */
  function ensureAnonymous(auth) {
    return prepare(auth).then(function () {
      if (auth.currentUser) return auth.currentUser;
      return auth.signInAnonymously().then(function (cred) {
        return cred && cred.user ? cred.user : auth.currentUser;
      });
    });
  }

  global.ProxyListAuth = {
    prepare: prepare,
    ensureAnonymous: ensureAnonymous,
    waitForAuthReady: waitForAuthReady,
    setLocalPersistence: setLocalPersistence,
  };
})(typeof window !== "undefined" ? window : globalThis);
