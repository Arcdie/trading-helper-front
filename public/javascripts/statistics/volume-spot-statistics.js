/* global
functions, makeRequest, getUnix, sleep, saveAs,
objects, moment, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const modeSaveOn = false;

const URL_GET_CANDLES = '/api/candles';
const URL_GET_USER_TRADE_BOUNDS = '/api/user-trade-bounds';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_INSTRUMENT_VOLUME_BOUNDS = '/api/instrument-volume-bounds';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1M');

let limiterLifetime = 0;
let limiterDistance = 1;
let limiterNumberTouches = 1;
let considerBtcMircoTrend = false;
let considerFuturesMircoTrend = true;
let stopLossPercent = 0.3;

const windowHeight = window.innerHeight;

let choosenInstrumentId;

let instrumentsDocs = [];
let targetInstrumentVolumeBounds = [];

const startTime = moment().utc()
  .startOf('day')
  .add(-1, 'days');
  // .add(-3, 'days');

const endTime = moment()
  .endOf('day');
  // .startOf('minute');

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

      const spotDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
      const futuresDoc = instrumentsDocs.find(doc => doc.name === `${spotDoc.name}PERP`);

      if (!spotDoc.instrument_volume_bounds || !spotDoc.instrument_volume_bounds.length) {
        const resultGetInstrumentVolumeBounds = await makeRequest({
          method: 'GET',
          url: URL_GET_INSTRUMENT_VOLUME_BOUNDS,
          query: {
            endTime: endTime.toISOString(),
            startTime: startTime.toISOString(),
            instrumentId: spotDoc._id,
          },
        });

        if (!resultGetInstrumentVolumeBounds || !resultGetInstrumentVolumeBounds.status) {
          alert(resultGetInstrumentVolumeBounds.message || 'Cant makeRequest URL_GET_INSTRUMENT_VOLUME_BOUNDS');
          return true;
        }

        spotDoc.instrument_volume_bounds = resultGetInstrumentVolumeBounds.result || [];
      }

      if (!futuresDoc.user_trade_bounds || !futuresDoc.user_trade_bounds.length) {
        const resultGetUserTradeBounds = await makeRequest({
          method: 'GET',
          url: URL_GET_USER_TRADE_BOUNDS,
          query: {
            instrumentId: futuresDoc._id,
            endDate: endTime.toISOString(),
            startDate: startTime.toISOString(),
            typeTrade: 'INSTRUMENT_VOLUME_BOUND',
          },
        });

        if (!resultGetUserTradeBounds || !resultGetUserTradeBounds.status) {
          alert(resultGetUserTradeBounds.message || 'Cant makeRequest URL_GET_USER_TRADE_BOUNDS');
          return true;
        }

        futuresDoc.user_trade_bounds = resultGetUserTradeBounds.result || [];
      }

      await loadCharts({ instrumentId });

      targetInstrumentVolumeBounds = getTargetInstrumentVolumes({ instrumentId });

      drawTrades({
        instrumentId: futuresDoc._id,
      }, futuresDoc.user_trade_bounds);

      drawMarkersForTrades({
        instrumentId: futuresDoc._id,
      }, futuresDoc.user_trade_bounds);

      drawVolumes({ instrumentId }, targetInstrumentVolumeBounds);
      drawMarkersForVolume({ instrumentId }, targetInstrumentVolumeBounds);

      makeReport({ instrumentId }, targetInstrumentVolumeBounds);
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

      if (chartKey === 'spot') {
        scrollToVolume($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        }, targetInstrumentVolumeBounds);
      } else if (chartKey === 'futures') {
        const spotDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
        const futuresDoc = instrumentsDocs.find(doc => doc.name === `${spotDoc.name}PERP`);

        scrollToTrade($(this).attr('class'), {
          instrumentId: choosenInstrumentId,
        }, futuresDoc.user_trade_bounds);
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

        targetInstrumentVolumeBounds = getTargetInstrumentVolumes({ instrumentId });
        drawVolumes({ instrumentId }, targetInstrumentVolumeBounds);
        drawMarkersForVolume({ instrumentId }, targetInstrumentVolumeBounds);
        makeReport({ instrumentId }, targetInstrumentVolumeBounds);
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

        targetInstrumentVolumeBounds = getTargetInstrumentVolumes({ instrumentId });
        drawVolumes({ instrumentId }, targetInstrumentVolumeBounds);
        drawMarkersForVolume({ instrumentId }, targetInstrumentVolumeBounds);
        makeReport({ instrumentId }, targetInstrumentVolumeBounds);
      }
    });

  $report
    .on('click', 'tr', function () {
      const index = $(this).index();

      if (!index) {
        return true;
      }

      scrollToVolume(index, {
        instrumentId: choosenInstrumentId,
      }, targetInstrumentVolumeBounds);
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

  if (params.slideTrade) {
    const spotDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
    const futuresDoc = instrumentsDocs.find(doc => doc.name === `${spotDoc.name}PERP`);

    scrollToTrade(parseInt(params.slideTrade, 10), {
      instrumentId: choosenInstrumentId,
    }, futuresDoc.user_trade_bounds);
  }

  if (params.slideVolume) {
    scrollToVolume(parseInt(params.slideVolume, 10), {
      instrumentId: choosenInstrumentId,
    }, targetInstrumentVolumeBounds);
  }

  if (modeSaveOn) {
    // /*
    const statisticsArr = [];

    // let i = 0;
    for (const doc of instrumentsDocs) {
      // i += 1;
      // if (i === 2) break;

      if (doc.is_futures) {
        continue;
      }

      await $._data($($instrumentsList).get(0), 'events').click[0].handler(`#instrument-${doc._id}`);

      const statistics = [];

      $report.find('tr').each((index, tr) => {
        if (index === 0) {
          return true;
        }

        const $tr = $(tr);
        const $tds = $tr.find('td');

        const time = parseInt($tr.data('time'), 10);
        const timelife = parseInt($tds.eq(1).text(), 10);
        const touches = parseInt($tds.eq(2).text(), 10);
        const profit = parseFloat($tds.eq(3).text());

        const isAsk = $tr.data('is-ask') === 'true';

        statistics.push({
          time,
          timelife,
          touches,
          profit,
          index,
          isAsk,
        });
      });

      statisticsArr.push({
        instrumentId: doc._id,
        instrumentName: doc.name,
        statistics,
      });

      doc.original_data = [];
      doc.indicator_micro_supertrend_data = [];

      doc.chart_candles = {};
      doc.indicator_micro_supertrend = {};

      doc.user_trade_bounds = [];
      doc.instrument_volume_bounds = [];
      // chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;
    }

    const file = new File(
      [JSON.stringify(statisticsArr)],
      'volume-spot-statistics.json',
      { type: 'text/plain;charset=utf-8' },
    );

    saveAs(file);
    // */
  }
});

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs = instrumentsDocs.filter(doc => !doc.is_futures);

  if (!modeSaveOn) {
    instrumentsDocs = instrumentsDocs.filter(doc => !doc.does_ignore_volume);
  }

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
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresName = `${targetDoc.name}PERP`;
  const futuresDoc = instrumentsDocs.find(doc => doc.name === futuresName);

  if (!targetDoc.original_data || !targetDoc.original_data.length) {
    targetDoc.original_data = await getCandlesData({
      period: DEFAULT_PERIOD,
      instrumentId: targetDoc._id,
      endTime: endTime.toISOString(),
      startTime: startTime.toISOString(),
    });
  }

  if (!futuresDoc.original_data || !futuresDoc.original_data.length) {
    futuresDoc.original_data = await getCandlesData({
      period: DEFAULT_PERIOD,
      instrumentId: futuresDoc._id,
      endTime: endTime.toISOString(),
      startTime: startTime.toISOString(),
    });
  }

  const chartKeys = ['futures'];

  if (!targetDoc.is_futures) {
    chartKeys.push('spot');
  }

  chartKeys.push('btc');

  let appendStr = '';

  chartKeys.forEach(chartKey => {
    appendStr += `<div class="chart-container ${chartKey}">
      <div class="charts-nav">
        <div class="legend">
          <p class="values">ОТКР<span class="open">0</span>МАКС<span class="high">0</span>МИН<span class="low">0</span>ЗАКР<span class="close">0</span><span class="percent">0%</span></p>
        </div>
        <div class="row">
          <div class="chart-periods">
            <div class="1m is_worked is_active" data-period="1m"><span>1M</span></div>
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
      <div class="charts" style="height: ${windowHeight / 2}px"></div>
    </div>`;
  });

  $chartsContainer.append(appendStr);

  const listCharts = [];

  chartKeys.forEach(chartKey => {
    const $chartContainer = $chartsContainer.find(`.chart-container.${chartKey}`);
    const $rootContainer = $chartContainer.find('.charts');

    let chartKeyDoc;

    switch (chartKey) {
      case 'spot': { chartKeyDoc = targetDoc; break; }
      case 'futures': { chartKeyDoc = futuresDoc; break; }

      case 'btc': {
        const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
        chartKeyDoc = btcDoc;
        break;
      }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, DEFAULT_PERIOD, chartKeyDoc);

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
    const calculatedData = indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);

    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;
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
          const percentPerPrice = 100 / (price.open / differenceBetweenHighAndLow);

          $open.text(price.open);
          $close.text(price.close);
          $low.text(price.low);
          $high.text(price.high);
          $percent.text(`${percentPerPrice.toFixed(1)}%`);
        }
      }
    });

    if (chartKey === 'spot') {
      chartCandles.chart.subscribeClick((param) => {
        if (param.time && targetInstrumentVolumeBounds.length) {
          let nearestBoundIndex = -1;

          targetInstrumentVolumeBounds.forEach((bound, index) => {
            if (bound.volume_ended_at_unix < param.time) {
              nearestBoundIndex = index;
            }
          });

          if (~nearestBoundIndex) {
            const $slider = $chartsContainer.find('.chart-slider.is_worked');

            $slider
              .find('span.current-slide')
              .text(nearestBoundIndex + 1);
          }
        }
      });
    }

    listCharts.push(chartCandles);
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

