/* global
functions, makeRequest, getUnix,
objects, moment, WebsocketBinance,
*/

/* Constants */

const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const AVAILABLE_PERIODS = new Map([
  ['1m', '1m'],
  ['5m', '5m'],
  ['1h', '1h'],
  ['1d', '1d'],
]);

/* Variables */

let instrumentsDocs = [];
const instrumentsMapper = new Map();

let choosenPeriod = AVAILABLE_PERIODS.get('5m');

let periodInterval;
let wsBinanceFuturesClient;

const urlSearchParams = new URLSearchParams(window.location.search);
const params = Object.fromEntries(urlSearchParams.entries());

/* JQuery */
const $container = $('.container');

$(document).ready(async () => {
  if (params.interval) {
    if (!AVAILABLE_PERIODS.get(params.interval)) {
      alert('Undefined interval');
      return true;
    }

    choosenPeriod = AVAILABLE_PERIODS.get(params.interval);
  }

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
    // .filter(d => ['BTCUSDTPERP', 'AAVEUSDTPERP'].includes(d.name));

  connectToBinance();
  setPeriodInterval();

  setInterval(() => {
    const $lastPeriod = $container.find('.period').first();

    instrumentsDocs.forEach(doc => {
      const currentPrice = doc.price;
      const lastClose = instrumentsMapper.get(doc._id);

      if (!lastClose) {
        return true;
      }

      const differenceBetweenValues = (currentPrice - lastClose);
      const percentPerPrice = 100 / (lastClose / differenceBetweenValues);

      doc.correlationPercent = percentPerPrice;
    });

    instrumentsDocs
      .sort((a, b) => a.correlationPercent > b.correlationPercent ? -1 : 1)
      .forEach((doc, index) => {
        const $elem = $lastPeriod.find(`.instrument.${doc.name}`);

        if ($elem) {
          const $span = $elem.find('span');
          $span.text(`${doc.correlationPercent.toFixed(2)}%`);

          $elem.css('order', index);

          if (doc.correlationPercent < 0) {
            $elem
              .removeClass('green')
              .addClass('red');
          } else {
            $elem
              .removeClass('red')
              .addClass('green');
          }
        }
      });

    const btcDoc = instrumentsDocs.find(doc => doc.name === 'BTCUSDTPERP');

    const $elem = $lastPeriod.find('.btc');
    $elem.find('span').text(`${btcDoc.correlationPercent.toFixed(2)}%`);

    if (btcDoc.correlationPercent < 0) {
      $elem
        .removeClass('green')
        .addClass('red');
    } else {
      $elem
        .removeClass('red')
        .addClass('green');
    }
  }, 3 * 1000);

  $container
    .on('click', '.instrument a', function () {
      const area = document.createElement('textarea');
      document.body.appendChild(area);
      area.value = $(this).text();
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    });
});

/* Functions */

const addPeriod = (timeUnix) => {
  let instrumentsStr = '';

  instrumentsDocs
    .filter(doc => doc.name !== 'BTCUSDTPERP')
    .forEach((doc, index) => {
      instrumentsStr += `<div class="instrument ${doc.name}" style="order: ${index};">
        <a>${doc.name.replace('PERP', '')}</a>
        <span>0.00%</span>
      </div>`;
    });

  $container.prepend(`<div class="period">
    <div class="time"><span>${moment.unix(timeUnix).format('HH:mm')}</span></div>
    <div class="btc"><a>BTC</a><span>0.00%</span></div>
    <div class="instruments">${instrumentsStr}</div>
  </div>`);
};

const setPeriodInterval = () => {
  if (periodInterval) {
    clearInterval(periodInterval);
  }

  $container.empty();

  instrumentsDocs.forEach(doc => {
    doc.correlationPercent = 0;
    instrumentsMapper.delete(doc._id);
  });

  let interval;
  let periodTimeUnix;
  let startOfNextPeriodTimeUnix;

  if (choosenPeriod === AVAILABLE_PERIODS.get('1m')) {
    interval = 1 * 60;

    periodTimeUnix = moment().startOf('minute').unix();
    startOfNextPeriodTimeUnix = periodTimeUnix + 60;
  } else if (choosenPeriod === AVAILABLE_PERIODS.get('5m')) {
    const coeff = 5 * 60 * 1000;
    startOfNextPeriodTimeUnix = ((Math.ceil((getUnix() * 1000) / coeff) * coeff) / 1000);
    periodTimeUnix = startOfNextPeriodTimeUnix - 300;

    interval = 5 * 60;
  } else if (choosenPeriod === AVAILABLE_PERIODS.get('1h')) {
    periodTimeUnix = moment().startOf('hour').unix();
    startOfNextPeriodTimeUnix = periodTimeUnix + 3600;
    interval = 1 * 60 * 60;
  } else if (choosenPeriod === AVAILABLE_PERIODS.get('1d')) {
    periodTimeUnix = moment().startOf('day').unix();
    startOfNextPeriodTimeUnix = periodTimeUnix + 86400;
    interval = 1 * 24 * 60 * 60;
  }

  addPeriod(periodTimeUnix);

  setTimeout(() => {
    addPeriod(startOfNextPeriodTimeUnix);
    startOfNextPeriodTimeUnix += interval;

    periodInterval = setInterval(() => {
      addPeriod(startOfNextPeriodTimeUnix);
      startOfNextPeriodTimeUnix += ((startOfNextPeriodTimeUnix + interval) / 1000);
    }, interval * 1000);
  }, (startOfNextPeriodTimeUnix - getUnix()) * 1000);
};

const connectToBinance = () => {
  const streams = instrumentsDocs.map(doc => {
    const cutName = doc.name.toLowerCase().replace('perp', '');
    return `${cutName}@kline_${choosenPeriod}/`;
  });

  wsBinanceFuturesClient = new WebsocketBinance({ isFutures: true }, streams);

  wsBinanceFuturesClient.onmessage = data => {
    const parsedData = JSON.parse(data.data).data;

    if (!parsedData || !parsedData.s) {
      console.log(`${wsBinanceFuturesClient.connectionName}:`, data.data);
      return true;
    }

    const {
      s: instrumentName,
      k: {
        // t: startTime,
        o: open,
        c: close,
        // h: high,
        // l: low,
        x: isClosed,
      },
    } = parsedData;

    const validClose = parseFloat(close);
    const instrumentDoc = instrumentsDocs.find(doc => doc.name === `${instrumentName}PERP`);

    if (!instrumentDoc) {
      console.log(`Cant find instumentDoc; instrumentName: ${instrumentName}`);
      return true;
    }

    instrumentDoc.price = validClose;

    if (!instrumentsMapper.get(instrumentDoc._id)) {
      instrumentsMapper.set(instrumentDoc._id, parseFloat(open));
    }

    if (isClosed) {
      instrumentsMapper.set(instrumentDoc._id, validClose);
    }
  };
};
