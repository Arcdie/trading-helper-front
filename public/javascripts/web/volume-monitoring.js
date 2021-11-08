/* global
functions, makeRequest, getUnix, initPopWindow,
objects, WebsocketBinance, ChartCandles, moment, windows, wsClient, user
*/

/* Constants */

const URL_UPDATE_USER = '/api/users';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';
const URL_GET_INSTRUMENT_VOLUME_BOUNDS = '/api/instrument-volume-bounds';

const MIN_PERCENT_FOR_NOTIFICATION = 0.2;

let instrumentsDocs = [];
let nowTimestamp = getUnix();
const userTimezone = -(new Date().getTimezoneOffset());

const soundNewVolume = new Audio();
soundNewVolume.src = '/audio/new-level.mp3';

const wsBinanceSpotClient = new WebsocketBinance({ isFutures: false });
const wsBinanceFuturesClient = new WebsocketBinance({ isFutures: true });

/* JQuery */
const $listVolumesSpot = $('#spot .list-volumes');
const $listFavoriteVolumesSpot = $('#spot .favorite-volumes');

const $listVolumesFutures = $('#futures .list-volumes');
const $listFavoriteVolumesFutures = $('#futures .favorite-volumes');

/* Functions */

[wsBinanceSpotClient, wsBinanceFuturesClient].forEach(wsBinanceClient => {
  wsBinanceClient.onmessage = data => {
    const parsedData = JSON.parse(data.data);

    if (!parsedData.s) {
      console.log(`${wsBinanceFuturesClient.connectionName}: ${JSON.stringify(parsedData)}`);
      return true;
    }

    const {
      s: instrumentName,
      k: {
        t: startTime,
        o: open,
        c: close,
        h: high,
        l: low,
      },
    } = parsedData;

    let targetDoc;

    if (wsBinanceClient.isFutures) {
      targetDoc = instrumentsDocs.find(doc => doc.name === `${instrumentName}PERP`);
    } else {
      targetDoc = instrumentsDocs.find(doc => doc.name === instrumentName);
    }

    if (!targetDoc) {
      console.log(`Cant find instumentDoc; instrumentName: ${instrumentName}`);
      return true;
    }

    const validTime = (startTime / 1000) + (userTimezone * 60);

    if (targetDoc.is_favorite
      && Object.keys(targetDoc.chartCandles).length > 0) {
      targetDoc.chartCandles.drawSeries(targetDoc.chartCandles.mainSeries, {
        open: parseFloat(open),
        close: parseFloat(close),
        high: parseFloat(high),
        low: parseFloat(low),
        time: validTime,
      });
    }
  };
});

