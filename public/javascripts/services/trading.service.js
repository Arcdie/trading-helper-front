/* global
functions, getUnix,
objects, moment, constants, AVAILABLE_PERIODS
classes, LightweightCharts,
*/

const TRADING_CONSTANTS = {
  MIN_TAKEPROFIT_RELATION: 3,
  MIN_STOPLOSS_PERCENT: 0.2,
  LOSS_PERCENT_PER_DEPOSIT: 0.5,
  DEFAULT_STOPLOSS_PERCENT: 0.5,
  MIN_WORK_AMOUNT: 20,
  DEFAULT_NUMBER_TRADES: 5,

  MAKER_COMMISSION_PERCENT: 0.02 / 100,
  TAKER_COMMISSION_PERCENT: 0.04 / 100,
};

class Trading {
  constructor() {
    this.$tradingForm = $('.trading-form');
    this.$tradingList = $('.trading-list');
    this.$tradingStatistics = $('.trading-statistics');

    this.trades = [];
    this.limitOrders = [];

    this.isLong = false;
    this.isActiveStopLossChoice = false;
    this.isActiveLimitOrderChoice = false;

    this.minProfit = 0;
    this.maxProfit = 0;
    this.tradesRelationPercent = 0;

    this.filterValue = '';
    this.lastStrategyId = this.filterValue;

    this.workAmount = TRADING_CONSTANTS.MIN_WORK_AMOUNT;
    this.numberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES;
    this.stopLossPercent = TRADING_CONSTANTS.DEFAULT_STOPLOSS_PERCENT;
  }

