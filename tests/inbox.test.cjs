'use strict';
// Synthetic provider fixtures only. No live inbox, account or playlist requests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../extension/inbox-core.js');
const Reader = require('../extension/inbox-reader.js');
const songId = '11111111-2222-4333-8444-555555555555';
const secondSong = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const song = id => 'https://suno.com/song/' + id;
const inboxId = 'sample-show';
const mode = 'lp';
const providerRow = (id, values = {}) => ({id, status: 'pending', deleted: false, submission_type: 'LP',
  submitted_at: '2026-11-15 10:00:00', suno_url: song(songId), title: 'Sample song', artist: 'Sample artist',
  uploader_name: 'sample-uploader', message: 'An ordinary host note.', disclaimer_needed: false, ...values});
const normalize = rows => Core.normalizeRows(rows, {inboxId, mode});

test('Pending inbox preserves FIFO and observed bottom-up order for equal timestamps', () => {
  const result = normalize([
    providerRow('newest', {submitted_at: '2026-11-15 11:00:00'}),
    providerRow('tie-top', {submitted_at: '2026-11-15 10:00:00'}),
    providerRow('tie-bottom', {submitted_at: '2026-11-15 10:00:00'}),
    providerRow('oldest', {submitted_at: '2026-11-14 09:00:00'})
  ]);
  assert.deepEqual(result.entries.map(entry => entry.submissionId), ['oldest', 'tie-bottom', 'tie-top', 'newest']);
  assert.equal(result.orderBasis, 'submitted-at-oldest-first');
  assert.equal(result.entries[0].submittedAt, '2026-11-14 09:00:00');
  assert.equal(result.entries[0].id, inboxId + ':oldest');
});

test('missing timestamps use observed bottom-up order without guessing chronology', () => {
  const result = normalize([providerRow('top'), providerRow('middle', {submitted_at: null}), providerRow('bottom')]);
  assert.deepEqual(result.entries.map(entry => entry.submissionId), ['bottom', 'middle', 'top']);
  assert.equal(result.orderBasis, 'inbox-bottom-up');
});

test('retains paired sources and YouTube-only entries without Suno placeholders', () => {
  const result = normalize([
    providerRow('paired', {youtube_url: 'https://youtu.be/AbCdEfGhI12?t=20'}),
    providerRow('video-only', {suno_url: '', youtube_url: 'https://www.youtube.com/watch?v=ZyXwVuTsR98&list=irrelevant'}),
    providerRow('unsupported', {suno_url: 'https://unrelated.invalid/track/example', youtube_url: ''})
  ]);
  const paired = result.entries.find(entry => entry.submissionId === 'paired');
  assert.equal(paired.preferredSource, 'youtube');
  assert.equal(paired.sunoId, songId);
  assert.equal(paired.youtubeId, 'AbCdEfGhI12');
  assert.equal(paired.youtubeUrl, 'https://www.youtube.com/watch?v=AbCdEfGhI12');
  const video = result.entries.find(entry => entry.submissionId === 'video-only');
  assert.equal(video.state, 'queued');
  assert.equal(video.sunoUrl, null);
  assert.equal(result.entries.length, 3);
  assert.equal(result.held.length, 1);
  assert.equal(result.held[0].submissionId, 'unsupported');
});

test('flag normalization preserves Yes, No and unknown with private uploader context', () => {
  for (const value of [true, 1, 'YES', ' true ', '1']) assert.equal(Core.normalizeFlag(value), 'yes');
  for (const value of [false, 0, 'NO', ' false ', '0']) assert.equal(Core.normalizeFlag(value), 'no');
  for (const value of [null, undefined, '', 'not specified', [], {}]) assert.equal(Core.normalizeFlag(value), 'unknown');
  const entry = normalize([providerRow('note', {uploader_id: 'fixture-id', message: 'First paragraph\r\n\r\nSecond paragraph',
    disclaimer_needed: 'Yes', submit_to_radio: 'No', local_path: '/private/path', reviewer_id: 'secret-reviewer'})]).entries[0];
  assert.equal(entry.uploaderName, 'sample-uploader');
  assert.equal(entry.uploaderId, 'fixture-id');
  assert.equal(entry.note, 'First paragraph\n\nSecond paragraph');
  assert.equal(entry.disclaimer, 'yes');
  assert.equal(entry.radioPermission, 'no');
  assert.equal('local_path' in entry, false);
  assert.equal('reviewer_id' in entry, false);
});

