/* global
functions, makeRequest, getUnix, sleep,
objects, constants, moment, ChartCandles, IndicatorVolume, IndicatorMovingAverage
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_CONSTANTS = '/api/strategies/priceJumps/constants';

const AVAILABLE_PERIODS = new Map([
  ['5M', '5m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

/* Variables */

let considerBtcMircoTrend;
let considerFuturesMircoTrend;
let stopLossPercent;
let factorForPriceChange;
let candlesForCalculateAveragePercent; // 3 hours (5m)

const windowHeight = window.innerHeight;

let choosenInstrumentId;

let priceJumps = [];
let instrumentsDocs = [];

const settings = {
  periodForShortMA: 20,
  periodForMediumMA: 50,

  colorForShortMA: '#0800FF',
  colorForMediumMA: '#2196F3',
};

// const startTime = moment().utc()
//   .startOf('day')
//   .add(-7, 'days');
//
// const endTime = moment().utc()
//   .startOf('hour');

const startTime = moment().utc()
  .startOf('month');

const endTime = moment().utc()
  .startOf('hour');

/* JQuery */
const $report = $('.report');
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  considerBtcMircoTrend = false;
  considerFuturesMircoTrend = false;
  stopLossPercent = 0.2;
  factorForPriceChange = 3;
  candlesForCalculateAveragePercent = 36;

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  $settings.find('.stoploss-percent').val(stopLossPercent);
  $settings.find('.factor-for-price-change').val(factorForPriceChange);
  $settings.find('.candles-for-calculate-average-percent').val(candlesForCalculateAveragePercent);

  $settings.find('#consider-btc-mirco-trend').prop('checked', considerBtcMircoTrend);
  $settings.find('#consider-futures-mirco-trend').prop('checked', considerFuturesMircoTrend);

  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

  // loading data

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: {
      isOnlyFutures: true,
    },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');

  /*
  btcDoc.original_data = await getCandlesData({
    period: DEFAULT_PERIOD,
    instrumentId: btcDoc._id,
    endTime: endTime.toISOString(),
    startTime: startTime.toISOString(),
  });
  */

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

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      choosenInstrumentId = instrumentId;

      await loadCharts({ instrumentId });

      // splitDays({ instrumentId });

      priceJumps = calculatePriceJumps({ instrumentId });
      drawMarkersForPriceJumps({ instrumentId }, priceJumps);

      // const calculatedProfit = calculateProfit({ instrumentId }, priceJumps);
      // makeReport({ instrumentId }, calculatedProfit);
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
        scrollToPriceJump($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        }, priceJumps);
      }
    });

  $settings
    .find('input[type="text"]')
    .on('change', function () {
      const className = $(this).attr('class');
      const newValue = parseFloat($(this).val());

      if (!newValue || Number.isNaN(newValue)) {
        return true;
      }

      switch (className) {
        case 'stoploss-percent': stopLossPercent = newValue; break;
        case 'factor-for-price-change': factorForPriceChange = newValue; break;

        case 'candles-for-calculate-average-percent': {
          candlesForCalculateAveragePercent = newValue; break;
        }

        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        priceJumps = calculatePriceJumps({ instrumentId });
        drawMarkersForPriceJumps({ instrumentId }, priceJumps);

        const calculatedProfit = calculateProfit({ instrumentId }, priceJumps);
        makeReport({ instrumentId }, calculatedProfit);
      }
    });

  $settings
    .find('input[type="checkbox"]')
    .on('change', async function () {
      const id = $(this).attr('id');
      const newValue = $(this).is(':checked');

      switch (id) {
        case 'consider-btc-mirco-trend': considerBtcMircoTrend = newValue; break;
        case 'consider-futures-mirco-trend': considerFuturesMircoTrend = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        await loadCharts({ instrumentId });

        priceJumps = calculatePriceJumps({ instrumentId });
        drawMarkersForPriceJumps({ instrumentId }, priceJumps);

        const calculatedProfit = calculateProfit({ instrumentId }, priceJumps);
        makeReport({ instrumentId }, calculatedProfit);
      }
    });

  $report
    .on('click', 'tr.element', function () {
      const index = $(this).data('index');

      window.scrollTo(0, 0);

      scrollToPriceJump(parseInt(index, 10) + 1, {
        instrumentId: choosenInstrumentId,
      }, priceJumps);
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
});

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

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!futuresDoc.original_data || !futuresDoc.original_data.length) {
    futuresDoc.original_data = await getCandlesData({
      period: DEFAULT_PERIOD,
      instrumentId: futuresDoc._id,
      endTime: endTime.toISOString(),
      startTime: startTime.toISOString(),
    });
  }

  const chartKeys = ['futures'];

  if (considerBtcMircoTrend) {
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
      case 'futures': { chartKeyDoc = futuresDoc; break; }

      case 'btc': {
        const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
        chartKeyDoc = btcDoc;
        break;
      }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, DEFAULT_PERIOD, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    const indicatorMovingAverageMedium = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForMediumMA,
      period: settings.periodForMediumMA,
    });

    /*
    const indicatorMicroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 3,
      artPeriod: 10,
      candlesPeriod: DEFAULT_PERIOD,
    });

    const indicatorMacroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 5,
      artPeriod: 20,
      candlesPeriod: DEFAULT_PERIOD,
    });
    */

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    const calculatedData = indicatorMovingAverageMedium.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageMedium.calculatedData = calculatedData;

    // const calculatedData = indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);

    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_moving_average_medium = indicatorMovingAverageMedium;
    // chartKeyDoc.indicator_micro_supertrend = indicatorMicroSuperTrend;
    // chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;

    // chartKeyDoc.indicator_micro_supertrend_data = calculatedData;

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && priceJumps.length) {
          let nearestBoundIndex = -1;

          priceJumps.forEach((priceJump, index) => {
            if (priceJump.originalTimeUnix < param.time) {
              nearestBoundIndex = index;
            }
          });

          if (~nearestBoundIndex) {
            const $slider = $chartsContainer.find('.chart-slider.futures');

            $slider
              .find('span.current-slide')
              .text(nearestBoundIndex + 1);
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

const splitDays = ({ instrumentId }) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresChartCandles = futuresDoc.chart_candles;
  let futuresOriginalData = futuresChartCandles.originalData;

  if (!futuresOriginalData || !futuresOriginalData.length) {
    return true;
  }

  const firstCandle = futuresOriginalData[0];

  // skip not full hour
  const divider = firstCandle.originalTimeUnix % 86400;

  if (divider !== 0) {
    const startOfNextDayUnix = (firstCandle.originalTimeUnix - divider) + 86400;

    let increment = 1;
    let startIndex = false;

    while (1) {
      const candle = futuresOriginalData[increment];

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
      return true;
    }

    futuresOriginalData = futuresOriginalData.slice(startIndex, futuresOriginalData.length);
  }

  const intervals = [];
  let newInterval = [futuresOriginalData[0]];
  const lOriginalData = futuresOriginalData.length;

  let day = new Date(futuresOriginalData[0].originalTime).getUTCDate();

  for (let i = 1; i < lOriginalData; i += 1) {
    const dayOfCandle = new Date(futuresOriginalData[i].originalTime).getUTCDate();

    if (dayOfCandle !== day) {
      day = dayOfCandle;

      intervals.push({
        startOfPeriodUnix: newInterval[0].originalTimeUnix,
        endOfPeriodUnix: newInterval[newInterval.length - 1].originalTimeUnix,
      });

      newInterval = [futuresOriginalData[i]];
      continue;
    }

    newInterval.push(futuresOriginalData[i]);
  }

  intervals.forEach(interval => {
    const newCandleExtraSeries = futuresChartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    futuresChartCandles.drawSeries(newCandleExtraSeries, [{
      value: 0,
      time: interval.startOfPeriodUnix,
    }, {
      value: futuresDoc.price * 5,
      time: interval.startOfPeriodUnix,
    }]);
  });
};

const calculatePriceJumps = ({ instrumentId }) => {
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const priceJumps = [];
  const futuresChartCandles = instrumentDoc.chart_candles;
  const indicatorMovingAverageMedium = instrumentDoc.indicator_moving_average_medium;

  const futuresOriginalData = futuresChartCandles.originalData;
  const lOriginalData = futuresOriginalData.length;

  if (!lOriginalData) {
    return true;
  }

  for (let i = candlesForCalculateAveragePercent; i < lOriginalData; i += 1) {
    let averagePercent = 0;

    for (let j = i - candlesForCalculateAveragePercent; j < i; j += 1) {
      const candle = futuresOriginalData[j];
      const isLong = candle.close > candle.open;

      const differenceBetweenPrices = isLong ?
        candle.high - candle.open : candle.open - candle.low;
      const percentPerPrice = 100 / (candle.open / differenceBetweenPrices);

      averagePercent += percentPerPrice;
    }

    averagePercent = parseFloat((averagePercent / candlesForCalculateAveragePercent).toFixed(2));

    const currentCandle = futuresOriginalData[i];
    const currentCandleMA = indicatorMovingAverageMedium.calculatedData[i];

    const isLong = currentCandle.close > currentCandle.open;
    const differenceBetweenPrices = Math.abs(currentCandle.open - currentCandle.close);

    // const differenceBetweenPrices = Math.abs(
    //   isLong ? currentCandle.high - currentCandle.open : currentCandle.open - currentCandle.low,
    // );

    const percentPerPrice = 100 / (currentCandle.open / differenceBetweenPrices);

    if (percentPerPrice > (averagePercent * factorForPriceChange)) {
      let isGreenLight = true;

      if (considerBtcMircoTrend) {
        const targetBtcCandle = btcDoc.indicator_micro_supertrend_data
          .find(data => data.originalTimeUnix === currentCandle.originalTimeUnix);

        if ((targetBtcCandle.isLong && !isLong)
          || (!targetBtcCandle.isLong && isLong)) {
          isGreenLight = false;
        }
      }

      if (considerFuturesMircoTrend) {
        const targetFuturesCandle = instrumentDoc.indicator_micro_supertrend_data
          .find(data => data.originalTimeUnix === currentCandle.originalTimeUnix);

        if ((targetFuturesCandle.isLong && !isLong)
          || (!targetFuturesCandle.isLong && isLong)) {
          isGreenLight = false;
        }
      }

      if (!isGreenLight) {
        continue;
      }

      if (!isLong) {
        continue;
      }

      if (currentCandleMA.value > currentCandle.open) {
        continue;
      }

      priceJumps.push({
        ...currentCandle,
        averagePercent,
      });
    }
  }

  return priceJumps;
};

const drawMarkersForPriceJumps = ({ instrumentId }, priceJumps = []) => {
  if (!priceJumps || !priceJumps.length) {
    return true;
  }

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;

  futuresChartCandles.removeMarkers();

  priceJumps.forEach(priceJump => {
    futuresChartCandles.addMarker({
      shape: 'arrowDown',
      color: '#4CAF50',
      time: priceJump.originalTimeUnix,
      // text,
    });
  });

  futuresChartCandles.drawMarkers();

  const $slider = $chartsContainer.find('.chart-slider.futures');

  $slider
    .find('span.amount-slides')
    .text(priceJumps.length);

  scrollToPriceJump(1, { instrumentId }, priceJumps);
};

const calculateProfit = ({ instrumentId }, priceJumps = []) => {
  if (!priceJumps.length) {
    return [];
  }

  const calculatedProfit = [];
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;

  const futuresOriginalData = futuresChartCandles.originalData;
  const lOriginalData = futuresOriginalData.length;

  futuresChartCandles.extraSeries.forEach(extraSeries => {
    futuresChartCandles.removeSeries(extraSeries, false);
  });

  priceJumps.forEach((candle, index) => {
    const isLong = candle.close > candle.open;

    const targetPercent = (candle.averagePercent * factorForPriceChange) / 100;

    let startPrice = isLong ?
      candle.open + (candle.open * targetPercent) : candle.open - (candle.open * targetPercent);
    startPrice = parseFloat(startPrice.toFixed(futuresDoc.price_precision));

    const indexOfCandle = futuresOriginalData.findIndex(c => c.originalTimeUnix === candle.originalTimeUnix);

    let minLow = startPrice;
    let maxHigh = startPrice;

    let indexCandleWithMinLow = indexOfCandle + 1;
    let indexCandleWithMaxHigh = indexOfCandle;

    let indexCandleWhereWasTP = indexOfCandle;
    let indexCandleWhereWasStop = indexOfCandle + 1;

    const sumPerPrice = startPrice * (stopLossPercent / 100);
    const startPriceWithStopLoss = isLong ?
      (startPrice - sumPerPrice) : (startPrice + sumPerPrice);

    for (let i = indexOfCandle; i < lOriginalData; i += 1) {
      const { low, high } = futuresOriginalData[i];

      if (i !== indexOfCandle) {
        if ((isLong && low < startPriceWithStopLoss)
          || (!isLong && high > startPriceWithStopLoss)) {
          indexCandleWhereWasStop = i;
          // console.log('end', futuresChartCandles.originalData[i]);
          break;
        }
      }

      if (low < minLow) {
        minLow = low;
        indexCandleWithMinLow = i;
      }

      if (high > maxHigh) {
        maxHigh = high;
        indexCandleWithMaxHigh = i;
      }
    }

    let maxProfitPrice;

    if (!isLong) {
      maxProfitPrice = minLow;
      indexCandleWhereWasTP = indexCandleWithMinLow;
    } else {
      maxProfitPrice = maxHigh;
      indexCandleWhereWasTP = indexCandleWithMaxHigh;
    }

    calculatedProfit.push({
      index,
      isLong,
      startPrice,

      indexCandleWhereWasTP,
      indexCandleWhereWasStop,

      maxProfitPrice,
      stopLossPrice: startPriceWithStopLoss,

      originalTimeUnix: candle.originalTimeUnix,
    });
  });

  return calculatedProfit;
};

const makeReport = ({ instrumentId }, calculatedProfit = []) => {
  const $table = $report.find('table');
  const $total = $report.find('.total span');

  $table.empty();
  $total.text('0%');

  if (!calculatedProfit.length) {
    return true;
  }

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;
  const futuresOriginalData = futuresChartCandles.originalData;

  let mainPeriods = [];

  calculatedProfit.forEach(elem => {
    const divider = elem.originalTimeUnix % 86400;
    const startOfDayUnix = elem.originalTimeUnix - divider;

    elem.startOfDayUnix = startOfDayUnix;

    if (!mainPeriods.includes(startOfDayUnix)) {
      mainPeriods.push(startOfDayUnix);
    }

    // draw trading lines
    const newStopExtraSeries = futuresChartCandles.addExtraSeries({
      color: constants.RED_COLOR,
      lastValueVisible: false,
    });

    const newBuyExtraSeries = futuresChartCandles.addExtraSeries({
      color: constants.YELLOW_COLOR,
      lastValueVisible: false,
    });

    const newProfitExtraSeries = futuresChartCandles.addExtraSeries({
      color: constants.GREEN_COLOR,
      lastValueVisible: false,
    });

    let timeUnixProfitCandle = futuresOriginalData[elem.indexCandleWhereWasTP].originalTimeUnix;

    const timeUnixStopCandle = futuresOriginalData[elem.indexCandleWhereWasStop] ?
      futuresOriginalData[elem.indexCandleWhereWasStop].originalTimeUnix :
      futuresOriginalData[futuresOriginalData.length - 1].originalTimeUnix += 300;

    if (elem.originalTimeUnix === timeUnixProfitCandle) {
      if (elem.indexCandleWhereWasTP + 1) {
        timeUnixProfitCandle = futuresOriginalData[elem.indexCandleWhereWasTP + 1].originalTimeUnix;
      }
    }

    futuresChartCandles.drawSeries(newStopExtraSeries, [{
      value: elem.stopLossPrice,
      time: elem.originalTimeUnix,
    }, {
      value: elem.stopLossPrice,
      time: timeUnixStopCandle,
    }]);

    futuresChartCandles.drawSeries(newBuyExtraSeries, [{
      value: elem.startPrice,
      time: elem.originalTimeUnix,
    }, {
      value: elem.startPrice,
      time: timeUnixStopCandle,
    }]);

    futuresChartCandles.drawSeries(newProfitExtraSeries, [{
      value: elem.maxProfitPrice,
      time: elem.originalTimeUnix,
    }, {
      value: elem.maxProfitPrice,
      time: timeUnixProfitCandle,
    }]);
  });

  mainPeriods = mainPeriods.sort((a, b) => a < b ? -1 : 1);

  let profitStr = '';
  let periodsStr = '';

  let totalResultPercent = 0;

  mainPeriods.forEach(period => {
    const validDate = moment(period * 1000).format('DD.MM');
    periodsStr += `<th class="date">${validDate}</th>`;

    let appendStr = '';
    let resultPercent = 0;
    const targetElements = calculatedProfit.filter(elem => elem.startOfDayUnix === period);

    targetElements.forEach((elem, index) => {
      let maxProfitPercent;

      if (!elem.isLong) {
        const differenceBetweenPrices = elem.startPrice - elem.maxProfitPrice;

        maxProfitPercent = differenceBetweenPrices < 0 ?
          0 : 100 / (elem.startPrice / differenceBetweenPrices);
      } else {
        const differenceBetweenPrices = elem.maxProfitPrice - elem.startPrice;

        maxProfitPercent = differenceBetweenPrices < 0 ?
          0 : 100 / (elem.startPrice / differenceBetweenPrices);
      }

      const isGreen = maxProfitPercent >= (stopLossPercent * 2);
      const validTime = moment(elem.originalTimeUnix * 1000).format('HH:mm');

      if (maxProfitPercent < stopLossPercent) {
        maxProfitPercent = -stopLossPercent;
        resultPercent -= stopLossPercent;
      } else {
        resultPercent += maxProfitPercent;
      }

      appendStr += `<tr
        class="element"
        data-index="${elem.index}"
      >
        <td>${index + 1}</td>
        <td class="${isGreen ? 'green' : 'red'}">${maxProfitPercent.toFixed(2)}%</td>
        <td>${validTime}</td>
      </tr>`;
    });

    totalResultPercent += resultPercent;

    appendStr += `<tr>
      <td></td>
      <td>${resultPercent.toFixed(2)}%</td>
      <td></td>
    </tr>`;

    profitStr += `<td class="period">
      <table>
        <tr>
          <th>#</th>
          <th>MaxProfit</th>
          <th>Time</th>
        </tr>

        ${appendStr}
      </table>
    </td>`;
  });

  $table.append(`
    <tr>${periodsStr}</tr>
    <tr class="list">${profitStr}</tr>
  `);

  $total.text(`${totalResultPercent.toFixed(2)}%`);
};

const scrollToPriceJump = (action, { instrumentId }, priceJumps = []) => {
  if (!priceJumps.length) {
    return true;
  }

  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;

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

  const firstCandle = futuresChartCandles.originalData.find(candle =>
    candle.originalTimeUnix === priceJumps[currentSlide - 1].originalTimeUnix,
  );

  for (let i = futuresChartCandles.originalData.length - 1; i >= 0; i -= 1) {
    if (futuresChartCandles.originalData[i].originalTimeUnix === firstCandle.originalTimeUnix) {
      barsToTargetCandle = futuresChartCandles.originalData.length - i; break;
    }
  }

  futuresChartCandles.chart
    .timeScale()
    .scrollToPosition(-barsToTargetCandle, false);
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
