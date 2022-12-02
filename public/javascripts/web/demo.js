/* global
functions, makeRequest, getUnix, getRandomNumber, formatNumberToPretty,
objects, moment, constants,
classes, ChartCandles, IndicatorVolume, IndicatorMovingAverage, Trading,
*/

/*
   Баг +
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

let linePoints = [];
let choosedFigureShape = false;
let isActiveLineDrawing = false;
let isActiveLevelDrawing = false;
let temporaryLineSeriesId;
let previousCrosshairMove;

let instrumentsDocs = [];

let choosenInstrumentId;
let choosenPeriod = DEFAULT_PERIOD;
const windowHeight = window.innerHeight;

const settings = {
  // Swings
  numberCompressions: 3,
  limitCandlesFor1h: 720 + 48, // 2 monthes + 2 days
  limitCandlesFor5m: 576 + 24, // 2 days + 2 hours

  // MA
  periodForShortMA: 20,
  periodForMediumMA: 50,
  colorForShortMA: '#0800FF',
  colorForMediumMA: '#2196F3',
};

const trading = new Trading();
const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

/* JQuery */
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

$(document).ready(async () => {
  // start settings

  trading.init();

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

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

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

      if (!instrumentDoc.original_candles_data_5m
        || !instrumentDoc.original_candles_data_5m.length) {
        instrumentDoc.original_candles_data_5m = await getCandlesData({
          period: AVAILABLE_PERIODS.get('5m'),
          instrumentId: instrumentDoc._id,
        });

        instrumentDoc.candles_data_5m = JSON.parse(
          JSON.stringify(instrumentDoc.original_candles_data_5m),
        );
      }

      if (!instrumentDoc.original_candles_data_1h
        || !instrumentDoc.original_candles_data_1h.length) {
        instrumentDoc.original_candles_data_1h = await getCandlesData({
          period: AVAILABLE_PERIODS.get('1h'),
          instrumentId: instrumentDoc._id,
        });

        instrumentDoc.candles_data_1h = JSON.parse(
          JSON.stringify(instrumentDoc.original_candles_data_1h),
        );
      }

      removeFigureLinesFromLocalStorage({});
      removeFigureLevelsFromLocalStorage({});

      loadCharts({ instrumentId });
      calculateSwings({ instrumentId });

      const figureLevelsData = getFigureLevelsFromLocalStorage({ instrumentId });
      drawFigureLevels({ instrumentId }, figureLevelsData);

      const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
      drawFigureLines({ instrumentId }, figureLinesData);

      if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
        splitDays({ instrumentId });
      }

      choosenInstrumentId = instrumentId;
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
        const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

        loadCharts({ instrumentId });
        calculateSwings({ instrumentId });

        const figureLevelsData = getFigureLevelsFromLocalStorage({ instrumentId });
        drawFigureLevels({ instrumentId }, figureLevelsData);

        const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
        drawFigureLines({ instrumentId }, figureLinesData);

        const activeTrade = trading.trades.find(t => t.isActive);
        activeTrade && drawTrades({ instrumentId }, activeTrade);

        if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
          splitDays({ instrumentId });
        }
      }
    })
    .on('click', '.drawing div', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $this = $(this);
      const type = $(this).data('type');

      const isActive = $this.hasClass('is_active');

      if (isActive) {
        $this.removeClass('is_active');
        isActiveLineDrawing = false;
        isActiveLevelDrawing = false;
      } else {
        $this.parent().find('div').removeClass('is_active');
        $this.addClass('is_active');

        if (type === 'level') {
          isActiveLevelDrawing = true;
          isActiveLineDrawing = false;
        } else {
          isActiveLevelDrawing = false;
          isActiveLineDrawing = true;
          linePoints = [];
        }
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

  $('#show-trading-form')
    .on('click', () => {
      if (!choosenInstrumentId) return;

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
      const price = instrumentDoc.candles_data_5m[0].data[1];

      trading.loadInstrumentData(instrumentDoc, { price });
      trading.$tradingForm.addClass('is_active');
    });

  trading.$tradingForm.find('button')
    // .on('click', function () {
    //   const typeAction = $(this).parent().attr('class');
    //   trading.changeTypeAction(typeAction);
    // })
    .on('click', function () {
      const typeAction = $(this).parent().attr('class');
      trading.changeTypeAction(typeAction);

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
      const firstCandle = choosenPeriod === AVAILABLE_PERIODS.get('5m')
        ? instrumentDoc.candles_data_5m[0] : instrumentDoc.candles_data_1h[0];

      trading.createTrade(instrumentDoc, {
        price: firstCandle.data[1],
        time: firstCandle.time,
      });
    });

  $(document)
    .on('keypress', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      if (e.keyCode === 93) {
        // ]
        nextTick();
      }
    })
    .on('keydown', async e => {
      if (e.keyCode === 72) {
        // H
        await setHistoryMoment(choosenInstrumentId);
      } else if (e.keyCode === 27) {
        // ESC
        trading.$tradingForm.removeClass('is_active');
      }

      if (choosedFigureShape) {
        if (e.keyCode === 8) {
          // <-
          const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
          const chartCandles = instrumentDoc.chart_candles;

          if (choosedFigureShape.series.isFigureLevel) {
            removeFigureLevelsFromLocalStorage({
              instrumentId: instrumentDoc._id,
              time: choosedFigureShape.levelStartCandleTime,
            });
          } else if (choosedFigureShape.series.isFigureLine) {
            removeFigureLinesFromLocalStorage({
              instrumentId: instrumentDoc._id,
              time: choosedFigureShape.levelStartCandleTime,
            });
          }

          chartCandles.removeSeries(choosedFigureShape.series, false);
          choosedFigureShape = false;
        }
      }
    });
});

