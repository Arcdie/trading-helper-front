/* global
functions, getUnix,
objects, moment, constants,
classes, LightweightCharts,
*/

const TRADING_CONSTANTS = {
  MIN_TAKEPROFIT_RELATION: 3,
  MIN_STOPLOSS_PERCENT: 0.5,
  DEFAULT_QUANTITY: 3,
};

class Trading {
  constructor() {
    this.$tradingForm = $('.trading-form');
    this.$tradingList = $('.trading-list');
    this.$tradingStatistics = $('.trading-statistics');

    this.trades = [];

    this.isLong = false;
    this.quantity = TRADING_CONSTANTS.DEFAULT_QUANTITY;
    this.stopLossPercent = TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT;

    this.isActiveStopLossChoice = false;

    /*
    {
      instrument_id,
      type_trade, // MARKET, LIMIT
      buy_price,
      sell_price,

      trigger_price,

      stoploss_price,

      takeprofit_price,
      stoploss_percent,
      takeprofit_percent,

      sum_commission,

      quantity,
      is_long,
      is_active,
      trade_started_at,
      trade_ended_at,
    };
    */
  }

  changeTypeAction(typeAction) { // buy, sell
    this.isLong = typeAction === 'buy';
  }

  changeStopLossPercent(newPercent) {
    if (!newPercent) return;

    const $sl = this.$tradingForm.find('.risks-block .sl input[type="text"]');

    if (Number.isNaN(newPercent) || newPercent < TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT) {
      this.stopLossPercent = TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT;
      $sl.val(TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT);
      return;
    }

    this.stopLossPercent = parseFloat(newPercent.toFixed(1));
    $sl.val(this.stopLossPercent);
  }

  calculateStopLossPercent({ instrumentPrice, stopLossPrice }) {
    const difference = Math.abs(instrumentPrice - stopLossPrice);
    const percentPerPrice = 100 / (instrumentPrice / difference);
    this.changeStopLossPercent(parseFloat(percentPerPrice.toFixed(2)));
  }

  createTrade(instrumentDoc, { price, time }) {
    const activeTrade = this.trades.find(t => t.isActive);
    const stepSizePrecision = Trading.getPrecision(instrumentDoc.step_size); // 0.1

    if (activeTrade) {
      if ((activeTrade.isLong && this.isLong)
        || (!activeTrade.isLong && !this.isLong)) { // докупить
        // sumTrade +=
        return;
      } else {
        const quantity = parseFloat((this.quantity).toFixed(stepSizePrecision));

        let buyPrice, sellPrice;

        if (activeTrade.isLong && !this.isLong) {
          buyPrice = activeTrade.buyPrice;
          sellPrice = price;
        } else if (!activeTrade.isLong && this.isLong) {
          buyPrice = price;
          sellPrice = activeTrade.sellPrice;
        }

        const result = activeTrade.quantity - quantity;
        const quantityToDecrease = result < 0 ? activeTrade.quantity : quantity;
        activeTrade.quantity -= quantityToDecrease;

        const newTrade = {
          id: new Date().getTime(),
          parentId: activeTrade.id,
          index: activeTrade.index,
          isActive: false,
          isLong: activeTrade.isLong,
          buyPrice,
          sellPrice,
          sumTrade: quantity * price,
          startAt: activeTrade.startAt,
          endAt: time,
          quantity,
          profit: 0,
          profitPercent: 0,
        };

        if (result <= 0) {
          this.trades = this.trades.filter(t => t.id !== activeTrade.id);
          Trading.removeTradesFromTradeList([activeTrade]);
          Trading.changeSeriesLineStyle(instrumentDoc, activeTrade);

          if (result < 0) {
            newTrade.quantity -= quantityToDecrease;
          }
        } else {
          this.calculateTradesProfit({ price });
          Trading.updateTradesInTradeList([activeTrade]);
        }

        this.trades.push(newTrade);
        this.calculateTradesProfit({ price });
        this.addTradesToTradeList([newTrade]);
        this.updateCommonStatistics();

        if (result < 0) {
          this.quantity = Math.abs(result);
          this.createTrade(instrumentDoc, { price, time });
        }
      }

      return;
    }

    const newTrade = {
      id: new Date().getTime(),
      instrumentId: instrumentDoc._id,
      index: this.trades.length + 1,
      isActive: true,
      isLong: this.isLong,
      stopLossPercent: this.stopLossPercent,
      takeProfitPercent: this.stopLossPercent * TRADING_CONSTANTS.MIN_TAKEPROFIT_RELATION,
      startAt: time,
      profit: 0,
      profitPercent: 0,
    };

    if (newTrade.isLong) {
      newTrade.buyPrice = price;
    } else {
      newTrade.sellPrice = price;
    }

    const percentPerPrice = price * (newTrade.stopLossPercent / 100);
    const tickSizePrecision = Trading.getPrecision(instrumentDoc.tick_size); // 0.001

    const stopLossPrice = newTrade.isLong
      ? price - percentPerPrice
      : price + percentPerPrice;

    newTrade.takeProfitPrices = [];
    newTrade.quantity = parseFloat((this.quantity).toFixed(stepSizePrecision));
    newTrade.stopLossPrice = parseFloat((stopLossPrice).toFixed(tickSizePrecision));
    newTrade.sumTrade = price * newTrade.quantity;

    for (let i = 0; i < newTrade.quantity; i += 1) {
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
      quantity: this.quantity,
    };

    this.trades.filter(t => t.isActive).forEach(trade => {
      if (trade.isLong) {
        if (candleData.low <= trade.stopLossPrice) {
          this.isLong = false;
          this.quantity = trade.quantity;
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
            this.quantity = 1;
            this.isLong = false;

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
          this.quantity = trade.quantity;
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
            this.quantity = 1;
            this.isLong = true;

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
    this.quantity = originalData.quantity;
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

    this.trades.forEach(trade => {
      if (trade.isActive) return;

      commonProfit += trade.profit;

      if (trade.profit > 0) {
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
    if (!instrumentDoc) {
      return;
    }

    // const stepSizePrecision = Trading.getPrecision(instrumentDoc.step_size); // 0.1
    // this.quantity = stepSizePrecision;

    this.$tradingForm.find('.action-block .buy input').val(price);
    this.$tradingForm.find('.action-block .sell input').val(price);

    this.$tradingForm.find('.quantity-block input').val(this.quantity);
    this.$tradingForm.find('.risks-block .sl input').val(TRADING_CONSTANTS.MIN_STOPLOSS_PERCENT);
  }

  loadEventHandlers() {
    const _this = this;

    this.$tradingForm.find('.quantity-block input[type="text"]')
      .on('change', function () {
        const value = parseFloat($(this).val());

        if (Number.isNaN(value) || value <= 0) {
          _this.quantity = TRADING_CONSTANTS.DEFAULT_QUANTITY;
          $(this).val(TRADING_CONSTANTS.DEFAULT_QUANTITY);
          return;
        }

        _this.quantity = value;
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
        <td class="quantity"><span>${trade.quantity}</span></td>
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

      $trade.find('.quantity span').text(trade.quantity);
      // $trade.find('.sum span').text(trade.sumTrade);
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
