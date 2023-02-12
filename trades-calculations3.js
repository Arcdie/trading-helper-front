/* eslint-disable */

const getProfit = (stopLossPrice, instrumentPrice, quantity) =>
  parseFloat(((stopLossPrice - instrumentPrice) * quantity));

let workAmount = 20;
let numberTrades = 1; // from 5
const allowedLossPercentPerDeposit = 0.5;

const instrumentPrice = 6.468; // $

/* logic */

let deposit = workAmount * numberTrades; // 20$
const allowedSumLoss = deposit * (allowedLossPercentPerDeposit / 100); // 0.1$

const stopLossPercent = allowedLossPercentPerDeposit;
const stopLossPrice = instrumentPrice - (instrumentPrice * (stopLossPercent / 100));

const quantity = deposit / instrumentPrice;
const profit = getProfit(stopLossPrice, instrumentPrice, quantity);
console.log('profit', profit);