test('excludes Accepted/deleted rows, identifies wrong show and keeps submission identity separate from song identity', () => {
  const result = normalize([
    providerRow('same-song-one'), providerRow('same-song-two'),
    providerRow('accepted', {status: 'accepted'}), providerRow('deleted', {deleted: true}),
    providerRow('wrong-show', {submission_type: 'AP'}), providerRow('same-song-one')
  ]);
  assert.equal(result.entries.length, 3);
  assert.equal(new Set(result.entries.map(entry => entry.id)).size, 3);
  assert.equal(result.entries.filter(entry => entry.sunoId === songId).length, 3);
  assert.match(result.entries.find(entry => entry.submissionId === 'wrong-show').holdReason, /show type/);
  assert.equal(result.entries.find(entry => entry.submissionId === 'wrong-show').state, 'held');
  assert.throws(() => normalize(Array(Core.MAX_ROWS + 1).fill({})), /oversized/);
  assert.throws(() => Core.normalizeRows([], {inboxId: '../other', mode: 'lp'}), /valid/);
});

test('canonical provider identities reject deceptive hosts and keep unresolved Suno shares explicit', () => {
  assert.equal(Core.parseSunoURL('https://suno.com.evil.invalid/song/' + songId), null);
  assert.equal(Core.parseSunoURL('https://name:password@suno.com/song/' + songId), null);
  assert.equal(Core.parseSunoURL('http://suno.com/song/' + songId), null);
  assert.deepEqual(Core.parseSunoURL('https://www.suno.com/s/Share_Code?utm=ignored'), {id: null, url: 'https://suno.com/s/Share_Code', shortCode: 'Share_Code'});
  assert.equal(Core.parseYouTubeURL('https://youtube.com.evil.invalid/watch?v=AbCdEfGhI12'), null);
  assert.equal(Core.parseYouTubeURL('https://youtu.be/invalid'), null);
  assert.equal(Core.parseYouTubeURL('https://m.youtube.com/shorts/AbCdEfGhI12').id, 'AbCdEfGhI12');
  assert.equal(normalize([providerRow('short', {suno_url: 'https://suno.com/s/Share_Code'})]).entries[0].sunoId, null);
});