const drawVolumes = ({ instrumentId }, targetInstrumentVolumeBounds = []) => {
  const spotDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const spotChartCandles = spotDoc.chart_candles;

  spotChartCandles.extraSeries.forEach(series => {
    spotChartCandles.removeSeries(series, false);
  });

  if (!targetInstrumentVolumeBounds.length) {
    return true;
  }

  const lTargetInstrumentVolumeBounds = targetInstrumentVolumeBounds.length;

  targetInstrumentVolumeBounds.forEach(bound => {
    const newExtraSeries = spotChartCandles.addExtraSeries({
      lastValueVisible: false,
    });

    spotChartCandles.drawSeries(newExtraSeries, [{
      value: bound.price,
      time: bound.volume_started_at_unix,
    }, {
      value: bound.price,
      time: bound.volume_ended_at_unix,
    }]);
  });

  const $slider = $chartsContainer.find('.chart-slider.spot');

  $slider
    .find('span.amount-slides')
    .text(lTargetInstrumentVolumeBounds);

  scrollToVolume('next', { instrumentId }, targetInstrumentVolumeBounds);
};

const drawTrades = ({ instrumentId }, userTradeBounds = []) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  const futuresChartCandles = futuresDoc.chart_candles;

  futuresChartCandles.extraSeries.forEach(series => {
    futuresChartCandles.removeSeries(series, false);
  });

  if (!userTradeBounds.length) {
    return true;
  }

  const lUserTradeBounds = userTradeBounds.length;

  userTradeBounds.forEach(bound => {
    const boundStartedAtUnix = moment(bound.trade_started_at).utc()
      .startOf('minute').unix();

    let boundEndedAtUnix;

    if (bound.is_active) {
      boundEndedAtUnix = moment().utc().startOf('minute').unix();
    } else {
      boundEndedAtUnix = moment(bound.trade_ended_at).utc()
        .endOf('minute').unix() + 1;
    }

    bound.trade_started_at_unix = boundStartedAtUnix;
    bound.trade_ended_at_unix = boundEndedAtUnix;

    [{ key: 'buy_price', color: '#4CAF50' }, { key: 'sell_price', color: '#FF5252' }]
      .filter(e => bound[e.key])
      .forEach(e => {
        const newExtraSeries = futuresChartCandles.addExtraSeries({
          color: e.color,
          lastValueVisible: false,
        });

        futuresChartCandles.drawSeries(newExtraSeries, [{
          value: bound[e.key],
          time: boundStartedAtUnix,
        }, {
          value: bound[e.key],
          time: boundEndedAtUnix,
        }]);
      });
  });

  const $slider = $chartsContainer.find('.chart-slider.futures');

  $slider
    .find('span.amount-slides')
    .text(lUserTradeBounds);

  // scrollToTrade('next', { instrumentId }, targetInstrumentVolumeBounds);
};

