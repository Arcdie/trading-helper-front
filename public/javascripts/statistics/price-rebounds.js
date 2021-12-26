/* global
functions, makeRequest, getQueue,
objects, moment, constants, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_CONSTANTS = '/api/strategies/priceRebounds/constants';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
  ['5M', '5m'],
]);

const WORK_AMOUNT = 10;
const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

/* Variables */

const settings = {
  stopLossPercent: false,
  factorForPriceChange: false,
  considerBtcMircoTrend: false,
  considerFuturesMircoTrend: false,
  candlesForCalculateAveragePercent: false,
};

let instrumentsDocs = [];

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;
const windowHeight = window.innerHeight;

const startDate = moment().utc()
  .startOf('day')
  .add(-6, 'days');

const endDate = moment().utc()
  .startOf('day');
  // .startOf('minute');

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

const wsConnectionPort = 3104;
const wsConnectionLink = 'localhost';
// const wsConnectionLink = '45.94.157.194';

const wsClient = new WebSocket(`ws://${wsConnectionLink}:${wsConnectionPort}`);

/* JQuery */
const $report = $('.report');
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  const resultGetConstants = await makeRequest({
    method: 'GET',
    url: URL_GET_CONSTANTS,
  });

  if (!resultGetConstants || !resultGetConstants.status) {
    alert(resultGetConstants.message || 'Cant makeRequest URL_GET_CONSTANTS');
    return true;
  }

  settings.stopLossPercent = resultGetConstants.result.STOPLOSS_PERCENT;
  settings.factorForPriceChange = resultGetConstants.result.FACTOR_FOR_PRICE_CHANGE;
  settings.considerBtcMircoTrend = resultGetConstants.result.DOES_CONSIDER_BTC_MICRO_TREND;
  settings.considerFuturesMircoTrend = resultGetConstants.result.DOES_CONSIDER_FUTURES_MICRO_TREND;
  settings.candlesForCalculateAveragePercent = resultGetConstants.result.NUMBER_CANDLES_FOR_CALCULATE_AVERAGE_PERCENT;

  $settings.find('.stoploss-percent').val(settings.stopLossPercent);
  $settings.find('.factor-for-price-change').val(settings.factorForPriceChange);
  $settings.find('.candles-for-calculate-average-percent').val(settings.candlesForCalculateAveragePercent);

  $settings.find('#consider-btc-mirco-trend').prop('checked', settings.considerBtcMircoTrend);
  $settings.find('#consider-futures-mirco-trend').prop('checked', settings.considerFuturesMircoTrend);

  // loading data

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: { isOnlyFutures: true },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  // main logic
  renderListInstruments(instrumentsDocs);

  $('.search input')
    .on('keyup', function () {
      const value = $(this).val().toLowerCase();

      let targetDocs = instrumentsDocs;

      if (value) {
        targetDocs = targetDocs.filter(doc => doc.name
          .toLowerCase()
          .includes(value),
        );
      }

      renderListInstruments(targetDocs);
    });

  $instrumentsList
    .on('click', '.instrument', async function (elem) {
      const $instrument = elem.type ? $(this) : $(elem);
      const instrumentId = $instrument.data('instrumentid');

      if (choosenInstrumentId === instrumentId) {
        return true;
      }

      if (choosenInstrumentId) {
        const oldInstrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

        oldInstrumentDoc.trades = [];

        reset({ instrumentId: choosenInstrumentId });
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

      if (!instrumentDoc.my_trades) {
        instrumentDoc.my_trades = [];
      }

      const trades = await loadTrades({
        instrumentName: instrumentDoc.name,

        startDate,
        endDate,
      });

      if (!trades) {
        return true;
      }

      instrumentDoc.trades = trades;

      loadCharts({ instrumentId });
      calculateCandles({ instrumentId });
      const daysIntervals = splitDays({ instrumentId });

      if (!choosenInstrumentId) {
        initReport(daysIntervals.map(interval => interval.startOfPeriodUnix));
      }

      makeReport();

      choosenInstrumentId = instrumentId;
    });

  /*
  $chartsContainer
    .on('click', '.chart-periods div', async function () {
      const period = $(this).data('period');

      if (period !== choosenPeriod) {
        const $periods = $(this).parent().find('div');
        $periods.removeClass('is_active');
        $(this).addClass('is_active');

        choosenPeriod = period;

        loadCharts({ instrumentId: choosenInstrumentId });
        // drawTrades({ instrumentId: choosenInstrumentId });
      }
    });
  */

  $settings
    .find('input[type="text"]')
    .on('change', function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        case 'stoploss-percent': settings.stopLossPercent = newValue; break;
        case 'factor-for-price-change': settings.factorForPriceChange = newValue; break;

        case 'candles-for-calculate-average-percent': {
          settings.candlesForCalculateAveragePercent = newValue; break;
        }

        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        reset({ instrumentId });

        instrumentsDocs.forEach(doc => {
          doc.my_trades = [];
        });

        loadCharts({ instrumentId });
        calculateCandles({ instrumentId });
        makeReport();
      }
    });