test('refresh appends new arrivals without resetting playback state, current sources or existing order', () => {
  const before = normalize([providerRow('two', {suno_url: song(secondSong)}), providerRow('one')]).entries;
  before[0].state = 'playing'; before[0].playbackId = 'occurrence-1';
  before[1].state = 'completed';
  const incoming = normalize([
    providerRow('three', {submitted_at: '2026-11-15 12:00:00'}),
    providerRow('one', {youtube_url: 'https://youtu.be/AbCdEfGhI12', message: 'An updated note.'}),
    providerRow('two', {suno_url: song(secondSong)})
  ]).entries;
  const merged = Core.mergeEntries(before, incoming);
  assert.deepEqual(merged.map(entry => entry.submissionId), ['one', 'two', 'three']);
  assert.equal(merged[0].state, 'playing');
  assert.equal(merged[0].playbackId, 'occurrence-1');
  assert.equal(merged[0].preferredSource, 'suno');
  assert.equal(merged[0].youtubeUrl, null);
  assert.equal(merged[0].note, 'An updated note.');
  assert.equal(merged[1].state, 'completed');
  assert.equal(Core.mergeEntries(merged, []).length, 3);
  assert.equal(before[0].note, 'An ordinary host note.');
});
test('host order, holds, explicit repeat releases and played history survive refresh while arrivals append',()=>{
 const intake=normalize([providerRow('three'),providerRow('two'),providerRow('one')]).entries;
 const before=Core.mergeEntries([],intake);
 before[0].playedAt=1234;before[1].hostHeld=true;before[2].repeatHoldOverride=true;
 const ordered=[before[0],before[2],before[1]];
 const refreshed=normalize([providerRow('new'),providerRow('three'),providerRow('two'),providerRow('one')]).entries;
 const result=Core.applyQueuePolicy(Core.mergeEntries(ordered,refreshed),{repeatUploaderHold:true});
 assert.deepEqual(result.map(e=>e.submissionId),['one','three','two','new']);
 assert.equal(result[0].playedAt,1234);assert.equal(result[1].repeatHoldOverride,true);assert.equal(result[1].effectiveHeld,false);
 assert.equal(result[2].hostHeld,true);assert.equal(result[2].effectiveHeld,true);
 assert.deepEqual(result.map(e=>e.intakeOrder),[0,2,1,3]);
 assert.equal(result[3].repeatPredecessorId,inboxId+':three','predecessor follows original intake, not host display order');
});
test('repeat-uploader policy uses explicit IDs, ignores blank identities and releases one predecessor at a time',()=>{
 const all=Core.mergeEntries([],normalize([
  providerRow('three',{uploader_id:'stable-id',uploader_name:'Changed name'}),
  providerRow('two',{uploader_id:'stable-id'}),providerRow('one',{uploader_id:'stable-id'})
 ]).entries);
 let queue=Core.applyQueuePolicy(all,{repeatUploaderHold:true});
 assert.deepEqual(queue.map(e=>e.effectiveHeld),[false,true,true]);
 queue[0].playedAt=1;queue=Core.applyQueuePolicy(queue,{repeatUploaderHold:true});
 assert.deepEqual(queue.map(e=>e.effectiveHeld),[false,false,true]);
 queue[1].playedAt=2;assert.equal(Core.applyQueuePolicy(queue,{repeatUploaderHold:true})[2].effectiveHeld,false);
 const anonymous=Core.mergeEntries([],normalize([providerRow('a',{uploader_name:''}),providerRow('b',{uploader_name:''})]).entries);
 assert.equal(Core.applyQueuePolicy(anonymous,{repeatUploaderHold:true}).some(e=>e.effectiveHeld),false);
 const sourceHeld={...all[1],state:'held',holdReason:'Unsupported source',repeatHoldOverride:true};
 assert.equal(Core.applyQueuePolicy([sourceHeld],{repeatUploaderHold:true})[0].effectiveHoldReason,'Unsupported source');
});
test('manual Release permits a rare three-part chain across refresh without releasing another uploader repeat',()=>{
 let queue=Core.mergeEntries([],normalize([
  providerRow('other2',{uploader_id:'other'}),providerRow('other1',{uploader_id:'other'}),
  providerRow('part3',{uploader_id:'parts'}),providerRow('part2',{uploader_id:'parts'}),providerRow('part1',{uploader_id:'parts'})
 ]).entries);
 queue=Core.applyQueuePolicy(queue,{repeatUploaderHold:true});
 for(const entry of queue)if(['part2','part3'].includes(entry.submissionId))entry.repeatHoldOverride=true;
 queue=Core.applyQueuePolicy(Core.mergeEntries(queue,normalize([
  providerRow('other2',{uploader_id:'other'}),providerRow('other1',{uploader_id:'other'}),
  providerRow('part3',{uploader_id:'parts'}),providerRow('part2',{uploader_id:'parts'}),providerRow('part1',{uploader_id:'parts'})
 ]).entries),{repeatUploaderHold:true});
 assert.deepEqual(queue.slice(0,3).map(e=>e.effectiveHeld),[false,false,false]);
 assert.equal(queue.find(e=>e.submissionId==='other2').effectiveHeld,true);
});
const fairEntries=names=>Core.mergeEntries([],names.map(name=>normalize([providerRow(name,{uploader_id:name[0],title:name})]).entries[0]));
const readyIds=queue=>Core.playlistEntries(queue).map(entry=>entry.submissionId);
test('fair rotation appends only the exact finished predecessor successor behind the current accepted tail',()=>{
 let queue=Core.applyQueuePolicy(fairEntries(['X1','Y1','X2','Z1','X3']),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1']);
 assert.equal(queue.find(e=>e.submissionId==='X3').repeatPredecessorId,inboxId+':X2');
 queue=Core.applyQueuePolicy(queue,{repeatUploaderHold:true,protectedEntryId:inboxId+':X1'});
 assert.equal(queue.find(e=>e.submissionId==='X2').effectiveHeld,true,'Load alone is not a finish');
 queue=Core.applyQueuePolicy(Core.mergeEntries(queue,fairEntries(['W1'])),{repeatUploaderHold:true,protectedEntryId:inboxId+':X1'});
 queue=Core.applyQueuePolicy(Core.completeEntries(queue,[inboxId+':X1'],{now:100}),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1','W1','X2']);
 assert.equal(queue.find(e=>e.submissionId==='X3').effectiveHeld,true);
 queue=Core.applyQueuePolicy(Core.mergeEntries(queue,fairEntries(['V1'])),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1','W1','X2','V1'],'later arrival follows the already-admitted X2');
 for(const name of ['Y1','Z1','W1','X2'])queue=Core.applyQueuePolicy(Core.completeEntries(queue,[inboxId+':'+name],{now:200}),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1','W1','X2','V1','X3']);
 const before=JSON.stringify(queue);queue=Core.applyQueuePolicy(Core.completeEntries(queue,[inboxId+':X2',inboxId+':X1'],{now:999}),{repeatUploaderHold:true});
 assert.equal(JSON.stringify(queue),before,'duplicate completion cannot rotate again or rewrite first played order');
 queue=Core.applyQueuePolicy(Core.mergeEntries(queue,fairEntries(['X1','Y1','X2','Z1','X3','W1','V1'])),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1','W1','X2','V1','X3']);
});
test('actual completion order, late repeats and manual movements survive without FIFO reconstruction',()=>{
 let queue=Core.applyQueuePolicy(fairEntries(['X1','Y1','Z1']),{repeatUploaderHold:true});
 queue=Core.applyQueuePolicy(Core.completeEntries(queue,[inboxId+':Z1',inboxId+':X1'],{now:100}),{repeatUploaderHold:true});
 queue=Core.applyQueuePolicy(Core.mergeEntries(queue,fairEntries(['X2','W1'])),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['Z1','X1','Y1','W1','X2'],'a late eligible repeat joins the tail after accepted arrivals');
 const released=queue.find(e=>e.submissionId==='X2');assert.equal(released.repeatReleasedFor,inboxId+':X1');
 queue=[...queue.filter(e=>e!==released).slice(0,2),released,...queue.filter(e=>e!==released).slice(2)];
 queue=Core.applyQueuePolicy(queue,{repeatUploaderHold:true});assert.deepEqual(readyIds(queue),['Z1','X1','X2','Y1','W1'],'host move is not undone by repeat policy');
 assert.deepEqual(queue.filter(Core.wasPlayed).map(e=>e.playedOrder),[1,2]);
});
test('explicit manual Hold never auto-releases and declined repeats do not block their next surviving sibling',()=>{
 let queue=fairEntries(['X1','Y1','X2','Z1','X3']);queue.find(e=>e.submissionId==='X2').hostHeld=true;
 queue=Core.applyQueuePolicy(Core.completeEntries(queue,[inboxId+':X1'],{now:100}),{repeatUploaderHold:true});
 assert.equal(queue.find(e=>e.submissionId==='X2').effectiveHeld,true);assert.equal(queue.find(e=>e.submissionId==='X3').effectiveHeld,true);
 queue=Core.applyQueuePolicy(Core.releaseEntry(queue,inboxId+':X2'),{repeatUploaderHold:true});
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1','X2']);
 queue=Core.applyQueuePolicy(Core.mergeEntries(queue,fairEntries(['X1','Y1','X2','Z1','X3'])),{repeatUploaderHold:true});
 assert.equal(queue.find(e=>e.submissionId==='X2').repeatHoldOverride,true);
 queue.find(e=>e.submissionId==='X2').state='declined';queue=Core.applyQueuePolicy(queue,{repeatUploaderHold:true});
 assert.equal(queue.find(e=>e.submissionId==='X3').repeatPredecessorId,inboxId+':X1');
 assert.deepEqual(readyIds(queue),['X1','Y1','Z1','X3']);assert.equal(Core.isHeld(queue.find(e=>e.submissionId==='X2')),true);
});

test('discovery uses provider show/personal IDs without synthesizing a second managed LP', () => {
  const result = Core.discoverInboxes({hosts: [
    {id: 'sample-show', is_show: true, lp_show_name: 'Sample LP'},
    {id: '123456789012345678', is_show: false, lp_reason: 'Managed via show', ap_show_name: 'Sample AP', inbox_name: 'Host'},
    {id: 'standalone-host', lp_show_name: 'Independent LP'},
    {id: '../bad', is_show: true, name: 'Invalid'}
  ]});
  assert.deepEqual(result.lp.map(item => item.id), ['sample-show', 'lp_standalone-host']);
  assert.deepEqual(result.ap.map(item => item.id), ['ap_123456789012345678']);
  assert.equal(result.lp[0].name, 'Sample LP');
});

function response(body, status = 200) {
  return {status, ok: status >= 200 && status < 300, type: 'basic', text: async () => typeof body === 'string' ? body : JSON.stringify(body)};
}
function mockClient(routes) {
  const calls = [];
  const client = Reader.createClient({origin: Reader.ORIGIN, fetch: async (path, options) => {
    calls.push({path, options});
    if (!Object.hasOwn(routes, path)) throw Error('Unexpected fixture path: ' + path);
    return routes[path];
  }});
  return {client, calls};
}
const me = {id: 'fixture-account', hosts: [{id: inboxId, is_show: true, lp_show_name: 'Sample LP'}]};

test('reader performs same-origin GET only and projects only required show fields', async () => {
  const raw = providerRow('fixture', {local_path: '/private/file', storage_key: 'private-key', reviewer_id: 'private-reviewer'});
  const {client, calls} = mockClient({'/me': response(me), ['/inboxes/' + inboxId + '/summary']: response({pending: 1, accepted: 20, declined: 0, private: 'hidden'}),
    ['/inboxes/' + inboxId + '?status=pending']: response([raw])});
  const data = await client.readInbox(inboxId, 'lp');
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].message, raw.message);
  assert.equal('local_path' in data.rows[0], false);
  assert.equal('storage_key' in data.rows[0], false);
  assert.equal('private' in data.summary, false);
  assert.deepEqual(data.summary, {pending: 1, accepted: 20, declined: 0});
  assert.deepEqual(calls.map(call => call.path), ['/me', '/inboxes/' + inboxId + '/summary', '/inboxes/' + inboxId + '?status=pending']);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.cache, 'no-store');
    assert.equal('body' in call.options, false);
    assert.equal('Authorization' in call.options.headers, false);
  }
});

test('reader handles an empty AP and fallback host discovery without requesting Accepted history', async () => {
  const apId = 'ap_123456789012345678';
  const {client, calls} = mockClient({'/me': response({id: 'fixture-account', hosts: []}), '/hosts': response([{id: '123456789012345678', ap_show_name: 'Sample AP'}]),
    ['/inboxes/' + apId + '/summary']: response({pending: 0}), ['/inboxes/' + apId + '?status=pending']: response([])});
  assert.deepEqual((await client.readInbox(apId, 'ap')).rows, []);
  assert.equal(calls.some(call => call.path.includes('accepted')), false);
});

test('reader rejects unauthenticated, undiscovered, non-JSON and oversized data rather than treating it as success', async () => {
  assert.throws(() => Reader.createClient({origin: 'https://unrelated.invalid', fetch: async () => {}}), /signed-in/);
  for (const status of [401, 403, 302]) {
    const {client} = mockClient({'/me': response({}, status)});
    await assert.rejects(client.discover(), /Sign in/);
  }
  const discovery = mockClient({'/me': response(me)});
  await assert.rejects(discovery.client.readInbox('different-show', 'lp'), /not available/);
  assert.equal(discovery.calls.length, 1);
  await assert.rejects(mockClient({'/me': response('<html>Sign in</html>')}).client.discover(), /JSON/);
  await assert.rejects(mockClient({'/me': response('x'.repeat(Reader.MAX_BYTES + 1))}).client.discover(), /too large/);
  await assert.rejects(mockClient({'/me': response({}, 429)}).client.discover(), /rate limited/);
});

test('message adapter ignores foreign senders and rejects unknown or unapproved mutation operations', () => {
  let listener;
  const chrome = {runtime: {id: 'fixture-extension', onMessage: {addListener: callback => { listener = callback; }}}};
  Reader.install(chrome, Reader.ORIGIN);
  let replied = false;
  const reply = () => { replied = true; };
  assert.equal(listener({target: 'catnap-inbox', action: 'discover'}, {id: 'different-extension'}, reply), undefined);
  assert.equal(replied, false);
  assert.equal(listener({target: 'other-channel', action: 'discover'}, {id: 'fixture-extension'}, reply), undefined);
  assert.equal(replied, false);
  let refusal;
  listener({target: 'catnap-inbox', action: 'accept'}, {id: 'fixture-extension'}, value => { refusal = value; });
  assert.equal(refusal.ok, false);
  assert.match(refusal.error, /Unknown uploader operation/);
});
