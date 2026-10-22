'use strict';
// Valor das cartas, preco da Loja e faixa do mercado:  valor = base * crescimento^(nota - 75)
const settings = require('./settings');

function valueOf(overall) {
  let base = settings.getFloat('card_value_base'); if (base <= 0) base = 600;
  let g = settings.getFloat('card_value_growth'); if (g <= 0) g = 1.22;
  return Math.max(10, Math.round(base * Math.pow(g, overall - 75)));
}

function shopPrice(overall) {
  let m = settings.getFloat('shop_markup_pct'); if (m <= 0) m = 130;
  return Math.max(10, Math.round(valueOf(overall) * m / 100));
}

/** Faixa permitida para anunciar a carta entre jogadores: [valor, minimo, maximo]. */
function marketLimits(overall) {
  const value = valueOf(overall);
  const hardMin = settings.getInt('market_min_price');
  const hardMax = settings.getInt('market_max_price');
  let minPct = settings.getFloat('market_min_pct'); if (minPct <= 0) minPct = 50;
  let maxPct = settings.getFloat('market_max_pct'); if (maxPct <= 0) maxPct = 200;
  const min = Math.max(hardMin, Math.round(value * minPct / 100));
  let max = Math.min(hardMax, Math.round(value * maxPct / 100));
  if (max < min) max = min;
  return [value, min, max];
}

module.exports = { valueOf, shopPrice, marketLimits };