/* Functions */

const setHistoryMoment = async () => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

  // /*
  const number1hCandles = instrumentDoc.original_candles_data_1h.length;
  const randNumber = getRandomNumber(480, number1hCandles - 480); // 480 = 20 * 24
  const targetCandleTime = getUnix(instrumentDoc.original_candles_data_1h[randNumber].time);
  // */

  /*
  const number5mCandles = instrumentDoc.original_candles_data_5m.length;
  const first5mCandle = instrumentDoc.original_candles_data_5m[number5mCandles - 1];
  const targetCandleTime = moment(first5mCandle.time).endOf('day').unix() + 1;
  // */

  instrumentDoc.candles_data_5m = instrumentDoc.candles_data_5m
    .filter(({ time }) => getUnix(time) < targetCandleTime)
    .slice(0, 3000);

  instrumentDoc.candles_data_1h = instrumentDoc.candles_data_1h.filter(
    ({ time }) => getUnix(time) < targetCandleTime,
  );

  loadCharts({ instrumentId: choosenInstrumentId });
  calculateSwings({ instrumentId: choosenInstrumentId });

  if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
    splitDays({ instrumentId: choosenInstrumentId });
  }
};

const nextTick = () => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
  let nextCandleInOriginalScope;

  if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
    const currentCandleTimeUnix = getUnix(instrumentDoc.candles_data_5m[0].time);

    const indexInOriginScope = instrumentDoc.original_candles_data_5m.findIndex(
      ({ time }) => getUnix(time) === currentCandleTimeUnix,
    );

    nextCandleInOriginalScope = instrumentDoc.original_candles_data_5m[indexInOriginScope - 1];

    if (!nextCandleInOriginalScope) return;

    const startOfHourUnix = moment(nextCandleInOriginalScope.time).startOf('hour').unix();

    const target1HCandleIndex = instrumentDoc.candles_data_1h.findIndex(
      ({ time }) => getUnix(time) === startOfHourUnix,
    );

    if (!~target1HCandleIndex) {
      instrumentDoc.candles_data_1h.unshift({
        ...nextCandleInOriginalScope,
        time: new Date(startOfHourUnix * 1000),
        isNotFinished: true,
      });
    } else {
      const { volume, data } = instrumentDoc.candles_data_1h[target1HCandleIndex];
      let [open, close, low, high] = data;

      if (nextCandleInOriginalScope.data[2] < low) {
        low = nextCandleInOriginalScope.data[2];
      }

      if (nextCandleInOriginalScope.data[3] > high) {
        high = nextCandleInOriginalScope.data[3];
      }

      instrumentDoc.candles_data_1h[target1HCandleIndex] = {
        ...nextCandleInOriginalScope,
        volume: volume + nextCandleInOriginalScope.volume,
        data: [open, nextCandleInOriginalScope.data[1], low, high],
        time: new Date(startOfHourUnix * 1000),
        isNotFinished: true,
      };
    }

    instrumentDoc.candles_data_5m.unshift(nextCandleInOriginalScope);
  } else if (choosenPeriod === AVAILABLE_PERIODS.get('1h')) {
    const currentCandleInHistoryScope = instrumentDoc.candles_data_1h[0];
    const currentCandleTimeUnix = getUnix(currentCandleInHistoryScope.time);

    const indexInOriginScope = instrumentDoc.original_candles_data_1h.findIndex(
      ({ time }) => getUnix(time) === currentCandleTimeUnix,
    );

    nextCandleInOriginalScope = instrumentDoc.original_candles_data_1h[indexInOriginScope - 1];

    if (!nextCandleInOriginalScope) return;

    if (currentCandleInHistoryScope.isNotFinished) {
      // BUUUUG!
      // console.log('currentCandleInHistoryScope.isNotFinished');
      instrumentDoc.candles_data_1h[0] = {
        ...instrumentDoc.original_candles_data_1h[indexInOriginScope],
      };
    }

    const nextCandleInOriginalScopeTime = getUnix(nextCandleInOriginalScope.time) + 3600;
    instrumentDoc.candles_data_5m = instrumentDoc.original_candles_data_5m.filter(
      ({ time }) => getUnix(time) < nextCandleInOriginalScopeTime,
    );

    instrumentDoc.candles_data_1h.unshift(nextCandleInOriginalScope);
  }

  const chartCandles = instrumentDoc.chart_candles;
  const indicatorVolume = instrumentDoc.indicator_volume;
  const indicatorMovingAverageShort = instrumentDoc.indicator_moving_average_short;
  const indicatorMovingAverageMedium = instrumentDoc.indicator_moving_average_medium;

  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  const [open, close, low, high] = nextCandleInOriginalScope.data;

  const preparedData = chartCandles.prepareNewData([{
    time: getUnix(nextCandleInOriginalScope.time) * 1000,
    data: [open, close, low, high],
    volume: nextCandleInOriginalScope.volume,
  }], false)[0];

  chartCandles.originalData.push(preparedData);

  chartCandles.drawSeries(chartCandles.mainSeries, preparedData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, {
    value: preparedData.volume,
    time: preparedData.originalTimeUnix,
  });

  const figureLevelsExtraSeries = chartCandles.extraSeries.filter(s => s.isFigureLevel);
  figureLevelsExtraSeries.forEach(s => {
    chartCandles.drawSeries(s, {
      value: s.value,
      time: preparedData.originalTimeUnix,
    });
  });

  trading.trades.filter(t => t.isActive).forEach(trade => {
    const targetSeries = chartCandles.extraSeries.filter(s => s.isTrade && s.id.includes(trade.id));

    targetSeries.forEach(s => {
      chartCandles.drawSeries(s, {
        value: s.value,
        time: preparedData.originalTimeUnix,
      });
    });
  });

  calculateSwings({ instrumentId: choosenInstrumentId });

  let resultCalculateMA;
  const targetCandlesPeriod = candlesData.slice(
    lCandles - (settings.periodForMediumMA * 2), lCandles,
  );

  resultCalculateMA = indicatorMovingAverageShort.calculateData(targetCandlesPeriod);

  indicatorMovingAverageShort.drawSeries(
    indicatorMovingAverageShort.mainSeries,
    resultCalculateMA[resultCalculateMA.length - 1],
  );

  resultCalculateMA = indicatorMovingAverageMedium.calculateData(targetCandlesPeriod);

  indicatorMovingAverageMedium.drawSeries(
    indicatorMovingAverageMedium.mainSeries,
    resultCalculateMA[resultCalculateMA.length - 1],
  );

  // calculateVolumeForLastSwing({ instrumentId: choosenInstrumentId });

  $chartsContainer.find('.last-swing-data').css({
    top: chartCandles.mainSeries.priceToCoordinate(close) - 15,
  });

  const trades = trading.calculateTradesProfit({ price: close }, true);
  Trading.updateTradesInTradeList(trades);
};