const drawMarkersForVolume = ({ instrumentId }, instrumentVolumeBounds = []) => {
  const spotDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const spotChartCandles = spotDoc.chart_candles;

  spotChartCandles.removeMarkers();

  if (!instrumentVolumeBounds.length) {
    return true;
  }

  instrumentVolumeBounds.forEach(bound => {
    let color, text;

    const lifetime = parseInt((bound.volume_ended_at_unix - bound.volume_started_at_unix) / 60, 10);

    const spotCandleWhereWasEntrance = spotChartCandles.originalData.find(
      candle => candle.originalTimeUnix === bound.first_spot_candle_unix_of_entrance,
    );

    text = `l: ${lifetime}`;

    if (bound.is_ask) {
      color = '#4CAF50';
    } else {
      color = '#FF5252';
    }

    spotChartCandles.addMarker({
      // shape: 'square',
      color,
      time: spotCandleWhereWasEntrance.originalTimeUnix,
      text,
    });
  });

  spotChartCandles.drawMarkers();
};

const drawMarkersForTrades = ({ instrumentId }, userTradeBounds = []) => {
  const futuresDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresChartCandles = futuresDoc.chart_candles;

  futuresChartCandles.removeMarkers();

  if (!userTradeBounds.length) {
    return true;
  }

  const lastFuturesCandle = futuresChartCandles.originalData[futuresChartCandles.originalData.length - 1];

  userTradeBounds.forEach(bound => {
    if (!bound.sell_price) {
      bound.sell_price = lastFuturesCandle.close;
    }

    if (!bound.buy_price) {
      bound.buy_price = lastFuturesCandle.close;
    }

    const profit = bound.sell_price - bound.buy_price;
    const differenceBetweenPrices = Math.abs(profit);
    let percentPerPrice = 100 / (bound.buy_price / differenceBetweenPrices);

    if (profit < 0) {
      percentPerPrice = -percentPerPrice;
    }

    const color = profit < 0 ? '#FF5252' : '#4CAF50';
    const shape = bound.is_long ? 'arrowUp' : 'arrowDown';
    const text = `${(profit * bound.quantity).toFixed(2)} (${percentPerPrice.toFixed(1)}%)`;

    futuresChartCandles.addMarker({
      text,
      shape,
      color,
      time: bound.trade_started_at_unix,
    });
  });

  futuresChartCandles.drawMarkers();
};

