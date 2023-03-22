/* global
functions, makeRequest, getUnix, getRandomNumber, getPrecision, formatNumberToPretty, toRGB, saveAs, sleep, uuidv4,
objects, user, moment, constants, moveTo, EActions, wsClient,
classes, LightweightCharts, ChartCandles, IndicatorVolume, IndicatorMovingAverage, IndicatorVolumeAverage, TradingDemo, TradingDemoList,
*/

// instrumentsDocs.find(d => d._id === choosenInstrumentId)[`chart_candles_${activePeriod}`]

/* Constants */

const splitedPathname = location.pathname.split('/');
const PAGE_KEY = splitedPathname[splitedPathname.length - 1];
const URL_GET_CANDLES = '/api/candles';
const URL_DO_NEXT_TICK = '/api/candles/next-tick';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_USER_FIGURE_LEVEL_BOUNDS = '/api/user-figure-level-bounds';
const URL_REMOVE_USER_FIGURE_LEVEL_BOUNDS = '/api/user-figure-level-bounds/remove';
const URL_CALCULATE_USER_FIGURE_LEVEL_BOUNDS = '/api/user-figure-level-bounds/cron/calculate';

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

const AVAILABLE_NEXT_EVENTS = new Map([
  ['figureLevel', 'figureLevel'],
  ['increasedVolume', 'increasedVolume'],
  ['priceJump', 'priceJump'],
  ['absorption', 'absorption'],
  ['obedientPrice', 'obedientPrice'],
  ['sluggishedPrice', 'sluggishedPrice'],
  ['repeatedCandles', 'repeatedCandles'],

  ['largeCandle', 'largeCandle'],

  ['movingAveragesTrend', 'movingAveragesTrend'],
  ['lifetimeMovingAverage', 'lifetimeMovingAverage'],
  ['movingAveragesCrossed', 'movingAveragesCrossed'],
  ['longMovingAverageTouched', 'longMovingAverageTouched'],
]);

/* Variables */

let choosenNextEvent = AVAILABLE_NEXT_EVENTS.get('largeCandle');

let linePoints = [];
let isLoading = false;
let isSinglePeriod = false;
let isSingleDateCounter = false;
let choosedFigureShape = false;
let isActiveLineDrawing = false;
let isActiveSetNotification = false;
let isActiveLevelDrawing = false;
let isActiveCrosshairMoving = false;
let isActiveSearching = false;
let isActiveRobotTrading = false;
let isActiveCandleChoosing = false;
let isActiveInstrumentChoosing = false;
let lastVisibleLogicalRange = false;
let temporaryLineSeriesId;
let previousCrosshairMove;
let choosenInstrumentId;

let notifications = [];
let instrumentsDocs = [];
let favoriteInstruments = [];
const lastViewedInstruments = [];
let choosenPeriods = [AVAILABLE_PERIODS.get('5m'), AVAILABLE_PERIODS.get('1h')];
let activePeriod = choosenPeriods[choosenPeriods.length - 1];
let finishDatePointUnix = moment().startOf('hour').unix();
let originalFinishDatePointUnix = finishDatePointUnix;

const windowHeight = window.innerHeight;

const settings = {
  chart: {
    limitCandlesPerChart: 1000,
  },

  figureLevels: {
    colorFor5mLevels: constants.DARK_BLUE_COLOR,
    colorFor1hLevels: constants.BLUE_COLOR,
    colorFor1dLevels: constants.GREEN_COLOR,
    percentForMovingToNearestFigureLevel: 3,

    distanceFromLeftSide: 100,
    distanceFromRightSide: 100,
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

const trading = new TradingDemo();
const tradingList = new TradingDemoList(PAGE_KEY);

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

wsClient.onmessage = async data => {
  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'nextTick': {
        const {
          timeUnix,
          instrumentId,
        } = parsedData.data;

        if (instrumentId !== choosenInstrumentId || timeUnix === finishDatePointUnix) {
          break;
        }

        const beforeTimeUnix = finishDatePointUnix;
        finishDatePointUnix = parsedData.data.timeUnix;
        changeFinishDatePoint(finishDatePointUnix, !isSingleDateCounter);

        if (beforeTimeUnix > finishDatePointUnix
          || Math.abs(beforeTimeUnix - finishDatePointUnix) > 3600) {
          await reloadCharts(choosenInstrumentId);
        } else {
          await nextTick();
        }

        break;
      }
      default: break;
    }
  }
};

/* JQuery */
const $settings = $('.settings');
const $finishDatePoint = $settings.find('.finish-date-point input[type="text"]');

const $trades = $('.trades');
const $chartsContainer = $('.charts-container');
const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');
const $instrumentsHeadlines = $instrumentsContainer.find('.instruments-list .headlines');

