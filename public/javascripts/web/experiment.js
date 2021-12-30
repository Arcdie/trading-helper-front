/* global
functions, makeRequest,
objects, moment, constants, ChartCandles, IndicatorVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  // ['1M', '1m'],
  ['5M', '5m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('5M');

/* Variables */

let instrumentsDocs = [];

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;
const windowHeight = window.innerHeight;

const settings = {
  padding: 20,
  allowedPercent: 0.2,
  requiredNumberTouches: 3,
};

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

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
  $settings.find('.number-touches').val(settings.requiredNumberTouches);

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
      calculateLevels({ instrumentId });
      splitDays({ instrumentId });

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
        case 'allowed-percent': settings.allowedPercent = newValue; break;
        case 'number-touches': settings.requiredNumberTouches = newValue; break;

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

        calculateLevels({ instrumentId });
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

/* Functions */

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!instrumentDoc.original_data || !instrumentDoc.original_data.length) {
    instrumentDoc.original_data = await getCandlesData({
      period: choosenPeriod,
      instrumentId: instrumentDoc._id,
      // endTime: endDate.toISOString(),
      // startTime: startDate.toISOString(),
    });
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
            <div class="5m is_worked  ${choosenPeriod === AVAILABLE_PERIODS.get('5M') ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
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

    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

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

const calculateLevels = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) {
    return true;
  }

  const levelsLines = [];
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

      const price = tCandle.isLong ? tCandle.close : tCandle.open;

      if (tCandle.high > candle.high
        || price > candle.high) {
        isCandleHighHighest = false;
      }
    });

    targetCandlesArr.forEach(tCandle => {
      if (!isCandleLowLowest) {
        return true;
      }

      const price = tCandle.isLong ? tCandle.close : tCandle.open;

      if (tCandle.low < candle.low
        || price < candle.low) {
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

    const newLevelLine = [candle];

    for (let j = i + 1; j < highestCandles.length; j += 1) {
      const nextCandle = highestCandles[j];

      if (candle.high < nextCandle.high) {
        continue;
      }

      const highestCandlesBetweenPeriods = highestCandles.slice(i + 1, j);

      const isPriceCrossedCandleHigh = highestCandlesBetweenPeriods.some(
        tCandle => tCandle.high > nextCandle.high,
      );

      if (isPriceCrossedCandleHigh) {
        continue;
      }

      newLevelLine.push(nextCandle);
      break;
    }

    if (newLevelLine.length === 1) {
      continue;
    }

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === newLevelLine[0].originalTimeUnix,
    );

    const indexOfSecondCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === newLevelLine[1].originalTimeUnix,
    );

    let indexOfEndCandle;

    const numberCandles = indexOfSecondCandle - indexOfFirstCandle;

    const differenceBetweenHighs = newLevelLine[0].high - newLevelLine[1].high;
    const numberReduceForPrice = differenceBetweenHighs / numberCandles;

    let originalTimeUnixForEndCandle;

    let currentPrice = newLevelLine[1].high;

    for (let j = indexOfSecondCandle + 1; j < lCandles; j += 1) {
      currentPrice -= numberReduceForPrice;

      const price = candlesData[j].isLong ? candlesData[j].close : candlesData[j].open;
      const limitPrice = currentPrice + (currentPrice * (settings.allowedPercent / 100));
      const limitPriceForHigh = currentPrice + (currentPrice * ((settings.allowedPercent * 2) / 100));

      if (price > limitPrice || candlesData[j].high > limitPriceForHigh) {
        indexOfEndCandle = j;
        originalTimeUnixForEndCandle = candlesData[j].originalTimeUnix;
        break;
      }
    }

    if (!originalTimeUnixForEndCandle) {
      indexOfEndCandle = lCandles - 1;
      originalTimeUnixForEndCandle = candlesData[indexOfEndCandle].originalTimeUnix;
    }

    newLevelLine.push({
      high: currentPrice,
      originalTimeUnix: originalTimeUnixForEndCandle,
    });

    const touches = [];
    let numberTouches = 0;
    currentPrice = newLevelLine[0].high;

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

    if (numberTouches < settings.requiredNumberTouches) {
      continue;
    }

    touches.forEach(touch => {
      chartCandles.addMarker({
        shape: 'arrowDown',
        color: constants.YELLOW_COLOR,
        time: touch.originalTimeUnix,
      });
    });

    newLevelLine.push(false);
    levelsLines.push(newLevelLine);
  }

  for (let i = 0; i < lowestCandles.length; i += 1) {
    const candle = lowestCandles[i];

    if (!lowestCandles[i + 1]) {
      break;
    }

    const newLevelLine = [candle];

    for (let j = i + 1; j < lowestCandles.length; j += 1) {
      const nextCandle = lowestCandles[j];

      if (candle.low > nextCandle.low) {
        continue;
      }

      const lowestCandlesBetweenPeriods = lowestCandles.slice(i + 1, j);

      const isPriceCrossedCandleLow = lowestCandlesBetweenPeriods.some(
        tCandle => tCandle.low < nextCandle.low,
      );

      if (isPriceCrossedCandleLow) {
        continue;
      }

      newLevelLine.push(nextCandle);
      break;
    }

    if (newLevelLine.length === 1) {
      continue;
    }

    const indexOfFirstCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === newLevelLine[0].originalTimeUnix,
    );

    const indexOfSecondCandle = candlesData.findIndex(
      tCandle => tCandle.originalTimeUnix === newLevelLine[1].originalTimeUnix,
    );

    let indexOfEndCandle;

    const numberCandles = indexOfSecondCandle - indexOfFirstCandle;

    const differenceBetweenLows = newLevelLine[1].low - newLevelLine[0].low;
    const numberReduceForPrice = differenceBetweenLows / numberCandles;

    let originalTimeUnixForEndCandle;

    let currentPrice = newLevelLine[1].low;

    for (let j = indexOfSecondCandle + 1; j < lCandles; j += 1) {
      currentPrice += numberReduceForPrice;

      const price = candlesData[j].isLong ? candlesData[j].open : candlesData[j].close;
      const limitPrice = currentPrice - (currentPrice * (settings.allowedPercent / 100));
      const limitPriceForHigh = currentPrice - (currentPrice * ((settings.allowedPercent * 2) / 100));

      if (price < limitPrice || candlesData[j].low < limitPriceForHigh) {
        indexOfEndCandle = j;
        originalTimeUnixForEndCandle = candlesData[j].originalTimeUnix;
        break;
      }
    }

    if (!originalTimeUnixForEndCandle) {
      indexOfEndCandle = lCandles - 1;
      originalTimeUnixForEndCandle = candlesData[indexOfEndCandle].originalTimeUnix;
    }

    newLevelLine.push({
      low: currentPrice,
      originalTimeUnix: originalTimeUnixForEndCandle,
    });

    const touches = [];
    let numberTouches = 0;
    currentPrice = newLevelLine[0].low;

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

    if (numberTouches < settings.requiredNumberTouches) {
      continue;
    }

    touches.forEach(touch => {
      chartCandles.addMarker({
        shape: 'arrowUp',
        color: constants.YELLOW_COLOR,
        time: touch.originalTimeUnix,
      });
    });

    newLevelLine.push(true);
    levelsLines.push(newLevelLine);
  }

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

  levelsLines.forEach(([start, middle, end, isLong]) => {
    const key = isLong ? 'low' : 'high';
    const color = isLong ? constants.GREEN_COLOR : constants.RED_COLOR;

    const newExtraSeries = chartCandles.addExtraSeries({
      color,
      lastValueVisible: false,
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