const getTargetInstrumentVolumes = ({ instrumentId }) => {
  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
  const spotDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresDoc = instrumentsDocs.find(doc => doc.name === `${spotDoc.name}PERP`);

  const targetInstrumentVolumeBounds = [];

  spotDoc.instrument_volume_bounds.forEach(bound => {
    const volumeStartedAtUnix = moment(bound.volume_started_at).utc()
      .startOf('minute').unix();

    const volumeEndedAtUnix = moment(bound.volume_ended_at).utc()
      .endOf('minute').unix() + 1;

    const differenceBetweenEndAndStart = volumeEndedAtUnix - volumeStartedAtUnix;

    if (differenceBetweenEndAndStart < (limiterLifetime * 60)) {
      return true;
    }

    let spotCandlesPeriod = spotDoc.chart_candles.originalData
      .filter(data =>
        data.originalTimeUnix >= volumeStartedAtUnix
        && data.originalTimeUnix <= volumeEndedAtUnix,
      )
      .sort((a, b) => a.originalTimeUnix < b.originalTimeUnix ? -1 : 1);

    const firstSpotCandleUnix = spotCandlesPeriod[0].originalTimeUnix;

    let numberTouches = 0;
    const volumePrice = parseFloat(bound.price);
    let indexCandleWhereWereEnoughTouches = false;
    const lSpotCandlesPeriod = spotCandlesPeriod.length;

    for (let i = 0; i < lSpotCandlesPeriod; i += 1) {
      const { low, high } = spotCandlesPeriod[i];

      const sidePrice = bound.is_ask ? high : low;
      const numberStepsFromBoundPrice = Math.abs(
        Math.ceil((volumePrice - sidePrice) / spotDoc.tick_size),
      );

      if (numberStepsFromBoundPrice <= limiterDistance) {
        numberTouches += 1;

        if (numberTouches === limiterNumberTouches) {
          indexCandleWhereWereEnoughTouches = i;
        }
      }
    }

    if (numberTouches < limiterNumberTouches) {
      return true;
    }

    spotCandlesPeriod = spotCandlesPeriod.slice(
      indexCandleWhereWereEnoughTouches, lSpotCandlesPeriod,
    );

    const tmpArr = [spotCandlesPeriod[0]];
    let firstSpotCandleOfEntrance = spotCandlesPeriod[0];

    if (spotCandlesPeriod[1]) {
      tmpArr.push(spotCandlesPeriod[1]);
    }

    let indexStartFuturesCandle = futuresDoc.chart_candles.originalData.findIndex(
      fData => fData.originalTimeUnix === spotCandlesPeriod[0].originalTimeUnix,
    );

    if (bound.is_ask && spotCandlesPeriod[0].high > volumePrice) {
      if (!spotCandlesPeriod[1]) {
        return true;
      } else {
        indexStartFuturesCandle += 1;
        firstSpotCandleOfEntrance = spotCandlesPeriod[1];
      }
    } else if (!bound.is_ask && spotCandlesPeriod[0].low < volumePrice) {
      if (!spotCandlesPeriod[1]) {
        return true;
      } else {
        indexStartFuturesCandle += 1;
        firstSpotCandleOfEntrance = spotCandlesPeriod[1];
      }
    }

    const startFuturesCandle = futuresDoc.chart_candles.originalData[indexStartFuturesCandle];

    const targetBtcCandle = btcDoc.indicator_micro_supertrend_data
      .find(data => data.originalTimeUnix === startFuturesCandle.originalTimeUnix);

    const targetFuturesCandle = futuresDoc.indicator_micro_supertrend_data
      .find(data => data.originalTimeUnix === startFuturesCandle.originalTimeUnix);

    let isGreenLight = true;

    if (considerBtcMircoTrend) {
      if ((targetBtcCandle.isLong && bound.is_ask)
        || (!targetBtcCandle.isLong && !bound.is_ask)) {
        isGreenLight = false;
      }
    }

    if (considerFuturesMircoTrend) {
      if ((targetFuturesCandle.isLong && bound.is_ask)
        || (!targetFuturesCandle.isLong && !bound.is_ask)) {
        isGreenLight = false;
      }
    }

    if (!isGreenLight) {
      return true;
    }

    targetInstrumentVolumeBounds.push({
      ...bound,

      number_touches: numberTouches,
      volume_ended_at_unix: volumeEndedAtUnix,
      volume_started_at_unix: volumeStartedAtUnix,
      timelife_in_seconds: differenceBetweenEndAndStart,

      // start candle of volume bound
      first_spot_candle_unix_of_bound: firstSpotCandleUnix,

      // start candle where was entrance
      first_spot_candle_unix_of_entrance: firstSpotCandleOfEntrance.originalTimeUnix,
    });
  });

  return targetInstrumentVolumeBounds;
};

