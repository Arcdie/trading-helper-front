/* global
functions, makeRequest, getUnix,
objects, moment, ChartCandles, IndicatorVolume, IndicatorSuperTrend
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_INSTRUMENT_VOLUME_BOUNDS = '/api/instrument-volume-bounds';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
]);

const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1M');

let limiterLifetime = 2;
let limiterDistance = 0.05;
let limiterNumberTouches = 1;

const windowHeight = window.innerHeight;

let choosenInstrumentId;

let instrumentsDocs = [];

const startTime = moment().utc()
  .startOf('day')
  // .add(-1, 'days');
  .add(-7, 'days');

const endTime = moment.utc()
  .add(-1, 'hours')
  .endOf('hour');

/* JQuery */
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
  $settings.find('.number-touches').val(limiterNumberTouches);

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
    .on('click', '.instrument', async function () {
      const $instrument = $(this);
      const instrumentId = $instrument.data('instrumentid');

      if (choosenInstrumentId === instrumentId) {
        return true;
      }

      $instrumentsList
        .find('.instrument')
        .removeClass('is_active');

      $instrument.addClass('is_active');

      choosenInstrumentId = instrumentId;

      const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

      if (!targetDoc.instrument_volume_bounds || !targetDoc.instrument_volume_bounds.length) {
        const resultGetInstrumentVolumeBounds = await makeRequest({
          method: 'GET',
          url: URL_GET_INSTRUMENT_VOLUME_BOUNDS,
          query: {
            endTime: endTime.toISOString(),
            startTime: startTime.toISOString(),
            instrumentId: targetDoc._id,
          },
        });

        if (!resultGetInstrumentVolumeBounds || !resultGetInstrumentVolumeBounds.status) {
          alert(resultGetInstrumentVolumeBounds.message || 'Cant makeRequest URL_GET_INSTRUMENT_VOLUME_BOUNDS');
          return true;
        }

        targetDoc.instrument_volume_bounds = resultGetInstrumentVolumeBounds.result || [];
      }

      await loadCharts({ instrumentId });
    });

  $chartsContainer
    .on('click', '.chart-slider button', function () {
      if (!choosenInstrumentId) {
        return true;
      }

      const $slider = $(this).closest('.chart-slider');

      const $amountSlides = $slider.find('span.amount-slides');
      const amountSlides = parseInt($amountSlides.text(), 10);

      if (amountSlides === 0) {
        return true;
      }

      scrollTo($(this).attr('class'), choosenInstrumentId);
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
        case 'number-touches': limiterNumberTouches = newValue; break;
        default: break;
      }

      if (choosenInstrumentId) {
        drawVolumes({
          instrumentId: choosenInstrumentId,
        });
      }
    });
});

