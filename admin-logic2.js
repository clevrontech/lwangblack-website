// ── PRODUCTS ──
function renderProducts(){
  const q=(document.getElementById('prodSearch')?.value||'').toLowerCase();
  const cat=document.getElementById('prodCat')?.value||'all';
  const stk=document.getElementById('prodStock')?.value||'all';
  const prods=Object.values(window.LB_PRODUCTS||{});
  const filtered=prods.filter(p=>{
    if(cat!=='all'&&p.category!==cat)return false;
    if(stk==='instock'&&(p.stock||0)<1)return false;
    if(stk==='low'&&((p.stock||0)>=10||(p.stock||0)<1))return false;
    if(stk==='out'&&(p.stock||0)>0)return false;
    if(q&&!p.name.toLowerCase().includes(q))return false;
    return true;
  });
  document.getElementById('productsBody').innerHTML=filtered.map(p=>{
    const s=p.stock||0,sc=s===0?'pill-red':s<10?'pill-yellow':'pill-green',sl=s===0?'Out of Stock':s<10?`Low (${s})`:`In Stock (${s})`;
    return`<tr>
      <td><img class="prod-thumb" src="${p.image}" loading="lazy" onerror="this.src='images/logo-hero.png'"/></td>
      <td><a class="tbl-link" onclick="openProductModal('${p.id}')">${p.name}</a></td>
      <td><span class="pill pill-blue">${p.category}</span></td>
      <td>${p.prices?.NP?.display||'—'}</td><td>${p.prices?.AU?.display||'—'}</td><td>${p.prices?.US?.display||'—'}</td>
      <td><span class="pill ${sc}">${sl}</span></td>
      <td style="font-size:.72rem;color:var(--muted)">${p.allowed_regions==='ALL'?'🌍 Global':(p.allowed_regions||[]).join(', ')}</td>
      <td><span class="pill ${s>0?'pill-green':'pill-red'}">${s>0?'Active':'Inactive'}</span></td>
      <td><div style="display:flex;gap:.4rem">
        <button class="btn btn-ghost btn-sm" onclick="openProductModal('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="if(confirm('Archive?'))showToast('Archived','success')">Archive</button>
      </div></td></tr>`;}).join('')||`<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">🛍️</div>No products found</div></td></tr>`;
}

function openProductModal(id){
  const p=(window.LB_PRODUCTS||{})[id];if(!p)return;
  const rs=['NP','AU','US','GB','CA','NZ','JP'];
  const syms={NP:'Rs',AU:'A$',US:'$',GB:'£',CA:'C$',NZ:'NZ$',JP:'¥'};
  document.getElementById('modalProductTitle').textContent=`Edit: ${p.name}`;
  document.getElementById('modalProductBody').innerHTML=`
    <input type="hidden" id="editProdId" value="${id}"/>
    <div style="display:flex;gap:1.25rem;margin-bottom:1.25rem;flex-wrap:wrap">
      <img src="${p.image}" style="width:100px;height:100px;border-radius:10px;object-fit:cover;border:1px solid var(--border)"/>
      <div style="flex:1;min-width:200px">
        <div class="form-row"><label class="form-label">Name</label><input class="form-input" id="ep-name" value="${p.name}"/></div>
        <div class="form-row"><label class="form-label">Stock</label><input class="form-input" id="ep-stock" type="number" value="${p.stock||0}"/></div>
      </div>
    </div>
    <div class="form-row"><label class="form-label">Description</label><textarea class="form-input" id="ep-desc" rows="3">${p.description||''}</textarea></div>
    <div class="form-label" style="margin-bottom:.75rem">Prices by Region</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:1rem">
      ${rs.map(r=>`<div><label class="form-label">${FLAGS[r]||''} ${r}</label><input class="form-input" id="ep-price-${r}" value="${p.prices?.[r]?.amount||''}" placeholder="${syms[r]}"/></div>`).join('')}
    </div>
    <div class="form-row"><label class="form-label">Available Regions</label>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.25rem">
        ${rs.map(r=>`<label style="display:flex;align-items:center;gap:.35rem;font-size:.8rem"><input type="checkbox" class="cb" id="ep-reg-${r}" ${p.allowed_regions==='ALL'||p.allowed_regions?.includes(r)?'checked':''}/>${FLAGS[r]||''} ${r}</label>`).join('')}
      </div>
    </div>`;
  openModal('modalProduct');
}

