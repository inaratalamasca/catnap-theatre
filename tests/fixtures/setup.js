// Fixture only: no real songs, identities, credentials or network data.
history.replaceState({},'', '/playlist/11111111-1111-4111-8111-111111111111');
window.chrome={runtime:{getURL:p=>'/extension/'+p},storage:{local:{get:async key=>({[key]:{schemaVersion:1,layout:'lineup',fontSize:23,stripTags:false,background:'#090b14',brand:'Catnap Radio'}}),set:async()=>{}}}};
