/* eslint-disable */

const getProfit = (stopLossPrice, instrumentPrice, quantity) =>
  parseFloat(((stopLossPrice - instrumentPrice) * quantity).toFixed(2));

let workAmount = 20;
let numberTrades = 5;
const allowedLossPercentPerDeposit = 0.5;

const instrumentPrice = 1; // $
const stopLossPercent = 2; // %

/* logic */

let deposit = workAmount * numberTrades; // 100$
const allowedSumLoss = deposit * (allowedLossPercentPerDeposit / 100); // 0.5$

const stopLossPrice = instrumentPrice - (instrumentPrice * (stopLossPercent / 100)); // 0.99$

let quantity = deposit / instrumentPrice; // 100

let profit = Math.abs(getProfit(stopLossPrice, instrumentPrice, quantity));
const coefficient = profit / allowedSumLoss;

if (coefficient > 0) {
  quantity /= coefficient;
}

const price = quantity * instrumentPrice;
if ((price / numberTrades) < 5) {
  throw new Error(`price < 5$, ${price / numberTrades}`);
}

profit = getProfit(stopLossPrice, instrumentPrice, quantity);

console.log('profit', profit, price / 5);