wsClient.onmessage = async data => {
  if (!instrumentsDocs.length) {
    return true;
  }

  const parsedData = JSON.parse(data.data);

  if (parsedData.actionName === 'updateAverageVolume') {
    console.log('actionName', parsedData.actionName);
  }

  if (parsedData.actionName) {
    switch (parsedData.actionName) {
      case 'newSpotInstrumentPrice': {
        const {
          newPrice,
          instrumentName,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc.name === instrumentName);

        if (targetDoc) {
          targetDoc.price = parseFloat(newPrice.toString());
        }

        break;
      }

      case 'newFuturesInstrumentPrice': {
        const {
          newPrice,
          instrumentName,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc.name === instrumentName);

        if (targetDoc) {
          targetDoc.price = newPrice;
        }

        break;
      }

      case 'newInstrumentVolumeBound': {
        handlerNewInstrumentVolumeBound(parsedData.data);
        break;
      }

      case 'updateInstrumentVolumeBound': {
        const {
          quantity,
          _id: boundId,
          is_ask: isAsk,
          instrument_id: instrumentId,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc._id.toString() === instrumentId);

        if (targetDoc) {
          let targetBound;

          if (isAsk) {
            targetBound = targetDoc.asks.find(
              bound => bound._id.toString() === boundId.toString(),
            );
          } else {
            targetBound = targetDoc.bids.find(
              bound => bound._id.toString() === boundId.toString(),
            );
          }

          if (!targetBound) {
            handlerNewInstrumentVolumeBound(parsedData.data);
            break;
          }

          const $bound = $(`#bound-${boundId}`);

          const differenceBetweenPriceAndOrder = Math.abs(targetDoc.price - targetBound.price);
          const percentPerPrice = 100 / (targetDoc.price / differenceBetweenPriceAndOrder);

          targetBound.quantity = quantity;
          targetBound.price_original_percent = percentPerPrice;

          if (targetBound.is_processed
            && percentPerPrice > MIN_PERCENT_FOR_NOTIFICATION) {
            targetBound.is_processed = false;
            $bound.removeClass('not_processed');
          }

          if (percentPerPrice <= MIN_PERCENT_FOR_NOTIFICATION
            && !targetBound.is_processed) {
            targetBound.is_processed = true;
            $bound.addClass('not_processed');

            if (!targetDoc.is_favorite) {
              soundNewVolume.play();
            }
          }

          $bound.find('.quantity span').text(formatNumberToPretty(targetBound.quantity));
          $bound.find('.price .percent').text(`${percentPerPrice.toFixed(1)}%`);

          if (!targetDoc.is_favorite) {
            recalculateOrderVolume({
              isFutures: targetDoc.is_futures,
            });
          }
        }

        break;
      }

      case 'deactivateInstrumentVolumeBound': {
        const {
          _id: boundId,
          is_ask: isAsk,
          instrument_id: instrumentId,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc._id.toString() === instrumentId);

        if (targetDoc) {
          if (targetDoc.is_favorite) {
            const targetSeries = targetDoc.chartCandles.extraSeries.find(
              series => series.options().boundId === boundId,
            );

            console.log('targetSeries', targetSeries);

            if (targetSeries) {
              targetDoc.chartCandles.removeSeries(targetSeries, false);
            }
          }

          if (isAsk) {
            targetDoc.asks = targetDoc.asks.filter(
              bound => bound._id.toString() !== boundId.toString(),
            );
          } else {
            targetDoc.bids = targetDoc.bids.filter(
              bound => bound._id.toString() !== boundId.toString(),
            );
          }

          $(`#bound-${boundId}`).remove();

          if (!targetDoc.asks.length && !targetDoc.bids.length) {
            targetDoc.is_rendered = false;
            targetDoc.is_favorite = false;
            targetDoc.is_processed = false;
            $(`#instrument-${instrumentId}`).remove();
          }

          if (!targetDoc.is_favorite) {
            recalculateOrderVolume({
              isFutures: targetDoc.is_futures,
            });
          }
        }

        break;
      }

      case 'updateAverageVolume': {
        const {
          instrumentId,
          averageVolumeForLast24Hours,
          averageVolumeForLast15Minutes,
        } = parsedData.data;

        const targetDoc = instrumentsDocs.find(doc => doc._id.toString() === instrumentId);

        if (targetDoc) {
          const $instrument = $(`#instrument-${instrumentId}`);
          const $volume = $instrument.find('.volume');

          if (averageVolumeForLast15Minutes) {
            targetDoc.average_volume_for_last_15_minutes = parseInt(averageVolumeForLast15Minutes, 10);
            $volume.find('.average-15m span').text(formatNumberToPretty(targetDoc.average_volume_for_last_15_minutes));
          }

          if (averageVolumeForLast24Hours) {
            targetDoc.average_volume_for_last_24_hours = parseInt(averageVolumeForLast24Hours, 10);
            $volume.find('.average-24h span').text(formatNumberToPretty(parseInt(targetDoc.average_volume_for_last_24_hours / 2, 10)));
          }
        }

        break;
      }

      default: break;
    }
  }
};

