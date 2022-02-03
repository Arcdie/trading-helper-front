/* global
functions, makeRequest, getUnix,
objects, constants, moment, ChartCandles, IndicatorVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

/* Variables */

const windowHeight = window.innerHeight;

let choosenInstrumentId;
let choosenPeriod = AVAILABLE_PERIODS.get('1h');

let levels = [];
let instrumentsDocs = [];

const settings = {
  [AVAILABLE_PERIODS.get('5m')]: {
    distanceFromLeftSide: 100,
    distanceFromRightSide: 100,
  },

  [AVAILABLE_PERIODS.get('1h')]: {
    distanceFromLeftSide: 30,
    distanceFromRightSide: 30,
  },

  percentForCountTouch: 0.2,
};

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
      levels = calculateFigureLevels({ instrumentId });
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
          const existedSeries = chartCandles.extraSeries.find(
            series => series.id === param.time,
          );

          if (existedSeries) {
            chartCandles.removeSeries(existedSeries, false);
            levels = levels.filter(level => param.time !== level.startOfLevelUnix);
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

  const lCandles = candlesData.length;

  if (!lCandles) {
    return true;
  }

  const newLevels = [];

  const highLevels = getHighLevels({
    candles: candlesData,
    distanceFromLeftSide: settings[choosenPeriod].distanceFromLeftSide,
    distanceFromRightSide: settings[choosenPeriod].distanceFromRightSide,
  });

  const lowLevels = getLowLevels({
    candles: candlesData,
    distanceFromLeftSide: settings[choosenPeriod].distanceFromLeftSide,
    distanceFromRightSide: settings[choosenPeriod].distanceFromRightSide,
  });

  if ((!highLevels || !highLevels.length)
    && (!lowLevels || !lowLevels.length)) {
    return true;
  }

  highLevels.forEach(level => {
    const doesExistLevelWithThisPrice = newLevels.some(l => l.levelPrice === level.levelPrice);

    if (doesExistLevelWithThisPrice) {
      return true;
    }

    const indexOfLevelStart = candlesData.findIndex(
      candle => candle.originalTimeUnix === level.startOfLevelUnix,
    );

    const touches = [];
    let indexOfLevelEnd = lCandles - 1;
    let endOfLevelUnix = candlesData[lCandles - 1].originalTimeUnix;

    const allowedDistanceFromLevel = level.levelPrice - (level.levelPrice * (settings.percentForCountTouch / 100));

    for (let j = indexOfLevelStart; j < lCandles; j += 1) {
      if (candlesData[j].close > level.levelPrice) {
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
      numberTouches: touches.length,
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

    const touches = [];
    let indexOfLevelEnd = lCandles - 1;
    let endOfLevelUnix = candlesData[lCandles - 1].originalTimeUnix;

    const allowedDistanceFromLevel = level.levelPrice + (level.levelPrice * (settings.percentForCountTouch / 100));

    for (let j = indexOfLevelStart; j < lCandles; j += 1) {
      if (candlesData[j].close < level.levelPrice) {
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
      numberTouches: touches.length,
    });
  });

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
