import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(end > start, `${name} must have a complete function body`);
  return source.slice(start, end);
}

const helperSource = [
  extractFunction("readStorageValue"),
  extractFunction("readStringSetStorage")
].join("\n");

function createReader(storage) {
  return vm.runInNewContext(`(() => {
    ${helperSource}
    return { readStorageValue, readStringSetStorage };
  })()`, {
    localStorage: storage,
    JSON,
    Set
  });
}

test("preserves valid string IDs from localStorage", () => {
  const { readStringSetStorage } = createReader({
    getItem: () => '["card-1","card-2"]'
  });

  assert.deepEqual(Array.from(readStringSetStorage("seen")), ["card-1", "card-2"]);
});

test("recovers from malformed JSON without aborting progress loading", () => {
  const { readStringSetStorage } = createReader({
    getItem: () => "{not-json"
  });

  assert.deepEqual(Array.from(readStringSetStorage("seen")), []);
});

test("ignores non-array JSON and invalid ID values", () => {
  const { readStringSetStorage } = createReader({
    getItem(key) {
      return key === "object" ? '{"card":"card-1"}' : '["card-1",7,null,"",{"id":"card-2"}]';
    }
  });

  assert.deepEqual(Array.from(readStringSetStorage("object")), []);
  assert.deepEqual(Array.from(readStringSetStorage("mixed")), ["card-1"]);
});

test("uses fallback values when localStorage access itself throws", () => {
  const reader = createReader({
    getItem() {
      throw new Error("storage unavailable");
    }
  });

  assert.equal(reader.readStorageValue("mode", "learning"), "learning");
  assert.deepEqual(Array.from(reader.readStringSetStorage("seen")), []);
});

test("startup storage readers use the defensive accessor", () => {
  for (const name of ["readBooleanStorage", "readModeStorage", "readQuizStats", "readAudioSpeedStorage"]) {
    assert.match(extractFunction(name), /readStorageValue\(/, `${name} must tolerate unavailable localStorage`);
  }

  assert.match(source, /const storedBatch = readStorageValue\(STORAGE_KEYS\.lastBatch\);/);
});