  changeTypeAction(typeAction) { // buy, sell
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

  changeLimitPrice(newValue) {
    if (!newValue) return;

    const $stopLimit = this.$tradingForm.find('.risks-block .stop-limit input[type="text"]');

    if (Number.isNaN(newValue)) {
      $stopLimit.val(0);
      return;
    }

    $stopLimit.val(newValue);
  }

  changeStopLossPercent(newValue) {
    if (!newValue) return;

    const $sl = this.$tradingForm.find('.risks-block .sl input[type="text"]');

    if (Number.isNaN(newValue) || newValue < TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT) {
      this.stopLossPercent = TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT;
      this.changeNumberTrades(TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES);

      $sl.val(this.stopLossPercent);

      return;
    }

    this.stopLossPercent = parseFloat(newValue.toFixed(1));
    $sl.val(this.stopLossPercent);

    const newNumberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES;

    /*
    if (this.stopLossPercent <= TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT) {
      newNumberTrades = 7;
    } else if (this.stopLossPercent <= 0.5
      && this.stopLossPercent > TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT) {
      newNumberTrades = 5;
    } else {
      newNumberTrades = 3;
    }
    */

    this.changeNumberTrades(newNumberTrades);
  }

  calculateStopLossPercent({ instrumentPrice, stopLossPrice }) {
    const difference = Math.abs(instrumentPrice - stopLossPrice);
    const percentPerPrice = 100 / (instrumentPrice / difference);

    this.changeStopLossPercent(parseFloat(percentPerPrice.toFixed(2)));
  }

  addLimitOrder(instrumentDoc, { startTime, instrumentPrice, limitPrice }) {
    const isLong = limitPrice > instrumentPrice;

    limitPrice = parseFloat(limitPrice.toFixed(instrumentDoc.price_precision));
    this.changeLimitPrice(limitPrice);

    const newLimitOrder = {
      id: `limit-order-${new Date().getTime()}`,
      isLong,
      limitPrice,
      startAt: startTime,
      workAmount: this.workAmount,
      numberTrades: this.numberTrades,
      stopLossPercent: this.stopLossPercent,
    };

    this.limitOrders.push(newLimitOrder);
    return newLimitOrder;
  }

  checkLimitOrders(instrumentDoc, candleData, periods = []) {
    if (this.limitOrders.length) {
      return false;
    }

    const workAmount = this.workAmount;
    const numberTrades = this.numberTrades;
    const stopLossPercent = this.stopLossPercent;

    let wasTrade = false;

    this.limitOrders.forEach(o => {
      if ((o.isLong && candleData.high >= o.limitPrice)
        || (!o.isLong && candleData.low <= o.limitPrice)) {
        this.isLong = o.isLong;
        this.workAmount = o.workAmount;
        this.numberTrades = o.numberTrades;
        this.stopLossPrice = o.stopLossPrice;

        const trade = this.createTrade(instrumentDoc, {
          price: o.limitPrice,
          time: candleData.originalTimeUnix,
        }, periods);

        if (trade && trade.isNew) {
          periods.forEach(period => {
            Trading.makeTradeSeries(instrumentDoc, trade, period);
          });
        }

        this.removeLimitOrder(instrumentDoc, o, periods);
        wasTrade = true;
      }
    });

    this.workAmount = workAmount;
    this.numberTrades = numberTrades;
    this.stopLossPercent = stopLossPercent;

    return wasTrade;
  }

  createTrade(instrumentDoc, { price, time }, periods, isManual = true) {
    const activeTrade = this.trades.reverse().find(t => t.isActive);
    const stepSize = instrumentDoc.step_size;
    const stepSizePrecision = Trading.getPrecision(stepSize);

    if (activeTrade) {
      if ((activeTrade.isLong && this.isLong)
        || (!activeTrade.isLong && !this.isLong)) { // докупить
        // sumTrade +=
        return;
      } else {
        let buyPrice, sellPrice;
        const quantityPerOneTrade = activeTrade.quantity / activeTrade.numberTrades;
        const result = activeTrade.numberTrades - this.numberTrades;
        const tradesToDecrease = result < 0 ? activeTrade.numberTrades : this.numberTrades;
        const quantityToDecrease = tradesToDecrease * quantityPerOneTrade;

        if (activeTrade.isLong && !this.isLong) {
          buyPrice = activeTrade.buyPrice;
          sellPrice = price;
        } else if (!activeTrade.isLong && this.isLong) {
          buyPrice = price;
          sellPrice = activeTrade.sellPrice;
        }

        activeTrade.quantity -= quantityToDecrease;
        activeTrade.numberTrades -= tradesToDecrease;

        const newTrade = {
          index: activeTrade.index,
          strategyId: activeTrade.strategyId,
          id: new Date().getTime(),
          parentId: activeTrade.id,
          instrumentName: instrumentDoc.name,

          isActive: false,
          isLong: activeTrade.isLong,
          isFilterTarget: this.filterValue === activeTrade.strategyId,

          buyPrice,
          sellPrice,

          startAt: activeTrade.startAt,
          endAt: time,

          quantity: quantityToDecrease,
          numberTrades: tradesToDecrease,

          profit: 0,
          profitPercent: 0,

          isManual,
          takeProfitPrice: activeTrade.takeProfitPrice,
          stopLossPrice: activeTrade.stopLossPrice,
        };

        const sumTrade = newTrade.quantity * price;
        newTrade.sumCommissions = sumTrade * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT;

        if (result <= 0) {
          activeTrade.isActive = false;

          // Trading.removeTradesFromHistory([trade]);
          // Trading.addTradesToHistory([trade]);
          Trading.removeTradesFromTradeList([activeTrade]);
          Trading.changeSeriesLineStyle(instrumentDoc, activeTrade, [], periods);

          if (result === 0) {
            this.changeNumberTrades(TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES);
          }

          // if (result < 0) { ???
          //   newTrade.quantity -= quantityToDecrease;
          // }
        } else {
          this.calculateTradesProfit({ price });
          Trading.updateTradesInTradeList([activeTrade]);

          this.changeNumberTrades(activeTrade.numberTrades);
        }

        this.trades.push(newTrade);
        Trading.addTradesToHistory([newTrade]);
        this.calculateTradesProfit({ price });
        this.addTradesToTradeList([newTrade]);
        this.updateCommonStatistics();

        if (result < 0) {
          this.numberTrades = Math.abs(result);
          this.createTrade(instrumentDoc, { price, time }, periods);

          this.changeNumberTrades(this.numberTrades);
        }
      }

      return;
    }

    const newTrade = {
      index: this.trades.length + 1,
      strategyId: this.lastStrategyId,
      id: new Date().getTime(),
      instrumentName: instrumentDoc.name,

      isNew: true,
      isActive: true,
      isLong: this.isLong,

      stopLossPercent: this.stopLossPercent,
      isActivatedFirstTakeProfit: false,

      startAt: time,
      numberTrades: this.numberTrades,

      profit: 0,
      profitPercent: 0,
    };

    newTrade.isFilterTarget = newTrade.strategyId === '';

    const sumTrade = this.workAmount * this.numberTrades;
    const allowedSumLoss = sumTrade * (TRADING_CONSTANTS.LOSS_PERCENT_PER_DEPOSIT / 100);

    const percentPerPrice = price * (newTrade.stopLossPercent / 100);
    const tickSizePrecision = Trading.getPrecision(instrumentDoc.tick_size); // 0.001

    const stopLossPrice = parseFloat((newTrade.isLong
      ? price - percentPerPrice
      : price + percentPerPrice
    ).toFixed(tickSizePrecision));

    let quantity = sumTrade / price;
    const profit = Math.abs(((stopLossPrice - price) * quantity));
    const coefficient = profit / allowedSumLoss;

    if (coefficient > 0) {
      quantity /= coefficient;
    } else {
      alert(`coefficient = ${coefficient}`);
    }

    let quantityForOneTrade = quantity / this.numberTrades;

    if (quantityForOneTrade < stepSize) {
      alert('quantity < stepSize (1)');
      return;
    }

    const remainder = quantityForOneTrade % stepSize;
    if (remainder !== 0) {
      quantityForOneTrade -= remainder;

      if (quantityForOneTrade < stepSize) {
        alert('quantity < stepSize (2)');
        return;
      }

      quantity -= (remainder * this.numberTrades);
    }

    quantity = parseFloat((quantity).toFixed(stepSizePrecision));

    if (quantity < stepSize) {
      alert('quantity < stepSize (3)');
      return;
    }

    newTrade.quantity = quantity;
    newTrade.stopLossPrice = stopLossPrice;
    newTrade.takeProfitPrices = [];

    if (newTrade.isLong) {
      newTrade.buyPrice = price;

      const sumTrade = newTrade.quantity * newTrade.buyPrice;
      newTrade.sumCommissions = sumTrade * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT;
    } else {
      newTrade.sellPrice = price;

      const sumTrade = newTrade.quantity * newTrade.sellPrice;
      newTrade.sumCommissions = sumTrade * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT;
    }

    for (let i = 0; i < newTrade.numberTrades; i += 1) {
      let takeProfitPrice = newTrade.isLong
        ? price + (percentPerPrice * (TRADING_CONSTANTS.MIN_TAKEPROFIT_RELATION + i))
        : price - (percentPerPrice * (TRADING_CONSTANTS.MIN_TAKEPROFIT_RELATION + i));

      takeProfitPrice = parseFloat((takeProfitPrice).toFixed(tickSizePrecision));
      newTrade.takeProfitPrices.push(takeProfitPrice);
    }

    // newTrade.takeProfitPrice = newTrade.takeProfitPrices[0];

    const tmp = (newTrade.quantity * price) * TRADING_CONSTANTS.TAKER_COMMISSION_PERCENT;

    if (newTrade.isLong) {
      newTrade.breakevenPrice = price + ((tmp * 2) / quantity);
    } else {
      newTrade.breakevenPrice = price - ((tmp * 2) / quantity);
    }

    this.trades.push(newTrade);
    this.addTradesToTradeList([newTrade]);
    Trading.addTradesToHistory([newTrade]);

    return newTrade;
  }

  nextTick(instrumentDoc, candleData, periods = [], isActivatedLimitOrder = false) {
    const activeTrade = this.trades.reverse().find(t => t.isActive);

    if (!activeTrade) {
      return;
    }

    const originalData = {
      isLong: this.isLong,
      numberTrades: this.numberTrades,
    };

    if (activeTrade.isLong) {
      const targetTakeProfitPrices = activeTrade.takeProfitPrices.filter(
        price => price <= candleData.high,
      );

      if (!activeTrade.isActivatedFirstTakeProfit && targetTakeProfitPrices.length) {
        isActivatedLimitOrder = true; // !tmp!
        activeTrade.isActivatedFirstTakeProfit = true;
        activeTrade.stopLossPrice = activeTrade.takeProfitPrices[0];
      }

      if (targetTakeProfitPrices.length) {
        targetTakeProfitPrices.forEach(price => {
          this.isLong = false;
          this.numberTrades = 1;

          this.createTrade(instrumentDoc, {
            price, time: candleData.originalTime,
          }, periods, false);

          activeTrade.takeProfitPrices = activeTrade.takeProfitPrices.filter(p => p !== price);
        });

        Trading.changeSeriesLineStyle(instrumentDoc, activeTrade, targetTakeProfitPrices, periods);
      }

      if (activeTrade.takeProfitPrices.length) {
        if ((isActivatedLimitOrder && candleData.close <= activeTrade.stopLossPrice)
          || (!isActivatedLimitOrder && candleData.low <= activeTrade.stopLossPrice)) {
          this.isLong = false;
          this.numberTrades = activeTrade.takeProfitPrices.length;

          this.createTrade(instrumentDoc, {
            price: activeTrade.stopLossPrice, time: candleData.originalTime,
          }, periods, false);

          Trading.changeSeriesLineStyle(instrumentDoc, activeTrade, [], periods);
        }
      }
    } else {
      const targetTakeProfitPrices = activeTrade.takeProfitPrices.filter(
        price => price >= candleData.low,
      );

      if (!activeTrade.isActivatedFirstTakeProfit && targetTakeProfitPrices.length) {
        isActivatedLimitOrder = true; // !tmp!
        activeTrade.isActivatedFirstTakeProfit = true;
        activeTrade.stopLossPrice = activeTrade.takeProfitPrices[0];
      }

      if (targetTakeProfitPrices.length) {
        targetTakeProfitPrices.forEach(price => {
          this.isLong = true;
          this.numberTrades = 1;

          this.createTrade(instrumentDoc, {
            price, time: candleData.originalTime,
          }, periods, false);

          activeTrade.takeProfitPrices = activeTrade.takeProfitPrices.filter(p => p !== price);
        });

        Trading.changeSeriesLineStyle(instrumentDoc, activeTrade, targetTakeProfitPrices, periods);
      }

      if (activeTrade.takeProfitPrices.length) {
        if ((isActivatedLimitOrder && candleData.close >= activeTrade.stopLossPrice)
          || (!isActivatedLimitOrder && candleData.high >= activeTrade.stopLossPrice)) {
          this.isLong = true;
          this.numberTrades = activeTrade.takeProfitPrices.length;
          this.createTrade(instrumentDoc, {
            price: activeTrade.stopLossPrice, time: candleData.originalTime,
          }, periods, false);

          Trading.changeSeriesLineStyle(instrumentDoc, activeTrade, [], periods);
        }
      }
    }

    this.isLong = originalData.isLong;
    // this.numberTrades = originalData.numberTrades;
  }

  static changeSeriesLineStyle(instrumentDoc, trade, values = [], periods = []) {
    periods.forEach(period => {
      let targetSeries = [];
      const chartCandles = instrumentDoc[`chart_candles_${period}`];

      if (!values || !values.length) {
        targetSeries = chartCandles.extraSeries.filter(s => s.isTrade && s.id.includes(trade.id));
      } else {
        targetSeries = chartCandles.extraSeries.filter(
          s => s.isTrade && s.id.includes(trade.id) && values.includes(s.value),
        );
      }

      targetSeries.forEach(tS => {
        tS.applyOptions({
          lineType: LightweightCharts.LineType.Simple,
          lineStyle: LightweightCharts.LineStyle.LargeDashed,
        });

        chartCandles.extraSeries = chartCandles.extraSeries
          .filter(s => s.id !== tS.id && s.value !== tS.value);
      });
    });
  }

  static removeTradeSeries(instrumentDoc, trade, period) {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const targetSeries = chartCandles.extraSeries.filter(s => s.isTrade && s.id.includes(trade.id));
    targetSeries.forEach(s => chartCandles.removeSeries(s, false));
  }

  removeLimitOrder(instrumentDoc, limitOrder, periods = []) {
    this.limitOrders = this.limitOrders.filter(o => o.id !== limitOrder.id);

    periods.forEach(period => {
      const chartCandles = instrumentDoc[`chart_candles_${period}`];
      const targetSeries = chartCandles.extraSeries.find(
        s => s.isLimitOrder && s.id.includes(limitOrder.id),
      );

      if (targetSeries) {
        chartCandles.removeSeries(targetSeries, false);
      }
    });
  }

  removeTrades(trades = []) {
    trades.forEach(trade => {
      this.trades = this.trades.filter(t => t.id !== trade.id);
    });

    Trading.removeTradesFromTradeList(trades);
    Trading.removeTradesFromHistory(trades);
    this.calculateTradesProfit({});
    this.updateCommonStatistics();
  }

  static makeLimitOrderSeries(instrumentDoc, limitOrder, period) {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    const limitOrderSeries = chartCandles.addExtraSeries({
      color: constants.RED_COLOR,
      lastValueVisible: false,
    }, {
      time: limitOrder.startAt,
      isLimitOrder: true,
      value: limitOrder.limitPrice,
      id: limitOrder.id,
    });

    let validTime = limitOrder.startAt;

    if (period === AVAILABLE_PERIODS.get('1h')) {
      validTime -= validTime % 3600;
    } else if (period === AVAILABLE_PERIODS.get('1d')) {
      validTime -= validTime % 86400;
    }

    chartCandles.drawSeries(
      limitOrderSeries,
      [{ value: limitOrder.limitPrice, time: validTime }],
    );

    return limitOrderSeries;
  }

  static makeTradeSeries(instrumentDoc, trade, period) {
    const timeUnix = trade.startAt;
    const price = trade.buyPrice || trade.sellPrice;
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    const tradeSeries = chartCandles.addExtraSeries({
      color: constants.GRAY_COLOR,
      lastValueVisible: false,
    }, {
      value: price,
      isTrade: true,
      id: `trade-${trade.id}`,
    });

    /*
    const breakevenSeries = chartCandles.addExtraSeries({
      color: constants.PURPLE_COLOR,
      lastValueVisible: false,
    }, {
      value: trade.breakevenPrice,
      isTrade: true,
      id: `breakeven-${trade.id}`,
    });
    */

    const stopLossSeries = chartCandles.addExtraSeries({
      color: constants.RED_COLOR,
      lastValueVisible: false,
    }, {
      value: trade.stopLossPrice,
      isTrade: true,
      id: `stoploss-${trade.id}`,
    });

    const series = [
      tradeSeries,
      stopLossSeries,
      // breakevenSeries,
    ];

    trade.takeProfitPrices.forEach(takeProfitPrice => {
      const takeProfitSeries = chartCandles.addExtraSeries({
        color: constants.GREEN_COLOR,
        lastValueVisible: false,
      }, {
        value: takeProfitPrice,
        isTrade: true,
        id: `takeprofit-${trade.id}`,
      });

      series.push(takeProfitSeries);
    });

    let validTime = timeUnix;

    if (period === AVAILABLE_PERIODS.get('1h')) {
      validTime -= validTime % 3600;
    } else if (period === AVAILABLE_PERIODS.get('1d')) {
      validTime -= validTime % 86400;
    }

    chartCandles.drawSeries(
      tradeSeries,
      [{ value: price, time: validTime }],
    );

    return series;
  }

  calculateTradesProfit({ price }, doManageOnlyActive = false) {
    let { trades } = this;

    if (!trades.length) {
      return [];
    }

    if (doManageOnlyActive) {
      const activeTrade = trades.reverse().find(t => t.isActive);

      if (!activeTrade) {
        return [];
      }

      trades = [activeTrade];
    }

    trades.forEach(trade => {
      if (trade.isLong) {
        const sellPrice = trade.sellPrice || price;
        trade.profit =  (sellPrice - trade.buyPrice) * trade.quantity;

        const differenceBetweenPrices = sellPrice - trade.buyPrice;
        trade.profitPercent = Math.abs(100 / (trade.buyPrice / differenceBetweenPrices));
      } else {
        const buyPrice = trade.buyPrice || price;
        trade.profit = (trade.sellPrice - buyPrice) * trade.quantity;

        const differenceBetweenPrices = trade.sellPrice - buyPrice;
        trade.profitPercent = Math.abs(100 / (trade.sellPrice / differenceBetweenPrices));
      }

      if (trade.profit < 0) {
        trade.profitPercent = -trade.profitPercent;
      }
    });

    return trades;
  }

  calculateCommonProfit() {
    let commonProfit = 0;
    let totalCommissions = 0;

    const numberTrades = [0, 0]; // [win, lose]

    const majorTrades = {};
    this.trades.forEach(trade => {
      totalCommissions += trade.sumCommissions;

      if (trade.isActive || !trade.parentId || !trade.isFilterTarget) return;

      commonProfit += trade.profit;

      /* tmp solution */

      if (trade.isManual) {
      // if (trade.isManual && trade.profit > 0) { // hardcode mode
        return;
      }

      /*
      if ((trade.isLong && trade.sellPrice < trade.takeProfitPrice)
        || (!trade.isLong && trade.buyPrice > trade.takeProfitPrice)) {
        return;
      }
      */

      /* tmp solution */

      if (!majorTrades[`id${trade.parentId}`]) {
        majorTrades[`id${trade.parentId}`] = 0;
      }

      majorTrades[`id${trade.parentId}`] += trade.profit;
    });

    Object.keys(majorTrades).forEach(key => {
      if (majorTrades[key] === 0) return;

      if (majorTrades[key] > 0) {
        numberTrades[0] += 1;
      } else {
        numberTrades[1] += 1;
      }
    });

    if (commonProfit < this.minProfit) {
      this.minProfit = commonProfit;
    }

    if (commonProfit > this.maxProfit) {
      this.maxProfit = commonProfit;
    }

    this.tradesRelationPercent = numberTrades[0] === 0 ? 0 : numberTrades[1] / numberTrades[0];

    return {
      commonProfit,
      numberTrades,
      totalCommissions,
    };
  }

  init() {
    this.loadEventHandlers();
  }

  loadInstrumentData(instrumentDoc, { price }) {
    if (!instrumentDoc) return;

    this.$tradingForm.find('.action-block .buy input').val(price);
    this.$tradingForm.find('.action-block .sell input').val(price);

    this.$tradingForm.find('.work-amount-block input').val(this.workAmount);
    this.$tradingForm.find('.number-trades-block input').val(this.numberTrades);
    this.$tradingForm.find('.risks-block .sl input').val(this.stopLossPercent);
  }

  loadEventHandlers() {
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

    this.$tradingForm.find('.risks-block .stop-limit input[type="text"]')
      .on('change', function () {
        const value = parseFloat($(this).val());
        _this.changeLimitPrice(value);
      });

    this.$tradingForm.find('.risks-block .stop-limit button')
      .on('click', () => {
        _this.isActiveLimitOrderChoice = !_this.isActiveLimitOrderChoice;
      });

    this.$tradingList
      .on('click', '.trade .index', function () {
        const index = parseInt($(this).text(), 10);
        const trades = _this.trades.filter(t => t.index === index);

        _this.removeTrades(trades);
      });

    this.$tradingList
      .on('click', '.trade .profit', function () {
        const $trade = $(this).closest('.trade');
        const $index = $trade.find('td.index');
        const index = parseInt($index.text(), 10);

        _this.flipTradesProfit(index);
      });

    this.$tradingList
      .on('change', '.trade .strategy input', function () {
        const value = $(this).val();
        const $trade = $(this).closest('.trade');
        const $index = $trade.find('td.index');
        const index = parseInt($index.text(), 10);

        const targetTrades = _this.trades.filter(t => t.index === index);

        targetTrades.forEach(t => {
          t.strategyId = value;
        });

        _this.lastStrategyId = value;

        Trading.removeTradesFromHistory(targetTrades);
        Trading.addTradesToHistory(targetTrades);
      });
  }

  flipTradesProfit(tradeIndex) {
    let trades = Trading.getHistoryTrades();
    const targetTrades = trades.filter(t => t.index === tradeIndex);

    if (targetTrades.length > 2) {
      return false;
    }

    const parentTrade = targetTrades.find(t => !t.parentId);
    const childTrade = targetTrades.find(t => t.parentId);

    trades = trades.filter(t => t.index !== tradeIndex);
    const takeProfitPrice = parentTrade.takeProfitPrices[0];

    if (childTrade.isLong) {
      childTrade.sellPrice = takeProfitPrice;
      childTrade.profit = (childTrade.sellPrice - childTrade.buyPrice) * childTrade.quantity;

      const differenceBetweenPrices = childTrade.sellPrice - childTrade.buyPrice;
      childTrade.profitPercent = Math.abs(100 / (childTrade.buyPrice / differenceBetweenPrices));
    } else {
      childTrade.buyPrice = takeProfitPrice;
      childTrade.profit = (childTrade.sellPrice - childTrade.buyPrice) * childTrade.quantity;

      const differenceBetweenPrices = childTrade.sellPrice - childTrade.buyPrice;
      childTrade.profitPercent = Math.abs(100 / (childTrade.sellPrice / differenceBetweenPrices));
    }

    if (childTrade.profit < 0) {
      childTrade.profitPercent = -childTrade.profitPercent;
    }

    trades.push(parentTrade, childTrade);

    localStorage.setItem('trading-helper:trades', JSON.stringify(trades));
    this.$tradingList.find('tr.trade').remove();
    this.loadHistoryTrades();
  }

  addTradesToTradeList(trades = []) {
    let appendStr = '';

    trades.forEach(trade => {
      appendStr += `<tr id="trade-${trade.id}" class="trade">
        <td class="index">${trade.index}</td>
        <td class="strategy"><input type="text" placeholder="${trade.strategyId || ''}"></td>
        <td class="name">${trade.instrumentName || ''}</td>
        <td class="number-trades"><span>${trade.numberTrades}</span></td>
        <td class="profit"><span>${trade.profit.toFixed(2)}</span>$</td>
        <td class="profit-percent"><span>${trade.profitPercent.toFixed(2)}</span>%</td>
        <td class="type ${trade.isLong ? 'long' : ''}">${trade.isLong ? 'long' : 'short'}</td>
        <td class="status ${trade.isActive ? 'is_active' : ''}"></td>
        <td class="commission">${trade.sumCommissions.toFixed(4)}</td>
        <td class="buy-price">${trade.buyPrice ? `${trade.buyPrice}$` : ''}</td>
        <td class="sell-price">${trade.sellPrice ? `${trade.sellPrice}$` : ''}</td>
        <td>${moment.unix(trade.startAt).utc().format('DD.MM.YY HH:mm')}</td>
        <td class="end-at">${trade.endAt ? moment.utc(trade.endAt).format('DD.MM.YY HH:mm') : ''}</td>
      </tr>`;
    });

    this.$tradingList.find('table tr:first').after(appendStr);
  }

  updateCommonStatistics(originalTotalCommissions = 0) {
    let {
      commonProfit,
      numberTrades,
      totalCommissions,
    } = this.calculateCommonProfit();

    if (originalTotalCommissions) {
      totalCommissions = originalTotalCommissions;
    }

    commonProfit = Number.isInteger(commonProfit)
      ? parseInt(commonProfit, 10) : commonProfit.toFixed(2);

    totalCommissions = Number.isInteger(totalCommissions)
      ? parseInt(totalCommissions, 10) : totalCommissions.toFixed(4);

    const minProfit = Number.isInteger(this.minProfit)
      ? parseInt(this.minProfit, 10) : this.minProfit.toFixed(2);

    const maxProfit = Number.isInteger(this.maxProfit)
      ? parseInt(this.maxProfit, 10) : this.maxProfit.toFixed(2);

    const tradesRelationPercent = Number.isInteger(this.tradesRelationPercent)
      ? parseInt(this.tradesRelationPercent, 10) : this.tradesRelationPercent.toFixed(2);

    this.$tradingStatistics.find('.profit span').text(commonProfit);
    this.$tradingStatistics.find('.min-profit span').text(minProfit);
    this.$tradingStatistics.find('.max-profit span').text(maxProfit);
    this.$tradingStatistics.find('.sum-commissions span').text(totalCommissions);

    this.$tradingStatistics.find('.number-trades span.win').text(numberTrades[0]);
    this.$tradingStatistics.find('.number-trades span.lose').text(numberTrades[1]);
    this.$tradingStatistics.find('.number-trades span.relation').text(tradesRelationPercent);
  }

  loadHistoryTrades() {
    this.trades = [];
    const trades = Trading.getHistoryTrades();

    let totalCommissions = 0;

    if (trades.length) {
      this.trades = trades.sort((a, b) => { return a.index < b.index ? 1 : -1; });
      this.calculateTradesProfit({});

      this.trades = this.trades.filter(t => {
        totalCommissions += t.sumCommissions;
        return !t.isActive && t.parentId;
      });

      let currentProfit = 0;
      this.addTradesToTradeList(this.trades);

      this.trades.reverse().forEach(t => {
        currentProfit += t.profit;

        if (currentProfit < this.minProfit) {
          this.minProfit = currentProfit;
        }

        if (currentProfit > this.maxProfit) {
          this.maxProfit = currentProfit;
        }
      });

      this.updateCommonStatistics(totalCommissions);
    }
  }

  clearHistoryTrades() {
    localStorage.removeItem('trading-helper:trades');

    this.trades = [];

    this.minProfit = 0;
    this.maxProfit = 0;
    this.tradesRelationPercent = 0;

    this.$tradingList.find('tr.trade').remove();
    this.updateCommonStatistics();
  }

  filterTrades(filterValue) {
    this.filterValue = filterValue;

    if (!filterValue) {
      this.trades.forEach(t => {
        t.isFilterTarget = true;
      });
    } else {
      this.trades.forEach(t => {
        t.isFilterTarget = filterValue === t.strategyId;
      });
    }

    const filteredTrades = this.trades.filter(t => t.isFilterTarget);

    this.$tradingList.find('tr.trade').remove();
    this.addTradesToTradeList(filteredTrades);
    this.updateCommonStatistics();
  }

  static addTradesToHistory(newTrades = []) {
    const trades = Trading.getHistoryTrades();

    newTrades.push(...trades);
    localStorage.setItem('trading-helper:trades', JSON.stringify(newTrades));
  }

  static removeTradesFromHistory(tradesToRemove = []) {
    let trades = Trading.getHistoryTrades();

    tradesToRemove.forEach(t => {
      trades = trades.filter(trade => t.id !== trade.id);
    });

    localStorage.setItem('trading-helper:trades', JSON.stringify(trades));
  }

  static getHistoryTrades() {
    const trades = localStorage.getItem('trading-helper:trades');

    if (!trades) {
      return [];
    }

    return JSON.parse(trades);
  }

  static updateTradesInTradeList(trades = []) {
    trades.forEach(trade => {
      const $trade = $(`#trade-${trade.id}`);

      $trade.find('.number-trades span').text(trade.numberTrades);
      $trade.find('.profit span').text(trade.profit.toFixed(2));
      $trade.find('.profit-percent span').text(trade.profitPercent.toFixed(2));

      if (trade.buyPrice) {
        $trade.find('.buy-price').text(`${trade.buyPrice}$`);
      }

      if (trade.sellPrice) {
        $trade.find('.sell-price').text(`${trade.sellPrice}$`);
      }

      if (trade.endAt) {
        const endAt = moment(trade.endAt).format('DD.MM.YY HH:mm');
        $trade.find('.end-at span').text(endAt);
      }

      if (trade.isActive) {
        $trade.find('.status').addClass('is_active');
      } else {
        $trade.find('.status').removeClass('is_active');
      }
    });
  }

  static removeTradesFromTradeList(trades = []) {
    trades.forEach(trade => {
      $(`#trade-${trade.id}`).remove();
    });
  }

  static getPrecision(price) {
    const dividedPrice = price.toString().split('.');

    if (!dividedPrice[1]) {
      return 0;
    }

    return dividedPrice[1].length;
  }
}
