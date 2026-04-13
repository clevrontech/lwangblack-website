// ── Currency utilities for the admin dashboard ───────────────────────────────
// Nepal admins (user.country === 'NP') see prices in NPR.
// All other admins see USD totals as stored in orders.

export function useCurrencyFormatter(user) {
  const isNepal = user?.country === 'NP';

  // Format a price value. If the order already has a symbol, use that.
  // If the admin is from Nepal, convert USD to NPR (approximate rate).
  const NPR_RATE = 133; // 1 USD ≈ 133 NPR (update this or fetch from an API)

  function fmt(amount, orderSymbol, orderCurrency) {
    // If order is already in NPR, respect it
    if (orderCurrency === 'NPR' || orderSymbol === 'रू' || orderSymbol === 'Rs') {
      return `रू ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }
    if (isNepal) {
      // Convert USD to NPR for Nepal admins
      const npr = amount * NPR_RATE;
      return `रू ${Math.round(npr).toLocaleString('en-IN')}`;
    }
    // Use the order's own symbol if available
    const sym = orderSymbol || '$';
    return `${sym}${Number(amount).toFixed(2)}`;
  }

  function fmtTotal(amount) {
    if (isNepal) return `रू ${Math.round(amount * NPR_RATE).toLocaleString('en-IN')}`;
    return `$${Number(amount).toFixed(2)}`;
  }

  function fmtOrder(order) {
    return fmt(order.total || 0, order.symbol, order.currency);
  }

  const currencyLabel = isNepal ? 'NPR' : 'USD';
  const symbol = isNepal ? 'रू' : '$';

  return { fmt, fmtTotal, fmtOrder, isNepal, currencyLabel, symbol, NPR_RATE };
}
