/* global
functions, makeRequest, getUnix, getRandomNumber, getPrecision, formatNumberToPretty, toRGB, saveAs, uuidv4,
objects, user, moment, constants, moveTo, EActions, wsClient,
classes, LightweightCharts, ChartCandles, IndicatorVolume, IndicatorMovingAverage, IndicatorVolumeAverage, TradingOnline, TradingList,
*/

/* Constants */

const splitedPathname = location.pathname.split('/');
const PAGE_KEY = splitedPathname[splitedPathname.length - 1];
const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_INSTRUMENT_VOLUME_BOUNDS = '/api/instrument-volume-bounds';
const URL_GET_USER_FIGURE_LEVEL_BOUNDS = '/api/user-figure-level-bounds';
const URL_ADD_USER_FIGURE_LEVEL_BOUND = '/api/user-figure-level-bounds';
const URL_CHANGE_USER_FIGURE_LEVEL_BOUND = '/api/user-figure-level-bounds';

const AVAILABLE_PERIODS = new Map([
  ['5m', '5m'],
  ['1h', '1h'],
  ['1d', '1d'],
]);

const AVAILABLE_SORT_OPTIONS = new Map([
  ['name', 'name'],
  ['figureLevel', 'figureLevel'],
  ['priceChange_5m', 'priceChange_5m'],
  ['priceChange_1h', 'priceChange_1h'],
  ['priceChange_1d', 'priceChange_1d'],
]);

/* Variables */

let linePoints = [];
let isLoading = false;
let isSinglePeriod = false;
let choosedFigureShape = false;
let isActiveLineDrawing = false;
let isActiveLevelDrawing = false;
let isActiveCrosshairMoving = false;
let isActiveSearching = false;
let isActiveInstrumentChoosing = false;
let temporaryLineSeriesId;
let previousCrosshairMove;
let choosenInstrumentId;

let instrumentsDocs = [];
let userFigureLevelBounds = [];

let favoriteInstruments = [];
const lastViewedInstruments = [];
let choosenPeriods = [AVAILABLE_PERIODS.get('5m'), AVAILABLE_PERIODS.get('1h')];
let activePeriod = choosenPeriods[choosenPeriods.length - 1];

const windowHeight = window.innerHeight;

const settings = {
  chart: {
    limitCandlesPerChart: 1000,
  },

  figureLevels: {
    colorFor5mLevels: constants.DARK_BLUE_COLOR,
    colorFor1hLevels: constants.BLUE_COLOR,
    colorFor1dLevels: constants.GREEN_COLOR,
  },

  figureLines: {
    colorFor5mLines: constants.DARK_BLUE_COLOR,
    colorFor1hLines: constants.BLUE_COLOR,
    colorFor1dLines: constants.GREEN_COLOR,
  },

  movingAverage: {
    periodForShortMA: 20,
    periodForMediumMA: 50,
    periodForLongMA: 200,
    colorForShortMA: constants.DARK_BLUE_COLOR,
    colorForMediumMA: constants.BLUE_COLOR,
    colorForLongMA: constants.GREEN_COLOR,
  },
};

let choosenSortSettings = {
  type: AVAILABLE_SORT_OPTIONS.get('name'),
  isLong: true,
};

const trading = new TradingOnline();
const tradingList = new TradingList(PAGE_KEY);

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

wsClient.onmessage = async data => {
  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'futuresCandle5mData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('5m')); break;
      case 'futuresCandle1hData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('1h')); break;
      case 'spotCandle5mData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('5m')); break;
      case 'spitCandle1hData': updateLastCandle(parsedData.data, AVAILABLE_PERIODS.get('1h')); break;
      // case 'newInstrumentVolumeBound': addInstrumentVolumeBound(parsedData.data); break;
      // case 'deactivateInstrumentVolumeBound': removeInstrumentVolumeBound(parsedData.data); break;
      default: break;
    }
  }
};

/* JQuery */
const $settings = $('.settings');

const $trades = $('.trades');
const $chartsContainer = $('.charts-container');
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');
const $instrumentsHeadlines = $instrumentsContainer.find('.instruments-list .headlines');

