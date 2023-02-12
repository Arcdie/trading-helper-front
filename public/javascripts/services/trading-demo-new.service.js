/* global
functions, uuidv4,
objects, constants,
classes, LightweightCharts,
*/

const TRADING_CONSTANTS = {
  DEFAULT_NUMBER_TRADES: 5,
  DEFAULT_STOPLOSS_PERCENT: 0.5,
  DEFAULT_TAKEPROFIT_RELATION: 3,

  LOSS_PERCENT_PER_DEPOSIT: 0.5,
  MIN_WORK_AMOUNT: 20,

  MAKER_COMMISSION_PERCENT: 0.02 / 100,
  TAKER_COMMISSION_PERCENT: 0.04 / 100,
};

const EActions = new Map([
  ['tradeCreated', 'tradeCreated'],
  ['tradeFinished', 'tradeFinished'],
  ['transactionCreated', 'transactionCreated'],
  ['transactionFinished', 'transactionFinished'],
]);

class TradingDemo {
  constructor() {
    this.$tradingForm = $('.trading-form');

    this.limitOrders = [];
    this.transactions = [];

    this.isLong = false;
    this.isActiveStopLossChoice = false;
    this.isActiveLimitOrderChoice = false;

    this.workAmount = TRADING_CONSTANTS.MIN_WORK_AMOUNT;
    this.numberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES;
    this.stopLossPercent = TRADING_CONSTANTS.DEFAULT_STOPLOSS_PERCENT;
  }

  init() {
    this.loadTradingFormHandlers();
  }

  changeTypeAction(typeAction) {
    this.isLong = typeAction === 'buy';
  }

  changeWorkAmount(newValue) {
    if (!newValue) return;

    const $workAmount = this.$tradingForm.find('.work-amount-block input[type="text"]');

    if (Number.isNaN(newValue) || newValue < TRADING_CONSTANTS.MIN_WORK_AMOUNT) {
      this.workAmount = TRADING_CONSTANTS.MIN_WORK_AMOUNT;
      $workAmount.val(this.workAmount);
      return;
    }

    this.workAmount = parseInt(newValue, 10);
    $workAmount.val(this.workAmount);
  }

  changeNumberTrades(newValue) {
    if (!newValue) return;

    const $numberTrades = this.$tradingForm.find('.number-trades-block input[type="text"]');

    if (Number.isNaN(newValue) || newValue <= 0) {
      this.numberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES;
      $numberTrades.val(this.numberTrades);
      return;
    }

    this.numberTrades = parseInt(newValue, 10);
    $numberTrades.val(this.numberTrades);
  }

  changeStopLossPercent(newValue) {
    if (!newValue) return;

    const $sl = this.$tradingForm.find('.risks-block .sl input[type="text"]');

    if (Number.isNaN(newValue)) {
      this.stopLossPercent = TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT;
      $sl.val(this.stopLossPercent);
      return;
    }

    this.stopLossPercent = parseFloat(newValue.toFixed(1));
    $sl.val(this.stopLossPercent);
  }

  changeLimitPrice(newValue) {
    if (!newValue) return;

    const $stopLimit = this.$tradingForm.find('.risks-block .stop-limit input[type="text"]');

    if (Number.isNaN(newValue)) {
      $stopLimit.val(0);
      return;
    }

    $stopLimit.val(newValue);
  }

  calculateStopLossPercent({ instrumentPrice, stopLossPrice }) {
    const difference = Math.abs(instrumentPrice - stopLossPrice);
    const percentPerPrice = 100 / (instrumentPrice / difference);

    this.changeStopLossPercent(parseFloat(percentPerPrice.toFixed(2)));
  }

