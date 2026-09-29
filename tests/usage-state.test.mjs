import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationUsage} from '../src/usage-state.mjs';
test('usage survives pending turns and does not cross model, provider or session boundaries', () => {
 const selection={adapterId:'codex',modelId:'a'}, usage={contextUsage:{tokens:2000,contextWindow:10000},measuredAt:'saved'};
 const prior={selection,sessionId:'one',usage}, pending={selection};
 const chat={selection,sessionId:'one',turns:[prior,pending]};
 assert.equal(conversationUsage(chat),usage);
 pending.usage={limits:[]}; assert.equal(conversationUsage(chat),usage);
 pending.sessionId='two'; assert.equal(conversationUsage(chat),null);
 pending.sessionId='one'; chat.selection={...selection,modelId:'b'}; assert.equal(conversationUsage(chat),null);
 chat.selection={...selection,adapterId:'pi'}; assert.equal(conversationUsage(chat),null);
 assert.equal(conversationUsage({selection,turns:[]}),null);
});