$(document).ready(async () => {
  // start settings

  if (params.interval && AVAILABLE_PERIODS.get(params.interval)) {
    saveSettingsToLocalStorage({ choosenPeriods });
  }

  // trading.init();
  // tradingList.init(trading);

  wsClient.onopen = () => {
    wsClient.send(JSON.stringify({
      actionName: 'subscribe',
      data: {
        subscriptionsNames: [
          'newInstrumentVolumeBound',
          'deactivateInstrumentVolumeBound',
        ],
      },
    }));
  };

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  // loading data
  instrumentsDocs = await getActiveInstruments();
  userFigureLevelBounds = await getUserFigureLevelBounds();

  setStartSettings();

  // main logic
  renderListInstruments(instrumentsDocs);

  // don't touch
  const lastCandles = await getLastCandles();
  calculateFigureLevelsPercents(lastCandles);
  calculatePriceLeaders(activePeriod, lastCandles);
  sortListInstruments();

  $('.search input')
    .on('keyup', function () {
      isActiveSearching = true;
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
      isActiveSearching = false;
      const $instrument = elem.type ? $(this) : $(elem);
      const instrumentId = $instrument.data('instrumentid');

      if (choosenInstrumentId === instrumentId) {
        return true;
      }

      if (choosenInstrumentId) {
        fillLastViewedInstruments(choosenInstrumentId);
        clearInstrumentData({ instrumentId: choosenInstrumentId });
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');
      choosenInstrumentId = instrumentId;

      await reloadCharts(instrumentId);

      saveSettingsToLocalStorage({ choosenInstrumentId });
    })
    .on('click', '.instrument .name b', function () {
      const $instrument = $(this).closest('.instrument');
      const instrumentId = $instrument.data('instrumentid');

      toggleFavoriteInstruments(instrumentId);
    });

  $instrumentsHeadlines.find('span')
    .on('click', function () {
      const type = $(this).data('type');
      const result = changeSortSettings(type);

      if (result) {
        $(this).toggleClass('is_long');
        sortListInstruments();
      }
    });

  $trades.find('.clear-trades')
    .on('click', 'button.clear', () => tradingList.clear())
    .on('click', 'button.export', () => tradingList.export());
  /*
    .on('click', 'button.import', () => tradingList.import())
    .on('change', 'input.strategy', function () {
      const value = $(this).val();
      trading.filterTrades(value);
    });
  */

  $('#settings')
    .on('click', async () => {});

  $chartsContainer
    .on('click', '.chart-periods div', async function () {
      if (isLoading) {
        return true;
      }

      if (!choosenInstrumentId) {
        return true;
      }

      const period = $(this).data('period');

      if (isSinglePeriod) {
        if (choosenPeriods.length === 1 && choosenPeriods.includes(period)) {
          return true;
        }

        choosenPeriods = [period];
        $chartsContainer.find('.chart-periods div').removeClass('is_active');
        $(this).addClass('is_active');
      } else if (!choosenPeriods.includes(period)) {
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

      activePeriod = period;
      saveSettingsToLocalStorage({ choosenPeriods, activePeriod });

      choosenSortSettings.type = AVAILABLE_SORT_OPTIONS.get(`priceChange_${activePeriod}`);
      const lastCandles = await getLastCandles();
      calculateFigureLevelsPercents(lastCandles);
      calculatePriceLeaders(activePeriod, lastCandles);
      sortListInstruments();

      const instrumentId = choosenInstrumentId;
      await reloadCharts(instrumentId);
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

  /*
  trading.$tradingForm.find('.action-block button')
    .on('click', function () {
      const typeAction = $(this).parent().attr('class');
      trading.changeTypeAction(typeAction);

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
      const { originalData } = instrumentDoc[`chart_candles_${activePeriod}`];
      const firstCandle = originalData[originalData.length - 1];

      const result = trading.createTransaction(instrumentDoc, firstCandle, true);

      if (!result) {
        return false;
      }

      switch (result.action) {
        case EActions.get('transactionCreated'): {
          removeTemporaryStopLossSeries(instrumentDoc);
          transactionCreatedHandler(instrumentDoc, result);
          break;
        }

        case EActions.get('tradeCreated'): tradeCreatedHandler(instrumentDoc, result); break;
        case EActions.get('tradeFinished'): tradeFinishedHandler(instrumentDoc, result); break;
        case EActions.get('transactionFinished'): transactionFinishedHandler(instrumentDoc, result); break;

        default: {
          alert('Unknown action');
          return false;
        }
      }

      tradingList.setTransactions(trading.transactions);
    });
  */

  $(document)
    .on('keypress', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      if (e.keyCode === 27) {
        // ESC
        // trading.$tradingForm.removeClass('is_active');
        $instrumentsContainer.removeClass('is_active');
      }
    })
    .on('keydown', async e => {
      if (isActiveSearching) {
        return true;
      }

      // 1, 2, 3, 4, 5
      if ([49, 50, 51, 52, 53].includes(e.keyCode)) {
        // trading.changeNumberTrades(e.keyCode - 48);
      } else if (e.keyCode === 192) {
        // § (before 1)
        if (!choosenInstrumentId) {
          return true;
        }

        /*
        const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
        const limitOrders = trading.limitOrders.filter(o => o.instrumentId === choosenInstrumentId);

        if (!limitOrders.length) {
          return true;
        }

        choosenPeriods.forEach(period => {
          const chartCandles = instrumentDoc[`chart_candles_${period}`];

          limitOrders.forEach(limitOrder => {
            const targetSeries = chartCandles.extraSeries.find(s => s.id === limitOrder.id);
            targetSeries && chartCandles.removeSeries(targetSeries);
          });
        });

        limitOrders.forEach(limitOrder => trading.removeLimitOrder(limitOrder));
        */
      } else if (e.keyCode === 81) {
        // Q
        $chartsContainer.find(`.chart-periods .${AVAILABLE_PERIODS.get('5m')}`).click();
      } else if (e.keyCode === 87) {
        // W
        $chartsContainer.find(`.chart-periods .${AVAILABLE_PERIODS.get('1h')}`).click();
      } else if (e.keyCode === 69) {
        // E
        $chartsContainer.find(`.chart-periods .${AVAILABLE_PERIODS.get('1d')}`).click();
      } else if (e.keyCode === 68) {
        // D
        if (!choosenInstrumentId) {
          return true;
        }

        /*
        const activeTransaction = trading.getActiveTransaction(choosenInstrumentId);

        if (!activeTransaction) {
          return true;
        }

        const numberTrades = activeTransaction.trades.filter(t => t.isActive).length;

        if (numberTrades === 0) {
          return true;
        }

        const originalData = {
          isLong: trading.isLong,
          numberTrades: trading.numberTrades,
        };

        trading.numberTrades = numberTrades;
        trading.isLong = activeTransaction.isLong;

        if (trading.isLong) {
          trading.$tradingForm.find('.action-block .sell button').click();
        } else {
          trading.$tradingForm.find('.action-block .buy button').click();
        }

        trading.isLong = originalData.isLong;
        trading.numberTrades = originalData.numberTrades;
        */
      } else if (e.keyCode === 82) {
        // R
        if (choosenInstrumentId) {
          await reloadCharts(choosenInstrumentId);
        }
      } else if (e.keyCode === 189) {
        // todo: fix
        // -
        if (!choosenInstrumentId) {
          choosenInstrumentId = instrumentsDocs[0]._id;
        }

        const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

        let nextInstrumentDoc = instrumentsDocs[0];
        let nextIndex = instrumentDoc.index;

        for (let i = 1; i < 10; i += 1) {
          nextIndex += i;
          nextInstrumentDoc = instrumentsDocs.find(doc => doc.index === nextIndex);
          if (nextInstrumentDoc) break;
        }

        $instrumentsList.find(`#instrument-${nextInstrumentDoc._id}`).click();
      } else if (e.keyCode === 187) {
        // +
        if (!choosenInstrumentId) {
          choosenInstrumentId = instrumentsDocs[0]._id;
        }

        const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
        let nextInstrumentDoc = instrumentsDocs[0];
        let nextIndex = instrumentDoc.index;

        for (let i = 1; i < 10; i += 1) {
          nextIndex -= i;
          const tmpDoc = instrumentsDocs.find(doc => doc.index === nextIndex);

          if (tmpDoc) {
            nextInstrumentDoc = tmpDoc;
            break;
          }
        }

        $instrumentsList.find(`#instrument-${nextInstrumentDoc._id}`).click();
      } else if (e.keyCode === 67) {
        // C
        // trading.$tradingForm.find('.risks-block .sl button').click();
      } else if (e.keyCode === 77) {
        // M
        // trading.$tradingForm.find('.risks-block .stop-limit button').click();
      } else if (e.keyCode === 80) {
        // P
        // trading.$tradingForm.find('.action-block .buy button').click();
      } else if (e.keyCode === 219) {
        // [
        // trading.$tradingForm.find('.action-block .sell button').click();
      } else if (e.keyCode === 76) {
        // L
        $instrumentsContainer.toggleClass('is_active');
        isActiveInstrumentChoosing = $instrumentsContainer.hasClass('is_active');

        if (isActiveInstrumentChoosing) {
          const lastCandles = await getLastCandles();
          calculateFigureLevelsPercents(lastCandles);
          calculatePriceLeaders(activePeriod, lastCandles);
          sortListInstruments();
        }
      } else if (e.keyCode === 83) {
        // S
        isSinglePeriod = !isSinglePeriod;
        saveSettingsToLocalStorage({ isSinglePeriod });
      } else if (e.keyCode === 84) {
        // T
        if (!choosenInstrumentId) return;

        /*
        if (!trading.$tradingForm.hasClass('is_active')) {
          const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
          trading.loadInstrumentData(instrumentDoc);
        }

        trading.$tradingForm.toggleClass('is_active');
        */
      }

      if (choosedFigureShape) {
        if (e.keyCode === 8) {
          // <-
          const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

          if (choosedFigureShape.isFigureLevel) {
            const targetBound = userFigureLevelBounds.find(bound => bound._id === choosedFigureShape.seriesId);
            await changeUserFigureLevelBound(targetBound);
          } else if (choosedFigureShape.isFigureLine) {
            // removeFigureLinesFromLocalStorage();
          } else if (choosedFigureShape.isLimitOrder) {
            /*
            const limitOrder = trading.limitOrders.find(o => o.id === choosedFigureShape.seriesId);
            trading.removeLimitOrder(limitOrder);
            */
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

const reloadCharts = async (instrumentId) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
  document.title = `${instrumentDoc.name}...`;

  await loadCandles({ instrumentId }, choosenPeriods);

  loadCharts({ instrumentId });

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    $chartsContainer
      .find(`.period_${period} .percent-average`)
      .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);

    const prefix = instrumentDoc.is_futures ? 'futures' : 'spot';
    wsClient.send(JSON.stringify({
      actionName: 'subscribe',
      data: {
        subscriptionName: `${prefix}Candle${period}Data`,
        instrumentId: instrumentDoc._id,
      },
    }));
  });

  const figureLevelsData = userFigureLevelBounds.filter(bound => bound.instrument_id === instrumentId);
  drawFigureLevels({ instrumentId }, figureLevelsData.map(bound => ({
    seriesId: bound._id,
    time: getUnix(bound.level_start_candle_time),
    timeframe: bound.level_timeframe,
    value: bound.level_price,
  })));

  /*
  const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
  drawFigureLines({ instrumentId }, figureLinesData);

  const activeTransaction = trading.getActiveTransaction(choosenInstrumentId);
  activeTransaction && drawTrades({ instrumentId }, activeTransaction);

  const activeLimitOrders = trading.limitOrders.filter(o => o.instrumentId === choosenInstrumentId);
  activeLimitOrders.length && drawLimitOrders({ instrumentId }, activeLimitOrders);
  */

  /*
  const instrumentVolumeBounds = await getInstrumentVolumeBounds(instrumentId);
  drawInstrumentVolumeBounds({ instrumentId }, instrumentVolumeBounds.map(b => ({
    value: b.price,
    isAsk: b.is_ask,
    volumeStartedAt: b.volume_started_at,
    seriesId: (ChartCandles.getNewSeriesId() - b.price).toString().replace('.', ''),
  })));
  */

  document.title = instrumentDoc.name;
};

const clearInstrumentData = ({ instrumentId }) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  AVAILABLE_PERIODS.forEach(period => {
    instrumentDoc[`candles_data_${period}`] = [];
    instrumentDoc[`future_candles_data_${period}`] = [];

    instrumentDoc[`chart_candles_${period}`] = null;
    instrumentDoc[`indicator_volume_${period}`] = null;
    instrumentDoc[`indicator_volume_average_${period}`] = null;
    instrumentDoc[`indicator_moving_average_short_${period}`] = null;
    instrumentDoc[`indicator_moving_average_medium_${period}`] = null;
    instrumentDoc[`indicator_moving_average_long_${period}`] = null;
  });

  linePoints = [];
  choosedFigureShape = false;
  isActiveLineDrawing = false;
  isActiveLevelDrawing = false;
  temporaryLineSeriesId = false;

  // trading.$tradingForm.removeClass('is_active');
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
    };

    const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
    instrumentDoc[`candles_data_${period}`] = await getCandlesData(getCandlesOptions);
  }
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
          <p class="values">СРЕД<span class="percent-average">0%</span><span class="percent-level">0%</span></p>
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

    const indicatorMovingAverageLong = new IndicatorMovingAverage(chartCandles.chart, {
      color: settings.movingAverage.colorForLongMA,
      period: settings.movingAverage.periodForLongMA,
    });

    const indicatorVolume = new IndicatorVolume($rootContainer);
    const indicatorVolumeAverage = new IndicatorVolumeAverage(indicatorVolume.chart, { period });

    chartCandles.key = 'futures';
    instrumentDoc[`chart_candles_${period}`] = chartCandles;
    instrumentDoc[`indicator_volume_${period}`] = indicatorVolume;
    instrumentDoc[`indicator_volume_average_${period}`] = indicatorVolumeAverage;
    instrumentDoc[`indicator_moving_average_short_${period}`] = indicatorMovingAverageShort;
    instrumentDoc[`indicator_moving_average_medium_${period}`] = indicatorMovingAverageMedium;
    instrumentDoc[`indicator_moving_average_long_${period}`] = indicatorMovingAverageLong;

    chartCandles.setOriginalData(instrumentDoc[`candles_data_${period}`], false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    indicatorVolume.drawSeries(indicatorVolume.mainSeries, chartCandles.originalData.map(e => ({
      value: e.volume,
      time: e.time,
    })));

    let calculatedData;

    calculatedData = indicatorVolumeAverage.calculateAndDraw(chartCandles.originalData);
    indicatorVolumeAverage.calculatedData = calculatedData;

    calculatedData = indicatorMovingAverageShort.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageShort.calculatedData = calculatedData;

    calculatedData = indicatorMovingAverageMedium.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageMedium.calculatedData = calculatedData;

    calculatedData = indicatorMovingAverageLong.calculateAndDraw(chartCandles.originalData);
    indicatorMovingAverageLong.calculatedData = calculatedData;

    chartCandles.chart.subscribeClick(param => {
      isActiveSearching = false;
      activePeriod = chartCandles.period;
      const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
      let paramTime = param.time;

      if (param.time && chartCandles.period === AVAILABLE_PERIODS.get('1d')) {
        paramTime = moment({ ...param.time, month: param.time.month - 1 }).unix() + 7200;
      }

      if (param.time && chartCandles.extraSeries.length) {
        let existedSeries = chartCandles.extraSeries.find(
          series => series.time === paramTime,
        );

        if (!existedSeries) {
          const priceMarkup = ((coordinateToPrice / 100) * 3);

          existedSeries = chartCandles.extraSeries.find(series => {
            return (coordinateToPrice < series.value + priceMarkup)
              && (coordinateToPrice > series.value - priceMarkup);
          });
        }

        if (existedSeries) {
          choosedFigureShape = {
            instrumentId,
            seriesId: existedSeries.id,
            isFigureLine: existedSeries.isFigureLine,
            isFigureLevel: existedSeries.isFigureLevel,
            isLimitOrder: existedSeries.isLimitOrder,
            time: paramTime,
          };
        }
      }

      if (isActiveLineDrawing) {
        linePoints.push({
          value: coordinateToPrice,
          time: paramTime,
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

        createUserFigureLevelBound({
          instrumentId,

          levelPrice: coordinateToPrice,
          levelTimeframe: chartCandles.period,
          levelStartCandleTime: moment.unix(paramTime),
        }).then(res => {
          choosedFigureShape = {
            seriesId: res._id,
            instrumentId,
            time: paramTime,
            isFigureLevel: true,
          };
        });
      }

      /*
      if (trading.isActiveStopLossChoice) {
        trading.calculateStopLossPercent({
          stopLossPrice: coordinateToPrice,
          instrumentPrice: chartCandles.getInstrumentPrice(),
        });

        const activeTransaction = trading.getActiveTransaction(instrumentId);

        if (activeTransaction) {
          resetTransactionStopLossPrice(activeTransaction, {
            stopLossPercent: trading.stopLossPercent,
          });
        } else {
          createTemporaryStopLossSeries(instrumentDoc, {
            price: coordinateToPrice,
          });
        }

        trading.isActiveStopLossChoice = false;
      }

      if (trading.isActiveLimitOrderChoice) {
        let stopLossPrice = 0;
        const instrumentPrice = chartCandles.getInstrumentPrice();

        if (!trading.getActiveTransaction(instrumentId)) {
          const temporaryStopLossSeries = chartCandles.extraSeries.find(s => s.id === 'stoploss-temporary');

          if (!temporaryStopLossSeries) {
            stopLossPrice = trading.calculateStopLossPrice({
              instrumentPrice: coordinateToPrice,
              stopLossPercent: this.stopLossPercent,
              isLong: instrumentPrice < coordinateToPrice,
            });
          } else {
            stopLossPrice = temporaryStopLossSeries.value;
          }
        }

        const limitOrder = trading.createLimitOrder(instrumentDoc, {
          stopLossPrice,
          instrumentPrice,
          limitPrice: coordinateToPrice,
          numberTrades: trading.numberTrades,
        });

        drawLimitOrders({ instrumentId }, [limitOrder]);

        choosedFigureShape = {
          instrumentId,
          isLimitOrder: true,
          seriesId: limitOrder.id,
        };

        trading.isActiveLimitOrderChoice = false;
      }
      */
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
      let paramTime = param.time;

      if (param.time && chartCandles.period === AVAILABLE_PERIODS.get('1d')) {
        paramTime = moment({ ...param.time, month: param.time.month - 1 }).unix() + 7200;
      }

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
          const difference = Math.abs(price.close - price.open);
          const percentPerPrice = 100 / (price.open / difference);

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
              pointTime = moment.unix(param.time).utc().startOf('day').format();
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
          && activePeriod === chartCandles.period
          && linePoints.length === 1
          && (!previousCrosshairMove || previousCrosshairMove !== paramTime)) {
          previousCrosshairMove = paramTime;

          if (temporaryLineSeriesId) {
            const series = chartCandles.extraSeries.find(s => s.id === temporaryLineSeriesId);
            series && chartCandles.removeSeries(series, false);
          }

          const time = paramTime;
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
      if (chartCandles.period !== AVAILABLE_PERIODS.get('1d')) {
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

    if (chartCandles.period !== AVAILABLE_PERIODS.get('1d')) {
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

            chartCandles.extraSeries.forEach(s => {
              if (s.isFigureLine || s.isFigureLevel) {
                chartCandles.removeSeries(s, false);
              }
            });

            const figureLevelsData = userFigureLevelBounds.filter(bound => bound.instrument_id === instrumentId);
            drawFigureLevels({ instrumentId }, figureLevelsData.map(bound => ({
              seriesId: bound._id,
              time: getUnix(bound.level_start_candle_time),
              timeframe: bound.level_timeframe,
              value: bound.level_price,
            })));

            /*
            const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
            drawFigureLines({ instrumentId }, figureLinesData);
            */

            isLoading = false;
            isStartedLoad = false;
          }
        });
    }
  });
};

const fillLastViewedInstruments = (instrumentId) => {
  lastViewedInstruments.unshift(instrumentId);

  if (lastViewedInstruments.length === 10) {
    lastViewedInstruments.pop();
  }

  const rgb = toRGB(constants.GREEN_COLOR);
  const rgbColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .1)`;

  lastViewedInstruments.forEach(instrumentId => {
    const $instrument = $(`#instrument-${instrumentId}`);
    $instrument.css('background-color', rgbColor);
  });
};

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs
    .forEach(doc => {
      const isFavorite = favoriteInstruments.includes(doc._id) ? 'is_favorite' : '';

      appendInstrumentsStr += `<div
        id="instrument-${doc._id}"
        class="instrument ${isFavorite}"
        data-instrumentid=${doc._id}
      >
        <span class="${AVAILABLE_SORT_OPTIONS.get('name')}"><b></b>${doc.name}</span>
        <span class="${AVAILABLE_SORT_OPTIONS.get('priceChange_5m')}">0%</span>
        <span class="${AVAILABLE_SORT_OPTIONS.get('priceChange_1h')}">0%</span>
        <span class="${AVAILABLE_SORT_OPTIONS.get('priceChange_1d')}">0%</span>
        <span class="${AVAILABLE_SORT_OPTIONS.get('figureLevel')}">0%</span>
      </div>`;
    });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const changeSortSettings = (type) => {
  if (type.includes('priceChange_')) {
    const timeframe = type.split('_')[1];
    if (timeframe !== activePeriod) {
      return false;
    }
  }

  if (!AVAILABLE_SORT_OPTIONS.get(type)) {
    alert('Unknown type');
    return false;
  }

  choosenSortSettings.type = type;
  choosenSortSettings.isLong = !choosenSortSettings.isLong;

  saveSettingsToLocalStorage({ choosenSortSettings });
  return true;
};

const getActiveInstruments = async () => {
  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: { isOnlyFutures: true },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return [];
  }

  return resultGetInstruments.result;
};