  createTransaction(instrumentDoc, candleData, isManual = false) {
    let action;
    const changes = [];

    let targetTransaction = this.transactions
      .find(t => t.isActive && t.instrumentId === instrumentDoc._id);

    let { numberTrades } = this;
    const instrumentPrice = candleData.close;
    const stepSize = instrumentDoc.step_size;
    const stepSizePrecision = TradingDemo.getPrecision(instrumentDoc.step_size);
    const tickSizePrecision = TradingDemo.getPrecision(instrumentDoc.tick_size); // 0.001

    if (!targetTransaction) {
      const newTransaction = {
        id: uuidv4(),
        instrumentId: instrumentDoc._id,
        instrumentName: instrumentDoc.name,

        isActive: true,
        isLong: this.isLong,
        isManuallyFinished: false,

        quantity: 0,
        stopLossPrice: 0,
        stopLossPercent: 0,
        originalStopLossPrice: 0,

        trades: [],

        startedAtUnix: candleData.originalTimeUnix,
        endedAtUnix: false,
      };

      const sumTransaction = this.workAmount * numberTrades;
      const allowedSumLoss = sumTransaction * (TRADING_CONSTANTS.LOSS_PERCENT_PER_DEPOSIT / 100);
      const stopLossPercent = this.stopLossPercent; // || TRADING_CONSTANTS.LOSS_PERCENT_PER_DEPOSIT

      let quantity = sumTransaction / instrumentPrice;
      const percentPerPrice = instrumentPrice * (stopLossPercent / 100);
      const stopLossPrice = parseFloat((
        this.isLong ? instrumentPrice - percentPerPrice : instrumentPrice + percentPerPrice
      ).toFixed(tickSizePrecision));

      const profit = Math.abs(((stopLossPrice - instrumentPrice) * quantity));
      const coefficient = profit / allowedSumLoss;

      if (coefficient > 0) {
        quantity /= coefficient;
      } else {
        alert(`coefficient = ${coefficient}`);
        return false;
      }

      let quantityForOneTrade = quantity / numberTrades;

      // if (quantityForOneTrade < 5) {
      //   alert(`quantityForOneTrade < 5 (${quantityForOneTrade})`);
      //   return false;
      // }

      if (quantityForOneTrade < stepSize) {
        alert('quantity < stepSize (1)');
        return false;
      }

      const remainder = quantityForOneTrade % stepSize;
      if (remainder !== 0) {
        quantityForOneTrade -= remainder;

        if (quantityForOneTrade < stepSize) {
          alert('quantity < stepSize (2)');
          return false;
        }

        quantity -= (remainder * numberTrades);
      }

      quantity = parseFloat((quantity).toFixed(stepSizePrecision));

      if (quantity < stepSize) {
        alert('quantity < stepSize (3)');
        return false;
      }

      newTransaction.stopLossPrice = stopLossPrice;
      newTransaction.originalStopLossPrice = newTransaction.stopLossPrice;
      newTransaction.stopLossPercent = stopLossPercent;
      newTransaction.quantity = parseFloat((quantity).toFixed(stepSizePrecision));

      for (let i = 0; i < numberTrades; i += 1) {
        const newTrade = TradingDemo.createTrade(newTransaction, {
          quantity: quantityForOneTrade,
          startedAtUnix: candleData.originalTimeUnix,
          instrumentPrice,
        });

        newTrade.takeProfitPrice = TradingDemo.calculateTakeProfitForTrade(newTransaction, {
          instrumentPrice,
          tickSizePrecision,
          incrementValue: i,
        });

        newTransaction.trades.push(newTrade);
      }

      targetTransaction = newTransaction;
      this.transactions.push(newTransaction);

      changes.push(...newTransaction.trades);
      action = EActions.get('transactionCreated');
    } else if ((targetTransaction.isLong && this.isLong) || (!targetTransaction.isLong && !this.isLong)) {
      const doesExistNotActive = targetTransaction.trades.some(t => !t.isActive);

      if (doesExistNotActive) {
        alert('Not allowed buy more after worked out trade');
        return false;
      }

      const lActiveTrades = targetTransaction.trades.filter(t => t.isActive).length;

      if ((lActiveTrades + numberTrades) > TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES) {
        numberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES - lActiveTrades;
      }

      if (numberTrades === 0) {
        return false;
      }

      for (let i = lActiveTrades; i < lActiveTrades + numberTrades; i += 1) {
        const newTrade = TradingDemo.createTrade(targetTransaction, {
          quantity: targetTransaction.trades[0].quantity,
          startedAtUnix: candleData.originalTimeUnix,
          instrumentPrice,
        });

        changes.push(newTrade);
        targetTransaction.trades.push(newTrade);
      }

      const averagePrice = TradingDemo.getAveragePrice(targetTransaction);
      const percentPerPrice = averagePrice * (targetTransaction.stopLossPercent / 100);

      targetTransaction.stopLossPrice = parseFloat((
        this.isLong ? averagePrice - percentPerPrice : averagePrice + percentPerPrice
      ).toFixed(tickSizePrecision));

      targetTransaction.trades
        .filter(trade => trade.isActive)
        .forEach((trade, index) => {
          trade.takeProfitPrice = TradingDemo.calculateTakeProfitForTrade(targetTransaction, {
            tickSizePrecision,
            incrementValue: index,
            instrumentPrice: averagePrice,
          });
        });

      action = EActions.get('tradeCreated');
    } else {
      const targetTrades = targetTransaction.trades.filter(t => t.isActive);

      if (numberTrades > targetTrades.length) {
        numberTrades = targetTrades.length;
      }

      for (let i = 0; i < numberTrades; i += 1) {
        const targetTrade = targetTrades[i];

        TradingDemo.finishTrade(targetTransaction, targetTrade, {
          instrumentPrice,
          endedAtUnix: candleData.originalTimeUnix,
        });

        changes.push(targetTrade);
      }

      action = EActions.get('tradeFinished');
      const doesExistActiveTrade = targetTrades.some(t => t.isActive);

      if (!doesExistActiveTrade) {
        TradingDemo.finishTransaction(targetTransaction, {
          endedAtUnix: candleData.originalTimeUnix,
          isManuallyFinished: isManual,
        });

        action = EActions.get('transactionFinished');
      }
    }

    return {
      action,
      changes,
      transaction: targetTransaction,
    };
  }

