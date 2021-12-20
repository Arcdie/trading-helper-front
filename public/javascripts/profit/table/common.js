/* global
functions, makeRequest, getUnix,
objects, moment,
*/

/* Constants */

const URL_GET_USER_TRADE_BOUNDS = '/api/user-trade-bounds';
const URL_GET_ACTIVE_INSTRUMENTS = '/api/instruments/active';

const TYPE_TRADE = 'PRICE_JUMP';

/* JQuery */

const $profitContainer = $('.profit-table');

$(document).ready(async () => {
  const resultGetInstruments = await makeRequest({
    method: 'GET',
    url: URL_GET_ACTIVE_INSTRUMENTS,
    query: {
      isOnlyFutures: true,
    },
  });

  if (!resultGetInstruments || !resultGetInstruments.status) {
    alert(resultGetInstruments.message || 'Cant makeRequest URL_GET_ACTIVE_INSTRUMENTS');
    return true;
  }

  const instrumentsDocs = resultGetInstruments.result;

  const resultGetUserTradeBounds = await makeRequest({
    method: 'GET',
    url: URL_GET_USER_TRADE_BOUNDS,
    query: {
      typeTrade: TYPE_TRADE,
    },
  });

  if (!resultGetUserTradeBounds || !resultGetUserTradeBounds.status) {
    alert(resultGetUserTradeBounds.message || 'Cant makeRequest URL_GET_USER_TRADE_BOUNDS');
    return true;
  }

  const userTradeBounds = resultGetUserTradeBounds.result;

  const arrTimeUnix = [];

  userTradeBounds.forEach(bound => {
    const timeUnix = getUnix(bound.trade_started_at);

    const divider = timeUnix % 86400;
    const startOfDayUnix = timeUnix - divider;

    bound.start_of_day_unix = startOfDayUnix;
    bound.trade_started_at_unix = getUnix(bound.trade_started_at);

    if (!arrTimeUnix.includes(startOfDayUnix)) {
      arrTimeUnix.push(startOfDayUnix);
    }
  });

  let appendStr = '';

  arrTimeUnix
    .sort((a, b) => a > b ? -1 : 1)
    .forEach(timeUnix => {
      appendStr += `<div class="period p-${timeUnix}">
        <table>
          <tr>
            <th>#</th>
            <th>Instrument</th>
            <th>Profit</th>
            <th class="percent">%</th>
            <th>Time</th>
          </tr>
        </table>
      </div>`;
    });

  $profitContainer.empty().append(appendStr);

  arrTimeUnix.forEach(timeUnix => {
    const $periodTable = $profitContainer.find(`.p-${timeUnix} table`);

    const periodBounds = userTradeBounds.filter(
      bound => bound.start_of_day_unix === timeUnix,
    );

    let numberGreen = 0;
    let commonProfit = 0;
    let commonPercent = 0;
    let appendTableStr = '';

    periodBounds
      .sort((a, b) => a.trade_started_at_unix > b.trade_started_at_unix ? -1 : 1)
      .forEach((bound, index) => {
        const futuresDoc = instrumentsDocs.find(doc => doc._id === bound.instrument_id);

        if (!bound.sell_price) {
          bound.sell_price = futuresDoc.price;
        }

        if (!bound.buy_price) {
          bound.buy_price = futuresDoc.price;
        }

        const profit = bound.sell_price - bound.buy_price;
        const differenceBetweenPrices = Math.abs(profit);
        let percentPerPrice = 100 / (bound.buy_price / differenceBetweenPrices);

        if (profit < 0) {
          percentPerPrice = -percentPerPrice;
        }

        let className;

        if (profit < 0) {
          className = 'red';
        } else {
          className = 'green';
          numberGreen += 1;
        }

        const validTime = moment(bound.trade_started_at).format('HH:mm');

        commonPercent += percentPerPrice;
        commonProfit += (profit * bound.quantity);

        appendTableStr += `<tr>
          <td>${index + 1}</td>
          <td>${futuresDoc.name.replace('PERP', '')}</td>
          <td>${(profit * bound.quantity).toFixed(2)}</td>
          <td class="${className}">${percentPerPrice.toFixed(2)}%</td>
          <td>${validTime}</td>
        </tr>`;
      });

    const validDate = moment(timeUnix * 1000).format('DD.MM');

    appendTableStr += `<tr>
      <td></td>
      <td></td>
      <td>${commonProfit.toFixed(2)}</td>
      <td>${commonPercent.toFixed(2)}%</td>
      <td>${validDate}</td>
    </tr>`;

    let greenPercent = 0;

    if (numberGreen > 0) {
      const coefficient = periodBounds.length / numberGreen;
      greenPercent = parseInt((100 / coefficient), 10);
    }

    $periodTable
      .append(appendTableStr)
      .find('th.percent')
      .text(`% (${greenPercent}%)`);
  });
});
