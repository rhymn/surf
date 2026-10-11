const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

test('read cursors persist per room and never move backwards', () => {
    const storage = new Map();
    const state = runInNewContext(`${readFileSync(join(__dirname, '../public/read-state.js'), 'utf8')}\nchatReadState;`, {
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
    });
    state.mark('aaaa', 12);
    state.mark('aaaa', 3);
    state.mark('bbbb', 5);
    assert.equal(state.get().aaaa, 12);
    assert.equal(state.get().bbbb, 5);
    state.mark('aaaa', -1);
    assert.equal(state.get().aaaa, 12);
    storage.set('readMessages', 'invalid');
    assert.equal(Object.keys(state.get()).length, 0);
    storage.set('readMessages', '{"aaaa":-1,"bbbb":5}');
    assert.equal(state.get().aaaa, undefined);
    assert.equal(state.get().bbbb, 5);
});