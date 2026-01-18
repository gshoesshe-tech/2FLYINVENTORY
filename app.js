/* 2FLY Internal Wholesale System (Static)
   - Supabase Auth (email+password)
   - Orders board + View button -> Order Details page
   - New Order (4 types) + Discount/Adjustment for all
   - Staff can edit discount/status/shipping costs ONLY for orders they created
   - Owner/Admin sees Dashboard + Growth Stats + Products/Inventory/Expenses
*/
(function(){
  const $main = document.getElementById('main');
  const $top = document.getElementById('top-actions');

  const fmtPeso = (n) => {
    const x = Number(n || 0);
    return x.toLocaleString('en-PH', { style:'currency', currency:'PHP' });
  };

  const escapeHtml = (s) => (s ?? '').toString()
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#039;");

  const qs = () => new URLSearchParams((location.hash.split('?')[1]||''));
  const route = () => (location.hash.split('?')[0] || '#/');

  function setTop(html){ $top.innerHTML = html || ''; }
  function render(html){ $main.innerHTML = html; }

  function toast(msg, kind='notice'){
    const el = document.createElement('div');
    el.className = kind === 'error' ? 'error' : 'notice';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.maxWidth = '420px';
    el.style.zIndex = 9999;
    el.innerHTML = `<div style="font-weight:800;margin-bottom:6px">${kind==='error'?'Error':'Notice'}</div><div class="small">${escapeHtml(msg)}</div>`;
    document.body.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 4200);
  }

  async function importSupabase(){
    try{
      return await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    }catch(e){
      throw new Error('Failed to load Supabase library. Check internet/CDN or try hard refresh.');
    }
  }

  function getConfig(){
    const cfg = (window.APP_CONFIG || {});
    const url = cfg.SUPABASE_URL;
    const key = cfg.SUPABASE_ANON_KEY;
    if(!url || !key || url.includes('PUT_SUPABASE') || key.includes('PUT_SUPABASE')){
      return null;
    }
    return { url, key };
  }

  let supabase = null;
  let session = null;

  // ===== Draft persistence =====
  function _draftKey(scope){
    const uid = session?.user?.id || 'anon';
    return `2fly:draft:${scope}:${uid}`;
  }
  function _loadDraft(scope){
    try{
      const raw = localStorage.getItem(_draftKey(scope));
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(obj && obj._ts && (Date.now() - obj._ts) > 14*24*60*60*1000){
        localStorage.removeItem(_draftKey(scope));
        return null;
      }
      return obj;
    }catch(e){ return null; }
  }
  function _saveDraft(scope, obj){
    try{
      localStorage.setItem(_draftKey(scope), JSON.stringify({ ...obj, _ts: Date.now() }));
    }catch(e){}
  }
  function _clearDraft(scope){
    try{ localStorage.removeItem(_draftKey(scope)); }catch(e){}
  }

  let profile = null; 
  let productsCache = null;

  async function init(){
    const cfg = getConfig();
    if(!cfg){
      render(`
        <div class="card">
          <div class="h1">Setup required</div>
          <div class="muted">Edit <code>config.js</code> and set your Supabase URL + Anon Key.</div>
        </div>
      `);
      setTop('');
      return;
    }

    const mod = await importSupabase();
    supabase = mod.createClient(cfg.url, cfg.key);

    const { data } = await supabase.auth.getSession();
    session = data.session || null;

    supabase.auth.onAuthStateChange((_evt, s) => {
      session = s || null;
      profile = null;
      productsCache = null;
      reroute();
    });

    window.addEventListener('hashchange', reroute);
    reroute();
  }

  async function loadProfile(){
    if(!session) return null;
    if(profile) return profile;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, commission_rate')
      .eq('id', session.user.id)
      .maybeSingle();

    if(error) throw new Error(error.message || 'Failed to load profile');
    if(!data){
      profile = { role:'staff', display_name: session.user.email?.split('@')[0] || 'staff', commission_rate: 0.30 };
      return profile;
    }
    profile = data;
    return profile;
  }

  function navFor(role){
    const isOwner = (role === 'owner' || role === 'admin');
    const base = [
      ['Orders', '#/orders?type=online'],
      ['New Order', '#/new'],
      ['My Commission', '#/my-commission'],
    ];
    const owner = [
      ['Dashboard', '#/dashboard'],
      ['Products', '#/products'],
      ['Inventory', '#/inventory'],
      ['Expenses', '#/expenses'],
      ['Receivables', '#/receivables'],
      ['Payables', '#/payables'],
    ];
    return isOwner ? base.concat(owner) : base;
  }

  function renderTopbar(){
    if(!session){
      setTop(`<a class="btn" href="#/login">Login</a>`);
      return;
    }
    const role = profile?.role || 'staff';
    const pills = `<span class="pill ${role==='owner'||role==='admin'?'good':'warn'}">${escapeHtml(role.toUpperCase())}</span>`;
    const links = navFor(role).map(([t,h]) => `<a class="btn" href="${h}">${escapeHtml(t)}</a>`).join('');
    setTop(`
      ${pills}
      <span class="muted small">${escapeHtml(profile?.display_name || session.user.email || '')}</span>
      ${links}
      <button class="btn danger" id="btnLogout">Logout</button>
    `);

    document.querySelectorAll('.orderTab').forEach((b) => {
      b.addEventListener('click', () => {
        const t = b.getAttribute('data-type') || 'online';
        location.hash = `#/orders?type=${encodeURIComponent(t)}`;
      });
    });
    const btn = document.getElementById('btnLogout');
    if(btn){
      btn.onclick = async () => { await supabase.auth.signOut(); };
    }
  }

  function requireAuth(){
    if(!session){
      location.hash = '#/login';
      return false;
    }
    return true;
  }

  function requireOwner(){
    const role = profile?.role || 'staff';
    if(role !== 'owner' && role !== 'admin'){
      render(`<div class="card"><div class="h1">Owner/Admin only</div><div class="muted">Access denied.</div></div>`);
      return false;
    }
    return true;
  }

  async function reroute(){
    try{
      if(session) await loadProfile();
      renderTopbar();
      const r = route();
      if(r === '#/' || r === '#'){ location.hash = session ? '#/orders' : '#/login'; return; }
      if(r === '#/login' && session){ location.hash = '#/orders'; return; }
      
      if(r === '#/login') return renderLogin();
      if(r === '#/orders') return renderOrders();
      if(r === '#/new') return renderNewOrder();
      if(r === '#/order') return renderOrderDetails();
      if(r === '#/my-commission') return renderMyCommission();
      if(r === '#/dashboard') return renderDashboard();
      if(r === '#/products') return renderProducts();
      if(r === '#/inventory') return renderInventory();
      if(r === '#/expenses') return renderExpenses();
      if(r === '#/receivables') return renderReceivables();
      if(r === '#/payables') return renderPayables();

      render(`<div class="card"><div class="h1">Not found</div><div class="muted">Unknown route.</div></div>`);
    }catch(err){
      render(`<div class="card error"><div class="h1">Error</div><div class="small">${escapeHtml(err.message)}</div></div>`);
      console.error(err);
    }
  }

  function renderLogin(){
    if(session){ location.hash = '#/orders'; return; }
    setTop('');
    render(`
      <div class="card">
        <div class="h1">Login</div>
        <div class="muted">2FLY Wholesale System</div>
        <div class="hr"></div>
        <div class="grid cols-2">
          <div><div class="label">Email</div><input id="email" class="input" /></div>
          <div><div class="label">Password</div><input id="pass" class="input" type="password" /></div>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="btnLogin">Login</button>
          <button class="btn" id="btnSignup">Sign up</button>
        </div>
      </div>
    `);
    document.getElementById('btnLogin').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pass').value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) toast(error.message, 'error');
    };
    document.getElementById('btnSignup').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pass').value;
      const { error } = await supabase.auth.signUp({ email, password });
      if(error) toast(error.message, 'error'); else toast('Signup successful. Login now.');
    };
  }

  async function ensureProducts(){
    if(productsCache) return productsCache;
    const { data, error } = await supabase
      .from('inventory_view')
      .select('sku, name, category, qty_on_hand, sell_price')
      .order('category', { ascending:true })
      .order('sku', { ascending:true });
    if(error) throw new Error(error.message);
    productsCache = data || [];
    return productsCache;
  }

  function statusPill(status){
    const s = (status||'').toLowerCase();
    if(s === 'completed') return `<span class="pill good">COMPLETED</span>`;
    if(s === 'cancelled') return `<span class="pill bad">CANCELLED</span>`;
    if(s === 'shipped') return `<span class="pill warn">SHIPPED</span>`;
    return `<span class="pill">${escapeHtml(s.toUpperCase()||'PENDING')}</span>`;
  }

  // -----------------
  // Orders List
  // -----------------
  async function renderOrders(){
    if(!requireAuth()) return;
    const role = profile.role;
    const typeParam = (qs().get('type') || 'online').toLowerCase();
    const filterType = ['online','lalamove','walkin','tiktok'].includes(typeParam) ? typeParam : 'online';

    const { data, error } = await supabase
      .from('orders_board')
      .select('*')
      .eq('order_type', filterType)
      .order('created_at', { ascending:false })
      .limit(200);

    if(error) throw new Error(error.message);

    const rows = (data||[]).map(o => {
      const canEdit = (role === 'owner' || role === 'admin' || o.created_by_id === session.user.id);
      const isNegative = Number(o.discount_amount) < 0; 
      return `
        <tr data-oid="${escapeHtml(o.id)}">
          <td>
            <div style="font-weight:900">
              <a class="btn" style="padding:6px 10px" href="#/order?id=${encodeURIComponent(o.order_code)}">View</a>
              <span style="margin-left:8px">${escapeHtml(o.order_code)}</span>
            </div>
            <div class="muted small">${new Date(o.created_at).toLocaleString()}</div>
          </td>
          <td>
            ${statusPill(o.status)}
            <div style="margin-top:8px">
              <select class="input statusSel" data-oid="${escapeHtml(o.id)}" style="padding:8px 10px">
                ${['pending','paid','packed','shipped','completed','cancelled'].map(s => `<option value="${s}" ${String(o.status).toLowerCase()===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </td>
          <td>
            <div style="font-weight:800">${escapeHtml(o.customer_name||'')}</div>
            <div class="muted small">${escapeHtml(o.region||'')}</div>
          </td>
          <td>
            <div class="muted small">Ship Paid: <b>${fmtPeso(o.shipping_paid)}</b></div>
            <div class="muted small" style="${isNegative ? 'color:var(--accent)' : ''}">
              ${isNegative ? 'Markup/Fee' : 'Discount'}: <b>${fmtPeso(Math.abs(o.discount_amount))}</b>
            </div>
            <div class="muted small">By: ${escapeHtml(o.created_by_name||'')}</div>
          </td>
          <td>
            <div class="label">Adj / Discount (+/- ₱)</div>
            <input class="input discInp" data-oid="${escapeHtml(o.id)}" type="number" step="1" value="${Number(o.discount_amount||0)}" ${canEdit?'':'disabled'} />
            <div class="label">Reason</div>
            <input class="input discReason" data-oid="${escapeHtml(o.id)}" value="${escapeHtml(o.discount_reason||'')}" ${canEdit?'':'disabled'} />
            <div class="row" style="margin-top:10px">
              <button class="btn primary saveBtn" data-oid="${escapeHtml(o.id)}">Save</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">Orders</div>
            <div class="muted">Track and manage orders.</div>
          </div>
          <a class="btn primary" href="#/new">+ New Order</a>
        </div>
        <div class="order-tabs" style="margin-top:12px">
          ${['online','lalamove','walkin','tiktok'].map(t=>`<button class="tab orderTab ${filterType===t?'active':''}" data-type="${t}">${t.toUpperCase()}</button>`).join('')}
        </div>
        <div class="hr"></div>
        <div class="tablewrap">
          <table>
            <thead><tr><th>ORDER</th><th>STATUS</th><th>CUSTOMER</th><th>FINANCIALS</th><th>ACTIONS</th></tr></thead>
            <tbody>${rows || ''}</tbody>
          </table>
        </div>
      </div>
    `);

    document.querySelectorAll('.saveBtn').forEach(btn=>{
      btn.onclick = async () => {
        const oid = btn.dataset.oid;
        const status = document.querySelector(`.statusSel[data-oid="${CSS.escape(oid)}"]`)?.value;
        const disc = Number(document.querySelector(`.discInp[data-oid="${CSS.escape(oid)}"]`)?.value || 0);
        const reason = (document.querySelector(`.discReason[data-oid="${CSS.escape(oid)}"]`)?.value || '').trim();
        const { error } = await supabase.rpc('staff_update_order', {
          p_order_id: oid, p_status: status, p_discount_amount: disc, p_discount_reason: reason, 
          p_shipping_paid: null, p_courier_cost: null
        });
        if(error) toast(error.message, 'error'); else { toast('Saved.'); reroute(); }
      };
    });
  }

  // -----------------
  // New Order
  // -----------------
  function itemRowTemplate(p, qty=1){
    const stock = (p.qty_on_hand ?? 0);
    return `
      <tr data-sku="${escapeHtml(p.sku)}">
        <td><b>${escapeHtml(p.sku)}</b><div class="muted small">${escapeHtml(p.category)}</div></td>
        <td>${escapeHtml(p.name)}</td>
        <td><span class="pill ${stock<=0?'bad':stock<5?'warn':'good'}">${stock}</span></td>
        <td><input class="input qty" type="number" min="1" step="1" value="${qty}" style="padding:8px 10px" /></td>
        <td><div class="small muted">@ ${fmtPeso(p.sell_price)}</div></td>
        <td><button class="btn danger rm">Remove</button></td>
      </tr>
    `;
  }

  async function renderNewOrder(){
    if(!requireAuth()) return;
    await ensureProducts();

    const DRAFT_SCOPE = 'new_order';
    const draft = _loadDraft(DRAFT_SCOPE) || {};

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">New Order</div>
            <div class="muted">Supports retail pricing via adjustment/markup.</div>
          </div>
          <a class="btn" href="#/orders?type=online">Back to Orders</a>
        </div>
        <div class="hr"></div>

        <div class="grid cols-2">
          <div>
            <div class="label">Order Type</div>
            <select id="orderType" class="input">
              <option value="online">Online</option>
              <option value="lalamove">Lalamove</option>
              <option value="walkin">Walk-in</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          <div id="regionWrap">
            <div class="label">Region (Online)</div>
            <select id="region" class="input">
              <option value="">-- Select --</option>
              <option value="luzon">Luzon</option>
              <option value="visayas">Visayas</option>
              <option value="mindanao">Mindanao</option>
            </select>
          </div>
        </div>

        <div class="grid cols-2" style="margin-top:10px">
          <div id="shipWrap">
            <div class="label">Shipping Paid (by Customer)</div>
            <input id="shippingPaid" class="input" type="number" value="0" />
          </div>
          <div id="courierWrap">
            <div class="label">Our Courier Cost (Actual)</div>
            <input id="courierCost" class="input" type="number" value="0" placeholder="e.g. 54" />
            <div class="muted small">Auto-suggests standard rate, but you can edit.</div>
          </div>
        </div>
        
        <div class="grid cols-2" style="margin-top:10px">
          <div>
            <div class="label">Discount / Adjustment (₱)</div>
            <input id="discount" class="input" type="number" value="0" />
            <div class="muted small">Positive = Discount. Negative = Retail Markup / Fee.</div>
          </div>
          <div><div class="label">Adjustment Reason</div><input id="discountReason" class="input" placeholder="required if adj != 0" /></div>
        </div>
        
        <!-- Retail Helper Tool -->
        <div class="notice" style="margin-top:10px; display:flex; align-items:center; gap:10px;">
          <div style="flex:1">
            <div style="font-weight:800; color:var(--warn)">Retail Price Mode</div>
            <div class="small">Selling at retail? Click to auto-calculate markup (surcharge) based on items.</div>
          </div>
          <button class="btn primary" id="btnRetailCalc">Apply Retail Markup (+40%)</button>
        </div>

        <div class="grid cols-2" style="margin-top:10px">
          <div><div class="label">Customer Name</div><input id="customerName" class="input" /></div>
          <div><div class="label">FB Link</div><input id="fbLink" class="input" /></div>
          <div><div class="label">Phone</div><input id="phone" class="input" /></div>
        </div>
        <div style="margin-top:10px"><div class="label">Delivery Address / Notes</div><textarea id="notes" class="input" placeholder="Full Address Here..."></textarea></div>

        <div class="hr"></div>

        <div class="grid cols-2">
          <div class="card" style="padding:12px">
            <div class="h2">Add items</div>
            <datalist id="skuList">
              ${productsCache.map(p => `<option value="${escapeHtml(p.sku)}">${escapeHtml(p.name)} • Stock ${Number(p.qty_on_hand)}</option>`).join('')}
            </datalist>
            <div class="row" style="margin-top:10px">
              <input id="skuInput" class="input" list="skuList" placeholder="Search SKU..." style="flex:1" />
              <button class="btn" id="btnAddSku">Add</button>
            </div>
            <div class="label" style="margin-top:10px">Bulk paste (SKU QTY)</div>
            <textarea id="bulkPaste" class="input"></textarea>
            <div class="row" style="margin-top:10px"><button class="btn" id="btnParse">Add pasted</button></div>
          </div>

          <div class="card" style="padding:12px">
            <div class="h2">Cart <span id="cartTotal" class="muted small" style="float:right">Total: ₱0</span></div>
            <div class="tablewrap" style="margin-top:10px">
              <table style="min-width:400px">
                <thead><tr><th>SKU</th><th>NAME</th><th>STK</th><th>QTY</th><th>PRICE</th><th></th></tr></thead>
                <tbody id="itemsBody"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="hr"></div>
        <div class="row">
          <button class="btn primary" id="btnSubmit">Submit Order</button>
        </div>
      </div>
    `);

    // Restore draft
    if(draft.orderType) document.getElementById('orderType').value = draft.orderType;
    if(draft.region) document.getElementById('region').value = draft.region;
    if(draft.shippingPaid) document.getElementById('shippingPaid').value = draft.shippingPaid;
    if(draft.courierCost) document.getElementById('courierCost').value = draft.courierCost; 
    if(draft.discount) document.getElementById('discount').value = draft.discount;
    if(draft.customerName) document.getElementById('customerName').value = draft.customerName;
    if(draft.fbLink) document.getElementById('fbLink').value = draft.fbLink;
    if(draft.phone) document.getElementById('phone').value = draft.phone;
    if(draft.discountReason) document.getElementById('discountReason').value = draft.discountReason;
    if(draft.notes) document.getElementById('notes').value = draft.notes;

    const itemsMap = new Map();
    if(Array.isArray(draft.items)){
      draft.items.forEach(it => {
        const p = productsCache.find(x => x.sku === it.sku);
        if(p) itemsMap.set(p.sku, { sku: p.sku, qty: it.qty, product: p });
      });
    }

    function saveForm(){
      const cur = {
        orderType: document.getElementById('orderType').value,
        region: document.getElementById('region').value,
        shippingPaid: document.getElementById('shippingPaid').value,
        courierCost: document.getElementById('courierCost').value,
        discount: document.getElementById('discount').value,
        customerName: document.getElementById('customerName').value,
        fbLink: document.getElementById('fbLink').value,
        phone: document.getElementById('phone').value,
        discountReason: document.getElementById('discountReason').value,
        notes: document.getElementById('notes').value,
        items: Array.from(itemsMap.values()).map(x=>({sku:x.sku, qty:x.qty}))
      };
      _saveDraft(DRAFT_SCOPE, cur);
    }
    
    // Auto-save listeners
    ['orderType','region','shippingPaid','courierCost','discount','customerName','fbLink','phone','discountReason','notes'].forEach(id=>{
      const el = document.getElementById(id);
      el.addEventListener('change', saveForm);
      el.addEventListener('input', saveForm);
    });

    function refreshItems(){
      const tbody = document.getElementById('itemsBody');
      tbody.innerHTML = '';
      let subtotal = 0;
      for(const [sku, obj] of itemsMap.entries()){
        subtotal += (obj.product.sell_price || 0) * obj.qty;
        tbody.insertAdjacentHTML('beforeend', itemRowTemplate(obj.product, obj.qty));
      }
      document.getElementById('cartTotal').textContent = `Total: ${fmtPeso(subtotal)}`;
      
      tbody.querySelectorAll('tr').forEach(tr=>{
        const sku = tr.dataset.sku;
        tr.querySelector('.rm').onclick = () => { itemsMap.delete(sku); refreshItems(); saveForm(); };
        tr.querySelector('.qty').onchange = (e) => {
          itemsMap.get(sku).qty = Math.max(1, parseInt(e.target.value||'1',10));
          refreshItems(); saveForm();
        };
      });
    }
    refreshItems();

    function addSku(sku, qty=1){
      sku = (sku||'').trim();
      const p = productsCache.find(x => String(x.sku).toLowerCase() === sku.toLowerCase());
      if(!p){ toast(`SKU not found: ${sku}`, 'error'); return; }
      const cur = itemsMap.get(p.sku);
      if(cur) cur.qty += qty;
      else itemsMap.set(p.sku, { sku: p.sku, qty: qty, product: p });
      refreshItems(); saveForm();
    }

    const skuInput = document.getElementById('skuInput');
    document.getElementById('btnAddSku').onclick = () => { addSku(skuInput.value, 1); skuInput.value=''; skuInput.focus(); };
    skuInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); addSku(skuInput.value, 1); skuInput.value=''; } });

    document.getElementById('btnParse').onclick = () => {
      const txt = document.getElementById('bulkPaste').value;
      const lines = txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      for(const line of lines){
        const m = line.split(/\s+/);
        addSku(m[0], parseInt(m[1]||1, 10));
      }
      document.getElementById('bulkPaste').value = '';
    };

    document.getElementById('btnRetailCalc').onclick = () => {
      let subtotal = 0;
      for(const obj of itemsMap.values()) subtotal += (obj.product.sell_price || 0) * obj.qty;
      const markup = subtotal * 0.40; // 40% markup
      document.getElementById('discount').value = -Math.round(markup);
      document.getElementById('discountReason').value = "Retail Price (40% Markup)";
      toast(`Applied 40% markup: +${fmtPeso(markup)} (Total: ${fmtPeso(subtotal + markup)})`);
      saveForm();
    };

    const orderType = document.getElementById('orderType');
    const region = document.getElementById('region');
    
    // Auto-suggest logic
    region.onchange = () => {
      const r = region.value;
      let cost = 0;
      if(r === 'luzon') cost = 54;
      else if(r === 'visayas') cost = 79;
      else if(r === 'mindanao') cost = 79;
      
      const current = document.getElementById('courierCost').value;
      if(cost > 0 && (current == 0 || current == '')) {
         document.getElementById('courierCost').value = cost;
      }
      saveForm();
    };

    function toggleShipping(){
      const isOnline = (orderType.value === 'online');
      document.getElementById('regionWrap').style.display = isOnline ? '' : 'none';
      document.getElementById('shipWrap').style.display = isOnline ? '' : 'none';
      document.getElementById('courierWrap').style.display = isOnline ? '' : 'none';
    }
    orderType.onchange = () => { toggleShipping(); saveForm(); };
    toggleShipping();

    document.getElementById('btnSubmit').onclick = async () => {
      const t = orderType.value;
      const r = document.getElementById('region').value;
      const sp = Number(document.getElementById('shippingPaid').value || 0);
      const cc = Number(document.getElementById('courierCost').value || 0);
      const d = Number(document.getElementById('discount').value || 0);
      const dr = (document.getElementById('discountReason').value || '').trim();
      const cn = (document.getElementById('customerName').value || '').trim();
      const fb = (document.getElementById('fbLink').value || '').trim();
      const ph = (document.getElementById('phone').value || '').trim();
      const nt = (document.getElementById('notes').value || '').trim();

      if(!cn){ toast('Customer name is required.', 'error'); return; }
      if(t === 'walkin' && !ph){ toast('Phone number required for Walk-in.', 'error'); return; }
      if(d !== 0 && !dr){ toast('Reason required for adjustment.', 'error'); return; }
      if(itemsMap.size === 0){ toast('No items in order.', 'error'); return; }

      const items = Array.from(itemsMap.values()).map(x=>({ sku: x.sku, qty: x.qty }));
      
      const payload = {
        p_order_type: t, p_region: t==='online'?r:null, 
        p_shipping_paid: t==='online'?sp:0,
        p_courier_cost: t==='online'?cc:0,
        p_discount_amount: d, p_discount_reason: dr,
        p_customer_name: cn, p_profile_link: fb, p_phone_number: ph, p_notes: nt,
        p_items: items
      };
      
      const { data, error } = await supabase.rpc('create_order_v3', payload);
      if(error){ toast(error.message, 'error'); return; }
      
      toast('Order submitted.');
      _clearDraft(DRAFT_SCOPE);
      productsCache = null; 
      location.hash = `#/order?id=${encodeURIComponent(data)}`;
    };
  }

  // -----------------
  // Order Details (UPDATED WITH COPY & PRINT)
  // -----------------
  async function renderOrderDetails(){
    if(!requireAuth()) return;
    const idParam = (qs().get('id') || '').trim();
    if(!idParam){ render(`<div class="card"><div class="h1">Missing id</div></div>`); return; }

    const isCode = /^ORD-/i.test(idParam);
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_code, created_at, updated_at, order_type, status, customer_name, profile_link, phone_number, notes, region, shipping_paid, courier_cost, created_by, discount_amount, discount_reason')
      .eq(isCode ? 'order_code' : 'id', idParam)
      .maybeSingle();

    if(error || !order){ render(`<div class="card error"><div class="h1">Not Found</div></div>`); return; }

    const role = profile.role;
    const isOwner = (role === 'owner' || role === 'admin');
    const canEdit = isOwner || (order.created_by === session.user.id);

    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id).order('created_at');
    
    const skus = [...new Set((items||[]).map(x=>x.sku))];
    let nameMap = {};
    if(skus.length){
      const { data: ps } = await supabase.from('products').select('sku, name').in('sku', skus);
      (ps||[]).forEach(p => nameMap[p.sku] = p.name);
    }

    const rows = (items||[]).map(it => {
      const line = Number(it.sell_price_at_time||0) * Number(it.qty||0);
      return `<tr><td><b>${escapeHtml(it.sku)}</b></td><td>${escapeHtml(nameMap[it.sku]||'')}</td><td>${it.qty}</td><td>${fmtPeso(it.sell_price_at_time)}</td><td>${fmtPeso(line)}</td></tr>`;
    }).join('');

    const sub = (items||[]).reduce((a,it) => a + (it.sell_price_at_time*it.qty), 0);
    const cogs = (items||[]).reduce((a,it) => a + (it.unit_cost_at_time*it.qty), 0);
    const disc = Number(order.discount_amount||0);
    const finalTotal = sub - disc; 
    const profit = finalTotal - cogs;
    
    const sPaid = Number(order.shipping_paid||0);
    const cCost = Number(order.courier_cost||0);
    const shipProfit = (order.order_type==='online') ? (sPaid - cCost) : 0;
    
    render(`
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <div class="grow"><div class="h1">${escapeHtml(order.order_code)}</div><div class="muted small">${new Date(order.created_at).toLocaleString()}</div></div>
          <div class="row">
            <button class="btn" id="btnCopy">Copy</button>
            <button class="btn" id="btnPrint">Print Waybill</button>
            <a class="btn" href="#/orders">Back</a>
          </div>
        </div>
        <div class="hr"></div>

        <div class="grid cols-3">
          <div class="kpi">
            <div class="num">${fmtPeso(finalTotal)}</div>
            <div class="cap">Net Sales (Items)</div>
            <div class="muted small">Sub ${fmtPeso(sub)} • ${disc>0?'Disc':'Markup'} ${fmtPeso(Math.abs(disc))}</div>
          </div>
          <div class="kpi">
            <div class="num" style="color:${shipProfit<0?'var(--danger)':'inherit'}">${fmtPeso(shipProfit)}</div>
            <div class="cap">Shipping Profit</div>
            <div class="muted small">${fmtPeso(sPaid)} - ${fmtPeso(cCost)} (Cost)</div>
          </div>
          <div class="kpi">
            <div class="num">${fmtPeso(profit + shipProfit)}</div>
            <div class="cap">Total Gross Profit</div>
            <div class="muted small">Items Profit + Ship Profit</div>
          </div>
        </div>

        <div class="hr"></div>
        <div class="grid cols-2">
          <div>
            <div class="h2">Customer</div>
            <div style="font-weight:900">${escapeHtml(order.customer_name)}</div>
            <div class="muted small">Phone: ${escapeHtml(order.phone_number||'—')}</div>
            <div class="muted small">Address/Notes: ${escapeHtml(order.notes||'—')}</div>
            <div class="hr"></div>
            
            <div class="h2">Shipping Financials</div>
            <div class="notice" style="margin-bottom:10px">
              <div class="small"><b>Profit Check:</b> Edit "Actual Courier Cost" if actual differs from standard.</div>
            </div>
            <div class="grid cols-2">
              <div>
                <div class="label">Customer Paid (₱)</div>
                <input id="shipPaid" class="input" type="number" value="${sPaid}" ${canEdit?'':'disabled'} />
              </div>
              <div>
                <div class="label">Actual Courier Cost (₱)</div>
                <input id="courierCost" class="input" type="number" value="${cCost}" ${canEdit?'':'disabled'} />
              </div>
            </div>
          </div>

          <div>
            <div class="h2">Order Status & Adjustment</div>
            <div class="label">Status</div>
            <select id="st" class="input" ${canEdit?'':'disabled'}>
              ${['pending','paid','packed','shipped','completed','cancelled'].map(s => `<option value="${s}" ${order.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <div class="label" style="margin-top:8px">Adjustment / Discount</div>
            <input id="disc" class="input" type="number" value="${disc}" ${canEdit?'':'disabled'} />
            <div class="label" style="margin-top:8px">Reason</div>
            <input id="reas" class="input" value="${escapeHtml(order.discount_reason||'')}" ${canEdit?'':'disabled'} />
            
            <div class="row" style="margin-top:20px">
              <button class="btn primary" id="btnSave" ${canEdit?'':'disabled'} style="width:100%">Save Changes</button>
            </div>
          </div>
        </div>

        <div class="hr"></div>
        <div class="tablewrap">
          <table style="min-width:600px"><thead><tr><th>SKU</th><th>NAME</th><th>QTY</th><th>PRICE</th><th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>
    `);

    // Copy to Clipboard
    document.getElementById('btnCopy').onclick = () => {
      const text = `
ORDER: ${order.order_code}
NAME: ${order.customer_name}
PHONE: ${order.phone_number || 'N/A'}
REGION: ${order.region || 'N/A'}
FB: ${order.profile_link || 'N/A'}
----------------
${(items||[]).map(i => `${i.qty}x ${nameMap[i.sku] || i.sku}`).join('\n')}
----------------
TOTAL: ${fmtPeso(finalTotal)}
ADDRESS/NOTES: ${order.notes || ''}
      `.trim();
      navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard')).catch(()=>toast('Failed to copy','error'));
    };

    // Print Thermal Waybill
    document.getElementById('btnPrint').onclick = () => {
      const w = window.open('', '_blank', 'width=400,height=600');
      w.document.write(`
        <html>
        <head>
          <title>Print Order</title>
          <style>
            body{ font-family: sans-serif; padding:10px; font-size:12px; max-width: 300px; margin:0 auto; }
            .h{ font-weight:bold; font-size:16px; margin-bottom:5px; }
            .row{ display:flex; justify-content:space-between; margin-bottom:2px; }
            .hr{ border-top:1px dashed #000; margin: 10px 0; }
            .center{ text-align:center; }
            .big{ font-size:14px; font-weight:bold; }
          </style>
        </head>
        <body>
          <div class="center h">2FLY WHOLESALE</div>
          <div class="center">${order.order_code}</div>
          <div class="hr"></div>
          <div class="big">${order.customer_name}</div>
          <div class="big">${order.phone_number || ''}</div>
          <div>${order.region ? order.region.toUpperCase() : ''}</div>
          <div style="font-size:10px; margin-top:4px">${order.profile_link || ''}</div>
          <div class="hr"></div>
          ${(items||[]).map(i => `<div class="row"><span>${i.qty}x ${nameMap[i.sku] || i.sku}</span><span>${fmtPeso(i.sell_price_at_time * i.qty)}</span></div>`).join('')}
          <div class="hr"></div>
          <div class="row big"><span>TOTAL</span><span>${fmtPeso(finalTotal)}</span></div>
          ${order.shipping_paid > 0 ? `<div class="row" style="font-size:10px"><span>(Ship Paid: ${fmtPeso(order.shipping_paid)})</span></div>` : ''}
          <div class="hr"></div>
          <div style="font-weight:bold">DELIVERY ADDRESS / NOTES:</div>
          <div style="white-space:pre-wrap;">${order.notes || 'None'}</div>
          <script>window.print();</script>
        </body>
        </html>
      `);
      w.document.close();
    };

    document.getElementById('btnSave')?.addEventListener('click', async ()=>{
      const st = document.getElementById('st').value;
      const d = Number(document.getElementById('disc').value);
      const r = document.getElementById('reas').value;
      const sp = Number(document.getElementById('shipPaid').value);
      const cc = Number(document.getElementById('courierCost').value);

      if(d !== 0 && !r){ toast('Reason required for discount/adjustment.', 'error'); return; }

      const { error } = await supabase.rpc('staff_update_order', { 
        p_order_id: order.id, 
        p_status: st, 
        p_discount_amount: d, 
        p_discount_reason: r,
        p_shipping_paid: sp,
        p_courier_cost: cc
      });
      if(error) toast(error.message, 'error'); else { toast('Saved.'); reroute(); }
    });
  }

  // -----------------
  // Commission
  // -----------------
  async function renderMyCommission(){
    if(!requireAuth()) return;
    const today = new Date().toISOString().slice(0,10);
    render(`
      <div class="card">
        <div class="h1">My Commission</div>
        <div class="grid cols-2">
          <div><div class="label">Start</div><input id="d1" class="input" type="date" value="${today.slice(0,8)}01" /></div>
          <div><div class="label">End</div><input id="d2" class="input" type="date" value="${today}" /></div>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="btnRun">Run</button></div>
        <div class="hr"></div>
        <div id="out"></div>
      </div>
    `);
    document.getElementById('btnRun').onclick = async ()=>{
      const d1 = document.getElementById('d1').value;
      const d2 = document.getElementById('d2').value;
      const { data, error } = await supabase.rpc('my_commission_report', { p_start: d1, p_end: d2 });
      if(error){ toast(error.message,'error'); return; }
      const tot = (data||[]).reduce((a,x)=>a+(x.commission||0),0);
      document.getElementById('out').innerHTML = `
        <div class="kpi" style="margin-bottom:12px"><div class="num">${fmtPeso(tot)}</div><div class="cap">Total Commission</div></div>
        <div class="tablewrap"><table><thead><tr><th>Date</th><th>Order</th><th>Region</th><th>Comm</th></tr></thead><tbody>
        ${(data||[]).map(x=>`<tr><td>${new Date(x.created_at).toLocaleDateString()}</td><td>${x.order_code}</td><td>${x.region}</td><td>${fmtPeso(x.commission)}</td></tr>`).join('')}
        </tbody></table></div>
      `;
    };
  }

  // -----------------
  // Owner Dashboard
  // -----------------
  async function renderDashboard(){
    if(!requireAuth() || !requireOwner()) return;
    const today = new Date().toISOString().slice(0,10);
    render(`
      <div class="card">
        <div class="h1">Owner Dashboard</div>
        <div class="grid cols-2">
          <div><div class="label">Start</div><input id="d1" class="input" type="date" value="${today.slice(0,8)}01" /></div>
          <div><div class="label">End</div><input id="d2" class="input" type="date" value="${today}" /></div>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="btnRun">Run Report</button></div>
        <div class="hr"></div>
        <div id="out"></div>
      </div>
      
      <div class="grid cols-2" style="margin-top:18px">
        <div class="card">
          <div class="h2">Top Products (Last 30 days)</div>
          <div id="topProds" class="muted small">Loading...</div>
        </div>
        <div class="card">
          <div class="h2">Low Stock Alert (< 5)</div>
          <div id="lowStock" class="muted small">Loading...</div>
        </div>
      </div>
    `);

    loadGrowthWidgets();

    document.getElementById('btnRun').onclick = async ()=>{
      const d1 = document.getElementById('d1').value;
      const d2 = document.getElementById('d2').value;
      const { data: s, error } = await supabase.rpc('owner_dashboard_summary', { p_start: d1, p_end: d2 });
      if(error){ toast(error.message,'error'); return; }
      const x = s?.[0] || {};
      const { data: cat } = await supabase.rpc('owner_profit_by_category', { p_start: d1, p_end: d2 });
      
      document.getElementById('out').innerHTML = `
        <div class="grid cols-3">
          <div class="kpi"><div class="num">${fmtPeso(x.net_after_expenses)}</div><div class="cap">Net Profit (Clean)</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.items_profit)}</div><div class="cap">Items Profit</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.expenses_total)}</div><div class="cap">Expenses</div></div>
        </div>
        <div class="grid cols-2" style="margin-top:12px">
           <div class="tablewrap"><table class="small"><thead><tr><th>Category</th><th>Profit</th></tr></thead><tbody>${(cat||[]).map(c=>`<tr><td>${c.category}</td><td>${fmtPeso(c.profit)}</td></tr>`).join('')}</tbody></table></div>
        </div>
      `;
    };

    async function loadGrowthWidgets(){
      const { data: low } = await supabase.from('inventory_view').select('sku, qty_on_hand').lt('qty_on_hand', 5).order('qty_on_hand');
      document.getElementById('lowStock').innerHTML = (low||[]).length 
        ? `<div class="tablewrap"><table><thead><tr><th>SKU</th><th>Qty</th></tr></thead><tbody>${low.map(x=>`<tr><td><b>${x.sku}</b></td><td><span class="pill bad">${x.qty_on_hand}</span></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="pill good">All good</div>`;

      const { data: items } = await supabase.from('order_items').select('sku, qty').order('created_at', {ascending:false}).limit(1000);
      const counts = {};
      (items||[]).forEach(i => counts[i.sku] = (counts[i.sku]||0) + i.qty);
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 5);
      
      document.getElementById('topProds').innerHTML = sorted.length
        ? `<div class="tablewrap"><table><thead><tr><th>SKU</th><th>Sold (Recent)</th></tr></thead><tbody>${sorted.map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>`
        : `No recent data`;
    }
  }

  async function renderProducts(){
    if(!requireAuth() || !requireOwner()) return;
    const { data } = await supabase.from('products').select('*').order('sku');
    const rows = (data||[]).map(p=>`
      <tr>
        <td><b>${escapeHtml(p.sku)}</b></td>
        <td><input class="input name" data-sku="${p.sku}" value="${escapeHtml(p.name)}" /></td>
        <td><input class="input cost" type="number" data-sku="${p.sku}" value="${p.unit_cost}" /></td>
        <td><input class="input price" type="number" data-sku="${p.sku}" value="${p.sell_price}" /></td>
        <td><button class="btn primary saveP" data-sku="${p.sku}">Save</button></td>
      </tr>`).join('');
    
    render(`
      <div class="card"><div class="h1">Products</div><div class="hr"></div>
      <div class="grid cols-3">
         <div><div class="label">SKU</div><input id="nSku" class="input"/></div>
         <div><div class="label">Name</div><input id="nName" class="input"/></div>
         <div><div class="label">Cat</div><input id="nCat" class="input"/></div>
      </div>
      <div class="grid cols-3" style="margin-top:8px">
         <div><div class="label">Cost</div><input id="nCost" class="input" type="number"/></div>
         <div><div class="label">Price</div><input id="nPrice" class="input" type="number"/></div>
         <div class="row" style="align-items:flex-end"><button class="btn primary" id="nAdd">Add Product</button></div>
      </div>
      <div class="hr"></div>
      <div class="tablewrap"><table><thead><tr><th>SKU</th><th>Name</th><th>Cost</th><th>Price</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
    `);

    document.getElementById('nAdd').onclick = async ()=>{
      const s=document.getElementById('nSku').value, n=document.getElementById('nName').value, c=document.getElementById('nCat').value, cost=document.getElementById('nCost').value, p=document.getElementById('nPrice').value;
      if(!s||!n) return toast('SKU/Name required','error');
      const { error } = await supabase.from('products').insert({sku:s, name:n, category:c, unit_cost:cost, sell_price:p, active:true});
      if(error) toast(error.message,'error'); else { toast('Added'); reroute(); }
    };
    document.querySelectorAll('.saveP').forEach(b=>{
      b.onclick = async ()=>{
        const s = b.dataset.sku;
        const n = document.querySelector(`.name[data-sku="${s}"]`).value;
        const cost = document.querySelector(`.cost[data-sku="${s}"]`).value;
        const p = document.querySelector(`.price[data-sku="${s}"]`).value;
        await supabase.from('products').update({name:n, unit_cost:cost, sell_price:p}).eq('sku',s);
        toast('Saved');
      };
    });
  }

  async function renderInventory(){
    if(!requireAuth() || !requireOwner()) return;
    const { data } = await supabase.from('inventory_view').select('*').order('sku');
    render(`
      <div class="card"><div class="h1">Inventory</div><div class="hr"></div>
      <div class="tablewrap"><table><thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Adj (+/-)</th><th>Reason</th><th></th></tr></thead>
      <tbody>
      ${(data||[]).map(r=>`
        <tr>
          <td><b>${r.sku}</b></td><td>${r.name}</td>
          <td><span class="pill ${r.qty_on_hand<5?'warn':'good'}">${r.qty_on_hand}</span></td>
          <td><input class="input adjQ" type="number" data-sku="${r.sku}" value="0" /></td>
          <td><input class="input adjR" data-sku="${r.sku}" value="manual" /></td>
          <td><button class="btn primary doAdj" data-sku="${r.sku}">Adj</button></td>
        </tr>`).join('')}
      </tbody></table></div></div>
    `);
    document.querySelectorAll('.doAdj').forEach(b=>{
      b.onclick = async ()=>{
        const s = b.dataset.sku;
        const q = document.querySelector(`.adjQ[data-sku="${s}"]`).value;
        const r = document.querySelector(`.adjR[data-sku="${s}"]`).value;
        if(q==0) return;
        const { error } = await supabase.rpc('owner_adjust_stock', { p_sku: s, p_qty_change: q, p_reason: r });
        if(error) toast(error.message,'error'); else { toast('Adjusted'); reroute(); }
      };
    });
  }

  async function renderSimple(title, table, cols){
    if(!requireAuth() || !requireOwner()) return;
    const { data } = await supabase.from(table).select('*').order('created_at',{ascending:false}).limit(50);
    const h = cols.map(c=>`<th>${c}</th>`).join('') + '<th></th>';
    const inputs = cols.map(c=>`<div><div class="label">${c}</div><input id="new_${c}" class="input"/></div>`).join('');
    
    render(`
      <div class="card"><div class="h1">${title}</div><div class="hr"></div>
      <div class="grid cols-3">${inputs}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="addSimple">Add</button></div>
      <div class="hr"></div>
      <div class="tablewrap"><table><thead><tr>${h}</tr></thead><tbody>
      ${(data||[]).map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(r[c.toLowerCase().replace(/ /g,'_')]||'')}</td>`).join('')}<td></td></tr>`).join('')}
      </tbody></table></div></div>
    `);
    document.getElementById('addSimple').onclick = async ()=>{
      const obj = {};
      cols.forEach(c => obj[c.toLowerCase().replace(/ /g,'_')] = document.getElementById('new_'+c).value);
      const { error } = await supabase.from(table).insert(obj);
      if(error) toast(error.message,'error'); else { toast('Added'); reroute(); }
    };
  }

  async function renderExpenses(){ renderSimple('Expenses', 'expenses', ['Category','Amount','Notes']); }
  async function renderReceivables(){ renderSimple('Receivables', 'receivables', ['Party','Amount Due','Amount Paid','Status']); }
  async function renderPayables(){ renderSimple('Payables', 'payables', ['Party','Amount','Status','Notes']); }

  init();
})();