/*
  $settings
    .find('input[type="checkbox"]')
    .on('change', async function () {
      const id = $(this).attr('id');
      const newValue = $(this).is(':checked');

      switch (id) {
        case 'consider-btc-mirco-trend': settings.considerBtcMircoTrend = newValue; break;
        case 'consider-futures-mirco-trend': settings.considerFuturesMircoTrend = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        loadCharts({ instrumentId });

        priceJumps = calculatePriceJumps({ instrumentId });
        drawMarkersForPriceJumps({ instrumentId }, priceJumps);

        const calculatedProfit = calculateProfit({ instrumentId }, priceJumps);
        makeReport({ instrumentId }, calculatedProfit);
      }
    });
*/

  $chartsContainer
    .on('click', '.chart-slider button', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $slider = $(this).closest('.chart-slider');
      const chartKey = $slider.attr('class').split(' ')[1];

      const $amountSlides = $slider.find('span.amount-slides');
      const amountSlides = parseInt($amountSlides.text(), 10);

      if (amountSlides === 0) {
        return true;
      }

      if (chartKey === 'futures') {
        const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

        scrollToTrade($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        }, instrumentDoc.my_trades.map(myTrade => ({
          originalTimeUnix: myTrade.tradeStartedAt,
        })));
      }
    });

  $report
    .on('click', 'tr.trade', async function () {
      const index = $(this).data('index');

      window.scrollTo(0, 0);

      const $instrument = $(this).closest('.instrument');
      const instrumentId = $instrument.data('instrumentid');

      if (instrumentId !== choosenInstrumentId) {
        await $._data($($instrumentsList)
          .get(0), 'events').click[0]
          .handler(`#instrument-${instrumentId}`);
      }

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

      scrollToTrade(
        parseInt(index, 10) + 1,
        { instrumentId },
        instrumentDoc.my_trades.map(myTrade => ({
          originalTimeUnix: myTrade.tradeStartedAt,
        })),
      );
    });

  if (params.symbol) {
    const instrumentDoc = instrumentsDocs.find(doc => doc.name === params.symbol);

    if (!instrumentDoc) {
      alert('No doc with this symbol');
    } else {
      await $._data($($instrumentsList)
        .get(0), 'events').click[0]
        .handler(`#instrument-${instrumentDoc._id}`);
    }
  }

  wsClient.onclose = () => {
    alert('Соединение было разорвано, перезагрузите страницу');
  };

  setInterval(() => {
    wsClient.send(JSON.stringify({
      actionName: 'pong',
    }));
  }, 1 * 60 * 1000); // 1 minute

  // for await (const doc of instrumentsDocs) {
  //   await $._data($($instrumentsList).get(0), 'events').click[0].handler(`#instrument-${doc._id}`);
  //   await sleep(1000);
  // }
});

/* Functions */

