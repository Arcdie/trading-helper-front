/* global
functions, makeRequest, getQueue, getPrecision, sleep,
objects, moment, constants, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

const AVAILABLE_HISTORY_MODES = new Map([
  ['trades', 'trades'],
  ['candles', 'candles'],
]);

const WORK_AMOUNT = 10;
const BINANCE_COMMISSION = 0.04;
const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5m');
// const HISTORY_MODE = AVAILABLE_HISTORY_MODES.get('candles');

/* Variables */

const settings = {
  stopLossPercent: 2,
  considerBtcMircoTrend: false,
  considerFuturesMircoTrend: false,

  factorForPriceChange: 3,
  candlesForCalculateAveragePercent: 36, // 3 hours (5m)
};

let instrumentsDocs = [];

let choosenInstrumentId;
const choosenPeriod = DEFAULT_PERIOD;
const windowHeight = window.innerHeight;

// 1 december 2021 - 1 january 2022
const startDate = moment().utc().startOf('month').add(-1, 'months');
const endDate = moment().utc().endOf('hour');

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

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

  $settings.find('.stoploss-percent').val(settings.stopLossPercent);

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

  instrumentsDocs.forEach(doc => {
    doc.my_trades = [];
  });

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
        reset({ instrumentId: choosenInstrumentId });
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      await loadCharts({ instrumentId });
      await calculateTrades({ instrumentId });
      const daysIntervals = splitDays({ instrumentId });

      if (!choosenInstrumentId) {
        initReport(daysIntervals.map(interval => interval.startOfPeriodUnix));
      }

      makeReport({ instrumentId });

      choosenInstrumentId = instrumentId;
    });

  $settings
    .find('input[type="text"]')
    .on('change', async function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        case 'stoploss-percent': settings.stopLossPercent = newValue; break;

        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        instrumentsDocs.forEach(doc => {
          doc.my_trades = [];
        });

        await calculateTrades({ instrumentId });
        makeReport({ instrumentId });
      }
    });

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

  $(document)
    .on('keyup', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      // arrow down
      if (e.keyCode === 40) {
        const indexOfInstrumentDoc = instrumentsDocs.findIndex(
          doc => doc._id === choosenInstrumentId,
        );

        const nextIndex = indexOfInstrumentDoc + 1;

        if (!instrumentsDocs[nextIndex]) {
          return true;
        }

        $instrumentsList
          .find('.instrument').eq(nextIndex)
          .click();
      }

      // arrow right
      if (e.keyCode === 39) {
        const indexOfInstrumentDoc = instrumentsDocs.findIndex(
          doc => doc._id === choosenInstrumentId,
        );

        const nextInstrumentsDocs = instrumentsDocs
          .slice(indexOfInstrumentDoc, instrumentsDocs.length);

        for await (const doc of nextInstrumentsDocs) {
          await $._data($($instrumentsList).get(0), 'events').click[0].handler(`#instrument-${doc._id}`);
          await sleep(1000);
        }
      }
    });
});

