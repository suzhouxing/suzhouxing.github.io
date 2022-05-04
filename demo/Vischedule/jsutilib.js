// http://api.jquery.com/category/events/event-object/
// http://api.jquery.com/event.which/
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent

// log wrapper.
function szxlog(e) { window.console.log(e); }
// function szxlog(e) { }

// dynamic script loading.
function loadScript(url, callback) {
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = url;
  script.onload = callback;
  script.onreadystatechange = callback;
  document.head.appendChild(script);
}

// event handler.
const MouseEventCode = {
  LeftButton: 0,
  MiddleButton: 1,
  RightButton: 2,
  BrowserBackButton: 3,
  BrowserForwardButton: 4
};

function preventDefault(event) {
  event.preventDefault ? event.preventDefault() : (event.returnValue = false);
  return false;
}

// object.
function merge(thisObj, otherObj) { // shallow in-situ merge that thisObj += otherObj.
  for (var key in otherObj) { thisObj[key] = otherObj[key]; }
  return thisObj;
}

function isEmptyObject(obj) { return Object.keys(obj).length <= 0; }

// array.
function disorderingRemoveByIndex(list, index) { // remove quickly by changing the order of items.
  list[index] = list[list.length - 1];
  list.pop();
}
function disorderingRemoveByValue(list, value) { // remove quickly by changing the order of items.
  disorderingRemoveByIndex(list, list.indexOf(value));
}

// math.
function clamp(num, min, max) { return (num <= min) ? min : ((num >= max) ? max : num); }

function randReal(min, max) { return min + ((max - min) * Math.random()); }
function randInt(min, max) { return Math.floor(randReal(min, max)); }

// concurrency.
function newWorker(task) {
  // https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#Passing_data_by_transferring_ownership_(transferable_objects)
  // function taskSample() { // echo received message and exit.
  //   szxlog("initializing worker.");
  //   self.onmessage = function(event) {
  //     szxlog("doing the job.");
  //     self.postMessage("[receive]" + event.data);
  //     self.close();
  //   }
  //   szxlog("worker initialized.");
  // }
  var blob = new Blob(["(", task.toString(), ")();"], { type: "application/javascript" });
  var blobUrl = window.URL.createObjectURL(blob);
  var worker = new Worker(blobUrl);
  window.URL.revokeObjectURL(blobUrl);
  return worker;
}

// date/time related.
const DefaultTicksPerColumn = 1;
const MinTicksPerColumn = 1;
const MaxTicksPerColumn = 600;

class TimeScaler {
  get cur() { return this.scale; }
  prev() {
     if (this.scale > MinTicksPerColumn) { --this.scale; }
     return this.scale;
  }
  next() {
    if (this.scale < MaxTicksPerColumn) { ++this.scale; }
     return this.scale;
  }

  constructor(initScale = DefaultTicksPerColumn) {
    this.scale = initScale;
  }
}

function padStart(num, size, fill = "0") {
  var s = String(num);
  size -= s.length;
  var pad = "";
  while (pad.length < size) { pad += fill; }
  return pad + s;
}

function formatTime24(date) { // 24-hour format "mm:ss".
  return padStart(date.getHours(), 2) + ":" + padStart(date.getMinutes(), 2);
}

function formatTime12(date) { // 12-hour format "mm:ss". show a.m. or p.m. on the hour.
  if (date.getMinutes() != 0) {
    var hour = date.getHours();
    var suffix = (hour > 12) ? "pm" : "am";
    if (hour > 12) { hour -= 12; }
    return padStart(hour, 2) + suffix;
  } else {
    return formatTime24(date);
  }
}

function formatDate(date) {
  const WeekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return WeekDays[date.getDay()] + " " + date.getDate();
}

function formatDateTime(date) {
  const WeekDays = ["日", "一", "二", "三", "四", "五", "六"];
  return date.getFullYear() + "-" + padStart(date.getMonth() + 1, 2) + "-" + padStart(date.getDate(), 2)
    + " (" + WeekDays[date.getDay()] + ") " + formatTime24(date);
}

function toDate(algDate) {
  return algDate ? new Date(algDate.year, algDate.month - 1, algDate.day, algDate.hour || 0, algDate.minute || 0) : null;
}
function toAlgDate(date) {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() };
}
function toAlgDateFromStr(dateStr) {
  var d = dateStr.split(/\D+/);
  return { year: parseInt(d[0], 10), month: parseInt(d[1], 10), day: parseInt(d[2], 10), hour: parseInt(d[3], 10), minute: parseInt(d[4], 10) };
}

function cloneDate(date) { return new Date(date.valueOf()); }

const SecondPerMinute = 60;
const MillisecondPerSecond = 1000;
const MillisecondPerMinute = MillisecondPerSecond * SecondPerMinute;

function toMillisecond(minute) { return minute * MillisecondPerMinute; }
function toMinute(millisecond) { return millisecond / MillisecondPerMinute; }

// left-closed right-open interval operation.
// begin before end.
function isValid(interval) { return interval.begin < interval.end; }
// vector measurement of the interval span.
function displacement(interval) { return interval.end - interval.begin; }
// scalar measurement of the interval span.
function length(interval) { return Math.abs(interval.end - interval.begin); }

function beginBefore(interval0, interval1) { return interval0.begin < interval1.begin; }
function beginBeforeDate(interval, date) { return interval.begin < date; }
function endBefore(interval0, interval1) { return interval0.end < interval1.end; }
function endBeforeDate(interval, date) { return interval.end <= date; }
function before(interval0, interval1) { return (interval0.end < interval1.begin); }

function cover(interval, date) { return (interval.begin <= date) && (date < interval.end); }

function isOverlapped(interval0, interval1) {
  return (interval0.begin < interval1.end) && (interval1.begin < interval0.end);
}
// return the intersection of interval0 and interval1 if they are overlapped,
// or the reversed gap between them if there is no intersection.
function overlap(interval0, interval1) {
  return {
    begin: Math.max(interval0.begin, interval1.begin),
    end: Math.min(interval0.end, interval1.end)
  };
}

// return the length of the blank space between interval0 and interval1 if they are not interseted,
// or the opposite number of the minimal distance to make them mutually exclusive.
function gap(interval0, interval1) {
  if (interval0.begin < interval1.begin) {
    if (interval0.end < interval1.end) {
      return interval1.begin - interval0.end;
    } else { // if (interval0.end >= interval1.end)
      return Math.max(interval1.begin - interval0.end, interval0.begin - interval1.end);
    }
  } else { // if (interval0.begin >= interval1.end)
    if (interval0.end < interval1.end) {
      return Math.max(interval1.begin - interval0.end, interval0.begin - interval1.end);
    } else { // if (interval0.end >= interval1.end)
      return interval0.begin - interval1.end;
    }
  }
}