const getUserFigureLevelBounds = async () => {
  const resultGetLevels = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_FIGURE_LEVEL_BOUNDS,
    query: {
      userId: user._id,
      isActive: true,
    },
  });

  if (!resultGetLevels || !resultGetLevels.status) {
    alert(resultGetLevels.message || 'Cant makeRequest URL_GET_USER_LEVEL_BOUNDS');
    return [];
  }

  return resultGetLevels.result;
};

const createUserFigureLevelBound = async ({
  instrumentId,

  levelPrice,
  levelTimeframe,
  levelStartCandleTime,
}) => {
  const resultAddBound = await makeRequest({
    method: 'POST',
    url: URL_ADD_USER_FIGURE_LEVEL_BOUND,
    body: {
      instrumentId,
      isModerated: true,

      levelPrice,
      levelTimeframe,
      levelStartCandleTime,
    },
  });

  if (!resultAddBound || !resultAddBound.status) {
    alert(resultAddBound.message || 'Cant makeRequest URL_ADD_USER_FIGURE_LEVEL_BOUND');
    return false;
  }

  const bound = resultAddBound.result;
  userFigureLevelBounds.push(bound);

  drawFigureLevels({ instrumentId }, [{
    seriesId: bound._id,
    time: getUnix(bound.level_start_candle_time),
    timeframe: bound.level_timeframe,
    value: bound.level_price,
  }]);

  return resultAddBound.result;
};

