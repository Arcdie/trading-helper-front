/* global */

/* Constants */
const classie = {
  has($elem) {
    return $elem.hasClass('md-show');
  },

  add($elem) { $elem.addClass('md-show'); },
  remove($elem) { $elem.removeClass('md-show'); },
};

/* JQuery */
const $mdcontent = $('div.md-content');
const $modalWindow = $('div.pop-up div.md-modal');

/* Variables */
const constants = {
  RED_COLOR: '#FF5252',
  GREEN_COLOR: '#4CAF50',
  YELLOW_COLOR: '#FFE002',
  BLUE_COLOR: '#2196F3',
  DARK_BLUE_COLOR: '#0800FF',
  GRAY_COLOR: '#A7A7A7',
  PURPLE_COLOR: '#F715FF',
  ORANGE_COLOR: '#FFAE00',
};

/* Functions */
const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min)) + min;
};

const getUnix = targetDate =>
  parseInt((targetDate ? new Date(targetDate) : new Date()).getTime() / 1000, 10);

const getQueue = (arr, limiter) => {
  const queues = [];
  const lArr = arr.length;

  let targetIndex = 0;
  const numberIterations = Math.ceil(lArr / limiter);

  for (let i = 0; i < numberIterations; i += 1) {
    const newQueue = [];

    let conditionValue = limiter;

    if (i === (numberIterations - 1)) {
      conditionValue = lArr - targetIndex;
    }

    for (let j = 0; j < conditionValue; j += 1) {
      newQueue.push(arr[targetIndex]);
      targetIndex += 1;
    }

    queues.push(newQueue);
  }

  return queues;
};

const getPrecision = (price) => {
  const dividedPrice = price.toString().split('.');

  if (!dividedPrice[1]) {
    return 0;
  }

  return dividedPrice[1].length;
};

const formatNumberToPretty = n => {
  const isLessThan0 = n < 0;

  if (isLessThan0) {
    n = -n;
  }

  if (n >= 1e3 && n < 1e6) n = +(n / 1e3).toFixed(1) + 'K';
  else if (n >= 1e6 && n < 1e9) n = +(n / 1e6).toFixed(1) + 'M';
  else if (n >= 1e9 && n < 1e12) n = +(n / 1e9).toFixed(1) + 'B';
  else if (n >= 1e12) n = +(n / 1e12).toFixed(1) + 'T';

  if (isLessThan0) {
    n = `-${n}`;
  }

  return n;
};

const toHex = (c) => {
  const hex = c.toString(16);
  return hex.length === 1 ? `0${hex}` : hex;
};

const toRGB = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
};

const initPopWindow = (str) => {
  $modalWindow
    .find('div.md-content')
    .empty()
    .append(str);

  classie.add($modalWindow);
};

const makeRequest = async ({
  url, method, query, body, settings,
}) => {
  if (!url) {
    alert('No url');
    return false;
  }

  if (!method) {
    alert('No method');
    return false;
  }

  const objRequest = {
    method,
  };

  if (method !== 'GET') {
    objRequest.headers = {
      'Content-Type': 'application/json',
    };
  }

  if (body && Object.keys(body).length > 0) {
    objRequest.body = JSON.stringify(body);
  }

  if (query && Object.keys(query).length > 0) {
    url += '?';

    Object.keys(query).forEach(key => {
      url += `${key}=${query[key]}&`;
    });

    url = url.substring(0, url.length - 1);
  }

  if (settings && Object.keys(settings).length > 0) {
    Object.keys(settings).forEach(key => {
      objRequest[key] = settings[key];
    });
  }

  const response = await fetch(url, objRequest);
  const result = await response.json();
  return result;
};

$(document).ready(() => {
  $('div.pop-up div.shadow').click(() => {
    classie.remove($modalWindow);
  });

  $mdcontent
    .on('click', 'button.close', () => {
      classie.remove($modalWindow);
    });
});
