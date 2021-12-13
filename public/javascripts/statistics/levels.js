/* global
functions, makeRequest, getUnix, sleep, saveAs,
objects, moment, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const modeGetCandlesFromCache = false;

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
  ['5M', '5m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

const DISTANCE_FROM_LEFT_SIDE = 50;
const DISTANCE_FROM_RIGHT_SIDE = 50;

let limiterLifetime = 0;
let limiterDistance = 1;
let limiterNumberTouches = 1;
let considerBtcMircoTrend = false;
let considerFuturesMircoTrend = true;
let stopLossPercent = 0.3;

const windowHeight = window.innerHeight;

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;

let instrumentsDocs = [];
let levels = [];
let priceJumps = [];

const startTime = moment().utc()
  .startOf('day')
  .add(-7, 'days');

const endTime = moment().utc()
  .startOf('day');

/* JQuery */
const $report = $('.report table');
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  $settings.find('.lifetime').val(limiterLifetime);
  $settings.find('.distance').val(limiterDistance);
  $settings.find('.stoploss-percent').val(stopLossPercent);
  $settings.find('.number-touches').val(limiterNumberTouches);
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

  btcDoc.original_data = await getCandlesData({
    period: DEFAULT_PERIOD,
    instrumentId: btcDoc._id,
    endTime: endTime.toISOString(),
    startTime: startTime.toISOString(),
  });
  // */

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

      levels = drawLevels({ instrumentId });
      drawLevelsForVolumeIndicator({ instrumentId });
      priceJumps = calculatePriceJumps({ instrumentId });
      drawMarkersForPriceJumps({ instrumentId }, priceJumps);
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
        case 'lifetime': limiterLifetime = newValue; break;
        case 'distance': limiterDistance = newValue; break;
        case 'stoploss-percent': stopLossPercent = newValue; break;
        case 'number-touches': limiterNumberTouches = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;
      }
    });

  $settings
    .find('input[type="checkbox"]')
    .on('change', function () {
      const id = $(this).attr('id');
      const newValue = $(this).is(':checked');

      switch (id) {
        case 'consider-btc-mirco-trend': considerBtcMircoTrend = newValue; break;
        case 'consider-futures-mirco-trend': considerFuturesMircoTrend = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;
      }
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
    if (!modeGetCandlesFromCache) {
      futuresDoc.original_data = await getCandlesData({
        period: DEFAULT_PERIOD,
        instrumentId: futuresDoc._id,
        endTime: endTime.toISOString(),
        startTime: startTime.toISOString(),
      });

      /*
      const file = new File(
        [JSON.stringify({ [`${futuresDoc.name}_${choosenPeriod}`]: futuresDoc.original_data })],
        'price-jumps-statistics-cache.json',
        { type: 'text/plain;charset=utf-8' },
      );

      saveAs(file);
      // */
    } else {
      const resultGetFile = await getFile({
        fileName: 'price-jumps-statistics-cache.json',
      });

      if (!resultGetFile) {
        alert('Cant get cache file');
        return true;
      }

      const key = `${futuresDoc.name}_${choosenPeriod}`;

      if (!resultGetFile[key]) {
        alert('No candles for instrument in cache');
        return true;
      }

      futuresDoc.original_data = resultGetFile[key];
    }
  }

  // const chartKeys = ['futures'];
  const chartKeys = ['futures', 'btc'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1m is_worked" data-period="1m"><span>1M</span></div>
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

    const indicatorMicroSuperTrend = new IndicatorSuperTrend(chartCandles.chart, {
      factor: 3,
      artPeriod: 10,
      candlesPeriod: DEFAULT_PERIOD,
    });

    /*
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

    const calculatedData = indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);

    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_micro_supertrend = indicatorMicroSuperTrend;
    // chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;

    chartKeyDoc.indicator_micro_supertrend_data = calculatedData;

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

const drawLevels = ({ instrumentId }) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresChartCandles = futuresDoc.chart_candles;
  const futuresOriginalData = futuresChartCandles.originalData;

  if (!futuresOriginalData || !futuresOriginalData.length) {
    return true;
  }

  const levels = [];
  const lCandles = futuresOriginalData.length;

  for (let i = 0; i < lCandles; i += 1) {
    const workingData = futuresOriginalData.slice(0, i + 1);

    const highLevels = getHighLevels({
      candles: workingData,
      distanceFromLeftSide: DISTANCE_FROM_LEFT_SIDE,
      distanceFromRightSide: DISTANCE_FROM_RIGHT_SIDE,
    });

    // const lowLevels = [];

    const lowLevels = getLowLevels({
      candles: workingData,
      distanceFromLeftSide: DISTANCE_FROM_LEFT_SIDE,
      distanceFromRightSide: DISTANCE_FROM_RIGHT_SIDE,
    });

    if ((!highLevels || !highLevels.length)
      && (!lowLevels || !lowLevels.length)) {
      continue;
    }

    lowLevels.forEach(level => {
      const doesExistLevelWithThisPrice = levels.some(l => l.levelPrice === level.levelPrice);

      if (!doesExistLevelWithThisPrice) {
        const candleIndex = futuresOriginalData.findIndex(
          candle => candle.originalTimeUnix === level.startOfLevelUnix,
        );

        let endOfLevelUnix = getUnix();

        for (let j = candleIndex; j < lCandles; j += 1) {
          if (futuresOriginalData[j].low < level.levelPrice) {
            endOfLevelUnix = futuresOriginalData[j].originalTimeUnix;
            break;
          }
        }

        levels.push({
          ...level,
          isLong: false,
          endOfLevelUnix,
        });
      }
    });

    highLevels.forEach(level => {
      const doesExistLevelWithThisPrice = levels.some(l => l.levelPrice === level.levelPrice);

      if (!doesExistLevelWithThisPrice) {
        const candleIndex = futuresOriginalData.findIndex(
          candle => candle.originalTimeUnix === level.startOfLevelUnix,
        );

        let endOfLevelUnix = getUnix();

        for (let j = candleIndex; j < lCandles; j += 1) {
          if (futuresOriginalData[j].high > level.levelPrice) {
            endOfLevelUnix = futuresOriginalData[j].originalTimeUnix;
            break;
          }
        }

        levels.push({
          ...level,
          isLong: true,
          endOfLevelUnix,
        });
      }
    });
  }

  levels.forEach(level => {
    const newCandleExtraSeries = futuresChartCandles.addExtraSeries({
      // priceScaleId: 'level',
      lastValueVisible: false,
    });

    futuresChartCandles.drawSeries(newCandleExtraSeries, [{
      value: level.levelPrice,
      time: level.startOfLevelUnix,
    }, {
      value: level.levelPrice,
      time: level.endOfLevelUnix,
    }]);
  });

  futuresChartCandles.chart
    .timeScale()
    .scrollToPosition(-futuresOriginalData.length, false);

  return levels;
};

const drawLevelsForVolumeIndicator = ({ instrumentId }) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresChartCandles = futuresDoc.chart_candles;
  const futuresIndicatorVolume = futuresDoc.indicator_volume;
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
      const { originalTimeUnix } = futuresOriginalData[increment];

      if (originalTimeUnix === startOfNextDayUnix) {
        startIndex = increment;
        break;
      }

      increment += 1;
    }

    futuresOriginalData = futuresOriginalData.slice(startIndex, futuresOriginalData.length);
  }

  let limiter;
  const limiterCandlesWithMaxVolumeForPeriod = 5;

  switch (choosenPeriod) {
    case AVAILABLE_PERIODS.get('1M'): {
      limiter = 60 * 24;
      break;
    }

    case AVAILABLE_PERIODS.get('5M'): {
      limiter = (24 * 60) / 5;
      break;
    }

    default: {
      alert('Need to set limiter for this timeframe');
      return true;
    }
  }

  const intervals = [];
  const lOriginalData = futuresOriginalData.length;

  let targetIndex = 0;
  const numberIterations = Math.ceil(lOriginalData / limiter);

  for (let i = 0; i < numberIterations; i += 1) {
    const newQueue = [];

    let conditionValue = limiter;

    if (i === (numberIterations - 1)) {
      conditionValue = lOriginalData - targetIndex;
    }

    for (let j = 0; j < conditionValue; j += 1) {
      const candle = futuresOriginalData[targetIndex];

      newQueue.push({
        volume: candle.volume,
        originalTime: candle.originalTime,
        originalTimeUnix: candle.originalTimeUnix,
      });

      targetIndex += 1;
    }

    const firstCandleInQueue = newQueue[0];
    const lastCandleInQueue = newQueue[newQueue.length - 1];

    intervals.push({
      index: i,
      candles: newQueue,
      startOfPeriodUnix: firstCandleInQueue.originalTimeUnix,
      endOfPeriodUnix: lastCandleInQueue.originalTimeUnix,
    });
  }

  intervals.forEach(interval => {
    const { candles } = interval;
    const lCandlesInInterval = candles.length;

    const intervalSortedByVolume = JSON.parse(JSON.stringify(candles))
      .sort((a, b) => a.volume > b.volume ? -1 : 1)
      .slice(0, limiterCandlesWithMaxVolumeForPeriod);

    const sumMaxVolume = intervalSortedByVolume
      .reduce((currentValue, e) => e.volume + currentValue, 0);

    const averageVolume = parseInt(sumMaxVolume / limiterCandlesWithMaxVolumeForPeriod, 10);
    interval.averageVolume = averageVolume;

    const newCandleExtraSeries = futuresChartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    futuresChartCandles.drawSeries(newCandleExtraSeries, [{
      value: 0,
      time: candles[0].originalTimeUnix,
    }, {
      value: futuresDoc.price * 5,
      time: candles[0].originalTimeUnix,
    }]);

    const newVolumeExtraSeries = futuresIndicatorVolume.addExtraSeries({
      lastValueVisible: false,
      color: 'black',
    });

    futuresIndicatorVolume.drawSeries(newVolumeExtraSeries, [{
      value: averageVolume,
      time: candles[0].originalTimeUnix,
    }, {
      value: averageVolume,
      time: candles[lCandlesInInterval - 1].originalTimeUnix,
    }]);
  });
};

const calculatePriceJumps = ({ instrumentId }) => {
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const priceChanges = [];
  const futuresChartCandles = futuresDoc.chart_candles;

  const futuresOriginalData = futuresChartCandles.originalData;
  const lOriginalData = futuresOriginalData.length;

  if (!lOriginalData) {
    return true;
  }

  const limiterDistanceForLevel = 1; // %
  const candlesForCalculateAveragePercent = 20;

  for (let i = candlesForCalculateAveragePercent; i < lOriginalData; i += 1) {
    let averagePercent = 0;

    for (let j = i - candlesForCalculateAveragePercent; j < i; j += 1) {
      const candle = futuresOriginalData[j];
      const differenceBetweenHighAndLow = candle.high - candle.low;
      const percentPerPrice = 100 / (candle.low / differenceBetweenHighAndLow);

      averagePercent += percentPerPrice;
    }

    averagePercent = parseFloat((averagePercent / candlesForCalculateAveragePercent).toFixed(2));

    const prevCandle = futuresOriginalData[i - 1];
    const currentCandle = futuresOriginalData[i];

    const prevCandleClose = prevCandle.close;
    const currentCandleClose = currentCandle.close;

    const differenceBetweenPrices = Math.abs(prevCandleClose - currentCandleClose);
    const percentPerPrice = 100 / (prevCandleClose / differenceBetweenPrices);

    if (percentPerPrice > (averagePercent * 2)) {
      const isLong = currentCandle.close > currentCandle.open;

      /*
      const nearestLevels = levels.filter(
        level =>
          isLong === level.isLong
          && currentCandle.originalTimeUnix > level.startOfLevelUnix
          && currentCandle.originalTimeUnix < level.endOfLevelUnix,
      );

      if (!nearestLevels.length) {
        continue;
      }

      const doesExistLevelWithTargetDistance = nearestLevels.find(level => {
        const differenceBetweenPrices = Math.abs(level.levelPrice - currentCandleClose);
        const percentPerPrice = 100 / (currentCandleClose / differenceBetweenPrices);
        return percentPerPrice <= limiterDistanceForLevel;
      });

      if (doesExistLevelWithTargetDistance) {
        priceChanges.push(currentCandle);
      }
      */

      const targetBtcCandle = btcDoc.indicator_micro_supertrend_data
        .find(data => data.originalTimeUnix === currentCandle.originalTimeUnix);

      const targetFuturesCandle = futuresDoc.indicator_micro_supertrend_data
        .find(data => data.originalTimeUnix === currentCandle.originalTimeUnix);

      let isGreenLight = true;

      if (considerBtcMircoTrend) {
        if ((targetBtcCandle.isLong && !isLong)
          || (!targetBtcCandle.isLong && isLong)) {
          isGreenLight = false;
        }
      }

      if (considerFuturesMircoTrend) {
        if ((targetFuturesCandle.isLong && !isLong)
          || (!targetFuturesCandle.isLong && isLong)) {
          isGreenLight = false;
        }
      }

      if (!isGreenLight) {
        continue;
      }

      priceChanges.push(currentCandle);
    }
  }

  return priceChanges;
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

  scrollToPriceJump('next', { instrumentId }, priceJumps);
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