$(document).ready(async () => {
  wsClient.onopen = () => {
    wsClient.send(JSON.stringify({
      actionName: 'subscribe',
      data: {
        subscriptionsNames: [
          'newInstrumentVolumeBound',
          'updateInstrumentVolumeBound',
          'deactivateInstrumentVolumeBound',
          'newSpotInstrumentPrice',
          'newFuturesInstrumentPrice',
          'updateAverageVolume',
        ],
      },
    }));
  };

  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  const resultGetBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_INSTRUMENT_VOLUME_BOUNDS,
  });

  if (!resultGetBounds || !resultGetBounds.status) {
    alert(resultGetBounds.message || 'Cant URL_GET_INSTRUMENT_VOLUME_BOUNDS');
    return true;
  }

  instrumentsDocs = resultGetInstruments.result;
  const instrumentVolumeBounds = resultGetBounds.result;

  instrumentsDocs.forEach(doc => {
    doc.asks = instrumentVolumeBounds
      .filter(bound => bound.instrument_id.toString() === doc._id.toString() && bound.is_ask)
      .sort((a, b) => a.price > b.price ? -1 : 1);

    doc.bids = instrumentVolumeBounds
      .filter(bound => bound.instrument_id.toString() === doc._id.toString() && !bound.is_ask)
      .sort((a, b) => a.price > b.price ? -1 : 1);

    [...doc.asks, ...doc.bids].forEach(bound => {
      const differenceBetweenPriceAndOrder = Math.abs(doc.price - bound.price);
      const percentPerPrice = 100 / (doc.price / differenceBetweenPriceAndOrder);

      bound.price_original_percent = percentPerPrice;
      bound.lifetime = parseInt((nowTimestamp - bound.created_at) / 60, 10);
    });

    doc.is_rendered = false;
    doc.is_favorite = false;
  });

  instrumentsDocs
    .filter(doc => doc.asks.length || doc.bids.length)
    .forEach(doc => { addNewInstrument(doc); });

  recalculateOrderVolume({ isFutures: true });
  recalculateOrderVolume({ isFutures: false });

  // update prices and calculate percents
  setInterval(updatePrices, 10 * 1000);

  // update bounds lifetime
  setInterval(updateLifetimes, 60 * 1000); // 1 minute

  // update timestampt
  setInterval(() => { nowTimestamp = getUnix(); }, 1000);

  [$listVolumesSpot, $listVolumesFutures].forEach(elem => {
    $(elem).on('click', 'span.instrument-name', function () {
      const $instrument = $(this).closest('.instrument');

      const instrumentId = $instrument.data('instrumentid');
      const targetDoc = instrumentsDocs.find(doc => doc._id.toString() === instrumentId);

      targetDoc.is_favorite = true;

      $instrument.remove();
      addNewInstrument(targetDoc);
    });
  });

  [$listFavoriteVolumesSpot, $listFavoriteVolumesFutures].forEach(elem => {
    $(elem).on('click', 'span.instrument-name', function () {
      const $instrument = $(this).closest('.instrument-extended');

      const instrumentId = $instrument.data('instrumentid');
      const targetDoc = instrumentsDocs.find(doc => doc._id.toString() === instrumentId);

      targetDoc.is_favorite = false;
      targetDoc.chartCandles = {};

      if (targetDoc.is_futures) {
        let streamName = targetDoc.name.replace('PERP', '').toLowerCase();
        streamName = `${streamName}@kline_1m`;
        wsBinanceFuturesClient.removeStream(streamName);
      } else {
        let streamName = targetDoc.name.toLowerCase();
        streamName = `${streamName}@kline_1m`;
        wsBinanceSpotClient.removeStream(streamName);
      }

      $instrument.remove();
      addNewInstrument(targetDoc);
      recalculateOrderVolume({ isFutures: targetDoc.is_futures });
    });
  });

  $('.settings')
    .on('click', () => {
      initPopWindow(windows.getVolumeMonitoringSettings(user.volume_monitoring_settings || {}));
    });

  $('.md-content')
    .on('click', '.volume-monitroing-settings #save-settings', async function () {
      const doSpotSortByLifetime = $('#do_spot_sort_by_lifetime').is(':checked');
      const doFuturesSortByLifetime = $('#do_futures_sort_by_lifetime').is(':checked');
      const doSpotSortByDistanceToPrice = $('#do_spot_sort_by_distace_to_price').is(':checked');
      const doFuturesSortByDistanceToPrice = $('#do_futures_sort_by_distace_to_price').is(':checked');

      $(this).prop('disabled', true);

      const resultUpdate = await makeRequest({
        method: 'PATCH',
        url: `${URL_UPDATE_USER}/${user._id}`,
        body: {
          doSpotSortByLifetime,
          doFuturesSortByLifetime,
          doSpotSortByDistanceToPrice,
          doFuturesSortByDistanceToPrice,
        },
      });

      if (!resultUpdate || !resultUpdate.status) {
        alert(resultUpdate.message || 'Couldnt makeRequest URL_UPDATE_USER');
        return false;
      }

      user.volume_monitoring_settings = {
        do_spot_sort_by_lifetime: doSpotSortByLifetime,
        do_futures_sort_by_lifetime: doFuturesSortByLifetime,
        do_spot_sort_by_distace_to_price: doSpotSortByDistanceToPrice,
        do_futures_sort_by_distace_to_price: doFuturesSortByDistanceToPrice,
      };

      recalculateOrderVolume({ isFutures: true });
      recalculateOrderVolume({ isFutures: false });

      $(this).prop('disabled', false);

      $('.shadow').click();
    });
});

