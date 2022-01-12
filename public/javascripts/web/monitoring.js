/* global
functions, makeRequest, getUnix, formatNumberToPretty,
objects, moment, constants, wsClient, ChartCandles, IndicatorVolume, IndicatorMovingAverage, IndicatorCumulativeDeltaVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1h');

/* Variables */

let instrumentsDocs = [];

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;
const windowHeight = window.innerHeight;

const settings = {
  padding: 20,
  numberTouches: 0,
  allowedPercent: 0.2,

  numberCompressions: 2,

  periodForShortMA: 20,
  periodForMediumMA: 50,

  colorForShortMA: '#0800FF',
  colorForMediumMA: '#2196F3',

  limitTimeFor1h: 14 * 24 * 60 * 60,
  limitTimeFor5m: 2 * 24 * 60 * 60,
};

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

wsClient.onmessage = async data => {
  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'futuresCandle5mData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('5m')); break;
      case 'futuresCandle1hData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('1h')); break;
      default: break;
    }
  }
};

/* JQuery */
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

const $settings = $('.settings');

$(document).ready(async () => {
  // start settings

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  $settings.find('.padding').val(settings.padding);
  $settings.find('.allowed-percent').val(settings.allowedPercent);
  $settings.find('.number-touches').val(settings.numberTouches);
  $settings.find('.number-compressions').val(settings.numberCompressions);

  if (params.interval && AVAILABLE_PERIODS.get(params.interval)) {
    choosenPeriod = params.interval;
  }

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

      await loadCharts({ instrumentId });

      calculateSwings({ instrumentId });
      calculateFigureLines({ instrumentId });
      calculateFigureLevels({ instrumentId });

      /*
      if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
        splitDays({ instrumentId });
      }
      */

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
        case 'padding': settings.padding = newValue; break;
        case 'number-touches': settings.numberTouches = newValue; break;
        case 'allowed-percent': settings.allowedPercent = newValue; break;
        case 'number-compressions': settings.numberCompressions = newValue; break;

        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;
        const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

        const chartCandles = instrumentDoc.chart_candles;

        chartCandles.extraSeries.forEach(extraSeries => {
          chartCandles.removeSeries(extraSeries, false);
        });

        chartCandles.removeMarkers();

        calculateSwings({ instrumentId });
        calculateFigureLines({ instrumentId });
        calculateFigureLevels({ instrumentId });

        /*
        if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
          splitDays({ instrumentId });
        }
        */
      }
    });

  $chartsContainer
    .on('click', '.chart-periods div', async function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const period = $(this).data('period');

      if (period !== choosenPeriod) {
        const $periods = $(this).parent().find('div');
        $periods.removeClass('is_active');
        $(this).addClass('is_active');

        choosenPeriod = period;

        const instrumentId = choosenInstrumentId;

        await loadCharts({ instrumentId });

        calculateSwings({ instrumentId });
        calculateFigureLines({ instrumentId });
        calculateFigureLevels({ instrumentId });

        /*
        if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
          splitDays({ instrumentId });
        }
        */
      }
    });

  // wsClient.onopen = async () => {
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
  // };

  $(document)
    .on('keyup', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      // arrow right
      if (e.keyCode === 37) {
        const indexOfInstrumentDoc = instrumentsDocs.findIndex(
          doc => doc._id === choosenInstrumentId,
        );

        const prevIndex = indexOfInstrumentDoc - 1;

        if (!instrumentsDocs[prevIndex]) {
          return true;
        }

        $instrumentsList
          .find('.instrument').eq(prevIndex)
          .click();
      } else if (e.keyCode === 39) {
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
    });
});