/* Functions */

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  instrumentDoc.candles_data = await getCandlesData({
    period: choosenPeriod,
    instrumentId: instrumentDoc._id,

    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
  });

  const chartKeys = ['futures'];

  if (settings.considerBtcMircoTrend) {
    chartKeys.push('btc');

    if (!btcDoc.candles_data) {
      btcDoc.candles_data = await getCandlesData({
        period: choosenPeriod,
        instrumentId: btcDoc._id,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });
    }
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
            <div class="5m is_worked is_active" data-period="5m"><span>5M</span></div>
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

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    // /*
    const indicatorMicroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 3,
      artPeriod: 10,
      candlesPeriod: choosenPeriod,
    });

    const indicatorMacroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 5,
      artPeriod: 20,
      candlesPeriod: choosenPeriod,
    });
    // */

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_micro_supertrend = indicatorMicroSuperTrend;
    chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;

    chartCandles.setOriginalData(chartKeyDoc.candles_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    // indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);
    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

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

const calculateTrades = async ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');

  const chartCandles = instrumentDoc.chart_candles;
  const indicatorMicroSuperTrend = instrumentDoc.indicator_micro_supertrend;
  const indicatorMacroSuperTrend = instrumentDoc.indicator_macro_supertrend;

  const candlesData = [];
  const candlesOriginalData = chartCandles.originalData;
  const lOriginalCandles = candlesOriginalData.length;

  let microTrendData = [];
  let macroTrendData = [];

  let microTrendDataBtc = [];
  let macroTrendDataBtc = [];

  let microTrendDataUpperTimerame = [];
  let macroTrendDataUpperTimeframe = [];

  if (settings.considerBtcMircoTrend) {
    microTrendDataBtc = indicatorMicroSuperTrend.calculateData(btcDoc.chart_candles.originalData);
    macroTrendDataBtc = indicatorMacroSuperTrend.calculateData(btcDoc.chart_candles.originalData);
  }

  /*
  let candlesData1h = await getCandlesData({
    period: '1h',
    instrumentId: instrumentDoc._id,

    startTime: moment(startDate).add(-1, 'months').toISOString(),
    endTime: endDate.toISOString(),
  });

  candlesData1h = chartCandles.prepareNewData(candlesData1h, false);

  microTrendDataUpperTimerame = indicatorMicroSuperTrend.calculateData(candlesData1h);
  macroTrendDataUpperTimeframe = indicatorMacroSuperTrend.calculateData(candlesData1h);
  // */

  for (let i = 0; i < lOriginalCandles; i += 1) {
    const currentCandle = candlesOriginalData[i];

    checkMyTrades(instrumentDoc, currentCandle, {
      // microTrendData,
      // macroTrendData,
    });

    // const doesExistActiveTrade = instrumentDoc.my_trades
    //   .find(myTrade => myTrade.isActive);

    const result = strategyFunctionLong({
      candlesData,
      microTrendData,
      macroTrendData,

      microTrendDataBtc,
      macroTrendDataBtc,
      microTrendDataUpperTimerame,
      macroTrendDataUpperTimeframe,
    }, {
      ...currentCandle,
      isClosed: true,
    }, settings);

    if (result) {
      const stopLossPercent = settings.stopLossPercent / 100;
      const percentPerPrice = (result.close * stopLossPercent);

      const stopLossPrice = result.isLong ?
        (currentCandle.close - percentPerPrice) : (currentCandle.close + percentPerPrice);

      createMyTrade(instrumentDoc, {
        isLong: result.isLong,

        buyPrice: result.isLong ? currentCandle.close : 0,
        sellPrice: !result.isLong ? currentCandle.close : 0,

        stopLossPrice,
        // stopLossPrice: result.isLong ? currentCandle.low : currentCandle.high,

        // stopLossPercent: settings.stopLossPercent,
        // takeProfitPercent: settings.stopLossPercent,

        tradeStartedAt: currentCandle.originalTimeUnix,
      });
    }

    candlesData.push(currentCandle);

    microTrendData = indicatorMicroSuperTrend.calculateData(candlesData);
    macroTrendData = indicatorMacroSuperTrend.calculateData(candlesData);
  }

  const lastCandle = candlesData[candlesData.length - 1];

  checkMyTrades(instrumentDoc, lastCandle, {
    microTrendData,
    macroTrendData,
  }, true);

  console.log(instrumentDoc.my_trades);
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

  /*
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
  */

  return intervals;
};

