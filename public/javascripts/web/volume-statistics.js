/* global
functions, makeRequest, initPopWindow, getUnix, getRandomNumber,
objects, windows, moment, user,, ChartCandles, ChartVolume, LightweightCharts
*/

/* Constants */

const URL_GET_CANDLES = '/api/candles';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_INSTRUMENT_VOLUME_BOUNDS = '/api/instrument-volume-bounds';

const AVAILABLE_PERIODS = new Map([
  ['1M', '1m'],
]);

const windowHeight = window.innerHeight;

let limiterLifetimeForVolume = 10;
const DEFAULT_PERIOD = AVAILABLE_PERIODS.get('1M');

let choosenInstrumentId;

let instrumentsDocs = [];

/* JQuery */
const $chartsContainer = $('.charts-container');

const $instrumentsContainer = $('.instruments-container');
const $instrumentsList = $instrumentsContainer.find('.instruments-list .list');

$(document).ready(async () => {
  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  const resultGetInstrumentVolumeBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_INSTRUMENT_VOLUME_BOUNDS,
  });

  if (!resultGetInstrumentVolumeBounds || !resultGetInstrumentVolumeBounds.status) {
    alert(resultGetInstrumentVolumeBounds.message || 'Cant makeRequest URL_GET_INSTRUMENT_VOLUME_BOUNDS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;

  renderListInstruments(instrumentsDocs, resultGetInstrumentVolumeBounds.result);

  const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');

  btcDoc.original_data = await getCandlesData({
    period: DEFAULT_PERIOD,
    instrumentId: btcDoc._id,
  });

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

      await loadCharts({ instrumentId });
    });

  $chartsContainer
    .on('keyup', '.volume-timelife input', function () {
      const newValue = parseInt($(this).val(), 10);

      if (!Number.isNaN(newValue)
        && newValue !== limiterLifetimeForVolume) {
        limiterLifetimeForVolume = newValue;

        if (choosenInstrumentId) {
          // $tradesSlider.find('span.current-tick').text(0);

          const targetDoc = instrumentsDocs.find(doc => doc._id === choosenInstrumentId);
          renderListInstruments(instrumentsDocs);
          drawVolumes(targetDoc.chart_candles, targetDoc.instrument_volume_bounds, limiterLifetimeForVolume);
        }
      }
    });
});

