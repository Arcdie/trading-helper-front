/* eslint-disable */

let workAmount = 20;
let numberTrades = 5;

const instrumentPrice = 1; // $
const stopLossPercent = 0.2;
const coefficient = 0.5; // not stop loss percent

/*
  1% = deposit /= 2;
  1.5% = deposit /= 3;
  2% = deposit /= 4;
*/

let deposit = workAmount * numberTrades;

if (stopLossPercent > 0.2) {
  deposit /= (stopLossPercent / coefficient);
} else if (stopLossPercent < 0.2) {
  deposit *= (stopLossPercent /coefficient);
}

const quantity = deposit / instrumentPrice;
const percentPerPrice = instrumentPrice * (stopLossPercent / 100);
const stopLossPrice = instrumentPrice - percentPerPrice;

// let quantity = workAmount / instrumentPrice;
// quantity *= numberTrades;

const profit = parseFloat(((stopLossPrice - instrumentPrice) * quantity).toFixed(2));

console.log('deposit', deposit, deposit / numberTrades);
console.log('profit', profit);

/*
  0.5% - 1.5%, 2%, 2.5%, 3%, 3.5%
  1% - 3%, 4%, 5%, 6%, 7%
  2% - 6%, 8%, 10%, 12%, 14%
*/