const strategyFunctionLong = ({
  candlesData,
  microTrendData,
  macroTrendData,

  microTrendDataBtc,
  macroTrendDataBtc,

  microTrendDataUpperTimerame,
  macroTrendDataUpperTimeframe,
}, currentCandle, settings) => {
  if (!currentCandle.isClosed) {
    return false;
  }

  const lCandlesData = candlesData.length;
  const lMicroTrendData = microTrendData.length;
  const lMacroTrendData = macroTrendData.length;

  // if (!lCandlesData || !lMicroTrendData || !lMacroTrendData) {
  //   return false;
  // }

  if (lCandlesData < (20 * 2) || !lMicroTrendData || !lMacroTrendData) {
    return false;
  }

  const isLongCurrentCandle = currentCandle.close > currentCandle.open;

  if (!isLongCurrentCandle) {
    return false;
  }

  const lastMicroTrendData = microTrendData[lMicroTrendData - 1];
  const lastMacroTrendData = macroTrendData[lMacroTrendData - 1];

  // if (lastMicroTrendData.isLong) {
  //   return false;
  // }

  if (lastMacroTrendData.isLong) {
    return false;
  }

  // if (!lastMacroTrendData.isLong
  //   || lastMicroTrendData.isLong) {
  //   return false;
  // }

  if (currentCandle.close < lastMacroTrendData.superTrend) {
    return false;
  }

  /*
  const indexOfBtcCandle = microTrendDataBtc.findIndex(
    data => data.originalTimeUnix === lastMacroTrendData.originalTimeUnix,
  );

  if (microTrendDataBtc[indexOfBtcCandle].isLong
    || macroTrendDataBtc[indexOfBtcCandle].isLong) {
    return false;
  }
  */

  return {
    ...currentCandle,
    isLong: true,
  };
};

const strategyFunctionShort = ({
  candlesData,
  microTrendData,
  macroTrendData,

  microTrendDataBtc,
  macroTrendDataBtc,

  microTrendDataUpperTimerame,
  macroTrendDataUpperTimeframe,
}, currentCandle, settings) => {
  if (!currentCandle.isClosed) {
    return false;
  }

  const lCandlesData = candlesData.length;
  const lMicroTrendData = microTrendData.length;
  const lMacroTrendData = macroTrendData.length;

  // if (!lCandlesData || !lMicroTrendData || !lMacroTrendData) {
  //   return false;
  // }

  if (lCandlesData < (20 * 2) || !lMicroTrendData || !lMacroTrendData) {
    return false;
  }

  const isLongCurrentCandle = currentCandle.close > currentCandle.open;

  if (isLongCurrentCandle) {
    return false;
  }

  /*
  const differenceBetweenOpenAndClose = Math.abs(
    isLongCurrentCandle ? currentCandle.close - currentCandle.low : currentCandle.high - currentCandle.close,
  );

  const percentPerPrice = 100 / ((isLongCurrentCandle ? currentCandle.low : currentCandle.high) / differenceBetweenOpenAndClose);

  if (percentPerPrice > settings.stopLossPercent) {
    return false;
  }
  */

  const lastMicroTrendData = microTrendData[lMicroTrendData - 1];
  const lastMacroTrendData = macroTrendData[lMacroTrendData - 1];

  // if (lastMicroTrendData.isLong) {
  //   return false;
  // }

  if (!lastMacroTrendData.isLong) {
    return false;
  }

  // if (!lastMacroTrendData.isLong
  //   || lastMicroTrendData.isLong) {
  //   return false;
  // }

  if (currentCandle.close > lastMacroTrendData.superTrend) {
    return false;
  }

  const indexOfBtcCandle = microTrendDataBtc.findIndex(
    data => data.originalTimeUnix === lastMacroTrendData.originalTimeUnix,
  );

  if (microTrendDataBtc[indexOfBtcCandle].isLong
    || macroTrendDataBtc[indexOfBtcCandle].isLong) {
    return false;
  }

  const lastMicroTrendDataBtc = microTrendDataBtc[lCandlesData - 1];
  // const lastMacroTrendDataBtc = macroTrendDataBtc[lCandlesData - 1];

  let minLow = lastMicroTrendDataBtc.low;
  let maxHigh = lastMicroTrendDataBtc.high;

  let increment = 0;

  while (1) {
    increment += 1;

    const { low, high, isLong } = microTrendDataBtc[lCandlesData - increment];

    if (isLong) {
      break;
    }

    if (low < minLow) {
      minLow = low;
    }

    if (high > maxHigh) {
      maxHigh = high;
    }
  }

  const differenceBetweenLowAndHigh = Math.abs(maxHigh - minLow);
  const percentPerPrice = 100 / (maxHigh / differenceBetweenLowAndHigh);

  console.log('percentPerPrice', percentPerPrice);

  if (percentPerPrice < 5) {
    return false;
  }

  return {
    ...currentCandle,
    isLong: false,
  };
};