  static createTrade(transaction, {
    quantity,
    startedAtUnix,
    instrumentPrice,
  }) {
    const newTrade = {
      id: uuidv4(),
      isActive: true,
      quantity,
      startedAtUnix,
      endedAtUnix: false,

      buyPrice: 0,
      sellPrice: 0,
      sumCommissions: 0,
      takeProfitPrice: 0,
    };

    if (transaction.isLong) {
      newTrade.buyPrice = instrumentPrice;

      const sumTrade = newTrade.quantity * newTrade.buyPrice;
      newTrade.sumCommissions = sumTrade * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT;
    } else {
      newTrade.sellPrice = instrumentPrice;

      const sumTrade = newTrade.quantity * newTrade.sellPrice;
      newTrade.sumCommissions = sumTrade * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT;
    }

    return newTrade;
  }

  static calculateTakeProfitForTrade(transaction, {
    incrementValue,
    instrumentPrice,
    tickSizePrecision,
  }) {
    const percentPerPrice = Math.abs(transaction.stopLossPrice - instrumentPrice);

    const takeProfitPrice = transaction.isLong
      ? instrumentPrice + (percentPerPrice * (TRADING_CONSTANTS.DEFAULT_TAKEPROFIT_RELATION + incrementValue))
      : instrumentPrice - (percentPerPrice * (TRADING_CONSTANTS.DEFAULT_TAKEPROFIT_RELATION + incrementValue));

    return parseFloat((takeProfitPrice).toFixed(tickSizePrecision));
  }

  static finishTrade(transaction, trade, {
    instrumentPrice,
    endedAtUnix,
  }) {
    if (transaction.isLong) {
      trade.sellPrice = instrumentPrice;
    } else {
      trade.buyPrice = instrumentPrice;
    }

    trade.isActive = false;
    trade.endedAtUnix = endedAtUnix;
    trade.sumCommissions += ((trade.quantity * instrumentPrice) * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT);
  }

  static finishTransaction(transaction, {
    endedAtUnix,
    isManuallyFinished,
  }) {
    transaction.isActive = false;
    transaction.isManuallyFinished = isManuallyFinished || false;

    transaction.endedAtUnix = endedAtUnix;
  }