const changeUserFigureLevelBound = async (userFigureLevelBound) => {
  const resultChangeBound = await makeRequest({
    method: 'PUT',
    url: `${URL_CHANGE_USER_FIGURE_LEVEL_BOUND}/${userFigureLevelBound._id}`,
    body: {
      isActive: false,
    },
  });

  if (!resultChangeBound || !resultChangeBound.status) {
    alert(resultChangeBound.message || 'Cant makeRequest URL_CHANGE_USER_FIGURE_LEVEL_BOUND');
    return false;
  }

  userFigureLevelBounds = userFigureLevelBounds.filter(bound => bound._id !== userFigureLevelBound._id);
  return resultChangeBound.result;
};

/*
const transactionCreatedHandler = (instrumentDoc, { transaction }) => {
  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const transactionSeries = TradingDemo.createTransactionChartSeries(chartCandles, transaction);
    const stopLossSeries = TradingDemo.createStopLossChartSeries(chartCandles, transaction);
    const takeProfitSeries = transaction.trades
      .map(trade => TradingDemo.createTakeProfitChartSeries(chartCandles, transaction, trade));

    const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
    const validTime = ChartCandles.getValidTime(lastCandle.originalTimeUnix, period);

    [transactionSeries, stopLossSeries, ...takeProfitSeries].forEach(
      series => chartCandles.drawSeries(series, [{ value: series.price, time: validTime }]),
    );
  });

  tradingList.addTradesToTradeList(transaction, transaction.trades);
};

const tradeCreatedHandler = (instrumentDoc, { transaction, changes }) => {
  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
    const validTime = ChartCandles.getValidTime(lastCandle.originalTimeUnix, period);

    chartCandles.extraSeries
      .filter(s => s.isTrade && s.id.toString().includes(transaction.id))
      .forEach(series => chartCandles.removeSeries(series));

    const transactionSeries = TradingDemo.createTransactionChartSeries(chartCandles, transaction);
    const stopLossSeries = TradingDemo.createStopLossChartSeries(chartCandles, transaction);
    const takeProfitSeries = transaction.trades
      .filter(trade => trade.isActive)
      .map(trade => TradingDemo.createTakeProfitChartSeries(chartCandles, transaction, trade));

    [transactionSeries, stopLossSeries, ...takeProfitSeries].forEach(series => {
      const values = [{
        value: series.price,
        time: ChartCandles.getValidTime(series.time, period),
      }];

      if (series.time !== validTime) {
        values.push({ value: series.price, time: validTime });
      }

      chartCandles.drawSeries(series, values);
    });
  });

  tradingList.addTradesToTradeList(transaction, changes);
};

const tradeFinishedHandler = (instrumentDoc, { transaction, changes }) => {
  const values = transaction.trades
    .filter(trade => !trade.isActive)
    .map(trade => trade.takeProfitPrice);

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const targetTakeProfitSeries = chartCandles.extraSeries
      .filter(s => s.isTrade && s.id.includes('takeprofit') && values.includes(s.price));

    targetTakeProfitSeries.forEach(tS => {
      tS.applyOptions({
        lineType: LightweightCharts.LineType.Simple,
        lineStyle: LightweightCharts.LineStyle.LargeDashed,
      });

      chartCandles.extraSeries = chartCandles.extraSeries
        .filter(s => s.id !== tS.id && s.price !== tS.price);
    });

    chartCandles.extraSeries
      .filter(s => s.isTrade && s.id.toString().includes(transaction.id))
      .filter(s => s.id.toString().includes('stoploss') || s.id.toString().includes('transaction'))
      .forEach(series => chartCandles.removeSeries(series));

    const transactionSeries = TradingDemo.createTransactionChartSeries(chartCandles, transaction);
    const stopLossSeries = TradingDemo.createStopLossChartSeries(chartCandles, transaction);
    const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
    const validTime = ChartCandles.getValidTime(lastCandle.originalTimeUnix, period);

    [transactionSeries, stopLossSeries].forEach(series => {
      const values = [{
        value: series.price,
        time: ChartCandles.getValidTime(series.time, period),
      }];

      if (series.time !== validTime) {
        values.push({ value: series.price, time: validTime });
      }

      chartCandles.drawSeries(series, values);
    });
  });

  tradingList.updateTradesInTradeList(transaction, changes);
};

const transactionFinishedHandler = (instrumentDoc, { transaction, changes }) => {
  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    chartCandles.extraSeries
      .filter(s => s.isTrade && s.id.toString().includes(transaction.id))
      .forEach(tS => {
        tS.applyOptions({
          lineType: LightweightCharts.LineType.Simple,
          lineStyle: LightweightCharts.LineStyle.LargeDashed,
        });
      });

    chartCandles.extraSeries = chartCandles.extraSeries
      .filter(s => !s.id.toString().includes(transaction.id));
  });

  tradingList.updateTradesInTradeList(transaction, changes);
  tradingList.updateCommonStatistics();
};
*/

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
          e.time = moment.unix(e.time).utc().startOf(startOfEntity).unix();
        });
      });
    }

    const firstCandleTime = candlesData[0].originalTimeUnix;

    figureLinesData.forEach(figureLine => {
      let color = settings.figureLines.colorFor5mLines;

      if (figureLine.linePoints[0].time < firstCandleTime) {
        figureLine.linePoints[0].time = firstCandleTime;
      }

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

    const firstCandleTime = candlesData[0].originalTimeUnix;

    figureLevelsData.forEach(({
      seriesId, time, value, timeframe,
    }) => {
      let color = settings.figureLevels.colorFor5mLevels;

      switch (timeframe) {
        case AVAILABLE_PERIODS.get('5m'): {
          if (period !== AVAILABLE_PERIODS.get('5m')) {
            time -= time % (period === AVAILABLE_PERIODS.get('1h') ? 3600 : 86400);
          }

          break;
        }

        case AVAILABLE_PERIODS.get('1h'): {
          if (period === AVAILABLE_PERIODS.get('1d')) {
            time -= time % 86400;
          }

          color = settings.figureLevels.colorFor1hLevels;
          break;
        }

        case AVAILABLE_PERIODS.get('1d'): color = settings.figureLevels.colorFor1dLevels; break;
        default: alert(`Unknown timeframe - ${timeframe}`); break;
      }

      if (time < firstCandleTime) {
        time = firstCandleTime;
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

const drawInstrumentVolumeBounds = ({ instrumentId }, data = []) => {
  if (!data.length) return;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  choosenPeriods.forEach(period => {
    if (period !== AVAILABLE_PERIODS.get('5m')) {
      return;
    }

    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const candlesData = chartCandles.originalData;
    const lCandles = candlesData.length;

    if (!lCandles) return;

    if (period !== AVAILABLE_PERIODS.get('5m')) {
      const startOfEntity = period === AVAILABLE_PERIODS.get('1h') ? 'hour' : 'day';

      data.forEach(d => {
        d.volumeStartedAt = moment.unix(d.volumeStartedAt).utc().startOf(startOfEntity).unix();
      });
    } else {
      const coeff = 5 * 60 * 1000;

      data.forEach(d => {
        const ms = getUnix(d.volumeStartedAt) * 1000;
        d.volumeStartedAt = ((Math.ceil(ms / coeff) * coeff) / 1000) - 300;
      });
    }

    const firstCandleTime = candlesData[0].originalTimeUnix;
    data = data.filter(d => d.volumeStartedAt >= firstCandleTime);

    data.forEach(({
      seriesId, volumeStartedAt, value, isAsk,
    }) => {
      const color = isAsk
        ? settings.instrumentVolumes.isAskColor
        : settings.instrumentVolumes.isBidColor;

      const newSeries = chartCandles.addExtraSeries({
        color,
        lineStyle: 0,
        lastValueVisible: false,
      }, {
        value,
        id: seriesId,
        time: volumeStartedAt,
        isInstrumentVolume: true,
      });

      chartCandles.drawSeries(
        newSeries,
        [{
          value,
          time: volumeStartedAt,
        }, {
          value,
          time: candlesData[lCandles - 1].originalTimeUnix,
        }],
      );
    });
  });
};

/*
const drawTrades = ({ instrumentId }, transaction, periods = []) => {
  if (!periods.length) {
    periods = choosenPeriods;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  periods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const transactionSeries = TradingDemo.createTransactionChartSeries(chartCandles, transaction);
    const stopLossSeries = TradingDemo.createStopLossChartSeries(chartCandles, transaction);
    const takeProfitSeries = transaction.trades
      .map(trade => TradingDemo.createTakeProfitChartSeries(chartCandles, transaction, trade));

    const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
    const validTime = ChartCandles.getValidTime(lastCandle.originalTimeUnix, period);

    [transactionSeries, stopLossSeries, ...takeProfitSeries].forEach(series => {
      const values = [{
        value: series.price,
        time: ChartCandles.getValidTime(series.time, period),
      }];

      if (series.time !== validTime) {
        values.push({ value: series.price, time: validTime });
      }

      chartCandles.drawSeries(series, values);
    });
  });
};

const drawLimitOrders = ({ instrumentId }, limitOrders = []) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  limitOrders.forEach(limitOrder => {
    choosenPeriods.forEach(period => {
      const chartCandles = instrumentDoc[`chart_candles_${period}`];

      const newSeries = TradingDemo.createLimitOrderChartSeries(chartCandles, limitOrder);
      const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
      const prevCandle = chartCandles.originalData[chartCandles.originalData.length - 20];

      chartCandles.drawSeries(newSeries, [{
        value: limitOrder.limitPrice,
        time: ChartCandles.getValidTime(prevCandle.originalTimeUnix, period),
      }, {
        value: limitOrder.limitPrice,
        time: ChartCandles.getValidTime(lastCandle.originalTimeUnix, period),
      }]);
    });
  });
};
*/

const updateLastCandle = (data, period) => {
  if (data.instrumentId !== choosenInstrumentId
    || !choosenPeriods.includes(period)) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === data.instrumentId);

  const chartCandles = instrumentDoc[`chart_candles_${period}`];
  const indicatorVolume = instrumentDoc[`indicator_volume_${period}`];
  const indicatorVolumeAverage = instrumentDoc[`indicator_volume_average_${period}`];
  const indicatorMovingAverageShort = instrumentDoc[`indicator_moving_average_short_${period}`];
  const indicatorMovingAverageMedium = instrumentDoc[`indicator_moving_average_medium_${period}`];
  const indicatorMovingAverageLong = instrumentDoc[`indicator_moving_average_long_${period}`];

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

  instrumentDoc.price = close;

  const preparedData = chartCandles.prepareNewData([{
    time: startTime,
    data: [open, close, low, high],
    volume,
  }], false)[0];

  let { isDrawn } = candlesData[lCandles - 1];

  if (!isClosed) {
    candlesData[lCandles - 1] = {
      ...preparedData,
      isDrawn: true,
    };
  } else {
    isDrawn = false;
    candlesData.push({
      ...preparedData,
      isDrawn: false,
    });

    lCandles += 1;
  }

  chartCandles.drawSeries(chartCandles.mainSeries, preparedData);

  indicatorVolume.drawSeries(indicatorVolume.mainSeries, {
    value: preparedData.volume,
    time: preparedData.originalTimeUnix,
  });

  if (isClosed) {
    // trading.nextTick(instrumentDoc, preparedData, choosenPeriods, false);

    let calculatedData;
    const targetCandlesPeriod = candlesData.slice(
      lCandles - (settings.periodForLongMA * 2), lCandles,
    );

    calculatedData = indicatorVolumeAverage.calculateData(targetCandlesPeriod);

    indicatorVolumeAverage.drawSeries(
      indicatorVolumeAverage.mainSeries,
      calculatedData[calculatedData.length - 1],
    );

    calculatedData = indicatorMovingAverageShort.calculateData(targetCandlesPeriod);

    indicatorMovingAverageShort.drawSeries(
      indicatorMovingAverageShort.mainSeries,
      calculatedData[calculatedData.length - 1],
    );

    calculatedData = indicatorMovingAverageMedium.calculateData(targetCandlesPeriod);

    indicatorMovingAverageMedium.drawSeries(
      indicatorMovingAverageMedium.mainSeries,
      calculatedData[calculatedData.length - 1],
    );

    calculatedData = indicatorMovingAverageLong.calculateData(targetCandlesPeriod);

    indicatorMovingAverageLong.drawSeries(
      indicatorMovingAverageLong.mainSeries,
      calculatedData[calculatedData.length - 1],
    );

    if (instrumentDoc.name === 'BTCUSDTPERP') {
      setTimeout(async () => {
        const lastCandles = await getLastCandles();
        calculateFigureLevelsPercents(lastCandles);
        calculatePriceLeaders(activePeriod, lastCandles);
        sortListInstruments();
      }, 10000);
    }
  }

  if (!isDrawn) {
    const figureLevelsExtraSeries = chartCandles.extraSeries.filter(s => s.isFigureLevel);
    const figureLinesExtraSeries = chartCandles.extraSeries.filter(
      s => s.isFigureLine && s.isActive && s.timeframe === period,
    );
    const instrumentVolumeExtraSeries = chartCandles.extraSeries.filter(s => s.isInstrumentVolume);

    figureLinesExtraSeries.forEach(s => {
      s.linePoints[1].value += s.isLong ? s.reduceValue : -s.reduceValue;
      s.linePoints[1].time = preparedData.originalTimeUnix;
      chartCandles.drawSeries(s, s.linePoints);
    });

    figureLevelsExtraSeries.forEach(s => {
      chartCandles.drawSeries(s, {
        value: s.value,
        time: preparedData.originalTimeUnix,
      });
    });

    instrumentVolumeExtraSeries.forEach(s => {
      chartCandles.drawSeries(s, {
        value: s.value,
        time: preparedData.originalTimeUnix,
      });
    });

    if (choosenInstrumentId) {
      /*
      const activeTrade = trading.trades
        .find(t => t.isActive && t.instrumentId === choosenInstrumentId);

      if (activeTrade) {
        const targetSeries = chartCandles.extraSeries.filter(
          s => s.isTrade && s.id.includes(activeTrade.id),
        );

        let validTime = preparedData.originalTimeUnix;

        if (period === AVAILABLE_PERIODS.get('1h')) {
          validTime -= validTime % 3600;
        } else if (period === AVAILABLE_PERIODS.get('1d')) {
          validTime -= validTime % 86400;
        }

        targetSeries.forEach(s => {
          chartCandles.drawSeries(s, {
            value: s.value,
            time: validTime,
          });
        });
      }
      */
    }
  }
};

const toggleFavoriteInstruments = (instrumentId) => {
  const isIncluded = favoriteInstruments.includes(instrumentId);

  if (isIncluded) {
    favoriteInstruments = favoriteInstruments.filter(id => id !== instrumentId);
  } else {
    favoriteInstruments.push(instrumentId);
  }

  saveSettingsToLocalStorage({ favoriteInstruments });
  $(`#instrument-${instrumentId}`).toggleClass('is_favorite');
};

// todo: move to separated service
const getSettingsFromLocalStorage = () => {
  const settings = localStorage.getItem(`trading-helper:${PAGE_KEY}:settings`);
  return settings ? JSON.parse(settings) : {};
};

const saveSettingsToLocalStorage = (changes = {}) => {
  const currentSettings = getSettingsFromLocalStorage();

  const newSettings = {
    ...currentSettings,
    ...changes,
  };

  localStorage.setItem(`trading-helper:${PAGE_KEY}:settings`, JSON.stringify(newSettings));
};

const setStartSettings = () => {
  const settings = getSettingsFromLocalStorage();

  if (settings.choosenPeriods && settings.choosenPeriods.length) {
    choosenPeriods = settings.choosenPeriods;
  }

  if (settings.choosenInstrumentId && !params.symbol) {
    const interval = setInterval(() => {
      if (instrumentsDocs.length) {
        $._data($($instrumentsList)
          .get(0), 'events').click[0]
          .handler(`#instrument-${settings.choosenInstrumentId}`);

        clearInterval(interval);
      }
    }, 1000);
  }

  if (settings.activePeriod) {
    activePeriod = settings.activePeriod;
  }

  if (settings.isSinglePeriod !== undefined) {
    isSinglePeriod = settings.isSinglePeriod;
  }

  if (settings.choosenSortSettings) {
    choosenSortSettings = settings.choosenSortSettings;

    if (choosenSortSettings.isLong) {
      $instrumentsHeadlines.find(`span[data-type=${choosenSortSettings.type}]`).addClass('is_long');
    }
  }

  if (settings.favoriteInstruments && settings.favoriteInstruments.length) {
    favoriteInstruments = settings.favoriteInstruments;
  }
};

const getInstrumentVolumeBounds = async (instrumentId) => {
  const query = {
    instrumentId,
    isOnlyActive: true,
  };

  const resultGetBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_INSTRUMENT_VOLUME_BOUNDS,
    query,
  });

  if (!resultGetBounds || !resultGetBounds.status) {
    alert(resultGetBounds.message || 'Cant makeRequest URL_GET_INSTRUMENT_VOLUME_BOUNDS');
    return false;
  }

  // console.log('finished');

  return resultGetBounds.result;
};

const addInstrumentVolumeBound = ({
  price: value,
  is_ask: isAsk,
  instrument_id: instrumentId,
  created_at: volumeStartedAt,
}) => {
  if (instrumentId !== choosenInstrumentId) {
    return true;
  }

  drawInstrumentVolumeBounds({ instrumentId }, [{
    value,
    isAsk,
    volumeStartedAt,
    seriesId: (ChartCandles.getNewSeriesId() - value).toString().replace('.', ''),
  }]);
};

const removeInstrumentVolumeBound = ({
  price: value,
  instrument_id: instrumentId,
}) => {
  if (instrumentId !== choosenInstrumentId) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const targetSeries = chartCandles.extraSeries.find(
      s => s.isInstrumentVolume && s.value === value,
    );

    if (targetSeries) {
      chartCandles.removeSeries(targetSeries, false);
    }
  });
};