/* Functions */

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const startDate = choosenPeriod === AVAILABLE_PERIODS.get('5m') ?
    // moment().utc().startOf('day') : moment().utc().startOf('month').add(-1, 'months');
    moment().utc().startOf('month') : moment().utc().startOf('month').add(-1, 'months');

  wsClient.send(JSON.stringify({
    actionName: 'unsubscribeFromAll',
  }));

  instrumentDoc.candles_data = await getCandlesData({
    period: choosenPeriod,
    instrumentId: instrumentDoc._id,

    startDate: startDate.toISOString(),
    // endDate: endDate.toISOString(),
  });

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
      </div>
      <span class="ruler">0%</span>
      <span class="last-swing-data">12M</span>
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

    const indicatorMovingAverageShort = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForShortMA,
      period: settings.periodForShortMA,
    });

    const indicatorMovingAverageMedium = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForMediumMA,
      period: settings.periodForMediumMA,
    });

    const indicatorCumulativeDeltaVolume = new IndicatorCumulativeDeltaVolume($rootContainer);

    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_moving_average_short = indicatorMovingAverageShort;
    chartKeyDoc.indicator_moving_average_medium = indicatorMovingAverageMedium;
    chartKeyDoc.indicator_cumulative_delta_volume = indicatorCumulativeDeltaVolume;

    chartCandles.setOriginalData(chartKeyDoc.candles_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    let calculatedData;

    calculatedData = indicatorMovingAverageShort.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageShort.calculatedData = calculatedData;

    calculatedData = indicatorMovingAverageMedium.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageMedium.calculatedData = calculatedData;

    calculatedData = indicatorCumulativeDeltaVolume.calculateAndDraw(chartCandles.originalData);
    indicatorCumulativeDeltaVolume.calculatedData = calculatedData;

    wsClient.send(JSON.stringify({
      actionName: 'subscribe',
      data: {
        subscriptionName: `futuresCandle${choosenPeriod}Data`,
        instrumentId: instrumentDoc._id,
      },
    }));

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    if (chartKey === 'futures') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && chartCandles.extraSeries.length) {
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
        // console.log('y', param.point.y);
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

    listCharts.push(chartCandles, indicatorVolume, indicatorCumulativeDeltaVolume);
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

const updateLastCandle = (data, period) => {
  if (period !== choosenPeriod
    || data.instrumentId !== choosenInstrumentId) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === data.instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const indicatorVolume = instrumentDoc.indicator_volume;
  const indicatorMovingAverageShort = instrumentDoc.indicator_moving_average_short;
  const indicatorMovingAverageMedium = instrumentDoc.indicator_moving_average_medium;
  const indicatorCumulativeDeltaVolume = instrumentDoc.indicator_cumulative_delta_volume;

  const candlesData = chartCandles.originalData;
  let lCandles = candlesData.length;

  const {
    startTime,
    open,
    close,
    high,
    low,
    volume,
    isClosed,
  } = data;

  const preparedData = chartCandles.prepareNewData([{
    time: startTime,
    data: [open, close, low, high],
    volume,
  }], false)[0];

  if (!isClosed) {
    candlesData[lCandles - 1] = preparedData;
  } else {
    candlesData.push(preparedData);
    lCandles += 1;
  }

  chartCandles.drawSeries(chartCandles.mainSeries, preparedData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, {
    value: preparedData.volume,
    time: preparedData.originalTimeUnix,
  });

  let resultCalculateMA;

  const targetCandlesPeriod = candlesData.slice(lCandles - (settings.periodForMediumMA * 2), lCandles);

  resultCalculateMA = indicatorMovingAverageShort.calculateData(targetCandlesPeriod)[lCandles - 1];
  indicatorMovingAverageShort.drawSeries(indicatorMovingAverageShort.mainSeries, resultCalculateMA);

  resultCalculateMA = indicatorMovingAverageMedium.calculateData(targetCandlesPeriod)[lCandles - 1];
  indicatorMovingAverageMedium.drawSeries(indicatorMovingAverageMedium.mainSeries, resultCalculateMA);

  const lDeltaVolumeData = indicatorCumulativeDeltaVolume.calculatedData.length;

  const resultCalculateDelta = indicatorCumulativeDeltaVolume.calculateData([
    indicatorCumulativeDeltaVolume.calculatedData[lDeltaVolumeData - 2],
    preparedData,
  ], indicatorCumulativeDeltaVolume.calculatedData[lDeltaVolumeData - 2].sumDelta)[1];

  if (!isClosed) {
    const lastValue = indicatorCumulativeDeltaVolume.calculatedData[lDeltaVolumeData - 1];

    if (lastValue.originalTimeUnix !== resultCalculateDelta.originalTimeUnix) {
      indicatorCumulativeDeltaVolume.calculatedData.push(resultCalculateDelta);
    } else {
      indicatorCumulativeDeltaVolume.calculatedData[lDeltaVolumeData - 1] = resultCalculateDelta;
    }
  } else {
    indicatorCumulativeDeltaVolume.calculatedData.push(resultCalculateDelta);

    calculateSwings({ instrumentId: choosenInstrumentId });
  }

  indicatorCumulativeDeltaVolume.drawSeries(
    indicatorCumulativeDeltaVolume.mainSeries,
    resultCalculateDelta,
  );

  calculateVolumeForLastSwing({ instrumentId: choosenInstrumentId });

  $chartsContainer.find('.last-swing-data').css({
    top: chartCandles.mainSeries.priceToCoordinate(close) - 15,
  });
};

const calculateFigureLevels = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) {
    return true;
  }

  const levels = [];

  const highLevels = getHighLevels({
    candles: candlesData,
    distanceFromLeftSide: 50,
    distanceFromRightSide: 50,
  });

  // const lowLevels = [];

  const lowLevels = getLowLevels({
    candles: candlesData,
    distanceFromLeftSide: 50,
    distanceFromRightSide: 50,
  });

  if ((!highLevels || !highLevels.length)
    && (!lowLevels || !lowLevels.length)) {
    return true;
  }

  lowLevels.forEach(level => {
    const doesExistLevelWithThisPrice = levels.some(l => l.levelPrice === level.levelPrice);

    if (!doesExistLevelWithThisPrice) {
      const candleIndex = candlesData.findIndex(
        candle => candle.originalTimeUnix === level.startOfLevelUnix,
      );

      let endOfLevelUnix = getUnix();

      for (let j = candleIndex; j < lCandles; j += 1) {
        if (candlesData[j].low < level.levelPrice) {
          endOfLevelUnix = candlesData[j].originalTimeUnix;
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
      const candleIndex = candlesData.findIndex(
        candle => candle.originalTimeUnix === level.startOfLevelUnix,
      );

      let endOfLevelUnix = getUnix();

      for (let j = candleIndex; j < lCandles; j += 1) {
        if (candlesData[j].high > level.levelPrice) {
          endOfLevelUnix = candlesData[j].originalTimeUnix;
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

  levels.forEach(level => {
    const newCandleExtraSeries = chartCandles.addExtraSeries({
      // priceScaleId: 'level',
      lastValueVisible: false,
    });

    chartCandles.drawSeries(newCandleExtraSeries, [{
      value: level.levelPrice,
      time: level.startOfLevelUnix,
    }, {
      value: level.levelPrice,
      time: level.endOfLevelUnix,
    }]);
  });
};

const calculateFigureLines = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) {
    return true;
  }

  const figureLines = [];
  const lowestCandles = [];
  const highestCandles = [];

  for (let i = 0; i < lCandles - settings.padding; i += 1) {
    const candle = candlesData[i];
    const startIndex = i - settings.padding;

    const targetCandlesArr = candlesData.slice(
      startIndex < 0 ? 0 : startIndex,
      i + settings.padding,
    );

    let isCandleLowLowest = true;
    let isCandleHighHighest = true;

    targetCandlesArr.forEach(tCandle => {
      if (!isCandleHighHighest) {
        return true;
      }

      if (tCandle.high > candle.high) {
        isCandleHighHighest = false;
      }
    });

    targetCandlesArr.forEach(tCandle => {
      if (!isCandleLowLowest) {
        return true;
      }

      if (tCandle.low < candle.low) {
        isCandleLowLowest = false;
      }
    });

    if (isCandleHighHighest) {
      highestCandles.push(candle);
    }

    if (isCandleLowLowest) {
      lowestCandles.push(candle);
    }
  }

  for (let i = 0; i < highestCandles.length; i += 1) {
    const candle = highestCandles[i];

    if (!highestCandles[i + 1]) {
      break;
    }

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === candle.originalTimeUnix,
    );

    const newFigureLines = [];

    for (let j = i + 1; j < highestCandles.length; j += 1) {
      const nextCandle = highestCandles[j];

      const indexOfSecondCandle = candlesData.findIndex(
        tCandle => tCandle.originalTimeUnix === nextCandle.originalTimeUnix,
      );

      const numberCandles = indexOfSecondCandle - indexOfFirstCandle;

      if (candle.high < nextCandle.high || numberCandles < 2) {
        continue;
      }

      /*
      const highestCandlesBetweenPeriods = highestCandles.slice(i + 1, j);

      const isPriceCrossedCandleHigh = highestCandlesBetweenPeriods.some(
        tCandle => tCandle.high > nextCandle.high,
      );

      if (isPriceCrossedCandleHigh) {
        continue;
      }
      */


      let indexOfEndCandle;

      const differenceBetweenHighs = candle.high - nextCandle.high;
      const numberReduceForPrice = differenceBetweenHighs / numberCandles;

      let originalTimeUnixForEndCandle;

      let isExit = false;
      let isActive = false;
      let currentPrice = candle.high;

      for (let j = indexOfFirstCandle + 1; j < lCandles; j += 1) {
        currentPrice -= numberReduceForPrice;

        const price = candlesData[j].isLong ? candlesData[j].close : candlesData[j].open;
        const limitPrice = currentPrice + (currentPrice * (settings.allowedPercent / 100));
        const limitPriceForHigh = currentPrice + (currentPrice * ((settings.allowedPercent * 2) / 100));

        if (price > limitPrice || candlesData[j].high > limitPriceForHigh) {
          if (j < indexOfSecondCandle) {
            isExit = true;
          } else {
            indexOfEndCandle = j;
            originalTimeUnixForEndCandle = candlesData[j].originalTimeUnix;
          }

          break;
        }
      }

      if (isExit) {
        continue;
      }

      if (!originalTimeUnixForEndCandle) {
        isActive = true;
        indexOfEndCandle = lCandles - 1;
        originalTimeUnixForEndCandle = candlesData[indexOfEndCandle].originalTimeUnix;
      }

      const touches = [];
      let numberTouches = 0;
      currentPrice = candle.high;

      for (let j = indexOfFirstCandle; j < indexOfEndCandle; j += 1) {
        currentPrice -= numberReduceForPrice;

        if (j === indexOfFirstCandle
          || j === indexOfSecondCandle
          || j === indexOfEndCandle) {
          continue;
        }

        const nextCandle = candlesData[j];

        if (nextCandle.high >= currentPrice) {
          numberTouches += 1;
          touches.push(nextCandle);
          j += 2;
        }
      }

      if (numberTouches < settings.numberTouches) {
        continue;
      }

      touches.forEach(touch => {
        const doesExistMarkerWithThisTime = chartCandles.markers.some(
          marker => marker.time === touch.originalTimeUnix,
        );

        if (doesExistMarkerWithThisTime) {
          return true;
        }

        chartCandles.addMarker({
          shape: 'arrowDown',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });

      newFigureLines.push([candle, nextCandle, {
        high: currentPrice,
        originalTimeUnix: originalTimeUnixForEndCandle,
      }, {
        isActive,
        isLong: false,
      }]);
    }

    if (newFigureLines.length) {
      const lastFigureLine = newFigureLines[newFigureLines.length - 1];

      const differenceBetweenDates = getUnix() - lastFigureLine[0].originalTimeUnix;
      const limiter = choosenPeriod === AVAILABLE_PERIODS.get('5m') ?
        settings.limitTimeFor5m : settings.limitTimeFor1h;

      if (differenceBetweenDates < limiter) {
        figureLines.push(lastFigureLine);
      }
    }
  }

  for (let i = 0; i < lowestCandles.length; i += 1) {
    const candle = lowestCandles[i];

    if (!lowestCandles[i + 1]) {
      break;
    }

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === candle.originalTimeUnix,
    );

    const newFigureLines = [];

    for (let j = i + 1; j < lowestCandles.length; j += 1) {
      const nextCandle = lowestCandles[j];

      const indexOfSecondCandle = candlesData.findIndex(
        tCandle => tCandle.originalTimeUnix === nextCandle.originalTimeUnix,
      );

      const numberCandles = indexOfSecondCandle - indexOfFirstCandle;

      if (candle.low > nextCandle.low || numberCandles < 2) {
        continue;
      }

      /*
      const lowestCandlesBetweenPeriods = lowestCandles.slice(i + 1, j);

      const isPriceCrossedCandleLow = lowestCandlesBetweenPeriods.some(
        tCandle => tCandle.low < nextCandle.low,
      );

      if (isPriceCrossedCandleLow) {
        continue;
      }
      */

      let indexOfEndCandle;

      const differenceBetweenLows = nextCandle.low - candle.low;
      const numberReduceForPrice = differenceBetweenLows / numberCandles;

      let originalTimeUnixForEndCandle;

      let isExit = false;
      let isActive = false;
      let currentPrice = candle.low;

      for (let j = indexOfFirstCandle + 1; j < lCandles; j += 1) {
        currentPrice += numberReduceForPrice;

        const price = candlesData[j].isLong ? candlesData[j].open : candlesData[j].close;
        const limitPrice = currentPrice - (currentPrice * (settings.allowedPercent / 100));
        const limitPriceForHigh = currentPrice - (currentPrice * ((settings.allowedPercent * 2) / 100));

        if (price < limitPrice || candlesData[j].low < limitPriceForHigh) {
          if (j < indexOfSecondCandle) {
            isExit = true;
          } else {
            indexOfEndCandle = j;
            originalTimeUnixForEndCandle = candlesData[j].originalTimeUnix;
          }

          break;
        }
      }

      if (isExit) {
        continue;
      }

      if (!originalTimeUnixForEndCandle) {
        isActive = true;
        indexOfEndCandle = lCandles - 1;
        originalTimeUnixForEndCandle = candlesData[indexOfEndCandle].originalTimeUnix;
      }

      const touches = [];
      let numberTouches = 0;
      currentPrice = candle.low;

      for (let j = indexOfFirstCandle; j < indexOfEndCandle; j += 1) {
        currentPrice += numberReduceForPrice;

        if (j === indexOfFirstCandle
          || j === indexOfSecondCandle
          || j === indexOfEndCandle) {
          continue;
        }

        const nextCandle = candlesData[j];

        if (nextCandle.low <= currentPrice) {
          numberTouches += 1;
          touches.push(nextCandle);
          j += 2;
        }
      }

      if (numberTouches < settings.numberTouches) {
        continue;
      }

      touches.forEach(touch => {
        const doesExistMarkerWithThisTime = chartCandles.markers.some(
          marker => marker.time === touch.originalTimeUnix,
        );

        if (doesExistMarkerWithThisTime) {
          return true;
        }

        chartCandles.addMarker({
          shape: 'arrowUp',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });

      newFigureLines.push([candle, nextCandle, {
        low: currentPrice,
        originalTimeUnix: originalTimeUnixForEndCandle,
      }, {
        isActive,
        isLong: true,
      }]);
    }

    if (newFigureLines.length) {
      const lastFigureLine = newFigureLines[newFigureLines.length - 1];

      const differenceBetweenDates = getUnix() - lastFigureLine[0].originalTimeUnix;

      const limiter = choosenPeriod === AVAILABLE_PERIODS.get('5m') ?
        settings.limitTimeFor5m : settings.limitTimeFor1h;

      if (differenceBetweenDates < limiter) {
        figureLines.push(lastFigureLine);
      }
    }
  }

  /*
  highestCandles.forEach(candle => {
    chartCandles.addMarker({
      shape: 'arrowDown',
      color: constants.GREEN_COLOR,
      time: candle.originalTimeUnix,
    });
  });

  lowestCandles.forEach(candle => {
    chartCandles.addMarker({
      shape: 'arrowUp',
      color: constants.GREEN_COLOR,
      time: candle.originalTimeUnix,
    });
  });

  chartCandles.drawMarkers();
  // */

  figureLines.forEach(([start, middle, end, {
    isLong,
    isActive,
  }]) => {
    if (!isActive) {
      return true;
    }

    const key = isLong ? 'low' : 'high';
    const lineStyle = isActive ? 0 : 2;
    // const color = isLong ? constants.GREEN_COLOR : constants.RED_COLOR;

    const newExtraSeries = chartCandles.addExtraSeries({
      // color,
      lineStyle,
      lastValueVisible: false,
    }, {
      id: start.originalTimeUnix,
    });

    chartCandles.drawSeries(
      newExtraSeries,
      [start, end].map(candle => ({
        value: candle[key],
        time: candle.originalTimeUnix,
      })),
    );
  });
};

const calculateVolumeForLastSwing = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;

  const lCandles = candlesData.length;
  const lSwings = (chartCandles.swings || []).length;

  if (!lCandles || !lSwings) {
    return true;
  }

  const lastSwing = chartCandles.swings[lSwings - 1];

  const lastCandle = candlesData[lCandles - 1];
  const lastCandleInSwing = lastSwing.candles[lastSwing.candles.length - 1];

  const indexOfLastCandle = candlesData.findIndex(
    candle => candle.originalTimeUnix === lastCandleInSwing.originalTimeUnix,
  );

  let percentPerPrice;
  let isLongCurrentSwing;
  let sumBuyVolumeInMoney = 0;
  let sumSellVolumeInMoney = 0;

  if (lastSwing.isLong) {
    isLongCurrentSwing = instrumentDoc.price > lastCandleInSwing.high;
  } else {
    isLongCurrentSwing = instrumentDoc.price > lastCandleInSwing.low;
  }

  if (isLongCurrentSwing) {
    const differenceBetweenHighAndLow = lastCandle.high - lastCandleInSwing.low;
    percentPerPrice = 100 / (lastCandleInSwing.low / differenceBetweenHighAndLow);
  } else {
    const differenceBetweenHighAndLow = lastCandleInSwing.high - lastCandle.low;
    percentPerPrice = 100 / (lastCandleInSwing.high / differenceBetweenHighAndLow);
  }

  for (let i = indexOfLastCandle; i < lCandles; i += 1) {
    const sumVolumeInMoney = candlesData[i].volume * candlesData[i].close;

    if (candlesData[i].isLong) {
      sumBuyVolumeInMoney += sumVolumeInMoney;
    } else {
      sumSellVolumeInMoney += sumVolumeInMoney;
    }
  }

  const sumVolumeInMoney = sumBuyVolumeInMoney + sumSellVolumeInMoney;
  // const deltaVolumeInMoney = sumBuyVolumeInMoney - sumSellVolumeInMoney;

  const sumVolumeText = formatNumberToPretty(sumVolumeInMoney);
  // const sumDeltaVolumeText = formatNumberToPretty(deltaVolumeInMoney);

  $chartsContainer.find('.last-swing-data')
    .text(`${sumVolumeText} (${percentPerPrice.toFixed(1)}%)`);
};

const calculateSwings = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  // const indicatorCumulativeDeltaVolume = instrumentDoc.indicator_cumulative_delta_volume;

  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  const previousSwingSeries = chartCandles.extraSeries.filter(series => series.isSwing);

  chartCandles.removeMarkers();

  previousSwingSeries.forEach(extraSeries => {
    chartCandles.removeSeries(extraSeries, false);
  });

  if (!lCandles) {
    return true;
  }

  const basicSwings = [];

  let directionOfSwing;
  let newSwing = [candlesData[0]];

  for (let i = 1; i < lCandles; i += 1) {
    const candle = candlesData[i];
    const prevCandle = candlesData[i - 1];

    if (newSwing.length === 1) {
      directionOfSwing = candle.low < prevCandle.low ? 'short' : 'long';
    }

    if (directionOfSwing === 'short') {
      if (candle.low > prevCandle.low) {
        basicSwings.push({
          isLong: false,
          candles: newSwing,
          maxHigh: newSwing[0].high,
          minLow: newSwing[newSwing.length - 1].low,
        });

        directionOfSwing = 'long';
        newSwing = [prevCandle, candle];
        continue;
      }

      newSwing.push(candle);
    } else {
      if (candle.high < prevCandle.high) {
        basicSwings.push({
          isLong: true,
          candles: newSwing,
          minLow: newSwing[0].low,
          maxHigh: newSwing[newSwing.length - 1].high,
        });

        directionOfSwing = 'short';
        newSwing = [prevCandle, candle];
        continue;
      }
    }

    newSwing.push(candle);
  }

  /*
  basicSwings.forEach(swing => {
    const color = swing.isLong ? constants.GREEN_COLOR : constants.RED_COLOR;

    const newExtraSeries = chartCandles.addExtraSeries({
      color,
      // lineStyle,
      lastValueVisible: false,
    });

    const startCandle = swing.candles[0];
    const endCandle = swing.candles[swing.candles.length - 1];

    const dataForSeries = [];

    if (swing.isLong) {
      dataForSeries.push({
        value: startCandle.low,
        time: startCandle.originalTimeUnix,
      }, {
        value: endCandle.high,
        time: endCandle.originalTimeUnix,
      });
    } else {
      dataForSeries.push({
        value: startCandle.high,
        time: startCandle.originalTimeUnix,
      }, {
        value: endCandle.low,
        time: endCandle.originalTimeUnix,
      });
    }

    chartCandles.drawSeries(newExtraSeries, dataForSeries);
  });
  // */

  let swings = basicSwings;

  for (let iteration = 0; iteration < settings.numberCompressions; iteration += 1) {
    const nextStepSwings = [];

    for (let i = 0; i < swings.length; i += 1) {
      const firstSwing = swings[i];
      let secondSwing = swings[i + 1];
      let thirdSwing = swings[i + 2];

      if (!secondSwing || !thirdSwing) {
        break;
      }

      if (firstSwing.isLong) {
        if (thirdSwing.maxHigh < firstSwing.maxHigh) {
          nextStepSwings.push({
            isLong: true,
            minLow: firstSwing.minLow,
            maxHigh: firstSwing.maxHigh,
            candles: firstSwing.candles,
          });

          continue;
        }

        newSwing = {
          isLong: true,
          minLow: firstSwing.minLow,
          maxHigh: thirdSwing.maxHigh,
          candles: [
            ...firstSwing.candles,
            ...secondSwing.candles,
            ...thirdSwing.candles,
          ],
        };

        let increment = 3;

        while (1) {
          const nextOneSwing = swings[i + increment];
          const nextTwoSwing = swings[i + increment + 1];

          if (!nextOneSwing || !nextTwoSwing
            || nextOneSwing.minLow < secondSwing.minLow
            || nextTwoSwing.maxHigh < thirdSwing.maxHigh) {
            break;
          }

          newSwing.candles.push(
            ...nextOneSwing.candles,
            ...nextTwoSwing.candles,
          );

          newSwing.maxHigh = nextTwoSwing.maxHigh;
          increment += 2;

          secondSwing = nextOneSwing;
          thirdSwing = nextTwoSwing;
        }

        i += (increment - 1);
        nextStepSwings.push(newSwing);
      } else {
        if (thirdSwing.minLow > firstSwing.minLow) {
          nextStepSwings.push({
            isLong: false,
            minLow: firstSwing.minLow,
            maxHigh: firstSwing.maxHigh,
            candles: firstSwing.candles,
          });

          continue;
        }

        newSwing = {
          isLong: false,
          minLow: thirdSwing.minLow,
          maxHigh: firstSwing.maxHigh,
          candles: [
            ...firstSwing.candles,
            ...secondSwing.candles,
            ...thirdSwing.candles,
          ],
        };

        let increment = 3;

        while (1) {
          const nextOneSwing = swings[i + increment];
          const nextTwoSwing = swings[i + increment + 1];

          if (!nextOneSwing || !nextTwoSwing
            || nextOneSwing.maxHigh > secondSwing.maxHigh
            || nextTwoSwing.minLow > thirdSwing.minLow) {
            break;
          }

          newSwing.candles.push(
            ...nextOneSwing.candles,
            ...nextTwoSwing.candles,
          );

          newSwing.minLow = nextTwoSwing.minLow;
          increment += 2;

          secondSwing = nextOneSwing;
          thirdSwing = nextTwoSwing;
        }

        i += (increment - 1);
        nextStepSwings.push(newSwing);
      }
    }

    swings = JSON.parse(JSON.stringify(nextStepSwings));
  }

  // /*
  swings.forEach(swing => {
    const color = swing.isLong ? constants.GREEN_COLOR : constants.RED_COLOR;

    const newExtraSeries = chartCandles.addExtraSeries({
      color: constants.YELLOW_COLOR,
      // lineStyle,
      lastValueVisible: false,
    }, {
      isSwing: true,
    });

    const startCandle = swing.candles[0];
    const endCandle = swing.candles[swing.candles.length - 1];

    let percentPerPrice;

    const dataForSeries = [];

    if (swing.isLong) {
      const differenceBetweenHighAndLow = endCandle.high - startCandle.low;
      percentPerPrice = 100 / (startCandle.low / differenceBetweenHighAndLow);

      dataForSeries.push({
        value: startCandle.low,
        time: startCandle.originalTimeUnix,
      }, {
        value: endCandle.high,
        time: endCandle.originalTimeUnix,
      });
    } else {
      const differenceBetweenHighAndLow = startCandle.high - endCandle.low;
      percentPerPrice = 100 / (startCandle.high / differenceBetweenHighAndLow);

      dataForSeries.push({
        value: startCandle.high,
        time: startCandle.originalTimeUnix,
      }, {
        value: endCandle.low,
        time: endCandle.originalTimeUnix,
      });
    }

    chartCandles.drawSeries(newExtraSeries, dataForSeries);

    let sumBuyVolumeInMoney = 0;
    let sumSellVolumeInMoney = 0;

    const uniqueCandles = [];
    const uniqueCandlesUnix = new Set();

    for (let i = 1; i < swing.candles.length; i += 1) {
      if (!uniqueCandlesUnix.has(swing.candles[i].originalTimeUnix)) {
        const sumVolumeInMoney = swing.candles[i].volume * swing.candles[i].close;

        if (swing.candles[i].isLong) {
          sumBuyVolumeInMoney += sumVolumeInMoney;
        } else {
          sumSellVolumeInMoney += sumVolumeInMoney;
        }

        uniqueCandles.push(swing.candles[i]);
        uniqueCandlesUnix.add(swing.candles[i].originalTimeUnix);
      }
    }

    const shape = swing.isLong ? 'arrowUp' : 'arrowDown';
    const position = swing.isLong ? 'aboveBar' : 'belowBar';
    const sumVolumeInMoney = sumBuyVolumeInMoney + sumSellVolumeInMoney;
    // const deltaVolumeInMoney = sumBuyVolumeInMoney - sumSellVolumeInMoney;

    const sumVolumeText = formatNumberToPretty(sumVolumeInMoney);

    // const text = sumVolumeText;
    const text = `${sumVolumeText} (${percentPerPrice.toFixed(1)}%)`;

    chartCandles.addMarker({
      color,
      shape,
      position,
      text,
      time: swing.candles[swing.candles.length - 1].originalTimeUnix,

      isSwing: true,
    });
  });

  chartCandles.drawMarkers();
  chartCandles.swings = swings;
  // */

  calculateVolumeForLastSwing({ instrumentId });
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

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

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
  startDate,
  endDate,
}) => {
  console.log('start loading');

  if (!startDate) {
    startDate = new Date().toISOString();
  }

  if (!endDate) {
    endDate = moment().utc().toISOString();
  }

  const query = {
    instrumentId,
    startTime: startDate,
    endTime: endDate,
    // isFirstCall: false,
    isFirstCall: true,
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
