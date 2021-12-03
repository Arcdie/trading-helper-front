/* global
functions, makeRequest, getUnix,
objects, moment,
*/

/* Constants */
const MIN_PROFIT = 0.3;
const MIN_GREEN_PERCENT = 80;
const MIN_AMOUNT_STATISTICS = 1;

let statisticsData = [];

/* JQuery */
const $container = $('.container');

/* Functions */

$(document).ready(async () => {
  statisticsData = await getFile('volume-spot-statistics');

  let mainPeriods = [];

  statisticsData.forEach(data => {
    const lStatistics = data.statistics.length;

    if (!lStatistics || lStatistics < MIN_AMOUNT_STATISTICS) {
      statisticsData = statisticsData.filter(
        tmp => tmp.instrumentName !== data.instrumentName,
      );

      return true;
    }

    let numberGreen = 0;

    data.statistics.forEach(statistics => {
      const isGreen = statistics.profit >= MIN_PROFIT;

      if (isGreen) {
        numberGreen += 1;
      }

      const divider = statistics.time % 86400;
      const startOfDayUnix = statistics.time - divider;

      if (!mainPeriods.includes(startOfDayUnix)) {
        mainPeriods.push(startOfDayUnix);
      }
    });

    if (numberGreen === 0) {
      data.greenPercent = 0;
      return true;
    }

    const coefficient = lStatistics / numberGreen;
    data.greenPercent = parseFloat((100 / coefficient).toFixed(2));

    if (data.greenPercent < MIN_GREEN_PERCENT) {
      statisticsData = statisticsData.filter(
        tmp => tmp.instrumentName !== data.instrumentName,
      );

      return true;
    }
  });

  let periodsStr = '';
  const lMainPeriods = mainPeriods.length;

  mainPeriods = mainPeriods.sort((a, b) => a > b ? -1 : 1);

  mainPeriods.forEach(period => {
    const validDate = moment(period * 1000).format('DD.MM');
    periodsStr += `<th class="date">${validDate}</th>`;
  });

  let instrumentsStr = '';

  statisticsData
    .sort((a, b) => a.greenPercent > b.greenPercent ? -1 : 1)
    .forEach(data => {
      let tdStr = '';

      for (let i = 0; i < lMainPeriods; i += 1) {
        tdStr += `<td class="period p-${mainPeriods[i]}"></td>`;
      }

      instrumentsStr += `<tr
        class="instrument"
        id="instrument-${data.instrumentName}"
      >
        <td class="instrument-name">
          ${data.instrumentName}<br>
          (${data.statistics.length}, ${data.greenPercent}%)
        </td>
        ${tdStr}
      </tr>`;
    });

  const appendStr = `<table class="main-table">
    <tr>
      <th class="instrument-name">#</th>
      ${periodsStr}
    </tr>

    ${instrumentsStr}
  </table>`;

  $container.empty().append(appendStr);

  statisticsData
    // .filter(data => data.instrumentName === 'BNBUSDT')
    .forEach(data => {
      const periods = new Map();
      const $instrument = $(`#instrument-${data.instrumentName}`);

      data.statistics.forEach(statistics => {
        const divider = statistics.time % 86400;
        const period = statistics.time - divider;

        let periodData = periods.get(period);

        if (!periodData) {
          periodData = [];
          periods.set(period, periodData);
        }

        periodData.push(statistics);
        periods.set(period, periodData);
      });

      const periodsKeys = [...periods.keys()];

      for (let i = 0; i < periodsKeys.length; i += 1) {
        const periodKey = periodsKeys[i];
        const $td = $instrument.find(`td.period.p-${periodKey}`);

        let tableStr = `<table>
          <tr>
            <th>#</th>
            <th>Timelife</th>
            <th>Touches</th>
            <th>MaxProfit</th>
            <th>Time</th>
          </tr>
        `;

        let numberGreen = 0;
        const periodStatistics = periods.get(periodKey);
        const lStatistics = periodStatistics.length;

        periodStatistics
          .sort((a, b) => a.profit > b.profit ? -1 : 1)
          .forEach(statistics => {
            const isGreen = statistics.profit >= MIN_PROFIT;
            const validTime = moment(statistics.time * 1000).format('HH:mm');

            tableStr += `<tr>
              <td>
                <a href="/statistics/volume-spot?symbol=${data.instrumentName}&slide=${statistics.index}" target="_blank">${statistics.index}</a>
              </td>
              <td>${statistics.timelife}</td>
              <td>${statistics.touches}</td>
              <td class="${isGreen ? 'green' : 'red'}">${statistics.profit}%</td>
              <td>${validTime}</td>
            </tr>`;

            if (isGreen) {
              numberGreen += 1;
            }
          });

        let greenPercent;

        if (numberGreen === 0) {
          greenPercent = 0;
        } else {
          const coefficient = lStatistics / numberGreen;
          greenPercent = parseFloat((100 / coefficient).toFixed(2));
        }

        tableStr += `
          <tr>
            <td>${periodStatistics.length}</td>
            <td></td>
            <td></td>
            <td>${greenPercent}%</td>
            <td></td>
          </tr>
        </table>`;

        $td.empty().append(tableStr);
      }
    });

  console.log(
    JSON.stringify(statisticsData.map(data => data.instrumentId)),
  );
});

const getFile = async name => {
  const response = await fetch(`/files/${name}.json`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const result = await response.json();
  return result;
};