// todo: change { instrumentId } to instrumentDoc where it's possible
$(document).ready(async () => {
  // start settings

  if (params.interval && AVAILABLE_PERIODS.get(params.interval)) {
    saveSettingsToLocalStorage({ choosenPeriods });
  }

  trading.init();
  tradingList.init(trading);

  setStartSettings();

  setHistoryMoment();

  // removeFigureLinesFromLocalStorage({});
  // removeFigureLevelsFromLocalStorage({});

  $instrumentsContainer
    .css({ maxHeight: windowHeight });

  // wsClient.onopen = () => {
  wsClient.send(JSON.stringify({
    actionName: 'subscribe',
    data: { subscriptionName: 'nextTick' },
  }));
  // };

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
  // await getAndSaveUserFigureLevels();

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

      if (isSingleDateCounter) {
        finishDatePointUnix = originalFinishDatePointUnix;
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

  // trading.$tradingForm.find('.risks-block .sl input[type="checkbox"]')
  //   .change(function () {
  //     saveSettingsToLocalStorage({ isAutoStopLoss: this.checked });
  //   });

  $trades.find('.clear-trades')
    .on('click', 'button.clear', () => tradingList.clear())
    .on('click', 'button.export', () => tradingList.export())
    .on('click', 'button.import', () => tradingList.import())
    .on('change', 'input.strategy', function () {
      const value = $(this).val();
      trading.filterTrades(value);
    });

  $('#settings')
    .on('click', async () => {
      await renewFigureLevels();
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

      lastVisibleLogicalRange = false;
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

  $settings.find('.single-date-counter input[type="checkbox"]')
    .change(function () {
      isSingleDateCounter = this.checked;
      saveSettingsToLocalStorage({ isSingleDateCounter });
    });

  $finishDatePoint
    .on('change', async function () {
      let value = $(this).val();

      // format 03.07.2021 12:20
      if (value.includes(' ')) {
        value = moment.utc(value, 'DD.MM.YYYY HH:mm').unix();
      }

      changeFinishDatePoint(value, true);

      if (choosenInstrumentId) {
        await reloadCharts(choosenInstrumentId);
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

  trading.$tradingForm.find('.action-block button')
    .on('click', async function (action) {
      const typeAction = action.type ? $(this).parent().attr('class') : action;
      trading.changeTypeAction(typeAction);

      const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
      const { originalData } = instrumentDoc[`chart_candles_${activePeriod}`];
      const firstCandle = originalData[originalData.length - 1];

      if (!trading.getActiveTransaction(choosenInstrumentId)) {
        const averagePercent = await calculateAveragePercent(AVAILABLE_PERIODS.get('1h'), firstCandle.originalTimeUnix);
        // const stopLossPercent = averagePercent * 2;
        const stopLossPercent = (averagePercent);
        trading.changeStopLossPercent(stopLossPercent);

        const savePrice = (firstCandle.close / 100) * (stopLossPercent);
        const topSavePrice = firstCandle.close + savePrice;
        const bottomSavePrice = firstCandle.close - savePrice;

        if (!isActiveRobotTrading) {
          saveFigureLevelsToLocalStorage([{
            seriesId: uuidv4(),
            instrumentId: instrumentDoc._id,
            time: firstCandle.originalTimeUnix - 300,
            timeframe: activePeriod,
            value: topSavePrice,
            isLong: true,
          }, {
            seriesId: uuidv4(),
            instrumentId: instrumentDoc._id,
            time: firstCandle.originalTimeUnix - 300,
            timeframe: activePeriod,
            value: bottomSavePrice,
            isLong: false,
          }]);

          drawFigureLevels({ instrumentId: instrumentDoc._id }, [{
            seriesId: uuidv4(),
            time: firstCandle.originalTimeUnix - 300,
            timeframe: activePeriod,
            value: topSavePrice,
          }, {
            seriesId: uuidv4(),
            time: firstCandle.originalTimeUnix - 300,
            timeframe: activePeriod,
            value: bottomSavePrice,
          }]);
        }
      }

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

  $(document)
    .on('keypress', async e => {
      if (!choosenInstrumentId) {
        return true;
      }

      if (e.keyCode === 93) {
        // ]

        let incrementValue = 300;

        if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
          incrementValue = 3600;
        } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
          incrementValue = 86400;
        }

        await doNextTick({
          instrumentId: choosenInstrumentId,
          timeUnix: finishDatePointUnix + incrementValue,
        });
      } else if (e.keyCode === 92) {
        // \ (left from enter)
        await prevTick();
      } else if (e.keyCode === 27) {
        // ESC
        trading.$tradingForm.removeClass('is_active');
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
      } else if (e.keyCode === 66) {
        // B
        isActiveCandleChoosing = !isActiveCandleChoosing;
      } else if (e.keyCode === 78) {
        // N
        isActiveSetNotification = !isActiveSetNotification;
      } else if (e.keyCode === 190) {
        // >
        await doMoveTo();
      } else if (e.keyCode === 191) {
        // /
        await runRobotTrading();
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
        trading.$tradingForm.find('.risks-block .sl button').click();
      } else if (e.keyCode === 77) {
        // M
        trading.$tradingForm.find('.risks-block .stop-limit button').click();
      } else if (e.keyCode === 80) {
        // P
        trading.$tradingForm.find('.action-block .buy button').click();
      } else if (e.keyCode === 219) {
        // [
        trading.$tradingForm.find('.action-block .sell button').click();
      } else if (e.keyCode === 72) {
        // H
        await setHistoryMoment(choosenInstrumentId);
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

        if (!trading.$tradingForm.hasClass('is_active')) {
          const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
          instrumentDoc.price = instrumentDoc[`chart_candles_${activePeriod}`].getInstrumentPrice();

          trading.loadInstrumentData(instrumentDoc);
        }

        trading.$tradingForm.toggleClass('is_active');
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
          } else if (choosedFigureShape.isLimitOrder) {
            const limitOrder = trading.limitOrders.find(o => o.id === choosedFigureShape.seriesId);
            trading.removeLimitOrder(limitOrder);
          } else if (choosedFigureShape.isNotification) {
            const price = choosedFigureShape.seriesId.split('-')[1];
            notifications = notifications.filter(n => n !== price);
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

const runRobotTrading = async () => {
  if (!choosenInstrumentId) {
    return true;
  }

  isActiveRobotTrading = true;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
  const numberIterations = [...Array(100).keys()];
  trading.changeNumberTrades(4);

  for await (const i of numberIterations) {
    await doMoveTo();

    // if (!confirm('Go?')) {
    //   finishDatePointUnix += (300 * 20);
    //   await reloadCharts(choosenInstrumentId);
    //   await sleep(3000);
    //   continue;
    // }

    // start strategy
    /*
    const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];
    const lCandles = chartCandles.originalData.length;

    let averagePercent = 0;
    const targetCandlesPeriod = chartCandles.originalData.slice(lCandles - 36, lCandles);

    targetCandlesPeriod.forEach(c => {
      const isLong = c.close > c.open;

      const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
      const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

      averagePercent += percentPerPrice;
    });

    averagePercent = parseFloat((averagePercent / 36).toFixed(2));
    const averagePercentX2 = averagePercent * 2;

    const lastCandle = chartCandles.originalData[lCandles - 1];

    const difference = Math.abs(lastCandle.open - lastCandle.close);
    const percentPerOpen = 100 / (lastCandle.open / difference);
    */

    // /*
    await $._data($(trading.$tradingForm.find('.action-block .buy button'))
      .get(0), 'events').click[0]
      .handler('buy');

    await doMoveTo();
    // */

    /*
    await $._data($(trading.$tradingForm.find('.action-block .buy button'))
      .get(0), 'events').click[0]
      .handler('sell');

    await doMoveTo();
    // */

    // break;
  }

  alert('Finished');
  isActiveRobotTrading = false;
};

let sumLoss = 0;
let sumLossWaitDays = 0;
let markers = [];
const waitDays = [];
let isRiskMode = false;

const smartMoveToFinishTransaction = async (activeTransaction) => {
  if (!activeTransaction || !activeTransaction.isActive) {
    return false;
  }

  markers = [];

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === activeTransaction.instrumentId);
  const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];
  const { originalData } = chartCandles;

  document.previousTitle = document.title;
  document.title = `${instrumentDoc.name} ...`;

  const incrementValue = 300;
  let isActiveSaveTrade = true;
  let isActiveSaveTradeInReverseTransaction = true;

  let activeReverseTransaction = false;
  const transactionPrice = TradingDemo.getAveragePrice(activeTransaction);
  const quantity = activeTransaction.trades[0].quantity * activeTransaction.trades.length;
  const lastCandle = originalData[originalData.length - 1];
  const savePrice = (lastCandle.close / 100) * (activeTransaction.originalStopLossPercent);
  const topSavePrice = lastCandle.close + savePrice;
  const bottomSavePrice = lastCandle.close - savePrice;
  let lastCandleTimeUnix = lastCandle.originalTimeUnix;

  let commonLoss = 0;
  let numberSavePriceHandled = 0;
  let wasAsked = false;

  while (1) {
    let isSuccess = false;

    if (!isActiveRobotTrading) {
      if (!wasAsked && lastCandleTimeUnix - lastCandle.originalTimeUnix >= 432000) { // 5 days
        if (!confirm('>5 days, continue?')) {
          isSuccess = true;
          break;
        } else {
          wasAsked = true;
        }
      }
    }

    /*
    if (!wasAsked && lastCandleTimeUnix - lastCandle.originalTimeUnix >= 432000) { // 5 days
      if (!confirm('>5 days, continue?')) {
        /*
        let price = transactionPrice;
        const quantity = activeTransaction.trades[0].quantity * activeTransaction.trades.length;

        if (activeTransaction.isLong) {
          price -= (commonLoss / quantity);
        } else {
          price += (commonLoss / quantity);
        }

        activeTransaction.trades.forEach(trade => {
          TradingDemo.finishTrade(activeTransaction, trade, {
            instrumentPrice: price,
            endedAtUnix: lastCandle.originalTimeUnix,
          });
        });

        TradingDemo.finishTransaction(activeTransaction, {
          endedAtUnix: lastCandle.originalTimeUnix,
        });

        activeTransaction.trades.forEach(trade => {
          TradingDemo.finishTrade(activeTransaction, trade, {
            instrumentPrice: transactionPrice,
            endedAtUnix: lastCandle.originalTimeUnix,
          });
        });

        TradingDemo.finishTransaction(activeTransaction, {
          endedAtUnix: lastCandle.originalTimeUnix,
        });

        isSuccess = true;
        numberWaitDays += 1;
        sumLossWaitDays += commonLoss;
        break;
      } else {
        wasAsked = true;
      }
    }
    */

    const incrementTime = lastCandleTimeUnix + (incrementValue * 1440); // 5 days

    const getCandlesOptions = {
      period: activePeriod,
      instrumentId: instrumentDoc._id,

      startTime: moment.unix(lastCandleTimeUnix),
      endTime: moment.unix(incrementTime),
    };

    const rawCandles = await getCandlesData(getCandlesOptions);

    if (!rawCandles.length) {
      break;
    }

    const candles = chartCandles.prepareNewData(rawCandles, false);

    if (candles[0].originalTimeUnix < lastCandleTimeUnix) {
      break;
    }

    // console.log(new Date(candles[0].originalTimeUnix * 1000).toISOString(), new Date(lastCandleTimeUnix * 1000).toISOString(), candles[0].originalTimeUnix < lastCandleTimeUnix);

    candles.every(candle => {
      if (isActiveSaveTrade) {
        if (activeTransaction.isLong && candle.close <= bottomSavePrice) {
          const loss = (transactionPrice - candle.close) * quantity;
          activeTransaction.trades.forEach(trade => {
            trade.takeProfitPrice += (loss / quantity);
          });

          commonLoss += loss;
          numberSavePriceHandled += 1;
          isActiveSaveTrade = false;

          markers.push({
            shape: 'arrowDown',
            color: constants.RED_COLOR,
            time: candle.originalTimeUnix,
          });

          if (activeReverseTransaction) {
            activeReverseTransaction.takeProfitPrice -= (loss / quantity);
          }
        } else if (!activeTransaction.isLong && candle.close >= topSavePrice) {
          const loss = (candle.close - transactionPrice) * quantity;
          activeTransaction.trades.forEach(trade => {
            trade.takeProfitPrice -= (loss / quantity);
          });

          commonLoss += loss;
          numberSavePriceHandled += 1;
          isActiveSaveTrade = false;

          markers.push({
            shape: 'arrowDown',
            color: constants.RED_COLOR,
            time: candle.originalTimeUnix,
          });

          if (activeReverseTransaction) {
            activeReverseTransaction.takeProfitPrice += (loss / quantity);
          }
        }
      } else {
        if ((activeTransaction.isLong && candle.high >= transactionPrice)
          || (!activeTransaction.isLong && candle.low <= transactionPrice)) {
          isActiveSaveTrade = true;
        }
      }

      if (!activeReverseTransaction) {
        const triggerPrice = activeTransaction.isLong
          ? activeTransaction.originalStopLossPrice - (savePrice * 2) : activeTransaction.originalStopLossPrice + (savePrice * 2);

        if ((activeTransaction.isLong && candle.low <= triggerPrice)
          || (!activeTransaction.isLong && candle.high >= triggerPrice)) {
          const newTransaction = {
            isActive: true,
            isLong: !activeTransaction.isLong,
            quantity,

            transactionPrice: triggerPrice,
            topSavePrice: triggerPrice + savePrice,
            bottomSavePrice: triggerPrice - savePrice,
          };

          const takeProfitPrice = Math.abs(activeTransaction.originalStopLossPrice - activeTransaction.trades[0].takeProfitPrice);

          if (newTransaction.isLong) {
            newTransaction.buyPrice = activeTransaction.originalStopLossPrice;
            newTransaction.takeProfitPrice = newTransaction.buyPrice + takeProfitPrice;
          } else {
            newTransaction.sellPrice = activeTransaction.originalStopLossPrice;
            newTransaction.takeProfitPrice = newTransaction.sellPrice - takeProfitPrice;
          }

          activeReverseTransaction = newTransaction;
        }
      } else {
        if (isActiveSaveTradeInReverseTransaction) {
          if (activeReverseTransaction.isLong && candle.close <= activeReverseTransaction.bottomSavePrice) {
            const loss = (activeReverseTransaction.transactionPrice - candle.close) * quantity;
            activeReverseTransaction.takeProfitPrice += (loss / quantity);
            activeTransaction.trades.forEach(trade => {
              trade.takeProfitPrice -= (loss / quantity);
            });

            commonLoss += loss;
            numberSavePriceHandled += 1;
            isActiveSaveTradeInReverseTransaction = false;

            markers.push({
              shape: 'arrowDown',
              color: constants.RED_COLOR,
              time: candle.originalTimeUnix,
            });
          } else if (!activeReverseTransaction.isLong && candle.close >= activeReverseTransaction.topSavePrice) {
            const loss = (candle.close - activeReverseTransaction.transactionPrice) * quantity;
            activeReverseTransaction.takeProfitPrice -= (loss / quantity);
            activeTransaction.trades.forEach(trade => {
              trade.takeProfitPrice += (loss / quantity);
            });

            commonLoss += loss;
            numberSavePriceHandled += 1;
            isActiveSaveTradeInReverseTransaction = false;

            markers.push({
              shape: 'arrowDown',
              color: constants.RED_COLOR,
              time: candle.originalTimeUnix,
            });
          }
        } else {
          if ((activeReverseTransaction.isLong && candle.high >= activeReverseTransaction.transactionPrice)
            || (!activeReverseTransaction.isLong && candle.low <= activeReverseTransaction.transactionPrice)) {
            isActiveSaveTradeInReverseTransaction = true;
          }
        }
      }

      if (isRiskMode && numberSavePriceHandled >= 5) {
        activeTransaction.trades.forEach(trade => {
          if (activeTransaction.isLong) {
            trade.takeProfitPrice = transactionPrice - (commonLoss / quantity);
          } else {
            trade.takeProfitPrice = transactionPrice + (commonLoss / quantity);
          }
        });
      }

      lastCandleTimeUnix = candle.originalTimeUnix;

      let targetTrades = activeTransaction.isLong
        ? activeTransaction.trades.filter(trade => trade.takeProfitPrice <= candle.high)
        : activeTransaction.trades.filter(trade => trade.takeProfitPrice >= candle.low);

      if (activeReverseTransaction) {
        if ((activeReverseTransaction.isLong && activeReverseTransaction.takeProfitPrice <= candle.high)
          || (!activeReverseTransaction.isLong && activeReverseTransaction.takeProfitPrice >= candle.low)) {
          targetTrades = activeTransaction.trades;
        }
      }

      targetTrades.forEach(trade => {
        TradingDemo.finishTrade(activeTransaction, trade, {
          instrumentPrice: trade.takeProfitPrice,
          endedAtUnix: candle.originalTimeUnix,
        });
      });

      if (!activeTransaction.trades.some(trade => trade.isActive)) {
        TradingDemo.finishTransaction(activeTransaction, {
          endedAtUnix: candle.originalTimeUnix,
        });

        isSuccess = true;
        return false;
      }

      return true;
    });

    if (isSuccess) {
      break;
    }
  }

  if (activeTransaction.isActive) {
    alert(`!Success, n: ${numberSavePriceHandled}; l: ${commonLoss.toFixed(1)}`);

    trading.transactions = trading.transactions.filter(t => t.id !== activeTransaction.id);
    tradingList.setTransactions(trading.transactions);
    tradingList.removeTradesFromTradeList([activeTransaction]);
    tradingList.updateCommonStatistics();

    return false;
  }

  sumLoss += commonLoss;

  document.title = document.previousTitle;

  tradingList.updateTradesInTradeList(activeTransaction, activeTransaction.trades);
  tradingList.setTransactions(trading.transactions);
  tradingList.updateCommonStatistics();

  const difference = lastCandleTimeUnix - lastCandle.originalTimeUnix;

  const days = parseInt(difference / 86400, 10);
  const hours = parseInt((difference % 86400) / 3600, 10);

  waitDays.push([difference, numberSavePriceHandled, commonLoss]);

  if (!isActiveRobotTrading) {
    alert(`d: ${days}; h: ${hours}; n: ${numberSavePriceHandled}; l: ${commonLoss.toFixed(1)}`);
    finishDatePointUnix = lastCandleTimeUnix + incrementValue;
    await reloadCharts(instrumentDoc._id);

    const newChartCandles = instrumentDoc[`chart_candles_${activePeriod}`];
    markers.forEach(m => newChartCandles.addMarker(m));
    newChartCandles.drawMarkers();

    drawTrades({ instrumentId: instrumentDoc._id }, activeTransaction, choosenPeriods);
  }

  return true;
};

const doMoveTo = async () => {
  if (!choosenInstrumentId) {
    return true;
  }

  let execFunc;
  const activeTransaction = trading.getActiveTransaction(choosenInstrumentId);

  if (notifications.length) {
    return moveTo.moveToNearesNotification();
  } else if (activeTransaction) {
    return smartMoveToFinishTransaction(activeTransaction);
    // return moveTo.moveToFinishTransaction(activeTransaction);
  } else {
    switch (choosenNextEvent) {
      case AVAILABLE_NEXT_EVENTS.get('priceJump'): {
        execFunc = moveTo.moveToNextPriceJump;
        // execFunc = moveTo.moveToNextPriceJumpPlusFigureLevels;
        break;
      }

      case AVAILABLE_NEXT_EVENTS.get('largeCandle'): execFunc = moveTo.moveToNextLargeCandle; break;
      case AVAILABLE_NEXT_EVENTS.get('absorption'): execFunc = moveTo.moveToNextAbsorption; break;
      case AVAILABLE_NEXT_EVENTS.get('figureLevel'): execFunc = moveTo.moveToNextFigureLevel; break;
      case AVAILABLE_NEXT_EVENTS.get('increasedVolume'): execFunc = moveTo.moveToNextIncreasedVolume; break;
      case AVAILABLE_NEXT_EVENTS.get('movingAveragesTrend'): execFunc = moveTo.moveToNextMovingAveragesTrend; break;
      case AVAILABLE_NEXT_EVENTS.get('lifetimeMovingAverage'): execFunc = moveTo.moveToNextLifetimeMovingAverage; break;
      case AVAILABLE_NEXT_EVENTS.get('movingAveragesCrossed'): execFunc = moveTo.moveToNextMovingAveragesCrossed; break;
      case AVAILABLE_NEXT_EVENTS.get('longMovingAverageTouched'): execFunc = moveTo.moveToNextLongAverageTouched; break;
      case AVAILABLE_NEXT_EVENTS.get('obedientPrice'): execFunc = moveTo.moveToNextObedientPrice; break;
      case AVAILABLE_NEXT_EVENTS.get('repeatedCandles'): execFunc = moveTo.moveToNextRepeatedCandles; break;
      case AVAILABLE_NEXT_EVENTS.get('sluggishedPrice'): execFunc = moveTo.moveToNextSluggishedPrice; break;
      default: alert('No function for this event');
    }
  }

  if (!execFunc) {
    return true;
  }

  await execFunc();
  changeFinishDatePoint(finishDatePointUnix, true);

  await doNextTick({
    instrumentId: choosenInstrumentId,
    timeUnix: finishDatePointUnix,
  });
};

const reloadCharts = async (instrumentId) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

  await loadCandles({ instrumentId }, choosenPeriods);

  loadCharts({ instrumentId });

  choosenPeriods.forEach(period => {
    const chartCandles = instrumentDoc[`chart_candles_${period}`];

    $chartsContainer
      .find(`.period_${period} .percent-average`)
      .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);
  });

  const figureLevelsData = getFigureLevelsFromLocalStorage({ instrumentId });
  drawFigureLevels({ instrumentId }, figureLevelsData);

  const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
  drawFigureLines({ instrumentId }, figureLinesData);

  const activeTransaction = trading.getActiveTransaction(choosenInstrumentId);
  activeTransaction && drawTrades({ instrumentId }, activeTransaction);

  const activeLimitOrders = trading.limitOrders.filter(o => o.instrumentId === choosenInstrumentId);
  activeLimitOrders.length && drawLimitOrders({ instrumentId }, activeLimitOrders);

  notifications.lengtg && drawNotifications(notifications);
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
  notifications = [];
  choosedFigureShape = false;
  isActiveLineDrawing = false;
  isActiveLevelDrawing = false;
  isActiveSetNotification = false;
  temporaryLineSeriesId = false;
  lastVisibleLogicalRange = false;

  trading.$tradingForm.removeClass('is_active');
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
        getCandlesOptions.endTime.add(-value, 'seconds');
      }
    } else if (period === AVAILABLE_PERIODS.get('1d')) {
      const value = (finishDatePointUnix % 86400);

      if (value) {
        getCandlesOptions.endTime.add(-value, 'seconds');
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

  const settings = getSettingsFromLocalStorage();

  if (settings.finishDatePointUnix) {
    changeFinishDatePoint(settings.finishDatePointUnix, true);

    if (activePeriod !== AVAILABLE_PERIODS.get('5m')) {
      const divider = activePeriod === AVAILABLE_PERIODS.get('1h') ? 3600 : 86400;
      const decrementValue = finishDatePointUnix % divider;

      if (decrementValue !== 0) {
        finishDatePointUnix -= decrementValue;
      }
    }
  } else {
    const dateUnix = moment({ day: 1, month: 2, year: 2022 }).unix();
    changeFinishDatePoint(dateUnix, true);
  }

  if (choosenInstrumentId) {
    await loadCandles({ instrumentId: choosenInstrumentId }, choosenPeriods);

    loadCharts({ instrumentId: choosenInstrumentId });
  }
};

const updateCandlesForNextTick = async (instrumentDoc, period, newCandles = []) => {
  const { originalData } = instrumentDoc[`chart_candles_${period}`];

  const chartCandles = instrumentDoc[`chart_candles_${period}`];
  const indicatorVolume = instrumentDoc[`indicator_volume_${period}`];
  const indicatorVolumeAverage = instrumentDoc[`indicator_volume_average_${period}`];
  const indicatorMovingAverageShort = instrumentDoc[`indicator_moving_average_short_${period}`];
  const indicatorMovingAverageMedium = instrumentDoc[`indicator_moving_average_medium_${period}`];
  const indicatorMovingAverageLong = instrumentDoc[`indicator_moving_average_long_${period}`];

  let preparedData = [];
  let figureLinesExtraSeries = [];
  let figureLevelsExtraSeries = [];
  const isChangeable = newCandles.length;

  if (!isChangeable) {
    const getCandlesOptions = {
      period,
      instrumentId: instrumentDoc._id,
      startTime: moment.unix(originalData[originalData.length - 1].originalTimeUnix),
      endTime: moment.unix(finishDatePointUnix),
    };

    newCandles = await getCandlesData(getCandlesOptions);

    preparedData = chartCandles.prepareNewData(newCandles.map(c => ({
      ...c,
      time: period === AVAILABLE_PERIODS.get('1d') ? c.time : getUnix(c.time) * 1000,
    })), false);

    instrumentDoc[`candles_data_${period}`].unshift(...newCandles);

    figureLevelsExtraSeries = chartCandles.extraSeries.filter(s => s.isFigureLevel);
    figureLinesExtraSeries = chartCandles.extraSeries.filter(
      s => s.isFigureLine && s.isActive && s.timeframe === period,
    );
  } else {
    preparedData = newCandles.map(c => {
      const currentCandle = instrumentDoc[`candles_data_${period}`][0];

      if (getUnix(currentCandle.time) === c.originalTimeUnix) {
        const { volume, data } = currentCandle;
        let [open, close, low, high] = data;

        if (c.low < low) {
          low = c.low;
        }

        if (c.high > high) {
          high = c.high;
        }

        const commonVolume = volume + c.volume;
        instrumentDoc[`candles_data_${period}`][0] = {
          ...currentCandle,
          volume: commonVolume,
          data: [open, c.close, low, high],
        };

        return {
          ...c,
          volume: commonVolume,
          open,
          close: c.close,
          low,
          high,
          isFinished: true,
        };
      } else {
        instrumentDoc[`candles_data_${period}`].unshift({
          volume: c.volume,
          instrument_id: instrumentDoc._id,
          data: [c.open, c.close, c.low, c.high],
          time: new Date(c.originalTimeUnix * 1000).toUTCString(),
        });

        c.isFinished = false;
        return c;
      }
    });
  }

  preparedData.forEach(d => {
    chartCandles.drawSeries(chartCandles.mainSeries, d);
    indicatorVolume.drawSeries(indicatorVolume.mainSeries, {
      value: d.volume,
      time: d.originalTimeUnix,
    });

    let lCandles = chartCandles.originalData.length;

    if (chartCandles.originalData[lCandles - 1].originalTimeUnix !== d.originalTimeUnix) {
      chartCandles.originalData.push(d);
    } else {
      chartCandles.originalData[lCandles - 1] = d;
    }

    const candlesData = chartCandles.originalData;
    lCandles = candlesData.length;

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

    figureLinesExtraSeries.forEach(s => {
      s.linePoints[1].value += s.isLong ? s.reduceValue : -s.reduceValue;
      s.linePoints[1].time = d.originalTimeUnix;

      chartCandles.drawSeries(s, s.linePoints);
    });
  });

  const { originalTimeUnix, isFinished } = preparedData[preparedData.length - 1];

  figureLevelsExtraSeries.forEach(s => {
    chartCandles.drawSeries(s, {
      value: s.value,
      time: originalTimeUnix,
    });
  });

  if (!isChangeable || !isFinished) {
    const validTime = ChartCandles.getValidTime(originalTimeUnix, period);
    const activeTransaction = trading.getActiveTransaction(choosenInstrumentId);
    const activeLimitOrders = trading.limitOrders.filter(o => o.instrumentId === choosenInstrumentId);

    if (activeTransaction) {
      const targetSeries = chartCandles.extraSeries
        .filter(s => s.isTrade && s.id.toString().includes(activeTransaction.id));

      targetSeries.forEach(s => chartCandles.drawSeries(s, { value: s.price, time: validTime }));
    }

    activeLimitOrders.forEach(order => {
      const targetSeries = chartCandles.extraSeries
        .find(s => s.isLimitOrder && s.id === order.id);
      targetSeries && chartCandles.drawSeries(targetSeries, { value: order.limitPrice, time: validTime });
    });

    $chartsContainer
      .find(`.period_${period} .percent-average`)
      .text(`${chartCandles.calculateAveragePercent().toFixed(2)}%`);
  }

  return preparedData;
};

const prevTick = async () => {
  if (isLoading || !choosenInstrumentId) {
    return;
  }

  isLoading = true;
  let decrementValue = 300;

  if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
    decrementValue = 3600;
  } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
    decrementValue = 86400;
  }

  finishDatePointUnix -= decrementValue;
  changeFinishDatePoint(finishDatePointUnix, !isSingleDateCounter);

  await reloadCharts(choosenInstrumentId);
  isLoading = false;
};

const nextTick = async () => {
  if (isLoading) {
    return;
  }

  isLoading = true;

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
  const newCandles = await updateCandlesForNextTick(instrumentDoc, activePeriod);

  if (activePeriod === AVAILABLE_PERIODS.get('5m')) {
    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1h'))) {
      const divider = newCandles[0].originalTimeUnix % 3600;
      const originalTimeUnix = newCandles[0].originalTimeUnix - divider;

      const newCandle = {
        ...newCandles[0],
        originalTimeUnix,
        time: originalTimeUnix,
        originalTime: new Date(originalTimeUnix * 1000),
      };

      await updateCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1h'), [newCandle]);
    }

    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1d'))) {
      const divider = newCandles[0].originalTimeUnix % 86400;
      const originalTimeUnix = newCandles[0].originalTimeUnix - divider;

      const newCandle = {
        ...newCandles[0],
        originalTimeUnix,
        time: originalTimeUnix,
        originalTime: new Date(newCandles[0].originalTimeUnix * 1000),
      };

      await updateCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1d'), [newCandle]);
    }
  } else if (activePeriod === AVAILABLE_PERIODS.get('1h')) {
    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('5m'))) {
      await updateCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('5m'));
    }

    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1d'))) {
      const divider = newCandles[0].originalTimeUnix % 86400;
      const originalTimeUnix = newCandles[0].originalTimeUnix - divider;

      const newCandle = {
        ...newCandles[0],
        originalTimeUnix,
        time: originalTimeUnix,
        originalTime: new Date(newCandles[0].originalTimeUnix * 1000),
      };

      await updateCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1d'), [newCandle]);
    }
  } else if (activePeriod === AVAILABLE_PERIODS.get('1d')) {
    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('5m'))) {
      await updateCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('5m'));
    }

    if (choosenPeriods.includes(AVAILABLE_PERIODS.get('1h'))) {
      await updateCandlesForNextTick(instrumentDoc, AVAILABLE_PERIODS.get('1h'));
    }
  }

  isLoading = false;
  const lastCandle = newCandles[newCandles.length - 1];
  instrumentDoc.price = lastCandle.close;

  const resultCheck = trading.checkLimitOrders(instrumentDoc, lastCandle);

  if (resultCheck) {
    const { results, changes } = resultCheck;

    results.forEach(result => {
      switch (result.action) {
        case EActions.get('transactionCreated'): {
          removeTemporaryStopLossSeries(instrumentDoc);
          transactionCreatedHandler(instrumentDoc, result);
          break;
        }

        case EActions.get('tradeCreated'): tradeCreatedHandler(instrumentDoc, result); break;

        default: {
          alert('Unknown action');
          return false;
        }
      }
    });

    changes.forEach(order => {
      choosenPeriods.forEach(period => {
        const chartCandles = instrumentDoc[`chart_candles_${period}`];
        const targetSeries = chartCandles.extraSeries
          .find(s => s.isLimitOrder && s.id === order.id);
        targetSeries && chartCandles.removeSeries(targetSeries);
      });
    });

    tradingList.setTransactions(trading.transactions);
  }

  const result = trading.nextTick(instrumentDoc, lastCandle, Boolean(resultCheck));

  if (result) {
    const { action, transaction, changes } = result;

    switch (action) {
      case EActions.get('tradeFinished'): tradeFinishedHandler(instrumentDoc, result); break;
      case EActions.get('transactionFinished'): transactionFinishedHandler(instrumentDoc, result); break;

      default: {
        alert('Unknown action');
        return false;
      }
    }

    tradingList.setTransactions(trading.transactions);
    tradingList.updateTradesInTradeList(transaction, changes);
  }

  if (isActiveInstrumentChoosing) {
    const lastCandles = await getLastCandles();
    calculateFigureLevelsPercents(lastCandles);

    if (!isSingleDateCounter) {
      calculatePriceLeaders(activePeriod, lastCandles);
      sortListInstruments();
    }
  }
};

