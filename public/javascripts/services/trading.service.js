/* global
functions, getUnix,
objects, moment, constants, AVAILABLE_PERIODS
classes, LightweightCharts,
*/

const TRADING_CONSTANTS = {
  MIN_TAKEPROFIT_RELATION: 3,
  MIN_STOPLOSS_PERCENT: 0.2,
  DEFAULT_STOPLOSS_PERCENT: 0.5,
  MIN_WORK_AMOUNT: 10,
  DEFAULT_NUMBER_TRADES: 3,
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

  createTrade(instrumentDoc, { price, time }, periods) {
    const activeTrade = this.trades.find(t => t.isActive);
    const stepSize = instrumentDoc.step_size;
    const stepSizePrecision = Trading.getPrecision(stepSize);

    if (activeTrade) {
      if ((activeTrade.isLong && this.isLong)
        || (!activeTrade.isLong && !this.isLong)) { // докупить
        // sumTrade +=
        return;
      } else {
        let buyPrice, sellPrice;

        if (activeTrade.isLong && !this.isLong) {
          buyPrice = activeTrade.buyPrice;
          sellPrice = price;
        } else if (!activeTrade.isLong && this.isLong) {
          buyPrice = price;
          sellPrice = activeTrade.sellPrice;
        }

        const quantityPerOneTrade = activeTrade.quantity / activeTrade.numberTrades;
        const result = activeTrade.numberTrades - this.numberTrades;
        const tradesToDecrease = result < 0 ? activeTrade.numberTrades : this.numberTrades;
        const quantityToDecrease = tradesToDecrease * quantityPerOneTrade;

        activeTrade.quantity -= quantityToDecrease;
        activeTrade.numberTrades -= tradesToDecrease;

        const newTrade = {
          index: activeTrade.index,
          id: new Date().getTime(),
          parentId: activeTrade.id,

          isActive: false,
          isLong: activeTrade.isLong,

          buyPrice,
          sellPrice,

          startAt: activeTrade.startAt,
          endAt: time,

          quantity: quantityToDecrease,
          numberTrades: tradesToDecrease,

          profit: 0,
          profitPercent: 0,
        };

        if (result <= 0) {
          this.trades = this.trades.filter(t => t.id !== activeTrade.id);
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
      id: new Date().getTime(),
      instrumentId: instrumentDoc._id,

      isNew: true,
      isActive: true,
      isLong: this.isLong,

      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.stopLossPercent * TRADING_CONSTANTS.MIN_TAKEPROFIT_RELATION,

      startAt: time,
      numberTrades: this.numberTrades,

      profit: 0,
      profitPercent: 0,
    };

    if (newTrade.isLong) {
      newTrade.buyPrice = price;
    } else {
      newTrade.sellPrice = price;
    }

    let quantity = this.workAmount / price;
    if (quantity < stepSize) {
      alert('quantity < stepSize');
      return;
    }

    const remainder = quantity % stepSize;
    if (remainder !== 0) {
      quantity -= remainder;

      if (quantity < stepSize) {
        alert('quantity < stepSize');
        return;
      }
    }

    quantity *= this.numberTrades;

    const percentPerPrice = price * (newTrade.stopLossPercent / 100);
    const tickSizePrecision = Trading.getPrecision(instrumentDoc.tick_size); // 0.001

    const stopLossPrice = newTrade.isLong
      ? price - percentPerPrice
      : price + percentPerPrice;

    newTrade.takeProfitPrices = [];
    newTrade.quantity = parseFloat((quantity).toFixed(stepSizePrecision));
    newTrade.stopLossPrice = parseFloat((stopLossPrice).toFixed(tickSizePrecision));

    for (let i = 0; i < newTrade.numberTrades; i += 1) {
      let takeProfitPrice = newTrade.isLong
        ? price + (percentPerPrice * (TRADING_CONSTANTS.MIN_TAKEPROFIT_RELATION + i))
        : price - (percentPerPrice * (TRADING_CONSTANTS.MIN_TAKEPROFIT_RELATION + i));

      takeProfitPrice = parseFloat((takeProfitPrice).toFixed(tickSizePrecision));
      newTrade.takeProfitPrices.push(takeProfitPrice);
    }

    this.trades.push(newTrade);
    this.addTradesToTradeList([newTrade]);

    return newTrade;
  }

  nextTick(instrumentDoc, candleData, periods = [], isActivatedLimitOrder = false) {
    const originalData = {
      isLong: this.isLong,
      numberTrades: this.numberTrades,
    };

    this.trades.filter(t => t.isActive).forEach(trade => {
      if (trade.isLong) {
        const targetTakeProfitPrices = trade.takeProfitPrices.filter(
          price => price <= candleData.high,
        );

        if (targetTakeProfitPrices.length) {
          targetTakeProfitPrices.forEach(price => {
            this.isLong = false;
            this.numberTrades = 1;

            this.createTrade(instrumentDoc, {
              price, time: candleData.originalTime,
            }, periods);

            trade.takeProfitPrices = trade.takeProfitPrices.filter(p => p !== price);
          });

          Trading.changeSeriesLineStyle(instrumentDoc, trade, targetTakeProfitPrices, periods);
        }

        if (trade.takeProfitPrices.length) {
          if ((isActivatedLimitOrder && candleData.close <= trade.stopLossPrice)
            || (!isActivatedLimitOrder && candleData.low <= trade.stopLossPrice)) {
            this.isLong = false;
            this.numberTrades = trade.takeProfitPrices.length;

            this.createTrade(instrumentDoc, {
              price: trade.stopLossPrice, time: candleData.originalTime,
            }, periods);

            Trading.changeSeriesLineStyle(instrumentDoc, trade, [], periods);
          }
        }
      } else {
        const targetTakeProfitPrices = trade.takeProfitPrices.filter(
          price => price >= candleData.low,
        );

        if (targetTakeProfitPrices.length) {
          targetTakeProfitPrices.forEach(price => {
            this.isLong = true;
            this.numberTrades = 1;

            this.createTrade(instrumentDoc, {
              price, time: candleData.originalTime,
            }, periods);

            trade.takeProfitPrices = trade.takeProfitPrices.filter(p => p !== price);
          });

          Trading.changeSeriesLineStyle(instrumentDoc, trade, targetTakeProfitPrices, periods);
        }

        if (trade.takeProfitPrices.length) {
          if ((isActivatedLimitOrder && candleData.close >= trade.stopLossPrice)
            || (!isActivatedLimitOrder && candleData.high >= trade.stopLossPrice)) {
            this.isLong = true;
            this.numberTrades = trade.takeProfitPrices.length;
            this.createTrade(instrumentDoc, {
              price: trade.stopLossPrice, time: candleData.originalTime,
            }, periods);

            Trading.changeSeriesLineStyle(instrumentDoc, trade, [], periods);
          }
        }
      }
    });

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

      targetSeries.forEach(s => {
        s.applyOptions({
          lineType: LightweightCharts.LineType.Simple,
          lineStyle: LightweightCharts.LineStyle.LargeDashed,
        });
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

    if (doManageOnlyActive) {
      trades = trades.filter(t => t.isActive);
    }

    trades.forEach(trade => {
      if (trade.isLong) {
        const sellPrice = trade.sellPrice || price;
        trade.profit = (sellPrice - trade.buyPrice) * trade.quantity;

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
    const numberTrades = [0, 0]; // [win, lose]

    const majorTrades = {};
    this.trades.forEach(trade => {
      if (trade.isActive) return;

      commonProfit += trade.profit;

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

    return {
      commonProfit,
      numberTrades,
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
    this.$tradingForm.find('.risks-block .sl input').val(TRADING_CONSTANTS.DEFAULT_STOPLOSS_PERCENT);
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
  }

  addTradesToTradeList(trades = []) {
    let appendStr = '';

    trades.forEach(trade => {
      appendStr += `<tr id="trade-${trade.id}" class="trade">
        <td class="index">${trade.index}</td>
        <td class="number-trades"><span>${trade.numberTrades}</span></td>
        <td class="profit"><span>${trade.profit.toFixed(2)}</span>$</td>
        <td class="profit-percent"><span>${trade.profitPercent.toFixed(2)}</span>%</td>
        <td class="type ${trade.isLong ? 'long' : ''}">${trade.isLong ? 'long' : 'short'}</td>
        <td class="status ${trade.isActive ? 'is_active' : ''}"></td>
        <td class="buy-price">${trade.buyPrice ? `${trade.buyPrice}$` : ''}</td>
        <td class="sell-price">${trade.sellPrice ? `${trade.sellPrice}$` : ''}</td>
        <td>${moment.unix(trade.startAt).format('DD.MM.YY HH:mm')}</td>
        <td class="end-at">${trade.endAt ? moment(trade.endAt).format('DD.MM.YY HH:mm') : ''}</td>
      </tr>`;
    });

    this.$tradingList.find('table tr:first').after(appendStr);
  }

  updateCommonStatistics() {
    const {
      commonProfit,
      numberTrades,
    } = this.calculateCommonProfit();

    this.$tradingStatistics.find('.profit span').text(commonProfit.toFixed(2));

    this.$tradingStatistics.find('.number-trades span.win').text(numberTrades[0]);
    this.$tradingStatistics.find('.number-trades span.lose').text(numberTrades[1]);
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
