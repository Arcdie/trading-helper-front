/* global
functions,
objects */

class WebsocketBinance {
  constructor(isFutures) {
    this.isActive = false;
    this.connection = false;
    this.isFutures = isFutures;

    this.setConnection();
  }

  setConnection() {
    const connectionLink = this.isFutures ?
      'wss://fstream.binance.com/ws' :
      'wss://stream.binance.com:9443/ws';

    this.connection = new WebSocket(connectionLink);

    this.connection.onopen = () => {
      this.isActive = true;

      wsBinanceFuturesClient.onmessage = data => {
        console.log('data', data);
      };
    };

    wsBinanceFuturesClient.onclose = event => {
      console.log('Соединение c binance было разорвано', event);
    };
  }
}

const wsConnectionPort = 3001;
const wsConnectionLink = location.host === 'localhost:3000' ?
  'localhost' : '91.240.242.90';

const wsClient = new WebSocket(`ws://${wsConnectionLink}:${wsConnectionPort}?userId=${user._id}`);

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