const loadCharts = async ({
  instrumentId,
}) => {
  $chartsContainer.empty();
  const targetDoc = instrumentsDocs.find(doc => doc._id === instrumentId);

  let spotDoc = {};
  let futuresDoc = {};

  if (targetDoc.is_futures) {
    futuresDoc = targetDoc;
    const spotName = targetDoc.name.replace('PERP', '');
    spotDoc = instrumentsDocs.find(doc => doc.name === spotName);
  } else {
    spotDoc = targetDoc;
    const futuresName = `${targetDoc.name}PERP`;
    futuresDoc = instrumentsDocs.find(doc => doc.name === futuresName);
  }

  if (!futuresDoc.original_data || !futuresDoc.original_data.length) {
    futuresDoc.original_data = await getCandlesData({
      instrumentId: futuresDoc._id,
      period: DEFAULT_PERIOD,
    });
  }

  if (!targetDoc.is_futures && (!spotDoc.original_data || !spotDoc.original_data.length)) {
    spotDoc.original_data = await getCandlesData({
      instrumentId: spotDoc._id,
      period: DEFAULT_PERIOD,
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
          <div class="volume-slider">
            <button class="previous"><</button>
            <p><span class="current-volume">0</span>/<span class="amount-volume">0</span></p>
            <button class="next">></button>
          </div>
          <div class="volume-timelife">
            <input type="text" value="${limiterLifetimeForVolume}" />
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
      case 'futures': {
        let futuresDoc;

        if (targetDoc.is_futures) {
          futuresDoc = targetDoc;
        } else {
          const futuresName = `${targetDoc.name}PERP`;
          futuresDoc = instrumentsDocs.find(doc => doc.name === futuresName);
        }

        chartKeyDoc = futuresDoc;
        break;
      }

      case 'spot': {
        let spotDoc;

        if (targetDoc.is_futures) {
          const spotName = targetDoc.name.replace('PERP', '');
          spotDoc = instrumentsDocs.find(doc => doc.name === spotName);
        } else {
          spotDoc = targetDoc;
        }

        chartKeyDoc = spotDoc;
        break;
      }

      case 'btc': {
        const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');
        chartKeyDoc = btcDoc;
        break;
      }

      default: break;
    }

    const chartCandles = new ChartCandles($rootContainer, DEFAULT_PERIOD, chartKeyDoc);

    chartCandles.chartKey = chartKey;
    chartCandles.setOriginalData(chartKeyDoc.original_data, false);
    chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

    chartKeyDoc.chart_candles = chartCandles;

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

  const targetChart = !targetDoc.is_futures ?
    listCharts.find(chart => chart.chartKey === 'spot') :
    listCharts.find(chart => chart.chartKey === 'futures');

  // targetChart.chart
  //   .timeScale()
  //   .scrollToPosition(-(targetChart.originalData.length - indexStartPeriod), false);

  drawVolumes(targetChart, targetDoc.instrument_volume_bounds, limiterLifetimeForVolume);
};

const renderListInstruments = (docs, bounds) => {
  let appendInstrumentsStr = '';

  if (bounds) {
    docs.forEach(doc => {
      doc.instrument_volume_bounds = bounds
        .filter(bound => bound.instrument_id === doc._id);
    });
  }

  docs.forEach(doc => {
    doc.target_instrument_volume_bounds = doc.instrument_volume_bounds.filter(bound => {
      const volumeStartedAtUnix = getUnix(bound.volume_started_at);
      const volumeEndedAtUnix = getUnix(bound.volume_ended_at);

      const differenceBetweenEndAndStart = volumeEndedAtUnix - volumeStartedAtUnix;

      if (differenceBetweenEndAndStart >= (limiterLifetimeForVolume * 60)) {
        return true;
      }

      return false;
    });
  });

  docs
    .sort((a, b) => a.target_instrument_volume_bounds.length > b.target_instrument_volume_bounds.length ? -1 : 1)
    .forEach(doc => {
      if (doc.target_instrument_volume_bounds.length === 0) {
        return true;
      }

      appendInstrumentsStr += `<div
        id="instrument-${doc._id}"
        class="instrument"
        data-instrumentid=${doc._id}>
        <span class="instrument-name">${doc.name}</span>
        <span class="amount-volume">${doc.target_instrument_volume_bounds.length}</span>
      </div>`;
    });

  $instrumentsList
    .empty()
    .append(appendInstrumentsStr);
};

const drawVolumes = (chartWrapper, bounds, limiter) => {
  chartWrapper.extraSeries.forEach(series => {
    chartWrapper.removeSeries(series, false);
  });

  bounds.forEach(bound => {
    const volumeStartedAtUnix = moment(bound.volume_started_at).utc().startOf('minute').unix();
    const volumeEndedAtUnix = moment(bound.volume_ended_at).utc().endOf('minute').unix();

    const differenceBetweenEndAndStart = volumeEndedAtUnix - volumeStartedAtUnix;

    if (differenceBetweenEndAndStart < (limiter * 60)) {
      return true;
    }

    const volumePrice = parseFloat(bound.price);
    const newExtraSeries = chartWrapper.addExtraSeries({
      lastValueVisible: false,
    });

    chartWrapper.drawSeries(newExtraSeries, [{
      value: volumePrice,
      time: volumeStartedAtUnix,
    }, {
      value: volumePrice,
      time: volumeEndedAtUnix,
    }]);
  });
};

const getCandlesData = async ({
  instrumentId,
  period,
  endTime,
}) => {
  console.log('start loading');

  if (!endTime) {
    endTime = new Date().toISOString();
  }

  const startTime = moment().utc().startOf('day').toISOString();

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: `${URL_GET_CANDLES}/${period}?instrumentId=${instrumentId}&startTime=${startTime}&endTime=${endTime}`,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || `Cant makeRequest ${URL_GET_CANDLES}`);
    return [];
  }

  console.log('end loading');

  return resultGetCandles.result;
};