const getHighLevels = ({
  candles,
  distanceFromLeftSide,
  distanceFromRightSide,
}) => {
  if (!candles || !candles.length) {
    return [];
  }

  const levels = [];
  const lCandles = candles.length;

  candles.forEach((candle, index) => {
    if ((lCandles - index) < distanceFromRightSide) {
      return true;
    }

    let isHighest = true;
    let isHighCrossed = false;

    for (let i = index; i < lCandles; i += 1) {
      const tmpCandle = candles[i];

      if (tmpCandle.high > candle.high) {
        isHighCrossed = true;
        break;
      }
    }

    if (!isHighCrossed) {
      for (let i = 1; i < distanceFromLeftSide + 1; i += 1) {
        const tmpCandle = candles[index - i];

        if (!tmpCandle) {
          break;
        }

        if (tmpCandle.high > candle.high) {
          isHighest = false;
          break;
        }
      }
    }

    if (!isHighCrossed && isHighest) {
      levels.push({
        levelPrice: candle.high,
        startOfLevelUnix: candle.originalTimeUnix,
      });
    }
  });

  return levels;
};

const getLowLevels = ({
  candles,
  distanceFromLeftSide,
  distanceFromRightSide,
}) => {
  if (!candles || !candles.length) {
    return [];
  }

  const levels = [];
  const lCandles = candles.length;

  candles.forEach((candle, index) => {
    if ((lCandles - index) < distanceFromRightSide) {
      return true;
    }

    let isLowest = true;
    let isLowCrossed = false;

    for (let i = index; i < lCandles; i += 1) {
      const tmpCandle = candles[i];

      if (tmpCandle.low < candle.low) {
        isLowCrossed = true;
        break;
      }
    }

    if (!isLowCrossed) {
      for (let i = 1; i < distanceFromLeftSide + 1; i += 1) {
        const tmpCandle = candles[index - i];

        if (!tmpCandle) {
          break;
        }

        if (tmpCandle.low < candle.low) {
          isLowest = false;
          break;
        }
      }
    }

    if (!isLowCrossed && isLowest) {
      levels.push({
        levelPrice: candle.low,
        startOfLevelUnix: candle.originalTimeUnix,
      });
    }
  });

  return levels;
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
    isFirstCall: modeGetCandlesFromCache,
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

const getFile = async ({
  fileName,
}) => {
  console.log('start loading');

  const resultGetFile = await makeRequest({
    method: 'GET',
    url: `/files/${fileName}`,
  });

  if (!resultGetFile) {
    alert('Cant makeRequest getFile');
    return false;
  }

  console.log('end loading');

  return resultGetFile;
};

// deprecated but still can be useful
// calculate volumes
const calculatePriceJumpsOld = ({ instrumentId }) => {
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const priceJumps = [];
  const futuresChartCandles = futuresDoc.chart_candles;
  const futuresIndicatorVolume = futuresDoc.indicator_volume;
  let futuresOriginalData = futuresChartCandles.originalData;

  if (!futuresOriginalData || !futuresOriginalData.length) {
    return true;
  }

  const getIntervalIndex = timeUnix =>
    intervals.findIndex(
      interval => interval.startOfPeriodUnix <= timeUnix && interval.endOfPeriodUnix >= timeUnix,
    );

  const firstCandle = futuresOriginalData[0];

  // skip not full hour
  const divider = firstCandle.originalTimeUnix % 86400;

  if (divider !== 0) {
    const startOfNextDayUnix = (firstCandle.originalTimeUnix - divider) + 86400;

    let increment = 1;
    let startIndex = false;

    while (1) {
      const { originalTimeUnix } = futuresOriginalData[increment];

      if (originalTimeUnix === startOfNextDayUnix) {
        startIndex = increment;
        break;
      }

      increment += 1;
    }

    futuresOriginalData = futuresOriginalData.slice(startIndex, futuresOriginalData.length);
  }

  let limiter;
  const limiterCandlesWithMaxVolumeForPeriod = 5;

  switch (choosenPeriod) {
    case AVAILABLE_PERIODS.get('1M'): {
      limiter = 60 * 24;
      break;
    }

    case AVAILABLE_PERIODS.get('5M'): {
      limiter = (24 * 60) / 5;
      break;
    }

    default: {
      alert('Need to set limiter for this timeframe');
      return true;
    }
  }

  const intervals = [];
  const lOriginalData = futuresOriginalData.length;

  let targetIndex = 0;
  const numberIterations = Math.ceil(lOriginalData / limiter);

  for (let i = 0; i < numberIterations; i += 1) {
    const newQueue = [];

    let conditionValue = limiter;

    if (i === (numberIterations - 1)) {
      conditionValue = lOriginalData - targetIndex;
    }

    for (let j = 0; j < conditionValue; j += 1) {
      const candle = futuresOriginalData[targetIndex];

      newQueue.push({
        volume: candle.volume,
        originalTime: candle.originalTime,
        originalTimeUnix: candle.originalTimeUnix,
      });

      targetIndex += 1;
    }

    const firstCandleInQueue = newQueue[0];
    const lastCandleInQueue = newQueue[newQueue.length - 1];

    intervals.push({
      index: i,
      candles: newQueue,
      startOfPeriodUnix: firstCandleInQueue.originalTimeUnix,
      endOfPeriodUnix: lastCandleInQueue.originalTimeUnix,
    });
  }

  intervals.forEach(interval => {
    const { candles } = interval;
    const lCandlesInInterval = candles.length;

    const intervalSortedByVolume = JSON.parse(JSON.stringify(candles))
      .sort((a, b) => a.volume > b.volume ? -1 : 1)
      .slice(0, limiterCandlesWithMaxVolumeForPeriod);

    const sumMaxVolume = intervalSortedByVolume
      .reduce((currentValue, e) => e.volume + currentValue, 0);

    const averageVolume = parseInt(sumMaxVolume / limiterCandlesWithMaxVolumeForPeriod, 10);
    interval.averageVolume = averageVolume;

    const newCandleExtraSeries = futuresChartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    futuresChartCandles.drawSeries(newCandleExtraSeries, [{
      value: 0,
      time: candles[0].originalTimeUnix,
    }, {
      value: futuresDoc.price * 5,
      time: candles[0].originalTimeUnix,
    }]);

    const newVolumeExtraSeries = futuresIndicatorVolume.addExtraSeries({
      lastValueVisible: false,
      color: 'black',
    });

    futuresIndicatorVolume.drawSeries(newVolumeExtraSeries, [{
      value: averageVolume,
      time: candles[0].originalTimeUnix,
    }, {
      value: averageVolume,
      time: candles[lCandlesInInterval - 1].originalTimeUnix,
    }]);
  });

  /*
  futuresOriginalData.forEach(candle => {
    const intervalIndex = getIntervalIndex(candle.originalTimeUnix);

    if (intervalIndex === 0) {
      return true;
    }

    const previousIntervalAverageVolume = intervals[intervalIndex - 1].averageVolume;

    if (candle.volume > previousIntervalAverageVolume) {
      priceJumps.push(candle);
    }
  });
  */

  return priceJumps;
};
