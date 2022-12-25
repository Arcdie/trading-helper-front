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
  ['1d', '1d'],
]);

/* Variables */

let linePoints = [];
let isLoading = false;
let choosedFigureShape = false;
let isActiveLineDrawing = false;
let isActiveLevelDrawing = false;
let isActiveCrosshairMoving = false;
let temporaryLineSeriesId;
let previousCrosshairMove;
let choosenInstrumentId;

let instrumentsDocs = [];
let choosenPeriods = [AVAILABLE_PERIODS.get('5m'), AVAILABLE_PERIODS.get('1h')];
let activePeriod = choosenPeriods[choosenPeriods.length - 1];
let finishDatePointUnix = moment().startOf('hour').unix();
const windowHeight = window.innerHeight;

const settings = {
  chart: {
    limitCandlesPerChart: 1000,
    // numberCandlesForHistoryBorders: 480, // 480 = 20 * 24
  },

  swings: {
    numberCompressions: 3,
    limitCandlesFor1h: 720 + 48, // 2 monthes + 2 days
    limitCandlesFor5m: 576 + 24, // 2 days + 2 hours
  },

  figureLevels: {
    colorFor5mLevels: '#0800FF',
    colorFor1hLevels: constants.BLUE_COLOR,
    colorFor1dLevels: constants.GREEN_COLOR,
  },

  figureLines: {
    colorFor5mLines: '#0800FF',
    colorFor1hLines: constants.BLUE_COLOR,
    colorFor1dLines: constants.GREEN_COLOR,
  },

  movingAverage: {
    periodForShortMA: 20,
    periodForMediumMA: 50,
    periodForLongMA: 200,
    colorForShortMA: '#0800FF',
    colorForMediumMA: constants.BLUE_COLOR,
    colorForLongMA: constants.GREEN_COLOR,
  },
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

  // trading.init();
  // clearFinishDatePointInLocalStorage();

  setHistoryMoment();

  // removeFigureLinesFromLocalStorage({});
  // removeFigureLevelsFromLocalStorage({});

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  if (params.interval && AVAILABLE_PERIODS.get(params.interval)) {
    choosenPeriods = [params.interval];
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

      if (choosenInstrumentId) {
        clearInstrumentData({ instrumentId });
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');
      await loadCandles({ instrumentId }, choosenPeriods);

      loadCharts({ instrumentId });
      // calculateSwings({ instrumentId });

      const figureLevelsData = getFigureLevelsFromLocalStorage({ instrumentId });
      drawFigureLevels({ instrumentId }, figureLevelsData);

      const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
      drawFigureLines({ instrumentId }, figureLinesData);

      // todo: n
      // if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
      //   splitDays({ instrumentId });
      // }

      choosenInstrumentId = instrumentId;
    });

  $chartsContainer
    .on('click', '.chart-periods div', async function () {
      if (isLoading) {
        return true;
      }

      if (!choosenInstrumentId) {
        return true;
      }

      const period = $(this).data('period');

      if (!choosenPeriods.includes(period)) {
        choosenPeriods.push(period);
        $(this).addClass('is_active');

        if (choosenPeriods.length === 3) {
          const extraPeriod = choosenPeriods.shift();
          const $extraPeriod = $(this).parent().find(`.${extraPeriod}`);
          $extraPeriod.removeClass('is_active');
        }
      } else {
        if (choosenPeriods.length === 1) {
          return true;
        }

        choosenPeriods = choosenPeriods.filter(p => p !== period);
        $(this).removeClass('is_active');
      }

      const instrumentId = choosenInstrumentId;
      await loadCandles({ instrumentId }, choosenPeriods);

      loadCharts({ instrumentId });
      // calculateSwings({ instrumentId });

      const figureLevelsData = getFigureLevelsFromLocalStorage({ instrumentId });
      drawFigureLevels({ instrumentId }, figureLevelsData);

      const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
      drawFigureLines({ instrumentId }, figureLinesData);

      // const activeTrade = trading.trades.find(t => t.isActive);
      // activeTrade && drawTrades({ instrumentId }, activeTrade);

      // todo: n
      // if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
      //   splitDays({ instrumentId });
      // }
    })
    .on('click', '.drawing div', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $this = $(this);
      const type = $(this).data('type');

      const isActive = $this.hasClass('is_active');

      if (isActive) {
        $chartsContainer.find(`.${type}`).removeClass('is_active');
        isActiveLineDrawing = false;
        isActiveLevelDrawing = false;
      } else {
        $chartsContainer.find('.drawing div').removeClass('is_active');
        $chartsContainer.find(`.${type}`).addClass('is_active');

        if (type === 'figure-level') {
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
      const price = instrumentDoc[`chart_candles_${activePeriod}`].getInstrumentPrice();

      trading.loadInstrumentData(instrumentDoc, { price });
      trading.$tradingForm.addClass('is_active');
    });

  trading.$tradingForm.find('.action-block button')
    .on('click', function () {
      const typeAction = $(this).parent().attr('class');
      trading.changeTypeAction(typeAction);

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
      const { originalData } = instrumentDoc[`chart_candles_${activePeriod}`];
      const firstCandle = originalData[originalData.length - 1];

      trading.createTrade(instrumentDoc, {
        price: firstCandle.close,
        time: firstCandle.originalTimeUnix,
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

          if (choosedFigureShape.isFigureLevel) {
            removeFigureLevelsFromLocalStorage({
              instrumentId: instrumentDoc._id,
              seriesId: choosedFigureShape.seriesId,
            });
          } else if (choosedFigureShape.isFigureLine) {
            removeFigureLinesFromLocalStorage({
              instrumentId: instrumentDoc._id,
              seriesId: choosedFigureShape.seriesId,
            });
          }

          choosenPeriods.forEach(period => {
            const chartCandles = instrumentDoc[`chart_candles_${period}`];
            const targetSeries = chartCandles.extraSeries.find(
              s => s.id === choosedFigureShape.seriesId,
            );

            if (targetSeries) {
              chartCandles.removeSeries(targetSeries, false);
            }
          });

          choosedFigureShape = false;
        }
      }
    });
});

