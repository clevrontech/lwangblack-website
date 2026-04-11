// ── api/_db.js ──────────────────────────────────────────────────────────────
// Shared Firebase Admin + Firestore client.
// Initialised once per cold-start; all API routes require() this file.

const admin = require('firebase-admin');

// Only initialise once (Vercel may reuse the runtime between invocations)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID   || 'lwang-black',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-fbsvc@lwang-black.iam.gserviceaccount.com',
        // Vercel stores \n literally in env vars — replace with real newlines
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  } catch (err) {
    // Already initialised in another export in the same worker
    if (!/already exists/.test(err.message)) throw err;
  }
}

const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a Firestore document as a plain object (includes doc.id).
 */
function docToObj(snap) {
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Return an array of plain objects from a Firestore query snapshot.
 */
function snapToArr(snap) {
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Seed the `users` collection with default accounts if it is empty.
 * Passwords are bcrypt-hashed; default is "lwangblack2024".
 */
async function seedUsersIfEmpty() {
  const col = db.collection('users');
  const snap = await col.limit(1).get();
  if (!snap.empty) return;

  const DEFAULT_HASH = '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK';

  const defaults = [
    { id: 'owner',   username: 'owner',          role: 'owner',   country: null, name: 'Store Owner',       email: 'owner@lwangblack.com',          password_hash: DEFAULT_HASH },
    { id: 'mgr_np',  username: 'nepal_mgr',       role: 'manager', country: 'NP', name: 'Nepal Manager',     email: 'nepal@lwangblack.com.np',        password_hash: DEFAULT_HASH },
    { id: 'mgr_au',  username: 'australia_mgr',   role: 'manager', country: 'AU', name: 'Australia Manager', email: 'australia@lwangblack.co',         password_hash: DEFAULT_HASH },
    { id: 'mgr_us',  username: 'us_mgr',          role: 'manager', country: 'US', name: 'US Manager',        email: 'us@lwangblackus.com',            password_hash: DEFAULT_HASH },
    { id: 'mgr_gb',  username: 'uk_mgr',          role: 'manager', country: 'GB', name: 'UK Manager',        email: 'uk@lwangblack.co.uk',            password_hash: DEFAULT_HASH },
    { id: 'mgr_ca',  username: 'canada_mgr',      role: 'manager', country: 'CA', name: 'Canada Manager',    email: 'canada@lwangblack.ca',           password_hash: DEFAULT_HASH },
    { id: 'mgr_nz',  username: 'nz_mgr',          role: 'manager', country: 'NZ', name: 'NZ Manager',        email: 'nz@lwangblack.co.nz',            password_hash: DEFAULT_HASH },
    { id: 'mgr_jp',  username: 'japan_mgr',       role: 'manager', country: 'JP', name: 'Japan Manager',     email: 'japan@lwangblack.jp',            password_hash: DEFAULT_HASH },
  ];

  const batch = db.batch();
  defaults.forEach(u => {
    batch.set(col.doc(u.id), { ...u, createdAt: new Date().toISOString() });
  });
  await batch.commit();
  console.log('[DB] Users seeded');
}

/**
 * Seed demo orders into Firestore if the orders collection is empty.
 */
async function seedOrdersIfEmpty() {
  const col = db.collection('orders');
  const snap = await col.limit(1).get();
  if (!snap.empty) return;

  const now = Date.now();
  const demoOrders = [
    { id:'LB-001', date:new Date(now-86400000*2).toISOString(), status:'delivered', country:'NP', currency:'NPR', symbol:'Rs', items:[{name:'Lwang Black 500g',qty:2,price:2599}], subtotal:5198, shipping:0, total:5198, carrier:'Local Courier', customer:{fname:'Aarav',lname:'Shrestha',email:'aarav@email.np',phone:'+977-9800000001'}, payment:{method:'nabil',status:'paid',ref:'NB-DEMO-001'} },
    { id:'LB-002', date:new Date(now-86400000*5).toISOString(), status:'shipped',   country:'AU', currency:'AUD', symbol:'A$', items:[{name:'Lwang Black 250g',qty:1,price:18.99},{name:'French Press',qty:1,price:24.99}], subtotal:43.98, shipping:12.50, total:56.48, carrier:'DHL', customer:{fname:'Emma',lname:'Wilson',email:'emma@email.au',phone:'+61400000002'}, payment:{method:'stripe',status:'paid',ref:'pi_demo_au_001'} },
    { id:'LB-003', date:new Date(now-86400000*1).toISOString(), status:'paid',      country:'US', currency:'USD', symbol:'$', items:[{name:'Pot & Press Gift Set',qty:1,price:59.99}], subtotal:59.99, shipping:15.00, total:74.99, carrier:'DHL Express', customer:{fname:'Jake',lname:'Miller',email:'jake@email.us',phone:'+12025550103'}, payment:{method:'stripe',status:'paid',ref:'pi_demo_us_001'} },
    { id:'LB-004', date:new Date(now-86400000*8).toISOString(), status:'delivered', country:'GB', currency:'GBP', symbol:'£', items:[{name:'Lwang Black 500g',qty:1,price:18.99},{name:'Classic T-Shirt',qty:1,price:15.99}], subtotal:34.98, shipping:14.00, total:48.98, carrier:'DHL', customer:{fname:'Oliver',lname:'Smith',email:'oliver@email.uk'}, payment:{method:'stripe',status:'paid',ref:'pi_demo_gb_001'} },
    { id:'LB-005', date:new Date(now-86400000*3).toISOString(), status:'pending',   country:'CA', currency:'CAD', symbol:'C$', items:[{name:'Drip Coffee Bags',qty:2,price:16.99}], subtotal:33.98, shipping:18.00, total:51.98, carrier:'DHL', customer:{fname:'Sophie',lname:'Brown',email:'sophie@email.ca'}, payment:{method:'stripe',status:'pending',ref:null} },
    { id:'LB-006', date:new Date(now-86400000*4).toISOString(), status:'paid',      country:'NZ', currency:'NZD', symbol:'NZ$', items:[{name:'Lwang Black 250g',qty:3,price:19.99}], subtotal:59.97, shipping:22.00, total:81.97, carrier:'DHL', customer:{fname:'Liam',lname:'Jones',email:'liam@email.nz'}, payment:{method:'stripe',status:'paid',ref:'pi_demo_nz_001'} },
    { id:'LB-2450', date:new Date(now-86400000).toISOString(), status:'paid', country:'AU', currency:'AUD', symbol:'A$', items:[{name:'Lwang Black 250g',qty:2,price:27}], subtotal:54, shipping:14.99, total:68.99, carrier:'DHL', tracking:'', customer:{fname:'Emma',lname:'Wilson',email:'emma@email.au',phone:'+61412345678',address:'12 George St Sydney NSW 2000'}, payment:{method:'paypal',status:'paid',ref:'PP-5X9284K'} },
    { id:'LB-2449', date:new Date(now-172800000).toISOString(), status:'shipped', country:'AU', currency:'AUD', symbol:'A$', items:[{name:'Lwang Black 500g',qty:1,price:37},{name:'French Press',qty:1,price:34.99}], subtotal:71.99, shipping:14.99, total:86.98, carrier:'DHL', tracking:'DHL123456', customer:{fname:'Liam',lname:'Chen',email:'liam@email.au',phone:'+61487654321',address:'45 Collins St Melbourne VIC 3000'}, payment:{method:'afterpay',status:'paid',ref:'AP-8876543'} },
    { id:'LB-2448', date:new Date(now-259200000).toISOString(), status:'delivered', country:'NP', currency:'NPR', symbol:'Rs', items:[{name:'Lwang Black 500g',qty:2,price:2599}], subtotal:5198, shipping:0, total:5198, carrier:'Local', tracking:'', customer:{fname:'Aarav',lname:'Shrestha',email:'aarav@email.np',phone:'+977984123456',address:'Durbarmarg, Kathmandu'}, payment:{method:'nabil',status:'paid',ref:'NB-2448'} },
  ];

  const batch = db.batch();
  demoOrders.forEach(o => batch.set(col.doc(o.id), o));
  await batch.commit();
  console.log('[DB] Demo orders seeded');
}

module.exports = { db, admin, docToObj, snapToArr, seedUsersIfEmpty, seedOrdersIfEmpty };