const calculateFigureLevelsPercents = (lastCandles = []) => {
  if (!lastCandles || !lastCandles.length) {
    return;
  }

  const figureLevels = userFigureLevelBounds.map(bound => ({
    instrumentId: bound.instrument_id,
    isLong: bound.is_long,
    value: bound.level_price,
  }));

  if (!figureLevels.length) {
    return;
  }

  instrumentsDocs.forEach(doc => {
    const instrumentCandle = lastCandles.find(c => c.instrument_id === doc._id);

    if (!instrumentCandle) {
      doc.figureLevel = {
        percent: 0,
        isLong: true,
        isActive: false,
      };

      return true;
    }

    doc.price = instrumentCandle.data[1];
    delete doc.figureLevel;
    const instrumentFigureLevels = figureLevels.filter(l => l.instrumentId === doc._id);

    if (!instrumentFigureLevels.length) {
      doc.figureLevel = {
        percent: 0,
        isLong: true,
        isActive: false,
      };

      return true;
    }

    instrumentFigureLevels.forEach(figureLevel => {
      const difference = Math.abs(doc.price - figureLevel.value);
      const percentPerPrice = 100 / (doc.price / difference);
      const isCrossed = ((figureLevel.isLong && doc.price > figureLevel.value)
        || (!figureLevel.isLong && doc.price < figureLevel.value));

      if (doc.figureLevel === undefined
        || percentPerPrice < doc.figureLevel.percent) {
        doc.figureLevel = {
          percent: percentPerPrice,
          isCrossed,
          isLong: figureLevel.isLong,
          isActive: true,
        };
      }
    });

    if (doc.figureLevel.isCrossed) {
      const percent = doc.figureLevel.percent;
      doc.figureLevel.percent = -percent;
    }

    const $instrument = $(`#instrument-${doc._id}`);
    const percent = doc.figureLevel.percent.toFixed(1);

    $instrument
      .find('.figureLevel')
      .attr('class', `figureLevel ${doc.figureLevel.isLong ? 'is_long' : 'is_short'}`)
      .text(`${percent}%`);

    if (doc._id === choosenInstrumentId) {
      $chartsContainer.find('.percent-level').text(`${percent}%`);
    }
  });
};