function openAddProductModal(){
  document.getElementById('modalProductTitle').textContent='Add New Product';
  document.getElementById('modalProductBody').innerHTML=`
    <div class="form-row"><label class="form-label">Name</label><input class="form-input" id="ep-name" placeholder="Product name"/></div>
    <div class="form-row"><label class="form-label">Category</label><select class="form-input" id="ep-cat"><option>coffee</option><option>accessories</option><option>bundles</option><option>apparel</option></select></div>
    <div class="form-row"><label class="form-label">Description</label><textarea class="form-input" id="ep-desc" rows="3"></textarea></div>
    <div class="form-row"><label class="form-label">Stock</label><input class="form-input" id="ep-stock" type="number" value="10"/></div>
    <div class="form-grid2">
      <div class="form-row"><label class="form-label">AUD Price</label><input class="form-input" id="ep-price-AU" placeholder="0.00"/></div>
      <div class="form-row"><label class="form-label">USD Price</label><input class="form-input" id="ep-price-US" placeholder="0.00"/></div>
    </div>`;
  openModal('modalProduct');
}

function saveProduct(){
  const id=document.getElementById('editProdId')?.value;
  if(id&&window.LB_PRODUCTS?.[id]){
    window.LB_PRODUCTS[id].stock=parseInt(document.getElementById('ep-stock')?.value)||0;
    window.LB_PRODUCTS[id].description=document.getElementById('ep-desc')?.value||window.LB_PRODUCTS[id].description;
    const syms={NP:'Rs',AU:'A$',US:'$',GB:'£',CA:'C$',NZ:'NZ$',JP:'¥'},curs={NP:'NPR',AU:'AUD',US:'USD',GB:'GBP',CA:'CAD',NZ:'NZD',JP:'JPY'};
    ['NP','AU','US','GB','CA','NZ','JP'].forEach(r=>{const v=parseFloat(document.getElementById(`ep-price-${r}`)?.value);if(v&&window.LB_PRODUCTS[id].prices)window.LB_PRODUCTS[id].prices[r]={amount:v,currency:curs[r],symbol:syms[r],display:`${syms[r]}${v.toLocaleString()}`};});
  }
  closeModal('modalProduct');renderProducts();showToast('Product saved','success');
}

// ── CUSTOMERS ──
function getCustomers(){
  const map={};
  allOrders.forEach(o=>{
    const k=o.customer?.email||o.id;
    if(!map[k])map[k]={...o.customer,country:o.country,orders:[],totalUSD:0};
    map[k].orders.push(o);map[k].totalUSD+=(o.total||0)*(RATES[o.currency]||1);map[k].lastOrder=o.date;
  });
  return Object.values(map);
}

function renderCustomers(){
  const q=(document.getElementById('custSearch')?.value||'').toLowerCase();
  const cc=document.getElementById('custCountry')?.value||'all';
  let custs=getCustomers();
  if(cc!=='all')custs=custs.filter(c=>c.country===cc);
  if(q)custs=custs.filter(c=>`${c.fname}${c.lname}${c.email}`.toLowerCase().includes(q));
  document.getElementById('customersBody').innerHTML=custs.map(c=>`<tr>
    <td><div style="display:flex;align-items:center;gap:.75rem"><div class="sb-avatar" style="width:32px;height:32px;font-size:.75rem">${(c.fname||'?')[0]}</div><div style="font-weight:600">${c.fname||'—'} ${c.lname||''}</div></div></td>
    <td style="color:var(--muted)">${c.email||'—'}</td>
    <td>${FLAGS[c.country]||''} ${CNAMES[c.country]||c.country}</td>
    <td>${c.orders.length}</td>
    <td style="font-weight:600;color:var(--accent2)">$${fmt(c.totalUSD)}</td>
    <td style="color:var(--muted);font-size:.72rem">${fmtDate(c.lastOrder)}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="openCustomerModal('${c.email||c.fname}')">View</button></td>
  </tr>`).join('')||`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👥</div>No customers found</div></td></tr>`;
}