  nextTick(instrumentDoc, candleData) {
    const activeTransaction = this.transactions
      .find(t => t.isActive && t.instrumentId === instrumentDoc._id);

    if (!activeTransaction) {
      return false;
    }

    let action;
    const changes = [];
    const activeTrades = activeTransaction.trades.filter(t => t.isActive);

    const targetTrades = activeTransaction.isLong
      ? activeTrades.filter(trade => trade.takeProfitPrice <= candleData.high)
      : activeTrades.filter(trade => trade.takeProfitPrice >= candleData.low);

    if (targetTrades.length) {
      changes.push(...targetTrades);
      action = EActions.get('tradeFinished');
    }

    targetTrades.forEach(trade => {
      TradingDemo.finishTrade(activeTransaction, trade, {
        instrumentPrice: trade.takeProfitPrice,
        endedAtUnix: candleData.originalTimeUnix,
      });
    });

    if (activeTrades.length === targetTrades.length) {
      TradingDemo.finishTransaction(activeTransaction, {
        endedAtUnix: candleData.originalTimeUnix,
      });

      action = EActions.get('transactionFinished');

      return {
        action,
        changes,
        transaction: activeTransaction,
      };
    }

    if (activeTransaction.isLong) {
      if (candleData.low <= activeTransaction.stopLossPrice) {
        activeTrades.forEach(trade => {
          TradingDemo.finishTrade(activeTransaction, trade, {
            instrumentPrice: activeTransaction.stopLossPrice,
            endedAtUnix: candleData.originalTimeUnix,
          });
        });

        TradingDemo.finishTransaction(activeTransaction, {
          endedAtUnix: candleData.originalTimeUnix,
        });

        changes.push(...activeTrades);
        action = EActions.get('transactionFinished');
      }
    } else {
      if (candleData.high >= activeTransaction.stopLossPrice) {
        activeTrades.forEach(trade => {
          TradingDemo.finishTrade(activeTransaction, trade, {
            instrumentPrice: activeTransaction.stopLossPrice,
            endedAtUnix: candleData.originalTimeUnix,
          });
        });

        TradingDemo.finishTransaction(activeTransaction, {
          endedAtUnix: candleData.originalTimeUnix,
        });

        changes.push(...activeTrades);
        action = EActions.get('transactionFinished');
      }
    }

    if (!action) {
      return false;
    }

    return {
      action,
      changes,
      transaction: activeTransaction,
    };
  }

  loadInstrumentData(instrumentDoc) {
    this.$tradingForm.find('.action-block .buy input').val(instrumentDoc.price);
    this.$tradingForm.find('.action-block .sell input').val(instrumentDoc.price);

    this.$tradingForm.find('.work-amount-block input').val(this.workAmount);
    this.$tradingForm.find('.number-trades-block input').val(this.numberTrades);
    this.$tradingForm.find('.risks-block .sl input[type="text"]').val(this.stopLossPercent);
  }

  loadTradingFormHandlers() {
    const _this = this;

    this.$tradingForm.find('.work-amount-block input[type="text"]')
      .on('change', function () {
        const value = parseFloat($(this).val());
        _this.changeWorkAmount(value);
      });

    this.$tradingForm.find('.number-trades-block input[type="text"]')
      .on('change', function () {
        const value = parseFloat($(this).val());
        _this.changeNumberTrades(value);
      });

    this.$tradingForm.find('.risks-block .sl input[type="text"]')
      .on('change', function () {
        const value = parseFloat($(this).val());
        _this.changeStopLossPercent(value);
      });

    this.$tradingForm.find('.risks-block .sl button')
      .on('click', () => {
        _this.isActiveStopLossChoice = !_this.isActiveStopLossChoice;
      });

    // this.$tradingForm.find('.risks-block .sl input[type="checkbox"]')
    //   .change(function () {
    //     _this.isAutoStopLoss = this.checked;
    //   });

    this.$tradingForm.find('.risks-block .stop-limit input[type="text"]')
      .on('change', function () {
        const value = parseFloat($(this).val());
        _this.changeLimitPrice(value);
      });

    this.$tradingForm.find('.risks-block .stop-limit button')
      .on('click', () => {
        _this.isActiveLimitOrderChoice = !_this.isActiveLimitOrderChoice;
      });
  }