const addNewInstrument = (instrumentDoc) => {
  const $container = getInstrumentContainer(instrumentDoc);
  const typeClassForInstrument = !instrumentDoc.is_favorite ? 'instrument' : 'instrument-extended';

  $container.append(`<div
    class="${typeClassForInstrument}"
    id="instrument-${instrumentDoc._id}"
    data-instrumentid="${instrumentDoc._id}"
    style="order: ${instrumentDoc.index_order || instrumentsDocs.length}"
  >
    <span class="instrument-name">${instrumentDoc.name}</span>

    <div class="asks"></div>
    <div class="instrument-price"><span>${instrumentDoc.price}</span></div>
    <div class="bids"></div>

    <div class="volume">
      <p class="average-15m">
        15M объем: <span>${formatNumberToPretty(parseInt(instrumentDoc.average_volume_for_last_15_minutes, 10))}</span>
      </p>

      <p class="average-24h">
        24H объем: <span>${formatNumberToPretty(parseInt(instrumentDoc.average_volume_for_last_24_hours / 2, 10))}</span>
      </p>
    </div>

    <div id="chart-${instrumentDoc._id}" class="chart">
      <span class="ruler">0%</span>
    </div>
  </div>`);

  instrumentDoc.is_rendered = true;

  instrumentDoc.asks.forEach((bound, index) => {
    addNewVolumeToInstrument(instrumentDoc, bound, index);
  });

  instrumentDoc.bids.forEach((bound, index) => {
    addNewVolumeToInstrument(instrumentDoc, bound, index);
  });

  if (instrumentDoc.is_favorite) {
    loadChart(instrumentDoc);
  }
};

const addNewVolumeToInstrument = (instrument, bound, index) => {
  const $instrument = $(`#instrument-${instrument._id}`);

  const isProcessed = bound.price_original_percent <= MIN_PERCENT_FOR_NOTIFICATION;

  const blockWithLevel = `<div
    class="level ${isProcessed ? 'not_processed' : ''}"
    id="bound-${bound._id}"
  >
    <div class="quantity"><span>${formatNumberToPretty(bound.quantity)}</span></div>
    <div class="lifetime"><span>${formatMinutesToPretty(bound.lifetime)}</span></div>
    <div class="price"><span class="price_original">${bound.price}</span><span class="percent">${bound.price_original_percent.toFixed(1)}%</span></div>
  </div>`;

  if (bound.is_ask) {
    const $asks = $instrument.find('.asks');

    if (index === 0) {
      $asks.prepend(blockWithLevel);
    } else {
      $asks
        .find('.level')
        .eq(index - 1)
        .after(blockWithLevel);
    }
  } else {
    const $bids = $instrument.find('.bids');

    if (index === 0) {
      $bids.prepend(blockWithLevel);
    } else {
      $bids
        .find('.level')
        .eq(index - 1)
        .after(blockWithLevel);
    }
  }
};

const updatePrices = () => {
  instrumentsDocs.forEach(doc => {
    const $instrument = $(`#instrument-${doc._id}`);

    [...doc.asks, ...doc.bids].forEach(bound => {
      const differenceBetweenPriceAndOrder = Math.abs(doc.price - bound.price);
      const percentPerPrice = 100 / (doc.price / differenceBetweenPriceAndOrder);
      $(`#bound-${bound._id} .price .percent`).text(`${percentPerPrice.toFixed(1)}%`);
    });

    $instrument
      .find('.instrument-price span')
      .text(doc.price);
  });
};