const renderListInstruments = (instrumentsDocs) => {
  let appendInstrumentsStr = '';

  instrumentsDocs = instrumentsDocs.filter(doc => !doc.is_futures);

  instrumentsDocs
    .filter(doc => !doc.is_futures)
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
    const isWorked = ((targetDoc.is_futures && chartKey === 'futures') || (!targetDoc.is_futures && chartKey === 'spot')) ?
      'is_worked' : '';

    appendStr += `<div class="chart-container ${chartKey} ${isWorked}">
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
          <div class="chart-slider ${isWorked}">
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
    indicatorMicroSuperTrend.calculateAndDraw(chartCandles.originalData);
    // indicatorMacroSuperTrend.calculateAndDraw(chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;
    chartKeyDoc.indicator_micro_supertrend = indicatorMicroSuperTrend;
    // chartKeyDoc.indicator_macro_supertrend = indicatorMacroSuperTrend;

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
        if (param.time && targetDoc.target_instrument_volume_bounds.length) {
          let nearestBoundIndex = -1;

          targetDoc.target_instrument_volume_bounds.forEach((bound, index) => {
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

  drawVolumes({ instrumentId });
  drawMarkers({ instrumentId });
};

const drawVolumes = ({ instrumentId }) => {
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const chartWrapper = targetDoc.chart_candles;

  chartWrapper.extraSeries.forEach(series => {
    chartWrapper.removeSeries(series, false);
  });

  targetDoc.target_instrument_volume_bounds = [];

  targetDoc.instrument_volume_bounds.forEach(bound => {
    const volumeStartedAtUnix = moment(bound.volume_started_at).utc().startOf('minute').unix();
    const volumeEndedAtUnix = moment(bound.volume_ended_at).utc().endOf('minute').add(1, 'seconds').unix();

    const differenceBetweenEndAndStart = volumeEndedAtUnix - volumeStartedAtUnix;

    if (differenceBetweenEndAndStart < (limiterLifetime * 60)) {
      return true;
    }

    const volumePrice = parseFloat(bound.price);

    const targetCandlesPeriod = targetDoc.original_data.filter(data => {
      const timeUnix = getUnix(data.time);
      return timeUnix >= volumeStartedAtUnix && timeUnix <= volumeEndedAtUnix;
    });

    let numberTouches = 0;
    const lTargetPeriod = targetCandlesPeriod.length;

    for (let i = 0; i < lTargetPeriod; i += 1) {
      const [open, close, low, high] = targetCandlesPeriod[i].data;
      const calculatingValue = bound.is_ask ? high : low;

      const differenceBetweenPrices = Math.abs(calculatingValue - volumePrice);
      const percentPerPrice = 100 / (calculatingValue / differenceBetweenPrices);

      if (percentPerPrice <= limiterDistance) {
        numberTouches += 1;
      }
    }

    if (numberTouches < limiterNumberTouches) {
      return true;
    }

    targetDoc.target_instrument_volume_bounds.push({
      ...bound,

      volume_ended_at_unix: volumeEndedAtUnix,
      volume_started_at_unix: volumeStartedAtUnix,

      first_candle: targetCandlesPeriod[0],
    });
  });

  const lTargetInstrumentVolumeBounds = targetDoc.target_instrument_volume_bounds.length;

  if (lTargetInstrumentVolumeBounds) {
    targetDoc.target_instrument_volume_bounds.forEach(bound => {
      const newExtraSeries = chartWrapper.addExtraSeries({
        lastValueVisible: false,
      });

      chartWrapper.drawSeries(newExtraSeries, [{
        value: bound.price,
        time: bound.volume_started_at_unix,
      }, {
        value: bound.price,
        time: bound.volume_ended_at_unix,
      }]);
    });

    const $slider = $chartsContainer.find('.chart-slider.is_worked');

    $slider
      .find('span.amount-slides')
      .text(lTargetInstrumentVolumeBounds);

    scrollTo('next', instrumentId);
  }
};

const drawMarkers = ({ instrumentId }) => {
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const chartWrapper = targetDoc.chart_candles;

  chartWrapper.removeMarkers();

  if (!targetDoc.target_instrument_volume_bounds || !targetDoc.target_instrument_volume_bounds.length) {
    return true;
  }

  targetDoc.target_instrument_volume_bounds.forEach(bound => {
    let color, text;

    const lifetime = parseInt((bound.volume_ended_at_unix - bound.volume_started_at_unix) / 60, 10);

    text = `l: ${lifetime}`;

    if (bound.is_ask) {
      color = '#4CAF50';
    } else {
      color = '#FF5252';
    }

    chartWrapper.addMarker({
      // shape: 'square',
      color,
      time: bound.volume_started_at_unix,
      text,
    });
  });

  chartWrapper.drawMarkers();
};

const scrollTo = (action, instrumentId) => {
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);
  const chartWrapper = targetDoc.chart_candles;

  const $slider = $chartsContainer.find('.chart-slider.is_worked');
  const $currentSlide = $slider.find('span.current-slide');
  const $amountSlides = $slider.find('span.amount-slides');

  let currentSlide = parseInt($currentSlide.text(), 10);
  const amountSlides = parseInt($amountSlides.text(), 10);

  if (action === 'next') {
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
  const targetSlide = targetDoc.target_instrument_volume_bounds[currentSlide - 1].first_candle;
  const timeUnix = getUnix(targetSlide.time);

  for (let i = chartWrapper.originalData.length - 1; i >= 0; i -= 1) {
    if (chartWrapper.originalData[i].originalTimeUnix === timeUnix) {
      barsToTargetCandle = chartWrapper.originalData.length - i; break;
    }
  }

  chartWrapper.chart
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