function openCustomerModal(email){
  const c=getCustomers().find(x=>x.email===email||x.fname===email);if(!c)return;
  document.getElementById('modalCustomerTitle').textContent=`${c.fname} ${c.lname||''}`;
  document.getElementById('modalCustomerBody').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem">
      <div class="card" style="margin:0"><div class="card-title">Contact</div>
        <div style="font-size:.85rem;margin-top:.5rem"><div>${c.fname} ${c.lname||''}</div><div style="color:var(--muted)">${c.email||'—'}</div><div style="color:var(--muted)">${c.phone||'—'}</div><div style="color:var(--muted);margin-top:.4rem">${c.address||'—'}</div></div></div>
      <div class="card" style="margin:0"><div class="card-title">Summary</div>
        <div style="margin-top:.5rem"><div class="stat-val" style="font-size:1.5rem">$${fmt(c.totalUSD)}</div><div style="color:var(--muted);font-size:.8rem">Total spent · ${c.orders.length} orders</div></div>
        <div style="margin-top:.75rem;font-size:.8rem">${FLAGS[c.country]||''} ${CNAMES[c.country]||c.country}</div></div>
    </div>
    <div class="card" style="margin:0"><div class="card-title" style="margin-bottom:.75rem">Order History</div>
      <table class="tbl"><thead><tr><th>Order</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${c.orders.map(o=>`<tr><td><a class="tbl-link" onclick="closeModal('modalCustomer');openOrderModal('${o.id}')">${o.id}</a></td><td style="color:var(--muted)">${fmtDate(o.date)}</td><td>${o.symbol}${(o.total||0).toLocaleString()}</td><td>${pill(o.status)}</td></tr>`).join('')}</tbody></table></div>`;
  openModal('modalCustomer');
}

function exportCustomersCSV(){downloadCSV('customers.csv',[['Name','Email','Phone','Country','Orders','Total (USD)','Last Order'],...getCustomers().map(c=>[`${c.fname||''} ${c.lname||''}`,c.email||'',c.phone||'',CNAMES[c.country]||c.country,c.orders.length,fmt(c.totalUSD),fmtDate(c.lastOrder)])]);}

// ── DISCOUNTS ──
function getDiscounts(){return JSON.parse(localStorage.getItem('lb_discounts')||'[]');}
function saveDiscounts(d){localStorage.setItem('lb_discounts',JSON.stringify(d));}
function renderDiscounts(){
  const d=getDiscounts();
  document.getElementById('discountsList').innerHTML=d.length?d.map((x,i)=>`
    <div class="disc-card">
      <div style="flex:1"><div class="disc-code">${x.code}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:.25rem">${x.type==='percent'?x.value+'% off':'$'+x.value+' off'} · Min: ${x.min?'$'+x.min:'None'} · Limit: ${x.limit||'∞'} · Expires: ${x.expiry||'Never'} · Used ${x.used||0}x</div>
      </div>
      <span class="pill ${x.active!==false?'pill-green':'pill-red'}">${x.active!==false?'Active':'Inactive'}</span>
      <button class="btn btn-ghost btn-sm" onclick="toggleDiscount(${i})">${x.active!==false?'Pause':'Activate'}</button>
      <button class="btn btn-danger btn-sm" onclick="deleteDiscount(${i})">Delete</button>
    </div>`).join(''):`<div class="empty-state"><div class="empty-icon">🏷️</div><p>No discount codes yet.</p></div>`;
}
function openDiscountModal(){document.getElementById('disc-code').value='';document.getElementById('disc-value').value='';document.getElementById('disc-expiry').value='';openModal('modalDiscount');}
function genDiscCode(){const c='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';document.getElementById('disc-code').value='LB'+Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join('');}
function saveDiscount(){
  const code=document.getElementById('disc-code').value.trim().toUpperCase();
  if(!code){showToast('Enter a code','error');return;}
  const d={code,type:document.getElementById('disc-type').value,value:parseFloat(document.getElementById('disc-value').value)||0,min:parseFloat(document.getElementById('disc-min').value)||0,limit:parseInt(document.getElementById('disc-limit').value)||null,expiry:document.getElementById('disc-expiry').value||null,active:true,used:0,createdAt:new Date().toISOString()};
  const ds=getDiscounts();ds.unshift(d);saveDiscounts(ds);
  closeModal('modalDiscount');renderDiscounts();showToast(`Code ${code} created!`,'success');
}
function toggleDiscount(i){const d=getDiscounts();d[i].active=!d[i].active;saveDiscounts(d);renderDiscounts();}
function deleteDiscount(i){if(!confirm('Delete this code?'))return;const d=getDiscounts();d.splice(i,1);saveDiscounts(d);renderDiscounts();showToast('Deleted','success');}

// ── ANALYTICS ──
function renderAnalytics(){
  const orders=allOrders;
  const totalUSD=orders.reduce((s,o)=>s+(o.total||0)*(RATES[o.currency]||1),0);
  document.getElementById('analyticsStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-val">$${fmt(totalUSD)}</div><div class="stat-change up">↑ 24%</div></div>
    <div class="stat-card"><div class="stat-label">Orders</div><div class="stat-val">${orders.length}</div><div class="stat-change up">↑ 18%</div></div>
    <div class="stat-card"><div class="stat-label">Customers</div><div class="stat-val">${new Set(orders.map(o=>o.customer?.email)).size}</div><div class="stat-change up">↑ 12%</div></div>
    <div class="stat-card"><div class="stat-label">Avg Order</div><div class="stat-val">$${fmt(orders.length?totalUSD/orders.length:0)}</div><div class="stat-change up">↑ 5%</div></div>`;
  const bc={};orders.forEach(o=>{if(!bc[o.country])bc[o.country]={o:0,r:0};bc[o.country].o++;bc[o.country].r+=(o.total||0)*(RATES[o.currency]||1);});
  const cc=Object.keys(bc),lbls=cc.map(c=>`${FLAGS[c]||''}${c}`);
  const clrs=['rgba(46,98,76,.8)','rgba(116,185,255,.8)','rgba(255,209,102,.8)','rgba(255,107,107,.8)','rgba(162,155,254,.8)','rgba(76,175,135,.8)','rgba(253,171,61,.8)'];
  if(window._cRR)window._cRR.destroy();
  window._cRR=new Chart(document.getElementById('chartRegionRev'),{type:'bar',data:{labels:lbls,datasets:[{data:cc.map(c=>bc[c].r.toFixed(0)),backgroundColor:clrs,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'rgba(232,233,234,.4)',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'rgba(232,233,234,.4)',font:{size:10},callback:v=>'$'+v}}}}});
  if(window._cRO)window._cRO.destroy();
  window._cRO=new Chart(document.getElementById('chartRegionOrd'),{type:'bar',data:{labels:lbls,datasets:[{data:cc.map(c=>bc[c].o),backgroundColor:clrs,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'rgba(232,233,234,.4)',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'rgba(232,233,234,.4)',font:{size:10},stepSize:1}}}}});
  if(window._cTr)window._cTr.destroy();
  window._cTr=new Chart(document.getElementById('chartTraffic'),{type:'doughnut',data:{labels:['Home','Shop','Product','Catalogue','Reviews'],datasets:[{data:[38,28,18,10,6],backgroundColor:clrs,borderColor:'transparent'}]},options:{responsive:true,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:'rgba(232,233,234,.5)',font:{size:11},boxWidth:10}}}}});
  const funnel=[{lbl:'Visitors',n:2840,pct:100},{lbl:'Viewed Product',n:1124,pct:40},{lbl:'Added to Cart',n:412,pct:15},{lbl:'Started Checkout',n:198,pct:7},{lbl:'Purchased',n:orders.length,pct:Math.round(orders.length/28)}];
  document.getElementById('conversionFunnel').innerHTML=funnel.map(f=>`<div class="funnel-step"><span>${f.lbl}</span><div class="funnel-bar"><div class="funnel-fill" style="width:${f.pct}%"></div></div><span style="font-size:.75rem;font-weight:600">${f.n}</span></div>`).join('');
  const pm={};orders.forEach(o=>o.items?.forEach(it=>{pm[it.name]=(pm[it.name]||0)+(it.qty||1)*it.price*(RATES[o.currency]||1);}));
  const sorted=Object.entries(pm).sort((a,b)=>b[1]-a[1]).slice(0,6),mx=sorted[0]?.[1]||1;
  document.getElementById('topProductsBar').innerHTML=sorted.map(([n,v])=>`<div class="pbar-wrap"><div class="pbar-lbl"><span>${n}</span><span style="color:var(--accent2)">$${fmt(v)}</span></div><div class="pbar-bg"><div class="pbar-fill" style="width:${v/mx*100}%"></div></div></div>`).join('');
}