const updateLifetimes = () => {
  instrumentsDocs.forEach(doc => {
    [...doc.asks, ...doc.bids].forEach(bound => {
      bound.lifetime = parseInt((nowTimestamp - bound.created_at) / 60, 10);
      $(`#bound-${bound._id} .lifetime span`).text(formatMinutesToPretty(bound.lifetime));
    });
  });
};

const handlerNewInstrumentVolumeBound = (newBound) => {
  const {
    _id: boundId,
    is_ask: isAsk,
    instrument_id: instrumentId,
  } = newBound;

  const instrumentDoc = instrumentsDocs.find(
    doc => doc._id.toString() === instrumentId.toString(),
  );

  if (!instrumentDoc) {
    alert(`No instrument; instrumentId: ${instrumentDoc._id}`);
    return false;
  }

  if (!instrumentDoc.is_rendered) {
    addNewInstrument(instrumentDoc);
    instrumentDoc.is_rendered = true;
  }

  if (instrumentDoc.is_favorite) {
    const startOfMinute = (newBound.created_at - (newBound.created_at % 60)) + (userTimezone * 60);
    const validEndTime = instrumentDoc.chartCandles.originalData[instrumentDoc.chartCandles.originalData.length - 1].originalTimeUnix + 2629743;

    const newExtraSeries = instrumentDoc.chartCandles.addExtraSeries({
      boundId,
    });

    instrumentDoc.chartCandles.drawSeries(newExtraSeries, [{
      value: newBound.price,
      time: startOfMinute,
    }, {
      value: newBound.price,
      time: validEndTime,
    }]);
  }

  let indexOfElement = 0;

  const differenceBetweenPriceAndOrder = Math.abs(instrumentDoc.price - newBound.price);
  const percentPerPrice = 100 / (instrumentDoc.price / differenceBetweenPriceAndOrder);

  newBound.price_original_percent = percentPerPrice;
  newBound.lifetime = parseInt((nowTimestamp - newBound.created_at) / 60, 10);

  if (isAsk) {
    instrumentDoc.asks.push(newBound);
    instrumentDoc.asks = instrumentDoc.asks
      .sort((a, b) => {
        if (a.price > b.price) return -1;
        return 1;
      });

    indexOfElement = instrumentDoc.asks.findIndex(
      bound => bound._id.toString() === boundId.toString(),
    );
  } else {
    instrumentDoc.bids.push(newBound);
    instrumentDoc.bids = instrumentDoc.bids
      .sort((a, b) => {
        if (a.price > b.price) return -1;
        return 1;
      });

    indexOfElement = instrumentDoc.bids.findIndex(
      bound => bound._id.toString() === boundId.toString(),
    );
  }

  addNewVolumeToInstrument(instrumentDoc, newBound, indexOfElement);
};

const recalculateOrderVolume = ({
  isFutures,
}) => {
  let indexOrder = 1;

  let sortFunc;

  if (!isFutures) {
    if (user.volume_monitoring_settings.do_spot_sort_by_distace_to_price
      && user.volume_monitoring_settings.do_spot_sort_by_lifetime) {
      sortFunc = sortByDistaceToPriceAndLifetime;
    } else if (user.volume_monitoring_settings.do_spot_sort_by_distace_to_price) {
      sortFunc = sortByDistaceToPrice;
    } else if (user.volume_monitoring_settings.do_spot_sort_by_lifetime) {
      sortFunc = sortByLifeTimeVolume;
    }
  } else {
    if (user.volume_monitoring_settings.do_futures_sort_by_distace_to_price
      && user.volume_monitoring_settings.do_futures_sort_by_lifetime) {
      sortFunc = sortByDistaceToPriceAndLifetime;
    } else if (user.volume_monitoring_settings.do_futures_sort_by_distace_to_price) {
      sortFunc = sortByDistaceToPrice;
    } else if (user.volume_monitoring_settings.do_futures_sort_by_lifetime) {
      sortFunc = sortByLifeTimeVolume;
    }
  }

  instrumentsDocs
    .filter(doc => doc.is_rendered && !doc.is_favorite && doc.is_futures === isFutures)
    .sort(sortFunc)
    .forEach(doc => {
      if (doc.index_order !== indexOrder) {
        const $instrument = $(`#instrument-${doc._id}`);
        $instrument.css('order', indexOrder);
      }

      indexOrder += 1;
    });
};

