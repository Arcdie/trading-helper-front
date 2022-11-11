/* global user */

const wsConnectionPort = 3100;
const wsConnectionLink = location.host === 'localhost:3000' ?
  'ws://localhost' : 'wss://trading-helper.fun';

const wsClient = new WebSocket(`${wsConnectionLink}:${wsConnectionPort}?userId=${user._id}`);

// wsClient.on('ping', () => {
//   wsClient.send('pong');
// });

wsClient.onclose = event => {
  alert('Соединение было разорвано, перезагрузите страницу');
};

setInterval(() => {
  wsClient.send(JSON.stringify({
    actionName: 'pong',
  }));
}, 1 * 60 * 1000); // 1 minute
