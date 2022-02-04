/* global
functions, makeRequest, getUnix, getPrecision,
objects, constants, moment, ChartCandles, IndicatorVolume
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
]);

const WORK_AMOUNT = 10;
const BINANCE_COMMISSION = 0.02;

/* Variables */

const windowHeight = window.innerHeight;

let choosenInstrumentId;
const choosenPeriod = AVAILABLE_PERIODS.get('1h');

let levels = [];
let instrumentsDocs = [];

const startDate = moment.unix(1562565600);
// const startDate = moment().utc().startOf('month').add(-1, 'months');
const endDate = moment.unix(1594188000);
// const endDate = moment().utc().endOf('hour');

const settings = {
  [AVAILABLE_PERIODS.get('5m')]: {
    distanceFromLeftSide: 100,
    distanceFromRightSide: 100,
  },

  [AVAILABLE_PERIODS.get('1h')]: {
    distanceFromLeftSide: 30,
    distanceFromRightSide: 30,
  },

  minTouches: 0,
  percentForCountTouch: 0.2,
  percentForAllowedBreakdown: 0.2,

  stopLossPercent: 0.2,
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

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      await loadCharts({ instrumentId });

      levels = calculateFigureLevels({ instrumentId });
      // drawMarkersForLevels({ instrumentId });

      calculateTrades({ instrumentId });

      const daysIntervals = splitDays({ instrumentId });

      if (!choosenInstrumentId) {
        initReport(daysIntervals.map(interval => interval.startOfPeriodUnix));
      }

      makeReport({ instrumentId });

      choosenInstrumentId = instrumentId;
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
        default: break;
      }

      if (choosenInstrumentId) {
        const instrumentId = choosenInstrumentId;

        // ...
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

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  if (!instrumentDoc.candles_data || !instrumentDoc.candles_data.length) {
    instrumentDoc.candles_data = await getCandlesData({
      period: choosenPeriod,
      instrumentId: instrumentDoc._id,

      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
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
      case 'futures': { chartKeyDoc = instrumentDoc; break; }
      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, choosenPeriod, chartKeyDoc);
    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.candles_data, false);
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
  const lCandles = candlesData.length;

  chartCandles.removeMarkers();

  if (!lCandles) {
    return true;
  }

  const newLevels = [];

  const levelsSettings = settings[choosenPeriod];

  for (let i = 0; i < lCandles; i += 1) {
    const workingData = candlesData.slice(0, i + 1);

    const highLevels = getHighLevels({
      candles: workingData,
      distanceFromLeftSide: levelsSettings.distanceFromLeftSide,
      distanceFromRightSide: levelsSettings.distanceFromRightSide,
    });

    const lowLevels = [];

    /*
    const lowLevels = getLowLevels({
      candles: workingData,
      distanceFromLeftSide: levelsSettings.distanceFromLeftSide,
      distanceFromRightSide: levelsSettings.distanceFromRightSide,
    });
    */

    if ((!highLevels || !highLevels.length)
      && (!lowLevels || !lowLevels.length)) {
      continue;
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
        if (candlesData[j].high > level.levelPrice) {
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

      if (touches.length < settings.minTouches) {
        return true;
      }

      /*
      touches.forEach(touch => {
        chartCandles.addMarker({
          shape: 'arrowDown',
          position: 'aboveBar',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });
      // */

      newLevels.push({
        ...level,
        touches,
        isLong: true,
        endOfLevelUnix,
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
        if (candlesData[j].low < level.levelPrice) {
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

      if (touches.length < settings.minTouches) {
        return true;
      }

      /*
      touches.forEach(touch => {
        chartCandles.addMarker({
          shape: 'arrowUp',
          position: 'belowBar',
          color: constants.YELLOW_COLOR,
          time: touch.originalTimeUnix,
        });
      });
      // */

      newLevels.push({
        ...level,
        touches,
        isLong: false,
        endOfLevelUnix,
      });
    });
  }

  newLevels.forEach(level => {
    const newCandleExtraSeries = chartCandles.addExtraSeries({
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

const calculateTrades = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;

  const candlesData = chartCandles.originalData;
  const lCandlesData = candlesData.length;

  for (let i = 0; i < lCandlesData; i += 1) {
    const currentCandle = candlesData[i];

    const targetLevels = levels.filter(level =>
      level.startOfLevelUnix < currentCandle.originalTimeUnix
      && level.endOfLevelUnix >= currentCandle.originalTimeUnix,
    );

    checkMyTrades(instrumentDoc, currentCandle, {});

    const doesExistActiveTrade = instrumentDoc.my_trades
      .find(myTrade => myTrade.isActive);

    if (doesExistActiveTrade) {
      continue;
    }

    const result = strategyFunctionLong({
      levelsData: targetLevels,
    }, currentCandle, settings);

    if (result) {
      const stopLossPercent = settings.stopLossPercent / 100;

      const stopLossPrice = result.isLong ?
        result.levelPrice - instrumentDoc.tick_size : result.levelPrice + instrumentDoc.tick_size;

      const percentPerPrice = (result.levelPrice * stopLossPercent);

      const triggeredPrice = result.isLong ?
        result.levelPrice + percentPerPrice : result.levelPrice - percentPerPrice;

      createMyTrade(instrumentDoc, {
        isLong: result.isLong,

        buyPrice: result.isLong ? triggeredPrice : stopLossPrice,
        sellPrice: !result.isLong ? triggeredPrice : stopLossPrice,

        stopLossPrice,

        tradeStartedAt: currentCandle.originalTimeUnix,
      });

      checkMyTrades(instrumentDoc, currentCandle, {});
    }
  }

  const lastCandle = candlesData[lCandlesData - 1];

  checkMyTrades(instrumentDoc, lastCandle, {}, true);

  console.log(instrumentDoc.my_trades);
};

const strategyFunctionLong = ({
  levelsData,
}, currentCandle, settings) => {
  const lLevelsData = levelsData.length;

  if (!lLevelsData) {
    return false;
  }

  const stopLossPercent = settings.stopLossPercent / 100;

  const doesExistTouch = levelsData.find(level => {
    const percentPerPrice = (level.levelPrice * stopLossPercent);
    const triggeredPrice = level.levelPrice - percentPerPrice;

    if (currentCandle.high >= triggeredPrice) {
      return true;
    }
  });

  if (!doesExistTouch) {
    return false;
  }

  return {
    ...currentCandle,
    levelPrice: doesExistTouch.levelPrice,
    isLong: false,
  };
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

  startDate,
  endDate,
}) => {
  console.log('start loading');

  const query = {
    instrumentId,
    isFirstCall: false,
  };

  if (startDate) {
    query.startTime = startDate;
  }

  if (endDate) {
    query.endTime = endDate;
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

// calculate levels logic

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

  chartCandles.drawMarkers();

  const $slider = $chartsContainer.find('.chart-slider.futures');

  $slider
    .find('span.amount-slides')
    .text(levels.length);

  scrollToLevel(1, { instrumentId });
};

// trades logic


const checkMyTrades = (instrumentDoc, currentCandle, optionalData = {}, isFinish = false) => {
  const chartCandles = instrumentDoc.chart_candles;

  if (!instrumentDoc.my_trades || !instrumentDoc.my_trades.length) {
    return true;
  }

  instrumentDoc.my_trades
    .filter(myTrade => myTrade.isActive)
    .forEach(myTrade => {
      if (isFinish
        || (myTrade.isLong && currentCandle.low <= myTrade.stopLossPrice)
        || (!myTrade.isLong && currentCandle.high >= myTrade.stopLossPrice)) {
        myTrade.isActive = false;
        myTrade.tradeEndedAt = currentCandle.originalTimeUnix;

        // if (myTrade.isLong) {
        //   myTrade.sellPrice = myTrade.stopLossPrice;
        // } else {
        //   myTrade.buyPrice = myTrade.stopLossPrice;
        // }

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
      } else if (myTrade.isLong && currentCandle.high > myTrade.sellPrice) {
        myTrade.sellPrice = currentCandle.high;
      } else if (!myTrade.isLong && currentCandle.low < myTrade.buyPrice) {
        myTrade.buyPrice = currentCandle.low;
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