const getInstrumentContainer = (instrumentDoc) => {
  let $container;

  if (!instrumentDoc.is_futures) {
    $container = instrumentDoc.is_favorite ? $listFavoriteVolumesSpot : $listVolumesSpot;
  } else {
    $container = instrumentDoc.is_favorite ? $listFavoriteVolumesFutures : $listVolumesFutures;
  }

  return $container;
};

const sortByDistaceToPrice = (a, b) => {
  let minPercentAskA = 100;
  let minPercentBidA = 100;

  let minPercentAskB = 100;
  let minPercentBidB = 100;

  let minPercentAsk = 100;
  let minPercentBid = 100;

  if (a.asks.length) {
    minPercentAskA = a.asks[a.asks.length - 1].price_original_percent;
  }

  if (a.bids.length) {
    minPercentBidA = a.bids[0].price_original_percent;
  }

  if (b.asks.length) {
    minPercentAskB = b.asks[b.asks.length - 1].price_original_percent;
  }

  if (b.bids.length) {
    minPercentBidB = b.bids[0].price_original_percent;
  }

  minPercentAsk = minPercentAskA <= minPercentBidA ? minPercentAskA : minPercentBidA;
  minPercentBid = minPercentAskB <= minPercentBidB ? minPercentAskB : minPercentBidB;

  return minPercentAsk < minPercentBid ? -1 : 1;
};

const sortByLifeTimeVolume = (a, b) => {
  let maxLifetimeAskA = 0;
  let maxLifetimeBidA = 0;

  let maxLifetimeAskB = 0;
  let maxLifetimeBidB = 0;

  let maxLifetimeAsk = 0;
  let maxLifetimeBid = 0;

  if (a.asks.length) {
    a.asks.forEach(ask => {
      if (ask.lifetime > maxLifetimeAskA) {
        maxLifetimeAskA = ask.lifetime;
      }
    });
  }

  if (a.bids.length) {
    a.bids.forEach(bid => {
      if (bid.lifetime > maxLifetimeBidA) {
        maxLifetimeBidA = bid.lifetime;
      }
    });
  }

  if (b.asks.length) {
    b.asks.forEach(ask => {
      if (ask.lifetime > maxLifetimeAskB) {
        maxLifetimeAskB = ask.lifetime;
      }
    });
  }

  if (b.bids.length) {
    b.bids.forEach(bid => {
      if (bid.lifetime > maxLifetimeBidB) {
        maxLifetimeBidB = bid.lifetime;
      }
    });
  }

  maxLifetimeAsk = maxLifetimeAskA >= maxLifetimeBidA ? maxLifetimeAskA : maxLifetimeBidA;
  maxLifetimeBid = maxLifetimeAskB >= maxLifetimeBidB ? maxLifetimeAskB : maxLifetimeBidB;

  return maxLifetimeAsk > maxLifetimeBid ? -1 : 1;
};

const sortByDistaceToPriceAndLifetime = (a, b) => {
  const resultSortByDistaceToPrice = sortByDistaceToPrice(a, b);
  const resultSortByLifeTimeVolume = sortByLifeTimeVolume(a, b);

  if (resultSortByDistaceToPrice === 1 && resultSortByLifeTimeVolume === 1) {
    return 1;
  }

  return 0;
};

const formatNumberToPretty = n => {
  if (n < 1e3) return n;
  if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(1) + 'K';
  if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(1) + 'M';
  if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(1) + 'B';
  if (n >= 1e12) return +(n / 1e12).toFixed(1) + 'T';
};

const formatMinutesToPretty = numberMinutes => {
  numberMinutes = parseInt(numberMinutes, 10);

  let hours = Math.floor(numberMinutes / 60);
  let minutes = numberMinutes % 60;

  if (hours.toString().length === 1) {
    hours = `0${hours}`;
  }

  if (minutes.toString().length === 1) {
    minutes = `0${minutes}`;
  }

  return `${hours}:${minutes}`;
};

