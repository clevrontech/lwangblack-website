// LWANG BLACK ADMIN — Core Logic
const FLAGS={NP:'🇳🇵',AU:'🇦🇺',US:'🇺🇸',GB:'🇬🇧',CA:'🇨🇦',NZ:'🇳🇿',JP:'🇯🇵'};
const CNAMES={NP:'Nepal',AU:'Australia',US:'United States',GB:'United Kingdom',CA:'Canada',NZ:'New Zealand',JP:'Japan'};
const RATES={NPR:0.0075,AUD:0.63,GBP:1.27,CAD:0.74,NZD:0.60,USD:1,JPY:0.007};
const API='/api';
let currentUser=null,authToken=null,allOrders=[],orderSort={col:'date',dir:-1},orderTab='all',ordPage=1,bulkSelected=new Set();

// ── AUTH ──
async function doLogin(){
  const u=document.getElementById('lu').value.trim();
  const p=document.getElementById('lp').value;
  const err=document.getElementById('lerr');
  if(!u||!p){err.textContent='Fill all fields.';return;}
  try{
    const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const d=await r.json();
    if(!r.ok){err.textContent=d.error||'Invalid credentials.';return;}
    authToken=d.token;currentUser=d.user;
    localStorage.setItem('lb_adm_token',authToken);
    localStorage.setItem('lb_adm_user',JSON.stringify(currentUser));
    boot();
  }catch{
    const LOCAL=JSON.parse(localStorage.getItem('lb_local_creds')||'{}');
    const DEF={owner:'lwangblack2024',nepal_mgr:'lwangblack2024',australia_mgr:'lwangblack2024',us_mgr:'lwangblack2024',uk_mgr:'lwangblack2024',canada_mgr:'lwangblack2024',nz_mgr:'lwangblack2024',japan_mgr:'lwangblack2024'};
    const xp=LOCAL[u]||DEF[u];
    if(!xp||p!==xp){err.textContent='Invalid credentials.';return;}
    const CM={nepal_mgr:'NP',australia_mgr:'AU',us_mgr:'US',uk_mgr:'GB',canada_mgr:'CA',nz_mgr:'NZ',japan_mgr:'JP'};
    currentUser={username:u,role:u==='owner'?'owner':'manager',country:CM[u]||null,name:u.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),email:`${u}@lwangblack.com`};
    authToken='local';boot();
  }
}
function doLogout(){localStorage.removeItem('lb_adm_token');localStorage.removeItem('lb_adm_user');currentUser=null;authToken=null;document.getElementById('loginWrap').style.display='flex';document.getElementById('dashboard').style.display='none';}

function boot(){
  document.getElementById('loginWrap').style.display='none';
  document.getElementById('dashboard').style.display='flex';
  const isOwner=currentUser.role==='owner';
  document.getElementById('sbName').textContent=currentUser.name||currentUser.username;
  document.getElementById('sbRole').textContent=isOwner?'👑 Owner':`📍 ${CNAMES[currentUser.country]||currentUser.country||'Manager'}`;
  document.getElementById('sbAvatar').textContent=(currentUser.name||'A')[0].toUpperCase();
  document.querySelectorAll('.owner-only').forEach(el=>el.style.display=isOwner?'':'none');
  document.getElementById('topbarDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  loadOrders().then(()=>{renderHome();});
}

// ── NAVIGATION ──
function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg)pg.classList.add('active');
  const ni=document.getElementById('nav-'+id);
  if(ni)ni.classList.add('active');
  document.getElementById('topbarTitle').textContent=id.charAt(0).toUpperCase()+id.slice(1);
  const acts={orders:renderOrders,products:renderProducts,customers:renderCustomers,discounts:renderDiscounts,analytics:renderAnalytics,finance:renderFinance,markets:renderMarkets,users:renderUsers};
  if(acts[id])acts[id]();
  if(id==='markets')loadIpLog();
}

function globalSearch(v){
  if(!v){return;}
  const q=v.toLowerCase();
  const matches=allOrders.filter(o=>o.id.toLowerCase().includes(q)||(o.customer?.fname||'').toLowerCase().includes(q)||(o.customer?.lname||'').toLowerCase().includes(q)||(o.customer?.email||'').toLowerCase().includes(q));
  if(matches.length){goPage('orders');setTimeout(()=>{document.getElementById('ordSearch').value=v;renderOrders();},50);}
}

