const V='koora-v4';
const CA=V+'-app', CI=V+'-img', CD=V+'-api';
const SHELL=['./','./index.html','./manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&display=swap'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CA).then(c=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('koora-')&&![CA,CI,CD].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.pathname.includes('/api/')||u.hostname.includes('thesportsdb')||u.hostname.includes('api-sports')||u.hostname.includes('football-data')||u.hostname.includes('rss2json')){
    e.respondWith(netFirst(e.request,CD,6000)); return;
  }
  if(/\.(png|jpg|jpeg|webp|svg|ico)$/.test(u.pathname)){
    e.respondWith(cacheFirst(e.request,CI)); return;
  }
  e.respondWith(cacheFirst(e.request,CA));
});
async function netFirst(req,name,ms){
  const c=await caches.open(name);
  try{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),ms);
    const res=await fetch(req,{signal:ctrl.signal});
    clearTimeout(t);
    if(res.ok) c.put(req,res.clone());
    return res;
  }catch{return(await c.match(req))||offline()}
}
async function cacheFirst(req,name){
  const hit=await caches.match(req);
  if(hit) return hit;
  try{const res=await fetch(req);if(res.ok){const c=await caches.open(name);c.put(req,res.clone());}return res;}
  catch{return offline()}
}
function offline(){return new Response(JSON.stringify({success:false,offline:true}),{headers:{'Content-Type':'application/json'}})}
self.addEventListener('push',e=>{
  const d=e.data?.json()||{};
  e.waitUntil(self.registration.showNotification(d.title||'كووورة ⚽',{body:d.body||'تحديث جديد',icon:'/icon-192.png',badge:'/icon-72.png',dir:'rtl',lang:'ar',data:{url:d.url||'/'}}));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.openWindow(e.notification.data?.url||'/'));});