  static calculateTransactionProfit(transaction) {
    const values = transaction.trades
      // .filter(trade => !trade.isActive)
      .map(trade => TradingDemo.calculateTradeProfit(trade));

    return values.reduce((o, r) => o + r, 0);
  }

  static calculateTradeProfit(trade) {
    if (trade.buyPrice === 0 || trade.sellPrice === 0) {
      return 0;
    }

    return (trade.sellPrice - trade.buyPrice) * trade.quantity;
  }

  static calculateTradeProfitPercent(transaction, trade) {
    if (trade.buyPrice === 0 || trade.sellPrice === 0) {
      return 0;
    }

    let profitPercent = 0;

    if (trade.isLong) {
      const sellPrice = trade.sellPrice;
      const differenceBetweenPrices = sellPrice - trade.buyPrice;
      profitPercent = Math.abs(100 / (trade.buyPrice / differenceBetweenPrices));
    } else {
      const buyPrice = trade.buyPrice;
      const differenceBetweenPrices = trade.sellPrice - buyPrice;
      profitPercent = Math.abs(100 / (trade.sellPrice / differenceBetweenPrices));
    }

    return parseFloat(profitPercent.toFixed(2));
  }

  static calculateTransactionSumCommissions(transaction) {
    return transaction.trades.reduce((o, r) => r.sumCommissions + o, 0);
  }

  static createTransactionChartSeries(chartCandles, transaction) {
    let options = {
      color: constants.GRAY_COLOR,
      lastValueVisible: false,
    };

    if (!transaction.isActive) {
      options = Object.assign(options, {
        lineType: LightweightCharts.LineType.Simple,
        lineStyle: LightweightCharts.LineStyle.LargeDashed,
      });
    }

    return chartCandles.addExtraSeries(options, {
      isTrade: true,
      time: transaction.startedAtUnix,
      id: `transaction-${transaction.id}`,
      price: TradingDemo.getAveragePrice(transaction),
    });
  }

  static createStopLossChartSeries(chartCandles, transaction) {
    let options = {
      color: constants.RED_COLOR,
      lastValueVisible: false,
    };

    if (!transaction.isActive) {
      options = Object.assign(options, {
        lineType: LightweightCharts.LineType.Simple,
        lineStyle: LightweightCharts.LineStyle.LargeDashed,
      });
    }

    return chartCandles.addExtraSeries(options, {
      isTrade: true,
      time: transaction.startedAtUnix,
      id: `stoploss-${transaction.id}`,
      price: transaction.stopLossPrice,
    });
  }

  static createTakeProfitChartSeries(chartCandles, transaction, trade) {
    let options = {
      color: constants.GREEN_COLOR,
      lastValueVisible: false,
    };

    if (!trade.isActive) {
      options = Object.assign(options, {
        lineType: LightweightCharts.LineType.Simple,
        lineStyle: LightweightCharts.LineStyle.LargeDashed,
      });
    }

    return chartCandles.addExtraSeries(options, {
      isTrade: true,
      time: trade.startedAtUnix,
      id: `takeprofit-${transaction.id}-${trade.takeProfitPrice}`,
      price: trade.takeProfitPrice,
    });
  }

  static getAveragePrice(transaction) {
    if (!transaction.trades.length) {
      return 0;
    }

    const key = TradingDemo.getKey(transaction);
    const values = transaction.trades.filter(t => t.isActive).map(t => t[key]);
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  static getKey(transaction) {
    return transaction.isLong ? 'buyPrice' : 'sellPrice';
  }

  static getPrecision(price) {
    const dividedPrice = price.toString().split('.');
    return !dividedPrice[1] ? 0 : dividedPrice[1].length;
  }
}