// ── DEMO DATA ──
function getDemoOrders(){
  return[
    {id:'LB-2450',date:new Date(Date.now()-86400000).toISOString(),status:'paid',country:'AU',currency:'AUD',symbol:'A$',items:[{name:'Lwang Black 250g',qty:2,price:27,image:'https://cdn2.blanxer.com/uploads/68b26f1169953999df49c53a/product_image-dsc07401-8095.webp'}],subtotal:54,shipping:14.99,total:68.99,carrier:'DHL',tracking:'',customer:{fname:'Emma',lname:'Wilson',email:'emma@email.au',phone:'+61412345678',address:'12 George St Sydney NSW 2000'},payment:{method:'stripe',status:'paid',ref:'pi_3abc123'}},
    {id:'LB-2449',date:new Date(Date.now()-172800000).toISOString(),status:'shipped',country:'AU',currency:'AUD',symbol:'A$',items:[{name:'Lwang Black 500g',qty:1,price:37},{name:'French Press',qty:1,price:34.99}],subtotal:71.99,shipping:14.99,total:86.98,carrier:'DHL',tracking:'DHL123456',customer:{fname:'Liam',lname:'Chen',email:'liam@email.au',phone:'+61487654321',address:'45 Collins St Melbourne VIC 3000'},payment:{method:'stripe',status:'paid',ref:'pi_3def456'}},
    {id:'LB-2448',date:new Date(Date.now()-259200000).toISOString(),status:'delivered',country:'NP',currency:'NPR',symbol:'Rs',items:[{name:'Lwang Black 500g',qty:2,price:2599}],subtotal:5198,shipping:0,total:5198,carrier:'Local',tracking:'',customer:{fname:'Aarav',lname:'Shrestha',email:'aarav@email.np',phone:'+977984123456',address:'Durbarmarg, Kathmandu'},payment:{method:'esewa',status:'paid',ref:'ESW-2448'}},
    {id:'LB-2447',date:new Date(Date.now()-345600000).toISOString(),status:'pending',country:'US',currency:'USD',symbol:'$',items:[{name:'Pot & Press Gift Set',qty:1,price:69.99}],subtotal:69.99,shipping:15,total:84.99,carrier:'DHL',tracking:'',customer:{fname:'Jake',lname:'Miller',email:'jake@email.us',phone:'+14155551234',address:'580 California St San Francisco CA'},payment:{method:'stripe',status:'pending',ref:null}},
    {id:'LB-2446',date:new Date(Date.now()-432000000).toISOString(),status:'paid',country:'GB',currency:'GBP',symbol:'£',items:[{name:'Lwang Black 250g',qty:1,price:11.99},{name:'T-Shirt',qty:1,price:15.99}],subtotal:27.98,shipping:11.99,total:39.97,carrier:'DHL',tracking:'',customer:{fname:'Oliver',lname:'Smith',email:'oliver@email.uk',phone:'+447911123456',address:'10 Finsbury Sq London EC2A'},payment:{method:'stripe',status:'paid',ref:'pi_3ghi789'}},
    {id:'LB-2445',date:new Date(Date.now()-518400000).toISOString(),status:'delivered',country:'CA',currency:'CAD',symbol:'C$',items:[{name:'LB Drip & Sip Set',qty:1,price:29.99}],subtotal:29.99,shipping:15.99,total:45.98,carrier:'DHL',tracking:'DHL789012',customer:{fname:'Sophie',lname:'Brown',email:'sophie@email.ca',phone:'+14165551234',address:'100 King St W Toronto ON'},payment:{method:'stripe',status:'paid',ref:'pi_3jkl012'}},
    {id:'LB-2444',date:new Date(Date.now()-604800000).toISOString(),status:'shipped',country:'NZ',currency:'NZD',symbol:'NZ$',items:[{name:'250g + 500g Lwang Black Bundle',qty:1,price:49.99}],subtotal:49.99,shipping:12.99,total:62.98,carrier:'DHL',tracking:'DHL345678',customer:{fname:'Ella',lname:'Taylor',email:'ella@email.nz',phone:'+6421345678',address:'151 Queen St Auckland'},payment:{method:'stripe',status:'paid',ref:'pi_3mno345'}},
    {id:'LB-2443',date:new Date(Date.now()-691200000).toISOString(),status:'cancelled',country:'JP',currency:'JPY',symbol:'¥',items:[{name:'Lwang Black 250g',qty:1,price:2299}],subtotal:2299,shipping:0,total:2299,carrier:'DHL',tracking:'',customer:{fname:'Yuki',lname:'Tanaka',email:'yuki@email.jp',phone:'+81312345678',address:'2-1-1 Nihonbashi Tokyo'},payment:{method:'stripe',status:'failed',ref:null}},
  ];
}