/* Functions */

const clearInstrumentData = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  AVAILABLE_PERIODS.forEach(period => {
    instrumentDoc[`candles_data_${period}`] = [];
    instrumentDoc[`chart_candles_${period}`] = null;
    instrumentDoc[`indicator_volume_${period}`] = null;
    instrumentDoc[`indicator_moving_average_short_${period}`] = null;
    instrumentDoc[`indicator_moving_average_medium_${period}`] = null;
  });

  linePoints = [];
  choosedFigureShape = false;
  isActiveLineDrawing = false;
  isActiveLevelDrawing = false;
  temporaryLineSeriesId = false;

  trading.$tradingForm.removeClass('is_active');
  // todo: finish active trades
};

const sortPeriods = (periods = []) => {
  if (!periods.length) {
    return [];
  }

  if (periods.length === 1) {
    return periods;
  }

  const is5m = periods.some(p => p === AVAILABLE_PERIODS.get('5m'));
  const is1h = periods.some(p => p === AVAILABLE_PERIODS.get('1h'));

  if (is5m) {
    return [
      periods.filter(p => p !== AVAILABLE_PERIODS.get('5m')),
      AVAILABLE_PERIODS.get('5m'),
    ];
  }

  if (is1h) {
    return [
      periods.filter(p => p !== AVAILABLE_PERIODS.get('1h')),
      AVAILABLE_PERIODS.get('1h'),
    ];
  }
};

const loadCandles = async ({
  instrumentId,
}, periods = []) => {
  if (!periods.length) {
    return true;
  }

  for await (const period of choosenPeriods) {
    const getCandlesOptions = {
      period,
      instrumentId,
      endTime: moment.unix(finishDatePointUnix),
    };

    if (period === AVAILABLE_PERIODS.get('5m')) {
      const startTime = (settings.chart.limitCandlesPerChart * 5);
      getCandlesOptions.startTime = moment.unix(finishDatePointUnix).add(-startTime, 'minutes');
    } else if (period === AVAILABLE_PERIODS.get('1h')) {
      getCandlesOptions.startTime = moment.unix(finishDatePointUnix).add(-settings.chart.limitCandlesPerChart, 'hours');

      const value = (finishDatePointUnix % 3600);

      if (value) {
        getCandlesOptions.endTime.add(-value + 3600, 'seconds');
      }
    }

    const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
    instrumentDoc[`candles_data_${period}`] = await getCandlesData(getCandlesOptions);
  }
};