const checkMyTrades = (instrumentDoc, currentCandle, {
  microTrendData,
  macroTrendData,
}, isFinish = false) => {
  const chartCandles = instrumentDoc.chart_candles;

  if (!instrumentDoc.my_trades || !instrumentDoc.my_trades.length) {
    return true;
  }

  const { superTrend } = microTrendData[microTrendData.length - 1];

  instrumentDoc.my_trades
    .filter(myTrade => myTrade.isActive)
    .forEach(myTrade => {
      if (!myTrade.takeProfitPercent) {
        if ((myTrade.isLong && superTrend > myTrade.stopLossPrice)
          || (!myTrade.isLong && superTrend < myTrade.stopLossPrice)) {
          myTrade.stopLossPrice = superTrend;
        }
      }

      if (isFinish
        || (myTrade.isLong && currentCandle.low < myTrade.stopLossPrice)
        || (!myTrade.isLong && currentCandle.high > myTrade.stopLossPrice)) {
        myTrade.isActive = false;
        myTrade.tradeEndedAt = currentCandle.originalTimeUnix;

        /*
        const maxProfitPrice = myTrade.isLong ? myTrade.sellPrice : myTrade.buyPrice;

        if (myTrade.isLong && myTrade.sellPrice < myTrade.takeProfitPrice) {
          myTrade.sellPrice = myTrade.stopLossPrice;
        } else if (!myTrade.isLong && myTrade.buyPrice > myTrade.takeProfitPrice) {
          myTrade.buyPrice = myTrade.stopLossPrice;
        }

        myTrade.takeProfitPrice = maxProfitPrice;
        */

        if (myTrade.isLong) {
          myTrade.sellPrice = myTrade.stopLossPrice;
        } else {
          myTrade.buyPrice = myTrade.stopLossPrice;
        }

        const validTradeEndedAt = myTrade.tradeStartedAt;
        const validTradeStartedAt = myTrade.tradeEndedAt;

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

  if (!options.stopLossPrice) {
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

    options.profitStepSize = profitStepSize;
    options.takeProfitPrice = parseFloat(options.takeProfitPrice.toFixed(instrumentDoc.price_precision));
  } else {
    // ...
  }

  options.isActive = true;
  options.quantity = quantity;
  options.index = instrumentDoc.my_trades.length;
  options.stopLossPrice = parseFloat(options.stopLossPrice.toFixed(instrumentDoc.price_precision));

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

    periodsResultStr += `<td class="period p-${period} is_active" data-period="${period}">
      <table>
        <tr>
          <th>#</th>
          <th>Profit</th>
          <th>-</th>
          <th>=</th>
          <th>%</th>
          <th>Date</th>
        </tr>

        <tr>
          <td>*</td>
          <td class="commonProfit">0</td>
          <td class="commonSumCommissions">0</td>
          <td class="commonResult">0</td>
          <td class="commonResultPercent">0%</td>
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
            <th>-</th>
            <th>=</th>
            <th>%</th>
          </tr>

          <tr>
            <td class="instrument-name">*</td>
            <td class="commonProfit">0</td>
            <td class="commonSumCommissions">0</td>
            <td class="commonResult">0</td>
            <td class="commonResultPercent">0%</td>
          </tr>
        </table>
      </td>

      ${periodsResultStr}
    </tr>
  </table>`;

  $report.empty()
    .append(mainTableStr);
};

const makeReport = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!instrumentDoc.my_trades || !instrumentDoc.my_trades.length) {
    return true;
  }

  let commonProfitForRequest = 0;
  let commonResultPercentForRequest = 0;
  let commonSumCommissionsForRequest = 0;

  const $result = $report.find('tr.result');

  const periods = [];

  $report.find('.period').addClass('is_active');
  $result.find('.period').each((index, elem) => {
    periods.push(parseInt(elem.dataset.period, 10));
  });

  let commonProfit = 0;
  let commonResult = 0;
  let commonResultPercent = 0;
  let commonSumCommissions = 0;

  instrumentDoc.my_trades.forEach(myTrade => {
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

      const sumBuyPrice = myTrade.buyPrice * myTrade.quantity;
      const sumSellPrice = myTrade.sellPrice * myTrade.quantity;

      const sumBuyCommissions = (sumBuyPrice * (BINANCE_COMMISSION / 100));
      const sumSellCommissions = (sumSellPrice * (BINANCE_COMMISSION / 100));

      const sumCommissions = (sumBuyCommissions + sumSellCommissions);

      const profit = myTrade.sellPrice - myTrade.buyPrice;
      const startPrice = myTrade.isLong ? myTrade.buyPrice : myTrade.sellPrice;

      const result = (profit * myTrade.quantity) - sumCommissions;

      let profitPercentPerPrice = 100 / (startPrice / Math.abs(profit));
      const resultPercentPerPrice = 100 / (WORK_AMOUNT / result);

      if (profit < 0) {
        profitPercentPerPrice = -profitPercentPerPrice;
      }

      myTrade.result = result;
      myTrade.profit = (profit * myTrade.quantity);
      myTrade.profitPercent = profitPercentPerPrice;
      myTrade.resultPercent = resultPercentPerPrice;
      myTrade.sumCommissions = sumCommissions;
    }

    commonProfit += myTrade.profit;
    commonResultPercent += myTrade.resultPercent;
    commonSumCommissions += myTrade.sumCommissions;
  });

  commonResult = commonProfit - commonSumCommissions;

  commonProfitForRequest += commonProfit;
  commonResultPercentForRequest += commonResultPercent;
  commonSumCommissionsForRequest += commonSumCommissions;

  let tdStr = '';

  for (let i = 0; i < periods.length; i += 1) {
    let tableStr = '';

    let periodProfit = 0;
    let periodResultPercent = 0;
    let periodSumCommissions = 0;

    const periodMyTrades = instrumentDoc.my_trades
      .filter(myTrade => myTrade.startOfDayUnix === periods[i]);

    periodMyTrades
      .sort((a, b) => a.tradeStartedAt > b.tradeStartedAt ? -1 : 1)
      .forEach((myTrade, index) => {
        const validTime = moment(myTrade.tradeStartedAt * 1000).format('HH:mm');

        let classFillColor = '';

        if (!myTrade.isActive) {
          classFillColor = myTrade.resultPercent > 0 ? 'green' : 'red';
        }

        tableStr += `<tr class="trade" data-index="${myTrade.index}">
          <td>${index + 1}</td>
          <td>${myTrade.profit.toFixed(2)}</td>
          <td>${myTrade.sumCommissions.toFixed(2)}</td>
          <td>${myTrade.result.toFixed(2)}</td>
          <td class="${classFillColor}">${myTrade.resultPercent.toFixed(2)}%</td>
          <td>${validTime}</td>
        </tr>`;

        periodProfit += myTrade.profit;
        periodResultPercent += myTrade.resultPercent;
        periodSumCommissions += myTrade.sumCommissions;
      });

    const periodResult = periodProfit - periodSumCommissions;

    tdStr += `<td class="period period p-${periods[i]} is_active">
      <table>
        <tr>
          <th>#</th>
          <th>Profit</th>
          <th>-</th>
          <th>=</th>
          <th>%</th>
          <th>Time</th>
        </tr>

        <tr>
          <td>${periodMyTrades.length}</td>
          <td>${periodProfit.toFixed(2)}</td>
          <td>${periodSumCommissions.toFixed(2)}</td>
          <td>${periodResult.toFixed(2)}</td>
          <td class="${periodResultPercent > 0 ? 'green' : 'red'}">${periodResultPercent.toFixed(2)}%</td>
          <td></td>
        </tr>

        ${tableStr}
      </table>
    </td>`;
  }

  $report.find('table.main-table')
    .append(`<tr class="instrument" data-instrumentid="${instrumentDoc._id}">
      <td>
        <table>
          <tr>
            <th class="instrument-name">${instrumentDoc.name}</th>
            <th>Profit</th>
            <th>-</th>
            <th>=</th>
            <th>%</th>
          </tr>

          <tr>
            <td>${instrumentDoc.price}</td>
            <td>${commonProfit.toFixed(2)}</td>
            <td>${commonSumCommissions.toFixed(2)}</td>
            <td>${commonResult.toFixed(2)}</td>
            <td class="${commonResultPercent >= 0 ? 'green' : 'red'}">${commonResultPercent.toFixed(2)}%</td>
          </tr>
        </table>
      </td>
      ${tdStr}
    </tr>`);

  const commonResultForRequest = commonProfitForRequest - commonSumCommissionsForRequest;

  $result.find('td.common .commonProfit').text(commonProfitForRequest.toFixed(2));
  $result.find('td.common .commonResult').text(commonResultForRequest.toFixed(2));
  $result.find('td.common .commonSumCommissions').text(commonSumCommissionsForRequest.toFixed(2));

  $result.find('td.common .commonResultPercent')
    .attr('class', 'commonResultPercent')
    .addClass(commonResultPercentForRequest > 0 ? 'green' : 'red')
    .text(`${commonResultPercentForRequest.toFixed(2)}%`);

  periods.forEach(period => {
    const targetMyTrades = instrumentDoc.my_trades
      .filter(myTrade => myTrade.startOfDayUnix === period);

    let periodProfit = 0;
    let periodResultPercent = 0;
    let periodSumCommissions = 0;

    targetMyTrades.forEach(myTrade => {
      periodProfit += myTrade.profit;
      periodResultPercent += myTrade.resultPercent;
      periodSumCommissions += myTrade.sumCommissions;
    });

    const periodResult = periodProfit - periodSumCommissions;

    if (periodProfit === 0) {
      $report.find(`.period.p-${period}`).removeClass('is_active');
      return true;
    }

    $result.find(`.period.p-${period} .commonProfit`).text(periodProfit.toFixed(2));
    $result.find(`.period.p-${period} .commonResult`).text(periodResult.toFixed(2));
    $result.find(`.period.p-${period} .commonSumCommissions`).text(periodSumCommissions.toFixed(2));

    $result.find(`.period.p-${period} .commonResultPercent`)
      .attr('class', 'commonResultPercent')
      .addClass(periodResultPercent > 0 ? 'green' : 'red')
      .text(`${periodResultPercent.toFixed(2)}%`);
  });
};

