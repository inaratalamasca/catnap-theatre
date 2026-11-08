// Catnap Theatre helpers, version 0.2.0.
// Pure validation and display logic shared by content scripts and Node tests.
((scope) => {
  'use strict';
  const SCRIPT_VERSION = '0.2.0';
  const defaults = Object.freeze({schemaVersion:1,layout:'duet',fontSize:21,stripTags:false,background:'#090b14',brand:'Catnap Radio'});
  function settings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a Catnap settings JSON file.');
    if (input.schemaVersion !== 1) throw new Error('Unsupported settings format.');
    return {
      schemaVersion:1,
      layout:['duet','lineup','art'].includes(input.layout)?input.layout:'duet',
      fontSize:Math.max(14,Math.min(40,Number.isFinite(input.fontSize)?Math.round(input.fontSize):21)),
      stripTags:input.stripTags===true,
      background:/^#[0-9a-f]{6}$/i.test(input.background)?input.background:'#090b14',
      brand:typeof input.brand==='string'?input.brand.trim().slice(0,50):'Catnap Radio'
    };
  }
  function isCue(line) { return /^\s*\[[^\]\n]{1,300}\]\s*$/.test(String(line||'')); }
  function songId(href) {
    try { const u=new URL(href,'https://suno.com');return ['suno.com','www.suno.com'].includes(u.hostname)&&u.protocol==='https:'?u.pathname.match(/^\/song\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1]?.toLowerCase()||'':''; } catch { return ''; }
  }
  const api={SCRIPT_VERSION,defaults,settings,isCue,songId};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else scope.CatnapTheatre=api;
})(globalThis);