const setHistoryMoment = async () => {
  /*
  const number1hCandles = instrumentDoc.original_candles_data_1h.length;
  const randNumber = getRandomNumber(
    settings.chart.numberCandlesForHistoryBorders,
    number1hCandles - settings.chart.numberCandlesForHistoryBorders,
  );
  const targetCandleTime = getUnix(instrumentDoc.original_candles_data_1h[randNumber].time);
  */

  /*
  const number5mCandles = instrumentDoc.original_candles_data_5m.length;
  const first5mCandle = instrumentDoc.original_candles_data_5m[number5mCandles - 1];
  const targetCandleTime = moment(first5mCandle.time).endOf('day').unix() + 1;
  // */

  // 1 August 2021

  const resultGetDatePoint = getFinishDatePointFromLocalStorage();

  if (resultGetDatePoint) {
    finishDatePointUnix = getUnix(new Date(resultGetDatePoint));

    if (activePeriod !== AVAILABLE_PERIODS.get('5m')) {
      const divider = activePeriod === AVAILABLE_PERIODS.get('1h') ? 3600 : 86400;
      const decrementValue = finishDatePointUnix % divider;

      if (decrementValue !== 0) {
        finishDatePointUnix -= decrementValue;
      }
    }
  } else {
    finishDatePointUnix = moment({ day: 4, month: 2, year: 2022 }).unix();
  }

  if (choosenInstrumentId) {
    await loadCandles({ instrumentId: choosenInstrumentId }, choosenPeriods);

    loadCharts({ instrumentId: choosenInstrumentId });
    // calculateSwings({ instrumentId: choosenInstrumentId });

    // todo: n
    // if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
    //   splitDays({ instrumentId: choosenInstrumentId });
    // }
  }
};

const loadCandlesForNextTick = async (instrumentDoc, period) => {
  const { originalData } = instrumentDoc[`chart_candles_${period}`];

  const getCandlesOptions = {
    period,
    instrumentId: instrumentDoc._id,
    startTime: moment.unix(originalData[originalData.length - 1].originalTimeUnix),
    endTime: moment.unix(finishDatePointUnix),
  };

  const newCandles = await getCandlesData(getCandlesOptions);
  const chartCandles = instrumentDoc[`chart_candles_${period}`];
  const indicatorVolume = instrumentDoc[`indicator_volume_${period}`];
  const indicatorMovingAverageShort = instrumentDoc[`indicator_moving_average_short_${period}`];
  const indicatorMovingAverageMedium = instrumentDoc[`indicator_moving_average_medium_${period}`];

  const preparedData = chartCandles.prepareNewData(newCandles.map(c => ({
    ...c,
    time: period === AVAILABLE_PERIODS.get('1d') ? c.time : getUnix(c.time) * 1000,
  })), false);

  instrumentDoc[`candles_data_${period}`].unshift(...newCandles);

  const figureLevelsExtraSeries = chartCandles.extraSeries.filter(s => s.isFigureLevel);
  const figureLinesExtraSeries = chartCandles.extraSeries.filter(
    s => s.isFigureLine && s.isActive && s.timeframe === period,
  );

  preparedData.forEach(d => {
    chartCandles.drawSeries(chartCandles.mainSeries, d);
    indicatorVolume.drawSeries(indicatorVolume.mainSeries, {
      value: d.volume,
      time: d.originalTimeUnix,
    });

    chartCandles.originalData.push(d);

    const candlesData = chartCandles.originalData;
    const lCandles = candlesData.length;

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

    figureLevelsExtraSeries.forEach(s => {
      chartCandles.drawSeries(s, {
        value: s.value,
        time: d.originalTimeUnix,
      });
    });

    figureLinesExtraSeries.forEach(s => {
      s.linePoints[1].value += s.isLong ? s.reduceValue : -s.reduceValue;
      s.linePoints[1].time = d.originalTimeUnix;

      chartCandles.drawSeries(s, s.linePoints);
    });
  });

  // calculateVolumeForLastSwing({ instrumentId: choosenInstrumentId }, period);

  // $chartsContainer.find('.last-swing-data').css({
  //   top: chartCandles.mainSeries.priceToCoordinate(chartCandles.getInstrumentPrice()) - 15,
  // });

  // trading.nextTick(instrumentDoc, preparedData);

  // const trades = trading.calculateTradesProfit({ price: close }, true);
  // Trading.updateTradesInTradeList(trades);
};