const reset = ({ instrumentId }) => {
  // chart
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  $chartsContainer.empty();

  instrumentDoc.chart_candles = false;
  instrumentDoc.indicator_volume = false;
  instrumentDoc.indicator_micro_supertrend = false;
  instrumentDoc.indicator_macro_supertrend = false;

  instrumentDoc.trades = [];

  // report
  const $result = $report.find('tr.result');

  $result.find('.commonProfit').text(0);
  $result.find('.commonResult').text(0);
  $result.find('.commonSumCommissions').text(0);
  $result.find('.commonResultPercent').text('0%');

  $report.find('tr.instrument').remove();
};

const getCandlesData = async ({
  instrumentId,
  period,
  startTime,
  endTime,
}) => {
  console.log('start loading');

  if (!endTime) {
    endTime = new Date().toISOString();
  }

  if (!startTime) {
    startTime = moment().utc().startOf('day').toISOString();
  }

  const query = {
    instrumentId,
    startTime,
    endTime,
    isFirstCall: false,
  };

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}`,
    query,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  console.log('end loading');

  return resultGetCandles.result;
};

const getTradesData = async ({
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

  const splitByHours = [];
  let newSplit = [trades[0]];

  let hour = new Date(trades[0][2]).getUTCHours();

  for (let i = 1; i < trades.length; i += 1) {
    const hourOfTrade = new Date(trades[i][2]).getUTCHours();

    if (hourOfTrade !== hour) {
      hour = hourOfTrade;

      splitByHours.push(
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

  return splitByHours;
};
