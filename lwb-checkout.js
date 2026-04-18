/**
 * Overrides checkout submitPayment to use /api/store (orders + payment intents).
 * Expects existing checkout DOM: co-fname, co-lname, co-email, co-phone, co-street, co-city, co-postal, co-country
 * and globals: cartItems, cartTotals, selectedPayment, selectedShipping, shippingRates, tipAmount, appliedDiscount
 */
(function () {
  function apiBase() {
    return window.LWB_API_BASE || (typeof location !== 'undefined' ? location.origin.replace(/\/$/, '') + '/api' : '/api');
  }

  function mapRegion() {
    const code = window.LB_REGION?.get() || 'NP';
    const m = { AU: 'AU', NP: 'NP', US: 'US', GB: 'GB', CA: 'CA', JP: 'JP', NZ: 'NZ', CN: 'NP' };
    return m[code] || 'NP';
  }

  function getCustomer() {
    return {
      firstName: (document.getElementById('co-fname')?.value || '').trim(),
      lastName: (document.getElementById('co-lname')?.value || '').trim(),
      email: (document.getElementById('co-email')?.value || '').trim(),
      phone: (document.getElementById('co-phone')?.value || '').trim(),
    };
  }

  function getShippingAddress() {
    const country = document.getElementById('co-country')?.value || mapRegion();
    return {
      address: (document.getElementById('co-street')?.value || '').trim(),
      city: (document.getElementById('co-city')?.value || '').trim(),
      postalCode: (document.getElementById('co-postal')?.value || '').trim(),
      country,
    };
  }

  function cartLinesFromLb() {
    return (window.LB_CART?.load() || []).map((i) => ({
      key: i.key,
      name: i.name,
      variantTitle: i.variantTitle || i.variant || '',
      price: Number(i.price),
      qty: i.qty,
      image: i.image || '',
    }));
  }

  function showErr(msg) {
    if (typeof window.showCheckoutError === 'function') window.showCheckoutError(msg);
    else alert(msg);
  }

  async function postOrder(payload) {
    const res = await fetch(`${apiBase()}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  window.lwbCheckoutSubmit = async function lwbCheckoutSubmit() {
    if (!window.LB_CART) {
      showErr('Cart not ready. Please refresh.');
      return;
    }

    const lines = cartLinesFromLb();
    if (!lines.length) {
      alert('Your cart is empty!');
      return;
    }

    const cust = getCustomer();
    if (!cust.email) {
      alert('Please enter your email.');
      return;
    }

    const region = mapRegion();
    const ship = getShippingAddress();
    const rates = window.shippingRates || {};
    const sel = window.selectedShipping || 'standard';
    const rate = rates[sel] || { price: 0 };
    const subtotal = window.LB_CART.getTotals().subtotal || 0;
    const tip = typeof window.tipAmount === 'number' ? window.tipAmount : 0;
    const shipPrice = Number(rate.price) || 0;
    const disc = window.appliedDiscount?.amount || 0;
    const totalAmount = Math.max(0, subtotal + shipPrice + tip - disc);

    const totalDisplay =
      window.lwbCart && typeof window.lwbCart.formatPrice === 'function'
        ? window.lwbCart.formatPrice(totalAmount, region)
        : (() => {
            const sym = window.LB_CART.getTotals().symbol;
            const dec = region === 'JP' || region === 'NP' ? 0 : 2;
            return `${sym}${totalAmount.toFixed(dec)}`;
          })();

    const paymentMethod =
      window.selectedPayment === 'cod'
        ? 'cod'
        : window.selectedPayment === 'esewa'
          ? 'esewa'
          : window.selectedPayment === 'khalti'
            ? 'khalti'
            : 'stripe';

    const basePayload = {
      customer: { ...cust, name: `${cust.firstName} ${cust.lastName}`.trim() },
      shippingAddress: ship,
      lineItems: lines,
      region,
      totalAmount,
      totalDisplay,
      total: totalDisplay,
      discountCode: window.appliedDiscount?.code || null,
      tip: typeof window.tipAmount === 'number' ? window.tipAmount : 0,
    };

    const payBtn = document.getElementById('co-pay-btn');
    const resetBtn = () => {
      if (payBtn) {
        payBtn.textContent = 'Complete order';
        payBtn.disabled = false;
        payBtn.style.opacity = '1';
      }
    };
    if (payBtn) {
      payBtn.textContent = 'Processing…';
      payBtn.disabled = true;
      payBtn.style.opacity = '0.7';
    }

    try {
      if (paymentMethod === 'cod') {
        const data = await postOrder({ ...basePayload, paymentMethod: 'cod' });
        if (!data.success) throw new Error(data.error || 'Order failed');
        window.LB_CART.clear();
        window.location.href = `order-confirmation.html?order=${encodeURIComponent(data.orderNumber)}`;
        return;
      }

      if (paymentMethod === 'esewa') {
        const oid = `LWB-${Date.now()}`;
        const res = await fetch(`${apiBase()}/checkout/esewa/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: totalAmount, orderId: oid }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'eSewa failed');
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.paymentUrl;
        Object.entries(data.params).forEach(([k, v]) => {
          const inp = document.createElement('input');
          inp.type = 'hidden';
          inp.name = k;
          inp.value = v;
          form.appendChild(inp);
        });
        document.body.appendChild(form);
        form.submit();
        return;
      }

      if (paymentMethod === 'khalti') {
        const oid = `LWB-${Date.now()}`;
        const res = await fetch(`${apiBase()}/checkout/khalti/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: totalAmount,
            orderId: oid,
            customerInfo: {
              name: cust.firstName,
              email: cust.email,
              phone: cust.phone,
            },
          }),
        });
        const data = await res.json();
        if (data.payment_url) {
          window.location.href = data.payment_url;
          return;
        }
        throw new Error(data.error || 'Khalti failed');
      }

      if (paymentMethod === 'stripe' || window.selectedPayment === 'card') {
        const currencies = { AU: 'aud', US: 'usd', CA: 'cad', JP: 'jpy', NZ: 'nzd', GB: 'gbp', NP: 'usd' };
        const cur = currencies[region] || 'usd';
        const intentRes = await fetch(`${apiBase()}/checkout/stripe-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: totalAmount, currency: cur, region }),
        });
        const intentData = await intentRes.json();
        if (!intentRes.ok) throw new Error(intentData.error || 'Stripe not configured');

        if (!window.stripeInstance || !window.stripeCardNumber) {
          throw new Error('Card form not ready. Check Stripe publishable key in settings.');
        }

        const nameOnCard = (document.getElementById('card-holder-name')?.value || `${cust.firstName} ${cust.lastName}`).trim();
        const result = await window.stripeInstance.confirmCardPayment(intentData.clientSecret, {
          payment_method: {
            card: window.stripeCardNumber,
            billing_details: { name: nameOnCard, email: cust.email },
          },
        });

        if (result.error) {
          showErr(result.error.message);
          resetBtn();
          return;
        }

        const orderPayload = {
          ...basePayload,
          paymentMethod: 'stripe',
          stripePaymentIntentId: result.paymentIntent?.id,
        };
        const ord = await postOrder(orderPayload);
        if (!ord.success) throw new Error(ord.error || 'Could not save order');
        window.LB_CART.clear();
        window.location.href = `order-confirmation.html?order=${encodeURIComponent(ord.orderNumber)}`;
        return;
      }

      showErr('This payment method is not available yet.');
      resetBtn();
    } catch (e) {
      console.error(e);
      showErr(e.message || 'Checkout failed');
      resetBtn();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.submitPayment === 'function') {
      window._submitPaymentOriginal = window.submitPayment;
    }
    window.submitPayment = function () {
      return window.lwbCheckoutSubmit();
    };
  });
})();