const loadCharts = ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!instrumentDoc.trades || !instrumentDoc.trades.length) {
    return null;
  }

  const chartKeys = ['futures'];

  if (settings.considerBtcMircoTrend) {
    chartKeys.push('btc');
  }

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1m is_worked ${choosenPeriod === AVAILABLE_PERIODS.get('1M') ? 'is_active' : ''}" data-period="1m"><span>1M</span></div>
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5M') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
          </div>
        </div>
        <div class="actions-menu">
          <div class="chart-slider ${chartKey}">
            <button class="previous"><</button>
            <p><span class="current-slide">0</span>/<span class="amount-slides">0</span></p>
            <button class="next">></button>
          </div>
        </div>
      </div>
      <span class="ruler">0%</span>
      <div class="charts" style="height: ${windowHeight}px"></div>
    </div>`;
  });

  $chartsContainer.append(appendStr);

  const listCharts = [];

  chartKeys.forEach(chartKey => {
    const $chartContainer = $chartsContainer.find(`.chart-container.${chartKey}`);
    const $rootContainer = $chartContainer.find('.charts');

    let chartKeyDoc;

    switch (chartKey) {
      case 'futures': { chartKeyDoc = instrumentDoc; break; }

      case 'btc': {
        const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
        chartKeyDoc = btcDoc;
        break;
      }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, DEFAULT_PERIOD, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && instrumentDoc.my_trades.length) {
          let nearestSlideIndex = -1;

          instrumentDoc.my_trades.forEach((myTrade, index) => {
            if (myTrade.tradeEndedAt < param.time) {
              nearestSlideIndex = index;
            }
          });

          if (~nearestSlideIndex) {
            const $slider = $chartsContainer.find('.chart-slider.futures');

            $slider
              .find('span.current-slide')
              .text(nearestSlideIndex + 1);
          }
        }
      });
    }

    chartCandles.chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(chartKeyDoc.price - coordinateToPrice);
        const percentPerPrice = 100 / (chartKeyDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

        $ruler
          .text(`${percentPerPrice.toFixed(1)}%`)
          .css({
            top: param.point.y - 25,
            left: param.point.x + 15,
          });
      }

      if (param.time) {
        const price = param.seriesPrices.get(chartCandles.mainSeries);

        if (price) {
          const differenceBetweenHighAndLow = price.high - price.low;
          const percentPerPrice = 100 / (price.low / differenceBetweenHighAndLow);

          $open.text(price.open);
          $close.text(price.close);
          $low.text(price.low);
          $high.text(price.high);
          $percent.text(`${percentPerPrice.toFixed(1)}%`);
        }
      }
    });

    listCharts.push(chartCandles, indicatorVolume);
  });

  let isCrossHairMoving = false;

  listCharts.forEach(elem => {
    const otherCharts = listCharts.filter(chart => chart.chartKey !== elem.chartKey);

    elem.chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time || isCrossHairMoving) {
        return true;
      }

      isCrossHairMoving = true;

      otherCharts.forEach(innerElem => {
        innerElem.chart.moveCrosshair(param.point);
      });

      isCrossHairMoving = false;

      elem.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        otherCharts.forEach(innerElem => {
          innerElem.chart.timeScale().setVisibleLogicalRange(range);
        });
      });
    });
  });

  listCharts.forEach(chartWrapper => {
    chartWrapper.chart.applyOptions({
      timeScale: {
        timeVisible: true,
      },
    });
  });
};

const calculateCandles = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!instrumentDoc.trades || !instrumentDoc.trades.length) {
    return null;
  }

  const chartCandles = instrumentDoc.chart_candles;
  const indicatorVolume = instrumentDoc.indicator_volume;

  instrumentDoc.price_jumps = [];
  chartCandles.originalData = [];

  let periods = instrumentDoc.trades;

  if (choosenPeriod === AVAILABLE_PERIODS.get('5M')) {
    const coeff = 5 * 60 * 1000;
    let timeUnixOfFirstCandle = periods[0][0].originalTimeUnix;

    const divider = timeUnixOfFirstCandle % 60;

    if (divider !== 0) {
      let incr = 1;
      const next5mInterval = (Math.ceil((timeUnixOfFirstCandle * 1000) / coeff) * coeff) / 1000;

      periods.shift();

      alert('Started while loop');

      while (1) {
        const firstCandleTimeOfPeriod = periods[incr][0].originalTimeUnix;

        if (firstCandleTimeOfPeriod === next5mInterval) {
          timeUnixOfFirstCandle = firstCandleTimeOfPeriod;
          break;
        }

        incr += 1;
        periods.shift();
      }
    }

    let newPeriod = [];
    const newPeriods = [];

    let current5mInterval = timeUnixOfFirstCandle;
    let next5mInterval = current5mInterval + 300;

    periods.forEach(period => {
      const timeUnixOfFirstCandleInPeriod = period[0].originalTimeUnix;

      if (timeUnixOfFirstCandleInPeriod < next5mInterval) {
        newPeriod.push(...period);
        return true;
      }

      newPeriods.push(newPeriod);

      newPeriod = [...period];
      current5mInterval = next5mInterval;
      next5mInterval += 300;
    });

    periods = newPeriods;
  }

  const lPeriods = periods.length;

  for (let i = 0; i < lPeriods; i += 1) {
    const period = periods[i];
    const lTrades = period.length;

    let doesExistStrategy = false;

    const open = period[0].price;
    const time = period[0].originalTimeUnix;

    let sumVolume = 0;
    let close = open;
    let minLow = open;
    let maxHigh = open;

    for (let j = 0; j < lTrades; j += 1) {
      const tradePrice = period[j].price;

      if (tradePrice < minLow) {
        minLow = tradePrice;
      }

      if (tradePrice > maxHigh) {
        maxHigh = tradePrice;
      }

      close = tradePrice;
      sumVolume += period[j].quantity;

      if (!doesExistStrategy) {
        const result = calculatePriceJumps(chartCandles.originalData, {
          open,
          close,
          low: minLow,
          high: maxHigh,
          originalTimeUnix: time,
        });

        if (result) {
          doesExistStrategy = true;
          instrumentDoc.price_jumps.push(result);

          const isLong = !(close > open);

          createMyTrade(instrumentDoc, {
            isLong,
            stopLossPercent: settings.stopLossPercent,
            takeProfitPercent: settings.stopLossPercent,

            buyPrice: isLong ? close : 0,
            sellPrice: !isLong ? close : 0,

            tradeStartedAt: time,
          });
        }
      }

      checkMyTrades(instrumentDoc, {
        price: close,
        timeUnix: time,
      });
    }

    chartCandles.originalData.push({
      time,
      originalTime: new Date(time * 1000),
      originalTimeUnix: time,

      open,
      close,
      low: minLow,
      high: maxHigh,
      volume: sumVolume,
    });
  }

  const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];

  checkMyTrades(instrumentDoc, {
    price: lastCandle.close,
    timeUnix: lastCandle.originalTimeUnix,
  }, true);

  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
    value: e.volume,
    time: e.time,
  })));
};

const splitDays = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  let { originalData } = chartCandles;

  if (!originalData || !originalData.length) {
    return [];
  }

  const firstCandle = originalData[0];

  // skip not full hour
  const divider = firstCandle.originalTimeUnix % 86400;

  if (divider !== 0) {
    const startOfNextDayUnix = (firstCandle.originalTimeUnix - divider) + 86400;

    let increment = 1;
    let startIndex = false;

    while (1) {
      const candle = originalData[increment];

      if (!candle) {
        break;
      }

      if (candle.originalTimeUnix === startOfNextDayUnix) {
        startIndex = increment;
        break;
      }

      increment += 1;
    }

    if (!startIndex) {
      return [];
    }

    originalData = originalData.slice(startIndex, originalData.length);
  }

  const intervals = [];
  let newInterval = [originalData[0]];
  const lOriginalData = originalData.length;

  let day = new Date(originalData[0].originalTime).getUTCDate();

  for (let i = 1; i < lOriginalData; i += 1) {
    const dayOfCandle = new Date(originalData[i].originalTime).getUTCDate();

    if (dayOfCandle !== day) {
      day = dayOfCandle;

      intervals.push({
        startOfPeriodUnix: newInterval[0].originalTimeUnix,
        endOfPeriodUnix: newInterval[newInterval.length - 1].originalTimeUnix,
      });

      newInterval = [originalData[i]];
      continue;
    }

    newInterval.push(originalData[i]);
  }

  intervals.push({
    startOfPeriodUnix: newInterval[0].originalTimeUnix,
    endOfPeriodUnix: newInterval[newInterval.length - 1].originalTimeUnix,
  });

  intervals.forEach(interval => {
    const newCandleExtraSeries = chartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    chartCandles.drawSeries(newCandleExtraSeries, [{
      value: 0,
      time: interval.startOfPeriodUnix,
    }, {
      value: instrumentDoc.price * 5,
      time: interval.startOfPeriodUnix,
    }]);
  });

  return intervals;
};

const calculatePriceJumps = (originalData, currentCandle) => {
  const lOriginalData = originalData.length;

  if (!lOriginalData || lOriginalData < settings.candlesForCalculateAveragePercent) {
    return false;
  }

  let averagePercent = 0;

  for (let j = lOriginalData - settings.candlesForCalculateAveragePercent; j < lOriginalData; j += 1) {
    const candle = originalData[j];
    const isLong = candle.close > candle.open;

    const differenceBetweenPrices = isLong ?
      candle.high - candle.open : candle.open - candle.low;
    const percentPerPrice = 100 / (candle.open / differenceBetweenPrices);

    averagePercent += percentPerPrice;
  }

  averagePercent = parseFloat(
    (averagePercent / settings.candlesForCalculateAveragePercent).toFixed(2),
  );

  const isLong = currentCandle.close > currentCandle.open;

  const differenceBetweenPrices = Math.abs(
    isLong ? currentCandle.high - currentCandle.open : currentCandle.open - currentCandle.low,
  );

  const percentPerPrice = 100 / (currentCandle.open / differenceBetweenPrices);

  if (percentPerPrice > (averagePercent * settings.factorForPriceChange)) {
    return {
      ...currentCandle,
      averagePercent,
    };
  }
};

const checkMyTrades = (instrumentDoc, { price, timeUnix }, isFinish = false) => {
  const chartCandles = instrumentDoc.chart_candles;

  if (!instrumentDoc.my_trades || !instrumentDoc.my_trades.length) {
    return true;
  }

  instrumentDoc.my_trades
    .filter(myTrade => myTrade.isActive)
    .forEach(myTrade => {
      if ((myTrade.isLong && price > myTrade.takeProfitPrice)
        || (!myTrade.isLong && price < myTrade.takeProfitPrice)) {
        let incrValue = 1;
        let newStopLoss;
        let newTakeProfit;

        if (myTrade.isLong) {
          while (1) {
            newTakeProfit = price + (myTrade.profitStepSize * incrValue);
            if (newTakeProfit > price) break;
            incrValue += 1;
          }

          newStopLoss = (newTakeProfit - (myTrade.profitStepSize * 2));
        } else {
          while (1) {
            newTakeProfit = price - (myTrade.profitStepSize * incrValue);
            if (newTakeProfit < price) break;
            incrValue += 1;
          }

          newStopLoss = (newTakeProfit + (myTrade.profitStepSize * 2));
        }

        newStopLoss = parseFloat(newStopLoss.toFixed(instrumentDoc.price_precision));

        myTrade.stopLossPrice = newStopLoss;
        myTrade.takeProfitPrice = parseFloat(newTakeProfit.toFixed(instrumentDoc.price_precision));

        // myTrade.arrSL.push(myTrade.stopLossPrice);
        // myTrade.arrTP.push(myTrade.takeProfitPrice);
      }

      if (isFinish
        || (myTrade.isLong && price < myTrade.stopLossPrice)
        || (!myTrade.isLong && price > myTrade.stopLossPrice)) {
        myTrade.isActive = false;
        myTrade.tradeEndedAt = timeUnix;

        if (myTrade.isLong) {
          myTrade.sellPrice = parseFloat(price);
        } else {
          myTrade.buyPrice = parseFloat(price);
        }

        let validTradeEndedAt;
        let validTradeStartedAt;

        if (choosenPeriod === AVAILABLE_PERIODS.get('1M')) {
          validTradeStartedAt = moment(myTrade.tradeStartedAt * 1000).utc()
            .startOf('minute').unix();

          validTradeEndedAt = moment(myTrade.tradeEndedAt * 1000).utc()
            .startOf('minute').unix() + 60;
        } else {
          const coeff = 5 * 60 * 1000;
          const nextIntervalForEndedAtUnix = (Math.ceil((myTrade.tradeEndedAt * 1000) / coeff) * coeff) / 1000;
          const prevIntervalForStartedAtUnix = ((Math.ceil((myTrade.tradeStartedAt * 1000) / coeff) * coeff) / 1000) - 300;

          validTradeStartedAt = prevIntervalForStartedAtUnix;
          validTradeEndedAt = nextIntervalForEndedAtUnix;
        }

        const keyAction = myTrade.isLong ? 'buyPrice' : 'sellPrice';

        [
          { key: keyAction, color: constants.YELLOW_COLOR },
          { key: 'stopLossPrice', color: constants.RED_COLOR },
          { key: 'takeProfitPrice', color: constants.GREEN_COLOR },
        ]
          .forEach(e => {
            const newExtraSeries = chartCandles.addExtraSeries({
              color: e.color,
              lastValueVisible: false,
            });

            chartCandles.drawSeries(newExtraSeries, [{
              value: myTrade[e.key],
              time: validTradeStartedAt,
            }, {
              value: myTrade[e.key],
              time: validTradeEndedAt,
            }]);
          });

        // markers
        const profit = myTrade.sellPrice - myTrade.buyPrice;
        const differenceBetweenPrices = Math.abs(profit);
        let percentPerPrice = 100 / (myTrade.buyPrice / differenceBetweenPrices);

        if (profit < 0) {
          percentPerPrice = -percentPerPrice;
        }

        const shape = myTrade.isLong ? 'arrowUp' : 'arrowDown';
        const color = profit < 0 ? constants.RED_COLOR : constants.GREEN_COLOR;
        const text = `${(profit * myTrade.quantity).toFixed(2)} (${percentPerPrice.toFixed(1)}%)`;

        chartCandles.addMarker({
          text,
          shape,
          color,
          time: myTrade.tradeStartedAt,
        });
      }
    });

  if (isFinish) {
    const $slider = $chartsContainer.find('.chart-slider.futures');

    $slider
      .find('span.amount-slides')
      .text(instrumentDoc.my_trades.length);

    chartCandles.drawMarkers();

    scrollToTrade(1, {
      instrumentId: instrumentDoc._id,
    }, instrumentDoc.my_trades.map(myTrade => ({
      originalTimeUnix: myTrade.tradeStartedAt,
    })));
  }
};

const createMyTrade = (instrumentDoc, options) => {
  const price = options.isLong ?
    options.buyPrice : options.sellPrice;

  const stepSize = instrumentDoc.step_size;
  const stepSizePrecision = getPrecision(stepSize);
  let quantity = WORK_AMOUNT / price;

  if (quantity < stepSize) {
    return true;
  }

  const remainder = quantity % stepSize;

  if (remainder !== 0) {
    quantity -= remainder;

    if (quantity < stepSize) {
      return true;
    }
  }

  quantity = parseFloat(quantity.toFixed(stepSizePrecision));

  const stopLossPercent = options.stopLossPercent / 100;
  const takeProfitPercent = options.takeProfitPercent / 100;

  const stopLossStepSize = parseFloat((price * stopLossPercent).toFixed(instrumentDoc.price_precision));
  const profitStepSize = parseFloat((price * takeProfitPercent).toFixed(instrumentDoc.price_precision));

  if (options.isLong) {
    options.takeProfitPrice = price + (profitStepSize * 2);
    options.stopLossPrice = price - stopLossStepSize;
  } else {
    options.takeProfitPrice = price - (profitStepSize * 2);
    options.stopLossPrice = price + stopLossStepSize;
  }

  options.isActive = true;
  options.quantity = quantity;
  options.profitStepSize = profitStepSize;
  options.index = instrumentDoc.my_trades.length;
  options.stopLossPrice = parseFloat(options.stopLossPrice.toFixed(instrumentDoc.price_precision));
  options.takeProfitPrice = parseFloat(options.takeProfitPrice.toFixed(instrumentDoc.price_precision));

  // options.arrSL = [options.stopLossPrice];
  // options.arrTP = [options.takeProfitPrice];

  instrumentDoc.my_trades.push(options);
};

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs = instrumentsDocs.filter(doc => doc.is_futures);

  instrumentsDocs
    .forEach(doc => {
      appendInstrumentsStr += `<div
        id="instrument-${doc._id}"
        class="instrument"
        data-instrumentid=${doc._id}>
        <span class="instrument-name">${doc.name}</span>
      </div>`;
    });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const scrollToTrade = (action, { instrumentId }, slides) => {
  if (!slides.length) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const chartCandles = instrumentDoc.chart_candles;

  const $slider = $chartsContainer.find('.chart-slider.futures');
  const $currentSlide = $slider.find('span.current-slide');
  const $amountSlides = $slider.find('span.amount-slides');

  let currentSlide = parseInt($currentSlide.text(), 10);
  const amountSlides = parseInt($amountSlides.text(), 10);

  if (Number.isInteger(action)) {
    currentSlide = action;
  } else if (action === 'next') {
    currentSlide += 1;
  } else {
    currentSlide -= 1;
  }

  if (currentSlide === 0) {
    currentSlide = amountSlides;
  }

  if (currentSlide === amountSlides + 1) {
    currentSlide = 1;
  }

  $currentSlide.text(currentSlide);

  let barsToTargetCandle = 0;

  const firstCandle = chartCandles.originalData.find(candle =>
    candle.originalTimeUnix === slides[currentSlide - 1].originalTimeUnix,
  );

  for (let i = chartCandles.originalData.length - 1; i >= 0; i -= 1) {
    if (chartCandles.originalData[i].originalTimeUnix === firstCandle.originalTimeUnix) {
      barsToTargetCandle = chartCandles.originalData.length - i; break;
    }
  }

  chartCandles.chart
    .timeScale()
    .scrollToPosition(-barsToTargetCandle, false);
};

const initReport = (periods = []) => {
  if (!periods.length) {
    return true;
  }

  let periodsResultStr = '';

  periods = periods.sort((a, b) => a < b ? -1 : 1);

  periods.forEach(period => {
    const validDate = moment(period * 1000).format('DD.MM');

    periodsResultStr += `<td class="period p-${period}" data-period="${period}">
      <table>
        <tr>
          <th>#</th>
          <th>Profit</th>
          <th>%</th>
          <th>Date</th>
        </tr>

        <tr>
          <td>*</td>
          <td class="commonProfit">0</td>
          <td class="commonProfitPercent">0%</td>
          <td>${validDate}</td>
        </tr>
      </table>
    </td>`;
  });

  const mainTableStr = `<table class="main-table">
    <tr class="result">
      <td class="common">
        <table>
          <tr>
            <th class="instrument-name">#</th>
            <th>Profit</th>
            <th>%</th>
          </tr>

          <tr>
            <td class="instrument-name">*</td>
            <td class="commonProfit">0</td>
            <td class="commonProfitPercent">0%</td>
          </tr>
        </table>
      </td>

      ${periodsResultStr}
    </tr>
  </table>`;

  $report.empty()
    .append(mainTableStr);
};

const makeReport = () => {
  let commonProfitForRequest = 0;
  let commonProfitPercentForRequest = 0;

  const $result = $report.find('tr.result');

  const periods = [];

  $result.find('.period').each((index, elem) => {
    periods.push(parseInt(elem.dataset.period, 10));
  });

  const processedInstrumentsDocs = [];

  instrumentsDocs.forEach(doc => {
    let commonProfit = 0;
    let commonProfitPercent = 0;

    if (!doc.my_trades || !doc.my_trades.length) {
      return true;
    }

    doc.profit = 0;
    doc.profitPercent = 0;

    doc.my_trades.forEach(myTrade => {
      if (!myTrade.profit) {
        const divider = myTrade.tradeStartedAt % 86400;
        const startOfDayUnix = myTrade.tradeStartedAt - divider;

        myTrade.startOfDayUnix = startOfDayUnix;

        if (!myTrade.sellPrice) {
          alert('No myTrade.sellPrice');
          myTrade.sellPrice = NaN;
        }

        if (!myTrade.buyPrice) {
          alert('No myTrade.buyPrice');
          myTrade.buyPrice = NaN;
        }

        const profit = myTrade.sellPrice - myTrade.buyPrice;
        const differenceBetweenPrices = Math.abs(profit);
        let percentPerPrice = 100 / (myTrade.buyPrice / differenceBetweenPrices);

        if (profit < 0) {
          percentPerPrice = -percentPerPrice;
        }

        myTrade.profit = (profit * myTrade.quantity);
        myTrade.profitPercent = percentPerPrice;
      }

      commonProfit += myTrade.profit;
      commonProfitPercent += myTrade.profitPercent;
    });

    doc.profit = commonProfit;
    doc.profitPercent = commonProfitPercent;

    commonProfitForRequest += doc.profit;
    commonProfitPercentForRequest += doc.profitPercent;

    processedInstrumentsDocs.push(doc);
  });

  if (!processedInstrumentsDocs.length) {
    return true;
  }

  let instrumentsStr = '';

  processedInstrumentsDocs
    .sort((a, b) => a.profitPercent > b.profitPercent ? -1 : 1)
    .forEach(doc => {
      let tdStr = '';

      for (let i = 0; i < periods.length; i += 1) {
        let tableStr = `<table>
          <tr>
            <th>#</th>
            <th>Profit</th>
            <th>%</th>
            <th>Time</th>
          </tr>
        `;

        let periodProfit = 0;
        let periodProfitPercent = 0;

        const periodMyTrades = doc.my_trades
          .filter(myTrade => myTrade.startOfDayUnix === periods[i]);

        periodMyTrades
          .sort((a, b) => a.tradeStartedAt > b.tradeStartedAt ? -1 : 1)
          .forEach((myTrade, index) => {
            const validTime = moment(myTrade.tradeStartedAt * 1000).format('HH:mm');

            let classFillColor = '';

            if (!myTrade.isActive) {
              classFillColor = myTrade.profitPercent > 0 ? 'green' : 'red';
            }

            tableStr += `<tr class="trade" data-index="${myTrade.index}">
              <td>${index + 1}</td>
              <td>${myTrade.profit.toFixed(2)}</td>
              <td class="${classFillColor}">${myTrade.profitPercent.toFixed(2)}%</td>
              <td>${validTime}</td>
            </tr>`;

            periodProfit += myTrade.profit;
            periodProfitPercent += myTrade.profitPercent;
          });

        tableStr += `
          <tr>
            <td>${periodMyTrades.length}</td>
            <td>${periodProfit.toFixed(2)}</td>
            <td>${periodProfitPercent.toFixed(2)}%</td>
            <td></td>
          </tr>
        </table>`;

        tdStr += `<td class="period">${tableStr}</td>`;
      }

      instrumentsStr += `<tr class="instrument" data-instrumentid="${doc._id}">
        <td>
          <table>
            <tr>
              <th class="instrument-name">${doc.name}</th>
              <th>Profit</th>
              <th>%</th>
            </tr>

            <tr>
              <td>${doc.price}</td>
              <td>${doc.profit.toFixed(2)}</td>
              <td>${doc.profitPercent.toFixed(2)}</td>
            </tr>
          </table>
        </td>
        ${tdStr}
      </tr>`;
    });

  $report.find('table.main-table')
    .append(instrumentsStr);

  $result.find('td.common .commonProfit').text(commonProfitForRequest.toFixed(2));
  $result.find('td.common .commonProfitPercent').text(`${commonProfitPercentForRequest.toFixed(2)}%`);

  periods.forEach(period => {
    const targetMyTrades = [];

    processedInstrumentsDocs.forEach(doc => {
      targetMyTrades.push(...doc.my_trades
        .filter(myTrade => myTrade.startOfDayUnix === period));
    });

    let periodProfit = 0;
    let periodProfitPercent = 0;

    targetMyTrades.forEach(myTrade => {
      periodProfit += myTrade.profit;
      periodProfitPercent += myTrade.profitPercent;
    });

    $result.find(`.period.p-${period} .commonProfit`).text(periodProfit.toFixed(2));
    $result.find(`.period.p-${period} .commonProfitPercent`).text(`${periodProfitPercent.toFixed(2)}%`);
  });
};

const loadTrades = async ({
  instrumentName,

  startDate,
  endDate,
}) => {
  console.log('started loading');

  wsClient.send(JSON.stringify({
    actionName: 'request',
    data: {
      requestName: 'tradesData',
      instrumentName,
      startDate,
      endDate,
    },
  }));

  const trades = [];

  await (() => {
    return new Promise(resolve => {
      wsClient.onmessage = async data => {
        const parsedData = JSON.parse(data.data);

        if (!parsedData.status) {
          alert(parsedData.message || 'Cant get trades data');
          return resolve();
        }

        if (parsedData.isEnd) {
          return resolve();
        } else {
          const queues = getQueue(parsedData.result, 100000);

          queues.forEach(queue => {
            trades.push(...queue);
          });
        }
      };
    });
  })();

  console.log('ended loading');

  if (!trades.length) {
    return false;
  }

  const splitByMinutes = [];
  let newSplit = [trades[0]];

  let minute = new Date(trades[0][2]).getUTCMinutes();

  for (let i = 1; i < trades.length; i += 1) {
    const minuteOfTrade = new Date(trades[i][2]).getUTCMinutes();

    if (minuteOfTrade !== minute) {
      minute = minuteOfTrade;

      splitByMinutes.push(
        newSplit.map(tradeData => {
          const [
            price,
            quantity,
            time,
          ] = tradeData;

          const originalTimeUnix = parseInt(
            (new Date(time).setSeconds(0)) / 1000, 10,
          );

          return {
            price: parseFloat(price),
            quantity: parseFloat(quantity),
            originalTimeUnix,
          };
        }),
      );

      newSplit = [trades[i]];
      continue;
    }

    newSplit.push(trades[i]);
  }

  return splitByMinutes;
};

const reset = ({ instrumentId }) => {
  // chart
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  $chartsContainer.empty();

  instrumentDoc.chart_candles = false;
  instrumentDoc.indicator_volume = false;

  // report
  const $result = $report.find('tr.result');

  $result.find('.commonProfit').text(0);
  $result.find('.commonProfitPercent').text('0%');

  $report.find('tr.instrument').remove();
};

const getPrecision = (price) => {
  const dividedPrice = price.toString().split('.');

  if (!dividedPrice[1]) {
    return 0;
  }

  return dividedPrice[1].length;
};