// ── FINANCE ──
function renderFinance(){
  const paid=allOrders.filter(o=>o.payment?.status==='paid');
  const totalUSD=paid.reduce((s,o)=>s+(o.total||0)*(RATES[o.currency]||1),0);
  const stripe=paid.filter(o=>o.payment?.method==='stripe'),esewa=paid.filter(o=>o.payment?.method==='esewa');
  document.getElementById('financeStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total Collected</div><div class="stat-val">$${fmt(totalUSD)}</div><div class="stat-change up">USD equivalent</div></div>
    <div class="stat-card"><div class="stat-label">Stripe</div><div class="stat-val">${stripe.length}</div><div class="stat-change up">transactions</div></div>
    <div class="stat-card"><div class="stat-label">eSewa</div><div class="stat-val">${esewa.length}</div><div class="stat-change up">Nepal</div></div>
    <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-val">${allOrders.filter(o=>o.payment?.status==='pending').length}</div><div class="stat-change down">awaiting</div></div>`;
  const byCur={};paid.forEach(o=>{if(!byCur[o.currency])byCur[o.currency]={total:0,n:0};byCur[o.currency].total+=o.total||0;byCur[o.currency].n++;});
  const mx=Math.max(...Object.values(byCur).map(x=>x.total),1);
  document.getElementById('revByCurrency').innerHTML=Object.entries(byCur).map(([c,d])=>`<div class="pbar-wrap"><div class="pbar-lbl"><span>${c}</span><span style="color:var(--accent2)">${d.total.toLocaleString()} (${d.n} orders)</span></div><div class="pbar-bg"><div class="pbar-fill" style="width:${d.total/mx*100}%"></div></div></div>`).join('');
  const pm={Stripe:stripe.length,eSewa:esewa.length,Pending:allOrders.filter(o=>o.payment?.status==='pending').length};
  if(window._cPM)window._cPM.destroy();
  window._cPM=new Chart(document.getElementById('chartPayMethods'),{type:'doughnut',data:{labels:Object.keys(pm),datasets:[{data:Object.values(pm),backgroundColor:['rgba(116,185,255,.7)','rgba(76,175,135,.7)','rgba(255,209,102,.7)'],borderColor:'transparent'}]},options:{responsive:true,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:'rgba(232,233,234,.5)',font:{size:11},boxWidth:10}}}}});
  document.getElementById('financeBody').innerHTML=[...allOrders].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(o=>`<tr>
    <td class="mono" style="color:var(--accent2)">${o.id}</td>
    <td>${pill(o.payment?.method||'—','info')}</td>
    <td style="font-weight:600">${o.symbol}${(o.total||0).toLocaleString()}</td>
    <td style="color:var(--muted)">${o.currency}</td>
    <td>${FLAGS[o.country]||''} ${o.country}</td>
    <td class="mono" style="color:var(--muted);font-size:.68rem">${o.payment?.ref||'—'}</td>
    <td style="color:var(--muted);font-size:.72rem">${fmtDate(o.date)}</td>
    <td>${pill(o.payment?.status||'pending')}</td>
  </tr>`).join('');
}
function exportFinanceCSV(){downloadCSV('finance.csv',[['Order','Method','Amount','Currency','USD','Country','Ref','Date','Status'],...allOrders.map(o=>[o.id,o.payment?.method||'',o.total,o.currency,fmt((o.total||0)*(RATES[o.currency]||1)),o.country,o.payment?.ref||'',fmtDate(o.date),o.payment?.status||''])]);}