async function loadOrders(){
  try{
    const h=authToken!=='local'?{Authorization:`Bearer ${authToken}`}:{};
    const r=await fetch(`${API}/orders`,{headers:h});
    if(r.ok){const d=await r.json();allOrders=d.orders||[];return;}
  }catch{}
  const local=JSON.parse(localStorage.getItem('lb_orders')||'[]');
  allOrders=[...getDemoOrders(),...local];
  if(currentUser?.role==='manager'&&currentUser.country)allOrders=allOrders.filter(o=>o.country===currentUser.country);
  document.getElementById('ordBadge').textContent=allOrders.filter(o=>o.status==='pending').length||0;
}

// ── HOME ──
function renderHome(){
  const orders=allOrders;
  const totalUSD=orders.reduce((s,o)=>s+(o.total||0)*(RATES[o.currency]||1),0);
  const paid=orders.filter(o=>o.payment?.status==='paid');
  const paidUSD=paid.reduce((s,o)=>s+(o.total||0)*(RATES[o.currency]||1),0);
  const customers=new Set(orders.map(o=>o.customer?.email)).size;
  const avgOrder=orders.length?totalUSD/orders.length:0;

  document.getElementById('homeStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-val">$${fmt(totalUSD)}</div><div class="stat-change up">↑ 24% vs last month</div></div>
    <div class="stat-card"><div class="stat-label">Total Orders</div><div class="stat-val">${orders.length}</div><div class="stat-change up">↑ 18% this month</div></div>
    <div class="stat-card"><div class="stat-label">Customers</div><div class="stat-val">${customers}</div><div class="stat-change up">↑ 12% this month</div></div>
    <div class="stat-card"><div class="stat-label">Avg Order Value</div><div class="stat-val">$${fmt(avgOrder)}</div><div class="stat-change up">↑ 5% vs last month</div></div>`;

  // Revenue chart
  const days=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(29-i));return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});});
  const seed=Math.random();
  const revData=days.map((_,i)=>Math.floor(180+Math.sin(i*0.4+seed)*80+Math.random()*120));
  if(window._cRev)window._cRev.destroy();
  const ctx1=document.getElementById('chartRevenue').getContext('2d');
  window._cRev=new Chart(ctx1,{type:'line',data:{labels:days,datasets:[{data:revData,borderColor:'#4caf87',backgroundColor:'rgba(76,175,135,0.08)',fill:true,tension:0.4,pointRadius:0,borderWidth:2}]},options:{responsive:true,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+c.raw}}},scales:{x:{display:true,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,233,234,0.3)',font:{size:9},maxTicksLimit:6}},y:{display:true,grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,233,234,0.3)',font:{size:9},callback:v=>'$'+v}}}}});

  // Status donut
  const sc={};orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1;});
  if(window._cSt)window._cSt.destroy();
  const ctx2=document.getElementById('chartStatus').getContext('2d');
  window._cSt=new Chart(ctx2,{type:'doughnut',data:{labels:Object.keys(sc),datasets:[{data:Object.values(sc),backgroundColor:['rgba(255,209,102,.7)','rgba(76,175,135,.7)','rgba(116,185,255,.7)','rgba(78,205,196,.7)','rgba(255,107,107,.7)'],borderColor:'transparent',borderWidth:0}]},options:{responsive:true,cutout:'68%',plugins:{legend:{position:'bottom',labels:{color:'rgba(232,233,234,0.5)',font:{size:11},boxWidth:10,padding:12}}}}});

  // Best sellers
  const sm={};orders.forEach(o=>o.items?.forEach(it=>{sm[it.name]=(sm[it.name]||0)+(it.qty||1);}));
  const sorted=Object.entries(sm).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const mx=sorted[0]?.[1]||1;
  document.getElementById('bestSellers').innerHTML=sorted.map(([n,q])=>`<div class="pbar-wrap"><div class="pbar-lbl"><span>${n}</span><span style="color:var(--accent2)">${q} sold</span></div><div class="pbar-bg"><div class="pbar-fill" style="width:${q/mx*100}%"></div></div></div>`).join('');

  // Activity feed
  const acts=[
    {icon:'📦',text:`New order <b>${allOrders[0]?.id||'LB-2450'}</b> from ${allOrders[0]?.customer?.fname||'Emma'} ${allOrders[0]?.customer?.lname||'Wilson'}`,time:'2m ago'},
    {icon:'💳',text:'Payment confirmed via <b>Stripe</b> — A$68.99',time:'5m ago'},
    {icon:'🚚',text:`Order <b>${allOrders[1]?.id||'LB-2449'}</b> shipped via DHL`,time:'1h ago'},
    {icon:'👤',text:'New customer registered from Australia',time:'2h ago'},
    {icon:'🏷️',text:'Discount code <b>SAVE10</b> used — 3 times today',time:'3h ago'},
    {icon:'⭐',text:'New 5-star review from <b>Aarav S.</b>',time:'5h ago'},
  ];
  document.getElementById('activityFeed').innerHTML=acts.map(a=>`<div class="activity-item"><div class="act-icon">${a.icon}</div><div style="flex:1"><div style="font-size:.8rem">${a.text}</div></div><div class="act-time">${a.time}</div></div>`).join('');

  // Recent orders
  document.getElementById('recentOrders').innerHTML=orders.slice(0,5).map(o=>`
    <div class="ro-row" onclick="openOrderModal('${o.id}')">
      <span class="mono" style="color:var(--accent2)">${o.id}</span>
      <span>${o.customer?.fname||'—'} ${o.customer?.lname||''}</span>
      <span style="color:var(--muted);font-size:.78rem">${FLAGS[o.country]||''} ${CNAMES[o.country]||o.country}</span>
      <span>${o.symbol}${(o.total||0).toLocaleString()}</span>
      <span>${pill(o.status)}</span>
    </div>`).join('');
}

function setRevenueRange(days){
  const labels=Array.from({length:days},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(days-1-i));return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});});
  const data=labels.map(()=>Math.floor(150+Math.random()*500));
  if(window._cRev){window._cRev.data.labels=labels;window._cRev.data.datasets[0].data=data;window._cRev.update();}
}

// ── ORDERS ──
function setOrderTab(tab,el){
  orderTab=tab;ordPage=1;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  renderOrders();
}

function sortOrders(col){
  if(orderSort.col===col)orderSort.dir*=-1;else{orderSort.col=col;orderSort.dir=-1;}
  renderOrders();
}

function renderOrders(){
  const q=(document.getElementById('ordSearch')?.value||'').toLowerCase();
  const cf=document.getElementById('ordCountry')?.value||'all';
  const pf=document.getElementById('ordPayment')?.value||'all';

  let orders=[...allOrders];
  if(orderTab!=='all')orders=orders.filter(o=>o.status===orderTab);
  if(cf!=='all')orders=orders.filter(o=>o.country===cf);
  if(pf!=='all')orders=orders.filter(o=>o.payment?.method===pf);
  if(q)orders=orders.filter(o=>o.id.toLowerCase().includes(q)||(o.customer?.fname||'').toLowerCase().includes(q)||(o.customer?.lname||'').toLowerCase().includes(q)||(o.customer?.email||'').toLowerCase().includes(q));

  const dir=orderSort.dir;
  orders.sort((a,b)=>{
    if(orderSort.col==='id')return dir*(a.id>b.id?1:-1);
    if(orderSort.col==='total')return dir*((a.total||0)*(RATES[a.currency]||1)-(b.total||0)*(RATES[b.currency]||1));
    if(orderSort.col==='customer')return dir*((a.customer?.fname||'').localeCompare(b.customer?.fname||''));
    return dir*(new Date(b.date)-new Date(a.date));
  });

  const PP=15;const total=orders.length;const pages=Math.ceil(total/PP);
  if(ordPage>pages)ordPage=1;
  const paged=orders.slice((ordPage-1)*PP,ordPage*PP);

  document.getElementById('ordersBody').innerHTML=paged.length?paged.map(o=>`<tr>
    <td><input type="checkbox" class="cb bulk-cb" value="${o.id}" onchange="toggleBulk('${o.id}',this)"></td>
    <td><a class="tbl-link" onclick="openOrderModal('${o.id}')">${o.id}</a></td>
    <td>${o.customer?.fname||'—'} ${o.customer?.lname||''}<br><span style="font-size:.68rem;color:var(--muted)">${o.customer?.email||''}</span></td>
    <td>${FLAGS[o.country]||''} ${CNAMES[o.country]||o.country}</td>
    <td>${o.items?.length||0} item(s)</td>
    <td style="font-weight:600">${o.symbol}${(o.total||0).toLocaleString()}</td>
    <td>${pill(o.payment?.method==='stripe'?'stripe':'esewa','info')}</td>
    <td style="color:var(--muted);font-size:.72rem">${fmtDate(o.date)}</td>
    <td>${pill(o.status)}</td>
    <td><div style="display:flex;gap:.4rem">
      <button class="btn btn-ghost btn-sm" onclick="openOrderModal('${o.id}')">View</button>
      <select class="fselect" style="padding:.25rem .5rem;font-size:.62rem" onchange="updateStatus('${o.id}',this.value)">
        ${['pending','paid','shipped','delivered','cancelled'].map(s=>`<option value="${s}"${o.status===s?' selected':''}>${s}</option>`).join('')}
      </select>
    </div></td>
  </tr>`).join(''):`<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📭</div>No orders found</div></td></tr>`;

  // Pagination
  const pagEl=document.getElementById('ordersPagination');
  if(pages>1){
    pagEl.innerHTML=`<span>${(ordPage-1)*PP+1}–${Math.min(ordPage*PP,total)} of ${total}</span>
      <button class="btn btn-ghost btn-sm" onclick="ordPage=Math.max(1,ordPage-1);renderOrders()" ${ordPage===1?'disabled':''}>← Prev</button>
      <button class="btn btn-ghost btn-sm" onclick="ordPage=Math.min(${pages},ordPage+1);renderOrders()" ${ordPage===pages?'disabled':''}>Next →</button>`;
  }else pagEl.innerHTML='';
}

function toggleBulk(id,el){
  if(el.checked)bulkSelected.add(id);else bulkSelected.delete(id);
  document.getElementById('bulkActions').style.display=bulkSelected.size>0?'flex':'none';
}
function toggleBulkAll(el){
  document.querySelectorAll('.bulk-cb').forEach(c=>{c.checked=el.checked;if(el.checked)bulkSelected.add(c.value);else bulkSelected.delete(c.value);});
  document.getElementById('bulkActions').style.display=bulkSelected.size>0?'flex':'none';
}
function bulkUpdateStatus(status){
  bulkSelected.forEach(id=>updateStatus(id,status,true));
  bulkSelected.clear();renderOrders();showToast(`Updated ${[...bulkSelected].length||'selected'} orders to ${status}`,'success');
}

async function updateStatus(id,status,silent=false){
  try{const h={'Content-Type':'application/json'};if(authToken!=='local')h.Authorization=`Bearer ${authToken}`;await fetch(`${API}/orders/${id}`,{method:'PATCH',headers:h,body:JSON.stringify({status})});}catch{}
  const o=allOrders.find(o=>o.id===id);if(o){o.status=status;saveLocalOrders();}
  if(!silent){renderOrders();showToast(`Order ${id} → ${status}`,'success');}
}

function saveLocalOrders(){
  const demo=getDemoOrders().map(o=>o.id);
  const custom=allOrders.filter(o=>!demo.includes(o.id));
  localStorage.setItem('lb_orders',JSON.stringify(custom));
}

function openOrderModal(id){
  const o=allOrders.find(x=>x.id===id);if(!o)return;
  document.getElementById('modalOrderTitle').textContent=`Order ${o.id}`;
  const steps=['Ordered','Processing','Shipped','Delivered'];
  const stepIdx={pending:0,paid:1,shipped:2,delivered:3,cancelled:0};
  const si=stepIdx[o.status]??0;
  const tl=steps.map((s,i)=>`
    <div class="tl-step">
      <div class="tl-dot ${i<si?'done':i===si?'active':'future'}">${i<si?'✓':i+1}</div>
      <div class="tl-lbl">${s}</div>
    </div>
    ${i<steps.length-1?`<div class="tl-connector ${i<si?'done':'future'}"></div>`:''}`).join('');

  document.getElementById('modalOrderBody').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
      <div class="card" style="margin:0"><div class="card-title" style="margin-bottom:.75rem">Customer</div>
        <div style="font-weight:600">${o.customer?.fname} ${o.customer?.lname}</div>
        <div style="color:var(--muted);font-size:.8rem;margin-top:.25rem">${o.customer?.email||'—'}</div>
        <div style="color:var(--muted);font-size:.8rem">${o.customer?.phone||'—'}</div>
        <div style="color:var(--muted);font-size:.8rem;margin-top:.5rem">${o.customer?.address||'—'}</div>
      </div>
      <div class="card" style="margin:0"><div class="card-title" style="margin-bottom:.75rem">Payment</div>
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">${pill(o.payment?.method||'—','info')} ${pill(o.payment?.status||'pending')}</div>
        <div style="font-size:.8rem;color:var(--muted)">Amount: <b style="color:var(--text)">${o.symbol}${(o.total||0).toLocaleString()}</b></div>
        <div style="font-size:.8rem;color:var(--muted)">Ref: <span class="mono">${o.payment?.ref||'—'}</span></div>
        <div style="font-size:.8rem;color:var(--muted)">Date: ${fmtDate(o.date)}</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:1.25rem"><div class="card-title" style="margin-bottom:.75rem">Order Timeline</div><div class="tl">${tl}</div></div>
    <div class="card" style="margin-bottom:1.25rem"><div class="card-title" style="margin-bottom:.75rem">Items</div>
      <table class="tbl"><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>${(o.items||[]).map(it=>`<tr><td>${it.name}</td><td>${it.qty||1}</td><td>${o.symbol}${it.price?.toLocaleString()}</td><td>${o.symbol}${((it.qty||1)*it.price).toLocaleString()}</td></tr>`).join('')}
      <tr style="font-weight:600"><td colspan="3" style="text-align:right;padding-top:1rem">Shipping</td><td style="padding-top:1rem">${o.symbol}${(o.shipping||0).toLocaleString()}</td></tr>
      <tr style="font-weight:700"><td colspan="3" style="text-align:right">Total</td><td style="color:var(--accent2)">${o.symbol}${(o.total||0).toLocaleString()}</td></tr>
      </tbody></table>
    </div>
    <div class="card" style="margin:0"><div class="card-title" style="margin-bottom:.75rem">Shipping & Tracking</div>
      <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
        <input class="form-input" id="trackingInput_${o.id}" value="${o.tracking||''}" placeholder="Enter tracking number..." style="flex:1;min-width:180px"/>
        <select class="form-input" style="max-width:160px" id="statusSelect_${o.id}">
          ${['pending','paid','shipped','delivered','cancelled'].map(s=>`<option value="${s}"${o.status===s?' selected':''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="saveOrderTracking('${o.id}')">Save</button>
        <button class="btn btn-ghost" onclick="printInvoice('${o.id}')">🖨 Invoice</button>
        ${o.status!=='cancelled'?`<button class="btn btn-danger" onclick="if(confirm('Cancel order?')){updateStatus('${o.id}','cancelled');closeModal('modalOrder');}">Cancel</button>`:''}
      </div>
    </div>`;
  openModal('modalOrder');
}

function saveOrderTracking(id){
  const o=allOrders.find(x=>x.id===id);if(!o)return;
  o.tracking=document.getElementById('trackingInput_'+id)?.value||'';
  o.status=document.getElementById('statusSelect_'+id)?.value||o.status;
  saveLocalOrders();showToast('Order updated','success');renderOrders();
}

function printInvoice(id){
  const o=allOrders.find(x=>x.id===id);if(!o)return;
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Invoice ${o.id}</title><style>body{font-family:Arial,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:.5rem;border:1px solid #ddd;text-align:left}.total{font-weight:700;font-size:1.1rem}</style></head><body>
    <h1>Lwang Black</h1><p>Invoice: ${o.id} | Date: ${fmtDate(o.date)}</p><hr/>
    <h3>Bill To:</h3><p>${o.customer?.fname} ${o.customer?.lname}<br>${o.customer?.email}<br>${o.customer?.address}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
    ${(o.items||[]).map(it=>`<tr><td>${it.name}</td><td>${it.qty||1}</td><td>${o.symbol}${it.price}</td><td>${o.symbol}${((it.qty||1)*it.price)}</td></tr>`).join('')}
    <tr><td colspan="3">Shipping</td><td>${o.symbol}${o.shipping||0}</td></tr>
    <tr class="total"><td colspan="3">TOTAL</td><td>${o.symbol}${o.total}</td></tr>
    </tbody></table><br><p>Thank you for your order!</p></body></html>`);
  w.print();
}

function exportOrdersCSV(){
  const h=['Order ID','Customer','Email','Country','Total','Currency','Status','Date','Tracking','Payment Method','Payment Ref'];
  const rows=allOrders.map(o=>[o.id,`${o.customer?.fname||''} ${o.customer?.lname||''}`,o.customer?.email||'',CNAMES[o.country]||o.country,o.total,o.currency,o.status,fmtDate(o.date),o.tracking||'',o.payment?.method||'',o.payment?.ref||'']);
  downloadCSV('orders.csv',[h,...rows]);
}
// PART 2 APPENDED