const calculateAveragePercent = async (period, endTimeUnix) => {
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
  const chartCandles = instrumentDoc[`chart_candles_${activePeriod}`];

  const startOfHourUnix = endTimeUnix - (endTimeUnix % 3600);
  const startTimeUnix = startOfHourUnix - (36 * 3600);

  const getCandlesOptions = {
    period,
    instrumentId: choosenInstrumentId,

    startTime: moment.unix(startTimeUnix),
    endTime: moment.unix(startOfHourUnix),
  };

  const rawCandles = await getCandlesData(getCandlesOptions);
  const candles = chartCandles.prepareNewData(rawCandles);

  let averagePercent = 0;

  candles.forEach(c => {
    const isLong = c.close > c.open;
    const differenceBetweenPrices = isLong ? c.high - c.open : c.open - c.low;
    const percentPerPrice = 100 / (c.open / differenceBetweenPrices);

    averagePercent += percentPerPrice;
  });

  return parseFloat((averagePercent / 36).toFixed(2));
};

const loadCharts = ({
  instrumentId,
}) => {
  $chartsContainer.empty();
  const instrumentDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  document.title = instrumentDoc.name;

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

    if (lastVisibleLogicalRange) {
      chartCandles.chart
        .timeScale()
        .setVisibleLogicalRange(lastVisibleLogicalRange);
    }

    chartCandles.chart.subscribeClick(param => {
      isActiveSearching = false;
      activePeriod = chartCandles.period;
      const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
      console.log('coordinateToPrice', coordinateToPrice);
      let paramTime = param.time;

      if (param.time && chartCandles.period === AVAILABLE_PERIODS.get('1d')) {
        paramTime = moment({ ...param.time, month: param.time.month - 1 }).unix() + 7200;
      }

      if (param.time && chartCandles.extraSeries.length) {
        let existedSeries = chartCandles.extraSeries.find(
          series => series.time === paramTime,
        );

        if (!existedSeries) {
          const longSeries = chartCandles.extraSeries
            .filter(series => series.value >= coordinateToPrice)
            .sort((a, b) => a.value > b.value ? 1 : -1)[0];

          const shortSeries = chartCandles.extraSeries
            .filter(series => series.value < coordinateToPrice)
            .sort((a, b) => a.value < b.value ? 1 : -1)[0];

          if (longSeries && !shortSeries) {
            existedSeries = longSeries;
          } else if (shortSeries && !shortSeries) {
            existedSeries = shortSeries;
          } else if (longSeries && shortSeries) {
            const difLong = Math.abs(longSeries.value - coordinateToPrice);
            const difShort = Math.abs(shortSeries.value - coordinateToPrice);
            existedSeries = difLong < difShort ? longSeries : shortSeries;
          }
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

          saveFigureLineToLocalStorage({
            seriesId,
            instrumentId,
            linePoints,
            isLong,
            isActive,
            timeframe: chartCandles.period,
          });

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

        saveFigureLevelsToLocalStorage([{
          seriesId,
          instrumentId,
          time: paramTime,
          timeframe: chartCandles.period,
          value: coordinateToPrice,
          isLong: coordinateToPrice > chartCandles.getInstrumentPrice(),
        }]);

        drawFigureLevels({ instrumentId }, [{
          seriesId,
          time: paramTime,
          timeframe: chartCandles.period,
          value: coordinateToPrice,
        }]);

        choosedFigureShape = {
          seriesId,
          instrumentId,
          time: paramTime,
          isFigureLevel: true,
        };
      }

      if (isActiveCandleChoosing) {
        changeFinishDatePoint(paramTime, true);
        reloadCharts(instrumentId);
        isActiveCandleChoosing = false;
      }

      if (isActiveSetNotification) {
        const newNotification = coordinateToPrice;
        notifications.push(newNotification);
        drawNotifications([newNotification]);
        isActiveSetNotification = false;

        choosedFigureShape = {
          seriesId: `notification-${coordinateToPrice}`,
          instrumentId,
          time: paramTime,
          isNotification: true,
        };
      }

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

          lastVisibleLogicalRange = newVisibleLogicalRange;
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

            const figureLevelsData = getFigureLevelsFromLocalStorage({ instrumentId });
            drawFigureLevels({ instrumentId }, figureLevelsData);

            const figureLinesData = getFigureLinesFromLocalStorage({ instrumentId });
            drawFigureLines({ instrumentId }, figureLinesData);

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

const changeFinishDatePoint = (newValue, doUpdateLocalStorage) => {
  let newDate;

  if (Number.isInteger(parseInt(newValue, 10))) {
    newDate = moment.unix(newValue);
  } else {
    newDate = moment(newValue);
  }

  if (!newDate.isValid()) {
    alert('Invalid date');
    return true;
  }

  newDate.utc();

  finishDatePointUnix = newDate.unix();
  originalFinishDatePointUnix = finishDatePointUnix;
  $finishDatePoint.val(finishDatePointUnix);
  $finishDatePoint.parent().find('span').text(newDate.format('DD.MM.YYYY HH:mm'));

  doUpdateLocalStorage && saveSettingsToLocalStorage({ finishDatePointUnix });
};

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

const drawNotifications = (targetNotifications = []) => {
  if (!choosenInstrumentId) {
    return true;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);

  targetNotifications.forEach(price => {
    choosenPeriods.forEach(period => {
      const chartCandles = instrumentDoc[`chart_candles_${period}`];

      const newSeries = chartCandles.addExtraSeries({
        color: constants.GREEN_COLOR,
        lastValueVisible: false,
      }, {
        id: `notification-${price}`,
        isNotification: true,
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
  });
};

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
const getFigureLevelsFromLocalStorage = ({ instrumentId }) => {
  let figureLevels = localStorage.getItem(`trading-helper:${PAGE_KEY}:figure-levels`);

  if (!figureLevels) {
    return [];
  }

  figureLevels = JSON.parse(figureLevels);

  if (instrumentId) {
    return figureLevels.filter(e => e.instrumentId === instrumentId);
  }

  return figureLevels;
};

const saveFigureLevelsToLocalStorage = (figureLevelsData = []) => {
  const figureLevels = getFigureLevelsFromLocalStorage({});
  figureLevels.push(...figureLevelsData);
  localStorage.setItem(`trading-helper:${PAGE_KEY}:figure-levels`, JSON.stringify(figureLevels));
};

const removeFigureLevelsFromLocalStorage = ({
  instrumentId,
  value,
  seriesId,
}) => {
  if (!instrumentId) {
    localStorage.removeItem(`trading-helper:${PAGE_KEY}:figure-levels`);
    return;
  }

  let figureLevels = getFigureLevelsFromLocalStorage({});

  if (!value && !seriesId) {
    figureLevels = figureLevels.filter(e => e.instrumentId !== instrumentId);
    localStorage.setItem(`trading-helper:${PAGE_KEY}:figure-levels`, JSON.stringify(figureLevels));
    return;
  }

  if (seriesId) {
    figureLevels = figureLevels.filter(e => {
      if (e.instrumentId !== instrumentId) return true;
      return e.seriesId !== seriesId;
    });
  } else if (value) {
    figureLevels = figureLevels.filter(e => {
      if (e.instrumentId !== instrumentId) return true;
      return e.value !== value;
    });
  }

  localStorage.setItem(`trading-helper:${PAGE_KEY}:figure-levels`, JSON.stringify(figureLevels));
};

// todo: move to separated service
const getFigureLinesFromLocalStorage = ({ instrumentId }) => {
  let figureLines = localStorage.getItem(`trading-helper:${PAGE_KEY}:figure-lines`);

  if (!figureLines) {
    return [];
  }

  figureLines = JSON.parse(figureLines);

  if (instrumentId) {
    return figureLines.filter(e => e.instrumentId === instrumentId);
  }

  return figureLines;
};

const saveFigureLineToLocalStorage = (figureLineData) => {
  const figureLines = getFigureLinesFromLocalStorage({});
  figureLines.push(figureLineData);
  localStorage.setItem(`trading-helper:${PAGE_KEY}:figure-lines`, JSON.stringify(figureLines));
};

const removeFigureLinesFromLocalStorage = ({
  seriesId,
  instrumentId,
}) => {
  if (!instrumentId) {
    localStorage.removeItem(`trading-helper:${PAGE_KEY}:figure-lines`);
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

  localStorage.setItem(`trading-helper:${PAGE_KEY}:figure-lines`, JSON.stringify(figureLines));
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

  if (settings.finishDatePointUnix) {
    changeFinishDatePoint(settings.finishDatePointUnix, false);
  }

  if (settings.isSinglePeriod !== undefined) {
    isSinglePeriod = settings.isSinglePeriod;
  }

  if (settings.isSingleDateCounter !== undefined) {
    isSingleDateCounter = settings.isSingleDateCounter;
    $settings.find('.single-date-counter input[type="checkbox"]').attr('checked', isSingleDateCounter);
  }

  if (settings.choosenSortSettings) {
    choosenSortSettings = settings.choosenSortSettings;

    if (choosenSortSettings.isLong) {
      $instrumentsHeadlines.find(`span[data-type=${choosenSortSettings.type}]`).addClass('is_long');
    }
  }

  // if (settings.isAutoStopLoss) {
  //   trading.$tradingForm.find('.risks-block .sl input[type="checkbox"]').attr('checked', true);
  // }

  if (settings.choosenNextEvent) {
    choosenNextEvent = settings.choosenNextEvent;
  }

  if (settings.favoriteInstruments && settings.favoriteInstruments.length) {
    favoriteInstruments = settings.favoriteInstruments;
  }
};

const doNextTick = async ({
  timeUnix,
  instrumentId,
}) => {
  const resultDoNextTick = await makeRequest({
    method: 'POST',
    url: URL_DO_NEXT_TICK,
    body: {
      timeUnix,
      instrumentId,
    },
  });

  if (!resultDoNextTick || !resultDoNextTick.status) {
    alert(resultDoNextTick.message || 'Cant makeRequest URL_DO_NEXT_TICK');
    return false;
  }

  return true;
};

const getAndSaveUserFigureLevels = async () => {
  const query = {
    isActive: true,
    userId: user._id,
  };

  const resultGetFigureBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_FIGURE_LEVEL_BOUNDS,
    query,
  });

  if (!resultGetFigureBounds || !resultGetFigureBounds.status) {
    alert(resultGetFigureBounds.message || 'Cant makeRequest URL_GET_USER_FIGURE_LEVEL_BOUNDS');
    return false;
  }

  let startTimeUnix = finishDatePointUnix;

  switch (activePeriod) {
    case AVAILABLE_PERIODS.get('5m'): startTimeUnix -= 300; break;
    case AVAILABLE_PERIODS.get('1h'): startTimeUnix -= 3600; break;
    case AVAILABLE_PERIODS.get('1d'): startTimeUnix -= 86400; break;
    default: break;
  }

  const getCandlesOptions = {
    period: activePeriod,
    startTime: moment.unix(startTimeUnix - 1),
    endTime: moment.unix(finishDatePointUnix),
  };

  const lastCandles = await getCandlesData(getCandlesOptions);

  instrumentsDocs.forEach(doc => {
    const candle = lastCandles.find(c => c.instrument_id === doc._id);

    if (candle) {
      doc.price = candle.data[1];
    }
  });

  const figureLevelsData = resultGetFigureBounds.result.map(r => {
    const { price } = instrumentsDocs.find(d => d._id === r.instrument_id);
    const isLong = r.level_price > price;

    return {
      seriesId: new Date(r.level_start_candle_time).getTime(),
      instrumentId: r.instrument_id,
      time: getUnix(r.level_start_candle_time),
      timeframe: r.level_timeframe,
      value: r.level_price,
      isLong,
    };
  });

  if (figureLevelsData.length) {
    saveFigureLevelsToLocalStorage(figureLevelsData);
  }

  // console.log('finished');
};

const calculateFigureLevelsPercents = (lastCandles = []) => {
  if (!lastCandles || !lastCandles.length) {
    return;
  }

  const figureLevels = getFigureLevelsFromLocalStorage({});

  if (!figureLevels.length) {
    return;
  }

  let targetInstrumentsDocs = instrumentsDocs;

  if (isSingleDateCounter && choosenInstrumentId) {
    targetInstrumentsDocs = [instrumentsDocs.find(d => d._id === choosenInstrumentId)];
  }

  targetInstrumentsDocs.forEach(doc => {
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

  let targetInstrumentsDocs = instrumentsDocs;

  if (isSingleDateCounter && choosenInstrumentId) {
    targetInstrumentsDocs = [instrumentsDocs.find(d => d._id === choosenInstrumentId)];
  }

  targetInstrumentsDocs.forEach(doc => {
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
  if (isSingleDateCounter) {
    return true;
  }

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

const resetTransactionStopLossPrice = (transaction, {
  stopLossPercent,
}) => {
  if (!transaction.isActive) {
    return false;
  }

  const instrumentDoc = instrumentsDocs.find(doc => doc._id === transaction.instrumentId);
  const instrumentPrice = instrumentDoc[`chart_candles_${activePeriod}`].getInstrumentPrice();

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

const getLastCandles = async () => {
  let startTimeUnix = finishDatePointUnix;

  switch (activePeriod) {
    case AVAILABLE_PERIODS.get('5m'): startTimeUnix -= 300; break;
    case AVAILABLE_PERIODS.get('1h'): startTimeUnix -= 3600; break;
    case AVAILABLE_PERIODS.get('1d'): startTimeUnix -= 86400; break;
    default: break;
  }

  const getCandlesOptions = {
    period: activePeriod,
    startTime: moment.unix(startTimeUnix - 1),
    endTime: moment.unix(finishDatePointUnix),
  };

  if (isSingleDateCounter && choosenInstrumentId) {
    getCandlesOptions.instrumentId = choosenInstrumentId;
  }

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

const renewFigureLevels = async () => {
  document.previousTitle = document.title;
  document.title = 'Loading...';

  console.log('Started renewing process');

  const resultRemoveFigureLevels = await makeRequest({
    method: 'POST',
    url: URL_REMOVE_USER_FIGURE_LEVEL_BOUNDS,
  });

  if (!resultRemoveFigureLevels || !resultRemoveFigureLevels.status) {
    alert(resultRemoveFigureLevels.message || `Cant makeRequest ${URL_REMOVE_USER_FIGURE_LEVEL_BOUNDS}`);
    return false;
  }

  console.log('Old figure levels removed');

  const resultCalculate = await makeRequest({
    method: 'GET',
    url: URL_CALCULATE_USER_FIGURE_LEVEL_BOUNDS,
    query: {
      endTime: moment.unix(finishDatePointUnix).toISOString(),
    },
  });

  if (!resultCalculate || !resultCalculate.status) {
    alert(resultCalculate.message || `Cant makeRequest ${URL_CALCULATE_USER_FIGURE_LEVEL_BOUNDS}`);
    return false;
  }

  console.log('New figure levels calculated and saved');

  removeFigureLevelsFromLocalStorage({});
  await getAndSaveUserFigureLevels();

  console.log('Renewing process is finished');
  document.title = document.previousTitle;

  return true;
};

// todo: move to separated service
const calculateNewFigureLevels = (candles = []) => {
  const lCandles = candles.length;

  if (!lCandles) {
    return [];
  }

  // const highLevels = [];
  // /*
  const highLevels = getHighLevels({
    candles,
    distanceFromLeftSide: settings.figureLevels.distanceFromLeftSide,
    distanceFromRightSide: settings.figureLevels.distanceFromRightSide,
  });
  // */

  const lowLevels = [];
  /*
  const lowLevels = getLowLevels({
    candles,
    distanceFromLeftSide: settings.figureLevels.distanceFromLeftSide,
    distanceFromRightSide: settings.figureLevels.distanceFromRightSide,
  });
  // */

  if ((!highLevels || !highLevels.length)
    && (!lowLevels || !lowLevels.length)) {
    return [];
  }

  const levels = [];

  lowLevels.forEach(level => {
    const doesExistLevelWithThisPrice = levels.some(l => l.levelPrice === level.levelPrice);

    if (!doesExistLevelWithThisPrice) {
      levels.push({
        ...level,
        isLong: false,
      });
    }
  });

  highLevels.forEach(level => {
    const doesExistLevelWithThisPrice = levels.some(l => l.levelPrice === level.levelPrice);

    if (!doesExistLevelWithThisPrice) {
      levels.push({
        ...level,
        isLong: true,
      });
    }
  });

  return levels;
};

// todo: move to separated service
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

// todo: move to separated service
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
  limit,
  startTime,
  endTime,
}) => {
  // console.log('start loading');

  const query = {
    isFirstCall: false,
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