const loadChart = async (instrumentDoc) => {
  console.log('start loading');

  const resultGetCandles = await get1mCandlesCandlesFromBinance({
    symbol: instrumentDoc.name,
    isFutures: instrumentDoc.is_futures,
  });

  if (!resultGetCandles || !resultGetCandles.status) {
    alert(resultGetCandles.message || 'Cant get1mCandlesCandlesFromBinance');
    return true;
  }

  console.log('end loading');

  const $rootContainer = $(`#chart-${instrumentDoc._id}`);
  const $ruler = $rootContainer.find('span.ruler');

  $rootContainer
    .css({ height: $rootContainer.width() });

  const chartCandles = new ChartCandles($rootContainer, '1m', instrumentDoc);

  chartCandles.setOriginalData(resultGetCandles.result);
  chartCandles.drawSeries(chartCandles.mainSeries, chartCandles.originalData);

  chartCandles.chart.applyOptions({
    timeScale: {
      timeVisible: true,
    },
  });

  chartCandles.chart.subscribeCrosshairMove((param) => {
    if (param.point) {
      const coordinateToPrice = chartCandles.mainSeries.coordinateToPrice(param.point.y);
      const differenceBetweenInstrumentAndCoordinatePrices = Math.abs(instrumentDoc.price - coordinateToPrice);
      const percentPerPrice = 100 / (instrumentDoc.price / differenceBetweenInstrumentAndCoordinatePrices);

      $ruler
        .text(`${percentPerPrice.toFixed(1)}%`)
        .css({
          top: param.point.y - 25,
          left: param.point.x + 15,
        });
    }

    /*
    if (param.time) {
      const price = param.seriesPrices.get(chartCandles.mainSeries);

      if (price) {
        // $open.text(price.open);
        // $close.text(price.close);
        // $low.text(price.low);
        // $high.text(price.high);
      }
    }
    */
  });

  const validEndTime = chartCandles.originalData[chartCandles.originalData.length - 1].originalTimeUnix + 2629743;

  [...instrumentDoc.asks, ...instrumentDoc.bids]
    .forEach(volume => {
      const volumePrice = parseFloat(volume.price);
      const startOfMinute = (volume.created_at - (volume.created_at % 60)) + (userTimezone * 60);

      const newExtraSeries = chartCandles.addExtraSeries({
        boundId: volume.bound_id,
      });

      chartCandles.drawSeries(newExtraSeries, [{
        value: volumePrice,
        time: startOfMinute,
      }, {
        value: volumePrice,
        time: validEndTime,
      }]);
    });

  if (instrumentDoc.is_futures) {
    let streamName = instrumentDoc.name.replace('PERP', '').toLowerCase();
    streamName = `${streamName}@kline_1m`;
    wsBinanceFuturesClient.addStream(streamName);
  } else {
    let streamName = instrumentDoc.name.toLowerCase();
    streamName = `${streamName}@kline_1m`;
    wsBinanceSpotClient.addStream(streamName);
  }

  instrumentDoc.chartCandles = chartCandles;
};

const get1mCandlesCandlesFromBinance = async ({
  symbol,
  isFutures,
}) => {
  if (isFutures) {
    symbol = symbol.replace('PERP', '');
  }

  const queryParams = `symbol=${symbol}&interval=1m&limit=99`;

  const link = isFutures ?
    `https://fapi.binance.com/fapi/v1/klines?${queryParams}` :
    `https://api.binance.com/api/v3/klines?${queryParams}`;

  const resultGetCandles = await makeRequest({
    method: 'GET',
    url: link,
    // settings: {
    //   mode: 'no-cors',
    // },
  });

  if (!resultGetCandles) {
    return {
      status: false,
      message: 'Cant get 1m candles',
    };
  }

  const result = [];

  resultGetCandles.forEach(candle => {
    const [
      startTimeBinance,
      open,
      high,
      low,
      close,
      volume,
      // closeTime,
    ] = candle;

    result.push({
      data: [
        parseFloat(open),
        parseFloat(close),
        parseFloat(low),
        parseFloat(high),
      ],
      volume: parseFloat(volume),
      time: new Date(startTimeBinance).toISOString(),
    });
  });

  return {
    status: true,
    result,
  };
};