const nextTick = async () => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
  const incrementValue = activePeriod === AVAILABLE_PERIODS.get('5m') ? 300 : 3600;
  finishDatePointUnix += incrementValue;
  saveFinishDatePointToLocalStorage(new Date(finishDatePointUnix * 1000));

  await loadCandlesForNextTick(instrumentDoc, activePeriod);

  if (activePeriod === AVAILABLE_PERIODS.get('5m')) {
    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1h'))) {
      if (finishDatePointUnix % 3600 === 0) {
        await loadCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1h'));
      }
    }

    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1d'))) {
      if (finishDatePointUnix % 86400 === 0) {
        await loadCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1d'));
      }
    }
  } else if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('5m'))) {
      await loadCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('5m'));
    }

    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1d'))) {
      if (finishDatePointUnix % 86400 === 0) {
        await loadCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1d'));
      }
    }
  } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('5m'))) {
      await loadCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('5m'));
    }

    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1h'))) {
      await loadCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1h'));
    }
  }

  /*
  trading.trades.forEach(trade => {
    const targetSeries = chartCandles.extraSeries.filter(s => s.isTrade && s.id.includes(trade.id));

    targetSeries.forEach(s => {
      chartCandles.drawSeries(s, {
        value: s.value,
        time: preparedData.originalTimeUnix,
      });
    });
  });

  calculateSwings({ instrumentId: choosenInstrumentId });
  */
};