// ── MARKETS ──
const marketToggles=JSON.parse(localStorage.getItem('lb_markets')||'{}');
const payMethods={NP:'eSewa + WhatsApp',AU:'Stripe + AfterPay',US:'Stripe + Google Pay',GB:'Stripe + Apple Pay',CA:'Stripe',NZ:'Stripe',JP:'Stripe + Convenience'};
function renderMarkets(){
  const bc={};allOrders.forEach(o=>{if(!bc[o.country])bc[o.country]={o:0,r:0};bc[o.country].o++;bc[o.country].r+=(o.total||0)*(RATES[o.currency]||1);});
  const CURRS={NP:'NPR',AU:'AUD',US:'USD',GB:'GBP',CA:'CAD',NZ:'NZD',JP:'JPY'},markets=['AU','NP','US','GB','CA','NZ','JP'];
  document.getElementById('marketStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Active Markets</div><div class="stat-val">${markets.filter(m=>marketToggles[m]!==false).length}</div><div class="stat-change up">of ${markets.length}</div></div>
    <div class="stat-card"><div class="stat-label">Top Market</div><div class="stat-val">🇦🇺 AU</div><div class="stat-change up">by revenue</div></div>
    <div class="stat-card"><div class="stat-label">Global Revenue</div><div class="stat-val">$${fmt(allOrders.reduce((s,o)=>s+(o.total||0)*(RATES[o.currency]||1),0))}</div><div class="stat-change up">USD total</div></div>
    <div class="stat-card"><div class="stat-label">Currencies</div><div class="stat-val">${markets.length}</div><div class="stat-change up">supported</div></div>`;
  document.getElementById('marketsBody').innerHTML=markets.map(m=>{const d=bc[m]||{o:0,r:0},on=marketToggles[m]!==false;return`<tr>
    <td>${FLAGS[m]||''} <b>${CNAMES[m]||m}</b></td>
    <td class="mono" style="color:var(--muted)">${CURRS[m]||'USD'}</td>
    <td>${d.o}</td><td>$${fmt(d.r)}</td>
    <td>$${d.o?fmt(d.r/d.o):'0'}</td>
    <td style="font-size:.72rem;color:var(--muted)">${payMethods[m]||'Stripe'}</td>
    <td><span class="pill ${on?'pill-green':'pill-red'}">${on?'Active':'Disabled'}</span></td>
    <td><label class="toggle-switch"><input type="checkbox" ${on?'checked':''} onchange="toggleMarket('${m}',this.checked)"/><span class="toggle-slider"></span></label></td>
  </tr>`;}).join('');
  loadIpLog();
}
function toggleMarket(m,on){marketToggles[m]=on;localStorage.setItem('lb_markets',JSON.stringify(marketToggles));showToast(`${CNAMES[m]} ${on?'enabled':'disabled'}`,'success');}

async function loadIpLog(){
  let log=[];
  try{const h=authToken!=='local'?{Authorization:`Bearer ${authToken}`}:{};const r=await fetch(`${API}/analytics/ip-log`,{headers:h});if(r.ok){const d=await r.json();log=d.log||[];}}catch{}
  if(!log.length){const ips=['203.0.113.1','198.51.100.5','45.32.100.1','103.21.244.1','192.0.2.2'],cs=['AU','NP','US','GB','NP','AU'];log=Array.from({length:18},(_,i)=>({ip:ips[i%5],country:cs[i%6],page:['/','/shop.html','/product.html'][i%3],time:new Date(Date.now()-i*240000).toISOString()}));}
  const byCnt={};log.forEach(e=>{byCnt[e.country]=(byCnt[e.country]||0)+1;});
  document.getElementById('ipList').innerHTML=log.slice(0,20).map(e=>`<div style="display:flex;gap:.75rem;padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.78rem;align-items:center"><span class="mono" style="color:var(--accent2);min-width:110px">${e.ip}</span><span>${FLAGS[e.country]||''} ${e.country}</span><span style="color:var(--muted);flex:1">${e.page||'/'}</span><span style="color:var(--muted);font-size:.68rem">${new Date(e.time).toLocaleTimeString()}</span></div>`).join('');
  if(window._cVis)window._cVis.destroy();
  const cc=Object.keys(byCnt),clrs=['rgba(46,98,76,.8)','rgba(116,185,255,.8)','rgba(255,209,102,.8)','rgba(255,107,107,.8)','rgba(162,155,254,.8)','rgba(76,175,135,.8)'];
  window._cVis=new Chart(document.getElementById('chartVisitors'),{type:'doughnut',data:{labels:cc.map(c=>`${FLAGS[c]||''}${c}`),datasets:[{data:Object.values(byCnt),backgroundColor:clrs,borderColor:'transparent'}]},options:{responsive:true,cutout:'62%',plugins:{legend:{position:'bottom',labels:{color:'rgba(232,233,234,.5)',font:{size:11},boxWidth:10}}}}});
}

// ── USERS ──
function getUsers(){
  const s=JSON.parse(localStorage.getItem('lb_custom_users')||'[]');
  return[{name:'Store Owner',username:'owner',role:'owner',country:null,email:'owner@lwangblack.com'},{name:'Nepal Manager',username:'nepal_mgr',role:'manager',country:'NP',email:'nepal@lwangblack.com.np'},{name:'Australia Manager',username:'australia_mgr',role:'manager',country:'AU',email:'australia@lwangblack.com.au'},{name:'US Manager',username:'us_mgr',role:'manager',country:'US',email:'us@lwangblackus.com'},{name:'UK Manager',username:'uk_mgr',role:'manager',country:'GB',email:'uk@lwangblack.co.uk'},{name:'Canada Manager',username:'canada_mgr',role:'manager',country:'CA',email:'canada@lwangblack.ca'},{name:'NZ Manager',username:'nz_mgr',role:'manager',country:'NZ',email:'nz@lwangblack.co.nz'},{name:'Japan Manager',username:'japan_mgr',role:'manager',country:'JP',email:'japan@lwangblack.jp'},...s];
}
function renderUsers(){
  document.getElementById('usersList').innerHTML=getUsers().map((u,i)=>`
    <div class="user-card">
      <div class="sb-avatar" style="width:42px;height:42px;font-size:.9rem;background:${u.role==='owner'?'#6e3aff':'var(--accent)'}">${(u.name||'?')[0]}</div>
      <div style="flex:1"><div style="font-weight:600">${u.name} <span class="pill ${u.role==='owner'?'pill-purple':'pill-blue'}" style="margin-left:.4rem">${u.role}</span></div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.2rem">${u.username} · ${u.email}${u.country?` · ${FLAGS[u.country]||''} ${CNAMES[u.country]||u.country}`:''}</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-ghost btn-sm" onclick="showToast('Reset link sent to ${u.email}','success')">Reset PW</button>
        ${i>7?`<button class="btn btn-danger btn-sm" onclick="deleteUser(${i-8})">Remove</button>`:''}
      </div>
    </div>`).join('');
}
function openAddUserModal(){openModal('modalUser');}
function saveUser(){
  const name=document.getElementById('user-name').value.trim(),username=document.getElementById('user-username').value.trim();
  if(!name||!username){showToast('Fill required fields','error');return;}
  const u={name,username,role:document.getElementById('user-role').value,country:document.getElementById('user-country').value||null,email:document.getElementById('user-email').value,createdAt:new Date().toISOString()};
  const s=JSON.parse(localStorage.getItem('lb_custom_users')||'[]');s.push(u);localStorage.setItem('lb_custom_users',JSON.stringify(s));
  const pass=document.getElementById('user-pass').value;
  if(pass){const c=JSON.parse(localStorage.getItem('lb_local_creds')||'{}');c[username]=pass;localStorage.setItem('lb_local_creds',JSON.stringify(c));}
  closeModal('modalUser');renderUsers();showToast(`User ${name} added`,'success');
}
function deleteUser(i){if(!confirm('Remove user?'))return;const s=JSON.parse(localStorage.getItem('lb_custom_users')||'[]');s.splice(i,1);localStorage.setItem('lb_custom_users',JSON.stringify(s));renderUsers();showToast('User removed','success');}

// ── MARKETING ──
function sendCampaign(){
  const name=document.getElementById('campName').value;if(!name){showToast('Enter campaign name','error');return;}
  const region=document.getElementById('campRegion').value;
  const count=getCustomers().filter(c=>region==='all'||c.country===region).length;
  showToast(`Campaign "${name}" sent to ${count} customers!`,'success');
  const hist=document.getElementById('campaignHistory');
  hist.innerHTML=`<div class="disc-card"><div style="flex:1"><div class="disc-code" style="font-size:.85rem;letter-spacing:1px">${name}</div><div style="font-size:.75rem;color:var(--muted);margin-top:.25rem">Sent to ${count} customers · ${region==='all'?'All regions':CNAMES[region]||region} · Just now</div></div><span class="pill pill-green">Sent</span></div>`+(hist.innerHTML||'');
}

// ── SETTINGS ──
function loadSettings(){
  const c=JSON.parse(localStorage.getItem('lb_admin_cfg')||'{}');
  ['name','email','whatsapp','stripe-pub','stripe-sec','esewa-id','esewa-sec'].forEach(k=>{const el=document.getElementById('cfg-'+k);if(el)el.value=c[k.replace('-','_')]||c[k]||'';});
}
function saveSettings(){
  const c={name:document.getElementById('cfg-name')?.value,email:document.getElementById('cfg-email')?.value,whatsapp:document.getElementById('cfg-whatsapp')?.value,stripe_pub:document.getElementById('cfg-stripe-pub')?.value,esewa_id:document.getElementById('cfg-esewa-id')?.value};
  localStorage.setItem('lb_admin_cfg',JSON.stringify(c));showToast('Settings saved','success');
}
function clearOrders(){localStorage.removeItem('lb_orders');loadOrders().then(renderHome);showToast('Orders cleared','success');}
function resetSettings(){localStorage.removeItem('lb_admin_cfg');loadSettings();showToast('Settings reset','success');}

// ── UTILITIES ──
function pill(status,type){
  const map={paid:'pill-green',delivered:'pill-green',active:'pill-green',shipped:'pill-blue',stripe:'pill-blue',esewa:'pill-green',pending:'pill-yellow',processing:'pill-yellow',failed:'pill-red',cancelled:'pill-red',info:'pill-blue'};
  return`<span class="pill ${type?map[type]:''}${!type?(map[status]||'pill-grey'):''}">${status}</span>`;
}
function fmt(n){return parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function fmtDate(d){try{return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch{return'—';}}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function showToast(msg,type='info'){
  const w=document.getElementById('toastWrap'),icons={success:'✅',error:'❌',info:'ℹ️'};
  const t=document.createElement('div');t.className=`toast ${type}`;t.innerHTML=`<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  w.appendChild(t);setTimeout(()=>t.remove(),3500);
}
function downloadCSV(filename,rows){
  const b=new Blob([rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;a.click();
}
function exportCSV(){const a=document.querySelector('.page.active')?.id||'';if(a==='page-orders')exportOrdersCSV();else if(a==='page-customers')exportCustomersCSV();else if(a==='page-finance')exportFinanceCSV();else showToast('No exportable data on this page','info');}
function globalSearch(v){if(!v)return;const q=v.toLowerCase();const m=allOrders.filter(o=>o.id.toLowerCase().includes(q)||(o.customer?.fname||'').toLowerCase().includes(q)||(o.customer?.email||'').toLowerCase().includes(q));if(m.length){goPage('orders');setTimeout(()=>{document.getElementById('ordSearch').value=v;renderOrders();},50);}else showToast('No results found','info');}
function openNewOrderModal(){showToast('Manual order creation — connect API for full support','info');}
function printInvoice(id){
  const o=allOrders.find(x=>x.id===id);if(!o)return;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${o.id}</title><style>body{font-family:Arial,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:.5rem;border:1px solid #ddd;text-align:left}h1{margin-bottom:.25rem}.total{font-weight:700}</style></head><body>
    <h1>Lwang Black</h1><p style="color:#666">Invoice: ${o.id} | Date: ${fmtDate(o.date)}</p><hr/>
    <h3>Bill To:</h3><p>${o.customer?.fname} ${o.customer?.lname}<br>${o.customer?.email}<br>${o.customer?.address}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
    ${(o.items||[]).map(i=>`<tr><td>${i.name}</td><td>${i.qty||1}</td><td>${o.symbol}${i.price}</td><td>${o.symbol}${(i.qty||1)*i.price}</td></tr>`).join('')}
    <tr><td colspan="3">Shipping</td><td>${o.symbol}${o.shipping||0}</td></tr>
    <tr class="total"><td colspan="3">TOTAL</td><td>${o.symbol}${o.total}</td></tr>
    </tbody></table><br><p>Thank you for your order! — lwangblack.com</p></body></html>`);
  w.print();
}

function saveOrderTracking(id){
  const o=allOrders.find(x=>x.id===id);if(!o)return;
  o.tracking=document.getElementById('trackingInput_'+id)?.value||'';
  o.status=document.getElementById('statusSelect_'+id)?.value||o.status;
  saveLocalOrders();showToast('Order updated','success');renderOrders();
}

// ── INIT ──
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('topbarDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  loadSettings();
  document.querySelector('#page-marketing #socialLinks') && (document.querySelector('#page-marketing #socialLinks').innerHTML=['Instagram','Facebook','TikTok','YouTube'].map((s,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;border-bottom:1px solid rgba(255,255,255,.04)"><span>${['📸','📘','🎵','▶️'][i]} ${s}</span><button class="btn btn-outline btn-sm" onclick="showToast('Opening ${s}...','info')">Manage</button></div>`).join(''));
  const tok=localStorage.getItem('lb_adm_token'),usr=localStorage.getItem('lb_adm_user');
  if(tok&&usr){
    authToken=tok;currentUser=JSON.parse(usr);
    if(tok!=='local'){fetch(`${API}/auth/verify`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json()).then(d=>{if(d.valid)currentUser=d.user;boot();}).catch(()=>boot());}
    else boot();
  }
  document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open'));});
});