const calculatePriceLeaders = (period, lastCandles = []) => {
  if (!lastCandles || !lastCandles.length) {
    return;
  }

  instrumentsDocs.forEach(doc => {
    const candle = lastCandles.find(c => c.instrument_id === doc._id);

    if (!candle) {
      doc[`priceChange_${period}`] = {
        percent: 0,
        isLong: true,
        isActive: false,
      };

      return true;
    }

    const [open, close] = candle.data;
    const difference = close - open;
    const percentPerOpen = 100 / (open / difference);

    const isLong = difference >= 0;
    const percent = parseFloat(percentPerOpen.toFixed(1));

    doc[`priceChange_${period}`] = {
      percent,
      isLong,
      isActive: true,
    };

    const $instrument = $(`#instrument-${doc._id}`);

    $instrument
      .find(`.priceChange_${period}`)
      .attr('class', `priceChange_${period} ${isLong ? 'is_long' : 'is_short'}`)
      .text(`${percent}%`);
  });
};

const sortListInstruments = () => {
  const key = choosenSortSettings.type;
  let sortedInstruments = instrumentsDocs;

  if (key === AVAILABLE_SORT_OPTIONS.get('name')) {
    sortedInstruments = instrumentsDocs
      .sort((a, b) => {
        return favoriteInstruments.includes(b._id) ? 1 : -1;
      });
  } else {
    sortedInstruments = instrumentsDocs
      .sort((a, b) => {
        if (!a[key] || !b[key]) return 0;

        if (choosenSortSettings.isLong) {
          return a[key].percent < b[key].percent ? -1 : 1;
        }

        return a[key].percent < b[key].percent ? 1 : -1;
      });
  }

  sortedInstruments.forEach((doc, index) => {
    if (!doc[key] || !doc[key].isActive) {
      index = 9999 + index;
    }

    const $instrument = $(`#instrument-${doc._id}`);
    $instrument.css('order', index);
    doc.index = index;
  });
};