const loadCharts = ({
  instrumentId,
}) => {
  $chartsContainer.empty();
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

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

        <div class="row">
          <div class="drawing">
            <div class="figure-level" data-type="level">
              <img src="/images/figure-level.png" alt="figure-level">
            </div>
            <div class="figure-line" data-type="line">
              <img src="/images/figure-line.png" alt="figure-line">
            </div>
          </div>
        </div>
      </div>
      <span class="ruler">0%</span>
      <span class="last-swing-data">0</span>
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

    const indicatorMovingAverageShort = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForShortMA,
      period: settings.periodForShortMA,
    });

    const indicatorMovingAverageMedium = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.colorForMediumMA,
      period: settings.periodForMediumMA,
    });

    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.chartKey = chartKey;
    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_volume = indicatorVolume;
    chartKeyDoc.indicator_moving_average_short = indicatorMovingAverageShort;
    chartKeyDoc.indicator_moving_average_medium = indicatorMovingAverageMedium;

    chartCandles.setOriginalData(chartKeyDoc[`candles_data_${chartCandles.period}`], false);
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
            choosedFigureShape = {
              instrumentId,
              series: existedSeries,
              levelStartCandleTime: param.time,
            };
          }
        }

        if (isActiveLineDrawing) {
          const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);

          linePoints.push({
            value: coordinateToPrice,
            time: param.time,
          });

          if (linePoints.length === 2) {
            if (temporaryLineSeriesId) {
              const series = chartCandles.extraSeries.find(s => s.id === temporaryLineSeriesId);
              series && chartCandles.removeSeries(series, false);
            }

            saveFigureLineToLocalStorage({
              instrumentId,
            }, linePoints);

            const series = drawFigureLines({ instrumentId }, [{ linePoints }]);

            choosedFigureShape = {
              series: series[0],
              instrumentId,

              levelTimeframe: choosenPeriod,
              levelStartCandleTime: param.time,
            };

            linePoints = [];
            isActiveLineDrawing = false;
            $chartsContainer.find('.drawing .figure-line').removeClass('is_active');
          }
        }

        if (isActiveLevelDrawing) {
          isActiveLevelDrawing = false;
          $chartsContainer.find('.drawing .figure-level').removeClass('is_active');

          const startOfHourUnix = moment.unix(param.time).startOf('hour').unix();
          const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);

          saveFigureLevelToLocalStorage({
            instrumentId,
            value: coordinateToPrice,
            time: startOfHourUnix,
          });

          const series = drawFigureLevels({ instrumentId }, [{
            value: coordinateToPrice,
            time: param.time,
          }]);

          choosedFigureShape = {
            series: series[0],
            instrumentId,

            levelTimeframe: choosenPeriod,
            levelStartCandleTime: param.time,
          };
        }
      });
    }

    chartCandles.chart.subscribeCrosshairMove((param) => {
      if (param.point) {
        const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(chartKeyDoc.price - coordinateToPrice);
        const percentPerPrice = 100 / (chartKeyDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

        chartCandles.lastPrice = coordinateToPrice;

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

      if (isActiveLineDrawing && param.time && param.point
        && linePoints.length === 1
        && (!previousCrosshairMove || previousCrosshairMove !== param.time)) {
        previousCrosshairMove = param.time;

        if (temporaryLineSeriesId) {
          const series = chartCandles.extraSeries.find(s => s.id === temporaryLineSeriesId);
          series && chartCandles.removeSeries(series, false);
        }

        const time = param.time;
        const value = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        drawFigureLines({ instrumentId }, [{ linePoints: [...linePoints, { value, time }] }]);
        temporaryLineSeriesId = linePoints[0].time;
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

  const limitCandles = chartCandles.period === AVAILABLE_PERIODS.get('5m')
    ? settings.limitCandlesFor5m : settings.limitCandlesFor1h;

  const lOriginalData = chartCandles.originalData.length;
  const candlesData = chartCandles.originalData.slice(lOriginalData - limitCandles, lOriginalData);
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
    } else if (candle.high < prevCandle.high) {
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

const drawFigureLines = ({ instrumentId }, figureLinesData = []) => {
  if (!figureLinesData.length) return;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) return;

  const lineStyle = 0;
  const newExtraSeries = [];

  if (choosenPeriod === AVAILABLE_PERIODS.get('1h')) {
    figureLinesData.forEach(figureLine => {
      figureLine.linePoints.forEach(e => {
        e.time = moment.unix(e.time).startOf('hour').unix();
      });
    });
  }

  figureLinesData.forEach(figureLine => {
    const newSeries = chartCandles.addExtraSeries({
      color: constants.BLUE_COLOR,
      lineStyle,
      lastValueVisible: false,
    }, {
      isFigureLine: true,
      id: figureLine.linePoints[0].time,
    });

    chartCandles.drawSeries(
      newSeries,
      figureLine.linePoints,
    );

    newExtraSeries.push(newSeries);
  });

  return newExtraSeries;
};

const drawFigureLevels = ({ instrumentId }, figureLevelsData = []) => {
  if (!figureLevelsData.length) return;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) return;

  const lineStyle = 0;
  const newExtraSeries = [];

  figureLevelsData.forEach(({ time, value }) => {
    const newSeries = chartCandles.addExtraSeries({
      color: constants.BLUE_COLOR,
      lineStyle,
      lastValueVisible: false,
    }, {
      id: time,
      isFigureLevel: true,
      value,
      originalTimeUnix: time,
    });

    chartCandles.drawSeries(
      newSeries,
      [{
        value,
        time,
      }, {
        value,
        time: candlesData[lCandles - 1].originalTimeUnix,
      }],
    );

    newExtraSeries.push(newSeries);
  });

  return newExtraSeries;
};

const drawTrades = ({ instrumentId }, trade) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const series = Trading.makeTradeSeries(instrumentDoc, trade);

  if (!series.length) return;

  const chartCandles = instrumentDoc.chart_candles;
  const candlesData = chartCandles.originalData;
  const lCandles = candlesData.length;

  if (!lCandles) return;

  series.forEach(s => {
    chartCandles.drawSeries(
      s,
      [{
        value: s.value,
        time: getUnix(trade.startAt),
      }, {
        value: s.value,
        time: candlesData[lCandles - 1].originalTimeUnix,
      }],
    );
  });
};

const getFigureLevelsFromLocalStorage = ({ instrumentId }) => {
  let figureLevels = localStorage.getItem('trading-helper:figure-levels');

  if (!figureLevels) {
    return [];
  }

  figureLevels = JSON.parse(figureLevels);

  if (instrumentId) {
    return figureLevels.filter(e => e.instrumentId === instrumentId);
  }

  return figureLevels;
};

const saveFigureLevelToLocalStorage = ({ instrumentId, value, time }) => {
  const figureLevels = getFigureLevelsFromLocalStorage({});
  figureLevels.push({ instrumentId, value, time });
  localStorage.setItem('trading-helper:figure-levels', JSON.stringify(figureLevels));
};

const removeFigureLevelsFromLocalStorage = ({
  instrumentId,
  value,
  time,
}) => {
  if (!instrumentId) {
    localStorage.removeItem('trading-helper:figure-levels');
    return;
  }

  let figureLevels = getFigureLevelsFromLocalStorage({});

  if (!value && !time) {
    figureLevels = figureLevels.filter(e => e.instrumentId !== instrumentId);
    localStorage.setItem('trading-helper:figure-levels', JSON.stringify(figureLevels));
    return;
  }

  if (time) {
    figureLevels = figureLevels.filter(e => e.instrumentId === instrumentId && e.time !== time);
  } else if (value) {
    figureLevels = figureLevels.filter(e => e.instrumentId === instrumentId && e.value !== value);
  }

  localStorage.setItem('trading-helper:figure-levels', JSON.stringify(figureLevels));
};

const getFigureLinesFromLocalStorage = ({ instrumentId }) => {
  let figureLines = localStorage.getItem('trading-helper:figure-lines');

  if (!figureLines) {
    return [];
  }

  figureLines = JSON.parse(figureLines);

  if (instrumentId) {
    return figureLines.filter(e => e.instrumentId === instrumentId);
  }

  return figureLines;
};

const saveFigureLineToLocalStorage = ({ instrumentId }, linePoints) => {
  const figureLines = getFigureLinesFromLocalStorage({});
  figureLines.push({ instrumentId, linePoints });
  localStorage.setItem('trading-helper:figure-lines', JSON.stringify(figureLines));
};

const removeFigureLinesFromLocalStorage = ({
  instrumentId,
  time,
}) => {
  if (!instrumentId) {
    localStorage.removeItem('trading-helper:figure-lines');
    return;
  }

  let figureLines = getFigureLinesFromLocalStorage({});

  if (!time) {
    figureLines = figureLines.filter(e => e.instrumentId === instrumentId);
  } else {
    figureLines = figureLines.filter(
      e => e.instrumentId === instrumentId && e.linePoints[0].time !== time,
    );
  }

  localStorage.setItem('trading-helper:figure-lines', JSON.stringify(figureLines));
};

const getCandlesData = async ({
  instrumentId,
  period,
}) => {
  console.log('start loading');

  const query = {
    instrumentId,
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
