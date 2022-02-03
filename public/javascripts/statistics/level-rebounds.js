/* global
functions, makeRequest, getUnix,
objects, constants, moment, ChartCandles, IndicatorVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_CONSTANTS = '/api/strategies/levelRebounds/constants';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

/* Variables */

let minTouches = 1;
let skipCandlesAfterTouch = 5; // for 5m

let stopLossPercent = 0.2;
let percentForCountTouch = 0.2;
let percentForAllowedBreakdown = 0.2;

// let percentForCountTouch = 0.3;

const windowHeight = window.innerHeight;

let choosenInstrumentId;
let choosenPeriod = AVAILABLE_PERIODS.get('1h');

let levels = [];
let instrumentsDocs = [];

const startDate = moment().utc()
  .startOf('month');
  // .add(-1, 'years')
  // .startOf('month');

const endDate = moment().utc()
  .startOf('hour');

const dividerDate = moment().utc()
  .startOf('month')
  .add(-1, 'months');

const settings = {
  // for 1h
  // distanceFromLeftSide: 30,
  // distanceFromRightSide: 30,

  // for 5m
  distanceFromLeftSide: 100,
  distanceFromRightSide: 100,
};

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

  $settings.find('.stoploss-percent').val(stopLossPercent);

  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());

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

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      choosenInstrumentId = instrumentId;

      await loadCharts({ instrumentId });

      // splitDays({ instrumentId });

      levels = calculateFigureLevels({ instrumentId });
      drawMarkersForLevels({ instrumentId });

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
        scrollToLevel($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        });
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
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        // priceJumps = calculatePriceJumps({ instrumentId });
        // drawMarkersForPriceJumps({ instrumentId }, priceJumps);
        //
        // const calculatedProfit = calculateProfit({ instrumentId }, priceJumps);
        // makeReport({ instrumentId }, calculatedProfit);
      }
    });

  $report
    .on('click', 'tr.element', function () {
      const index = $(this).data('index');

      window.scrollTo(0, 0);

      scrollToLevel(parseInt(index, 10) + 1, {
        instrumentId: choosenInstrumentId,
      });
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
      period: choosenPeriod,
      instrumentId: futuresDoc._id,

      // startTime: dividerDate.toISOString(),
      // endTime: endDate.toISOString(),
    });

    /*
    futuresDoc.original_data_1h = await getCandlesData({
      instrumentId: futuresDoc._id,
      period: AVAILABLE_PERIODS.get('1h'),

      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    });
    */
  }

  const chartKeys = ['futures'];

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5m') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
            <div class="1h is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('1h') ? 'is_active' : ''}" data-period="1h"><span>1H</span></div>
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

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    // chartCandles.originalData1H = chartCandles.prepareNewData(chartKeyDoc.original_data_1h, false);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

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
        if (param.time && levels.length) {
          let nearestBoundIndex = -1;

          levels.forEach((level, index) => {
            if (level.startOfLevelUnix < param.time) {
              nearestBoundIndex = index;
            }
          });

          if (~nearestBoundIndex) {
            const $slider = $chartsContainer.find('.chart-slider.futures');

            $slider
              .find('span.current-slide')
              .text(nearestBoundIndex + 1);
          }

          const existedSeries = chartCandles.extraSeries.find(
            series => series.id === param.time,
          );

          if (existedSeries) {
            chartCandles.removeSeries(existedSeries, false);
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

const calculateFigureLevels = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;

  const candlesData = chartCandles.originalData;
  // const candlesData1H = chartCandles.originalData1H;

  const lCandles = candlesData.length;
  // const lCandles1H = candlesData1H.length;

  chartCandles.removeMarkers();

  if (!lCandles) {
    return true;
  }

  const newLevels = [];

  for (let i = 0; i < lCandles; i += 1) {
    const workingData = candlesData.slice(0, i + 1);

    const highLevels = getHighLevels({
      candles: workingData,
      distanceFromLeftSide: settings.distanceFromLeftSide,
      distanceFromRightSide: settings.distanceFromRightSide,
    });

    const lowLevels = getLowLevels({
      candles: workingData,
      distanceFromLeftSide: settings.distanceFromLeftSide,
      distanceFromRightSide: settings.distanceFromRightSide,
    });

    if ((!highLevels || !highLevels.length)
      && (!lowLevels || !lowLevels.length)) {
      continue;
      // return true;
    }

    highLevels.forEach(level => {
      const doesExistLevelWithThisPrice = newLevels.some(l => l.levelPrice === level.levelPrice);

      if (doesExistLevelWithThisPrice) {
        return true;
      }

      const indexOfLevelStart = candlesData.findIndex(
        candle => candle.originalTimeUnix === level.startOfLevelUnix,
      );

      let touches = [];
      let indexOfLevelEnd = lCandles - 1;
      let endOfLevelUnix = candlesData[lCandles - 1].originalTimeUnix;

      const allowedDistanceFromLevel = level.levelPrice - (level.levelPrice * (percentForCountTouch / 100));
      const allowedBreakdownFromLevel = level.levelPrice + (level.levelPrice * (percentForAllowedBreakdown / 100));

      for (let j = indexOfLevelStart; j < lCandles; j += 1) {
        if (candlesData[j].close > level.levelPrice
          || candlesData[j].high > allowedBreakdownFromLevel) {
          indexOfLevelEnd = j;
          endOfLevelUnix = candlesData[j].originalTimeUnix;
          break;
        }
      }

      for (let j = indexOfLevelStart + 2; j < indexOfLevelEnd; j += 1) {
        if (candlesData[j].high >= allowedDistanceFromLevel) {
          touches.push({
            index: j,
            originalTimeUnix: candlesData[j].originalTimeUnix,
          });
        }
      }

      touches.forEach(touch => {
        if ((touch.index - indexOfLevelStart) < skipCandlesAfterTouch) {
          touches = touches.filter(t => t.index !== touch.index);
        }
      });

      if (!touches.length) {
        return true;
      }

      const validTouches = [touches[0]];

      for (let j = 1; j < touches.length; j += 1) {
        const prevTouch = validTouches[validTouches.length - 1];

        if ((touches[j].index - prevTouch.index) > skipCandlesAfterTouch) {
          validTouches.push(touches[j]);
        }
      }

      // tmp
      if (level.startOfLevelUnix < dividerDate.unix()) {
        return true;
      }

      if (validTouches.length < minTouches) {
        return true;
      }

      validTouches.forEach(touch => {
        chartCandles.addMarker({
          shape: 'arrowDown',
          position: 'aboveBar',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });

      newLevels.push({
        ...level,
        isLong: true,
        endOfLevelUnix,
        numberTouches: validTouches.length,
      });
    });

    lowLevels.forEach(level => {
      const doesExistLevelWithThisPrice = newLevels.some(l => l.levelPrice === level.levelPrice);

      if (doesExistLevelWithThisPrice) {
        return true;
      }

      const indexOfLevelStart = candlesData.findIndex(
        candle => candle.originalTimeUnix === level.startOfLevelUnix,
      );

      let touches = [];
      let indexOfLevelEnd = lCandles - 1;
      let endOfLevelUnix = candlesData[lCandles - 1].originalTimeUnix;

      const allowedBreakdownFromLevel = level.levelPrice - (level.levelPrice * (percentForAllowedBreakdown / 100));
      const allowedDistanceFromLevel = level.levelPrice + (level.levelPrice * (percentForCountTouch / 100));

      for (let j = indexOfLevelStart; j < lCandles; j += 1) {
        if (candlesData[j].close < level.levelPrice
          || candlesData[j].low < allowedBreakdownFromLevel) {
          indexOfLevelEnd = j;
          endOfLevelUnix = candlesData[j].originalTimeUnix;
          break;
        }
      }

      for (let j = indexOfLevelStart + 2; j < indexOfLevelEnd; j += 1) {
        if (candlesData[j].low <= allowedDistanceFromLevel) {
          touches.push({
            index: j,
            originalTimeUnix: candlesData[j].originalTimeUnix,
          });
        }
      }

      touches.forEach(touch => {
        if ((touch.index - indexOfLevelStart) < skipCandlesAfterTouch) {
          touches = touches.filter(t => t.index !== touch.index);
        }
      });

      if (!touches.length) {
        return true;
      }

      const validTouches = [touches[0]];

      for (let j = 1; j < touches.length; j += 1) {
        const prevTouch = validTouches[validTouches.length - 1];

        if ((touches[j].index - prevTouch.index) > skipCandlesAfterTouch) {
          validTouches.push(touches[j]);
        }
      }

      // tmp
      if (level.startOfLevelUnix < dividerDate.unix()) {
        return true;
      }

      if (validTouches.length < minTouches) {
        return true;
      }

      validTouches.forEach(touch => {
        chartCandles.addMarker({
          shape: 'arrowUp',
          position: 'belowBar',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });

      newLevels.push({
        ...level,
        isLong: false,
        endOfLevelUnix,
        numberTouches: validTouches.length,
      });
    });
  }

  newLevels.forEach(level => {
    const newCandleExtraSeries = chartCandles.addExtraSeries({
      // priceScaleId: 'level',
      lastValueVisible: false,
    }, {
      id: level.startOfLevelUnix,
    });

    chartCandles.drawSeries(newCandleExtraSeries, [{
      value: level.levelPrice,
      time: level.startOfLevelUnix,
    }, {
      value: level.levelPrice,
      time: level.endOfLevelUnix,
    }]);
  });

  return newLevels;
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

const drawMarkersForLevels = ({ instrumentId }) => {
  if (!levels || !levels.length) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const chartCandles = instrumentDoc.chart_candles;


  /*
  levels.forEach(level => {
    chartCandles.addMarker({
      shape: 'arrowDown',
      color: '#4CAF50',
      time: level.startOfLevelUnix,
      // text,
    });
  });
  */

  chartCandles.drawMarkers();

  const $slider = $chartsContainer.find('.chart-slider.futures');

  $slider
    .find('span.amount-slides')
    .text(levels.length);

  const newCandleExtraSeries = chartCandles.addExtraSeries({
    lastValueVisible: false,
  });

  chartCandles.drawSeries(newCandleExtraSeries, [{
    value: 0,
    time: dividerDate.unix(),
  }, {
    value: instrumentDoc.price * 5,
    time: dividerDate.unix(),
  }]);

  scrollToLevel(1, { instrumentId });
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

const scrollToLevel = (action, { instrumentId }) => {
  if (!levels.length) {
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
    candle.originalTimeUnix === levels[currentSlide - 1].startOfLevelUnix,
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

const getCandlesData = async ({
  instrumentId,
  period,
  startTime,
  endTime,
}) => {
  console.log('start loading');

  const query = {
    instrumentId,
    isFirstCall: false,
  };

  if (startTime) {
    query.startTime = startTime;
  }

  if (endTime) {
    query.endTime = endTime;
  }

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