const createTemporaryStopLossSeries = (instrumentDoc, {
  price,
}) => {
  removeTemporaryStopLossSeries(instrumentDoc);

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    const newSeries = chartCandles.addExtraSeries({
      color: constants.RED_COLOR,
      lastValueVisible: false,
    }, {
      id: 'stoploss-temporary',
      value: price,
    });

    const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
    const prevCandle = chartCandles.originalData[chartCandles.originalData.length - 20];

    chartCandles.drawSeries(newSeries, [{
      value: price,
      time: ChartCandles.getValidTime(prevCandle.originalTimeUnix, period),
    }, {
      value: price,
      time: ChartCandles.getValidTime(lastCandle.originalTimeUnix, period),
    }]);
  });
};

const removeTemporaryStopLossSeries = (instrumentDoc) => {
  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];
    const targetSeries = chartCandles.extraSeries.find(s => s.id === 'stoploss-temporary');
    targetSeries && chartCandles.removeSeries(targetSeries);
  });
};

/*
const resetTransactionStopLossPrice = (transaction, {
  stopLossPercent,
}) => {
  if (!transaction.isActive) {
    return false;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === transaction.instrumentId);
  const instrumentPrice = instrumentDoc.price;

  const tickSizePrecision = TradingDemo.getPrecision(instrumentDoc.tick_size); // 0.001
  const newStopLossPrice = parseFloat(trading.calculateStopLossPrice({
    instrumentPrice,
    stopLossPercent,
    isLong: transaction.isLong,
  }).toFixed(tickSizePrecision));

  if ((transaction.isLong && newStopLossPrice < transaction.stopLossPrice)
    || (!transaction.isLong && newStopLossPrice > transaction.stopLossPrice)) {
    alert('It\'s not allowed to set stopLossPercent greater than previous one');
    return true;
  }

  transaction.stopLossPercent = stopLossPercent;
  transaction.stopLossPrice = newStopLossPrice;

  tradingList.setTransactions(trading.transactions);

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    const targetSeries = chartCandles.extraSeries
      .find(s => s.id.toString().includes(`stoploss-${transaction.id}`));
    targetSeries && chartCandles.removeSeries(targetSeries);

    const lastCandle = chartCandles.originalData[chartCandles.originalData.length - 1];
    const validTime = ChartCandles.getValidTime(lastCandle.originalTimeUnix, period);
    const stopLossSeries = TradingDemo.createStopLossChartSeries(chartCandles, transaction);

    const values = [{
      value: stopLossSeries.price,
      time: ChartCandles.getValidTime(stopLossSeries.time, period),
    }];

    if (stopLossSeries.time !== validTime) {
      values.push({ value: stopLossSeries.price, time: validTime });
    }

    chartCandles.drawSeries(stopLossSeries, values);
  });
};
*/

const getLastCandles = async () => {
  let startTimeUnix = getUnix();

  switch (activePeriod) {
    case AVAILABLE_PERIODS.get('5m'): startTimeUnix -= 300 + (startTimeUnix % 300); break;
    case AVAILABLE_PERIODS.get('1h'): startTimeUnix -= 3600 + (startTimeUnix % 3600); break;
    case AVAILABLE_PERIODS.get('1d'): startTimeUnix -= 86400 + (startTimeUnix % 86400); break;
    default: break;
  }

  const getCandlesOptions = {
    period: activePeriod,
    startTime: moment.unix(startTimeUnix - 1),
  };

  return getCandlesData(getCandlesOptions);
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
    // isFirstCall: false,
    isFirstCall: !(startTime || endTime),
  };

  if (instrumentId) {
    query.instrumentId = instrumentId;
  }

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