const loadCharts = ({
  instrumentId,
}) => {
  $chartsContainer.empty();
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  let appendStr = '';

  sortPeriods(choosenPeriods).forEach((period, index) => {
    appendStr += `<div class="chart-container period_${period}" style="width: ${choosenPeriods.length === 2 ? '50' : '100'}%">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>

        <div class="row">
          <div class="chart-periods">
            ${!index ? `
            <div class="5m is_worked  ${choosenPeriods.includes(AVAILABLE_PERIODS.get('5m')) ? 'is_active' : ''}" data-period="5m"><span>5M</span></div>
            <div class="1h is_worked  ${choosenPeriods.includes(AVAILABLE_PERIODS.get('1h')) ? 'is_active' : ''}" data-period="1h"><span>1H</span></div>
            <div class="1d is_worked  ${choosenPeriods.includes(AVAILABLE_PERIODS.get('1d')) ? 'is_active' : ''}" data-period="1d"><span>1D</span></div>` : `<div class="${period} is_worked is_active" data-period="${period}"><span>${period.toUpperCase()}</span></div>`}
          </div>
        </div>

        <div class="row">
          <div class="drawing">
            <div class="figure-level" data-type="figure-level">
              <img src="/images/figure-level.png" alt="figure-level">
            </div>
            <div class="figure-line" data-type="figure-line">
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

  choosenPeriods.forEach(period => {
    const $chartContainer = $chartsContainer.find(`.chart-container.period_${period}`);
    const $rootContainer = $chartContainer.find('.charts');

    const chartCandles = new ChartCandles($rootContainer, period, instrumentDoc);

    const indicatorMovingAverageShort = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.movingAverage.colorForShortMA,
      period: settings.movingAverage.periodForShortMA,
    });

    const indicatorMovingAverageMedium = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.movingAverage.colorForMediumMA,
      period: settings.movingAverage.periodForMediumMA,
    });

    const indicatorVolume = new IndicatorVolume($rootContainer);

    chartCandles.key = 'futures';
    instrumentDoc[`chart_candles_${period}`] = chartCandles;
    instrumentDoc[`indicator_volume_${period}`] = indicatorVolume;
    instrumentDoc[`indicator_moving_average_short_${period}`] = indicatorMovingAverageShort;
    instrumentDoc[`indicator_moving_average_medium_${period}`] = indicatorMovingAverageMedium;

    chartCandles.setOriginalData(instrumentDoc[`candles_data_${period}`], false);
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

    chartCandles.chart.subscribeClick(param => {
      activePeriod = chartCandles.period;
      const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);

      if (param.time && chartCandles.extraSeries.length) {
        const existedSeries = chartCandles.extraSeries.find(
          series => series.time === param.time,
        );

        if (existedSeries) {
          choosedFigureShape = {
            instrumentId,
            seriesId: existedSeries.id,
            isFigureLine: existedSeries.isFigureLine,
            isFigureLevel: existedSeries.isFigureLevel,
            time: param.time,
          };
        }
      }

      if (isActiveLineDrawing) {
        linePoints.push({
          value: coordinateToPrice,
          time: param.time,
        });

        if (linePoints.length === 2) {
          if (temporaryLineSeriesId) {
            const series = chartCandles.extraSeries.find(s => s.id === temporaryLineSeriesId);
            series && chartCandles.removeSeries(series, false);
          }

          const seriesId = ChartCandles.getNewSeriesId();
          const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
          const isLong = linePoints[1].value > linePoints[0].value;
          const isActive = linePoints[1].time === lastCandle.originalTimeUnix;

          saveFigureLinesToLocalStorage([{
            seriesId,
            instrumentId,
            linePoints,
            isLong,
            isActive,
            timeframe: chartCandles.period,
          }]);

          drawFigureLines(
            { instrumentId },
            [{
              seriesId,
              linePoints,
              isLong,
              isActive,
              timeframe: chartCandles.period,
            }],
          );

          choosedFigureShape = {
            seriesId,
            instrumentId,
            isFigureLine: true,
            time: linePoints[0].time,
          };

          linePoints = [];
          isActiveLineDrawing = false;
          $chartsContainer.find('.drawing .figure-line').removeClass('is_active');
        }
      }

      if (isActiveLevelDrawing) {
        isActiveLevelDrawing = false;
        $chartsContainer.find('.drawing .figure-level').removeClass('is_active');

        const seriesId = ChartCandles.getNewSeriesId();

        saveFigureLevelToLocalStorage({
          seriesId,
          instrumentId,
          time: param.time,
          timeframe: chartCandles.period,
          value: coordinateToPrice,
        });

        drawFigureLevels({ instrumentId }, [{
          seriesId,
          time: param.time,
          timeframe: chartCandles.period,
          value: coordinateToPrice,
        }]);

        choosedFigureShape = {
          seriesId,
          instrumentId,
          time: param.time,
          isFigureLevel: true,
        };
      }

      if (trading.isActiveStopLossChoice) {
        trading.calculateStopLossPercent({
          stopLossPrice: coordinateToPrice,
          instrumentPrice: chartCandles.getInstrumentPrice(),
        });

        trading.isActiveStopLossChoice = false;
      }
    });

    const $ruler = $chartContainer.find('span.ruler');
    const $legend = $chartContainer.find('.legend');
    const $low = $legend.find('span.low');
    const $high = $legend.find('span.high');
    const $open = $legend.find('span.open');
    const $close = $legend.find('span.close');
    const $percent = $legend.find('span.percent');

    chartCandles.chart.subscribeCrosshairMove(param => {
      let coordinateToPrice;

      if (param.point) {
        coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
        const instrumentPrice = chartCandles.getInstrumentPrice();
        const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(instrumentPrice - coordinateToPrice);
        const percentPerPrice = 100 / (instrumentPrice / differenceBetweenInstrumentAndCoordinatePrices);

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

      if (param.point && param.time) {
        // move crosshair for other timeframe charts
        if (choosenPeriods.length === 2 && !isActiveCrosshairMoving) {
          const secondPeriod = choosenPeriods.filter(p => p !== chartCandles.period)[0];
          const tmpChartCandles = instrumentDoc[`chart_candles_${secondPeriod}`];

          let pointTime;

          switch (secondPeriod) {
            case AVAILABLE_PERIODS.get('5m'): pointTime = param.time; break;
            case AVAILABLE_PERIODS.get('1h'): {
              pointTime = param.time;

              if (chartCandles.period === AVAILABLE_PERIODS.get('5m')) {
                pointTime = param.time - (param.time % 3600);
              }

              break;
            }

            case AVAILABLE_PERIODS.get('1d'): {
              pointTime = moment.unix(param.time).startOf('day').unix();
              break;
            }

            default: break;
          }

          const x = tmpChartCandles.chart.timeScale().timeToCoordinate(pointTime);
          const y = tmpChartCandles.mainSeries.priceToCoordinate(coordinateToPrice);

          isActiveCrosshairMoving = true;
          tmpChartCandles.chart.moveCrosshair({ x, y });
          isActiveCrosshairMoving = false;
        }

        // live painting figure lines
        if (isActiveLineDrawing
          && linePoints.length === 1
          && (!previousCrosshairMove || previousCrosshairMove !== param.time)) {
          previousCrosshairMove = param.time;

          if (temporaryLineSeriesId) {
            const series = chartCandles.extraSeries.find(s => s.id === temporaryLineSeriesId);
            series && chartCandles.removeSeries(series, false);
          }

          const time = param.time;
          const seriesId = ChartCandles.getNewSeriesId();
          const value = chartCandles.mainSeries.coordinateToPrice(param.point.y);

          drawFigureLines(
            { instrumentId },
            [{
              seriesId,
              timeframe: activePeriod,
              linePoints: [...linePoints, { value, time }],
            }],
            [activePeriod],
          );

          temporaryLineSeriesId = seriesId;
        }
      }
    });

    let isCrossHairMoving = false;

    const listCharts = [chartCandles, indicatorVolume];
    listCharts.forEach(c => {
      const otherCharts = listCharts.filter(chart => chart.key !== c.key);

      c.chart.subscribeCrosshairMove(param => {
        if (!param.point || !param.time || isCrossHairMoving) {
          return true;
        }

        isCrossHairMoving = true;

        otherCharts.forEach(innerElem => {
          innerElem.chart.moveCrosshair(param.point);
        });

        isCrossHairMoving = false;

        c.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
          otherCharts.forEach(innerElem => {
            innerElem.chart.timeScale().setVisibleLogicalRange(range);
          });
        });
      });
    });

    listCharts.forEach(c => {
      if (c.period !== AVAILABLE_PERIODS.get('1d')) {
        c.chart.applyOptions({
          timeScale: {
            timeVisible: true,
          },
        });
      }
    });

    isLoading = false;
    let isEndHistory = false;
    let isStartedLoad = false;

    chartCandles.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(async newVisibleLogicalRange => {
        if (isStartedLoad || isEndHistory) {
          return true;
        }

        const barsInfo = chartCandles.mainSeries.barsInLogicalRange(newVisibleLogicalRange);

        if (barsInfo !== null && barsInfo.barsBefore < -20) {
          isStartedLoad = true;

          if (!chartCandles.originalData.length) {
            isLoading = false;
            return true;
          }

          isLoading = true;
          const endTime = new Date(chartCandles.originalData[0].originalTimeUnix * 1000);

          const getCandlesOptions = {
            endTime,
            instrumentId,
            period: chartCandles.period,
            limit: settings.chart.limitCandlesPerChart,
          };

          const candlesData = await getCandlesData(getCandlesOptions);

          if (!candlesData || !candlesData.length) {
            isEndHistory = true;
            isLoading = false;
            return true;
          }

          chartCandles.setOriginalData(candlesData, false);
          chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

          indicatorVolume.drawSeries(
            indicatorVolume.mainSeries,
            chartCandles.originalData.map(e => ({ value: e.volume, time: e.time })),
          );

          isLoading = false;
          isStartedLoad = false;
        }
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

const calculateVolumeForLastSwing = ({ instrumentId }, period) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const chartCandles = instrumentDoc[`chart_candles_${period}`];
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

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    // const indicatorCumulativeDeltaVolume = instrumentDoc.indicator_cumulative_delta_volume;

    const limitCandles = chartCandles.period === AVAILABLE_PERIODS.get('5m')
      ? settings.swings.limitCandlesFor5m : settings.swings.limitCandlesFor1h;

    const lOriginalData = chartCandles.originalData.length;
    const candlesData = chartCandles.originalData.slice(
      lOriginalData - limitCandles, lOriginalData,
    );
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

    for (let iteration = 0; iteration < settings.swings.numberCompressions; iteration += 1) {
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

    calculateVolumeForLastSwing({ instrumentId }, period);
  });
};

const drawFigureLines = ({ instrumentId }, figureLinesData = [], periods = choosenPeriods) => {
  if (!figureLinesData.length) return;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  periods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const candlesData = chartCandles.originalData;
    const lCandles = candlesData.length;
    const lastCandle = candlesData[lCandles - 1];

    if (!lCandles) return;

    if (period !== AVAILABLE_PERIODS.get('5m')) {
      const startOfEntity = period === AVAILABLE_PERIODS.get('1h') ? 'hour' : 'day';

      figureLinesData.forEach(figureLine => {
        figureLine.linePoints.forEach(e => {
          e.time = moment.unix(e.time).startOf(startOfEntity).unix();
        });
      });
    }

    figureLinesData.forEach(figureLine => {
      let color = settings.figureLines.colorFor5mLines;

      switch (figureLine.timeframe) {
        case AVAILABLE_PERIODS.get('5m'): break;
        case AVAILABLE_PERIODS.get('1h'): color = settings.figureLines.colorFor1hLines; break;
        case AVAILABLE_PERIODS.get('1d'): color = settings.figureLines.colorFor1dLines; break;
        default: alert(`Unknown timeframe - ${figureLine.timeframe}`); break;
      }

      let reduceValue = 0;

      if (figureLine.isActive) {
        figureLine.linePoints[1].time = lastCandle.originalTimeUnix;
        reduceValue = calculateReduceValue(figureLine.linePoints, period);
      }

      const newSeries = chartCandles.addExtraSeries({
        color,
        lineStyle: 0,
        lastValueVisible: false,
      }, {
        id: figureLine.seriesId,
        isFigureLine: true,
        isLong: figureLine.isLong,
        isActive: figureLine.isActive,
        linePoints: figureLine.linePoints,
        time: figureLine.linePoints[0].time,
        timeframe: period,
        reduceValue,
      });

      chartCandles.drawSeries(
        newSeries,
        figureLine.linePoints,
      );
    });
  });
};

const drawFigureLevels = ({ instrumentId }, figureLevelsData = []) => {
  if (!figureLevelsData.length) return;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const candlesData = chartCandles.originalData;
    const lCandles = candlesData.length;

    if (!lCandles) return;

    /*
    if (period === AVAILABLE_PERIODS.get('5m')) {
      const last5mCandle = candlesData[0];

      figureLevelsData.forEach(figureLevel => {
        if (figureLevel.time < last5mCandle.originalTimeUnix) {
          figureLevel.time = last5mCandle.originalTimeUnix;
        }
      });
    }
    */

    figureLevelsData.forEach(({
      seriesId, time, value, timeframe,
    }) => {
      if (timeframe === AVAILABLE_PERIODS.get('5m') && period !== AVAILABLE_PERIODS.get('5m')) {
        time -= time % (period === AVAILABLE_PERIODS.get('1h') ? 3600 : 86400);
      }

      let color = settings.figureLevels.colorFor5mLevels;

      switch (timeframe) {
        case AVAILABLE_PERIODS.get('5m'): break;
        case AVAILABLE_PERIODS.get('1h'): color = settings.figureLevels.colorFor1hLevels; break;
        case AVAILABLE_PERIODS.get('1d'): color = settings.figureLevels.colorFor1dLevels; break;
        default: alert(`Unknown timeframe - ${timeframe}`); break;
      }

      const newSeries = chartCandles.addExtraSeries({
        color,
        lineStyle: 0,
        lastValueVisible: false,
      }, {
        time,
        value,
        id: seriesId,
        isFigureLevel: true,
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
    });
  });
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

const saveFigureLevelToLocalStorage = (figureLevelData) => {
  const figureLevels = getFigureLevelsFromLocalStorage({});
  figureLevels.push(figureLevelData);
  localStorage.setItem('trading-helper:figure-levels', JSON.stringify(figureLevels));
};

const removeFigureLevelsFromLocalStorage = ({
  instrumentId,
  value,
  seriesId,
}) => {
  if (!instrumentId) {
    localStorage.removeItem('trading-helper:figure-levels');
    return;
  }

  let figureLevels = getFigureLevelsFromLocalStorage({});

  if (!value && !seriesId) {
    figureLevels = figureLevels.filter(e => e.instrumentId !== instrumentId);
    localStorage.setItem('trading-helper:figure-levels', JSON.stringify(figureLevels));
    return;
  }

  if (seriesId) {
    figureLevels = figureLevels.filter(
      e => e.instrumentId === instrumentId && e.seriesId !== seriesId,
    );
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

const saveFigureLinesToLocalStorage = (figureLinesData = []) => {
  const figureLines = getFigureLinesFromLocalStorage({});
  figureLines.push(...figureLinesData);
  localStorage.setItem('trading-helper:figure-lines', JSON.stringify(figureLines));
};

const removeFigureLinesFromLocalStorage = ({
  seriesId,
  instrumentId,
}) => {
  if (!instrumentId) {
    localStorage.removeItem('trading-helper:figure-lines');
    return;
  }

  let figureLines = getFigureLinesFromLocalStorage({});

  if (!seriesId) {
    figureLines = figureLines.filter(e => e.instrumentId === instrumentId);
  } else {
    figureLines = figureLines.filter(
      e => e.instrumentId === instrumentId && e.seriesId !== seriesId,
    );
  }

  localStorage.setItem('trading-helper:figure-lines', JSON.stringify(figureLines));
};

const getFinishDatePointFromLocalStorage = () => {
  return localStorage.getItem('trading-helper:finish-date-point');
};

const saveFinishDatePointToLocalStorage = (newDatePoint) => {
  localStorage.setItem('trading-helper:finish-date-point', newDatePoint.toString());
};

const clearFinishDatePointInLocalStorage = () => {
  localStorage.removeItem('trading-helper:finish-date-point');
};

const calculateReduceValue = (linePoints, period) => {
  const timeFirstCandle = linePoints[0].time;
  const timeSecondCandle = linePoints[1].time;

  let numberCandles = (timeSecondCandle - timeFirstCandle);

  switch (period) {
    case AVAILABLE_PERIODS.get('5m'): {
      numberCandles /= (5 * 60);
      break;
    }

    case AVAILABLE_PERIODS.get('1h'): {
      numberCandles /= (60 * 60);
      break;
    }

    case AVAILABLE_PERIODS.get('1d'): {
      numberCandles /= (24 * 60 * 60);
      break;
    }

    default: numberCandles = 0; break;
  }

  const differenceBetweenValues = Math.abs(linePoints[0].value - linePoints[1].value);
  return differenceBetweenValues / numberCandles;
};

const getCandlesData = async ({
  instrumentId,
  period,
  limit,
  startTime,
  endTime,
}) => {
  // console.log('start loading');

  const query = {
    instrumentId,
    isFirstCall: false,
  };

  if (startTime) {
    query.startTime = moment(startTime).toISOString();
  }

  if (endTime) {
    query.endTime = moment(endTime).toISOString();
  }

  if (limit) {
    query.limit = parseInt(limit, 10);
  }

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}`,
    query,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    isLoading = false;
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  // console.log('end loading');

  return resultGetCandles.result;
};
