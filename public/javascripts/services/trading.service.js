/* global
functions, getUnix,
objects, moment, constants,
classes, LightweightCharts,
*/

const TRADING_CONSTANTS = {
  MIN_TAKEPROFIT_RELATION: 3,
  MIN_STOPLOSS_PERCENT: 0.2,
  MIN_WORK_AMOUNT: 10,
  DEFAULT_NUMBER_TRADES: 7,
};

class Trading {
  constructor() {
    this.$tradingForm = $('.trading-form');
    this.$tradingList = $('.trading-list');
    this.$tradingStatistics = $('.trading-statistics');

    this.trades = [];
    this.isLong = false;
    this.isActiveStopLossChoice = false;

    this.workAmount = TRADING_CONSTANTS.MIN_WORK_AMOUNT;
    this.numberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES;
    this.stopLossPercent = TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT;
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

    let newNumberTrades = TRADING_CONSTANTS.DEFAULT_NUMBER_TRADES;

    if (this.stopLossPercent <= TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT) {
      newNumberTrades = 7;
    } else if (this.stopLossPercent <= 0.5
      && this.stopLossPercent > TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT) {
      newNumberTrades = 5;
    } else {
      newNumberTrades = 3;
    }

    this.changeNumberTrades(newNumberTrades);
  }

  calculateStopLossPercent({ instrumentPrice, stopLossPrice }) {
    const difference = Math.abs(instrumentPrice - stopLossPrice);
    const percentPerPrice = 100 / (instrumentPrice / difference);

    this.changeStopLossPercent(parseFloat(percentPerPrice.toFixed(2)));
  }

  createTrade(instrumentDoc, { price, time }) {
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
          Trading.changeSeriesLineStyle(instrumentDoc, activeTrade);

          // if (result < 0) { ???
          //   newTrade.quantity -= quantityToDecrease;
          // }
        } else {
          this.calculateTradesProfit({ price });
          Trading.updateTradesInTradeList([activeTrade]);
        }

        this.trades.push(newTrade);
        this.calculateTradesProfit({ price });
        this.addTradesToTradeList([newTrade]);
        this.updateCommonStatistics();

        if (result < 0) {
          this.numberTrades = Math.abs(result);
          this.createTrade(instrumentDoc, { price, time });
        }
      }

      return;
    }

    const newTrade = {
      index: this.trades.length + 1,
      id: new Date().getTime(),
      instrumentId: instrumentDoc._id,

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

    Trading.makeTradeSeries(instrumentDoc, newTrade);

    this.trades.push(newTrade);
    this.addTradesToTradeList([newTrade]);
  }

  nextTick(instrumentDoc, candleData) {
    const originalData = {
      isLong: this.isLong,
      numberTrades: this.numberTrades,
    };

    this.trades.filter(t => t.isActive).forEach(trade => {
      if (trade.isLong) {
        if (candleData.low <= trade.stopLossPrice) {
          this.isLong = false;
          this.numberTrades = trade.numberTrades;

          this.createTrade(instrumentDoc, {
            price: trade.stopLossPrice, time: candleData.originalTime,
          });

          return;
        }

        const targetTakeProfitPrices = trade.takeProfitPrices.filter(
          price => price <= candleData.high,
        );

        if (targetTakeProfitPrices.length) {
          targetTakeProfitPrices.forEach(price => {
            this.isLong = false;
            this.numberTrades = 1;

            this.createTrade(instrumentDoc, {
              price, time: candleData.originalTime,
            });

            trade.takeProfitPrices = trade.takeProfitPrices.filter(p => p !== price);
          });

          Trading.changeSeriesLineStyle(instrumentDoc, trade, targetTakeProfitPrices);
        }
      } else {
        if (candleData.high >= trade.stopLossPrice) {
          this.isLong = true;
          this.numberTrades = trade.numberTrades;
          this.createTrade(instrumentDoc, {
            price: trade.stopLossPrice, time: candleData.originalTime,
          });

          return;
        }

        const targetTakeProfitPrices = trade.takeProfitPrices.filter(
          price => price >= candleData.low,
        );

        if (targetTakeProfitPrices.length) {
          targetTakeProfitPrices.forEach(price => {
            this.isLong = true;
            this.numberTrades = 1;

            this.createTrade(instrumentDoc, {
              price, time: candleData.originalTime,
            });

            trade.takeProfitPrices = trade.takeProfitPrices.filter(p => p !== price);
          });

          Trading.changeSeriesLineStyle(instrumentDoc, trade, targetTakeProfitPrices);
        }
      }
    });

    this.isLong = originalData.isLong;
    this.numberTrades = originalData.numberTrades;
  }

  static changeSeriesLineStyle(instrumentDoc, trade, values = []) {
    const chartCandles = instrumentDoc.chart_candles;
    let targetSeries = [];

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
  }

  static removeTradeSeries(instrumentDoc, trade) {
    const chartCandles = instrumentDoc.chart_candles;
    const targetSeries = chartCandles.extraSeries.filter(s => s.isTrade && s.id.includes(trade.id));
    targetSeries.forEach(s => chartCandles.removeSeries(s, false));
  }

  static makeTradeSeries(instrumentDoc, trade) {
    const timeUnix = getUnix(trade.startAt);
    const price = trade.buyPrice || trade.sellPrice;
    const chartCandles = instrumentDoc.chart_candles;

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

    chartCandles.drawSeries(
      tradeSeries,
      [{ value: price, time: timeUnix }],
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
    const $searchBlock = $('.instruments-container .search');

    if (!$searchBlock.length) {
      alert(`No block for appending button (${Trading.name})`);
      return;
    }

    $searchBlock.append(Trading.getShowTradingFormButton());
    this.$tradingForm.width($searchBlock.width());

    this.loadEventHandlers();
  }

  loadInstrumentData(instrumentDoc, { price }) {
    if (!instrumentDoc) return;

    this.$tradingForm.find('.action-block .buy input').val(price);
    this.$tradingForm.find('.action-block .sell input').val(price);

    this.$tradingForm.find('.work-amount-block input').val(this.workAmount);
    this.$tradingForm.find('.number-trades-block input').val(this.numberTrades);
    this.$tradingForm.find('.risks-block .sl input').val(TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT);
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
        // $(this).toggleClass('is_active');
        _this.isActiveStopLossChoice = !_this.isActiveStopLossChoice;
      });
  }

  addTradesToTradeList(trades = []) {
    let appendStr = '';

    trades.forEach(trade => {
      appendStr += `<tr id="trade-${trade.id}">
        <td>${trade.index}</td>
        <td class="number-trades"><span>${trade.numberTrades}</span></td>
        <td class="profit"><span>${trade.profit.toFixed(2)}</span>$</td>
        <td class="profit-percent"><span>${trade.profitPercent.toFixed(2)}</span>%</td>
        <td class="type ${trade.isLong ? 'long' : ''}">${trade.isLong ? 'long' : 'short'}</td>
        <td class="status ${trade.isActive ? 'is_active' : ''}"></td>
        <td class="buy-price">${trade.buyPrice ? `${trade.buyPrice}$` : ''}</td>
        <td class="sell-price">${trade.sellPrice ? `${trade.sellPrice}$` : ''}</td>
        <td>${moment(trade.startAt).format('DD.MM.YY HH:mm')}</td>
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

  static getShowTradingFormButton() {
    return '<button id="show-trading-form"><img src="/images/settings.png" alt="settings" /></button>';
  }
}
