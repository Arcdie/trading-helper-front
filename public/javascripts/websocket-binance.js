/* global
functions,
objects */

class WebsocketBinance {
  constructor({
    isFutures,
  }) {
    this.streams = [];

    this.isActive = false;
    this.connection = false;
    this.intervalPong = false;
    this.onmessage = () => {};

    this.isFutures = isFutures;

    if (this.isFutures) {
      this.connectionName = 'Futures';
    } else {
      this.connectionName = 'Spot';
    }

    this.setConnection();
  }

  setConnection() {
    const connectionLink = this.isFutures ?
      'wss://fstream.binance.com/ws' :
      'wss://stream.binance.com:9443/ws';

    this.connection = new WebSocket(connectionLink);

    this.connection.onopen = () => {
      this.isActive = true;

      /*
      this.intervalPong = setInterval(() => {
        if (this.connection) {
          // this.connection.send('pong');
        }
      }, 1000 * 60); // 1 minute;
      */

      this.streams.forEach(streamName => {
        this.sendSubscribeRequest(streamName);
      });

      this.connection.onmessage = data => {
        this.onmessage(data);
      };
    };

    this.connection.onclose = event => {
      // clearInterval(this.intervalPong);
      console.log('Соединение c binance было разорвано', event);
      this.isActive = false;
      this.setConnection();
    };
  }

  addStream(streamName) {
    this.streams.push(streamName);
    this.sendSubscribeRequest(streamName);
  }

  removeStream(streamName) {
    this.streams = this.streams
      .filter(stream => stream !== streamName);
    this.sendUnsubscribeRequest(streamName);
  }

  sendSubscribeRequest(streamName) {
    this.connection.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: [streamName],
      id: 1,
    }));
  }

  sendUnsubscribeRequest(streamName) {
    this.connection.send(JSON.stringify({
      method: 'UNSUBSCRIBE',
      params: [streamName],
      id: 1,
    }));
  }
}