const scrollToVolume = (action, { instrumentId }, instrumentVolumeBounds = []) => {
  if (!targetInstrumentVolumeBounds.length) {
    return true;
  }

  const spotDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const spotChartCandles = spotDoc.chart_candles;

  const $slider = $chartsContainer.find('.chart-slider.spot');
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

  const firstCandleOfBound = spotChartCandles.originalData.find(candle =>
    candle.originalTimeUnix === instrumentVolumeBounds[currentSlide - 1].first_spot_candle_unix_of_bound,
  );

  for (let i = spotChartCandles.originalData.length - 1; i >= 0; i -= 1) {
    if (spotChartCandles.originalData[i].originalTimeUnix === firstCandleOfBound.originalTimeUnix) {
      barsToTargetCandle = spotChartCandles.originalData.length - i; break;
    }
  }

  spotChartCandles.chart
    .timeScale()
    .scrollToPosition(-barsToTargetCandle, false);
};

const scrollToTrade = (action, { instrumentId }, userTradeBounds = []) => {
  if (!userTradeBounds.length) {
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

  const firstCandleOfBound = futuresChartCandles.originalData.find(candle =>
    candle.originalTimeUnix === userTradeBounds[currentSlide - 1].trade_started_at_unix,
  );

  for (let i = futuresChartCandles.originalData.length - 1; i >= 0; i -= 1) {
    if (futuresChartCandles.originalData[i].originalTimeUnix === firstCandleOfBound.originalTimeUnix) {
      barsToTargetCandle = futuresChartCandles.originalData.length - i; break;
    }
  }

  futuresChartCandles.chart
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

  if (!endTime) {
    endTime = new Date().toISOString();
  }

  if (!startTime) {
    startTime = moment().utc().startOf('day').toISOString();
  }

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}`,
    query: {
      instrumentId,
      startTime,
      endTime,
      // isFirstCall: true,
    },
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  console.log('end loading');

  return resultGetCandles.result;
};

const makeReport = ({ instrumentId }, instrumentVolumeBounds = []) => {
  $report.empty();

  if (!targetInstrumentVolumeBounds.length) {
    return true;
  }

  const spotDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const futuresDoc = instrumentsDocs.find(doc => doc.name === `${spotDoc.name}PERP`);

  const spotChartCandles = spotDoc.chart_candles;
  const futuresChartCandles = futuresDoc.chart_candles;

  let appendStr = `<tr>
    <th>#</th>
    <th>Timelife</th>
    <th>Touches</th>
    <th>MaxProfit</th>
  </tr>`;

  instrumentVolumeBounds.forEach((bound, index) => {
    const timelife = parseInt(bound.timelife_in_seconds / 60, 10);

    const spotCandlesPeriod = spotChartCandles.originalData
      .filter(data =>
        data.originalTimeUnix >= bound.volume_started_at_unix
        && data.originalTimeUnix <= bound.volume_ended_at_unix,
      );

    const spotCandleWhereWasEntrance = spotCandlesPeriod.find(
      candle => candle.originalTimeUnix === bound.first_spot_candle_unix_of_entrance,
    );

    const futuresCandleIndexWhereWasEntrance = futuresChartCandles.originalData.findIndex(
      candle => candle.originalTimeUnix === spotCandleWhereWasEntrance.originalTimeUnix,
    );

    const futuresCandleWhereWasEntrance = futuresChartCandles.originalData[futuresCandleIndexWhereWasEntrance];

    const startPrice = bound.is_ask ?
      futuresCandleWhereWasEntrance.high : futuresCandleWhereWasEntrance.low;

    // console.log('start', futuresCandleWhereWasEntrance);

    let minLow = startPrice;
    let maxHigh = startPrice;
    const lDataLength = futuresChartCandles.originalData.length;

    const sumPerPrice = startPrice * (stopLossPercent / 100);
    const startPriceWithStopLoss = bound.is_ask ?
      (startPrice + sumPerPrice) : (startPrice - sumPerPrice);

    for (let i = futuresCandleIndexWhereWasEntrance; i < lDataLength; i += 1) {
      const { low, high } = futuresChartCandles.originalData[i];

      if ((bound.is_ask && high > startPriceWithStopLoss)
        || (!bound.is_ask && low < startPriceWithStopLoss)) {
        // console.log('end', futuresChartCandles.originalData[i]);
        break;
      }

      if (low < minLow) {
        minLow = low;
      }

      if (high > maxHigh) {
        maxHigh = high;
      }
    }

    let maxProfit;

    if (bound.is_ask) {
      const differenceBetweenPrices = startPrice - minLow;

      maxProfit = differenceBetweenPrices < 0 ?
        0 : 100 / (startPrice / differenceBetweenPrices);
    } else {
      const differenceBetweenPrices = maxHigh - startPrice;

      maxProfit = differenceBetweenPrices < 0 ?
        0 : 100 / (startPrice / differenceBetweenPrices);
    }

    // console.log('startPrice', startPrice);
    // console.log('startPriceWithStopLoss', startPriceWithStopLoss);

    // console.log(bound.is_ask, minLow, maxHigh);

    appendStr += `<tr
      data-is-ask="${bound.is_ask}"
      data-time="${bound.volume_ended_at_unix}"
    >
      <td>${index + 1}</td>
      <td>${timelife}</td>
      <td>${bound.number_touches}</td>
      <td>${maxProfit.toFixed(2)}%</td>
    </tr>`;
  });

  $report.append(appendStr);
};
