import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const helperStart = source.indexOf("function readStringSetStorage(key) {");
const helperEnd = source.indexOf("\n}\n", helperStart) + 2;

assert.notEqual(helperStart, -1, "storage reader must exist");
assert.ok(helperEnd > helperStart, "storage reader must have a complete function body");

const helperSource = source.slice(helperStart, helperEnd);

function createReader(storage) {
  return vm.runInNewContext("(" + helperSource + ")", {
    localStorage: storage,
    JSON,
    Set
  });
}

test("preserves valid string IDs from localStorage", () => {
  const readStringSetStorage = createReader({
    getItem: () => '["card-1","card-2"]'
  });

  assert.deepEqual(Array.from(readStringSetStorage("seen")), ["card-1", "card-2"]);
});

test("recovers from malformed JSON without aborting app startup", () => {
  const readStringSetStorage = createReader({
    getItem: () => "{not-json"
  });

  assert.deepEqual(Array.from(readStringSetStorage("seen")), []);
});

test("ignores non-array JSON and invalid ID values", () => {
  const readStringSetStorage = createReader({
    getItem(key) {
      return key === "object" ? '{"card":"card-1"}' : '["card-1",7,null,"",{"id":"card-2"}]';
    }
  });

  assert.deepEqual(Array.from(readStringSetStorage("object")), []);
  assert.deepEqual(Array.from(readStringSetStorage("mixed")), ["card-1"]);
});

test("recovers when localStorage access itself throws", () => {
  const readStringSetStorage = createReader({
    getItem() {
      throw new Error("storage unavailable");
    }
  });

  assert.deepEqual(Array.from(readStringSetStorage("seen")), []);
});
