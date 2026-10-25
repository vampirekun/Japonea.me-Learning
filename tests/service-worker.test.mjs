import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const APP_ORIGIN = "https://japonea.example";

function requestKey(request) {
  return typeof request === "string" ? request : request.url;
}

function createWorker({ fetchImpl, cachedEntries = [] }) {
  const listeners = new Map();
  const cached = new Map(cachedEntries);
  const stored = new Map();
  const cache = {
    async match(request) {
      const key = requestKey(request);
      return cached.has(key) ? cached.get(key) : stored.get(key);
    },
    async put(request, response) {
      stored.set(requestKey(request), response);
    }
  };
  const caches = {
    match: (request) => cache.match(request),
    open: async () => cache,
    keys: async () => [],
    delete: async () => true
  };
  const self = {
    location: { origin: APP_ORIGIN },
    clients: { claim: async () => {} },
    addEventListener: (name, handler) => listeners.set(name, handler),
    skipWaiting: () => {}
  };

  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Promise });
  return { handler: listeners.get("fetch"), stored };
}

function dispatch(handler, request) {
  let responsePromise;
  let called = false;
  handler({
    request,
    respondWith(promise) {
      called = true;
      responsePromise = Promise.resolve(promise);
    }
  });
  return { called, responsePromise };
}

test("offline navigation falls back to the cached app shell", async () => {
  const indexResponse = { marker: "cached-index" };
  const { handler } = createWorker({
    fetchImpl: async () => { throw new Error("offline"); },
    cachedEntries: [["./index.html", indexResponse]]
  });

  const event = dispatch(handler, {
    method: "GET",
    url: APP_ORIGIN + "/courses.html",
    mode: "navigate"
  });

  assert.equal(event.called, true);
  assert.equal(await event.responsePromise, indexResponse);
});

test("offline asset requests reject instead of receiving index HTML", async () => {
  const { handler } = createWorker({
    fetchImpl: async () => { throw new Error("offline asset"); }
  });
  const event = dispatch(handler, {
    method: "GET",
    url: APP_ORIGIN + "/data/courses/n5.json",
    mode: "same-origin"
  });

  assert.equal(event.called, true);
  await assert.rejects(event.responsePromise, /offline asset/);
});

test("cross-origin GET requests are left to the browser", () => {
  const { handler } = createWorker({
    fetchImpl: async () => { throw new Error("must not intercept"); }
  });
  const event = dispatch(handler, {
    method: "GET",
    url: "https://api.example.net/data",
    mode: "cors"
  });

  assert.equal(event.called, false);
});

test("non-GET requests are left to the browser", () => {
  const { handler } = createWorker({
    fetchImpl: async () => { throw new Error("must not intercept"); }
  });
  const event = dispatch(handler, {
    method: "POST",
    url: APP_ORIGIN + "/api",
    mode: "same-origin"
  });

  assert.equal(event.called, false);
});

test("HTTP error responses are returned but never cached", async () => {
  const errorResponse = { ok: false, type: "basic", clone() { throw new Error("must not clone"); } };
  const { handler, stored } = createWorker({ fetchImpl: async () => errorResponse });
  const event = dispatch(handler, {
    method: "GET",
    url: APP_ORIGIN + "/data/missing.json",
    mode: "same-origin"
  });

  assert.equal(await event.responsePromise, errorResponse);
  assert.equal(stored.size, 0);
});

test("successful same-origin responses are cached without changing the response", async () => {
  const response = { ok: true, type: "basic", clone() { return { marker: "cached-response" }; } };
  const url = APP_ORIGIN + "/courses.css";
  const { handler, stored } = createWorker({ fetchImpl: async () => response });
  const event = dispatch(handler, { method: "GET", url, mode: "same-origin" });

  assert.equal(await event.responsePromise, response);
  assert.deepEqual(stored.get(url), { marker: "cached-response" });
});
